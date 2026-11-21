const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./dom-app-harness.cjs');
const plain = value => JSON.parse(JSON.stringify(value));

test('文本编辑标题栏按键框开关透明或使用barColor，内容区始终使用keyboardColor', () => {
  const { api } = loadApp();
  const theme = api.state.themeCatalog.find(t => t.id === api.state.selectedThemeId);
  Object.assign(theme.colors, { backgroundColor: -65536, barColor: -16711936, keyboardColor: -16776961, altKeyTextColor: -256 });
  const geometry = { height: 200, bottomHeight: 50, titleHeight: 40, dpScale: 1 };
  const bordered = api.buildTextEditorPreviewHtml([], geometry, true);
  const plainHtml = api.buildTextEditorPreviewHtml([], geometry, false);
  assert.match(bordered, /class="text-editor-titlebar" style="height:40px;background:transparent;color:rgba\(255, 255, 0, 1\)/);
  assert.match(plainHtml, /class="text-editor-titlebar" style="height:40px;background:rgba\(0, 255, 0, 1\)/);
  for (const html of [bordered, plainHtml]) {
    assert.match(html, /class="text-editor-pad-area" style="background:rgba\(0, 0, 255, 1\)/);
    assert.match(html, /class="text-editor-bottom" style="height:50px;background:rgba\(0, 0, 255, 1\)/);
  }
});

test('弹出定义往返保留禁用数组、空白、空文字与特殊映射名，拒绝结构错误', () => {
  const { api } = loadApp();
  const source = JSON.parse('{"q":[]," ":[" ",""],"__proto__":["safe"]}');
  assert.deepEqual(plain(api.normalizePopupEntries(source)), source);
  for (const invalid of [[], null, { q: [1] }, { q: 'bad' }]) {
    assert.throws(() => api.normalizePopupEntries(invalid));
  }
});

test('宏完整往返保留 Android、任意 X11 按键名、动态 App ID 与跨布局层目标', () => {
  const { api } = loadApp();
  const macro = [
    { type: 'tap', keys: [{ android: 29 }, { fcitx: 'U1F600' }] },
    { type: 'app', id: 'js_app:plugin/custom' },
    { type: 'app', id: 'split_keyboard' },
    { type: 'layer', mode: 'to', target: '数字' },
    { type: 'shortcut', modifiers: [{ android: 113 }, { fcitx: 'Ctrl_R' }], key: { android: 31 } }
  ];
  const steps = api.normalizeMacroStepsForSave(macro.map(api.parseMacroStep));
  assert.equal(api.validateMacroSteps(steps, true), '');
  assert.deepEqual(plain(api.buildMacroActionFromSteps(steps)), { macro });
  for (const id of ['split_keyboard', 'voice_input', 'ai_assistant', 'js_tools', 'random_theme']) {
    assert.ok(api.macroAppActions.includes(id));
  }
});

test('旧快捷键 modifier 兼容，按键类型分别校验，非法 Android 数值拒绝保存', () => {
  const { api } = loadApp();
  const old = api.parseMacroStep({ type: 'shortcut', modifier: { fcitx: 'Ctrl_L' }, key: { android: 29 } });
  assert.equal(api.validateMacroSteps([old], true), '');
  assert.deepEqual(plain(api.buildMacroActionFromSteps([old])), {
    macro: [{ type: 'shortcut', modifiers: [{ fcitx: 'Ctrl_L' }], key: { android: 29 } }]
  });
  assert.equal(api.validateMacroSteps([{ type: 'tap', keys: [{ keyType: 'fcitx', code: '29' }, { keyType: 'android', code: '29' }] }], true), '');
  for (const code of ['29.5', 'Left', '2147483648']) {
    assert.match(api.validateMacroSteps([{ type: 'tap', keys: [{ keyType: 'android', code }] }], true), /整数/);
  }
});

test('编辑动作别名按运行时规范化，未知动作拒绝保存而不改为复制', () => {
  const { api } = loadApp();
  const normalized = action => api.normalizeMacroStepsForSave([{ type: 'edit', keys: [{ code: action }] }]);
  assert.equal(normalized('paste ')[0].keys[0].code, 'paste');
  assert.equal(normalized('SELECT_ALL')[0].keys[0].code, 'selectAll');
  assert.match(api.validateMacroSteps(normalized('unknown'), true), /有效/);
  assert.equal(normalized('unknown')[0].keys[0].code, 'unknown');
});

test('主题 JSON 的 backgroundImage:null 清除背景', () => {
  const { api, registry } = loadApp();
  api.state.themeCatalog.push({ id: 'custom', name: 'Custom', builtin: false, colors: {}, backgroundImage: 'data:image/png;base64,AA==', backgroundImageObject: { src: 'old.png' } });
  api.state.selectedThemeId = 'custom';
  registry.get('theme-json').value = '{"backgroundImage":null}';
  api.applyThemeJsonEditorInput();
  const theme = api.state.themeCatalog.find(t => t.id === 'custom');
  assert.equal(theme.backgroundImage, '');
  assert.equal(theme.backgroundImageObject, null);
});

test('符号已应用目录接入全局撤销、重做与浏览器草稿快照', () => {
  const { api, storage } = loadApp();
  const initial = plain(api.symbols.snapshot());
  api.symbols.importText('{"groups":[{"names":{"zh":"自定义"},"symbols":["( ＾▽＾ )"]}]}', 'symbols.json');
  api.commitHistorySnapshot();
  const changed = plain(api.symbols.snapshot());
  assert.equal(changed.profiles.symbols.groups[0].symbols[0], '( ＾▽＾ )');
  api.undo();
  assert.deepEqual(plain(api.symbols.snapshot()), initial);
  api.redo();
  assert.deepEqual(plain(api.symbols.snapshot()), changed);
  assert.equal(api.saveDraftNow(), true);
  assert.deepEqual(JSON.parse(storage.get('f5a-editor-draft-v1')).symbols, changed);
});
