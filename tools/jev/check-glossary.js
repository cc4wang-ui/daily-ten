#!/usr/bin/env node
// Daily Ten — 台灣繁中用語表檢查（CLAUDE.md §11、§2 第 11 條）
// 關鍵字規則：不呼叫 Jev、不需 API key、不需網路；只用 Node 內建模組（Node 22）。
//
// 用法（在 repo 根目錄執行）：
//   node tools/jev/check-glossary.js                 掃描並寫報告（reports/copy-glossary.md），exit 0
//   node tools/jev/check-glossary.js --ci            有「不在 baseline 的違規」→ exit 1，stdout 列出 檔案:行號
//   node tools/jev/check-glossary.js --self-test     跑內建案例，全過 exit 0
//   node tools/jev/check-glossary.js --write-baseline --root <ec87e03 的 checkout>
//
// 掃描範圍（只有含中文字的字串才算 UI 字串候選）：
//   index.html             文字節點、可見屬性（placeholder／title／aria-label／alt…）、inline <script> 的字串常值；
//                          略過 <style>、HTML 註解、<script src>
//   demos.js、js/ 下的 .js  字串常值（'…'、"…"）與 template literal 的靜態片段；略過註解，regex literal 不當字串
//   data/*.json            所有字串值（不含 key）；目錄不存在就略過
//
// 既有違規以「內容」比對：鍵 = {rule, term, text}，text = 解碼跳脫字元／HTML 實體、壓縮空白後的完整字串。
// 字串搬到別的檔案或換了行號仍算既有；字串內容一改就算新增。
//
// Exit code：0 正常；1 --ci 有新增違規，或 --self-test 失敗；2 參數、設定檔或讀檔錯誤。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_GLOSSARY = path.join(HERE, 'zh-tw-glossary.json');
const DEFAULT_BASELINE = path.join(HERE, 'glossary-baseline.json');
const REPORT_REL = 'reports/copy-glossary.md';
const HAN = /\p{Script=Han}/u;

const USAGE = `用法：node tools/jev/check-glossary.js [選項]
  （無選項）           掃描並寫報告，exit 0
  --ci                 有不在 baseline 的違規 → exit 1，stdout 印出 檔案:行號 規則 字串 → 建議
  --self-test          跑內建案例（規則正反例、註解、regex literal、template literal、N 連…）
  --write-baseline     把掃到的違規寫成 baseline（只應對 ec87e03 的 checkout 執行，見報告說明）
  --root <dir>         掃描根目錄（預設：目前目錄）
  --report <path>      報告路徑（預設：<root>/${REPORT_REL}）
  --no-report          不寫報告
  --glossary <path>    用語表（預設：本腳本同目錄 zh-tw-glossary.json）
  --baseline <path>    baseline（預設：本腳本同目錄 glossary-baseline.json）`;

/* ───────── 小工具 ───────── */
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // 依 UTF-16 code unit，與 locale 無關，輸出才穩定
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isAsciiWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
const isLineEnd = (c) => c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029';

