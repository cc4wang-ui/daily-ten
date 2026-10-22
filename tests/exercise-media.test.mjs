import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXERCISE_MEDIA, getApprovedExerciseMedia, getExerciseStoryboard, isApprovedExerciseMedia, mountExerciseVideo
} from '../js/ui/exercise-media.js';

const clip = () => ({
  movementId: 'cat-cow',
  names: ['貓牛式'],
  src: './media/exercises/cat-cow.mp4',
  reviewed: true,
  review: { reviewer: 'Test Reviewer', credential: 'Test credential', reviewedAt: '2026-10-12', rights: 'Test-owned footage' }
});

test('production catalog has no unreviewed instructional footage', () => {
  assert.deepEqual(EXERCISE_MEDIA, []);
  assert.equal(getApprovedExerciseMedia('貓牛式'), null);
});

test('storyboards cover only their exact movement variants', () => {
  assert.equal(getExerciseStoryboard('貓牛式')?.src, './media/exercises/cat-cow-storyboard.png');
  assert.equal(getExerciseStoryboard('伏地挺身 第1組 · 跪姿')?.src, './media/exercises/knee-push-up-storyboard.png');
  assert.equal(getExerciseStoryboard('伏地挺身 第1組')?.src, './media/exercises/push-up-storyboard-v2.png');
  assert.equal(getExerciseStoryboard('HRP 伏地挺身測驗'), null);
  assert.equal(getExerciseStoryboard('派克伏地挺身 第1組')?.src, './media/exercises/pike-push-up-storyboard.png');
  assert.equal(getExerciseStoryboard('派克伏地挺身 第3組'), null);
  assert.equal(getExerciseStoryboard('腳抬高派克伏地挺身'), null);
});

test('only exact, uniquely approved movement names resolve', () => {
  const entry = clip();
  assert.equal(getApprovedExerciseMedia('貓牛式', [entry]), entry);
  assert.equal(getApprovedExerciseMedia('貓牛', [entry]), null);
  assert.equal(getApprovedExerciseMedia('貓牛式 第1組', [entry]), null);
  assert.equal(getApprovedExerciseMedia('貓牛式', [entry, { ...entry, movementId: 'other' }]), null);
});

test('external and unreviewed videos fail closed', () => {
  const valid = clip();
  for (const invalid of [
    { ...valid, reviewed: false },
    { ...valid, review: null },
    { ...valid, review: { ...valid.review, credential: '' } },
    { ...valid, review: { ...valid.review, reviewedAt: '2026-02-31' } },
    { ...valid, movementId: '' },
    { ...valid, names: ['貓牛式', '貓牛式'] },
    { ...valid, src: 'https://example.com/cat-cow.mp4' },
    { ...valid, src: './media/exercises/../other.mp4' },
    { ...valid, src: './media/exercises/cat-cow.mp4?download=1' },
    { ...valid, src: '/media/exercises/cat-cow.mp4' }
  ]) {
    assert.equal(isApprovedExerciseMedia(invalid), false);
    assert.equal(getApprovedExerciseMedia('貓牛式', [invalid]), null);
  }
});

test('missing footage mounts a clear offline unavailable state', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ textContent: '' }) };
  try {
    let children = [];
    const container = { replaceChildren(...nodes) { children = nodes; } };
    const controller = mountExerciseVideo(container, '穿針式');
    assert.equal(controller.available, false);
    assert.match(children[0].textContent, /還沒有經審核的離線影片/);
    controller.stop();
  } finally {
    globalThis.document = previous;
  }
});

test('a video load error restores the unavailable state even after metadata loaded', () => {
  const previous = globalThis.document;
  let video;
  let controls;
  globalThis.document = {
    createElement(tag) {
      if (tag === 'p') return { textContent: '', hidden: false };
      if (tag === 'div') return { append(...nodes) { controls = nodes; }, remove() {} };
      if (tag === 'button') return { textContent: '', onclick: null };
      const events = new Map();
      video = {
        parentNode: null, paused: false,
        playbackRate: 1, currentTime: 5, play() { return Promise.resolve(); },
        setAttribute() {}, removeAttribute() {}, load() {},
        pause() { this.paused = true; },
        remove() { this.parentNode = null; },
        addEventListener(type, fn) { events.set(type, fn); },
        removeEventListener(type) { events.delete(type); },
        dispatch(type) { events.get(type)?.(); }
      };
      return video;
    }
  };
  try {
    let children = [];
    const container = {
      replaceChildren(...nodes) { children = nodes; },
      append(node) { children.push(node); node.parentNode = this; }
    };
    const controller = mountExerciseVideo(container, '貓牛式', [clip()]);
    assert.equal(controller.available, true);
    assert.equal(video.src, './media/exercises/cat-cow.mp4');
    controls[0].onclick();
    assert.equal(video.playbackRate, 0.5);
    controls[1].onclick();
    assert.equal(video.currentTime, 0);
    video.dispatch('loadedmetadata');
    assert.equal(children[0].hidden, true);
    video.dispatch('error');
    assert.equal(children[0].hidden, false);
    assert.match(children[0].textContent, /無法載入/);
    assert.equal(video.paused, true);
    controller.stop();
  } finally {
    globalThis.document = previous;
  }
});
