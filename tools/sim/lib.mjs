/* Daily Ten — 90 天平衡模擬（擁有者：game-designer；build／dev 工具，不是 App 檔案，不進 SW 預快取）
   用真的 engine（js/game/engine.js＋data/game.json）逐日重算：每天只新增當天的紀錄，晚上 21:00 呼叫 todaySummary。
   純 Node、離線、決定性（種子亂數，不用 Math.random、不讀時鐘）。

   對外：
     PERSONAS                         三種人設的參數（出席率、中斷型態、打卡準時率、訓練分級比例）
     simulate(persona, seed, opts)    → 一份 90 天的逐日結果與指標
     runAll(opts)                     → { rows, runs, criteria, ok }（每個人設 seeds 份，取中位數）
     CRITERIA                         「曲線合理」的判準（id、說明、判斷函式） */
import { readFileSync } from 'node:fs';
import { parseRules } from '../../js/game/rules.js';
import { todaySummary } from '../../js/game/engine.js';

export const START = '2026-10-05'; // 週一（一週＝週一到週日）
export const DAYS = 90;
export const CHECKPOINTS = [7, 14, 30, 60, 90];
export const P2_WHAT_IF = [10, 9, 8, 7]; // 提案：P1→P2 門檻「近 14 天起床在時段內 k 天」（10＝目前）
const TZ_OFFSET = '+09:00'; // 模擬在 Asia/Tokyo（run.mjs 設定 TZ）
const TARGET = { bedtime: '23:00', wakeTime: '07:00', windowMin: 30 };

/* ---------- 人設 ----------
   出席：兩狀態馬可夫鏈（在／不在），長期比例＝presence，「不在」平均連續 awayRun 天（中斷型態）。
   在的日子：分別以 move／sleep 的機率完成動、眠（至少一項）；整體每支柱出席率 ≈ presence × 機率。
   打卡準時率：wake／lightsOut 為「時段內／差 30 分內／更遠」的比例；熄燈「更遠」＝ 00:01–01:30（可能觸發 D6）。
   tiers：保底版／主課表／加一輪的比例（週日一律 Boss Day）。 */
export const PERSONAS = [
  {
    key: 'diligent', name: '認真', attendance: 0.9,
    presence: 0.93, awayRun: 1.2, move: 0.97, sleep: 0.97,
    wake: { in: 0.85, near: 0.1 }, lightsOut: { in: 0.75, near: 0.15 },
    tiers: { minimal: 0.05, main: 0.7, plus: 0.25 }
  },
  {
    key: 'normal', name: '普通', attendance: 0.65,
    presence: 0.72, awayRun: 1.6, move: 0.9, sleep: 0.9,
    wake: { in: 0.7, near: 0.18 }, lightsOut: { in: 0.55, near: 0.25 },
    tiers: { minimal: 0.2, main: 0.7, plus: 0.1 }
  },
  {
    key: 'intermittent', name: '常中斷', attendance: 0.35,
    presence: 0.4, awayRun: 3.5, move: 0.88, sleep: 0.88,
    wake: { in: 0.55, near: 0.25 }, lightsOut: { in: 0.45, near: 0.25 },
    tiers: { minimal: 0.4, main: 0.55, plus: 0.05 }
  }
];

/* ---------- 工具 ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashSeed = (s) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const pad = (n) => String(n).padStart(2, '0');
export function plusDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const between = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const hm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export function median(list) {
  const a = [...list].sort((x, y) => x - y);
  if (!a.length) return NaN;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
export function quantile(list, q) {
  const a = [...list].sort((x, y) => x - y);
  if (!a.length) return NaN;
  return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))];
}

/* 規則：預設 repo 的 data/game.json；path 可指定另一份候選規則檔（試算提案用）。格式不符回 null */
export function loadRules(path = new URL('../../data/game.json', import.meta.url)) {
  try {
    return parseRules(JSON.parse(readFileSync(path, 'utf8')));
  } catch (e) {
    return null;
  }
}