function lineStarts(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}
function lineOf(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

// 解碼後的字串＋每個字元在原始檔的位置 → 壓縮 ASCII 空白（含換行）為單一空格、去頭尾。
// 全形空格（U+3000）與 NBSP 是內容的一部分，保留。
function normalize(value, map) {
  let text = '';
  const tmap = [];
  let pending = -1;
  for (let k = 0; k < value.length; k++) {
    if (isAsciiWs(value[k])) {
      if (text && pending < 0) pending = map[k];
      continue;
    }
    if (pending >= 0) {
      text += ' ';
      tmap.push(pending);
      pending = -1;
    }
    text += value[k];
    tmap.push(map[k]);
  }
  return { text, tmap };
}

/* ───────── JavaScript：擷取字串常值（略過註解與 regex literal） ───────── */
// 這些關鍵字後面的 `/` 是 regex 開頭；其餘識別字、數字、`)`、`]` 後面是除號。
const KEYWORDS_BEFORE_EXPR = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await', 'extends', 'default']);
const ID_START = /[\p{ID_Start}$_\\#]/u;
const ID_PART = /[\p{ID_Continue}$\u200c\u200d\\]/u;
const DIGIT = /[0-9]/;

// i 指向反斜線；回傳 {s: 解碼結果, next: 下一個位置}
function readEscape(src, i, end) {
  if (i + 1 >= end) return { s: '', next: i + 1 };
  const c = src[i + 1];
  const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v' };
  if (Object.hasOwn(simple, c)) return { s: simple[c], next: i + 2 };
  if (c === '\r') return { s: '', next: src[i + 2] === '\n' ? i + 3 : i + 2 }; // 行接續
  if (c === '\n' || c === '\u2028' || c === '\u2029') return { s: '', next: i + 2 };
  if (c === '0' && !DIGIT.test(src[i + 2] || '')) return { s: '\0', next: i + 2 };
  if (c === 'x') {
    const h = src.slice(i + 2, i + 4);
    if (/^[0-9a-fA-F]{2}$/.test(h)) return { s: String.fromCharCode(parseInt(h, 16)), next: i + 4 };
  }
  if (c === 'u') {
    if (src[i + 2] === '{') {
      const close = src.indexOf('}', i + 3);
      const h = close > 0 ? src.slice(i + 3, close) : '';
      if (/^[0-9a-fA-F]{1,6}$/.test(h) && parseInt(h, 16) <= 0x10ffff) {
        return { s: String.fromCodePoint(parseInt(h, 16)), next: close + 1 };
      }
    } else {
      const h = src.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(h)) return { s: String.fromCharCode(parseInt(h, 16)), next: i + 6 };
    }
  }
  const ch = String.fromCodePoint(src.codePointAt(i + 1)); // \' \" \\ \` \$ 與其他：字元本身
  return { s: ch, next: i + 1 + ch.length };
}

// 掃描 src[start, end)，每遇到一個字串常值或 template 靜態片段就 emit：
// {kind:'string'|'template', start, end, value（已解碼）, map（value 每個字元在 src 的位置）, afterExpr}
// afterExpr：片段緊接在動態運算式之後（`${n}…`、n + '…'），給 dynamicPrefix 規則用。
function scanJs(src, start, end, emit) {
  let i = start;
  let prev = null; // 上一個有效 token：{t:'punct'|'word'|'num'|'lit', v}
  let prev2 = null;
  const setPrev = (tok) => { prev2 = prev; prev = tok; };
  const regexAllowed = () => {
    if (!prev) return true;
    if (prev.t === 'punct') return !(prev.v === ')' || prev.v === ']' || prev.v === '++' || prev.v === '--');
    if (prev.t === 'word') return KEYWORDS_BEFORE_EXPR.has(prev.v);
    return false;
  };
  const followsExpr = () => {
    if (!prev || prev.t !== 'punct' || prev.v !== '+' || !prev2) return false;
    if (prev2.t === 'num') return true;
    if (prev2.t === 'word') return !KEYWORDS_BEFORE_EXPR.has(prev2.v);
    return prev2.t === 'punct' && (prev2.v === ')' || prev2.v === ']'); // '字串' + '字串' 不算
  };
  const push = (acc, s, at) => { acc.value += s; for (let k = 0; k < s.length; k++) acc.map.push(at); };

  function readString(quote) {
    const tokStart = i;
    const afterExpr = followsExpr();
    const acc = { value: '', map: [] };
    i++;
    while (i < end) {
      const c = src[i];
      if (c === quote) { i++; break; }
      if (c === '\n' || c === '\r') break; // 未結束的字串：停在行尾，避免吃掉後面的程式
      if (c === '\\') { const r = readEscape(src, i, end); push(acc, r.s, i); i = r.next; continue; }
      acc.value += c; acc.map.push(i); i++;
    }
    emit({ kind: 'string', start: tokStart, end: i, value: acc.value, map: acc.map, afterExpr });
  }

  function readTemplate() {
    let afterExpr = followsExpr();
    let fragStart = i;
    let acc = { value: '', map: [] };
    const flush = () => {
      emit({ kind: 'template', start: fragStart, end: i, value: acc.value, map: acc.map, afterExpr });
      acc = { value: '', map: [] };
    };
    i++;
    while (i < end) {
      const c = src[i];
      if (c === '`') { i++; flush(); return; }
      if (c === '\\') { const r = readEscape(src, i, end); push(acc, r.s, i); i = r.next; continue; }
      if (c === '$' && src[i + 1] === '{') {
        flush();
        i += 2;
        const saved = [prev, prev2];
        prev = prev2 = null; // ${ 之後是新運算式的開頭
        readCode(true);
        [prev, prev2] = saved;
        afterExpr = true;
        fragStart = i;
        continue;
      }
      acc.value += c; acc.map.push(i); i++;
    }
    flush();
  }

  // 成功時把 i 移到 regex（含旗標）之後並回傳 true；同一行找不到結尾就當作除號。
  function readRegex() {
    let j = i + 1;
    let inClass = false;
    while (j < end) {
      const c = src[j];
      if (isLineEnd(c)) return false;
      if (c === '\\') {
        if (isLineEnd(src[j + 1] || '\n')) return false;
        j += 2;
        continue;
      }
      if (inClass) {
        if (c === ']') inClass = false;
      } else if (c === '[') {
        inClass = true;
      } else if (c === '/') {
        j++;
        while (j < end && ID_PART.test(src[j])) j++;
        i = j;
        return true;
      }
      j++;
    }
    return false;
  }

  // untilBrace：在 template 的 ${ } 裡，遇到同層的 } 就返回
  function readCode(untilBrace) {
    let depth = 0;
    while (i < end) {
      const c = src[i];
      const d = src[i + 1];
      if (c === '/' && d === '/') { i += 2; while (i < end && !isLineEnd(src[i])) i++; continue; }
      if (c === '/' && d === '*') {
        const close = src.indexOf('*/', i + 2);
        i = close < 0 || close + 2 > end ? end : close + 2;
        continue;
      }
      if (c === "'" || c === '"') { readString(c); setPrev({ t: 'lit' }); continue; }
      if (c === '`') { readTemplate(); setPrev({ t: 'lit' }); continue; }
      if (c === '/') {
        if (regexAllowed() && readRegex()) { setPrev({ t: 'lit' }); continue; }
        i++; setPrev({ t: 'punct', v: '/' }); continue;
      }
      if (c === '{') { depth++; i++; setPrev({ t: 'punct', v: '{' }); continue; }
      if (c === '}') {
        if (untilBrace && depth === 0) { i++; return; }
        depth--; i++; setPrev({ t: 'punct', v: '}' }); continue;
      }
      if (isAsciiWs(c) || /\s/u.test(c)) { i++; continue; }
      if (ID_START.test(c)) {
        let j = i + 1;
        while (j < end && ID_PART.test(src[j])) j++;
        setPrev({ t: 'word', v: src.slice(i, j) });
        i = j;
        continue;
      }
      if (DIGIT.test(c) || (c === '.' && DIGIT.test(d || ''))) {
        let j = i + 1;
        while (j < end && /[0-9A-Za-z_.]/.test(src[j])) j++;
        setPrev({ t: 'num' });
        i = j;
        continue;
      }
      if ((c === '+' || c === '-') && d === c) { i += 2; setPrev({ t: 'punct', v: c + c }); continue; }
      i++; setPrev({ t: 'punct', v: c });
    }
  }

  if (src.startsWith('#!', i)) while (i < end && !isLineEnd(src[i])) i++;
  readCode(false);
}

/* ───────── HTML：文字節點、可見屬性、inline script ───────── */
const VISIBLE_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'aria-description',
  'aria-roledescription', 'aria-valuetext', 'aria-placeholder', 'label', 'value']);
