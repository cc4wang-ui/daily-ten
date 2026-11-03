/* Daily Ten — Phase 0（純函式、決定性：不讀時鐘、不碰 DOM／localStorage／網路、不改動 state）
   權威：~/workspace/daily-ten-complete.md §0。與 engine 的分工：
     - XP、等級、Perfect Day、既有連續：仍由 js/game/engine.js 決定，本模組一律不改、不重算。
     - 本模組只推導 Phase 0 新增的東西：健身房順序、寬容連續（暫停優先）、最小課／散步分級、
       晨間伸展、提醒、探索洗牌、健身房模板、疼痛旗標、匯出。
   邊界（必須對使用者明說，不可默默改定義）：
     PHASE0_BOUNDARY：洗牌任務完成只記為「探索嘗試」，Phase 0 不改 XP、Perfect Day、連續的計算；
     P1 Perfect Day 仍為動＋眠 2 支柱，P2 解鎖（14 天內 10 次起床）後才改 3 支柱。
   state.phase0 形狀（全部選填、缺漏當空；migrate 會原樣保留不認得的欄位）：
     { gymLog: [{date, mode:'gym'|'home'|'minimum'|'walk'}],
       pauses: [{from, to, kind:'Rest'|'Sick'|'Travel'}],
       stretch: { 'YYYY-MM-DD': 'full'|'short' },
       exploreCurrent: int, exploreTries: [{date, taskId}],
       pain: [{date, exercise}], reminder: {time:'HH:MM', enabled: bool} }
   對外：
     EXPLORE_TASKS, shuffleExplore(prevIndex, rnd), GYM_SEQUENCE, GYM_TEMPLATES,
     parsePhase0(state), pauseDates(pauses), isPaused(date, pauses),
     nextGym(parsed, today), weekGymCount(parsed, today),
     forgivingStreak(trainDayNums, pauses, todayNum, freeze),
     phase0Day(parsed, date, engineMoveDone),
     reminderDue(reminder, nowHM, todayDone), buildExport(state, parsed) */
