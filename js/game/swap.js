/* Daily Ten — 換動作（純函式）：每個健身房動作與伸展項目至少 3 個備用選項。
   備用表在 data/swaps.json；對應關係存在 state.v4 的 gym.swaps／stretch.swaps（{原動作 id: 備用 id}），
   由畫面層寫入、commit() 存檔，重整後還在。換回原動作＝刪掉對應。
   規則：備用只認同一個原動作的表（不同原動作的備用 id 不通用）；備用 id 不可與原課表任何動作 id 重複；
   健身房備用沿用自己的 sets／reps／kind；伸展備用沿用原項目的秒數（full／short 不變，總時間與 XP 不變）。 */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/* 某原動作的備用清單（防禦性複製；找不到回空陣列）。 */
export function gymAlternatives(swaps, originalId) {
  const list = isObj(swaps) && isObj(swaps.gym) && Array.isArray(swaps.gym[originalId]) ? swaps.gym[originalId] : [];
  return list.filter((a) => isObj(a) && typeof a.id === 'string').map((a) => ({ ...a }));
}
export function stretchAlternatives(swaps, originalId) {
  const list = isObj(swaps) && isObj(swaps.stretch) && Array.isArray(swaps.stretch[originalId]) ? swaps.stretch[originalId] : [];
  return list.filter((a) => isObj(a) && typeof a.id === 'string').map((a) => ({ ...a }));
}

/* 健身房課表動作 → 實際要用的動作定義。沒換過就回原動作（swappedFrom: null）；
   有對應且備用存在就回備用（帶 swappedFrom: 原 id，畫面用它顯示「已替換」與換回）。 */
export function resolveGymTemplate(ex, swapsMap, swaps) {
  if (!isObj(ex) || typeof ex.id !== 'string') return null;
  const altId = isObj(swapsMap) ? swapsMap[ex.id] : null;
  if (typeof altId !== 'string' || !altId) return { ...ex, swappedFrom: null };
  const alt = gymAlternatives(swaps, ex.id).find((a) => a.id === altId);
  if (!alt) return { ...ex, swappedFrom: null };
  return { ...alt, swappedFrom: ex.id };
}

/* 伸展項目 → 實際要用的項目。備用沿用原項目的 full／short 秒數（總時間不變）與 video2（沒有就沒有）。 */
export function resolveStretchItem(item, swapsMap, swaps) {
  if (!isObj(item) || typeof item.id !== 'string') return null;
  const altId = isObj(swapsMap) ? swapsMap[item.id] : null;
  if (typeof altId !== 'string' || !altId) return { ...item, swappedFrom: null };
  const alt = stretchAlternatives(swaps, item.id).find((a) => a.id === altId);
  if (!alt) return { ...item, swappedFrom: null };
  return { ...alt, full: item.full, short: item.short, video2: item.video2 || null, swappedFrom: item.id };
}

/* 整份課表／伸展清單套用對應（buildDraft、課表預覽、伸展清單共用）。 */
export function applyGymSwaps(exercises, swapsMap, swaps) {
  return (Array.isArray(exercises) ? exercises : []).map((ex) => resolveGymTemplate(ex, swapsMap, swaps)).filter(Boolean);
}
export function applyStretchSwaps(items, swapsMap, swaps) {
  return (Array.isArray(items) ? items : []).map((it) => resolveStretchItem(it, swapsMap, swaps)).filter(Boolean);
}

/* 備用表自我檢查（單元測試用；回傳問題字串陣列，空＝通過）。
   每一項原動作 ≥3 個備用；備用 id 全域唯一且不與任何原動作 id 重複；健身房備用 kind／sets／reps 格式合法；
   伸展備用有 cue 且 sides 是布林值。 */
export function validateSwaps(swaps, gym, stretch) {
  const problems = [];
  const repOk = (r) => typeof r === 'string' && /^(\d{1,3})\s*[–-]\s*(\d{1,3})$/.test(r.trim());
  const setsOk = (s) => Number.isInteger(s) || (typeof s === 'string' && /^(\d{1,2})\s*[–-]\s*(\d{1,2})$/.test(s.trim()));
  const originalIds = new Set();
  const gymExs = [...(gym?.templates?.upper || []), ...(gym?.templates?.lower || [])];
  for (const e of gymExs) originalIds.add(e.id);
  const stretchItems = Array.isArray(stretch?.items) ? stretch.items : [];
  for (const it of stretchItems) originalIds.add(it.id);
  const altIds = new Set();
  const checkAlts = (list, label) => {
    if (!Array.isArray(list) || list.length < 3) { problems.push(`${label}：備用不到 3 個（${Array.isArray(list) ? list.length : 0} 個）`); return; }
    for (const a of list) {
      if (!isObj(a) || typeof a.id !== 'string' || !a.id) { problems.push(`${label}：備用缺 id`); continue; }
      if (originalIds.has(a.id)) problems.push(`${label}：備用 id ${a.id} 與原動作重複`);
      if (altIds.has(a.id)) problems.push(`${label}：備用 id ${a.id} 重複出現`);
      altIds.add(a.id);
      if (typeof a.name !== 'string' || !a.name) problems.push(`${label}：${a.id} 缺 name`);
      if (typeof a.cue !== 'string' || !a.cue) problems.push(`${label}：${a.id} 缺 cue`);
    }
  };
  for (const e of gymExs) {
    const list = gymAlternatives(swaps, e.id);
    checkAlts(list, `健身房 ${e.id}`);
    for (const a of list) {
      if (a.kind !== 'compound' && a.kind !== 'isolation') problems.push(`健身房 ${e.id}：${a.id} kind 不是 compound／isolation`);
      if (!setsOk(a.sets)) problems.push(`健身房 ${e.id}：${a.id} sets 格式不對`);
      if (!repOk(a.reps)) problems.push(`健身房 ${e.id}：${a.id} reps 格式不對`);
    }
  }
  for (const it of stretchItems) {
    const list = stretchAlternatives(swaps, it.id);
    checkAlts(list, `伸展 ${it.id}`);
    for (const a of list) if (typeof a.sides !== 'boolean') problems.push(`伸展 ${it.id}：${a.id} sides 不是布林值`);
  }
  const knownGym = new Set(gymExs.map((e) => e.id));
  for (const k of Object.keys(isObj(swaps?.gym) ? swaps.gym : {})) if (!knownGym.has(k)) problems.push(`健身房備用表有多餘的原動作 ${k}`);
  const knownSt = new Set(stretchItems.map((it) => it.id));
  for (const k of Object.keys(isObj(swaps?.stretch) ? swaps.stretch : {})) if (!knownSt.has(k)) problems.push(`伸展備用表有多餘的原動作 ${k}`);
  return problems;
}

/* 對應表清理（寫入前用）：只留備用表裡真的存在的 id，否則刪掉（舊資料／打錯字不會讓畫面壞掉）。 */
export function cleanSwapMap(swapsMap, kind, swaps) {
  const out = {};
  if (!isObj(swapsMap)) return out;
  for (const [orig, altId] of Object.entries(swapsMap)) {
    if (typeof altId !== 'string') continue;
    const list = kind === 'gym' ? gymAlternatives(swaps, orig) : stretchAlternatives(swaps, orig);
    if (list.some((a) => a.id === altId)) out[orig] = altId;
  }
  return out;
}
