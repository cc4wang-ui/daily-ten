/* Daily Ten — V2a 遊戲進度標記的寫入 API（擁有者：data-guardian）
   UI 呼叫：升級卡看過、Perfect Day 慶祝播過、D6 降量「恢復 L{n}」與它的復原。
   先驗證，再改 getState().game，需要時呼叫 saveState()。import 時不碰 window / localStorage。
   任何函式都不丟例外到 UI：錯誤一律回 {ok:false, code, field?, message}（message 為台灣繁中，可直接顯示）。
     code：invalid（參數不對；field = 'level'|'date'|'today'|'options'|'perfectDayDone'）| not_loaded（還沒 loadState）
           | corrupt（記憶體中的 game 不是物件；不建立、不改動）| error

   欄位（state 仍是 v3，兩個都是選填；形狀、載入修補、匯入驗證見 schema.js 的 V2a 段）：
     game.seen   = {level, perfectDay}
       level       null | 1–100,000 的整數：已看過升級卡的最高等級（中央 Lv＝總 XP 等級，含 bonus）。只增不減。
       perfectDay  null | 'YYYY-MM-DD'：Perfect Day 慶祝已處理（播過，或第一次開啟時略過）到哪一個遊戲日（含）。只增不減。
     game.deload = {restoredOn}
       restoredOn  null | 'YYYY-MM-DD'：哪一個遊戲日按了「恢復」；只對那一天有效。
     舊資料沒有這兩個欄位：載入不新增（開 App 不寫入），由下面的 API 第一次寫入時建立。

   UI 怎麼用（engine 不判斷「看過沒」；比較前先確定 seen 已初始化，也就是 level／perfectDay 不是 null）：
     升級卡：summary.level.lv > readSeen(getState()).level → 顯示；關掉時 markLevelSeen(summary.level.lv)
     慶祝：  summary.perfectDay.done && summary.perfectDay.date > readSeen(getState()).perfectDay → 播放；播完 markPerfectDaySeen(date)
             （'YYYY-MM-DD' 可直接比字串）
     降量：  engine 用 schema.js 的 isDeloadRestored(state, 今天) 算 summary.deload.restored；
             按「恢復」→ setDeloadRestored(今天)；10 秒內復原 → clearDeloadRestored(今天)
     初始化：loadState 之後、applyImport 成功之後各呼叫一次
             ensureSeenInitialized(summary.level.lv, summary.date, {perfectDayDone: summary.perfectDay.done})
             （每次 render 都呼叫也可以：已有值不覆寫，只有第一次有作用）。

   對外：
     markLevelSeen(lv)         → {ok:true, changed, seen:{level, perfectDay}, saved}
                                 lv：1–100,000 的整數。比已看等級高（或還沒有已看等級）才寫入；不高 → changed:false、不寫入。
     markPerfectDaySeen(date)  → {ok:true, changed, seen, saved}
                                 date：'YYYY-MM-DD'（遊戲日）。比已處理的日期晚（或還沒有）才寫入；同一天或更早 → changed:false、不寫入。
     setDeloadRestored(date)   → {ok:true, changed, deload:{restoredOn}, saved}
                                 restoredOn = date（之前的日期直接被取代：恢復只對當天有效）；已經是 date → changed:false、不寫入。
     clearDeloadRestored(date) → {ok:true, changed, deload, saved}
                                 restoredOn 是 date 才改回 null；不是（沒有恢復，或是別天的）→ changed:false、不寫入（連按兩次復原不會出錯）。
     ensureSeenInitialized(level, today, {perfectDayDone}?) → {ok:true, changed, seen}
                                 V2a 第一次開啟：seen.level 是 null → level（目前等級：不補發舊等級的升級卡）；
                                 seen.perfectDay 是 null → today 的前一天（契約：今天之前的 Perfect Day 不補播，今天之後完成的照常慶祝）；
                                 第三個參數（選填，契約之外加的）perfectDayDone: true（開啟當下今天的 Perfect Day 已經完成，
                                 例如 V1 或舊版 App 先記好了）→ 改成 today：開啟之前完成的一律不補播，也就不會在第一次開 App
                                 時播慶祝、呼叫 markPerfectDaySeen 而寫入 storage。建議 UI 一律傳 summary.perfectDay.done。
                                 perfectDayDone 省略、null、false → 前一天；不是 boolean → invalid。
                                 已有值一律不覆寫；冪等。只改記憶體、不呼叫 saveState（與 habits.ensurePhaseStarted 相同）：
                                 開 App 不寫入 storage（e2e 保證；recovered 且另存失敗時，主 key 是原始資料唯一的副本），
                                 下一次任何 saveState（打卡、記訓練、markLevelSeen…）一併寫入。
     saved = saveState() 的 Promise<boolean>；changed:false 時不寫入，saved 直接是 Promise<true>。
     寫入失敗（容量不足）時 ok 仍為 true、資料留在記憶體（與其他紀錄相同）；要提示可 await saved。
     readSeen(state)、readDeload(state)、isDeloadRestored(state, date)：re-export 自 schema.js（純函式；engine 請直接從 schema.js 取，
     不必載入這個檔案與 store.js）。
   寫入時保留 seen／deload 內不認得的欄位；level、perfectDay、restoredOn 一律寫成正規化後的值（記憶體中的怪值不會被存下來）。 */
import { getState, saveState } from './store.js';
import { LIMITS, isPlainObject, isSeenLevel, readSeen, readDeload, isDeloadRestored } from './schema.js';
import { isValidDateStr, dayNumber, dayNumberToStr } from './time.js';