/* 不 import js/game/day.js：load-failure 測試會把 day.js 擋成 404，Phase 0 面板必須不因此讓首頁無法啟動。
   日期工具在此內聯（與 day.js／time.js 同一套規則：1970-01-01 為週四，UTC 日數）。 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDateStr = (s) => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const dayNumber = (s) => Math.floor(Date.parse(`${s}T00:00:00Z`) / 86400000);
const dayNumberToStr = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const weekdayOf = (s) => (((dayNumber(s) + 4) % 7) + 7) % 7;

export const PHASE0_BOUNDARY = 'Phase 0：洗牌任務完成只記為探索嘗試，不改 XP、Perfect Day、連續的計算；P1 Perfect Day 仍為動＋眠 2 支柱，P2 解鎖後才 3 支柱。';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const MODES = ['gym', 'home', 'minimum', 'walk'];
const PAUSE_KINDS = ['Rest', 'Sick', 'Travel'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const EXPLORE_TASKS = Object.freeze([
  Object.freeze({ id: 'melodica', title: '澀谷 melodica 體驗', category: '音樂', place: '澀谷', time: '2 小時', cost: '約 $32.72', finish: '上完 2 小時，自己吹出一段旋律' }),
  Object.freeze({ id: 'calligraphy', title: '澀谷書法體驗', category: '書法', place: '澀谷', time: '1 小時', cost: '帶作品回家', finish: '完成一幅自己的書法作品並帶回家' }),
  Object.freeze({ id: 'chopsticks', title: '澀谷筷子製作體驗', category: '手作', place: '澀谷', time: '1 小時', cost: '帶筷子回家', finish: '完成一雙自己做的筷子' }),
  Object.freeze({ id: 'sushi', title: '澀谷手捲壽司課', category: '料理', place: '澀谷', time: '約 2 小時', cost: '含食材', finish: '親手完成並吃掉自己做的壽司' }),
  Object.freeze({ id: 'coin-ring', title: '東京古幣戒指製作', category: '金工', place: '東京', time: '約 2 小時', cost: '帶戒指回家', finish: '完成一枚自己做的戒指' }),
  Object.freeze({ id: 'kawaii-sushi', title: '可愛角色壽司工作坊', category: '料理', place: '東京', time: '約 2 小時', cost: '含食材', finish: '完成一份可愛角色壽司' }),
  Object.freeze({ id: 'clay', title: '免燒陶土小物', category: '手作', place: '在家', time: '30 分鐘', cost: '陶土一份', finish: '完成一件陶土小物，晾乾即可' }),
  Object.freeze({ id: 'photo-hunt', title: '手機主題拍照狩獵', category: '攝影', place: '外出', time: '10 分鐘', cost: '免費', finish: '拍滿 6 張主題照片' }),
  Object.freeze({ id: 'contour-sketch', title: '不提筆素描', category: '畫畫', place: '在家', time: '20 分鐘', cost: '免費', finish: '完成一張不提筆素描' }),
  Object.freeze({ id: 'noticing-walk', title: '一條街觀察散步', category: '散步', place: '外出', time: '10 分鐘', cost: '免費', finish: '記下 5 個觀察' }),
  Object.freeze({ id: 'one-page-journal', title: '一頁日記', category: '書寫', place: '在家', time: '10 分鐘', cost: '免費', finish: '寫滿一頁就停筆' }),
  Object.freeze({ id: 'three-ingredient', title: '三種食材挑戰', category: '料理', place: '在家', time: '30 到 60 分鐘', cost: '廚房現有食材', finish: '完成一道自創料理' }),
  Object.freeze({ id: 'origami', title: '摺紙書籤', category: '手作', place: '在家', time: '20 分鐘', cost: '免費', finish: '完成一個能用的摺紙書籤' }),
  Object.freeze({ id: 'chess-puzzles', title: '初學者西洋棋謎題', category: '腦力', place: '在家', time: '10 分鐘', cost: '免費', finish: '解完 5 道棋謎' }),
]);

export function shuffleExplore(prevIndex, rnd = Math.random) {
  const n = EXPLORE_TASKS.length;
  if (n <= 1) return 0;
  const prev = Number.isInteger(prevIndex) && prevIndex >= 0 && prevIndex < n ? prevIndex : -1;
  let pick = Math.floor(rnd() * n);
  let guard = 0;
  while (pick === prev && guard++ < 50) pick = Math.floor(rnd() * n);
  if (pick === prev) pick = (prev + 1) % n;
  return pick;
}

export const GYM_SEQUENCE = Object.freeze(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
const ex = (name, sets, rep, kind) => Object.freeze({ name, sets, rep, kind });
export const GYM_TEMPLATES = Object.freeze({
  upper: Object.freeze([
    ex('上斜臥推', 2, '6–10', 'compound'), ex('平板臥推', 2, '6–10', 'compound'),
    ex('側平舉', 2, '10–15', 'isolation'), ex('滑輪下拉', 2, '6–10', 'compound'),
    ex('上背划船（手肘外展）', 2, '6–10', 'compound'), ex('二頭彎舉', 2, '10–15', 'isolation'),
    ex('三頭伸展', 2, '10–15', 'isolation'),
  ]),
  lower: Object.freeze([
    ex('深蹲或腿推', '2–3', '6–10', 'compound'), ex('羅馬尼亞硬舉（髖鉸鏈）', '2–3', '6–10', 'compound'),
    ex('提踵', '2–3', '10–15', 'isolation'), ex('內收肌器械', '2–3', '10–15', 'isolation'),
    ex('腿後彎舉', '2–3', '10–15', 'isolation'), ex('腿前伸展', '2–3', '10–15', 'isolation'),
  ]),
});

export function parsePhase0(state) {
  const raw = isObj(state) && isObj(state.phase0) ? state.phase0 : {};
  const gymLog = Array.isArray(raw.gymLog) ? raw.gymLog.filter((e) => isObj(e) && isValidDateStr(e.date) && MODES.includes(e.mode)) : [];
  const pauses = Array.isArray(raw.pauses) ? raw.pauses.filter((p) => isObj(p) && isValidDateStr(p.from) && isValidDateStr(p.to) && p.from <= p.to && PAUSE_KINDS.includes(p.kind)) : [];
  const stretch = {};
  if (isObj(raw.stretch)) for (const [d, v] of Object.entries(raw.stretch)) if (isValidDateStr(d) && (v === 'full' || v === 'short')) stretch[d] = v;
  const exploreTries = Array.isArray(raw.exploreTries) ? raw.exploreTries.filter((e) => isObj(e) && isValidDateStr(e.date) && typeof e.taskId === 'string') : [];
  const pain = Array.isArray(raw.pain) ? raw.pain.filter((e) => isObj(e) && isValidDateStr(e.date) && typeof e.exercise === 'string' && e.exercise) : [];
  const reminder = isObj(raw.reminder) && TIME_RE.test(raw.reminder.time) ? { time: raw.reminder.time, enabled: raw.reminder.enabled === true } : null;
  const exploreCurrent = Number.isInteger(raw.exploreCurrent) && raw.exploreCurrent >= 0 && raw.exploreCurrent < EXPLORE_TASKS.length ? raw.exploreCurrent : 0;
  return { gymLog, pauses, stretch, exploreTries, pain, reminder, exploreCurrent };
}

export function pauseDates(pauses) {
  const out = new Set();
  for (const p of pauses) {
    let n = dayNumber(p.from);
    const end = dayNumber(p.to);
    for (let guard = 0; n <= end && guard < 400; n++, guard++) out.add(dayNumberToStr(n));
  }
  return out;
}
export function isPaused(date, pauses) {
  if (!isValidDateStr(date)) return false;
  return pauses.some((p) => date >= p.from && date <= p.to);
}

/* 健身房順序：只算已完成的完整健身房課（gymLog mode gym、日期 ≤ today），漏掉／改居家／最小課／散步都不推進。 */
export function nextGym(parsed, today) {
  const count = parsed.gymLog.filter((e) => e.mode === 'gym' && (!today || e.date <= today)).length;
  const index = count % GYM_SEQUENCE.length;
  const label = GYM_SEQUENCE[index];
  const type = index % 2 === 0 ? 'upper' : 'lower';
  return { label, type, index, count, template: GYM_TEMPLATES[type] };
}
export function weekGymCount(parsed, today) {
  if (!isValidDateStr(today)) return 0;
  const todayNum = dayNumber(today);
  const monday = todayNum - ((weekdayOf(today) - 1 + 7) % 7);
  return new Set(parsed.gymLog.filter((e) => e.mode === 'gym' && dayNumber(e.date) >= monday && dayNumber(e.date) <= todayNum).map((e) => e.date)).size;
}

