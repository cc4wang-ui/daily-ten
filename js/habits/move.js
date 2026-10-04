/* Daily Ten — 動：訓練紀錄 → 當日分級與 XP（擁有者：game-designer）
   純函式：不讀時鐘、不碰 DOM／localStorage／網路；state 欄位缺漏或型別錯都不丟例外。
   分級（data/game.json 的 move）：保底版 minimal 30／主課表 main 50／加一輪 plus 60。
     - session.plus === true → plus（加一輪；建議由 data-guardian 加的選填欄位）
     - 否則依 move.tierByType[session.type]；不認得的 type → move.unknownTypeTier（主課表）
     - session.date 就是遊戲日（'YYYY-MM-DD'）；同一天多筆取 XP 最高的（同分取第一筆）
   對外：
     moveTier(session, rules) → 'minimal' | 'main' | 'plus' | null（rules 無效或 session 不是物件）
     moveDays(state, rules)   → Map(date → {tier, xp, type, plus, label})；rules 無效回空 Map */
import { asRules } from '../game/rules.js';
import { isValidDateStr } from '../game/day.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function moveTier(session, rules) {
  const R = asRules(rules);
  if (!R || !isObj(session)) return null;
  if (session.plus === true) return 'plus';
  const t = typeof session.type === 'string' ? session.type : null;
  return t !== null && own(R.move.tierByType, t) ? R.move.tierByType[t] : R.move.unknownTypeTier;
}

function labelOf(R, tier, type, plus) {
  if (plus) return R.move.plusLabel;
  if (typeof type === 'string' && own(R.move.typeLabels, type)) return R.move.typeLabels[type];
  return R.move.tiers[tier].label;
}

export function moveDays(state, rules) {
  const out = new Map();
  const R = asRules(rules);
  if (!R || !isObj(state) || !Array.isArray(state.sessions)) return out;
  const cap = R.pillars.move.max;
  for (const s of state.sessions) {
    if (!isObj(s) || !isValidDateStr(s.date)) continue;
    const tier = moveTier(s, R);
    const xp = Math.min(cap, R.move.tiers[tier].xp);
    const prev = out.get(s.date);
    if (prev && prev.xp >= xp) continue;
    const plus = s.plus === true;
    const type = typeof s.type === 'string' ? s.type : null;
    out.set(s.date, { tier, xp, type, plus, label: labelOf(R, tier, type, plus) });
  }
  return out;
}
