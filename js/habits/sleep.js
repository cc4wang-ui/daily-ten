/* Daily Ten — 眠：早安打卡與 D18 漸進計分（擁有者：game-designer）
   純函式：不讀時鐘（「現在」由呼叫端傳入）、不碰 DOM／localStorage／網路；state 欄位缺漏或型別錯都不丟例外。
   寫入不在這裡：UI 拿 buildCheckIn() 的 entry 呼叫 data-guardian 的 addSleepEntry(entry)；復原用 removeSleepEntry(date)。

   D17：早上 1 次點擊同時記錄起床（＝點擊時間）與昨晚熄燈（預填 settings.bedtime，可改）。
   D18：時段＝目標 ±windowMin。時段內拿 full；超出時段 nearMin 分鐘內拿 near；再遠拿 base（不歸零）。
        睡眠時數比照：滿 targetMin 拿 full、差 nearMin 分鐘內拿 near、再少拿 base。
        時間以畫面顯示的分鐘計算（秒數不計）；跨午夜的時段（例如就寢 23:45 ±30）以環狀時間計算。
   分數一律用紀錄裡存的目標（entry.target），沒有才用目前的設定——改設定不會重算過去的分數。
   紀錄的時間用字串本身的當地時間（ISO 含 offset），換時區後重算結果不變；時數用絕對時間相減。

   對外：
     parseHM(v) → 分鐘數（'7:05'／'07:05' → 425）| null；fmtHM(min) → 'HH:MM'
     sleepTargets(state, rules)               → {bedtime, wakeTime, windowMin} | null（settings 有效就用，否則 rules 預設）
     scoreSleepEntry(entry, state, rules)     → score | null
     sleepDays(state, rules)                  → Map(date → {entry, score})；同一遊戲日多筆取分數最高的（同分取第一筆）
     checkInWindow(state, now, rules)         → {open, code, reason, date, from, until}
                                                code：open | done（今天已打卡）| early | late | badNow | noRules
     buildCheckIn(state, now, rules, opts={}) → {ok:true, entry, score} | {ok:false, code, reason, entry:null, score:null}
       opts.lightsOut 'HH:MM'：昨晚熄燈（省略＝就寢目標）；opts.wake 'HH:MM'：起床時間（省略＝現在；只能往前改）
       code：noRules | badNow | early | late | badTime | wakeLocked | wakeFuture | badDuration
       「今天已打卡」不在這裡擋（由 addSleepEntry 擋），所以也能拿來預覽分數。
       entry：{date, lightsOut, wake, lightsOutEdited, target:{bedtime, wakeTime, windowMin}}，改過起床時間時另有 wakeEdited:true
     score：{wake, lightsOut, duration, total, max, lines:[{key, label, value, xp}], target}
       wake／lightsOut：{time:'HH:MM', status:'full'|'near'|'base'|'none', inWindow, offMin, side:'early'|'late'|null, xp, max}
       duration：{minutes, text:'7h58m', status, offMin, xp, max}（缺時間或不合理時 status 'none'、xp 0） */
import { isoLocal } from '../state/time.js';
import { asRules, fill } from '../game/rules.js';
import { toDate, gameDate, parseIso, isValidDateStr } from '../game/day.js';

const NO_RULES = '遊戲規則還沒載入';
const DAY_MIN = 1440;
const HM_RE = /^(\d{1,2}):([0-5]\d)$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const pad2 = (n) => String(n).padStart(2, '0');
const hourText = (h) => `${pad2(h)}:00`;
const hoursText = (min) => String(Math.round(min / 6) / 10); // 420 → '7'、450 → '7.5'

