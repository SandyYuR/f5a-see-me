const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// 运行原始逻辑；只隔离页面启动、渲染与浏览器服务，不复制待测实现。
function loadApp() {
  const elements = new Map();
  const storage = new Map();
  const tasks = [];
  const noOp = () => {};
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: '', checked: false, disabled: false, hidden: false, textContent: '', className: '',
      handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; },
      close: noOp, classList: { remove: noOp, add: noOp, toggle: noOp }
    });
    return elements.get(id);
  };
  const context = {
    console, URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, Blob,
    document: { documentElement: { classList: { remove: noOp, add: noOp, toggle: noOp } },
      addEventListener: noOp, querySelectorAll: () => [], getElementById: element },
    window: { location: { protocol: 'file:', hostname: '', search: '', origin: '' }, addEventListener: noOp },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    queueMicrotask: callback => tasks.push(callback),
    setTimeout: noOp, clearTimeout: noOp, requestAnimationFrame: noOp,
  };
  const hook = `
    // 本套最小 DOM 只验证数据事务;符号页真实渲染由 symbol-panel 测试覆盖。
    // restore/snapshot 继续执行真实逻辑,隔离不在本套范围内的页面绘制。
    if (window.F5aSymbolPanel) window.F5aSymbolPanel.render = () => {};
    syncLayoutUiFromState = renderThemeList = renderThemeEditor = syncThemeJsonFromState = () => {};
    renderPopupEditor = syncPopupJsonFromState = renderIconThemeEditor = syncIconThemeJsonFromState = () => {};
    syncPreviewToolbarUi = syncThemeAppSyncUiFromState = refreshKeyDialogSummaries = () => {};
    if (window.F5aSymbolPanel) window.F5aSymbolPanel.render = () => {};
    window.testApi = { state, history, keyDialogState, beginHistoryTracking, commitHistorySnapshot,
      scheduleHistoryCommit, undo, redo, saveDraftNow, currentHistorySnapshot, restoreSnapshot,
      normalizeLayoutObject, applyMainFieldsToDraft, updateDraftFromMainFields, normalizeRowHeightKey,
      renderSvgPreviewHtml, resolvePreviewColorsForKey, resolveThemeTokenColor, argbToCss,
      buildAuxBarPreviewHtml, editorKeyLabel, restoreDraftFromStorage, registerDraftBackgroundAsset,
      resolvePreviewKey, resolveAuxBarPreviewGeometry, resolveSplitRowLayout, getAuxBarConfig, getAuxBarKeys,
      setAuxBarConfig, setAuxBarKeys, getMetaContainer, submodeNames, getRows, setRows, getVariantRows,
      pinPreviewContainerWidth, resolveTextEditorPreviewRows, resolveTextEditorPreviewGeometry,
      buildTextEditorPreviewHtml, textEditorPreviewButtonColors, textEditorPreviewKeyFaceHtml,
      previewTitleFromObj, previewLetterCase,
      resolvePreviewLandscape, resolvePreviewMetrics, resolvePreviewContentHeight, resolvePreviewHeightScale,
      resolveEffectivePreviewHeightPercent, getHeightOverride, getHeightOverrideLandscape,
      resolveCanvasPreviewGeometry, renderPreviewCanvas,
      previewMainFontMaxForKey, previewCharacterForKey, resolvePreviewPunctPlacement, resolvePreviewAltTextLayout, keySubText, keySwipeHintHtml,
      duplicateMiddleKeyForPreview, moveKey, deleteKey };
  `;
  const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.ok(source.includes('\n  main();'));
  // app.js 读 globalThis.F5A_BUILTIN_PRESETS / F5A_SYMBOL_DATA(app 内置预置),
  // 生产页面靠 index.html 里的 <script> 先加载;测试里按同样顺序先执行这两份。
  for (const file of ["builtin-presets.js", "symbol-data.js", "symbol-panel.js", "symbol-preview.js", "random-theme.js"]) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js", file), "utf8"), context, { filename: file });
  }
  vm.runInNewContext(source.replace('\n  main();', hook), context, { filename: 'app.js' });
  return { ...context.window.testApi, context, storage, element, flush: () => { while (tasks.length) tasks.shift()(); } };
}
const layout = label => ({ default: [[{ type: 'AlphabetKey', main: label, alt: '1' }]] });
const main = r => r.state.layout.default[0][0].main;

test('本行保持连贯：分体预览既不复制中间键也不插入中缝', () => {
  const r = loadApp();
  const row = ['a', 'b', 'c'].map(main => ({ type: 'AlphabetKey', main }));
  row[0].splitRowDisabled = true;
  assert.equal(r.duplicateMiddleKeyForPreview(row), row);
  assert.equal(r.resolveSplitRowLayout(row, 0.2, true), null);
  delete row[0].splitRowDisabled;
  assert.equal(r.duplicateMiddleKeyForPreview(row).length, 4);
  assert.notEqual(r.resolveSplitRowLayout(row, 0.2, true), null);
});

test('本行保持连贯：跨行移动首键保留两行的独立设置', () => {
  const r = loadApp();
  r.state.layout = { default: [
    [{ type: 'AlphabetKey', main: 'a', splitRowDisabled: true }, { type: 'AlphabetKey', main: 'b' }],
    [{ type: 'AlphabetKey', main: 'c' }, { type: 'AlphabetKey', main: 'd' }]
  ] };
  r.state.selectedBase = 'default'; r.state.selectedSubmode = 'default'; r.state.editingSplit = false;
  r.moveKey(0, 0, 1, 0, false);
  const rows = r.getRows();
  assert.equal(rows[0][0].splitRowDisabled, true);
  assert.ok(rows[1].every(key => key.splitRowDisabled === undefined));
  rows[1][0].splitRowDisabled = true;
  r.moveKey(1, 1, 1, 0, false);
  assert.equal(rows[1][0].splitRowDisabled, true);
  assert.ok(rows[1].slice(1).every(key => key.splitRowDisabled === undefined));
});

test('本行保持连贯：删除首键后标记交给下一键', () => {
  const r = loadApp();
  r.state.layout = { default: [[
    { type: 'AlphabetKey', main: 'a', splitRowDisabled: true }, { type: 'AlphabetKey', main: 'b' }
  ]] };
  r.state.selectedBase = 'default'; r.state.selectedSubmode = 'default'; r.state.editingSplit = false;
  r.deleteKey(0, 0);
  assert.equal(r.getRows()[0][0].main, 'b');
  assert.equal(r.getRows()[0][0].splitRowDisabled, true);
});

