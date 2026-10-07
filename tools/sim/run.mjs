#!/usr/bin/env node
/* Daily Ten — 90 天平衡模擬 CLI（擁有者：game-designer）。在 repo 根目錄執行，純 Node、離線、決定性：
     node tools/sim/run.mjs                 三種人設 × 60 份種子，印出表格與判準，任何判準失敗 → exit 1
     node tools/sim/run.mjs --seeds 200     種子份數（越多越穩定、越慢）
     node tools/sim/run.mjs --json          另外印出 JSON（給其他工具讀）
     node tools/sim/run.mjs --rules <檔案>  用另一份規則檔試算（候選數值；預設 data/game.json）
   只印到 stdout，不寫任何檔案。人設參數與判準在 tools/sim/lib.mjs，規則數值一律讀 data/game.json。 */
process.env.TZ = 'Asia/Tokyo'; // 模擬的紀錄都是 +09:00；遊戲日依「當地時間」換日

const { runAll, loadRules, PERSONAS, CHECKPOINTS, P2_WHAT_IF } = await import('./lib.mjs');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? Number(args[i + 1]) : def;
};
const seeds = opt('--seeds', 60);
const days = opt('--days', 90);
const rulesAt = args.indexOf('--rules');
const rulesPath = rulesAt >= 0 ? args[rulesAt + 1] : undefined;
if (!Number.isInteger(seeds) || seeds < 1 || !Number.isInteger(days) || days < 90 || (rulesAt >= 0 && !rulesPath)) {
  console.error('用法：node tools/sim/run.mjs [--seeds N≥1] [--days N≥90] [--rules <規則檔>] [--json]');
  process.exit(2);
}
const rules = rulesPath ? loadRules(rulesPath) : loadRules();
if (!rules) {
  console.error(`規則檔無法讀取或格式不符：${rulesPath || 'data/game.json'}`);
  process.exit(2);
}

const t0 = process.hrtime.bigint();
const res = runAll({ seeds, days, rules });
const ms = Number((process.hrtime.bigint() - t0) / 1000000n);

const pct = (x) => `${Math.round(x * 100)}%`;
const n1 = (x) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toString() : '—');
const lvCell = (r, c) => `${n1(r.lv[c])}`;

const out = [];
out.push(`# Daily Ten 90 天平衡模擬（${res.seeds} 份種子／人設，中位數；${ms} ms）`);
out.push('');
out.push('## 人設');
out.push('| 人設 | 出席（目標） | 實際：動／眠 | 不在時平均連續 | 起床在時段內 | 熄燈在時段內 | 保底／主課表／加一輪 |');
out.push('|---|---|---|---|---|---|---|');
for (const p of PERSONAS) {
  const r = res.rows.find((x) => x.key === p.key);
  out.push(`| ${p.name} | ${pct(p.attendance)} | ${pct(r.moveRate)}／${pct(r.sleepRate)} | ${p.awayRun} 天 | ${pct(p.wake.in)} | ${pct(p.lightsOut.in)} | ${pct(p.tiers.minimal)}／${pct(p.tiers.main)}／${pct(p.tiers.plus)} |`);
}
out.push('');
out.push('## 結果');
out.push(`| 人設 | ${CHECKPOINTS.map((c) => `Lv@${c}`).join(' | ')} | 90 天 XP | bonus 佔比 | Perfect Day／週 | Freeze 用／得 | 回歸徽章 | 加成 | P2 條件達成日 | 降量日 | 最長未升級 |`);
out.push(`|---|${CHECKPOINTS.map(() => '---').join('|')}|---|---|---|---|---|---|---|---|---|`);
for (const r of res.rows) {
  const p2 = Number.isFinite(r.p2Day) ? `第 ${n1(r.p2Day)} 天（${pct(r.p2Within90)} 達成）` : `90 天內未達成（${pct(r.p2Within90)} 達成）`;
  out.push(`| ${r.name} | ${CHECKPOINTS.map((c) => lvCell(r, c)).join(' | ')} | ${Math.round(r.xp90)} | ${pct(r.bonusShare)} | ${n1(r.pdPerWeek)} | ${n1(r.freezeUsed)}／${n1(r.freezeEarned)} | ${n1(r.returns)} | ${n1(r.boosts)} | ${p2} | ${n1(r.deloadDays)} | ${n1(r.plateau)} 天 |`);
}
out.push('');
out.push('第 10 百分位等級（運氣差的一份）：' + res.rows.map((r) => `${r.name} ${CHECKPOINTS.map((c) => r.lvP10[c]).join('／')}`).join('；'));
out.push('每個出席日的平均 XP（額外 XP 倍率＝總 XP ÷ 基礎 XP）：' + res.rows.map((r) => `${r.name} ${Math.round(r.xpPerActiveDay)}（×${r.bonusMultiplier.toFixed(2)}）`).join('；'));
out.push('');
out.push('## 提案（不改數值，供 Cross 決定）');
out.push('P1→P2 門檻「近 14 天起床在時段內 k 天」：中位數達成日（90 天內達成比例）');
out.push(`| 人設 | ${P2_WHAT_IF.map((k) => `k=${k}${k === 10 ? '（目前）' : ''}`).join(' | ')} |`);
out.push(`|---|${P2_WHAT_IF.map(() => '---').join('|')}|`);
for (const r of res.rows) {
  out.push(`| ${r.name} | ${P2_WHAT_IF.map((k) => {
    const w = r.p2What[k];
    return `${Number.isFinite(w.day) ? `第 ${n1(w.day)} 天` : '未達成'}（${pct(w.within90)}）`;
  }).join(' | ')} |`);
}
out.push('等級曲線：維持 200 + 50 ×（等級 − 1）。加陡會讓現有等級倒退（XP 由紀錄推導），要調只能分段生效。');
out.push('');
out.push('## 判準');
for (const c of res.criteria) out.push(`- ${c.pass ? 'PASS' : 'FAIL'} ${c.id} ${c.text}`);
const violations = res.rows.flatMap((r) => r.violations);
if (violations.length) {
  out.push('');
  out.push('## 不變量違反（前 20 筆）');
  for (const v of violations.slice(0, 20)) out.push(`- ${v}`);
}
out.push('');
out.push(res.ok ? '結果：全部判準通過' : `結果：${res.criteria.filter((c) => !c.pass).map((c) => c.id).join('、')} 未通過`);
console.log(out.join('\n'));

if (args.includes('--json')) {
  console.log(JSON.stringify({ seeds: res.seeds, days: res.days, rows: res.rows, criteria: res.criteria, ok: res.ok }, null, 2));
}
process.exit(res.ok ? 0 : 1);