export { readSeen, readDeload, isDeloadRestored };

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const MSG = {
  level: `等級應為 1–${fmt(LIMITS.gameLevel)} 的整數`,
  date: '日期格式不正確（應為 YYYY-MM-DD）',
  options: '初始化選項格式不正確（應為物件，例如 {perfectDayDone: true}）',
  perfectDayDone: '今天是否已完成 Perfect Day（perfectDayDone）應為 true 或 false',
  notLoaded: '資料還沒載入完成，請重新開啟 App 再試一次',
  corrupt: '遊戲進度的資料格式異常，請重新開啟 App 再試一次',
  error: '寫入失敗，請再試一次'
};

const fail = (code, message, extra = {}) => ({ ok: false, code, ...extra, message });
const invalid = (field, message) => fail('invalid', message, { field });

function persist() {
  try {
    return Promise.resolve(saveState()).catch(() => false);
  } catch (e) {
    return Promise.resolve(false);
  }
}

/* 記憶體中的 game；還沒載入 → {error: not_loaded}；game 不是物件 → {error: corrupt}（loadState 之後一定是物件） */
function loadedGame() {
  const state = getState();
  if (!isPlainObject(state)) return { error: fail('not_loaded', MSG.notLoaded) };
  if (!isPlainObject(state.game)) return { error: fail('corrupt', MSG.corrupt) };
  return { state, game: state.game };
}

/* 保留不認得的欄位；已知欄位寫入正規化後的值 */
function writeSeen(game, seen) {
  if (isPlainObject(game.seen)) {
    game.seen.level = seen.level;
    game.seen.perfectDay = seen.perfectDay;
  } else {
    game.seen = { level: seen.level, perfectDay: seen.perfectDay };
  }
}
function writeDeload(game, deload) {
  if (isPlainObject(game.deload)) game.deload.restoredOn = deload.restoredOn;
  else game.deload = { restoredOn: deload.restoredOn };
}

/* 'YYYY-MM-DD' 的前一天；算不出合法日期（例如 0000-01-01）→ null */
function dayBefore(date) {
  const prev = dayNumberToStr(dayNumber(date) - 1);
  return isValidDateStr(prev) ? prev : null;
}

const unchanged = (extra) => ({ ok: true, changed: false, ...extra, saved: Promise.resolve(true) });

export function markLevelSeen(lv) {
  try {
    if (!isSeenLevel(lv)) return invalid('level', MSG.level);
    const { error, state, game } = loadedGame();
    if (error) return error;
    const cur = readSeen(state);
    if (cur.level !== null && lv <= cur.level) return unchanged({ seen: cur });
    const seen = { level: lv, perfectDay: cur.perfectDay };
    writeSeen(game, seen);
    return { ok: true, changed: true, seen: { ...seen }, saved: persist() };
  } catch (e) {
    return fail('error', MSG.error);
  }
}

export function markPerfectDaySeen(date) {
  try {
    if (!isValidDateStr(date)) return invalid('date', MSG.date);
    const { error, state, game } = loadedGame();
    if (error) return error;
    const cur = readSeen(state);
    if (cur.perfectDay !== null && date <= cur.perfectDay) return unchanged({ seen: cur });
    const seen = { level: cur.level, perfectDay: date };
    writeSeen(game, seen);
    return { ok: true, changed: true, seen: { ...seen }, saved: persist() };
  } catch (e) {
    return fail('error', MSG.error);
  }
}

export function setDeloadRestored(date) {
  try {
    if (!isValidDateStr(date)) return invalid('date', MSG.date);
    const { error, state, game } = loadedGame();
    if (error) return error;
    const cur = readDeload(state);
    if (cur.restoredOn === date) return unchanged({ deload: cur });
    writeDeload(game, { restoredOn: date });
    return { ok: true, changed: true, deload: { restoredOn: date }, saved: persist() };
  } catch (e) {
    return fail('error', MSG.error);
  }
}

export function clearDeloadRestored(date) {
  try {
    if (!isValidDateStr(date)) return invalid('date', MSG.date);
    const { error, state, game } = loadedGame();
    if (error) return error;
    const cur = readDeload(state);
    if (cur.restoredOn !== date) return unchanged({ deload: cur });
    writeDeload(game, { restoredOn: null });
    return { ok: true, changed: true, deload: { restoredOn: null }, saved: persist() };
  } catch (e) {
    return fail('error', MSG.error);
  }
}

export function ensureSeenInitialized(level, today, options) {
  try {
    if (!isSeenLevel(level)) return invalid('level', MSG.level);
    const before = isValidDateStr(today) ? dayBefore(today) : null;
    if (before === null) return invalid('today', MSG.date);
    if (options !== undefined && options !== null && !isPlainObject(options)) return invalid('options', MSG.options);
    const done = options ? options.perfectDayDone : undefined;
    if (done !== undefined && done !== null && typeof done !== 'boolean') return invalid('perfectDayDone', MSG.perfectDayDone);
    const { error, state, game } = loadedGame();
    if (error) return error;
    const cur = readSeen(state);
    const seen = {
      level: cur.level === null ? level : cur.level,
      perfectDay: cur.perfectDay === null ? (done === true ? today : before) : cur.perfectDay
    };
    const changed = seen.level !== cur.level || seen.perfectDay !== cur.perfectDay;
    if (changed) writeSeen(game, seen);
    return { ok: true, changed, seen: { ...seen } };
  } catch (e) {
    return fail('error', MSG.error);
  }
}