const META_VISIBLE = new Set(['description', 'application-name', 'apple-mobile-web-app-title',
  'og:title', 'og:description', 'og:site_name', 'twitter:title', 'twitter:description']);
const JS_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript', 'text/ecmascript',
  'application/ecmascript']);
const RCDATA = new Set(['textarea', 'title']); // 內容是純文字（不含標籤）
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ensp: '\u2002', emsp: '\u2003',
  thinsp: '\u2009', hellip: '…', mdash: '—', ndash: '–', middot: '·', bull: '•', times: '×', divide: '÷',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™',
  deg: '°', plusmn: '±', minus: '−', le: '≤', ge: '≥', ne: '≠', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
  harr: '↔', check: '✓', cross: '✗',
};

function decodeEntities(src, a, b) {
  let value = '';
  const map = [];
  for (let i = a; i < b;) {
    if (src[i] === '&') {
      const m = /^&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/.exec(src.slice(i, Math.min(b, i + 40)));
      if (m) {
        const body = m[1];
        let ch = null;
        if (body[0] === '#') {
          const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
          if (cp > 0 && cp <= 0x10ffff) ch = String.fromCodePoint(cp);
        } else if (Object.hasOwn(NAMED_ENTITIES, body)) {
          ch = NAMED_ENTITIES[body];
        }
        if (ch !== null) {
          value += ch;
          for (let k = 0; k < ch.length; k++) map.push(i);
          i += m[0].length;
          continue;
        }
      }
    }
    value += src[i];
    map.push(i);
    i++;
  }
  return { value, map };
}

function parseTag(src, lt) {
  const n = src.length;
  let j = lt + 1;
  const closing = src[j] === '/';
  if (closing) j++;
  const nameStart = j;
  while (j < n && /[A-Za-z0-9:_-]/.test(src[j])) j++;
  const name = src.slice(nameStart, j).toLowerCase();
  const attrs = [];
  while (j < n) {
    const c = src[j];
    if (c === '>') { j++; break; }
    if (/\s/.test(c) || c === '/') { j++; continue; }
    const attrStart = j;
    while (j < n && !/[\s/>=]/.test(src[j])) j++;
    if (j === attrStart) { j++; continue; }
    const attrName = src.slice(attrStart, j).toLowerCase();
    let k = j;
    while (k < n && /\s/.test(src[k])) k++;
    if (src[k] !== '=') { attrs.push({ name: attrName, vs: -1, ve: -1 }); continue; }
    k++;
    while (k < n && /\s/.test(src[k])) k++;
    const q = src[k];
    if (q === '"' || q === "'") {
      const close = src.indexOf(q, k + 1);
      attrs.push({ name: attrName, vs: k + 1, ve: close < 0 ? n : close });
      j = close < 0 ? n : close + 1;
    } else {
      const vs = k;
      while (k < n && !/[\s>]/.test(src[k])) k++;
      attrs.push({ name: attrName, vs, ve: k });
      j = k;
    }
  }
  return { name, closing, attrs, end: j };
}

function scanHtml(src, emit) {
  const n = src.length;
  const emitText = (a, b) => {
    if (b <= a) return;
    const { value, map } = decodeEntities(src, a, b);
    emit({ kind: 'html-text', start: a, end: b, value, map, afterExpr: false });
  };
  const attrText = (tag, name) => {
    const a = tag.attrs.find((x) => x.name === name);
    return a && a.vs >= 0 ? decodeEntities(src, a.vs, a.ve).value : null;
  };
  const findClose = (name, from) => {
    const re = new RegExp(`</${name}(?=[\\s/>])`, 'gi');
    re.lastIndex = from;
    const m = re.exec(src);
    if (!m) return { at: n, after: n };
    const gt = src.indexOf('>', m.index);
    return { at: m.index, after: gt < 0 ? n : gt + 1 };
  };

  let i = 0;
  let textStart = 0;
  for (;;) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { emitText(textStart, n); return; }
    const next = src[lt + 1] || '';
    if (src.startsWith('<!--', lt)) {
      emitText(textStart, lt);
      const close = src.indexOf('-->', lt + 4);
      i = textStart = close < 0 ? n : close + 3;
      continue;
    }
    if (next === '!' || next === '?') { // DOCTYPE、CDATA、處理指令
      emitText(textStart, lt);
      const close = src.indexOf('>', lt);
      i = textStart = close < 0 ? n : close + 1;
      continue;
    }
    const isTag = /[A-Za-z]/.test(next) || (next === '/' && /[A-Za-z]/.test(src[lt + 2] || ''));
    if (!isTag) { i = lt + 1; continue; } // 文字裡的 '<'
    emitText(textStart, lt);
    const tag = parseTag(src, lt);
    i = textStart = tag.end;
    if (tag.closing) continue;

    for (const a of tag.attrs) {
      if (a.vs < 0) continue;
      const metaName = tag.name === 'meta' ? (attrText(tag, 'name') || attrText(tag, 'property') || '').toLowerCase() : '';
      const visible = VISIBLE_ATTRS.has(a.name) || (a.name === 'content' && META_VISIBLE.has(metaName));
      if (!visible) continue;
      const { value, map } = decodeEntities(src, a.vs, a.ve);
      emit({ kind: 'html-attr', attr: a.name, start: a.vs, end: a.ve, value, map, afterExpr: false });
    }

    if (tag.name === 'script') {
      const close = findClose('script', tag.end);
      const type = (attrText(tag, 'type') || '').trim().toLowerCase();
      const hasSrc = tag.attrs.some((x) => x.name === 'src');
      if (!hasSrc && JS_TYPES.has(type)) scanJs(src, tag.end, close.at, emit);
      i = textStart = close.after;
    } else if (tag.name === 'style') {
      i = textStart = findClose('style', tag.end).after;
    } else if (RCDATA.has(tag.name)) {
      const close = findClose(tag.name, tag.end);
      emitText(tag.end, close.at);
      i = textStart = close.after;
    }
  }
}

