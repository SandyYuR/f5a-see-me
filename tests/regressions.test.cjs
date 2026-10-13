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
    window.testApi = { state, history, keyDialogState, beginHistoryTracking, commitHistorySnapshot, scheduleHistoryCommit, undo, redo, saveDraftNow, currentHistorySnapshot, restoreSnapshot, normalizeLayoutObject, applyMainFieldsToDraft, updateDraftFromMainFields, normalizeRowHeightKey, renderSvgPreviewHtml, resolvePreviewColorsForKey, resolveThemeTokenColor, argbToCss, buildAuxBarPreviewHtml, editorKeyLabel, restoreDraftFromStorage, registerDraftBackgroundAsset, resolveSplitRowLayout, getAuxBarConfig, getAuxBarKeys, setAuxBarConfig, setAuxBarKeys, getMetaContainer, submodeNames, getRows, setRows, getVariantRows, pinPreviewContainerWidth };
  `;
  const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.ok(source.includes('\n  main();'));
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
