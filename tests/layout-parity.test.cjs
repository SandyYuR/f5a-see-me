const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./dom-app-harness.cjs');

const row = main => [[{ type: 'AlphabetKey', main, alt: '1' }]];
const plain = value => JSON.parse(JSON.stringify(value));

test('层子布局使用原始存储键，显示易读名称并排在方案之后', () => {
  const { api } = loadApp();
  api.state.layout = { rime: {
    default: row('A'), '__layer__:数字': row('1'), wanxiang_t9: row('W'),
    '__variant__:split': row('S')
  } };
  assert.deepEqual(Array.from(api.submodeNames('rime')), ['default', 'wanxiang_t9', '__layer__:数字']);
  assert.equal(api.submodeDisplayName('__layer__:数字'), '层：数字');
  assert.equal(api.entryDisplayName('rime:__layer__:数字'), 'rime / 层：数字');
  assert.ok(api.allEntryKeys().includes('rime:__layer__:数字'));
  assert.ok(!api.allEntryKeys().includes('rime:__variant__:split'));
});

test('创建数字层复制选定来源，并建立普通排列而非遗留分体编辑目标', () => {
  const { api } = loadApp();
  api.state.layout = { rime: { default: row('A'), '__variant__:split': row('S') }, number: row('1') };
  Object.assign(api.state, { selectedBase: 'rime', selectedSubmode: 'default', editingSplit: true });
  assert.equal(api.addSubmodeWithName('__layer__:数字', 'number'), true);
  assert.equal(api.state.selectedSubmode, '__layer__:数字');
  assert.equal(api.state.editingSplit, false);
  assert.deepEqual(plain(api.state.layout.rime['__layer__:数字']), row('1'));
  api.getRows()[0][0].main = '2';
  assert.equal(api.state.layout.number[0][0].main, '1', '复制必须独立于来源');
  const before = plain(api.state.layout);
  assert.equal(api.addSubmodeWithName('__layer__:数字', 'number'), false, '不能覆盖已有层');
  assert.equal(api.addSubmodeWithName('__layer__:', 'number'), false, '层名称不能为空');
  assert.equal(api.addSubmodeWithName('__layer__:a:b', 'number'), false, '层名称不能新增冒号');
  assert.equal(api.addSubmodeWithName('__variant__:split', 'number'), false, '排列保留键不能作为子布局');
  assert.deepEqual(plain(api.state.layout), before);
});

test('普通和分体共用子布局竖横屏高度，保留导入的变体元数据', () => {
  const { api } = loadApp();
  api.state.layout = { rime: { default: row('A'), '__layer__:数字': {
    default: row('1'), '__variant__:split': {
      default: row('S'), __meta__: { keyboard_height_percent: 65, vendor: 'preserve' }
    }
  } } };
  Object.assign(api.state, { selectedBase: 'rime', selectedSubmode: '__layer__:数字', editingSplit: true });
  assert.equal(api.getHeightOverride(), '', '运行时忽略的变体高度不能误作当前设置');
  api.setHeightOverride('rime', '__layer__:数字', '35');
  api.setHeightOverrideLandscape('rime', '__layer__:数字', '48');
  const child = api.state.layout.rime['__layer__:数字'];
  assert.equal(child.__meta__.keyboard_height_percent, 35);
  assert.equal(child.__meta__.keyboard_height_percent_landscape, 48);
  assert.deepEqual(plain(child['__variant__:split'].__meta__), { keyboard_height_percent: 65, vendor: 'preserve' });
  api.state.editingSplit = false;
  assert.equal(api.getHeightOverride(), 35);
  assert.equal(api.getHeightOverrideLandscape(), 48);
  api.setHeightOverride('rime', '__layer__:数字', '');
  api.setHeightOverrideLandscape('rime', '__layer__:数字', '');
  assert.equal(api.getHeightOverride(), '');
  assert.equal(api.getHeightOverrideLandscape(), '');
});

test('删除层子布局的分体排列保留普通排列及高度', () => {
  const { api } = loadApp();
  api.state.layout = { rime: { default: row('A'), '__layer__:数字': {
    default: row('1'), '__variant__:split': row('S'), __meta__: { keyboard_height_percent: 35 }
  } } };
  Object.assign(api.state, { selectedBase: 'rime', selectedSubmode: '__layer__:数字', editingSplit: true });
  api.handlePrimaryDeleteLayout();
  const child = api.state.layout.rime['__layer__:数字'];
  assert.deepEqual(plain(child.default), row('1'));
  assert.equal(child.__meta__.keyboard_height_percent, 35);
  assert.equal(child['__variant__:split'], undefined);
  assert.equal(api.state.selectedSubmode, '__layer__:数字');
  assert.equal(api.state.editingSplit, false);
});