/* ---------- 一天的紀錄 ---------- */
function wakeMinute(rand, p) {
  const r = rand();
  if (r < p.wake.in) return between(rand, 390, 450); // 06:30–07:30
  if (r < p.wake.in + p.wake.near) return rand() < 0.5 ? between(rand, 360, 389) : between(rand, 451, 480);
  return between(rand, 481, 570); // 08:01–09:30
}
/* 熄燈：回傳「相對起床那天 00:00」的分鐘數（負數＝前一天晚上） */
function lightsOutMinute(rand, p) {
  const r = rand();
  if (r < p.lightsOut.in) return between(rand, -90, -30); // 22:30–23:30
  if (r < p.lightsOut.in + p.lightsOut.near) return rand() < 0.5 ? between(rand, -29, 0) : between(rand, -120, -91);
  return between(rand, 1, 90); // 00:01–01:30
}
function sleepEntry(date, rand, p) {
  const w = wakeMinute(rand, p);
  const lo = lightsOutMinute(rand, p);
  const loDate = lo < 0 ? plusDays(date, -1) : date;
  const loMin = lo < 0 ? lo + 1440 : lo;
  return {
    date,
    lightsOut: `${loDate}T${hm(loMin)}:00${TZ_OFFSET}`,
    wake: `${date}T${hm(w)}:00${TZ_OFFSET}`,
    lightsOutEdited: lo !== -60,
    target: { ...TARGET }
  };
}
function sessionOf(date, rand, p) {
  const wd = weekday(date);
  if (wd === 0) return { date, type: 'boss', xp: 0 };
  const r = rand();
  if (r < p.tiers.minimal) return { date, type: 'minimal', xp: 0 };
  const type = wd === 3 ? 'cycle' : wd === 6 ? 'rest' : 'full';
  if (r < p.tiers.minimal + p.tiers.main) return { date, type, xp: 0 };
  return { date, type, xp: 0, plus: true };
}

/* ---------- 一份 90 天模擬 ---------- */
export function simulate(persona, seed, { rules = loadRules(), days = DAYS, start = START } = {}) {
  const rand = mulberry32(hashSeed(`${persona.key}:${seed}`));
  const b = 1 / persona.awayRun;                                // 不在 → 在
  const a = (b * (1 - persona.presence)) / persona.presence;    // 在 → 不在（長期比例＝presence）
  const state = {
    version: 3, level: 2, xp: 0, streak: { current: 0, best: 0, lastDate: null },
    sessions: [], prs: {}, settings: { ...TARGET, phoneDownMin: 30 },
    habits: { sleep: { log: [] }, explore: { items: [], log: [] } },
    goals: { identity: '', weekly: [], season: [] },
    phase: { current: 'P1', startedAt: `${start}T08:00:00${TZ_OFFSET}`, history: [] },
    game: {}, meta: {}
  };
  let present = true; // 第 1 天＝開始使用的那天
  const daily = [];
  let prev = null;
  const out = {
    persona: persona.key, seed, lv: {}, xp: {}, perfectDays: 0, moveDays: 0, sleepDays: 0, anyDays: 0,
    deloadDays: 0, p2Day: null, longestPlateau: 0, violations: []
  };
  let lastLevelUp = 0;
  for (let i = 0; i < days; i++) {
    const date = plusDays(start, i);
    if (i > 0) present = present ? rand() >= a : rand() < b;
    let didMove = false;
    let didSleep = false;
    if (present) {
      didMove = rand() < persona.move;
      didSleep = rand() < persona.sleep;
      if (!didMove && !didSleep) (rand() < 0.5 ? (didMove = true) : (didSleep = true));
    }
    if (didSleep) state.habits.sleep.log.push(sleepEntry(date, rand, persona));
    if (didMove) state.sessions.push(sessionOf(date, rand, persona));
    const s = todaySummary(state, new Date(`${date}T21:00:00${TZ_OFFSET}`), rules);
    if (!s) {
      out.violations.push(`${date}：todaySummary 回 null`);
      break;
    }
    const day = {
      i: i + 1, date, lv: s.level.lv, total: s.xp.total, bonus: s.xp.bonus, pd: s.perfectDay.done,
      stage: s.returnQuest.stage, streak: s.streak.days, frozen: s.streak.frozenDays,
      tokens: s.freeze.tokens, deload: s.deload.triggered, inWin14: s.pillars.explore.unlock.count
    };
    daily.push(day);
    out.moveDays += didMove ? 1 : 0;
    out.sleepDays += didSleep ? 1 : 0;
    out.anyDays += didMove || didSleep ? 1 : 0;
    out.perfectDays += s.perfectDay.done ? 1 : 0;
    out.deloadDays += s.deload.triggered ? 1 : 0;
    if (out.p2Day === null && s.pillars.explore.unlock.ready) out.p2Day = i + 1;
    /* 不懲罰的不變量：總 XP、等級不下降；bonus ≥ 0；Freeze 補的天數不超過用掉的張數；加成次數 ≤ 徽章數 */
    if (prev) {
      if (s.xp.total < prev.total) out.violations.push(`${date}：總 XP 下降 ${prev.total} → ${s.xp.total}`);
      if (s.level.lv < prev.lv) out.violations.push(`${date}：等級下降 ${prev.lv} → ${s.level.lv}`);
      if (s.level.lv > prev.lv) lastLevelUp = i + 1;
    }
    if (s.xp.bonus < 0) out.violations.push(`${date}：bonus < 0`);
    if (s.streak.frozenDays > s.freeze.usedTotal) out.violations.push(`${date}：frozenDays > 用掉的張數`);
    if (s.returnQuest.boosts > s.returnQuest.badges) out.violations.push(`${date}：加成次數 > 徽章數`);
    out.longestPlateau = Math.max(out.longestPlateau, i + 1 - lastLevelUp);
    if (CHECKPOINTS.includes(i + 1)) {
      out.lv[i + 1] = s.level.lv;
      out.xp[i + 1] = s.xp.total;
    }
    prev = { total: s.xp.total, lv: s.level.lv };
    if (i === days - 1) {
      out.total = s.xp.total;
      out.bonus = s.xp.bonus;
      out.freezeUsed = s.freeze.usedTotal;
      out.freezeEarned = s.freeze.earnedTotal;
      out.returns = s.returnQuest.badges;
      out.boosts = s.returnQuest.boosts;
      out.bestStreak = s.streak.best;
    }
  }
  /* P1→P2 的門檻若改成近 14 天 k 天（提案用）：第一次「近 14 天起床在時段內 ≥ k」的日子 */
  out.p2ByMinDays = {};
  for (const k of P2_WHAT_IF) {
    const hit = daily.find((x) => x.inWin14 >= k);
    out.p2ByMinDays[k] = hit ? hit.i : null;
  }
  out.xpPerActiveDay = out.anyDays ? out.total / out.anyDays : 0;
  out.bonusMultiplier = out.total - out.bonus > 0 ? out.total / (out.total - out.bonus) : 1;
  /* 結構上限：Freeze 只能由實際有練的天數換來（每 7 天最多 1 張） */
  if (out.freezeEarned > Math.floor(out.moveDays / rules.freeze.earnEvery)) out.violations.push('Freeze 得到的張數超過實際天數 ÷ 7');
  if (out.freezeUsed > out.freezeEarned) out.violations.push('Freeze 用掉的張數 > 得到的張數');
  out.daily = daily;
  return out;
}