test('快速修改 C 后撤销到 B、重做到 C；草稿始终保存当前状态', () => {
  const r = loadApp();
  r.state.layout = layout('A'); r.beginHistoryTracking();
  r.state.layout = layout('B'); r.commitHistorySnapshot();
  r.state.layout = layout('C'); r.undo();
  assert.equal(main(r), 'B');
  r.redo(); assert.equal(main(r), 'C');
  r.state.layout = layout('D'); r.saveDraftNow();
  assert.equal(JSON.parse(r.storage.get('f5a-editor-draft-v1')).layout.default[0][0].main, 'D');
  r.undo(); assert.equal(main(r), 'C');
  assert.equal(JSON.parse(r.storage.get('f5a-editor-draft-v1')).layout.default[0][0].main, 'C');
});

test('重做前的新修改清理旧分叉，同一事件多次同步只记录一次', () => {
  const r = loadApp();
  r.state.layout = layout('A'); r.beginHistoryTracking();
  r.state.layout = layout('B'); r.scheduleHistoryCommit(); r.scheduleHistoryCommit(); r.flush();
  assert.equal(r.history.undoStack.length, 1);
  r.undo(); r.state.layout = layout('C'); r.redo();
  assert.equal(main(r), 'C'); assert.equal(r.history.redoStack.length, 0);
});

test('主题设置和图标缩略图支持撤销、草稿恢复，兼容旧草稿', () => {
  const r = loadApp();
  r.state.layout = layout('A'); r.beginHistoryTracking();
  r.state.themeAppSync.keyRadius = 22;
  r.state.iconThemeCatalog[0].thumbnailSvg = '<svg/>';
  r.undo(); assert.equal(r.state.themeAppSync.keyRadius, 12);
  r.redo(); assert.equal(r.state.themeAppSync.keyRadius, 22);
  const snap = r.currentHistorySnapshot();
  r.state.themeAppSync.keyRadius = 1; r.restoreSnapshot(snap);
  assert.equal(r.state.themeAppSync.keyRadius, 22);
  assert.equal(r.state.iconThemeCatalog[0].thumbnailSvg, '<svg/>');
  r.restoreSnapshot(JSON.stringify({ layout: layout('old') }));
  assert.equal(main(r), 'old'); assert.equal(r.state.themeAppSync.keyRadius, 22);
});

test('占位键保留分体断点，切换类型默认无文字且完全透明', () => {
  const r = loadApp();
  const key = r.normalizeLayoutObject({ default: [[{ type: 'PlaceholderKey', splitAfter: true }]] }).default[0][0];
  assert.equal(key.splitAfter, true); assert.equal(r.editorKeyLabel(key), '·');
  r.element('layout-key-type').value = 'PlaceholderKey';
  r.element('layout-key-main').value = 'x'; r.element('layout-key-alt').value = 'y';
  r.element('layout-key-weight').value = '0.1'; r.element('layout-key-split-after').checked = true;
  r.applyMainFieldsToDraft({ type: 'AlphabetKey', main: 'x' });
  assert.equal(r.element('layout-key-main').value, '');
  assert.equal(r.element('layout-key-alt').value, '');
  assert.equal(r.element('layout-key-transparent').checked, true);
  const decorated = { type: 'PlaceholderKey', main: '标记', transparent: false };
  r.element('layout-key-main').value = '标记'; r.element('layout-key-transparent').checked = false;
  r.applyMainFieldsToDraft(decorated);
  assert.equal(decorated.main, '标记'); assert.equal(decorated.transparent, false);
});

test('辅助栏保存保留合法高度，纵向预览使用 70/30 比例', () => {
  const r = loadApp();
  r.element('layout-key-type').value = 'LayoutSwitchKey';
  r.element('layout-key-label').value = 'ABC'; r.element('layout-key-row-height').value = '70';
  Object.assign(r.keyDialogState, { draft: { type: 'LayoutSwitchKey', rowHeightPercent: 70 }, rowIndex: -1, auxBarMode: true });
  r.updateDraftFromMainFields(); r.normalizeRowHeightKey(r.keyDialogState.draft);
  assert.equal(r.keyDialogState.draft.rowHeightPercent, 70);
  assert.equal(r.keyDialogState.draft.weight, undefined);
  const html = r.buildAuxBarPreviewHtml({ position: 'left', sizePercent: 15 },
    [{ type: 'LayoutSwitchKey', rowHeightPercent: 70 }, { type: 'LayoutSwitchKey', rowHeightPercent: 30 }], '', r.state.themeAppSync);
  assert.match(html, /--aux-key-flex:70/); assert.match(html, /--aux-key-flex:30/);
});

test('辅助栏删除按钮使用注入的删除函数', () => {
  const r = loadApp();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/key-editor-bindings.js'), 'utf8'), r.context);
  let deleted = -1;
  const deps = new Proxy({ el: r.element, keyDialogState: { auxBarKeyIndex: 2 }, deleteAuxBarKey: index => { deleted = index; } },
    { get: (target, key) => target[key] || (() => {}) });
  r.context.window.bindKeyEditorDialogEvents(deps);
  r.element('layout-key-delete').handlers.click(); assert.equal(deleted, 2);
});

test('外部 SVG 只进入 img 的 data URL，原文不插入页面 DOM', () => {
  const r = loadApp();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" onclick="alert(1)"><foreignObject><script>alert(2)</script></foreignObject></svg>';
  const html = r.renderSvgPreviewHtml(svg);
  assert.match(html, /^<img /); assert.doesNotMatch(html, /<svg|<script|<foreignObject|onclick=/);
  const encoded = html.match(/src="data:image\/svg\+xml;charset=utf-8,([^"]+)"/)[1];
  assert.match(decodeURIComponent(encoded), /color="#e8ebf2"/);
  const original = html.match(/data-svg-source="([^"]+)"/)[1];
  assert.equal(decodeURIComponent(original), svg);
});

