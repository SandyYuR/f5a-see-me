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
    syncLayoutUiFromState = renderThemeList = renderThemeEditor = syncThemeJsonFromState = () => {};
    renderPopupEditor = syncPopupJsonFromState = renderIconThemeEditor = syncIconThemeJsonFromState = () => {};
    syncPreviewToolbarUi = syncThemeAppSyncUiFromState = refreshKeyDialogSummaries = () => {};
    window.testApi = { state, history, keyDialogState, beginHistoryTracking, commitHistorySnapshot,
      scheduleHistoryCommit, undo, redo, saveDraftNow, currentHistorySnapshot, restoreSnapshot,
      normalizeLayoutObject, applyMainFieldsToDraft, updateDraftFromMainFields, normalizeRowHeightKey,
      renderSvgPreviewHtml, resolvePreviewColorsForKey, resolveThemeTokenColor, argbToCss,
      buildAuxBarPreviewHtml, editorKeyLabel, restoreDraftFromStorage, registerDraftBackgroundAsset,
      resolvePreviewKey, resolveAuxBarPreviewGeometry, resolveSplitRowLayout, getAuxBarConfig, getAuxBarKeys,
      setAuxBarConfig, setAuxBarKeys, getMetaContainer, submodeNames, getRows, setRows, getVariantRows,
      pinPreviewContainerWidth, resolveTextEditorPreviewRows, resolveTextEditorPreviewGeometry,
      buildTextEditorPreviewHtml, textEditorPreviewButtonColors, textEditorPreviewKeyFaceHtml };
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
  r.undo(); assert.equal(r.state.themeAppSync.keyRadius, 6);
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
  assert.equal(r.getMetaContainer('rime', 'wanxiang_t9').keyboard_height_percent, 45);
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
  r.context.window.innerWidth = 390; r.pinPreviewContainerWidth(); assert.equal(root.style.width, '');
});

test('text_editor 总高跟随设备，底栏固定 46dp，窄屏同比缩放并保底 120dp', () => {
  const r = loadApp();
  const metrics = { screenWidthPx: 1080, keyboardHeightPx: 720, density: 3 };
  for (const width of [360, 180]) {
    const geometry = r.resolveTextEditorPreviewGeometry(width, metrics);
    assert.equal(geometry.dpScale, width / 360);
    assert.equal(geometry.height, width * 2 / 3);
    assert.equal(geometry.bottomHeight, 46 * width / 360);
  }
  assert.equal(r.resolveTextEditorPreviewGeometry(360, { ...metrics, keyboardHeightPx: 30 }).height, 120);
  assert.equal(r.resolveTextEditorPreviewGeometry(360, null).height, 240);
  assert.equal(r.resolveTextEditorPreviewGeometry(360, { keyboardHeightPx: 720 }).height, 240);
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

test('text_editor 采用主题按钮与不透明触控板，忽略合成覆盖和逐键颜色', () => {
  const r = loadApp(); r.state.previewComposing = true;
  const key = { type: 'MacroKey', label: '复制', tap: { macro: [] }, textColor: -65536,
    backgroundColor: -16711936, composeOverride: { type: 'MacroKey', label: '替换' } };
  const colors = r.textEditorPreviewButtonColors(key, true);
  assert.equal(colors.textCss, r.argbToCss(r.resolveThemeTokenColor('keyTextColor')));
  assert.equal(colors.backgroundCss, r.argbToCss(r.resolveThemeTokenColor('keyBackgroundColor')));
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
