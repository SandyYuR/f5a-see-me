const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScript, loadApp } = require('./dom-app-harness.cjs');

function editor() {
  const data = {
    symbols: { multiLine: false, groups: [{ names: { zh: '符号' }, symbols: ['a', 'b'] }] },
    emoji: { multiLine: false, groups: [{ names: { zh: '表情' }, symbols: ['😀'] }] },
    kaomoji: { multiLine: true, groups: [{ names: { zh: '颜文字' }, symbols: ['(＾▽＾)'] }] },
  };
  const { window, doc } = loadScript('symbol-panel.js', { window: { F5A_SYMBOL_DATA: data } });
  const panel = window.F5aSymbolPanel;
  panel.init();
  return { panel, doc };
}

test('错误目录导入拒绝覆盖已有条目,错误字段在归一化前可见', () => {
  const { panel } = editor();
  const original = panel.currentJsonText();
  for (const bad of [
    { groups: 'bad' },
    { groups: [{ names: null, symbols: ['x'] }] },
    { groups: [{ names: { zh: '甲' }, symbols: 'bad' }] },
    { groups: [{ names: { zh: null }, symbols: ['x'] }] },
    { groups: [{ names: {}, symbols: [null] }] },
    { multiLine: 'true', groups: [{ names: { zh: '甲' }, symbols: ['x'] }] },
  ]) {
    assert.equal(panel.importText(JSON.stringify(bad), 'bad.json').ok, false);
    assert.equal(panel.currentJsonText(), original);
  }
});

test('旧数组导入转换为 App 可读取的具名目录', () => {
  const { panel } = editor();
  const loaded = panel.loadProfileText('[ ["a", "b"], ["c"] ]', 'symbols');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.legacy, true);
  assert.equal(loaded.profile.groups.length, 2);
  assert.ok(loaded.profile.groups.every(g => Object.keys(g.names).length));
  assert.deepEqual(JSON.parse(panel.serializeProfile(loaded.profile)).groups.map(g => g.symbols), [['a', 'b'], ['c']]);
});

test('组名精确/主标签/兜底的空字符串均按 App 原值展示', () => {
  const { panel } = editor();
  assert.equal(panel.groupLabel({ names: { 'en-US': '', en: 'English' } }, 'en-US'), '');
  assert.equal(panel.groupLabel({ names: { zh: '', 'zh-Hant': '繁體' } }, 'zh-Hans'), '');
  assert.equal(panel.groupLabel({ names: { fr: '', en: 'English' } }, 'de'), '');
});

test('JSON 草稿在切类别和重进页面后保留,导出要求先应用', () => {
  const { panel, doc } = editor();
  const ta = doc.getElementById('sym-json');
  const draft = '{ "groups": [{ "names": { "zh": "新组" }, "symbols": ["x"] }] }';
  ta.value = draft;
  ta.dispatch('input');
  panel.renderOnTabEnter();
  assert.equal(ta.value, draft);
  assert.equal(panel.exportJson(), null);
  const kind = doc.getElementById('sym-kind');
  kind.value = 'emoji'; kind.dispatch('change');
  assert.notEqual(ta.value, draft);
  kind.value = 'symbols'; kind.dispatch('change');
  assert.equal(ta.value, draft);
  assert.equal(panel.applyJsonText().ok, true);
  assert.equal(JSON.parse(panel.currentJsonText()).groups[0].symbols[0], 'x');
  assert.deepEqual(Object.keys(panel.getState().jsonDrafts), []);
});

test('颜文字新增保留内部和边缘空格,选中条目移动后保持高亮', () => {
  const { panel, doc } = editor();
  const kind = doc.getElementById('sym-kind');
  kind.value = 'kaomoji'; kind.dispatch('change');
  const list = () => doc.getElementById('sym-list');
  list().querySelector('input[data-sym-new-entry]').value = '  ( ^ _ ^ )  ';
  list().querySelector('button[data-sym-add-entry]').click();
  assert.equal(panel.getState().profiles.kaomoji.groups[0].symbols[1], '  ( ^ _ ^ )  ');
  list().querySelectorAll('button.sym-entry')[1].click();
  doc.getElementById('sym-entry-ops').querySelector('button[data-sym-op="up"]').click();
  assert.equal(panel.getState().selectedEntry.ei, 0);
  assert.equal(list().querySelectorAll('button.sym-entry')[0].classList.contains('selected'), true);
});

test('符号快照只存编辑内容,恢复同时保留 JSON 草稿且不再触发修改', () => {
  const { panel, doc } = editor();
  assert.deepEqual(Object.keys(panel.snapshot().profiles), []);
  let changes = 0;
  panel.setChangeListener(() => changes++);
  panel.importText('{"groups":[{"names":{"zh":"自定义"},"symbols":["x"]}]}', 'custom.json');
  const ta = doc.getElementById('sym-json');
  ta.value = '{ unfinished'; ta.dispatch('input');
  const saved = panel.snapshot();
  panel.resetToBuiltin();
  const beforeRestore = changes;
  assert.equal(panel.restore(saved), true);
  assert.equal(changes, beforeRestore);
  assert.equal(ta.value, '{ unfinished');
  assert.equal(panel.getState().profiles.symbols.groups[0].symbols[0], 'x');
  saved.profiles.symbols.groups[0].symbols[0] = 'changed elsewhere';
  assert.equal(panel.getState().profiles.symbols.groups[0].symbols[0], 'x');
  assert.match(doc.getElementById('sym-path-hint').innerHTML, /config\/symbol_catalogs\/symbols/);
});

test('全局撤销重做与浏览器草稿保留符号目录和未应用JSON', () => {
  const { api, doc, storage } = loadApp();
  const panel = api.symbolPanel;
  panel.init();
  panel.importText('{"groups":[{"names":{"zh":"自定义"},"symbols":["x"]}]}', 'custom.json');
  api.commitHistorySnapshot();
  const ta = doc.getElementById('sym-json');
  ta.value = '{ unfinished'; ta.dispatch('input');
  api.commitHistorySnapshot();
  api.undo();
  assert.equal(panel.getState().profiles.symbols.groups[0].symbols[0], 'x');
  assert.equal(Object.keys(panel.getState().jsonDrafts).length, 0);
  api.undo();
  assert.equal(Object.keys(panel.snapshot().profiles).length, 0);
  api.redo();
  api.redo();
  assert.equal(ta.value, '{ unfinished');
  api.saveDraftNow();
  const draft = JSON.parse(storage.get('f5a-editor-draft-v1'));
  assert.equal(draft.symbols.profiles.symbols.groups[0].symbols[0], 'x');
  assert.equal(draft.symbols.jsonDrafts.symbols, '{ unfinished');
});

test('修改分组名称后保持该组展开,不会折叠正在编辑的条目', () => {
  const { panel, doc } = editor();
  const group = doc.getElementById('sym-list').querySelector('details.sym-group-card');
  group.open = true;
  group.dispatch('toggle');
  const input = group.querySelector('input[data-sym-name="zh"]');
  input.value = '新名称'; input.dispatch('change');
  assert.equal(panel.getState().profiles.symbols.groups[0].names.zh, '新名称');
  assert.equal(doc.getElementById('sym-list').querySelector('details.sym-group-card').open, true);
});