/* 寬容連續（暫停優先）：暫停日不耗 Freeze、不中斷、不計 frozenDays；只有非暫停缺席日才耗 Freeze。 */
export function forgivingStreak(trainDayNums, pauses, todayNum, freeze = { earnEvery: 7, max: 2 }) {
  const earnEvery = Number.isInteger(freeze.earnEvery) && freeze.earnEvery > 0 ? freeze.earnEvery : 7;
  const max = Number.isInteger(freeze.max) && freeze.max >= 0 ? freeze.max : 2;
  const paused = pauseDates(pauses);
  const nums = [...new Set(trainDayNums)].filter((n) => Number.isFinite(n) && n <= todayNum).sort((a, b) => a - b);
  let tokens = 0, earned = 0, run = 0, runFrozen = 0, best = 0, prev = null;
  const used = [];
  const gapNonPause = (a, b) => { // a,b 為相鄰訓練日的 dayNum，算中間非暫停天數與其日期
    const days = [];
    for (let n = a + 1; n < b; n++) if (!paused.has(dayNumberToStr(n))) days.push(n);
    return days;
  };
  for (const n of nums) {
    if (prev !== null) {
      const gap = gapNonPause(prev, n);
      if (gap.length > 0) {
        if (gap.length <= tokens) { tokens -= gap.length; used.push(...gap); runFrozen += gap.length; }
        else { run = 0; runFrozen = 0; }
      }
    }
    run += 1;
    if (run % earnEvery === 0 && tokens < max) { tokens += 1; earned += 1; }
    if (run > best) best = run;
    prev = n;
  }
  let days = 0, frozenDays = 0;
  if (prev !== null) {
    const trailing = gapNonPause(prev, todayNum + 1);
    if (trailing.length === 0) { days = run; frozenDays = runFrozen; }
    else if (trailing.length <= tokens) { tokens -= trailing.length; used.push(...trailing); days = run; frozenDays = runFrozen + trailing.length; }
  }
  return { days, best, tokens, earned, used: used.map(dayNumberToStr), frozenDays, pausedDays: [...paused].filter((d) => dayNumber(d) <= todayNum).length };
}

export function phase0Day(parsed, date, engineMoveDone) {
  const log = parsed.gymLog.find((e) => e.date === date) || null;
  const paused = isPaused(date, parsed.pauses);
  const walk = log && log.mode === 'walk';
  const minimum = log && log.mode === 'minimum';
  const movementCredit = !!(engineMoveDone || (log && (log.mode === 'gym' || log.mode === 'home' || log.mode === 'minimum')));
  return {
    paused, logMode: log ? log.mode : null, walk: !!walk, minimum: !!minimum,
    movementCredit, activityDay: !!(movementCredit || walk),
    stretch: parsed.stretch[date] || null,
    painExercises: parsed.pain.filter((p) => p.date === date).map((p) => p.exercise),
  };
}

export function reminderDue(reminder, nowHM, todayDone) {
  if (!reminder || reminder.enabled !== true || !TIME_RE.test(nowHM)) return false;
  return !todayDone && reminder.time <= nowHM;
}

const csvEsc = (v) => `"${String(v).replace(/"/g, '""')}"`;
export function buildExport(state, parsed) {
  const p = parsed || parsePhase0(state);
  const lines = [['type', 'date', 'value'].map(csvEsc).join(',')];
  for (const e of p.gymLog) lines.push([csvEsc('gymLog'), csvEsc(e.date), csvEsc(e.mode)].join(','));
  for (const [d, v] of Object.entries(p.stretch)) lines.push([csvEsc('stretch'), csvEsc(d), csvEsc(v)].join(','));
  for (const e of p.exploreTries) lines.push([csvEsc('exploreTry'), csvEsc(e.date), csvEsc(e.taskId)].join(','));
  for (const e of p.pain) lines.push([csvEsc('pain'), csvEsc(e.date), csvEsc(e.exercise)].join(','));
  for (const e of p.pauses) lines.push([csvEsc('pause'), csvEsc(`${e.from}~${e.to}`), csvEsc(e.kind)].join(','));
  return { csv: lines.join('\n') + '\n', json: { phase0: p, boundary: PHASE0_BOUNDARY } };
}