/* ---------- 彙總 ---------- */
function summarizeRuns(persona, runs, days) {
  const m = (f) => median(runs.map(f));
  const weeks = days / 7;
  const p2 = runs.map((r) => (r.p2Day === null ? Infinity : r.p2Day));
  return {
    key: persona.key, name: persona.name, attendance: persona.attendance,
    moveRate: m((r) => r.moveDays / days), sleepRate: m((r) => r.sleepDays / days),
    lv: Object.fromEntries(CHECKPOINTS.filter((c) => c <= days).map((c) => [c, m((r) => r.lv[c])])),
    lvP10: Object.fromEntries(CHECKPOINTS.filter((c) => c <= days).map((c) => [c, quantile(runs.map((r) => r.lv[c]), 0.1)])),
    xp90: m((r) => r.total), bonusShare: m((r) => (r.total ? r.bonus / r.total : 0)),
    pdPerWeek: m((r) => r.perfectDays / weeks),
    freezeUsed: m((r) => r.freezeUsed), freezeEarned: m((r) => r.freezeEarned),
    returns: m((r) => r.returns), boosts: m((r) => r.boosts),
    p2Day: median(p2), p2Within90: runs.filter((r) => r.p2Day !== null).length / runs.length,
    deloadDays: m((r) => r.deloadDays), plateau: m((r) => r.longestPlateau),
    xpPerActiveDay: m((r) => r.xpPerActiveDay), bonusMultiplier: m((r) => r.bonusMultiplier),
    p2What: Object.fromEntries(P2_WHAT_IF.map((k) => [k, {
      day: median(runs.map((r) => (r.p2ByMinDays[k] === null ? Infinity : r.p2ByMinDays[k]))),
      within90: runs.filter((r) => r.p2ByMinDays[k] !== null).length / runs.length
    }])),
    violations: runs.flatMap((r) => r.violations.map((v) => `${persona.name} #${r.seed} ${v}`))
  };
}

/* ---------- 判準：「曲線合理」 ----------
   每一條都要過；任何一條失敗 → run.mjs exit 1。中位數＝seeds 份模擬的中位數。 */
