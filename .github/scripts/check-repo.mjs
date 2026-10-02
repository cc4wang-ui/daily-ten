/* Daily Ten — CI repo 檢查（Orchestrator 維護；零依賴，Node 22）
   1. 失效網址：舊帳號網址出現 0 次（CLAUDE.md、PLAN.md 描述舊網址的說明文字除外）
   2. Service Worker：CACHE 版號 = 期望值；預快取清單涵蓋所有 App 檔，且清單內檔案都存在
   3. 前端掃描：App 檔不含 API key 樣式與 AI 端點；外部網址只允許 YouTube 搜尋連結（SVG 命名空間除外）
   用法：node .github/scripts/check-repo.mjs　　失敗時 exit 1 並列出位置。 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const EXPECTED_CACHE = 'daily-ten-v7';
const OLD_OWNER = ['crosswang', 'collab'].join('-'); // 拆開寫，本檔自己不算一次
const OLD_OWNER_ALLOW = new Set(['CLAUDE.md', 'PLAN.md']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'test-results', 'playwright-report', 'blob-report']);
const TEXT_EXT = new Set(['.md', '.js', '.mjs', '.cjs', '.html', '.css', '.json', '.yml', '.yaml', '.webmanifest', '.txt', '.svg']);

const failures = [];
const fail = (check, msg) => failures.push(`[${check}] ${msg}`);

function walk(dir, out = []) {
  for (const ent of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const rel = dir ? `${dir}/${ent.name}` : ent.name;
    if (ent.isDirectory()) walk(rel, out);
    else if (ent.isFile()) out.push(rel);
  }
  return out;
}
const files = walk('');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/* 1. 失效網址 */
for (const rel of files) {
  if (!TEXT_EXT.has(extname(rel)) || OLD_OWNER_ALLOW.has(rel)) continue;
  const text = read(rel);
  let i = text.indexOf(OLD_OWNER);
  while (i >= 0) {
    fail('dead-url', `${rel}:${lineOf(text, i)} 仍含舊帳號網址`);
    i = text.indexOf(OLD_OWNER, i + 1);
  }
}

/* 2. Service Worker 版號與預快取 */
const appFiles = files.filter((f) =>
  ['index.html', 'demos.js', 'mockup.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'].includes(f) ||
  /^(css|js)\/.+\.(css|js)$/.test(f) || /^data\/[^/]+\.json$/.test(f));
const sw = existsSync(join(ROOT, 'sw.js')) ? read('sw.js') : '';
const cache = (sw.match(/const\s+CACHE\s*=\s*'([^']+)'/) || [])[1];
if (cache !== EXPECTED_CACHE) fail('sw', `CACHE = ${cache || '（找不到）'}，期望 ${EXPECTED_CACHE}`);
const assetsBlock = (sw.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
const assets = [...assetsBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (!assets.includes('./')) fail('sw', "預快取清單缺 './'");
for (const f of appFiles) if (!assets.includes(`./${f}`)) fail('sw', `預快取清單缺 ./${f}`);
for (const a of assets) {
  if (a === './') continue;
  const rel = a.replace(/^\.\//, '');
  if (!existsSync(join(ROOT, rel))) fail('sw', `預快取清單的 ${a} 不存在`);
  else if (!appFiles.includes(rel)) fail('sw', `預快取清單的 ${a} 不是 App 檔（測試／工具檔不應快取）`);
}

/* 3. 前端掃描 */
const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_-]{16,}/, 'API key 樣式（sk-）'],
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key 樣式'],
  [/\b(?:api[_-]?key|secret|access[_-]?token)\b\s*[:=]\s*['"`][^'"`]{8,}/i, '疑似寫死的金鑰'],
  [/Bearer\s+[A-Za-z0-9._-]{16,}/, 'Bearer token'],
  [/TYPESAFE_API_KEY/, 'TYPESAFE_API_KEY 出現在前端'],
  [/api\.openai\.com|api\.anthropic\.com|typesafe\.ai|generativelanguage\.googleapis\.com/i, 'AI 端點']
];
const frontFiles = [...appFiles, 'sw.js'].filter((f) => f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.css') || f.endsWith('.json') || f.endsWith('.webmanifest'));
for (const rel of frontFiles) {
  const text = read(rel);
  for (const [re, label] of SECRET_PATTERNS) {
    const m = text.match(re);
    if (m) fail('frontend', `${rel}:${lineOf(text, m.index)} ${label}`);
  }
  for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
    const url = m[0];
    if (url.startsWith('https://www.youtube.com/results?search_query=')) continue;
    if (url.startsWith('http://www.w3.org/')) continue; // SVG／XML 命名空間，不是網路請求
    fail('frontend', `${rel}:${lineOf(text, m.index)} 外部網址 ${url}`);
  }
}

if (failures.length) {
  console.error(`check-repo：${failures.length} 項未通過`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`check-repo：通過（App 檔 ${appFiles.length} 個、預快取 ${assets.length} 項、CACHE ${cache}）`);
