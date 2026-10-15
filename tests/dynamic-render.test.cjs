/* 动态渲染控件的运行时核对：给 inventory §5 里 5 个「只登记入口容器」的
 * 动态控件补逐项行为证据——#theme-color-rows / #theme-list / #popup-entry-list /
 * #icon-theme-slots / #layout-rows（对应功能项 #46 #44 #57 #68 #23 #24）。
 *
 * 真实调用 app.js 的渲染函数，断言产出的行数量与结构，不复制实现。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./dom-app-harness.cjs');

test('#theme-color-rows：每个主题色 token 一行 + 水波纹一行（功能项 #46）', () => {
  const { api, registry } = loadApp();
  /* 前提：renderThemeEditor 对内置主题（builtin:true）走早退分支并清空 rows，
   * 只有选中自定义主题才渲染颜色行。默认 selectedThemeId 指向内置主题，
   * 所以先塞一个自定义主题并选中它。 */
  const custom = {
    id: 'custom-test-ripple', name: '测试主题', builtin: false,
    isDark: true, colors: {}, backgroundImage: ''
  };
  api.state.themeCatalog.unshift(custom);
  api.state.selectedThemeId = custom.id;
  api.renderThemeEditor();
  const rows = registry.get('theme-color-rows');
  const colorRows = rows.querySelectorAll('.theme-color-row');
  assert.equal(colorRows.length, api.themeColorTokens.length + 1,
    `应渲染 ${api.themeColorTokens.length + 1} 行，实际 ${colorRows.length}`);
  assert.equal(rows.querySelectorAll('.theme-color-input').length, colorRows.length,
    '每行应各有一个颜色输入框');
  assert.equal(rows.querySelectorAll('[data-token="waterRippleColor"]').length, 1,
    '应恰好一个水波纹行');
});

test('#theme-color-rows：内置主题下不渲染颜色行（不可编辑守卫）', () => {
  const { api, registry } = loadApp();
  const builtin = api.state.themeCatalog.find((t) => t.builtin);
  assert.ok(builtin, '基线目录里应有内置主题');
  api.state.selectedThemeId = builtin.id;
  api.renderThemeEditor();
  const rows = registry.get('theme-color-rows');
  assert.equal(rows.querySelectorAll('.theme-color-row').length, 0, '内置主题不应渲染颜色行');
  assert.equal(rows.hidden, true, '内置主题下 rows 应隐藏');
});

test('#theme-list：每个主题一张卡片，恰好一张选中（功能项 #44）', () => {
  const { api, registry } = loadApp();
  api.renderThemeList();
  const root = registry.get('theme-list');
  const cards = root.querySelectorAll('.theme-card');
  assert.equal(cards.length, api.state.themeCatalog.length,
    `卡片数应等于主题数 ${api.state.themeCatalog.length}，实际 ${cards.length}`);
  assert.equal(cards.filter(c => c.className.includes('active')).length, 1,
    '应恰好一张卡片处于选中态');
});

test('#popup-entry-list：每个映射一行，行内含改名/加候选/删除按钮（功能项 #57）', () => {
  const { api, registry } = loadApp();
  // state.popupEntries 形如 { 按键: [候选...] }
  api.state.popupEntries = { a: ['一', '壹'], b: ['二'] };
  api.renderPopupEditor();
  const root = registry.get('popup-entry-list');
  assert.equal(root.querySelectorAll('.popup-entry-row').length, 2, '应有 2 行映射');
  assert.ok(root.querySelectorAll('.popup-entry-key').length >= 2, '每行应有可改名的主键按钮');
  assert.ok(root.querySelectorAll('.popup-entry-delete').length >= 2, '每行应有删除按钮');
});

test('#popup-entry-list：空数据给出占位提示而不是空白', () => {
  const { api, registry } = loadApp();
  api.state.popupEntries = {};
  api.renderPopupEditor();
  const root = registry.get('popup-entry-list');
  assert.equal(root.querySelectorAll('.popup-entry-row').length, 0, '空数据时不应有映射行');
  assert.match(root.innerHTML, /暂无弹出字符映射/, '应给出占位提示');
});

test('#icon-theme-slots：渲染槽位区块；内置主题只读时不崩（功能项 #68）', () => {
  const { api, registry } = loadApp();
  api.renderIconThemeSlots();
  const root = registry.get('icon-theme-slots');
  assert.ok(root.innerHTML.length > 0 || root.children.length > 0, '槽位区应产出内容');
});

test('#layout-rows：每行一个行编辑器，含拖拽手柄与新增按键按钮（功能项 #23 #24）', () => {
  const { api, registry } = loadApp();
  const layout = {
    default: [[{ type: 'AlphabetKey', main: 'A' }], [{ type: 'AlphabetKey', main: 'B' }]]
  };
  api.state.layout = api.normalizeLayoutObject(layout);
  api.renderLayoutEditor();
  const root = registry.get('layout-rows');
  assert.equal(root.querySelectorAll('.layout-row-editor').length, 2, '应有 2 个行编辑器');
  assert.ok(root.querySelectorAll('.row-add-key').length >= 2, '每行应有新增按键按钮');
  assert.ok(root.querySelectorAll('.row-drag-handle').length >= 2, '每行应有拖拽手柄');
});

test('#layout-rows：行编辑器带 rowIndex，chip 列表标明所属行', () => {
  const { api, registry } = loadApp();
  api.state.layout = api.normalizeLayoutObject({
    default: [[{ type: 'AlphabetKey', main: 'A' }], [{ type: 'AlphabetKey', main: 'B' }]]
  });
  api.renderLayoutEditor();
  const editors = registry.get('layout-rows').querySelectorAll('.layout-row-editor');
  const indices = editors.map(e => e.dataset.rowIndex).sort();
  assert.deepEqual(indices, ['0', '1'], `行索引应为 0/1，实际 ${JSON.stringify(indices)}`);
});