/* ───────── JSON：只取字串值（後面接 ':' 的是 key，略過） ───────── */
function scanJson(src, emit) {
  scanJs(src, 0, src.length, (s) => {
    if (s.kind !== 'string') return;
    let j = s.end;
    while (j < src.length && isAsciiWs(src[j])) j++;
    if (src[j] !== ':') emit(s);
  });
}

/* ───────── 用語表 ───────── */
function compileGlossary(g) {
  if (!g || !Array.isArray(g.rules) || g.rules.length === 0) throw new Error('缺少 rules 陣列');
  const ids = new Set();
  const rules = g.rules.map((r) => {
    if (!r || typeof r.id !== 'string' || !r.id) throw new Error('有規則缺少 id');
    if (ids.has(r.id)) throw new Error(`規則 id 重複：${r.id}`);
    ids.add(r.id);
    if (typeof r.use !== 'string' || !r.use) throw new Error(`規則 ${r.id} 缺少 use`);
    const hasAvoid = Array.isArray(r.avoid) && r.avoid.length > 0 && r.avoid.every((t) => typeof t === 'string' && t);
    const hasPattern = typeof r.pattern === 'string' && r.pattern.length > 0;
    if (hasAvoid === hasPattern) throw new Error(`規則 ${r.id}：avoid（非空字串陣列）與 pattern 必須二擇一`);
    const extra = String(r.flags || '').replace(/[guy]/g, '');
    const source = hasAvoid ? r.avoid.map(escapeRe).join('|') : r.pattern;
    try {
      return {
        ...r,
        re: new RegExp(source, `gu${extra}`),
        sticky: r.dynamicPrefix ? new RegExp(source, `uy${extra}`) : null,
        unlessRe: r.unless ? new RegExp(r.unless, 'iu') : null,
      };
    } catch (e) {
      throw new Error(`規則 ${r.id} 的 RegExp 無法編譯：${e.message}`);
    }
  });
  const keep = Array.isArray(g.keep) ? g.keep.filter((t) => typeof t === 'string' && t) : [];
  const keepRe = keep.length ? new RegExp(keep.map(escapeRe).join('|'), 'gu') : null;
  return { raw: g, rules, keep, keepRe };
}

// 回傳 [{rule, term, index}]；index 是 text 裡的位置
function matchText(text, afterExpr, G) {
  const masked = G.keepRe ? text.replace(G.keepRe, (m) => '\u0000'.repeat(m.length)) : text; // 保留詞內不判
  const hits = [];
  for (const rule of G.rules) {
    if (rule.unlessRe && rule.unlessRe.test(text)) continue;
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(masked))) {
      if (m[0] === '') { rule.re.lastIndex++; continue; }
      hits.push({ rule, term: m[0], index: m.index });
    }
    if (rule.sticky && afterExpr && !hits.some((h) => h.rule === rule && h.index === 0)) {
      rule.sticky.lastIndex = 0;
      const d = rule.sticky.exec(`0${masked}`); // 前面的運算式當作數字 0
      if (d && d[0].length > 1) hits.push({ rule, term: `N${d[0].slice(1)}`, index: 0 });
    }
  }
  return hits;
}

/* ───────── 掃描 ───────── */
function scanSource(kind, src, file, G) {
  const strings = [];
  const emit = (s) => strings.push(s);
  if (kind === 'html') scanHtml(src, emit);
  else if (kind === 'json') scanJson(src, emit);
  else scanJs(src, 0, src.length, emit);
  const starts = lineStarts(src);
  let candidates = 0;
  const violations = [];
  for (const s of strings) {
    if (!HAN.test(s.value)) continue;
    const { text, tmap } = normalize(s.value, s.map);
    candidates++;
    for (const h of matchText(text, s.afterExpr, G)) {
      const offset = tmap[h.index] ?? s.start;
      const line = lineOf(starts, offset);
      violations.push({ file, line, col: offset - starts[line - 1] + 1, rule: h.rule.id, term: h.term, text,
        index: h.index, use: h.rule.use });
    }
  }
  return { candidates, violations };
}

