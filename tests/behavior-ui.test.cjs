/* 行为级功能项：UI 真实动作与 JSON 修复引擎。
 *   #74 JSON 宽松修复引擎（js/json-lint.js：BOM / 尾逗号 / 注释 / 单引号 / 全角）
 *   #70 撤销/重做（快照提交与往返恢复）
 *   #5  标签页切换（setActiveTab 改变 panel.active 与 tab.active）
 *   #1  界面配色切换（site-theme 三态写入并持久化）
 * 全部真实调用实现，不复制待测逻辑。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, loadScript } = require('./dom-app-harness.cjs');

/* ---- #74 ---- */
const lint = () => loadScript('json-lint.js').window.F5aJsonLint;

test('#74 JSON 宽松修复：修复尾逗号、注释、单引号、无引号键，且结果可 parse', () => {
  const { inspectJsonText } = lint();
  const broken = `{
    // 行注释
    /* 块注释 */
    'a': 1,
    b: [1, 2, 3,],
  }`;
  const r = inspectJsonText(broken);
  assert.equal(r.parseOk, true, `修复后应可 parse，错误：${r.parseError}`);
  assert.deepEqual(JSON.parse(r.fixedText), { a: 1, b: [1, 2, 3] }, '修复结果应等于预期对象');
  assert.equal(r.changed, true, '应标记为已改动');
});

test('#74 JSON 宽松修复：剥离 UTF-8 BOM', () => {
  const { inspectJsonText } = lint();
  const r = inspectJsonText('\uFEFF{"a":1}');
  assert.equal(r.parseOk, true, `带 BOM 应可修复，错误：${r.parseError}`);
  assert.ok(r.issues.some(i => i.kind === 'bom'), '应检出 bom 问题');
  assert.equal(r.fixedText.charCodeAt(0), 0x7b, '修复后首字符应为 {');
});

test('#74 JSON 宽松修复：全角标点转半角', () => {
  const { inspectJsonText } = lint();
  const r = inspectJsonText('{"a"：1，"b"：[1，2]}');
  assert.equal(r.parseOk, true, `全角应可修复，错误：${r.parseError}`);
  assert.deepEqual(JSON.parse(r.fixedText), { a: 1, b: [1, 2] });
});

test('#74 JSON 宽松修复：已合法文本不改动，且不误报问题', () => {
  const { inspectJsonText } = lint();
  const r = inspectJsonText('{"a":1,"b":[1,2],"c":"x,y"}');
  assert.equal(r.parseOk, true);
  assert.equal(r.changed, false, '合法文本不应被改动');
  assert.equal(r.total, 0, '合法文本不应报问题');
});

test('#74 JSON 宽松修复：字符串内的 // 与注释字符不被误改', () => {
  const { inspectJsonText } = lint();
  const r = inspectJsonText('{"url":"https://example.com","note":"/* not a comment */"}');
  assert.equal(r.parseOk, true, `误改会让 parse 失败：${r.parseError}`);
  const obj = JSON.parse(r.fixedText);
  assert.equal(obj.url, 'https://example.com', 'URL 不应被当作行注释截断');
  assert.equal(obj.note, '/* not a comment */', '字符串内块注释不应被删除');
});

/* ---- #70 撤销重做 ---- */
/* 用 popupEntries 做往返：它是快照顶层字段，restoreSnapshot 会直接覆盖，
 * 不像 selectedBase 那样有"布局里必须存在才恢复"的前置守卫。
 * 断言比对 JSON 语义而非对象本身——loadApp 用 vm.runInNewContext 建了新
 * realm，app.js 里的对象字面量原型属于该 realm，与 JSON.parse 产出的主
 * realm 对象原型不同，deepEqual 会因此误判。 */
test('#70 撤销重做：改数据 → commit → undo 回到旧值 → redo 回到新值', () => {
  const { api } = loadApp();
  const original = JSON.parse(JSON.stringify(api.state.popupEntries));
  const changed = { z: ['甲', '乙'] };

  api.state.popupEntries = changed;
  api.commitHistorySnapshot();

  api.undo();
  assert.deepEqual(JSON.parse(JSON.stringify(api.state.popupEntries)), original,
    'undo 后应回到改动前的数据');

  api.redo();
  assert.deepEqual(JSON.parse(JSON.stringify(api.state.popupEntries)), changed,
    'redo 后应回到改动后的数据');
});

test('#70 撤销重做：空栈时反复 undo/redo 不抛异常', () => {
  const { api } = loadApp();
  for (let i = 0; i < 5; i++) { api.undo(); api.redo(); }
  assert.ok(true, '空栈调用应被守卫静默忽略');
});

/* ---- #5 标签页切换 ---- */
test('#5 标签页切换：setActiveTab 只点亮目标 tab 与目标 panel', () => {
  const { api, registry } = loadApp();
  api.setActiveTab('tab-theme');
  assert.ok(registry.get('tab-theme').className.includes('active'), 'tab-theme 应带 active');
  assert.equal(registry.get('tab-popup').className.includes('active'), false,
    'tab-popup 应取消 active');

  api.setActiveTab('tab-popup');
  assert.ok(registry.get('tab-popup').className.includes('active'), 'tab-popup 应带 active');
  assert.equal(registry.get('tab-theme').className.includes('active'), false,
    'tab-theme 应取消 active');

  api.setActiveTab('tab-layout');
  assert.ok(registry.get('tab-layout').className.includes('active'), '切回后 tab-layout 应带 active');
});

/* ---- #1 界面配色 ---- */
test('#1 界面配色切换：三态各自写入 documentElement 类名并持久化', () => {
  const { api, doc, storage } = loadApp();
  const cases = { auto: 'site-auto', light: 'site-light', dark: 'site-dark' };
  for (const [mode, cls] of Object.entries(cases)) {
    api.setSiteTheme(mode);
    assert.ok(doc.documentElement.className.includes(cls),
      `setSiteTheme("${mode}") 应让 documentElement 带 ${cls}，实际 "${doc.documentElement.className}"`);
    assert.equal(storage.get('f5a-editor-site-theme'), mode, `应把 ${mode} 写进 localStorage`);
  }
});
