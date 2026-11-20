/* 按键图标槽位：目录、自动推断、预览与颜色字面量。
 * 对照 app 的 IconTheme.ALL_SLOTS（114）与 ColorLiteral.kt 的解析规则。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./dom-app-harness.cjs');

test('图标槽位目录覆盖 app 的 114 个槽位', () => {
  const { api } = loadApp();
  const all = api.iconThemeSlotsAll;
  assert.equal(all.length, 114);
  assert.equal(new Set(all).size, 114, '槽位不能重复');
  assert.equal(api.iconThemeSlotSections.reduce((n, s) => n + s.slots.length, 0), 114);
  assert.equal(JSON.stringify(api.iconThemeSlotSections.map((s) => s.slots.length)), JSON.stringify([28, 6, 26, 20, 26, 8]));
  for (const slot of ['keys.letter.q', 'keys.numpad.add', 'text_editor.layout', 'toolbar.split_keyboard', 'system.clipboard_search']) {
    assert.ok(all.includes(slot), `缺少槽位 ${slot}`);
  }
  assert.equal(api.iconThemeSlotSupportsText('toolbar.undo'), true);
  assert.equal(api.iconThemeSlotSupportsText('keys.letter.q'), false);
  assert.equal(api.isIconThemeSvgOnlySlot('text_editor.cut'), true);
  assert.equal(api.isIconThemeSvgOnlySlot('system.back'), false);
});

test('自动槽位推断与 app 的 letterIconSlotOf 条件一致', () => {
  const { api } = loadApp();
  const auto = api.automaticIconSlotOf;
  assert.equal(auto({ type: 'AlphabetKey', main: 'q' }), 'keys.letter.q');
  assert.equal(auto({ type: 'AlphabetKey', main: 'Q' }), 'keys.letter.q');
  assert.equal(auto({ type: 'AlphabetKey', main: '1' }), null);
  assert.equal(auto({ type: 'CapsKey' }), 'keys.capslock.none');
  assert.equal(auto({ type: 'BackspaceKey' }), 'keys.backspace');
  assert.equal(auto({ type: 'ReturnKey' }), 'keys.return.default');
  assert.equal(auto({ type: 'LanguageKey' }), 'keys.language');
  assert.equal(auto({ type: 'MiniSpaceKey' }), 'keys.space');
  assert.equal(auto({ type: 'CommaKey' }), 'keys.emoji');
  const macro = (label, steps) => ({ type: 'MacroKey', label, tap: { macro: steps } });
  const tap = (keys) => [{ type: 'tap', keys }];
  assert.equal(auto(macro('q', tap([{ fcitx: 'q' }]))), 'keys.letter.q');
  assert.equal(auto({ type: 'MacroKey', displayText: 'Q', label: 'x', tap: { macro: tap([{ fcitx: 'q' }]) } }), 'keys.letter.q');
  assert.equal(auto(macro('q', tap([{ fcitx: 'w' }]))), null);
  assert.equal(auto(macro('q', tap([{ fcitx: 'q' }, { fcitx: 'w' }]))), null);
  assert.equal(auto(macro('q', tap([{ fcitx: 'q' }]).concat([{ type: 'text', text: 'x' }]))), null);
  assert.equal(auto(macro('1', tap([{ fcitx: 'q' }]))), null);
});

test('显式槽位优先于自动推断，未知显式值原样保留', () => {
  const { api } = loadApp();
  const key = { type: 'AlphabetKey', main: 'q', iconSlot: 'toolbar.undo' };
  assert.equal(api.explicitIconSlotOf(key), 'toolbar.undo');
  assert.equal(api.effectiveIconSlotOf(key), 'toolbar.undo');
  assert.equal(api.effectiveIconSlotOf({ type: 'AlphabetKey', main: 'q', iconSlot: ' ' }), 'keys.letter.q');
  assert.equal(api.effectiveIconSlotOf({ type: 'AlphabetKey', main: 'q', iconSlot: 'custom.unknown' }), 'custom.unknown');
});

test('预览按当前图标主题渲染 mask / img / 文本', () => {
  const { api } = loadApp();
  const theme = api.currentIconThemeEntry();
  const key = { type: 'AlphabetKey', main: 'q' };
  assert.equal(api.keyIconPreviewHtml(key), '');
  theme.icons['keys.letter.q'] = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M2 2h20v20H2z"/></svg>';
  let html = api.keyIconPreviewHtml(key);
  assert.match(html, /layout-key-icon-mask/, '单色 SVG 应走 mask 跟随文字色');
  theme.icons['keys.letter.q'] = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#f5dfe4"/></svg>';
  html = api.keyIconPreviewHtml(key);
  assert.match(html, /<img[^>]+layout-key-icon/, '自带颜色应走 img 保留原色');
  theme.icons['keys.letter.q'] = '🌐';
  html = api.keyIconPreviewHtml(key);
  assert.match(html, /layout-key-icon-text/);
});

test('图标主题面板渲染全部 114 个槽位并支持筛选', () => {
  const { api, doc } = loadApp();
  api.renderIconThemeSlots();
  const root = doc.getElementById('icon-theme-slots');
  assert.equal(root.querySelectorAll('.icon-slot-row').length, 114);
  assert.match(doc.getElementById('icon-theme-slot-count-hint').textContent, /114/);
  api.state.iconThemeSlotFilter = 'letter.q';
  api.renderIconThemeSlots();
  assert.equal(root.querySelectorAll('.icon-slot-row').length, 1);
  assert.equal(root.querySelector('.icon-slot-row').dataset.slot, 'keys.letter.q');
  api.state.iconThemeSlotFilter = 'zzz-no-such-slot';
  api.renderIconThemeSlots();
  assert.equal(root.querySelectorAll('.icon-slot-row').length, 0);
  assert.match(root.innerHTML, /data-icon-slot-filter-reset/);
});

test('颜色字面量支持 #RGB/#ARGB/#RRGGBB/#AARRGGBB', () => {
  const { api } = loadApp();
  const parse = api.parseColorValue;
  assert.equal(parse('#abc'), -5588020);
  assert.equal(parse('#8abc'), -2002076724);
  assert.equal(parse('#112233'), -15654349);
  assert.equal(parse('#88112233'), -2012143053);
  assert.equal(parse('112233'), -15654349);
  assert.equal(parse('0x11223344'), 0x11223344);
  assert.equal(parse('123'), 123);
  assert.equal(parse('  #fff  '), -1);
  assert.throws(() => parse('#12'), /颜色格式无效/);
  assert.throws(() => parse('abc'), /颜色必须是整数/);
});
