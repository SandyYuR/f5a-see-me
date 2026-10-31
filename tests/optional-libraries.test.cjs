const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loader() {
  const scripts = [], timers = new Map(); let next = 0;
  const context = {
    window: {},
    document: { createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild: s => scripts.push(s) } },
    setTimeout: f => { timers.set(++next, f); return next; },
    clearTimeout: id => timers.delete(id)
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/optional-libraries.js'), 'utf8'), context);
  return { ...context, scripts, timers, ensure: context.window.EditorLibraries.ensure };
}

test('ordinary editing starts without requesting any optional script', () => {
  const r = loader(); assert.equal(r.scripts.length, 0); assert.equal(r.timers.size, 0);
});
test('concurrent QR actions share a load and reuse the loaded library', async () => {
  const r = loader(); const a = r.ensure(['qrious']), b = r.ensure(['qrious']);
  assert.equal(r.scripts.length, 1); assert.equal(r.scripts[0].async, true);
  r.window.QRious = function () {}; r.scripts[0].onload();
  await Promise.all([a, b]); await r.ensure(['qrious']);
  assert.equal(r.scripts.length, 1); assert.equal(r.timers.size, 0);
});
test('a stalled load reports failure and the next action can retry', async () => {
  const r = loader(); const failed = r.ensure(['jszip']);
  const rejection = assert.rejects(failed, /加载失败/);
  [...r.timers.values()][0](); await rejection;
  assert.equal(r.scripts[0].removed, true);
  const retry = r.ensure(['jszip']); assert.equal(r.scripts.length, 2);
  r.window.JSZip = {}; r.scripts[1].onload(); await retry;
});
