/* Daily Ten — 習慣紀錄的寫入 API（擁有者：data-guardian；B1 早安打卡）
   UI 呼叫；先驗證，再改 getState() 的內容並呼叫 saveState()。import 時不碰 window / localStorage。
   任何函式都不丟例外到 UI：錯誤一律回 {ok:false, code, message}（message 為台灣繁中，可直接顯示）。
   對外：
     validateSleepEntry(entry) → {ok:true, entry} | {ok:false, field, message}
                                 純函式、不碰 state（game-designer 的 buildCheckIn 產物可先用它自我檢查）。
                                 entry = {date, lightsOut, wake, lightsOutEdited}，四個欄位都必填：
                                   date             'YYYY-MM-DD'（遊戲日；必須是真實存在的日期）
                                   lightsOut、wake  含時區的 ISO 時間（建議用 time.js 的 isoLocal；也接受 Z 結尾）
                                   lightsOutEdited  true／false
                                   熄燈必須早於起床，且相隔不超過 24 小時
                                 回傳的 entry 只有這四個欄位、依此順序（其他欄位不寫入；要加欄位請經 data-guardian）。
     addSleepEntry(entry)      → {ok:true, entry, saved} | {ok:false, code, field?, message}
                                 code：invalid（形狀不對，field = 'entry'|'date'|'lightsOut'|'wake'|'lightsOutEdited'）
                                       duplicate（同一個 date 已有紀錄）| full（筆數達上限）
                                       not_loaded（還沒 loadState）| corrupt（記憶體中的 habits.sleep.log 不是陣列）| error
                                 依 date 排序插入（打卡一定是最新的一天 → 加在最後）。
                                 entry = 寫入內容的複本（改它不影響 state）；saved = saveState() 的 Promise<boolean>。
                                 寫入失敗時（容量不足）資料仍在記憶體中，與其他紀錄的行為相同；要提示可 await saved。
     removeSleepEntry(date)    → {ok:true, removed, saved} | {ok:false, code, message}
                                 復原用：刪掉 date 相同的紀錄（只刪該日，其他日不動）；
                                 找不到 → {ok:true, removed:0}，不寫入（連按兩次復原不會出錯）。
     ensurePhaseStarted(now)   → {ok:true, changed, startedAt} | {ok:false, code, message}
                                 phase.startedAt 是 null（或不是含時區的時間）才寫入 isoLocal(now)；已有值不覆寫（冪等）。
                                 只改記憶體、不呼叫 saveState：維持「loadState 不覆寫主 key」的規則
                                 （recovered 且另存失敗時，主 key 是原始資料唯一的副本），下一次任何 saveState 會一併寫入。
                                 UI 在 loadState() 之後、applyImport() 成功之後各呼叫一次。
     SLEEP_MAX_GAP_HOURS = 24 */
import { getState, saveState } from './store.js';
import { LIMITS, isPlainObject } from './schema.js';
import { isoLocal, isValidDateStr, isIsoWithOffset } from './time.js';

export const SLEEP_MAX_GAP_HOURS = 24;
const HOUR_MS = 3600000;
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const MSG = {
  entry: '睡眠紀錄格式不正確',
  date: '睡眠紀錄的日期（date）應為 YYYY-MM-DD 格式的日期',
  lightsOut: '熄燈時間（lightsOut）應為含時區的時間，例如 2026-10-03T23:00:00+09:00',
  wake: '起床時間（wake）應為含時區的時間，例如 2026-10-04T06:58:00+09:00',
  edited: '熄燈時間是否修改過（lightsOutEdited）應為 true 或 false',
  order: '熄燈時間要早於起床時間',
  gap: `熄燈到起床超過 ${SLEEP_MAX_GAP_HOURS} 小時，請確認熄燈時間`,
  full: `睡眠紀錄已達上限（${fmt(LIMITS.arrayLength)} 筆）`,
  removeDate: '要刪除的日期格式不正確（應為 YYYY-MM-DD）',
  notLoaded: '資料還沒載入完成，請重新開啟 App 再試一次',
  corruptSleep: '睡眠紀錄的資料格式異常，請重新開啟 App 再試一次',
  corruptPhase: '階段資料格式異常，請重新開啟 App 再試一次',
  addError: '記錄失敗，請再試一次',
  removeError: '刪除失敗，請再試一次',
  phaseError: '階段開始時間寫入失敗，請重新開啟 App 再試一次'
};
const duplicateMsg = (date) => `${date} 已經有睡眠紀錄，同一天只能記錄一次`;