function collectFiles(root) {
  const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
  const out = [];
  for (const [rel, kind] of [['index.html', 'html'], ['demos.js', 'js']]) {
    if (isFile(path.join(root, rel))) out.push({ rel, kind });
  }
  const walk = (relDir) => {
    for (const d of fs.readdirSync(path.join(root, relDir), { withFileTypes: true })) {
      const rel = `${relDir}/${d.name}`;
      if (d.isDirectory()) walk(rel);
      else if (d.isFile() && /\.m?js$/.test(d.name)) out.push({ rel, kind: 'js' });
    }
  };
  if (isDir(path.join(root, 'js'))) walk('js');
  if (isDir(path.join(root, 'data'))) {
    for (const d of fs.readdirSync(path.join(root, 'data'), { withFileTypes: true })) {
      if (d.isFile() && d.name.endsWith('.json')) out.push({ rel: `data/${d.name}`, kind: 'json' });
    }
  }
  return out.sort((a, b) => cmp(a.rel, b.rel));
}

const cmpViolation = (a, b) => cmp(a.file, b.file) || a.line - b.line || a.col - b.col || cmp(a.rule, b.rule)
  || cmp(a.term, b.term);
const cmpEntry = (a, b) => cmp(a.rule, b.rule) || cmp(a.term, b.term) || cmp(a.text, b.text);
const entryKey = (v) => JSON.stringify([v.rule, v.term, v.text]);

function scanRoot(root, G) {
  const files = collectFiles(root);
  const warnings = [];
  const violations = [];
  let candidates = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f.rel), 'utf8');
    if (f.kind === 'json') {
      try { JSON.parse(src); } catch (e) { warnings.push(`${f.rel} 不是合法 JSON（${e.message}），仍逐字串掃描`); }
    }
    const r = scanSource(f.kind, src, f.rel, G);
    candidates += r.candidates;
    violations.push(...r.violations);
  }
  violations.sort(cmpViolation);
  return { files, candidates, violations, warnings };
}

