/* DOM stub 冒烟：加载 app.js 后逐个调用 testApi 里的渲染/预览函数，
 * 验证① 加载本身不抛异常；② 各渲染函数在当前状态下不抛且产出非空。
 * 与 regressions.test.cjs 用同一套 vm 加载方式（不复制实现，只隔离页面启动）。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

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
  assert.ok(source.includes('\n  main();'), 'app.js 应含 main(); 调用点');
  vm.runInNewContext(source.replace('\n  main();', hook), context, { filename: 'app.js' });
  return { ...context.window.testApi, context, storage, element, flush: () => { while (tasks.length) tasks.shift()(); } };
}

test('冒烟：app.js 加载完成且 testApi 全部导出可用', () => {
  const r = loadApp();
  // 状态对象
  for (const k of ['state', 'history', 'keyDialogState']) {
    assert.equal(typeof r[k], 'object', k + ' 应是状态对象');
    assert.ok(r[k] !== null, k + ' 不应为 null');
  }
  // 渲染与工具函数
  for (const k of ['undo', 'redo', 'normalizeLayoutObject', 'buildAuxBarPreviewHtml',
    'buildTextEditorPreviewHtml', 'renderSvgPreviewHtml', 'resolveThemeTokenColor',
    'argbToCss', 'resolvePreviewKey']) {
    assert.equal(typeof r[k], 'function', k + ' 应是可调用函数');
  }
});

test('冒烟：预览类渲染函数在默认状态下产出非空 HTML 且不抛', () => {
  const r = loadApp();
  /* 按真实签名调用：buildTextEditorPreviewHtml(rows, geometry, borderEnabled)、
   * buildAuxBarPreviewHtml(auxBarConfig, auxBarKeys, rowsHtml, cfg[, geometry])。
   * 空 rows 走 fallback 分支（App 默认编辑按钮），正是要覆盖的那条路径。 */
  const geo = r.resolveTextEditorPreviewGeometry(360);
  const html = r.buildTextEditorPreviewHtml([], geo, false);
  assert.equal(typeof html, 'string');
  assert.ok(html.includes('text-editor-preview-frame'), '应产出 text_editor 预览骨架');
  assert.ok(html.includes('text-editor-key-row'), '空布局应走 fallback 渲染出默认编辑按钮行');

  const auxKeys = [{ type: 'AlphabetKey', main: 'A' }, { type: 'AlphabetKey', main: 'B' }];
  const aux = r.buildAuxBarPreviewHtml({ position: 'bottom' }, auxKeys, '<div>x</div>', { borderEnabled: true, borderOutline: false });
  assert.equal(typeof aux, 'string');
  assert.ok(aux.length > 0, 'buildAuxBarPreviewHtml 产出不应为空');

  const svg = r.renderSvgPreviewHtml('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>');
  assert.ok(svg.includes('svg'), 'renderSvgPreviewHtml 应产出含 svg 的串');
});

test('冒烟：主题色解析与预览配色在各状态下不抛', () => {
  const r = loadApp();
  const c = r.resolveThemeTokenColor('keyBackgroundColor');
  assert.ok(c !== undefined && c !== null, 'keyBackgroundColor 应能解析');
  const css = r.argbToCss(c);
  assert.equal(typeof css, 'string');
});