export const CRITERIA = [
  {
    id: 'C1', text: '不懲罰：每一份模擬的每一天，總 XP 與等級都不下降、bonus ≥ 0、Freeze 與加成次數在結構上限內',
    check: (rows) => rows.every((r) => r.violations.length === 0)
  },
  {
    id: 'C2', text: '每個人設都會升級：第 7 天中位數 ≥ Lv 2，且第 7 → 30 → 90 天中位數嚴格上升',
    check: (rows) => rows.every((r) => r.lv[7] >= 2 && r.lv[30] > r.lv[7] && r.lv[90] > r.lv[30])
  },
  {
    id: 'C3', text: '投入越多等級越高：每個檢查點的中位數 認真 ≥ 普通 ≥ 常中斷，第 90 天 認真 > 常中斷',
    check: (rows) => {
      const [d, n, i] = rows;
      return CHECKPOINTS.every((c) => d.lv[c] >= n.lv[c] && n.lv[c] >= i.lv[c]) && d.lv[90] > i.lv[90];
    }
  },
  {
    id: 'C4', text: '普通人設：第 14 天中位數 Lv 4–6（約兩週到 Lv 5），第 90 天中位數 Lv 10–15',
    check: (rows) => rows[1].lv[14] >= 4 && rows[1].lv[14] <= 6 && rows[1].lv[90] >= 10 && rows[1].lv[90] <= 15
  },
  {
    id: 'C5', text: '中斷不被懲罰、也不划算：額外 XP 倍率（總 XP ÷ 基礎 XP）普通、常中斷 ≥ 認真；每個出席日的平均 XP 普通、常中斷 ≤ 認真；常中斷第 90 天中位數 ≥ Lv 6',
    check: (rows) => {
      const [d, n, i] = rows;
      return n.bonusMultiplier >= d.bonusMultiplier && i.bonusMultiplier >= d.bonusMultiplier
        && n.xpPerActiveDay <= d.xpPerActiveDay && i.xpPerActiveDay <= d.xpPerActiveDay && i.lv[90] >= 6;
    }
  },
  {
    id: 'C6', text: '曲線不失控：認真第 90 天中位數 ≤ Lv 20；每個人設 bonus 佔總 XP 中位數 ≤ 40%（獎勵是加分，主體仍是每天的習慣）',
    check: (rows) => rows[0].lv[90] <= 20 && rows.every((r) => r.bonusShare <= 0.4)
  },
  {
    id: 'C7', text: 'Perfect Day 每週中位數：認真 ≥ 5、普通 2.5–5、常中斷 ≥ 0.5（P1＝動＋眠都完成）',
    check: (rows) => rows[0].pdPerWeek >= 5 && rows[1].pdPerWeek >= 2.5 && rows[1].pdPerWeek <= 5 && rows[2].pdPerWeek >= 0.5
  },
  {
    id: 'C8', text: 'Freeze 合理：認真 90 天中位數至少用到 1 張（真的接得住偶爾漏一天）；常中斷中位數 ≤ 2 張（不取代出席）',
    check: (rows) => rows[0].freezeUsed >= 1 && rows[2].freezeUsed <= 2
  },
  {
    id: 'C9', text: '回歸任務：常中斷 90 天中位數 ≥ 5 次回歸徽章、≥ 1 次加成；認真也拿得到回歸（中位數 ≥ 1）',
    check: (rows) => rows[2].returns >= 5 && rows[2].boosts >= 1 && rows[0].returns >= 1
  },
  {
    id: 'C10', text: '睡飽階段：認真人設 P1→P2 條件中位數在第 21 天內達成（CLAUDE.md §1.2：P1 約 2 週）；任何人都不可能早於第 10 天',
    check: (rows, runs) => rows[0].p2Day <= 21 && runs.every((r) => r.p2Day === null || r.p2Day >= 10)
  }
];

export function runAll({ seeds = 60, days = DAYS, rules = loadRules() } = {}) {
  if (!rules) throw new Error('data/game.json 無法通過驗證');
  const runs = [];
  const rows = PERSONAS.map((p) => {
    const list = Array.from({ length: seeds }, (_, k) => simulate(p, k + 1, { rules, days }));
    runs.push(...list);
    return summarizeRuns(p, list, days);
  });
  const criteria = CRITERIA.map((c) => ({ id: c.id, text: c.text, pass: !!c.check(rows, runs) }));
  return { rows, runs, criteria, ok: criteria.every((c) => c.pass), seeds, days };
}