/* ───────── baseline ───────── */
function gitRev(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

function buildBaseline(scan, root) {
  const unique = new Map();
  for (const v of scan.violations) {
    const k = entryKey(v);
    if (!unique.has(k)) unique.set(k, { rule: v.rule, term: v.term, text: v.text });
  }
  const entries = [...unique.values()].sort(cmpEntry);
  return {
    description: '既有違規清單（以內容比對，不看檔名與行號）。check-glossary.js --ci 只擋不在此清單的違規。'
      + '產生自 M1 對照基準 ec87e03；只能在「新增違規 = 0」時重產（例如 M3 修正後縮小清單），不得用來吸收新增違規。',
    generatedFrom: gitRev(root),
    command: 'node tools/jev/check-glossary.js --write-baseline --root <ec87e03 的 checkout>',
    glossary: 'tools/jev/zh-tw-glossary.json',
    files: scan.files.map((f) => f.rel),
    count: entries.length,
    entries,
  };
}

function loadBaseline(file) {
  if (!fs.existsSync(file)) return { missing: true, entries: [], generatedFrom: null };
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ok = j && Array.isArray(j.entries) && j.entries.every((e) => e && typeof e.rule === 'string'
    && typeof e.term === 'string' && typeof e.text === 'string');
  if (!ok) throw new Error('entries 必須是 {rule, term, text} 陣列');
  return { missing: false, entries: j.entries, generatedFrom: j.generatedFrom || null };
}

/* ───────── 輸出 ───────── */
function snippet(v, max = 80, context = 28) {
  const t = v.text;
  if (t.length <= max) return t;
  const a = Math.max(0, v.index - context);
  const b = Math.min(t.length, v.index + v.term.length + context);
  return `${a > 0 ? '…' : ''}${t.slice(a, b)}${b < t.length ? '…' : ''}`;
}
const mdCode = (s) => {
  const body = s.replace(/\|/g, '\\|');
  return body.includes('`') ? `\`\` ${body} \`\`` : `\`${body}\``;
};
const mdCell = (s) => String(s).replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderReport({ scan, G, baseline, stale }) {
  const fresh = scan.violations.filter((v) => v.isNew);
  const existing = scan.violations.filter((v) => !v.isNew);
  const baselineLabel = baseline.missing
    ? '找不到 baseline 檔，所有違規都視為新增'
    : `產生自 ${baseline.generatedFrom || '未知 commit'}，${baseline.entries.length} 筆`;
  const table = (list) => [
    '| 位置 | 規則（詞） | 字串 | 建議用詞 |',
    '|---|---|---|---|',
    ...list.map((v) => `| \`${v.file}:${v.line}\` | \`${v.rule}\`（${mdCell(v.term)}） | ${mdCode(snippet(v))} | ${mdCell(v.use)} |`),
  ];
  const L = [
    '# 台灣繁中用語表檢查報告',
    '',
    '> **Jev 未執行 —— 本報告為關鍵字規則（tools/jev/zh-tw-glossary.json）**',
    '>',
    `> 規則來源：${G.raw.source || 'CLAUDE.md §11'}｜既有違規 baseline：\`tools/jev/glossary-baseline.json\`（${baselineLabel}）`,
    '>',
    '> 重產：`node tools/jev/check-glossary.js`｜CI：`node tools/jev/check-glossary.js --ci`（新增違規 → exit 1；既有違規只列出、不擋 M1）',
    '',
    '## 摘要',
    '',
    '| 項目 | 數量 |',
    '|---|---:|',
    `| 掃描檔數 | ${scan.files.length} |`,
    `| UI 字串數（含中文字的字串） | ${scan.candidates} |`,
    `| 新增違規（不在 baseline，CI 會擋） | ${fresh.length} |`,
    `| 既有違規（baseline 內，M3 修正） | ${existing.length} |`,
    `| baseline 條目本次未出現 | ${stale.length} |`,
    '',
    `掃描檔案：${scan.files.map((f) => `\`${f.rel}\``).join('、')}`
      + (scan.files.some((f) => f.kind === 'json') ? '' : '（`data/*.json` 尚不存在，略過）'),
    '',
    '## 新增違規',
    '',
    ...(fresh.length ? table(fresh) : ['（無）']),
    '',
    '## 既有違規（M3 修正清單）',
    '',
    'M1 行為零變更，既有畫面的用語只列出、不修改（PLAN.md §3）。',
    '',
    ...(existing.length ? table(existing) : ['（無）']),
    '',
  ];
  if (stale.length) {
    L.push('## baseline 條目本次未出現', '',
      '字串已修正，或內容被改動（若是改動，新版本會出現在「新增違規」）。', '',
      '| 規則（詞） | 字串 |', '|---|---|',
      ...stale.map((e) => `| \`${e.rule}\`（${mdCell(e.term)}） | ${mdCode(snippet({ ...e, index: e.text.indexOf(e.term) }))} |`), '');
  }
  L.push('## 規則清單（CLAUDE.md §11）', '',
    '| id | 不用 | 改用 | 情境 |', '|---|---|---|---|',
    ...G.rules.map((r) => `| \`${r.id}\` | ${mdCell(r.label || (r.avoid || [r.pattern]).join('／'))} | ${mdCell(r.use)} | ${mdCell(r.note || '')} |`),
    '',
    `保留詞（永不判違規）：${G.keep.join('、')}。品牌名詞保留英文：${(G.raw.keepEnglish || []).join('、')}。`,
    '',
    '## 掃描範圍與判定',
    '',
    '- `index.html`：文字節點與可見屬性（placeholder、title、aria-label、alt 等）；inline `<script>` 依 JS 規則掃字串常值；略過 `<style>`、HTML 註解、`<script src>`。',
    '- `demos.js`、`js/` 下的 `.js`：字串常值與 template literal 的靜態片段；略過註解；regex literal 不當字串。',
    '- `data/*.json`：所有字串值（不含 key）。',
    '- 只有含中文字的字串才算 UI 字串；比對前解碼跳脫字元與 HTML 實體，並把連續空白（含換行）壓成一個空格。',
    '- 既有／新增以 `{rule, term, text}`（text = 完整字串）比對，不看檔名與行號：字串搬檔、換行號仍算既有；內容一改就算新增。',
    '');
  return L.join('\n');
}

const ghEscape = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const ghProp = (s) => ghEscape(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

function printViolations(list, annotate) {
  for (const v of list) {
    const shown = snippet(v, 100, 30);
    console.log(`${v.file}:${v.line} ${v.rule}「${v.term}」 ${shown} → ${v.use}`);
    if (annotate) {
      console.log(`::error file=${ghProp(v.file)},line=${v.line},col=${v.col},title=${ghProp(`用語表 ${v.rule}`)}::${ghEscape(`「${v.term}」→ ${v.use}：${shown}`)}`);
    }
  }
}

/* ───────── self-test ───────── */
const SCANNER_CASES = [
  { name: 'N 連：「7 連」算', kind: 'js', src: "const a = '7 連';", expect: ['n-streak:7 連'] },
  { name: 'N 連：「連 3 天」不算', kind: 'js', src: "const a = '睡眠連 3 天 <6 hr';", expect: [] },
  { name: 'N 連：template 的 `${n} 連` 算', kind: 'js', src: 'el.textContent = `${streak} 連`;', expect: ['n-streak:N連'] },
  { name: "N 連：n + ' 連' 算", kind: 'js', src: "el.textContent = state.streak.current + ' 連';", expect: ['n-streak:N連'] },
  { name: "N 連：'字串' + '連…' 不當成數字", kind: 'js', src: "s = '第一名' + '連到下一頁';", expect: [] },
  { name: '註解中的詞不算（// 與 /* */，註解裡有引號也一樣）', kind: 'js',
    src: "// 不要寫 '視頻'\n/* \"撤銷\"、時長 */ const a = '影片'; // it's 散點\nconst b = 1; /* 數據\n '收下' */", expect: [] },
  { name: 'regex literal 內的引號不當字串', kind: 'js', src: "const re = /['\"]/g; const s = '撤銷';", expect: ['undo:撤銷'] },
  { name: 'regex literal：字元類別內的 / 與跳脫的 \\/', kind: 'js',
    src: "const a = /[/'\"]+/, b = /https?:\\/\\//; const s = '設置';", expect: ['settings:設置'] },
  { name: 'regex literal 內的中文不算 UI 字串', kind: 'js', src: "const MAP = [[/數據/, 'k'], [/視頻|散點/, 'v']];", expect: [] },
  { name: 'return 後面的 / 是 regex', kind: 'js', src: "function f(x){ return /'/.test(x) } const s = '收下獎勵';",
    expect: ['receive:收下'] },
  { name: '識別字後面的 / 是除號', kind: 'js', src: "const half = total / 2, label = '撤回' + \"/\";", expect: ['undo:撤回'] },
  { name: ') 後面的 / 是除號', kind: 'js', src: "const r = (a + b) / 2 / c; const s = '視頻';", expect: ['video:視頻'] },
  { name: '} 後面的 / 是 regex', kind: 'js', src: "if (x) {} /撤銷/.test(s); const ok = '影片';", expect: [] },
  { name: 'template literal：靜態片段＋巢狀字串與 template', kind: 'js',
    src: "const t = `已連續 ${n} 天，${ok ? '撤銷' : `視頻 ${x}`}`;", expect: ['undo:撤銷', 'video:視頻'] },
  { name: 'template literal：${} 裡的物件與註解', kind: 'js',
    src: "const t = `${ {a: '收下'}.a /* 散點 */ } 數據`;", expect: ['data:數據', 'receive:收下'] },
  { name: '跳脫字元會解碼', kind: 'js', src: "const a = '\\u8996\\u983b', b = 'it\\'s 設\\u7f6e';",
    expect: ['settings:設置', 'video:視頻'] },
  { name: '不含中文字的字串不檢查', kind: 'js', src: "const a = 'streak', b = \"STREAK 3\", c = `撤銷`.length > 0;",
    expect: ['undo:撤銷'] },
  { name: '保留詞（打卡、保底版、熄燈、復原）不判', kind: 'js',
    src: "const a = '打卡', b = '保底版 · 約 3 分鐘', c = '熄燈', d = '10 秒內可復原';", expect: [] },
  { name: 'HTML：文字、可見屬性、inline script；略過註解、style、data-*、class', kind: 'html',
    src: '<p title="撤銷">設置</p><!-- 視頻 --><script>/* 散點 */ const a = \'時長\';</script>'
      + '<style>.x::after{content:"信息"}</style><input placeholder="收下獎勵"><img alt="錨點">'
      + '<div data-x="數據" class="俯臥撐"></div>',
    expect: ['anchor:錨點', 'duration:時長', 'receive:收下', 'settings:設置', 'undo:撤銷'] },
  { name: 'HTML：<script src> 內容略過、HTML 實體會解碼', kind: 'html',
    src: '<script src="a.js">\'撤銷\'</script><p>&#x8996;&#38971; &amp; 影片</p>', expect: ['video:視頻'] },
  { name: 'JSON：只檢查值、不檢查 key', kind: 'json', src: '{"散點": "視頻", "list": ["收下獎勵", 1, {"k": "數據"}]}',
    expect: ['data:數據', 'receive:收下', 'video:視頻'] },
  { name: '行號：多行 template literal 回報詞所在那一行', kind: 'js', src: 'const t = `第一行\n第二行\n撤銷`;', expectLines: [3] },
  { name: '行號：多行 HTML 文字節點回報詞所在那一行', kind: 'html', src: '<p>\n  第一行，\n  時長在第三行</p>', expectLines: [3] },
  { name: 'baseline：同內容換檔、換行號、換引號仍算既有；新內容算新增',
    fn: (G) => {
      const base = new Set(scanSource('js', "const x = '測驗完成。數據不說謊。';", 'index.html', G).violations.map(entryKey));
      const now = scanSource('js', "\n\n// moved\nexport const y = \"測驗完成。數據不說謊。\";\nconst z = '數據';", 'js/ui/done.js', G).violations;
      const fresh = now.filter((v) => !base.has(entryKey(v)));
      return now.length === 2 && fresh.length === 1 && fresh[0].text === '數據' && fresh[0].line === 5;
    } },
  { name: 'baseline：重新縮排的 HTML 文字仍是同一個鍵',
    fn: (G) => {
      const a = scanSource('html', '<p>時長依等級\n      會變長。</p>', 'index.html', G).violations;
      const b = scanSource('html', '<div>\n  <p>時長依等級\n    會變長。</p>\n</div>', 'index.html', G).violations;
      return a.length === 1 && b.length === 1 && entryKey(a[0]) === entryKey(b[0]);
    } },
];

function runSelfTest(G) {
  const results = [];
  const record = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
  const hits = (kind, src) => scanSource(kind, src, 'self-test', G).violations;
  const fmt = (list) => list.map((v) => `${v.rule}:${v.term}`).sort(cmp);

  for (const rule of G.rules) {
    const bad = (rule.examples && Array.isArray(rule.examples.bad)) ? rule.examples.bad : [];
    const good = (rule.examples && Array.isArray(rule.examples.good)) ? rule.examples.good : [];
    record(`規則 ${rule.id}：至少各 1 個正例與反例`, bad.length > 0 && good.length > 0, `bad ${bad.length}、good ${good.length}`);
    for (const s of bad) {
      const got = hits('js', `x = ${JSON.stringify(s)};`);
      record(`規則 ${rule.id} 正例「${s}」命中`, got.some((v) => v.rule === rule.id), `實際 [${fmt(got).join(', ')}]`);
    }
    for (const s of good) {
      const got = hits('js', `x = ${JSON.stringify(s)};`);
      record(`規則 ${rule.id} 反例「${s}」不命中任何規則`, got.length === 0, `實際 [${fmt(got).join(', ')}]`);
    }
  }
  for (const k of G.keep) {
    const got = hits('js', `x = ${JSON.stringify(k)};`);
    record(`保留詞「${k}」不判違規`, got.length === 0, `實際 [${fmt(got).join(', ')}]`);
  }
  for (const c of SCANNER_CASES) {
    if (c.fn) {
      let ok = false;
      let detail = '回傳 false';
      try { ok = c.fn(G); } catch (e) { detail = e.message; }
      record(c.name, ok, detail);
    } else if (c.expectLines) {
      const lines = hits(c.kind, c.src).map((v) => v.line);
      record(c.name, JSON.stringify(lines) === JSON.stringify(c.expectLines), `期望行號 [${c.expectLines}] 實際 [${lines}]`);
    } else {
      const got = fmt(hits(c.kind, c.src));
      const want = [...c.expect].sort(cmp);
      record(c.name, JSON.stringify(got) === JSON.stringify(want), `期望 [${want.join(', ')}] 實際 [${got.join(', ')}]`);
    }
  }
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  ← ${r.detail}`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n[glossary self-test] ${results.length - failed}/${results.length} 通過`);
  return failed ? 1 : 0;
}