const fail = (code, message, extra = {}) => ({ ok: false, code, ...extra, message });
const invalid = (field, message) => ({ ok: false, field, message });

/* 記憶體中的 habits.sleep.log；形狀不對回 null（loadState 之後一定是陣列，不對代表 state 不是經由載入產生的） */
function sleepLogOf(state) {
  const habits = state.habits;
  const sleep = isPlainObject(habits) ? habits.sleep : null;
  return isPlainObject(sleep) && Array.isArray(sleep.log) ? sleep.log : null;
}

/* 排在最後一筆 date ≤ 新日期的紀錄之後（'YYYY-MM-DD' 可直接比字串） */
function insertIndex(log, date) {
  let i = log.length;
  while (i > 0) {
    const prev = log[i - 1];
    if (!(isPlainObject(prev) && typeof prev.date === 'string' && prev.date > date)) break;
    i--;
  }
  return i;
}

function persist() {
  try {
    return Promise.resolve(saveState()).catch(() => false);
  } catch (e) {
    return Promise.resolve(false);
  }
}

export function validateSleepEntry(entry) {
  try {
    if (!isPlainObject(entry)) return invalid('entry', MSG.entry);
    const { date, lightsOut, wake, lightsOutEdited } = entry;
    if (!isValidDateStr(date)) return invalid('date', MSG.date);
    if (!isIsoWithOffset(lightsOut)) return invalid('lightsOut', MSG.lightsOut);
    if (!isIsoWithOffset(wake)) return invalid('wake', MSG.wake);
    if (typeof lightsOutEdited !== 'boolean') return invalid('lightsOutEdited', MSG.edited);
    const gap = Date.parse(wake) - Date.parse(lightsOut);
    if (!(gap > 0)) return invalid('lightsOut', MSG.order);
    if (gap > SLEEP_MAX_GAP_HOURS * HOUR_MS) return invalid('lightsOut', MSG.gap);
    return { ok: true, entry: { date, lightsOut, wake, lightsOutEdited } };
  } catch (e) {
    return invalid('entry', MSG.entry); // 例如讀取欄位時丟例外的物件
  }
}

export function addSleepEntry(entry) {
  try {
    const checked = validateSleepEntry(entry);
    if (!checked.ok) return fail('invalid', checked.message, { field: checked.field });
    const state = getState();
    if (!isPlainObject(state)) return fail('not_loaded', MSG.notLoaded);
    const log = sleepLogOf(state);
    if (!log) return fail('corrupt', MSG.corruptSleep);
    const e = checked.entry;
    if (log.some((x) => isPlainObject(x) && x.date === e.date)) return fail('duplicate', duplicateMsg(e.date));
    if (log.length >= LIMITS.arrayLength) return fail('full', MSG.full);
    log.splice(insertIndex(log, e.date), 0, e);
    return { ok: true, entry: { ...e }, saved: persist() };
  } catch (err) {
    return fail('error', MSG.addError);
  }
}

export function removeSleepEntry(date) {
  try {
    if (!isValidDateStr(date)) return fail('invalid', MSG.removeDate);
    const state = getState();
    if (!isPlainObject(state)) return fail('not_loaded', MSG.notLoaded);
    const log = sleepLogOf(state);
    if (!log) return fail('corrupt', MSG.corruptSleep);
    let removed = 0;
    for (let i = log.length - 1; i >= 0; i--) {
      if (isPlainObject(log[i]) && log[i].date === date) {
        log.splice(i, 1);
        removed++;
      }
    }
    return { ok: true, removed, saved: removed ? persist() : Promise.resolve(true) };
  } catch (err) {
    return fail('error', MSG.removeError);
  }
}

export function ensurePhaseStarted(now = new Date()) {
  try {
    const state = getState();
    if (!isPlainObject(state)) return fail('not_loaded', MSG.notLoaded);
    const phase = state.phase;
    if (!isPlainObject(phase)) return fail('corrupt', MSG.corruptPhase);
    if (isIsoWithOffset(phase.startedAt)) return { ok: true, changed: false, startedAt: phase.startedAt };
    phase.startedAt = isoLocal(now);
    return { ok: true, changed: true, startedAt: phase.startedAt };
  } catch (err) {
    return fail('error', MSG.phaseError);
  }
}
