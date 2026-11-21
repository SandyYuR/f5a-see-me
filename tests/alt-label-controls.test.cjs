const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./dom-app-harness.cjs');

test('四项副标签设置共享状态、侧边联动与草稿快照，默认对齐输入法', () => {
  const { api, registry } = loadApp();
  const cfg = api.state.themeAppSync;
  assert.deepEqual([cfg.moveMainTextForAltLabel, cfg.altLabelOnSide, cfg.altLabelSide, cfg.showKeyAltLabels], [true, false, 'right', true]);
  api.syncAltLabelControls('pt');
  assert.equal(registry.get('pt-alt-side').disabled, true);
  registry.get('pt-move-main-alt').checked = false;
  registry.get('pt-alt-on-side').checked = true;
  registry.get('pt-alt-side').value = 'left';
  registry.get('pt-show-alt').checked = false;
  api.readAltLabelControls('pt');
  api.actualSyncAltLabelThemeUi();
  assert.equal(registry.get('theme-app-move-main-alt').checked, false);
  assert.equal(registry.get('theme-app-alt-on-side').checked, true);
  assert.equal(registry.get('theme-app-alt-side').value, 'left');
  assert.equal(registry.get('theme-app-alt-side').disabled, false);
  assert.equal(registry.get('theme-app-show-alt').checked, false);
  assert.deepEqual(JSON.parse(api.currentHistorySnapshot()).themeAppSync, JSON.parse(JSON.stringify(cfg)));
  api.syncAltLabelControls('pt', true);
  assert.equal(registry.get('pt-alt-side').disabled, true);
  assert.equal(registry.get('pt-show-alt').disabled, true);
});

test('副标签桥接读取保留false，保存携带四项当前值，旧桥缺项使用原生默认', async () => {
  let response = { moveMainTextForAltLabel: false, altLabelOnSide: true, altLabelSide: 'left', showKeyAltLabels: false };
  const requests = [];
  const { api } = loadApp({ imeApiBase: 'http://127.0.0.1:18080', fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => response };
  }});
  await api.loadThemePrefsFromIme();
  await api.saveThemePrefsToIme();
  const saved = JSON.parse(requests.at(-1).options.body);
  assert.deepEqual([saved.moveMainTextForAltLabel, saved.altLabelOnSide, saved.altLabelSide, saved.showKeyAltLabels], [false, true, 'left', false]);
  response = {};
  await api.loadThemePrefsFromIme();
  const cfg = api.state.themeAppSync;
  assert.deepEqual([cfg.moveMainTextForAltLabel, cfg.altLabelOnSide, cfg.altLabelSide, cfg.showKeyAltLabels], [true, false, 'right', true]);
});
