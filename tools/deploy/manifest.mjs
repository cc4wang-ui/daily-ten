#!/usr/bin/env node
/* D24：Vercel 部署清單。Vercel 專案沒有連 GitHub（Vercel 的 GitHub 連線綁在另一個帳號），
   所以 merge 到 main 之後由 Claude 用 Vercel 工具上傳。上線的檔案 = sw.js 的 ASSETS ＋ sw.js ＋ vercel.json（與離線預快取同一份清單）。

   用法（在 repo 根目錄）：
     node tools/deploy/manifest.mjs              → JSON：{commit, files:[{file, sha, size}]}，給 create_deployment 的 files（用 sha 參照）
     node tools/deploy/manifest.mjs --base64 F   → 印出檔案 F 的 base64，給 upload_file（只上傳 Vercel 回報缺少的檔案）
   流程與檢查見 docs/DEPLOY.md。 */
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const sw = readFileSync('sw.js', 'utf8');
const block = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
if (!block) { console.error('sw.js 找不到 ASSETS'); process.exit(1); }
const assets = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((a) => a !== './').map((a) => a.replace(/^\.\//, ''));
const files = [...new Set([...assets, 'sw.js', 'vercel.json'])];

const args = process.argv.slice(2);
if (args[0] === '--base64') {
  const f = args[1];
  if (!files.includes(f)) { console.error(`${f} 不在部署清單`); process.exit(1); }
  process.stdout.write(readFileSync(f).toString('base64'));
  process.exit(0);
}

let commit = null;
try { commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch (e) { /* 不在 git 裡也能用 */ }
const out = files.map((file) => {
  const buf = readFileSync(file);
  return { file, sha: createHash('sha1').update(buf).digest('hex'), size: statSync(file).size };
});
console.log(JSON.stringify({ commit, files: out }, null, 2));
