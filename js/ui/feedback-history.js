/* Daily Ten — 每組回報的唯讀檢視。只讀既有回報／完成日，不改 state、XP 或課表。
   同日依原陣列後到先顯示；僅九種支援工作組去組號，其他名稱精確比對。 */
import { getState } from '../state/store.js';
import { canonicalMovement } from '../game/training-progression.js';
import { $ } from './dom.js';
import { goTo } from './nav.js';
import { todayKey } from './game.js';
import { dateOffset } from './dates.js';

const INITIAL = 10, MORE = 20, MAX = 2000;
const EFFORT = { easy: '輕鬆', okay: '剛好', hard: '吃力' };
let movement = '', range = '28', limit = INITIAL;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validReport(record) {
  return record && typeof record === 'object' && validDate(record.date)
    && typeof record.id === 'string' && record.id.length > 0 && [...record.id].length <= 60
    && typeof record.name === 'string' && record.name.length > 0 && [...record.name].length <= 500
    && Number.isInteger(record.target) && record.target >= 1 && record.target <= 999
    && Number.isInteger(record.actual) && record.actual >= 0 && record.actual <= 999
    && typeof record.effort === 'string' && Object.hasOwn(EFFORT, record.effort)
    && typeof record.form === 'boolean' && typeof record.pain === 'boolean'
    && (!Object.hasOwn(record, 'resistance') || (typeof record.resistance === 'string'
      && record.resistance.trim().length > 0 && [...record.resistance].length <= 40));
}

function movementOf(name) { return canonicalMovement(name) || name; }

function reports(state) {
  const feedback = state?.game?.trainingFeedback;
  return (Array.isArray(feedback) ? feedback.slice(-MAX) : [])
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => validReport(record))
    .sort((a, b) => b.record.date.localeCompare(a.record.date) || b.index - a.index);
}

function appendText(parent, tag, className, value) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  parent.append(node);
  return node;
}

export function renderFeedbackHistory() {
  const section = $('hist-feedback');
  if (!section) return;
  const state = getState(), history = reports(state), select = $('hist-feedback-movement');
  const names = [...new Set(history.map(({ record }) => movementOf(record.name)))];
  // A target-card route remains useful even before its first report.
  if (movement && !names.includes(movement)) names.push(movement);
  select.replaceChildren();
  const all = document.createElement('option');
  all.value = ''; all.textContent = '全部動作'; select.append(all);
  for (const name of names) {
    const option = document.createElement('option');
    option.value = name; option.textContent = name; select.append(option);
  }
  select.value = movement;
  $('hist-feedback-range').value = range;
  select.onchange = () => { movement = select.value; limit = INITIAL; renderFeedbackHistory(); };
  $('hist-feedback-range').onchange = event => {
    range = event.target.value === 'all' ? 'all' : '28'; limit = INITIAL; renderFeedbackHistory();
  };
  const today = todayKey(), since = dateOffset(today, -27);
  const filtered = history.filter(({ record }) => (!movement || movementOf(record.name) === movement)
    && (range === 'all' || (record.date >= since && record.date <= today)));
  const list = $('hist-feedback-list');
  list.replaceChildren();
  const completeDates = new Set((Array.isArray(state?.sessions) ? state.sessions : [])
    .filter(session => session && validDate(session.date) && ['full', 'cycle'].includes(session.type))
    .map(session => session.date));
  for (const { record } of filtered.slice(0, limit)) {
    const row = document.createElement('li');
    row.dataset.date = record.date;
    row.dataset.movement = movementOf(record.name);
    appendText(row, 'p', 'feedback-date num', record.date);
    appendText(row, 'h4', 'feedback-name', record.name);
    appendText(row, 'p', 'feedback-dose num', `實際 ${record.actual} 下／目標 ${record.target} 下`);
    appendText(row, 'p', 'feedback-detail', `感受：${EFFORT[record.effort]} · 姿勢：${record.form ? '穩定' : '不穩定'} · 疼痛：${record.pain ? '有' : '無'}`);
    appendText(row, 'p', 'feedback-detail feedback-resistance', `阻力標記：${record.resistance || '未記錄'}`);
    appendText(row, 'p', 'feedback-completion', completeDates.has(record.date)
      ? '當日已完成主課表（完整／加練）' : '只有回報，未完成主課表');
    list.append(row);
  }
  $('hist-feedback-empty').hidden = filtered.length > 0;
  $('hist-feedback-empty').textContent = history.length === 0
    ? '尚無每組回報。訓練時可在次數動作選擇「回報這組」；過去未回報的組數不會補算。'
    : '這個動作與期間尚無回報。可切換「全部」或選擇其他動作。';
  const shown = Math.min(limit, filtered.length);
  $('hist-feedback-count').textContent = `顯示 ${shown}／${filtered.length} 組回報`;
  const more = $('hist-feedback-more');
  more.hidden = shown >= filtered.length;
  more.textContent = `再看 ${Math.min(MORE, filtered.length - shown)} 組`;
  more.onclick = () => { limit = Math.min(MAX, limit + MORE); renderFeedbackHistory(); };
  $('hist-feedback-back').onclick = () => goTo('s-train');
}

export function openFeedbackHistory(name) {
  // Route through the shared active-workout guard before changing the view's filters.
  if (typeof name !== 'string' || !name || !goTo('s-hist')) return false;
  movement = movementOf(name); range = '28'; limit = INITIAL;
  renderFeedbackHistory();
  $('hist-feedback').scrollIntoView({ block: 'start' });
  $('hist-feedback-title').focus({ preventScroll: true });
  return true;
}
