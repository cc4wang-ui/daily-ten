import { test } from 'node:test';
import assert from 'node:assert/strict';

test('in-app help opens a missing-footage message without the old SVG', async () => {
  const elements = new Map();
  const element = () => ({
    textContent: '', hidden: false, style: {}, href: '',
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); }
    },
    replaceChildren(...children) { this.children = children; }
  });
  for (const id of ['dm-name', 'dm-cue', 'dm-yt', 'dm-training-note', 'dm-close', 'dm-skip',
    'dm-svg', 'dm-video', 'dm-safety', 'demo-modal']) elements.set(id, element());
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  const oldDemos = globalThis.DT_DEMOS;
  globalThis.document = {
    getElementById: id => elements.get(id),
    createElement: () => element()
  };
  globalThis.DT_DEMOS = { info: key => key === 'thread-the-needle' ? { name: '穿針式', cue: '慢慢移動' } : null };
  globalThis.window = { DT_DEMOS: globalThis.DT_DEMOS };
  try {
    const { openDemo, closeDemo } = await import('../js/ui/demo.js');
    openDemo('thread-the-needle', '穿針式', () => {}, '穿針式');
    assert.equal(elements.get('demo-modal').classList.contains('active'), true);
    assert.equal(elements.get('dm-svg').hidden, true);
    assert.match(elements.get('dm-video').children[0].textContent, /還沒有經審核的離線影片/);
    assert.equal(elements.get('dm-yt').style.display, 'none');
    assert.equal(elements.get('dm-skip').hidden, true);
    closeDemo();
    assert.equal(elements.get('demo-modal').classList.contains('active'), false);
    openDemo('臀橋走步', '臀橋走步', () => {}, '臀橋走步', '臀部抬起、腳跟交替向外走');
    assert.equal(elements.get('dm-name').textContent, '臀橋走步');
    assert.equal(elements.get('dm-cue').textContent, '臀部抬起、腳跟交替向外走');
    assert.match(elements.get('dm-video').children[0].textContent, /還沒有經審核的離線影片/);
    closeDemo();
  } finally {
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
    globalThis.DT_DEMOS = oldDemos;
  }
});
