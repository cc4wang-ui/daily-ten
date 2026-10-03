/* qa-checker：CI 的 check-repo 規則（.github/scripts/check-repo.mjs）——「改了 App 檔，CACHE 就必須大於 origin/main 的版號」。
   不碰真的 repo：在暫存目錄建一個獨立的 git repo，內容 = origin/main 的樹（git archive），並把那個 commit 設成
   refs/remotes/origin/main；再開分支做各種變更，用「目前分支的 check-repo.mjs」檢查它（cwd = 暫存 repo）。
   另外對目前的樹跑一次：應通過，並顯示 main 的版號（讀 origin/main 的 sw.js，不寫死）。
   沒有 git 或沒有 origin/main（例如淺層 clone）時略過。 */
import { test, expect } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(REPO, '.github/scripts/check-repo.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const cacheOf = (text) => Number(((text || '').match(/const\s+CACHE\s*=\s*'daily-ten-v(\d+)'/) || [])[1]) || 0;

let mainSw = null;
try { mainSw = git(REPO, 'show', 'origin/main:sw.js'); } catch { mainSw = null; }
const MAIN_N = cacheOf(mainSw);

function run(cwd, env = {}) {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}`.trim() };
}

/* 暫存 repo：base commit = origin/main 的樹；在 feature 分支上 */
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'daily-ten-check-repo-'));
  const tar = execFileSync('git', ['archive', '--format=tar', 'origin/main'], { cwd: REPO, maxBuffer: 256 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar });
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'qa@example.invalid');
  git(dir, 'config', 'user.name', 'qa');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'main');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(dir, 'checkout', '-q', '-b', 'feature');
  return dir;
}
const setCache = (dir, n) => {
  const p = join(dir, 'sw.js');
  writeFileSync(p, readFileSync(p, 'utf8').replace(/const\s+CACHE\s*=\s*'[^']+'/, `const CACHE = 'daily-ten-v${n}'`));
};
const touch = (dir, rel) => appendFileSync(join(dir, rel), rel.endsWith('.webmanifest') ? '\n' : '\n/* qa: touched */\n');

test.describe('check-repo：CACHE 版號規則', () => {
  test.skip(!mainSw, '找不到 origin/main（需要 fetch-depth: 0），略過');
  let dir = null;
  test.beforeEach(() => { dir = makeRepo(); });
  test.afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = null; });

  test('沒有變更：通過，顯示 main 的版號', () => {
    const r = run(dir);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(`CACHE daily-ten-v${MAIN_N}，main 為 v${MAIN_N}`);
  });

  test('改一個 App 檔、CACHE 不升 → exit 1 並說明原因；升 1 版 → exit 0', () => {
    touch(dir, 'js/ui/home.js');
    let r = run(dir);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain(`App 檔有變更（js/ui/home.js），CACHE 須大於 origin/main 的 v${MAIN_N}（目前 v${MAIN_N}）`);
    setCache(dir, MAIN_N + 1);
    r = run(dir);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(`CACHE daily-ten-v${MAIN_N + 1}，main 為 v${MAIN_N}`);
  });

  for (const rel of ['index.html', 'css/app.css', 'css/tokens.css', 'demos.js', 'mockup.html', 'manifest.webmanifest', 'js/app.js', 'js/state/store.js']) {
    test(`App 檔 ${rel} 有變更、CACHE 不升 → exit 1`, () => {
      touch(dir, rel);
      const r = run(dir);
      expect(r.code, r.out).toBe(1);
      expect(r.out).toContain(`App 檔有變更（${rel}）`);
    });
  }

  test('只改非 App 檔（README、tests、CI、工具）不升版 → exit 0', () => {
    for (const rel of ['README.md', 'tests/e2e/helpers.js', '.github/workflows/ci.yml', 'tools/serve.mjs', 'PROJECT_STATE.md']) touch(dir, rel);
    const r = run(dir);
    expect(r.code, r.out).toBe(0);
  });

  test('CACHE 比 main 小（或相同）→ exit 1；已 commit 的變更一樣算', () => {
    touch(dir, 'js/ui/home.js');
    setCache(dir, MAIN_N - 1);
    let r = run(dir);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain(`（目前 v${MAIN_N - 1}）`);
    setCache(dir, MAIN_N + 1);
    git(dir, 'commit', '-q', '-am', 'feature: app change + bump');
    r = run(dir);
    expect(r.code, r.out).toBe(0);
    setCache(dir, MAIN_N);
    git(dir, 'commit', '-q', '-am', 'feature: revert bump');
    r = run(dir);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('js/ui/home.js');
  });

  test('main 在分岔後前進：main 之後的新 commit 不算本分支的變更；但本分支的版號必須大於 main 目前的版號', () => {
    /* main 前進：改 App 檔並升到 N+1 */
    git(dir, 'checkout', '-q', 'origin/main');
    touch(dir, 'js/ui/body.js');
    setCache(dir, MAIN_N + 1);
    git(dir, 'commit', '-q', '-am', 'main: next release');
    git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(dir, 'checkout', '-q', 'feature');
    /* 本分支沒改 App 檔（CACHE 仍是舊的 N）→ 通過 */
    let r = run(dir);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(`main 為 v${MAIN_N + 1}`);
    /* 本分支也改 App 檔、升到 N+1（與 main 相同）→ 不通過，要再升 */
    touch(dir, 'js/ui/home.js');
    setCache(dir, MAIN_N + 1);
    r = run(dir);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain(`CACHE 須大於 origin/main 的 v${MAIN_N + 1}`);
    setCache(dir, MAIN_N + 2);
    r = run(dir);
    expect(r.code, r.out).toBe(0);
  });

  test('找不到比對基準（沒有 origin/main）→ 印出略過說明、其餘檢查照跑（exit 0）；CHECK_BASE_REF 可改用別的基準', () => {
    git(dir, 'branch', 'base', 'origin/main');
    git(dir, 'update-ref', '-d', 'refs/remotes/origin/main');
    touch(dir, 'js/ui/home.js');
    let r = run(dir);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('找不到 origin/main，略過 CACHE 版號比對');
    r = run(dir, { CHECK_BASE_REF: 'base' });
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain(`CACHE 須大於 base 的 v${MAIN_N}`);
    setCache(dir, MAIN_N + 1);
    r = run(dir, { CHECK_BASE_REF: 'base' });
    expect(r.code, r.out).toBe(0);
  });
});

test('目前的樹：check-repo 通過，並顯示 main 的版號（讀 origin/main，不寫死）', () => {
  test.skip(!mainSw, '找不到 origin/main，略過');
  const r = run(REPO);
  expect(r.code, r.out).toBe(0);
  const curN = cacheOf(readFileSync(join(REPO, 'sw.js'), 'utf8'));
  expect(r.out).toMatch(new RegExp(`^check-repo：通過（App 檔 \\d+ 個、預快取 \\d+ 項、CACHE daily-ten-v${curN}，main 為 v${MAIN_N}）$`, 'm'));
  console.log(`[qa] ${r.out.split('\n').pop()}`);
});