test('显示文本编辑保留空键回退、显式空值和显示文字空白', () => {
  const { api, registry } = loadApp();
  registry.get('layout-key-display-dialog').close = () => {};
  api.keyDialogState.draft = { type: 'AlphabetKey', main: 'a', alt: '1' };
  registry.get('layout-key-display-mode').value = 'mapping';
  api.appendDisplayMapRow('', ' fallback ');
  api.appendDisplayMapRow('wanxiang_t9', '  ');
  api.appendDisplayMapRow('default', '');
  api.appendDisplayMapRow('', '');
  api.saveDisplayTextDialog();
  assert.deepEqual(plain(api.keyDialogState.draft.displayText), {
    '': ' fallback ', wanxiang_t9: '  ', default: ''
  });
  registry.get('layout-key-display-mode').value = 'simple';
  registry.get('layout-key-display-simple').value = ' padded ';
  api.saveDisplayTextDialog();
  assert.equal(api.keyDialogState.draft.displayText, ' padded ');
  registry.get('layout-key-display-simple').value = '  ';
  api.saveDisplayTextDialog();
  assert.equal(api.keyDialogState.draft.displayText, '  ');
  registry.get('layout-key-display-simple').value = '';
  api.saveDisplayTextDialog();
  assert.equal(api.keyDialogState.draft.displayText, undefined);
});

test('数字键盘原始 keysym 和自定义键面不因导入或普通属性编辑丢失', () => {
  const { api, registry } = loadApp();
  // isolate unrelated SVG/visibility rendering while using the real form field reads and writes.
  registry.get('layout-key-icon-slot-options').dataset.ready = '1';
  for (const sym of ['KP_Enter', 0xffe9, '0xffe9', 'Left']) {
    const raw = { numeric: [[{ type: 'NumPadKey', sym, label: '定制', weight: 0.2 }]] };
    api.normalizeLayoutObject(raw);
    const key = raw.numeric[0][0];
    assert.equal(key.sym, sym);
    assert.equal(key.label, '定制');
    Object.assign(api.keyDialogState, { draft: key, rowIndex: 0, auxBarMode: false });
    api.populateMainKeyFieldsFromDraft();
    assert.equal(registry.get('layout-key-numpad-sym').value, String(sym));
    registry.get('layout-key-weight').value = '0.3';
    api.applyMainFieldsToDraft(key);
    api.normalizeDraftForSaveByAppRules(key);
    assert.equal(key.sym, sym);
    assert.equal(key.label, '定制');
    assert.equal(key.weight, 0.3);
    registry.get('layout-key-numpad-sym').value = 'KP_2';
    api.applyMainFieldsToDraft(key);
    api.normalizeDraftForSaveByAppRules(key);
    assert.equal(key.sym, 'KP_2');
    assert.equal(key.label, '2');
  }
});

test('行设置校验后统一高度与断点，保留按键内容及未知字段', () => {
  const { api, registry } = loadApp();
  const dialog = registry.get('layout-row-settings-dialog');
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  api.state.layout = { rime: { default: row('A'), '__layer__:数字': {
    default: row('1'), '__variant__:split': [[
      { type: 'AlphabetKey', main: '1', alt: 'a', rowHeightPercent: 15, vendor: { data: true } },
      { type: 'AlphabetKey', main: '2', alt: 'b', rowHeightPercent: 20, composeOverride: { type: 'SymbolKey', label: '?' } }
    ]], __meta__: { keyboard_height_percent: 40 }
  } } };
  Object.assign(api.state, { selectedBase: 'rime', selectedSubmode: '__layer__:数字', editingSplit: true });
  api.openLayoutRowSettings(0);
  assert.equal(registry.get('layout-row-settings-height').value, '20');
  const before = plain(api.state.layout);
  registry.get('layout-row-settings-height').value = '101';
  assert.equal(api.saveLayoutRowSettings(), false);
  assert.equal(dialog.open, true);
  assert.deepEqual(plain(api.state.layout), before, '非法输入不能改任何按键');
  registry.get('layout-row-settings-height').value = '32.5';
  registry.get('layout-row-settings-boundary').value = '0';
  registry.get('layout-row-settings-keep-together').checked = true;
  assert.equal(api.saveLayoutRowSettings(), true);
  const saved = plain(api.getRows()[0]);
  assert.deepEqual(saved.map(key => key.rowHeightPercent), [32.5, 32.5]);
  assert.equal(saved[0].splitAfter, true);
  assert.equal(saved[0].splitRowDisabled, true);
  assert.equal(saved[1].splitRowDisabled, undefined);
  assert.deepEqual(saved[0].vendor, { data: true });
  assert.deepEqual(saved[1].composeOverride, { type: 'SymbolKey', label: '?' });
  assert.equal(api.state.layout.rime['__layer__:数字'].__meta__.keyboard_height_percent, 40);
  api.openLayoutRowSettings(0);
  registry.get('layout-row-settings-height').value = '';
  registry.get('layout-row-settings-boundary').value = '-1';
  registry.get('layout-row-settings-keep-together').checked = false;
  assert.equal(api.saveLayoutRowSettings(), true);
  assert.ok(api.getRows()[0].every(key => key.rowHeightPercent === undefined && key.splitAfter === undefined && key.splitRowDisabled === undefined));
});

test('行设置拒绝在原行已变化后写入旧草稿', () => {
  const { api, registry } = loadApp();
  registry.get('layout-row-settings-dialog').showModal = () => {};
  api.state.layout = { default: row('A') };
  Object.assign(api.state, { selectedBase: 'default', selectedSubmode: 'default', editingSplit: false });
  api.openLayoutRowSettings(0);
  registry.get('layout-row-settings-height').value = '50';
  api.getRows()[0][0].main = 'B';
  assert.equal(api.saveLayoutRowSettings(), false);
  assert.equal(api.getRows()[0][0].main, 'B');
  assert.equal(api.getRows()[0][0].rowHeightPercent, undefined);
});
