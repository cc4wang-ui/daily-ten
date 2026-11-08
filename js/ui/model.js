/* Daily Ten — 畫面層共用的資料模型：載入規則檔（fetch，SW 預快取離線可用）、state.v4 的推導摘要。
   refresh() 在每次寫入後呼叫；各畫面只讀 summary()，不自己算。 */
import { getState, saveState } from '../state/store.js';
import { ensureV4, parseV4 } from '../state/v4.js';
import { summarize, pickCoachLine, gameDay } from '../game/core.js';

const files = ['game', 'gym', 'stretch', 'explore', 'achievements', 'coach', 'videos', 'swaps'];
const data = {};
let sum = null;
let nowFn = () => new Date();

export function setClock(fn) { nowFn = typeof fn === 'function' ? fn : () => new Date(); }
export const now = () => nowFn();

export async function loadData() {
  const results = await Promise.all(files.map(async (f) => {
    const r = await fetch(`./data/${f}.json`, { cache: 'no-cache' }).catch(() => null);
    if (!r || !r.ok) { if (f === 'videos') return [f, { items: [] }]; throw new Error(`讀不到 data/${f}.json`); }
    return [f, await r.json()];
  }));
  for (const [k, v] of results) data[k] = v;
  return data;
}
export const rules = () => data.game;
export const gymData = () => data.gym;
export const stretchData = () => data.stretch;
export const explorePool = () => (data.explore && Array.isArray(data.explore.items) ? data.explore.items : []);
export const achievementsData = () => (data.achievements && Array.isArray(data.achievements.items) ? data.achievements.items : []);
export const coachData = () => data.coach;
export const videosData = () => data.videos;
export const swapsData = () => data.swaps;

export function v4() { return ensureV4(getState()).v4; }
export function refresh() {
  const st = getState();
  ensureV4(st);
  sum = summarize(parseV4(st), { rules: data.game, achievements: achievementsData(), now: nowFn() });
  return sum;
}
export function summary() {
  if (!sum || (data.game && sum.today.date !== gameDay(nowFn(), data.game))) return refresh();
  return sum;
}
export async function commit() { refresh(); return saveState(); }
export function coachLine() { return pickCoachLine(coachData(), summary(), nowFn()); }