/* ───────── CLI ───────── */
function parseArgs(argv) {
  const o = { ci: false, selfTest: false, writeBaseline: false, help: false, noReport: false,
    root: process.cwd(), report: null, glossary: DEFAULT_GLOSSARY, baseline: DEFAULT_BASELINE };
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    const value = () => {
      const v = argv[++k];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} 需要一個參數`);
      return path.resolve(v);
    };
    switch (a) {
      case '--ci': o.ci = true; break;
      case '--self-test': o.selfTest = true; break;
      case '--write-baseline': o.writeBaseline = true; break;
      case '--no-report': o.noReport = true; break;
      case '--root': o.root = value(); break;
      case '--report': o.report = value(); break;
      case '--glossary': o.glossary = value(); break;
      case '--baseline': o.baseline = value(); break;
      case '-h': case '--help': o.help = true; break;
      default: throw new Error(`未知參數：${a}`);
    }
  }
  if (o.ci && o.writeBaseline) throw new Error('--ci 與 --write-baseline 不能同時使用');
  return o;
}

function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(`[glossary] ${e.message}\n\n${USAGE}`); return 2; }
  if (o.help) { console.log(USAGE); return 0; }

  let G;
  try { G = compileGlossary(JSON.parse(fs.readFileSync(o.glossary, 'utf8'))); } catch (e) {
    console.error(`[glossary] 用語表讀取失敗（${o.glossary}）：${e.message}`);
    return 2;
  }
  if (o.selfTest) return runSelfTest(G);

  let scan;
  try {
    if (!fs.statSync(o.root).isDirectory()) throw new Error('不是資料夾');
    scan = scanRoot(o.root, G);
  } catch (e) {
    console.error(`[glossary] 掃描失敗（${o.root}）：${e.message}`);
    return 2;
  }
  if (scan.files.length === 0) {
    console.error(`[glossary] ${o.root} 找不到可掃描的檔案（index.html、demos.js、js/、data/）`);
    return 2;
  }
  for (const w of scan.warnings) console.error(`[glossary] 警告：${w}`);
  const shownPath = (p) => path.relative(process.cwd(), p) || p;

  if (o.writeBaseline) {
    const out = buildBaseline(scan, o.root);
    fs.mkdirSync(path.dirname(o.baseline), { recursive: true });
    fs.writeFileSync(o.baseline, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`[glossary] baseline 已寫入 ${shownPath(o.baseline)}：${out.count} 筆（來源 ${out.generatedFrom || '未知 commit'}，掃描 ${scan.files.length} 檔）`);
    for (const e of out.entries) console.log(`  ${e.rule}「${e.term}」 ${snippet({ ...e, index: e.text.indexOf(e.term) }, 100, 30)}`);
    return 0;
  }

  let baseline;
  try { baseline = loadBaseline(o.baseline); } catch (e) {
    console.error(`[glossary] baseline 讀取失敗（${o.baseline}）：${e.message}`);
    return 2;
  }
  if (baseline.missing) console.error(`[glossary] 警告：找不到 ${shownPath(o.baseline)}，所有違規都視為新增`);
  const known = new Set(baseline.entries.map(entryKey));
  for (const v of scan.violations) v.isNew = !known.has(entryKey(v));
  const seen = new Set(scan.violations.map(entryKey));
  const stale = baseline.entries.filter((e) => !seen.has(entryKey(e))).sort(cmpEntry);
  const fresh = scan.violations.filter((v) => v.isNew);
  const existingCount = scan.violations.length - fresh.length;

  let reportNote = '';
  if (!o.noReport) {
    const reportPath = o.report || path.join(o.root, REPORT_REL);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, renderReport({ scan, G, baseline, stale }));
    reportNote = `；報告 ${shownPath(reportPath)}`;
  }

  if (fresh.length) {
    console.log(`[glossary] 新增違規 ${fresh.length} 筆（不在 baseline）：`);
    printViolations(fresh, o.ci && process.env.GITHUB_ACTIONS === 'true');
    console.log('[glossary] 請改用建議用詞（tools/jev/zh-tw-glossary.json）；確定是誤判就調整該規則並補 examples，再跑 --self-test。');
  }
  console.log(`[glossary] 掃描 ${scan.files.length} 檔、UI 字串 ${scan.candidates} 筆：新增違規 ${fresh.length}、既有違規 ${existingCount}（不擋）`
    + `、baseline 未出現 ${stale.length}${reportNote}`);
  return o.ci && fresh.length ? 1 : 0;
}

export { scanSource, scanJs, scanHtml, scanJson, compileGlossary, matchText, normalize, entryKey };

const invokedDirectly = (() => {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