test('独立 SVG 预览兼容简写命名空间和亮暗文字颜色，保留显式颜色', () => {
  const r = loadApp();
  r.context.getComputedStyle = () => ({ getPropertyValue: () => '#123456' });
  const raw = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h24v24z"/></svg>';
  const html = r.renderSvgPreviewHtml(raw);
  const preview = decodeURIComponent(html.match(/src="data:image\/svg\+xml;charset=utf-8,([^"]+)"/)[1]);
  assert.match(preview, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(preview, /color="#123456"/);
  assert.equal(decodeURIComponent(html.match(/data-svg-source="([^"]+)"/)[1]), raw);
  const colored = r.renderSvgPreviewHtml('<svg xmlns="http://www.w3.org/2000/svg" color="red"/>');
  assert.equal(decodeURIComponent(colored.match(/src="data:image\/svg\+xml;charset=utf-8,([^"]+)"/)[1]), '<svg xmlns="http://www.w3.org/2000/svg" color="red"/>');
});

test('合成态覆盖不改变普通预览主文字的主题颜色', () => {
  const r = loadApp();
  const key = { type: 'LayoutSwitchKey', label: '?123', composeOverride: { type: 'MacroKey', label: '↹' },
    textColorMonet: 'theme:accentKeyTextColor', backgroundColorMonet: 'theme:accentKeyBackgroundColor' };
  const colors = r.resolvePreviewColorsForKey(key);
  assert.equal(colors.textCss, r.argbToCss(r.resolveThemeTokenColor('accentKeyTextColor')));
  assert.notEqual(colors.textCss, colors.backgroundCss);
});

test('存储配额不足时保留上一份完整草稿，并显示失败', () => {
  const r = loadApp();
  r.state.layout = layout('A'); r.saveDraftNow();
  const before = r.storage.get('f5a-editor-draft-v1');
  r.context.localStorage.setItem = () => { throw new Error('quota'); };
  r.state.layout = layout('B'); assert.equal(r.saveDraftNow(), false);
  assert.equal(r.storage.get('f5a-editor-draft-v1'), before);
  assert.match(r.element('draft-save-status').textContent, /保存失败/);
});

test('恢复图片草稿用稳定 ID 读取字节并重建当前页面 URL', async () => {
  const r = loadApp();
  r.context.window.F5aDraftAssets = { load: async ids => {
    assert.deepEqual(Array.from(ids), ['image-a']); return new Map([['image-a', new Blob(['pixel'], { type: 'image/png' })]]);
  } };
  r.storage.set('f5a-editor-draft-v1', JSON.stringify({ layout: layout('A'), themes: [
    { id: 'custom', name: 'Test', colors: {}, backgroundAssetId: 'image-a',
      backgroundImageObject: { srcFilePath: 'Test/bg.png', croppedFilePath: 'Test/bg.png' } }
  ] }));
  assert.equal(await r.restoreDraftFromStorage(), true);
  assert.match(r.state.themeCatalog[0].backgroundImage, /^blob:/);
  assert.equal(JSON.parse(r.currentHistorySnapshot()).themes[0].backgroundAssetId, 'image-a');
  URL.revokeObjectURL(r.state.themeCatalog[0].backgroundImage);
});

test('图片存储不可用、超限时报告明确失败而非伪装成功', async () => {
  const context = { window: {}, Blob, Map, Set };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/draft-assets.js'), 'utf8'), context);
  await assert.rejects(context.window.F5aDraftAssets.save('big', new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]), []), /20 MB/);
  await assert.rejects(context.window.F5aDraftAssets.save('test', new Blob(['pixel']), []), /不支持/);
  const r = loadApp();
  r.context.window.F5aDraftAssets = { save: async () => { throw new Error('禁止存储'); } };
  const url = URL.createObjectURL(new Blob(['pixel']));
  r.state.themeCatalog = [{ id: 'custom', backgroundImage: url }];
  r.registerDraftBackgroundAsset(url, new Blob(['pixel']));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(r.element('draft-save-status').textContent, /未保存.*禁止存储/);
  URL.revokeObjectURL(url);
});

test('普通与分体共用辅助栏，编辑分体不写入变体辅助栏或改动高度', () => {
  const r = loadApp();
  r.state.layout = { rime: { default: layout('Q').default, wanxiang_t9: {
    default: layout('A').default,
    __meta__: { aux_bar: { position: 'left', size_percent: 15, keys: [[{ type: 'MacroKey', label: '，' }]] } },
    '__variant__:split': { default: layout('S').default, __meta__: { keyboard_height_percent: 45 } }
  }, other: { default: layout('B').default, __meta__: { aux_bar: { position: 'top', size_percent: 10 } } } } };
  r.state.selectedBase = 'rime'; r.state.selectedSubmode = 'wanxiang_t9'; r.state.editingSplit = true;
  assert.equal(r.getAuxBarConfig().position, 'left'); assert.equal(r.getAuxBarKeys()[0].label, '，');
  r.setAuxBarConfig('rime', 'wanxiang_t9', { position: 'right', sizePercent: 20 });
  r.setAuxBarKeys('rime', 'wanxiang_t9', [{ type: 'MacroKey', label: '。', rowHeightPercent: 70 }]);
  const schema = r.state.layout.rime.wanxiang_t9;
  assert.equal(schema.__meta__.aux_bar.position, 'right');
  assert.equal(schema.__meta__.aux_bar.keys[0][0].rowHeightPercent, 70);
  assert.equal(schema['__variant__:split'].__meta__.keyboard_height_percent, 45);
  assert.equal(schema['__variant__:split'].__meta__.aux_bar, undefined);
  assert.equal(r.getMetaContainer('rime', 'wanxiang_t9').keyboard_height_percent, undefined,
    '高度设置属于子布局本体，不能读取运行时忽略的分体元数据');
  r.state.editingSplit = false;
  assert.equal(r.getAuxBarConfig().position, 'right'); assert.equal(r.getAuxBarKeys()[0].label, '。');
  r.setAuxBarConfig('rime', 'wanxiang_t9', null); r.setAuxBarKeys('rime', 'wanxiang_t9', []);
  assert.equal(schema.__meta__.aux_bar, undefined);
  assert.equal(r.state.layout.rime.other.__meta__.aux_bar.position, 'top');
});

test('方案 ID 和显示名按原始磁盘键保留，仅有分体排列也可选择', () => {
  const r = loadApp();
  r.state.layout = { rime: { wanxiang_t9: { '__variant__:split': layout('ID').default },
    '万象九键': layout('名称').default }, numeric: { '__variant__:split': layout('1').default } };
  assert.deepEqual(new Set(r.submodeNames('rime')), new Set(['wanxiang_t9', '万象九键']));
  assert.deepEqual(Array.from(r.submodeNames('numeric')), ['default']);
  r.state.selectedBase = 'rime'; r.state.selectedSubmode = 'wanxiang_t9'; r.state.editingSplit = true;
  assert.equal(r.getRows()[0][0].main, 'ID');
  r.setAuxBarConfig('rime', 'wanxiang_t9', { position: 'left', sizePercent: 15 });
  assert.equal(r.state.layout.rime.wanxiang_t9.__meta__.aux_bar.position, 'left');
  assert.equal(r.state.layout.rime['万象九键'].__meta__, undefined);
});

test('分体侧栏和主键采用扣除中缝的同一宽度基准，包括桥接空格行', () => {
  const r = loadApp();
  const row = Array.from({ length: 6 }, () => ({ type: 'AlphabetKey', main: 'A' }));
  for (const position of ['left', 'right']) {
    for (const gap of [0.05, 0.2, 0.6]) {
      const geometry = r.resolveAuxBarPreviewGeometry({ position, sizePercent: 15 }, true, gap);
      assert.ok(Math.abs(geometry.sizePercent / 100 - 0.15 * (1 - gap)) < 1e-12);
      const mainArea = 1 - geometry.sizePercent / 100;
      const result = r.resolveSplitRowLayout(row, gap, true, geometry.keyAreaScale);
      result.widths.forEach(width => assert.ok(Math.abs(mainArea * width - 0.85 * (1 - gap) / 6) < 1e-12));
      const bridge = r.resolveSplitRowLayout([
        { type: 'MacroKey', weight: 0.18 }, { type: 'MacroKey', weight: 0.18 }, { type: 'SpaceKey' },
        { type: 'MacroKey', weight: 0.18 }, { type: 'ReturnKey', weight: 0.18 }
      ], gap, true, geometry.keyAreaScale);
      assert.ok(Math.abs(mainArea * bridge.widths[0] - 0.18 * 0.85 * (1 - gap)) < 1e-12);
      assert.ok(Math.abs(bridge.widths.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    }
  }
  assert.equal(r.resolveAuxBarPreviewGeometry({ position: 'top', sizePercent: 15 }, true, 0.6).sizePercent, 15);
  assert.equal(r.resolveAuxBarPreviewGeometry({ position: 'left', sizePercent: 15 }, false, 0.6).keyAreaScale, 1);
});

test('合成预览替换文字与动作，保持尺寸、基础颜色；开关不改变文档历史', () => {
  const r = loadApp();
  const base = { type: 'LayoutSwitchKey', label: '?123', weight: 0.15, splitAfter: true,
    textColor: -1, backgroundColor: -16776961,
    composeOverride: { type: 'MacroKey', label: 'Esc', swipeDownLabel: '撤销', weight: 0.8,
      textColor: -65536, tap: { macro: [{ type: 'tap', keys: [{ fcitx: 'Escape' }] }] } } };
  r.state.layout = { default: [[base]] }; r.beginHistoryTracking();
  assert.equal(r.resolvePreviewKey(base).key.label, '?123');
  const snapshot = r.currentHistorySnapshot(); r.state.previewComposing = true;
  const active = r.resolvePreviewKey(base);
  assert.equal(active.key.label, 'Esc'); assert.equal(active.key.type, 'MacroKey');
  assert.equal(active.key.weight, 0.15); assert.equal(active.key.splitAfter, true);
  assert.equal(active.key.tap.macro[0].keys[0].fcitx, 'Escape');
  assert.equal(r.resolvePreviewColorsForKey(active.appearanceKey).textCss, 'rgba(255, 255, 255, 1)');
  r.commitHistorySnapshot(); assert.equal(r.history.undoStack.length, 0);
  assert.equal(r.currentHistorySnapshot(), snapshot);
  r.state.previewComposing = false; assert.equal(r.resolvePreviewKey(base).key.label, '?123');
});

test('合成预览独立颜色使用覆盖设置，外观类型仍沿用基础键，辅助栏同样切换', () => {
  const r = loadApp(); r.state.previewComposing = true;
  const base = { type: 'LayoutSwitchKey', label: '?123', textColor: -1, backgroundColor: -16776961,
    composeOverride: { type: 'MacroKey', label: 'Esc', independentColor: true, textColor: -65536 } };
  const active = r.resolvePreviewKey(base);
  assert.equal(active.appearanceKey.type, 'LayoutSwitchKey');
  assert.equal(active.appearanceKey.backgroundColor, undefined);
  assert.equal(r.resolvePreviewColorsForKey(active.appearanceKey).textCss, 'rgba(255, 0, 0, 1)');
  const html = r.buildAuxBarPreviewHtml({ position: 'left', sizePercent: 15 }, [base], '', r.state.themeAppSync);
  assert.match(html, />Esc<\/span>/); assert.doesNotMatch(html, />\?123<\/span>/);
});

test('布局归一化往返保留方案键、分体排列与共用辅助栏', () => {
  const r = loadApp();
  const raw = { rime: { schema_id: { default: layout('Q').default,
    '__variant__:split': layout('S').default,
    __meta__: { aux_bar: { position: 'left', size_percent: 15,
      keys: [[{ type: 'MacroKey', label: ',', rowHeightPercent: 70 }]] } }
  } }, numeric: { default: layout('1').default, '__variant__:split': layout('2').default } };
  const normalized = JSON.parse(JSON.stringify(r.normalizeLayoutObject(structuredClone(raw))));
  assert.deepEqual(Object.keys(normalized), Object.keys(raw));
  const walk = (original, result, at = '') => {
    if (!original || typeof original !== 'object') return;
    if (original['__variant__:split']) assert.deepEqual(result['__variant__:split'], original['__variant__:split'], at);
    if (original.__meta__?.aux_bar) assert.deepEqual(result.__meta__.aux_bar, original.__meta__.aux_bar, at);
    for (const [key, value] of Object.entries(original)) {
      if (!Array.isArray(value)) walk(value, result[key], `${at}/${key}`);
    }
  };
  walk(raw, normalized);
});

test('预览按完整画布固定宽度，辅助栏不能缩窄整个键盘；分体百分比位于共用父级', () => {
  const r = loadApp();
  const root = r.element('layout-preview');
  root.style = { width: '', getPropertyValue: () => '576px' };
  root.closest = () => ({ clientWidth: 800 });
  root.querySelectorAll = () => { throw new Error('不应依赖内部主行宽度'); };
  r.context.window.innerWidth = 1280;
  r.context.getComputedStyle = () => ({ paddingLeft: '10px', paddingRight: '10px' });
  r.pinPreviewContainerWidth(); assert.equal(root.style.width, '596px');
  const config = { position: 'left', sizePercent: 15 };
  const geometry = r.resolveAuxBarPreviewGeometry(config, true, 0.2);
  const html = r.buildAuxBarPreviewHtml(config, [], '', r.state.themeAppSync, geometry);
  assert.match(html, /class="aux-bar-hwrap" style="--aux-bar-size:12%"/);
  r.context.window.innerWidth = 980;
  r.pinPreviewContainerWidth(); assert.equal(root.style.width, '596px');
  root.closest = () => ({ clientWidth: 300 });
  r.context.window.innerWidth = 390;
  r.pinPreviewContainerWidth(); assert.equal(root.style.width, '300px');
});

test('text_editor 内容区按设备度量缩放，40dp 标题栏在内容区外，底栏50dp', () => {
  const r = loadApp();
  const metrics = { maxWidth: 360, targetHeight: 240, topBarHeight: 40 };
  for (const width of [360, 180]) {
    const geometry = r.resolveTextEditorPreviewGeometry(width, metrics);
    assert.equal(geometry.dpScale, width / 360);
    assert.equal(geometry.height, 280 * width / 360);
    assert.equal(geometry.titleHeight, 40 * width / 360);
    assert.equal(geometry.bottomHeight, 50 * width / 360);
  }
  assert.equal(r.resolveTextEditorPreviewGeometry(360, {}).height, 280);
  assert.equal(r.resolveTextEditorPreviewGeometry(360, { targetHeight: 30 }).height, 90,
    '不凭空加入120dp光标区最小高度');
});

test('text_editor 多行共用固定底栏，权重最小 0.5，过滤无动作宏后点击保留原下标', () => {
  const r = loadApp();
  const rows = [[], [{ type: 'MacroKey', label: '无动作' },
    { type: 'MacroKey', label: '<复制>', weight: 0.1, rowHeightPercent: 80, tap: { macro: [] } },
    { type: 'LayoutSwitchKey', label: 'ABC', weight: 1 }], [{ type: 'BackspaceKey' }]];
  const original = JSON.stringify(rows);
  const data = r.resolveTextEditorPreviewRows(rows);
  assert.equal(data.fallback, false); assert.equal(data.rows.length, 2);
  assert.equal(data.rows[0][0].rowIndex, 1); assert.equal(data.rows[0][0].keyIndex, 1);
  const html = r.buildTextEditorPreviewHtml(rows, { height: 240, bottomHeight: 46, dpScale: 1 }, true);
  assert.equal((html.match(/class="text-editor-key-row" style="height:23px"/g) || []).length, 2);
  assert.match(html, /width:33\.33333333333333%;padding:4px/);
  assert.match(html, /data-preview-row="1" data-preview-key="1"/);
  assert.match(html, /&lt;复制&gt;/); assert.doesNotMatch(html, /无动作|<复制>/);
  assert.equal(JSON.stringify(rows), original);
});

test('text_editor 采用逐键颜色与不透明触控板，忽略合成覆盖', () => {
  const r = loadApp(); r.state.previewComposing = true;
  const key = { type: 'MacroKey', label: '复制', tap: { macro: [] }, textColor: -65536,
    backgroundColor: -16711936, composeOverride: { type: 'MacroKey', label: '替换' } };
  const colors = r.textEditorPreviewButtonColors(key, true);
  // FoxyTextEditingUi.createConfiguredButton 先取按键自己的颜色，缺省才回落到主题键色。
  assert.equal(colors.textCss, 'rgba(255, 0, 0, 1)');
  assert.equal(colors.backgroundCss, 'rgba(0, 255, 0, 1)');
  assert.equal(r.textEditorPreviewButtonColors(key, false).backgroundCss, 'transparent');
  const html = r.buildTextEditorPreviewHtml([[key]], { height: 240, bottomHeight: 46, dpScale: 1 }, false);
  assert.match(html, />复制<\/span>/); assert.doesNotMatch(html, /替换/);
  assert.match(html, /border-width:1px/); assert.match(html, /dy="-6"/);
  assert.match(html, /dy="18"/); assert.match(html, /滑动可移动光标/);
  const pad = r.argbToCss((r.resolveThemeTokenColor('keyBackgroundColor') | 0xff000000) >>> 0);
  assert.ok(html.includes(`background:${pad}`));
  assert.equal(r.textEditorPreviewKeyFaceHtml({ type: 'SpaceKey' }), '');
  assert.equal(r.textEditorPreviewKeyFaceHtml({ type: 'PlaceholderKey', alt: '副标签' }), '');
  assert.match(r.textEditorPreviewKeyFaceHtml({ type: 'MiniSpaceKey' }), /<svg/);
  assert.equal(r.textEditorPreviewButtonColors({ type: 'MiniSpaceKey' }, true).backgroundCss,
    r.argbToCss(r.resolveThemeTokenColor('altKeyBackgroundColor')));
});

test('text_editor 空布局显示默认六键，未知类型按 App 回退空格，不写入布局', () => {
  const r = loadApp();
  const empty = [[], [{ type: 'MacroKey', label: '未配置动作' }]];
  const original = JSON.stringify(empty);
  const data = r.resolveTextEditorPreviewRows(empty);
  assert.equal(data.fallback, true); assert.equal(data.rows[0].length, 6);
  assert.equal(data.rows[0][0].key.label, 'ABC');
  const html = r.buildTextEditorPreviewHtml(empty, { height: 240, bottomHeight: 46, dpScale: 1 }, true);
  assert.doesNotMatch(html, /data-preview-row/); assert.match(html, /opacity:0.45/);
  assert.equal(JSON.stringify(empty), original);
  assert.equal(r.resolveTextEditorPreviewRows([[{ type: 'FutureKey' }]]).rows[0][0].key.type, 'SpaceKey');
});

test('text_editor 编辑与预览始终读取普通 default，不写入未使用的分体或方案排列', () => {
  const r = loadApp();
  r.state.layout = { text_editor: { default: layout('D').default, other: layout('O').default,
    '__variant__:split': layout('S').default } };
  r.state.selectedBase = 'text_editor'; r.state.selectedSubmode = 'other'; r.state.editingSplit = true;
  assert.deepEqual(Array.from(r.submodeNames('text_editor')), ['default']);
  assert.equal(r.getRows()[0][0].main, 'D');
  r.setRows('text_editor', 'other', layout('E').default);
  assert.equal(r.state.layout.text_editor.default[0][0].main, 'E');
  assert.equal(r.state.layout.text_editor.other[0][0].main, 'O');
  assert.equal(r.state.layout.text_editor['__variant__:split'][0][0].main, 'S');
});


test('MacroKey 单字母 label 随 Shift 归一化，显式 displayText 保留原样', () => {
  const r = loadApp();
  // App: MacroKey 未写 displayText 时 label 就是默认显示文本，CapsState.None 下强制小写。
  assert.equal(r.previewTitleFromObj({ type: 'MacroKey', label: 'A' }), 'a');
  r.state.previewShift = true;
  assert.equal(r.previewTitleFromObj({ type: 'MacroKey', label: 'A' }), 'A');
  // App: 显式 displayText 不参与 None 的小写归一化，但 Shift 单次态仍把单字母改成大写。
  assert.equal(r.previewTitleFromObj({ type: 'MacroKey', label: 'A', displayText: 'q' }), 'Q');
  r.state.previewShift = false;
  assert.equal(r.previewTitleFromObj({ type: 'MacroKey', label: 'A', displayText: 'q' }), 'q');
  assert.equal(r.previewTitleFromObj({ type: 'AlphabetKey', main: 'Q', displayText: 'Q' }), 'Q');
});

test('旧草稿的按键间距/圆角默认值迁移到 App 真实的 2/3/12', async () => {
  const r = loadApp();
  r.storage.set('f5a-editor-draft-v1', JSON.stringify({
    layout: layout('M'),
    themeAppSync: { keyHGap: 3, keyVGap: 4, keyRadius: 6, borderEnabled: true }
  }));
  await r.restoreDraftFromStorage();
  assert.equal(r.state.themeAppSync.keyHGap, 2);
  assert.equal(r.state.themeAppSync.keyVGap, 3);
  assert.equal(r.state.themeAppSync.keyRadius, 12);
});

test('用户改过任一间距/圆角时不迁移旧默认值', async () => {
  const r = loadApp();
  r.storage.set('f5a-editor-draft-v1', JSON.stringify({
    layout: layout('M'),
    themeAppSync: { keyHGap: 3, keyVGap: 4, keyRadius: 8 }
  }));
  await r.restoreDraftFromStorage();
  assert.equal(r.state.themeAppSync.keyHGap, 3);
  assert.equal(r.state.themeAppSync.keyVGap, 4);
  assert.equal(r.state.themeAppSync.keyRadius, 8);
});

test('预览方向可独立选择，auto 跟随分体且不改变布局内容', () => {
  const r = loadApp();
  r.state.layout = layout('Q');
  const before = JSON.stringify(r.state.layout);
  r.state.previewOrientation = 'auto';
  r.state.previewSplit = false;
  assert.equal(r.resolvePreviewLandscape(), false);
  r.state.previewSplit = true;
  assert.equal(r.resolvePreviewLandscape(), true);
  r.state.previewOrientation = 'portrait';
  assert.equal(r.resolvePreviewLandscape(), false);
  r.state.previewOrientation = 'landscape';
  r.state.previewSplit = false;
  assert.equal(r.resolvePreviewLandscape(), true);
  assert.equal(JSON.stringify(r.state.layout), before);
});

test('旋转预览不会挪用另一方向已量测高度，keyboardHeight 是工具栏下方完整内容区', () => {
  const r = loadApp();
  r.state.themeAppSync.previewMetrics = {
    screenWidthPx: 2400, screenHeightPx: 1080, density: 3, orientation: 'landscape',
    keyboardHeightPx: 540, keyboardHeightPercent: 30, keyboardHeightPercentLandscape: 50,
    kawaiiBarHeightPx: 120,
  };
  const portrait = r.resolvePreviewMetrics(false);
  const landscape = r.resolvePreviewMetrics(true);
  assert.equal(portrait.maxWidth, 360);
  assert.equal(portrait.targetHeight, 240);
  assert.equal(landscape.maxWidth, 800);
  assert.equal(landscape.targetHeight, 180);
  assert.equal(r.resolvePreviewContentHeight([[]], 1.5, 360, portrait), 360,
    '240dp 内容区乘1.5，工具栏位于其外，不再次扣除');
  assert.equal(r.resolvePreviewContentHeight([[]], 1.5, 180, portrait), 180,
    '缩小画布仍使用同一 dp 比例');
  delete r.state.themeAppSync.previewMetrics.keyboardHeightPercentLandscape;
  r.state.themeAppSync.previewMetrics.keyboardHeightPercent = 50;
  assert.equal(r.resolvePreviewMetrics(false).keyboardHeightPercent, 30,
    '桥接只有当前横屏比例时，另一方向使用名义默认，不能当成实测竖屏比例');
  assert.equal(r.resolvePreviewMetrics(true).keyboardHeightPercent, 50);
});

test('键面默认字号与 KeyDefPreset 相符，标点位置只作用于单个 ASCII 字母', () => {
  const r = loadApp();
  for (const type of ['AlphabetKey', 'SymbolKey', 'CommaKey', 'MacroKey']) {
    assert.equal(r.previewMainFontMaxForKey({ type }), 23);
  }
  assert.equal(r.previewMainFontMaxForKey({ type: 'SpaceKey' }), 13);
  assert.equal(r.previewMainFontMaxForKey({ type: 'NumPadKey' }), 16);
  assert.equal(r.resolvePreviewPunctPlacement({ type: 'AlphabetKey', main: 'a', alt: '1' }, 'none', 80), 'none');
  assert.equal(r.resolvePreviewPunctPlacement({ type: 'MacroKey', label: 'A', altLabel: '上' }, 'none', 80), 'bottom');
  assert.equal(r.keySubText({ type: 'MacroKey', longPressLabel: '长按' }), '',
    '长按文字只属于弹出预览，不应被误画成划动副标签');
});

test('顶部和底部辅助栏占内容高度的指定比例，主键区缩小且纵向边距按dp缩放', () => {
  const r = loadApp();
  for (const position of ['top', 'bottom']) {
    const config = { position, sizePercent: 20 };
    const geometry = r.resolveAuxBarPreviewGeometry(config, false, 0.2, 300, 1.5);
    assert.equal(geometry.height, 60);
    assert.equal(geometry.mainHeight, 240);
    const html = r.buildAuxBarPreviewHtml(config, [{ type: 'AlphabetKey', main: 'a' }], '',
      { ...r.state.themeAppSync, keyVGap: 3 }, geometry);
    assert.match(html, /height:60px;--row-height:60px;--key-height:51px;/);
  }
  assert.equal(r.resolveAuxBarPreviewGeometry({ position: 'left', sizePercent: 20 }, false, 0.2, 300).mainHeight, 300);
});

test('有效预览高度按子布局和父布局回退，横屏先用本条目的竖屏值，编辑框不写继承值', () => {
  const r = loadApp();
  r.state.layout = {
    rime: {
      default: [[{ type: 'AlphabetKey', main: 'a' }]],
      __meta__: { keyboard_height_percent: 35, keyboard_height_percent_landscape: 60 },
      '__layer__:number': { default: [[{ type: 'NumPadKey', label: '1' }]], __meta__: { keyboard_height_percent: 40 },
        '__variant__:split': { default: [[{ type: 'NumPadKey', label: '2' }]], __meta__: { keyboard_height_percent: 75 } } },
      child: [[{ type: 'AlphabetKey', main: 'c' }]],
    },
  };
  r.state.selectedBase = 'rime';
  r.state.selectedSubmode = '__layer__:number';
  const before = JSON.stringify(r.state.layout);
  assert.equal(r.resolveEffectivePreviewHeightPercent(true), 40, '子条目竖屏值先于父条目横屏值');
  assert.equal(r.getHeightOverrideLandscape(), '', '编辑框仍显示未设置');
  assert.equal(r.resolvePreviewHeightScale({ keyboardHeightPercent: 49 }, true), 40 / 49);
  r.state.editingSplit = true;
  assert.equal(r.resolveEffectivePreviewHeightPercent(false), 40, '分体元数据不替代窗口高度');
  r.state.selectedSubmode = 'child';
  assert.equal(r.resolveEffectivePreviewHeightPercent(false), 35);
  assert.equal(r.resolveEffectivePreviewHeightPercent(true), 60);
  assert.equal(r.getHeightOverride(), '');
  assert.equal(JSON.stringify(r.state.layout), before);
  r.state.layout.rime.__meta__.keyboard_height_percent_landscape = 10;
  assert.equal(r.resolvePreviewHeightScale({ keyboardHeightPercent: 49 }, true), 10 / 49,
    '合法10%横屏高度不能被0.3倍率下限抬高');
});

test('分享键盘画布复用有效高度、dp与分体几何，占位不绘制，辅助栏切出相同面积', () => {
  const r = loadApp();
  r.state.layout = {
    rime: { default: [[{ type: 'AlphabetKey', main: 'a', weight: 0.5 }, { type: 'PlaceholderKey', weight: 0.5 }]],
      __meta__: { keyboard_height_percent: 40, aux_bar: { position: 'top', size_percent: 20,
        keys: [[{ type: 'AlphabetKey', main: 'x' }]] } },
      '__variant__:split': [[{ type: 'AlphabetKey', main: 's', weight: 0.5 }, { type: 'AlphabetKey', main: 't', weight: 0.5 }]],
    },
  };
  r.state.selectedBase = 'rime';
  r.state.selectedSubmode = 'default';
  r.state.previewKbToolbar = false;
  r.state.previewOrientation = 'portrait';
  const portrait = r.resolveCanvasPreviewGeometry(380);
  const expected = r.resolvePreviewContentHeight(r.getRows(), r.resolvePreviewHeightScale(r.resolvePreviewMetrics(false)), 360, r.resolvePreviewMetrics(false));
  assert.equal(portrait.contentHeight, expected);
  assert.ok(Math.abs(portrait.mainHeight - expected * 0.8) < 1e-9);
  assert.equal(portrait.keys.filter(key => key.auxiliary).length, 1);
  assert.equal(portrait.keys.find(key => key.placeholder).placeholder, true);
  assert.equal(portrait.keys[0].fontSize, 23 * portrait.scale);
  r.state.previewSplit = true;
  r.state.previewOrientation = 'landscape';
  const split = r.resolveCanvasPreviewGeometry(800);
  assert.equal(split.keys[0].main, 's', '分体分享读取它正在显示的分体源');
  assert.ok(split.keys[1].keyX > split.keys[0].keyX + split.keys[0].keyW, '两侧保留分体间隙');
  assert.equal(split.contentHeight, r.resolvePreviewContentHeight(r.getRows(), r.resolvePreviewHeightScale(r.resolvePreviewMetrics(true), true),
    780, r.resolvePreviewMetrics(true)));
});

test('Canvas 真实绘制入口使用合成覆盖和辅助键，跳过占位键且保留完整内容高度', async () => {
  const r = loadApp();
  const calls = [];
  const ctx = new Proxy({ measureText: text => ({ width: String(text).length * 8 }) }, {
    get(target, name) { return name in target ? target[name] : (...args) => calls.push([name, ...args]); },
  });
  r.context.document.createElement = () => ({ width: 0, height: 0, getContext: () => ctx });
  r.state.previewKbToolbar = false;
  r.state.previewComposing = true;
  r.state.layout = { rime: {
    default: [[{ type: 'MacroKey', label: '普通', weight: 0.5, composeOverride: { type: 'MacroKey', label: '合成' } },
      { type: 'PlaceholderKey', main: '不可见', weight: 0.5 }]],
    __meta__: { keyboard_height_percent: 40, aux_bar: { position: 'bottom', size_percent: 20,
      keys: [[{ type: 'MacroKey', label: '辅助' }]] } },
  } };
  r.state.selectedBase = 'rime';
  r.state.selectedSubmode = 'default';
  const canvas = await r.renderPreviewCanvas(380);
  assert.equal(canvas.width, 380);
  assert.ok(canvas.height >= 324, '内容区40%高度304px加导出边距，不能再扣除工具栏');
  const labels = calls.filter(call => call[0] === 'fillText').map(call => call[1]);
  assert.deepEqual(labels, ['合成', '辅助']);
  assert.equal(calls.some(call => call[0] === 'fillText' && call[1] === '不可见'), false);
});

test('原生四项副标签偏好控制方向/侧边/主字符位置，圆点提示不改变原生模型或原文', () => {
  const r = loadApp();
  const down = { type: 'MacroKey', label: '主', swipeDownLabel: ' 下 <标> ' };
  const both = { ...down, swipeUpLabel: ' 上 ' };
  const before = JSON.stringify([down, both]);
  Object.assign(r.state.themeAppSync, { moveMainTextForAltLabel: true, altLabelOnSide: false,
    altLabelSide: 'right', showKeyAltLabels: true });
  const centered = r.resolvePreviewAltTextLayout(down, 'top-right', 80, 1);
  assert.equal(centered.mode, 'bottom', '下滑标签忽略字母标点位置，正常高度时在底部居中');
  assert.equal(centered.moveMain, true);
  assert.equal(centered.labels[0].text, ' 下 <标> ');
  assert.equal(centered.labels[0].position, 'bottom-center');
  const html = r.keySwipeHintHtml(down, centered, { altTextCss: 'rgba(255, 0, 0, 1)' });
  assert.match(html, /> 下 &lt;标&gt; <\/span>/);
  assert.match(html, /color:rgba\(255, 0, 0, 1\)/);
  assert.doesNotMatch(html, /[↑↓]|ellipsis|layout-key-hint/);
  r.state.previewShowHints = false;
  assert.equal(JSON.stringify(r.resolvePreviewAltTextLayout(down, 'top-right', 80, 1)), JSON.stringify(centered));
  r.state.themeAppSync.moveMainTextForAltLabel = false;
  assert.equal(r.resolvePreviewAltTextLayout(down, 'top-right', 80, 1).moveMain, false);
  r.state.themeAppSync.moveMainTextForAltLabel = true;
  const dual = r.resolvePreviewAltTextLayout(both, 'none', 80, 1);
  assert.equal(dual.mode, 'top-bottom');
  assert.equal(dual.moveMain, false, '双标签保持主字符中心，不组成三行flex链');
  assert.deepEqual(Array.from(dual.labels, label => label.position), ['top-center', 'bottom-center']);
  r.state.themeAppSync.altLabelOnSide = true;
  r.state.themeAppSync.altLabelSide = 'left';
  const left = r.resolvePreviewAltTextLayout(both, 'none', 80, 1);
  assert.deepEqual(Array.from(left.labels, label => label.position), ['top-left', 'bottom-left']);
  assert.equal(left.moveMain, false);
  r.state.themeAppSync.showKeyAltLabels = false;
  assert.equal(r.resolvePreviewAltTextLayout(both, 'bottom', 80, 1).mode, 'none');
  assert.equal(r.resolvePreviewAltTextLayout({ type: 'AlphabetKey', main: 'a', alt: '1' }, 'bottom', 80, 1).labels.length, 0);
  assert.equal(JSON.stringify([down, both]), before);
});

test('副标签根据可用键高退角落或隐藏，顶中不移动主字符，只有单ASCII字母读取标点位置', () => {
  const r = loadApp();
  Object.assign(r.state.themeAppSync, { moveMainTextForAltLabel: true, altLabelOnSide: false,
    altLabelSide: 'left', showKeyAltLabels: true });
  const down = { type: 'MacroKey', label: '主', swipeDownLabel: '下' };
  assert.equal(r.resolvePreviewAltTextLayout(down, 'none', 29, 1).mode, 'bottom-right');
  assert.equal(r.resolvePreviewAltTextLayout(down, 'none', 10, 1).mode, 'none');
  const both = { ...down, swipeUpLabel: '上' };
  const compact = r.resolvePreviewAltTextLayout(both, 'none', 29, 1);
  assert.deepEqual(Array.from(compact.labels, label => label.position), ['top-right', 'bottom-right'],
    '关闭手动侧边时，自动退化始终取物理右侧');
  const alphabet = { type: 'AlphabetKey', main: 'a', alt: '1' };
  const top = r.resolvePreviewAltTextLayout(alphabet, 'top-center', 80, 1);
  assert.equal(top.mode, 'top-center');
  assert.equal(top.moveMain, false);
  assert.equal(r.resolvePreviewAltTextLayout(alphabet, 'none', 80, 1).mode, 'none');
  assert.equal(r.resolvePreviewAltTextLayout({ ...alphabet, main: '中' }, 'none', 80, 1).mode, 'bottom');
});

test('Canvas副标签和DOM使用同一原文/定位模型，关闭显示副标签后主字符回到中心', async () => {
  const r = loadApp();
  const calls = [];
  const ctx = new Proxy({ measureText: text => ({ width: String(text).length * 8 }) }, {
    get(target, name) { return name in target ? target[name] : (...args) => calls.push([name, ...args]); },
  });
  r.context.document.createElement = () => ({ width: 0, height: 0, getContext: () => ctx });
  r.state.previewKbToolbar = false;
  r.state.layout = { default: [[{ type: 'MacroKey', label: '主', weight: 1, swipeDownLabel: ' 下 ' }]] };
  r.state.selectedBase = 'default';
  r.state.selectedSubmode = 'default';
  Object.assign(r.state.themeAppSync, { moveMainTextForAltLabel: true, showKeyAltLabels: true, altLabelOnSide: false });
  await r.renderPreviewCanvas(380);
  const mainBefore = calls.find(call => call[0] === 'fillText' && call[1] === '主');
  const downBefore = calls.find(call => call[0] === 'fillText' && call[1] === ' 下 ');
  assert.ok(mainBefore && downBefore);
  assert.ok(downBefore[3] > mainBefore[3]);
  assert.equal(calls.some(call => call[0] === 'fillText' && /^[↑↓]/.test(call[1])), false);
  calls.length = 0;
  r.state.themeAppSync.showKeyAltLabels = false;
  await r.renderPreviewCanvas(380);
  assert.deepEqual(calls.filter(call => call[0] === 'fillText').map(call => call[1]), ['主']);
  assert.ok(calls.find(call => call[0] === 'fillText' && call[1] === '主')[3] > mainBefore[3]);
});

test('副标签标点规则使用源character，显式displayText只在MacroKey空label时成为character', () => {
  const r = loadApp();
  assert.equal(r.previewCharacterForKey({ type: 'AlphabetKey', main: '中', displayText: 'A' }), '中');
  assert.equal(r.previewCharacterForKey({ type: 'AlphabetKey', main: 'a', displayText: '中' }), 'a');
  assert.equal(r.previewCharacterForKey({ type: 'MacroKey', label: '主', displayText: 'A' }), '主');
  assert.equal(r.previewCharacterForKey({ type: 'MacroKey', label: '', displayText: 'A' }), 'A');
  r.state.selectedSubmode = 'schema';
  assert.equal(r.previewCharacterForKey({ type: 'MacroKey', label: '', displayText: { other: 'Z', schema: 'B', default: 'C' } }), 'B');
  assert.equal(r.previewCharacterForKey({ type: 'MacroKey', label: '', displayText: { other: 'Z', '': 'D' } }), 'D');
  assert.equal(r.previewCharacterForKey({ type: 'MacroKey', label: '', displayText: { other: 'Z' } }), '',
    '未命中当前源/default/空回退，不能拿其它方案第一项判断字符');
  assert.equal(r.resolvePreviewAltTextLayout({ type: 'AlphabetKey', main: '中', displayText: 'A', alt: '1' }, 'none', 80).mode, 'bottom');
  assert.equal(r.resolvePreviewAltTextLayout({ type: 'AlphabetKey', main: 'a', displayText: '中', alt: '1' }, 'none', 80).mode, 'none');
});
