/* Daily Ten — 探索（純函式）：本週任務的挑選與洗牌。任務池在 data/explore.json。
   規則：優先沒做過、沒跳過的任務；洗牌不會連續抽到同一個；全部做過就從做過的裡面抽（但不抽上一個）。 */
export function candidates(pool, log, skipped, excludeId) {
  const done = new Set((log || []).map((e) => e.taskId));
  const skip = new Set(skipped || []);
  let c = pool.filter((t) => !done.has(t.id) && !skip.has(t.id) && t.id !== excludeId);
  if (!c.length) c = pool.filter((t) => !done.has(t.id) && t.id !== excludeId);
  if (!c.length) c = pool.filter((t) => t.id !== excludeId);
  return c.length ? c : pool;
}
export function pickTask(pool, log, skipped, excludeId, rnd = Math.random) {
  const c = candidates(pool, log, skipped, excludeId);
  return c[Math.min(c.length - 1, Math.floor(rnd() * c.length))] || null;
}
export function taskById(pool, id) { return pool.find((t) => t.id === id) || null; }
