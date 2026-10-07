/* game-designer：90 天平衡模擬（tools/sim）測試——CLI 離線跑完、判準全過、決定性、模擬用的就是真的 engine（純 Node） */
import { test, expect } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PERSONAS, CRITERIA, CHECKPOINTS, simulate, runAll, loadRules, plusDays, START } from '../tools/sim/lib.mjs';
import { todaySummary } from '../js/game/engine.js';
import { useTZ, readSource } from './game.helpers.js';

useTZ(test);
const ROOT = fileURLToPath(new URL('..', import.meta.url));

test.describe('tools/sim：90 天三人設', () => {
  test.describe.configure({ timeout: 120_000 });

  test('CLI：在 repo 根目錄離線執行 → exit 0、印出人設與結果表、10 條判準全部 PASS', () => {
    const r = spawnSync(process.execPath, ['tools/sim/run.mjs'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const out = r.stdout;
    for (const name of ['認真', '普通', '常中斷']) expect(out).toContain(`| ${name} |`);
    expect(out).toContain('| 人設 | Lv@7 | Lv@14 | Lv@30 | Lv@60 | Lv@90 |');
    expect(out).toMatch(/Perfect Day／週/);
    expect(out).toMatch(/Freeze 用／得/);
    expect(out).toMatch(/回歸徽章 \| 加成/);
    expect((out.match(/^- PASS C\d+ /gm) || []).length).toBe(CRITERIA.length);
    expect(out).not.toMatch(/^- FAIL/m);
    expect(out).toContain('結果：全部判準通過');
  });

  test('CLI：參數錯誤、規則檔讀不到 → exit 2', () => {
    for (const extra of [['--seeds', '0'], ['--days', '30'], ['--rules'], ['--rules', 'no/such/file.json']]) {
      const r = spawnSync(process.execPath, ['tools/sim/run.mjs', ...extra], { cwd: ROOT, encoding: 'utf8' });
      expect(r.status, extra.join(' ')).toBe(2);
    }
  });

  test('任何判準失敗 → CLI exit 1：等級曲線改到很平（base 20、step 5）→ C4、C6 FAIL', ({}, testInfo) => {
    const flat = JSON.parse(readSource('data/game.json'));
    flat.level = { base: 20, step: 5 };
    const file = testInfo.outputPath('flat-rules.json');
    writeFileSync(file, JSON.stringify(flat));
    const r = spawnSync(process.execPath, ['tools/sim/run.mjs', '--seeds', '6', '--rules', file], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toMatch(/^- FAIL C4 /m);
    expect(r.stdout).toMatch(/^- FAIL C6 /m);
    expect(r.stdout).toMatch(/結果：.*C4.*未通過/);
    const res = runAll({ seeds: 6, rules: loadRules(file) });
    expect(res.ok).toBe(false);
  });

  test('決定性：同一個人設與種子 → 完全相同的結果；不同種子 → 不同的出席', () => {
    const a = simulate(PERSONAS[1], 7);
    const b = simulate(PERSONAS[1], 7);
    expect(a).toEqual(b);
    const c = simulate(PERSONAS[1], 8);
    expect(c.daily.map((d) => d.total)).not.toEqual(a.daily.map((d) => d.total));
  });

  test('逐日指標來自真的 engine：第 90 天的總 XP、等級、Perfect Day 次數與重算 todaySummary 一致', () => {
    const run = simulate(PERSONAS[0], 3);
    expect(run.daily).toHaveLength(90);
    expect(run.daily[0].date).toBe(START);
    expect(run.daily[89].date).toBe(plusDays(START, 89));
    for (const c of CHECKPOINTS) expect(run.lv[c]).toBe(run.daily[c - 1].lv);
    expect(run.total).toBe(run.daily[89].total);
    expect(run.perfectDays).toBe(run.daily.filter((d) => d.pd).length);
    expect(run.violations).toEqual([]);
    /* 每天的總 XP 不下降 */
    for (let i = 1; i < 90; i++) expect(run.daily[i].total).toBeGreaterThanOrEqual(run.daily[i - 1].total);
    expect(typeof todaySummary).toBe('function');
  });

  test('人設參數：出席率 90%／65%／35%，常中斷的「不在」比較長', () => {
    expect(PERSONAS.map((p) => [p.name, p.attendance])).toEqual([['認真', 0.9], ['普通', 0.65], ['常中斷', 0.35]]);
    expect(PERSONAS[2].awayRun).toBeGreaterThan(PERSONAS[1].awayRun);
    expect(PERSONAS[1].awayRun).toBeGreaterThan(PERSONAS[0].awayRun);
  });

  test('sim 只用 Node 內建模組與 repo 檔案：不連網、不讀時鐘、不用 Math.random、不寫檔', () => {
    for (const file of ['tools/sim/lib.mjs', 'tools/sim/run.mjs']) {
      const code = readSource(file).replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code).not.toMatch(/\bfetch\s*\(|https?:\/\/|\bMath\.random\b|\bDate\.now\s*\(|new\s+Date\s*\(\s*\)|writeFile|appendFile/);
      for (const m of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) expect(m[1]).toMatch(/^(node:|\.{1,2}\/)/);
    }
    expect(execFileSync(process.execPath, ['-e', 'process.exit(0)'])).toBeDefined();
  });
});
