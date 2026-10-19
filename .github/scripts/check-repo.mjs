/* Daily Ten — CI repo 檢查（Orchestrator 維護；零依賴，Node 22）
   1. 失效網址：舊帳號網址出現 0 次（CLAUDE.md、PLAN.md 描述舊網址的說明文字除外）
   2. Service Worker：預快取清單涵蓋所有 App 檔且檔案都存在；本分支相對 main 改了 App 檔時，CACHE 版號必須大於 main 的版號
   3. 前端掃描：App 檔不含 API key 樣式與 AI 端點；外部網址只允許 YouTube 搜尋連結（SVG 命名空間除外）
   用法：node .github/scripts/check-repo.mjs　　失敗時 exit 1 並列出位置。 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execSync } from 'node:child_process';
import { EXERCISE_MEDIA, EXERCISE_STORYBOARDS, isApprovedExerciseMedia } from '../../js/ui/exercise-media.js';

const ROOT = process.cwd();
const BASE_REF = process.env.CHECK_BASE_REF || 'origin/main'; // 比對 CACHE 版號的基準（CI 需 fetch-depth: 0）
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
  /^(css|js)\/.+\.(css|js)$/.test(f) || /^data\/[^/]+\.json$/.test(f) ||
  /^media\/exercises\/[a-z0-9][a-z0-9-]*\.(mp4|webm|png)$/.test(f));
const sw = existsSync(join(ROOT, 'sw.js')) ? read('sw.js') : '';
const cache = (sw.match(/const\s+CACHE\s*=\s*'([^']+)'/) || [])[1];
const cacheNum = Number(((cache || '').match(/^daily-ten-v(\d+)$/) || [])[1]);
if (!cacheNum) fail('sw', `CACHE = ${cache || '（找不到）'}，格式應為 daily-ten-vN`);
const git = (args) => { try { return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const baseSw = git(`show ${BASE_REF}:sw.js`);
const baseNum = baseSw ? Number((baseSw.match(/const\s+CACHE\s*=\s*'daily-ten-v(\d+)'/) || [])[1]) : 0;
const mergeBase = baseSw ? git(`merge-base ${BASE_REF} HEAD`) : null;
// 分支自 merge-base 以來的變更（含尚未 commit 的修改），不含 main 之後的新 commit
const changed = mergeBase ? (git(`diff --name-only ${mergeBase}`) || '').split('\n').filter(Boolean) : [];
const isAppPath = (f) => /^(index\.html|demos\.js|mockup\.html|manifest\.webmanifest|icon-\d+\.png)$/.test(f) || /^(css|js)\//.test(f) || /^data\/[^/]+\.json$/.test(f) || /^media\/exercises\//.test(f);
const appChanged = changed.filter(isAppPath);
if (baseNum && appChanged.length && !(cacheNum > baseNum)) {
  fail('sw', `App 檔有變更（${appChanged.slice(0, 3).join('、')}${appChanged.length > 3 ? '…' : ''}），CACHE 須大於 ${BASE_REF} 的 v${baseNum}（目前 v${cacheNum || '?'}）`);
}
if (!baseSw) console.log(`check-repo：找不到 ${BASE_REF}，略過 CACHE 版號比對`);
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
const approvedPaths = new Set();
const approvedNames = new Set();
for (const entry of EXERCISE_MEDIA) {
  if (!isApprovedExerciseMedia(entry)) { fail('media', '影片核准表有無效或未審核項目'); continue; }
  if (approvedPaths.has(entry.src)) fail('media', `影片重複登錄：${entry.src}`);
  approvedPaths.add(entry.src);
  if (!existsSync(join(ROOT, entry.src))) fail('media', `影片檔案不存在：${entry.src}`);
  if (!assets.includes(entry.src)) fail('media', `影片未加入離線預快取：${entry.src}`);
  for (const name of entry.names) {
    if (approvedNames.has(name)) fail('media', `動作名稱重複對應影片：${name}`);
    approvedNames.add(name);
  }
}
for (const file of files.filter(f => /^media\/exercises\/.*\.(mp4|webm)$/.test(f))) {
  if (!approvedPaths.has(`./${file}`)) fail('media', `未核准的影片不應進入正式 App：${file}`);
}
const storyboardPaths = new Set();
const storyboardEntries = new Map();
const storyboardNames = new Set();
for (const entry of EXERCISE_STORYBOARDS) {
  if (!/^\.\/media\/exercises\/[a-z0-9][a-z0-9-]*\.png$/.test(entry.src) ||
      !Number.isInteger(entry.columns) || entry.columns < 2 ||
      !Number.isInteger(entry.frames) || entry.frames < 8 || entry.frames > entry.columns ** 2 ||
      (entry.frameMs && (!Array.isArray(entry.frameMs) || entry.frameMs.length !== entry.frames ||
        entry.frameMs.some(ms => !Number.isInteger(ms) || ms < 50 || ms > 2000))) ||
      !Array.isArray(entry.names) || !entry.names.length) {
    fail('media', '連續影格登錄資料無效');
    continue;
  }
  const shared = entry.sameMotionAs && storyboardEntries.get(entry.sameMotionAs);
  const explicitTempoVariant = shared && shared.src === entry.src &&
    shared.columns === entry.columns && shared.frames === entry.frames &&
    Array.isArray(shared.frameMs) && Array.isArray(entry.frameMs) &&
    JSON.stringify(shared.frameMs) !== JSON.stringify(entry.frameMs);
  if (entry.sameMotionAs && !explicitTempoVariant) fail('media', `連續影格共用節奏登錄無效：${entry.sameMotionAs}`);
  if (storyboardPaths.has(entry.src) && !explicitTempoVariant) fail('media', `連續影格重複登錄：${entry.src}`);
  storyboardPaths.add(entry.src);
  if (!existsSync(join(ROOT, entry.src))) fail('media', `連續影格檔案不存在：${entry.src}`);
  if (!assets.includes(entry.src)) fail('media', `連續影格未加入離線預快取：${entry.src}`);
  for (const name of entry.names) {
    if (storyboardNames.has(name)) fail('media', `動作名稱重複對應連續影格：${name}`);
    storyboardNames.add(name);
    storyboardEntries.set(name, entry);
  }
}
for (const file of files.filter(f => /^media\/exercises\/.*\.png$/.test(f))) {
  if (!storyboardPaths.has(`./${file}`)) fail('media', `未登錄的連續影格不應進入正式 App：${file}`);
}

/* 2b. Vercel 只上線 App 檔（D24）：.vercelignore 不得排除任何預快取的檔案，否則新網址離線冷啟動會缺檔 */
if (existsSync(join(ROOT, '.vercelignore'))) {
  const patterns = read('.vercelignore').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const toRe = (p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$');
  // gitignore 語意（簡化版）：含「/」的樣式從根目錄比對；不含「/」的樣式比對路徑中的任一層名稱
  const ignored = (rel) => patterns.some((p) => {
    const pat = p.replace(/^\//, '').replace(/^\*\*\//, '').replace(/\/$/, '');
    const re = toRe(pat);
    if (pat.includes('/') || p.startsWith('/')) return re.test(rel) || rel.startsWith(pat + '/');
    return rel.split('/').some((seg) => re.test(seg));
  });
  for (const a of assets) {
    const rel = a.replace(/^\.\//, '');
    if (rel && ignored(rel)) fail('vercel', `.vercelignore 排除了預快取的 ${a}`);
  }
  if (ignored('sw.js')) fail('vercel', '.vercelignore 排除了 ./sw.js（Service Worker 本身）');
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
// D24：App 自己的新網址只准出現在 js/ui/relocate.js 的 NEW_APP_URL（搬家卡的連結，使用者點了才導覽）
const MOVE_FILE = 'js/ui/relocate.js';
const moveUrl = existsSync(join(ROOT, MOVE_FILE)) ? (read(MOVE_FILE).match(/NEW_APP_URL\s*=\s*'(https:\/\/[^']+)'/) || [])[1] : undefined;
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
    if (rel === MOVE_FILE && moveUrl && url === moveUrl) continue;
    fail('frontend', `${rel}:${lineOf(text, m.index)} 外部網址 ${url}`);
  }
}

if (failures.length) {
  console.error(`check-repo：${failures.length} 項未通過`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`check-repo：通過（App 檔 ${appFiles.length} 個、預快取 ${assets.length} 項、CACHE ${cache}${baseNum ? `，main 為 v${baseNum}` : ''}）`);
