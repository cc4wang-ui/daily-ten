/* Daily Ten — 照片估熱量（D30：全 App 唯一會連線的功能；契約 runs/photo-kcal/contract.md）。
   estimateMeal(file, note, photoCfg, signal) → { ok: true, est } 或 { ok: false, reason: 'offline'|'cap'|'notFood'|'failed'|'aborted' }，不丟例外
   （'aborted'＝使用者關掉面板，呼叫端不顯示訊息；連不上與逾時都算 'offline'）。
   流程：在裝置上把照片縮小（長邊 ≤ maxEdgePx、JPEG）→ POST { image, note } 到同網域的 photoCfg.endpoint → 回傳只有品項與數字。
   照片不保存：不寫 state、localStorage、sessionStorage、IndexedDB、Cache；解碼用的 bitmap／object URL／canvas 用完就釋放，
   data URL 只活在這個函式裡。網址與數字都來自 data/nutrition.json 的 photo；前端沒有金鑰，也不直接呼叫 AI 服務。 */

/* 伺服器的上限（契約：image ≤ 1.4M 字元）。超過就降品質、再縮小，直到放得進去。 */
const MAX_IMAGE_CHARS = 1400000;
const NOTE_MAX = 80;
const MIN_QUALITY = 0.4, QUALITY_STEP = 0.15, SHRINK = 0.75, MIN_EDGE = 256;

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { src: bmp, w: bmp.width, h: bmp.height, release: () => { try { bmp.close(); } catch { /* */ } } };
    } catch { /* 退回 <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('decode')); img.src = url; });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, release: () => { img.removeAttribute('src'); } };
  } finally { URL.revokeObjectURL(url); }
}

/* 縮圖成 JPEG data URL；讀不出來回 null */
export async function shrinkImage(file, P) {
  let pic = null;
  const canvas = document.createElement('canvas');
  try {
    pic = await decode(file);
    if (!pic.w || !pic.h) return null;
    let edge = Math.max(MIN_EDGE, Number(P.maxEdgePx) || 1024);
    let q = Math.min(0.95, Math.max(MIN_QUALITY, Number(P.jpegQuality) || 0.8));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    for (let i = 0; i < 12; i++) {
      const k = Math.min(1, edge / Math.max(pic.w, pic.h));
      canvas.width = Math.max(1, Math.round(pic.w * k));
      canvas.height = Math.max(1, Math.round(pic.h * k));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(pic.src, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', q);
      if (!url.startsWith('data:image/jpeg')) return null;
      if (url.length <= MAX_IMAGE_CHARS) return url;
      if (q - QUALITY_STEP >= MIN_QUALITY) q -= QUALITY_STEP;
      else if (edge * SHRINK >= MIN_EDGE) edge = Math.round(edge * SHRINK);
      else return null;
    }
    return null;
  } catch { return null; } finally {
    if (pic) pic.release();
    canvas.width = 0; canvas.height = 0;
  }
}

export async function estimateMeal(file, note, P, outerSignal) {
  const fail = (reason) => ({ ok: false, reason });
  try {
    if (!P || typeof P.endpoint !== 'string' || !file) return fail('failed');
    if (navigator.onLine === false) return fail('offline');
    let image = await shrinkImage(file, P);
    if (!image) return fail('failed');
    if (outerSignal && outerSignal.aborted) return fail('aborted');
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (outerSignal) outerSignal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(), Number(P.timeoutMs) || 60000);
    const cleanNote = [...String(note || '').trim()].slice(0, NOTE_MAX).join('');
    let body = JSON.stringify(cleanNote ? { image, note: cleanNote } : { image });
    image = null;
    let res;
    try {
      res = await fetch(P.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal, cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 429) return fail('cap');
      if (res.status !== 200) return fail('failed');
      let est;
      try { est = await res.json(); } catch (e) { if (e && e.name === 'AbortError') throw e; return fail('failed'); }
      if (!est || typeof est !== 'object' || Array.isArray(est)) return fail('failed');
      const items = Array.isArray(est.items) ? est.items.filter((it) => it && typeof it === 'object') : [];
      if (est.isFood !== true || !items.length) return fail('notFood');
      return { ok: true, est };
    } catch {
      /* 連不上、逾時、被取消 */
      return fail(outerSignal && outerSignal.aborted ? 'aborted' : 'offline');
    } finally {
      body = null;
      clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener('abort', onAbort);
    }
  } catch { return fail('failed'); }
}
