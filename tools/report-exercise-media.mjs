/* Enumerate the exact names sent to in-app help from every current plan variant.
   Coverage is informational while this PR is a draft; --ci guards report drift
   and rejects stale/invalid mappings without pretending missing clips are safe. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { defaultState } from '../js/state/schema.js';
import { setState } from '../js/state/store.js';
import { DOW, WEEK, planSeq, minimalSeq, rainSeq } from '../js/ui/program.js';
import { EXERCISE_MEDIA, EXERCISE_STORYBOARDS, getApprovedExerciseMedia, getExerciseStoryboard, isApprovedExerciseMedia } from '../js/ui/exercise-media.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = join(ROOT, 'reports/exercise-media-coverage.md');
const NON_MOVEMENTS = new Set(['休息', '組間休息', '換組']);
const contexts = new Map();
function collect(seq, label) {
  for (const step of seq) {
    if (NON_MOVEMENTS.has(step.name)) continue;
    if (!contexts.has(step.name)) contexts.set(step.name, new Set());
    contexts.get(step.name).add(label);
  }
}

for (const band of [true, false]) {
  const state = defaultState(new Date('2026-10-12T12:00:00Z'));
  state.settings.band = band;
  setState(state);
  const gear = band ? '彈力帶' : '無帶';
  for (let level = 1; level <= 5; level++) {
    for (let day = 0; day < WEEK.length; day++)
      collect(planSeq(WEEK[day], level), `${gear}／週${DOW[day]}`);
    collect(minimalSeq(level), `${gear}／保底`);
    collect(rainSeq(), `${gear}／雨天`);
  }
}
/* Boss measurements are rendered outside planSeq; they still need exact media. */
for (const name of ['HRP 伏地挺身測驗', '平板支撐測驗', '2 英里跑'])
  contexts.set(name, new Set(['Boss 測驗']));

const failures = [];
const inventory = [...contexts.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
const approvedNames = new Map();
for (const entry of EXERCISE_MEDIA) {
  if (!isApprovedExerciseMedia(entry)) {
    failures.push('核准表含無效或未審核影片');
    continue;
  }
  if (!existsSync(join(ROOT, entry.src))) failures.push(`找不到影片：${entry.src}`);
  for (const name of entry.names) {
    if (!contexts.has(name)) failures.push(`核准表名稱已不在課表：${name}`);
    if (approvedNames.has(name)) failures.push(`同一名稱對應多片：${name}`);
    approvedNames.set(name, entry);
  }
}

const covered = inventory.filter(name => getApprovedExerciseMedia(name)).length;
const storyboardCovered = inventory.filter(name => getExerciseStoryboard(name)).length;
for (const entry of EXERCISE_STORYBOARDS) {
  for (const name of entry.names) if (!contexts.has(name) && name !== '伏地挺身' && name !== '控制深蹲' && name !== '臀橋' && name !== '彈力帶划船')
    failures.push(`連續影格名稱已不在課表：${name}`);
}
const lines = [
  '# 動作影片精確名稱覆蓋清單',
  '',
  '> 由 `node tools/report-exercise-media.mjs --write` 產生。這是素材製作與審核清單，不是動作品質認證。',
  '',
  `目前課表與 Boss 共 **${inventory.length} 個精確名稱**；完整本機影片 **${covered}**，AI 16 格連續影格 **${storyboardCovered}**，兩者都沒有的名稱 **${inventory.length - covered - storyboardCovered}**。不同組數、左右側與阻力變式只有逐一核對後才能共用同一份素材。`,
  '',
  '| 課表顯示的精確名稱 | 出現處 | 完整本機影片 | 16 格連續影格 |',
  '| --- | --- | --- | --- |'
];
for (const name of inventory) {
  const places = [...contexts.get(name)].sort().join('、');
  const entry = getApprovedExerciseMedia(name);
  const storyboard = getExerciseStoryboard(name);
  lines.push(`| ${name} | ${places} | ${entry ? entry.src : '—'} | ${storyboard ? storyboard.src : '—'} |`);
}
lines.push('', '未對應的動作仍顯示缺片。連續影格是 AI 生成的順序圖，不等於完整影片；發佈時須如實標示覆蓋率。', '');
const output = lines.join('\n');

if (process.argv.includes('--write')) {
  writeFileSync(REPORT, output);
} else if (process.argv.includes('--ci')) {
  if (!existsSync(REPORT) || readFileSync(REPORT, 'utf8') !== output)
    failures.push('reports/exercise-media-coverage.md 與目前課表不同；請執行 npm run report:media');
} else {
  process.stdout.write(output);
}
if (failures.length) {
  for (const failure of failures) console.error(`[exercise-media] ${failure}`);
  process.exitCode = 1;
} else if (process.argv.includes('--ci')) {
  console.log(`[exercise-media] 清單一致；精確名稱 ${inventory.length}、完整影片 ${covered}、連續影格 ${storyboardCovered}、無示範 ${inventory.length - covered - storyboardCovered}`);
}