export function parseHM(v) {
  if (typeof v !== 'string') return null;
  const m = HM_RE.exec(v.trim());
  if (!m || Number(m[1]) > 23) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fmtHM(min) {
  const m = ((Math.floor(min) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/* ---------- 目標 ---------- */
function targetsFrom(src, fallback, R) {
  const s = isObj(src) ? src : {};
  const bed = parseHM(s.bedtime);
  const wake = parseHM(s.wakeTime);
  const w = s.windowMin;
  return {
    bedtime: bed !== null ? fmtHM(bed) : fallback.bedtime,
    wakeTime: wake !== null ? fmtHM(wake) : fallback.wakeTime,
    windowMin: Number.isInteger(w) && w >= 0 ? Math.min(w, R.sleep.maxWindowMin) : fallback.windowMin
  };
}
const currentTargets = (state, R) => targetsFrom(isObj(state) ? state.settings : null, R.sleep.defaults, R);

export function sleepTargets(state, rules) {
  const R = asRules(rules);
  return R ? currentTargets(state, R) : null;
}

/* ---------- 計分 ---------- */
/* a − b 的環狀差（分鐘），落在 (−720, 720] */
function signedDiff(a, b) {
  const d = (((a - b) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return d > DAY_MIN / 2 ? d - DAY_MIN : d;
}

function windowPart(minutes, targetMin, windowMin, nearMin, pts) {
  const diff = signedDiff(minutes, targetMin);
  const offMin = Math.max(0, Math.abs(diff) - windowMin);
  const status = offMin === 0 ? 'full' : offMin <= nearMin ? 'near' : 'base';
  return {
    time: fmtHM(minutes), status, inWindow: offMin === 0, offMin,
    side: offMin === 0 ? null : diff > 0 ? 'late' : 'early', xp: pts[status], max: pts.full
  };
}
const noWindowPart = (pts) => ({ time: null, status: 'none', inWindow: false, offMin: null, side: null, xp: 0, max: pts.full });

function durationPart(minutes, R) {
  const D = R.sleep.duration;
  const offMin = Math.max(0, D.targetMin - minutes);
  const status = offMin === 0 ? 'full' : offMin <= R.sleep.nearMin ? 'near' : 'base';
  const text = fill(R.copy.lines.duration, { h: Math.floor(minutes / 60), mm: pad2(minutes % 60) });
  return { minutes, text, status, offMin, xp: D[status], max: D.full };
}
const noDurationPart = (R) => ({ minutes: null, text: null, status: 'none', offMin: null, xp: 0, max: R.sleep.duration.full });

function windowLabel(C, key, p) {
  if (p.status === 'full') return C[`${key}Full`];
  if (p.status === 'near') return fill(C[`${key}Near${p.side === 'late' ? 'Late' : 'Early'}`], { n: p.offMin });
  return C[`${key}Base`];
}
function durationLabel(C, p, targetMin) {
  const h = hoursText(targetMin);
  if (p.status === 'full') return fill(C.durationFull, { h });
  if (p.status === 'near') return fill(C.durationNear, { n: p.offMin, h });
  return C.durationBase;
}

function scoreWith(entry, base, R) {
  const S = R.sleep;
  const C = R.copy.lines;
  const T = targetsFrom(entry.target, base, R);
  const wake = parseIso(entry.wake);
  const lo = parseIso(entry.lightsOut);
  const wakeP = wake ? windowPart(wake.minutes, parseHM(T.wakeTime), T.windowMin, S.nearMin, S.wake) : noWindowPart(S.wake);
  const loP = lo ? windowPart(lo.minutes, parseHM(T.bedtime), T.windowMin, S.nearMin, S.lightsOut) : noWindowPart(S.lightsOut);
  let durP = noDurationPart(R);
  if (wake && lo) {
    const minutes = Math.floor(wake.ms / 60000) - Math.floor(lo.ms / 60000);
    if (minutes > 0 && minutes <= S.maxDurationMin) durP = durationPart(minutes, R);
  }
  const lines = [];
  if (wakeP.status !== 'none') lines.push({ key: 'wake', label: windowLabel(C, 'wake', wakeP), value: wakeP.time, xp: wakeP.xp });
  if (loP.status !== 'none') lines.push({ key: 'lightsOut', label: windowLabel(C, 'lightsOut', loP), value: loP.time, xp: loP.xp });
  if (durP.status !== 'none') lines.push({ key: 'duration', label: durationLabel(C, durP, S.duration.targetMin), value: durP.text, xp: durP.xp });
  const cap = R.pillars.sleep.max;
  return {
    wake: wakeP, lightsOut: loP, duration: durP,
    total: Math.min(cap, wakeP.xp + loP.xp + durP.xp),
    max: Math.min(cap, S.wake.full + S.lightsOut.full + S.duration.full),
    lines, target: T
  };
}

export function scoreSleepEntry(entry, state, rules) {
  const R = asRules(rules);
  if (!R || !isObj(entry)) return null;
  return scoreWith(entry, currentTargets(state, R), R);
}

function sleepLog(state) {
  const h = isObj(state) ? state.habits : null;
  const s = isObj(h) ? h.sleep : null;
  return isObj(s) && Array.isArray(s.log) ? s.log : [];
}

export function sleepDays(state, rules) {
  const out = new Map();
  const R = asRules(rules);
  if (!R) return out;
  const log = sleepLog(state);
  if (!log.length) return out;
  const base = currentTargets(state, R);
  for (const e of log) {
    if (!isObj(e) || !isValidDateStr(e.date)) continue;
    const score = scoreWith(e, base, R);
    const prev = out.get(e.date);
    if (!prev || score.total > prev.score.total) out.set(e.date, { entry: e, score });
  }
  return out;
}

/* ---------- 打卡時段 ---------- */
function clockState(d, R) {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < R.sleep.checkIn.fromHour * 60) return 'early';
  if (m >= R.sleep.checkIn.untilHour * 60) return 'late';
  return 'open';
}

export function checkInWindow(state, now, rules) {
  const R = asRules(rules);
  if (!R) return { open: false, code: 'noRules', reason: NO_RULES, date: null, from: null, until: null };
  const C = R.copy.checkIn;
  const from = hourText(R.sleep.checkIn.fromHour);
  const until = hourText(R.sleep.checkIn.untilHour);
  const d = toDate(now);
  if (!d) return { open: false, code: 'badNow', reason: C.badNow, date: null, from, until };
  const date = gameDate(d, R);
  const res = (open, code, reason) => ({ open, code, reason, date, from, until });
  if (sleepLog(state).some((e) => isObj(e) && e.date === date)) return res(false, 'done', C.done);
  const c = clockState(d, R);
  if (c === 'early') return res(false, 'early', fill(C.early, { from }));
  if (c === 'late') return res(false, 'late', fill(C.late, { until }));
  return res(true, 'open', fill(C.open, { until }));
}

/* ---------- 早安打卡 ---------- */
const fail = (code, reason) => ({ ok: false, code, reason, entry: null, score: null });
/* base 那一天（加 dayOffset 天）的本地 HH:MM（夏令時間由 Date 處理） */
const atLocal = (base, dayOffset, minutes) =>
  new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, Math.floor(minutes / 60), minutes % 60, 0, 0);
const minuteOf = (d) => Math.floor(d.getTime() / 60000);

export function buildCheckIn(state, now, rules, opts = {}) {
  const R = asRules(rules);
  if (!R) return fail('noRules', NO_RULES);
  const C = R.copy;
  const tap = toDate(now);
  if (!tap) return fail('badNow', C.checkIn.badNow);
  const c = clockState(tap, R);
  if (c === 'early') return fail('early', fill(C.checkIn.early, { from: hourText(R.sleep.checkIn.fromHour) }));
  if (c === 'late') return fail('late', fill(C.checkIn.late, { until: hourText(R.sleep.checkIn.untilHour) }));
  const o = isObj(opts) ? opts : {};
  const targets = currentTargets(state, R);

  /* 起床：預設＝按下的時間；改的話只能往前（同一個日曆日、不晚於按下的時間） */
  let wake = tap;
  let wakeEdited = false;
  if (o.wake !== undefined && o.wake !== null) {
    if (!R.sleep.checkIn.wakeEditable) return fail('wakeLocked', C.checkInError.wakeLocked);
    const hm = parseHM(o.wake);
    if (hm === null) return fail('badTime', C.checkInError.badTime);
    const tapMin = tap.getHours() * 60 + tap.getMinutes();
    if (hm > tapMin) return fail('wakeFuture', C.checkInError.wakeFuture);
    if (hm < tapMin) {
      wake = atLocal(tap, 0, hm);
      wakeEdited = true;
    }
  }

  /* 熄燈：起床前最近一次的 HH:MM（23:00 → 前一天晚上；00:40 → 當天凌晨） */
  let loMin = parseHM(targets.bedtime);
  let loEdited = false;
  if (o.lightsOut !== undefined && o.lightsOut !== null) {
    const hm = parseHM(o.lightsOut);
    if (hm === null) return fail('badTime', C.checkInError.badTime);
    if (hm !== loMin) {
      loMin = hm;
      loEdited = true;
    }
  }
  let lo = atLocal(wake, 0, loMin);
  if (minuteOf(lo) >= minuteOf(wake)) lo = atLocal(wake, -1, loMin);
  if (minuteOf(wake) - minuteOf(lo) > R.sleep.maxDurationMin) {
    return fail('badDuration', fill(C.checkInError.badDuration, { max: hoursText(R.sleep.maxDurationMin) }));
  }

  const entry = {
    date: gameDate(tap, R),
    lightsOut: isoLocal(lo),
    wake: isoLocal(wake),
    lightsOutEdited: loEdited,
    target: { bedtime: targets.bedtime, wakeTime: targets.wakeTime, windowMin: targets.windowMin }
  };
  if (wakeEdited) entry.wakeEdited = true;
  return { ok: true, entry, score: scoreWith(entry, targets, R) };
}
