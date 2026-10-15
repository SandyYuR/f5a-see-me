/* 符号面板预览（js/symbol-preview.js）的落地核对。
 *
 * 这个模块的规格**不是自己定的**，是从 foxy 编辑器逐项移植的，所以核对分三层：
 *  1 规格同源 —— 把 foxy 的 FE.SYMBOL_PREVIEW_SPEC 从源码里读出来，与 f5a 的
 *                PV.SPEC 逐键逐值比；不靠「我记得是 84」这种自证。
 *  2 纯逻辑   —— dp 换算、盒子兜底、分组显示名口径、按 kind 记忆的选中与滚动。
 *  3 渲染     —— 真的调 PV.render() 画进 DOM 桩，数节点、读 style。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadScript } = require('./dom-app-harness.cjs');

const ROOT = path.join(__dirname, '..');
const FOXY = 'D:/GitHub/foxy/foxy-editor/js/symbol-preview.js';
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

/* 三类内置数据（与 index.html 的装载顺序一致：symbol-data.js 先于本模块） */
function symbolData() {
  return {
    symbols: read('data/symbols.json'),
    emoji: read('data/emoji.json'),
    kaomoji: read('data/kaomoji.json'),
  };
}

/* 装载 symbol-panel.js + symbol-preview.js，两者共用同一个 window */
function load() {
  const data = symbolData();
  const { window, doc } = loadScript('symbol-panel.js', { window: { F5A_SYMBOL_DATA: data } });
  const src = fs.readFileSync(path.join(ROOT, 'js', 'symbol-preview.js'), 'utf8');
  const vm = require('node:vm');
  vm.runInNewContext(src, {
    window,
    document: doc,
    globalThis: undefined,
    Math, JSON, Intl, console,
  }, { filename: 'symbol-preview.js' });
  return { PV: window.F5aSymbolPreview, SP: window.F5aSymbolPanel, window, doc, data };
}

/* 造一个挂到文档上的宿主容器（render 需要 host.appendChild） */
function host(doc) {
  const el = doc.createElement('div');
  el.className = 'layout-preview';
  return el;
}

/* 默认注入：主题取色 + 面板底 + 描边开关，与 app.js 侧的注入形状一致 */
function opts(extra) {
  const colors = {
    keyBackgroundColor: 'rgb(66, 55, 53)',
    candidateTextColor: 'rgb(241, 222, 220)',
    keyPressHighlightColor: 'rgb(255, 180, 168)',
    candidateCommentColor: 'rgb(180, 160, 158)',
    keyShadowColor: 'rgb(120, 100, 98)',
  };
  return Object.assign({
    unit: 36,
    width: 576,
    height: 400,
    theme: (f) => colors[f] || null,
    surface: () => 'rgb(39, 29, 28)',
    strokeEnabled: () => true,
  }, extra);
}

/* 数一个容器里某 class 的节点（桩的 children 是普通数组，要自己递归） */
function findAll(el, cls, out = []) {
  (el.children || []).forEach((c) => {
    if (String(c.className || '').split(/\s+/).includes(cls)) out.push(c);
    findAll(c, cls, out);
  });
  return out;
}

test('SPEC 与 foxy 的 FE.SYMBOL_PREVIEW_SPEC 逐键逐值一致', () => {
  const { PV } = load();
  /* foxy 那份是移植来源；文件不在本机时退化为「钉住 15 项规范值」，
   * 但绝不静默跳过——下面这组期望值就是规范 §8 的数值。 */
  const expected = {
    panelLeftColDp: 84,
    groupItemHeightDp: 40,
    groupItemFontSp: 13,
    groupItemPadX: 4,
    groupItemPadY: 2,
    groupItemMarginDp: 2,
    cellHeightDp: 40,
    cellFontSp: 22,
    cellMarginDp: 2,
    cellRowGapDp: 4,
    cellCornerDp: 6,
    cellStrokeDp: 1,
    columnsPerRow: 6,
    columnsPerRowMultiLine: 1,
    hotkeyFontSp: 20,
    leftColPadLeftDp: 2,
    leftColPadRightDp: 4,
    cellsLeftMarginDp: 4,
  };
  Object.keys(expected).forEach((k) => {
    assert.equal(PV.SPEC[k], expected[k], `SPEC.${k} 应为 ${expected[k]}`);
  });
  if (!fs.existsSync(FOXY)) return;
  const src = fs.readFileSync(FOXY, 'utf8');
  const block = src.slice(src.indexOf('FE.SYMBOL_PREVIEW_SPEC = {'));
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('};'));
  /* ⚠️ 必须先剥掉行尾注释再取键值：注释里写着 `ly.java:148 b(84)`，
   * 直接全局匹配 `名字:数字` 会把 `java: 148` 也当成一项。 */
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '');
  const foxy = {};
  let m;
  const re = /([A-Za-z]+)\s*:\s*(-?\d+)/g;
  while ((m = re.exec(stripped))) foxy[m[1]] = Number(m[2]);
  Object.keys(expected).forEach((k) => {
    assert.equal(foxy[k], expected[k], `foxy 源码里 ${k} 与规范不一致，移植需复核`);
    assert.equal(PV.SPEC[k], foxy[k], `PV.SPEC.${k} 与 foxy 不一致`);
  });
});

test('dp 换算:unit=36 时 1dp=1px,unit 变化按比例缩放', () => {
  const { PV } = load();
  assert.equal(PV.dp(84, 36), 84);
  assert.equal(PV.dp(13, 36), 13);
  assert.equal(PV.dp(84, 54), 126);      /* 1.5 倍 */
  assert.equal(PV.dp(22, 18), 11);       /* 0.5 倍 */
  assert.equal(PV.dp(13, 54), 19.5);     /* 保留两位小数 */
  /* unit 缺失/非法 → 回退 36,绝不产生 NaN */
  assert.equal(PV.dp(84, undefined), 84);
  assert.equal(PV.dp(84, 0), 84);
  assert.equal(PV.dp(84, -3), 84);
  assert.equal(PV.symbolPreviewDp, PV.dp, '别名应与 dp 同一个函数');
});

test('盒子:传了尺寸就用传的;没传按 5 个键宽单位兜底且不小于 24', () => {
  const { PV } = load();
  const box = PV.box(36, { width: 576, height: 400 });
  assert.equal(box.width, 576);
  assert.equal(box.height, 400);
  /* 高度缺失 → 兜底 5 单位（不能让高度退化成 100% 导致面板塌成内容高度） */
  const fallback = PV.box(36, { width: 576 });
  assert.equal(fallback.height, 5 * 36);
  /* 极端小 unit 也保证有下限 */
  assert.ok(PV.box(1, {}).height >= 24);
  /* 宽度缺失 → null（调用方会写成 100%） */
  assert.equal(PV.box(36, {}).width, null);
  assert.equal(PV.FALLBACK_UNITS, 5);
});

test('分组显示名与左侧编辑列表同一口径(走 SP.groupDisplayNames)', () => {
  const { PV, SP } = load();
  const data = PV.data();
  assert.equal(data.kind, 'symbols');
  const groups = PV.groups(data);
  const names = SP.groupDisplayNames(data.groups);
  assert.equal(groups.length, data.groups.length);
  groups.forEach((g, i) => {
    assert.equal(g.name, names[i]);
    assert.equal(g.count, (data.groups[i].symbols || []).length);
  });
  /* 第一组就是内置 symbols 的第一组 */
  assert.equal(groups[0].name, '英文标点');
  assert.equal(groups[0].count, 130);
  /* 条目原样带出来（渲染要用） */
  assert.equal(groups[0].symbols[0], '1');
});

test('三类数据的 multiLine 决定每行 1 格还是 6 格', () => {
  const { PV, SP } = load();
  const cases = [
    ['symbols', false, 6],
    ['emoji', false, 6],
    ['kaomoji', true, 1],
  ];
  cases.forEach(([kind, multiLine, cols]) => {
    SP.getState().kind = kind;
    const data = PV.data();
    assert.equal(data.kind, kind);
    assert.equal(data.multiLine, multiLine, `${kind} 的 multiLine 应来自内置数据`);
    const spec = PV.SPEC;
    const expectCols = multiLine ? spec.columnsPerRowMultiLine : spec.columnsPerRow;
    assert.equal(expectCols, cols);
  });
  SP.getState().kind = 'symbols';
});

test('选中分组按 kind 各记一份,互不串台;resetMemo 清空', () => {
  const { PV } = load();
  assert.equal(PV.getSelected('symbols'), 0, '默认选中第一组');
  PV.setSelected('symbols', 5);
  PV.setSelected('kaomoji', 3);
  assert.equal(PV.getSelected('symbols'), 5);
  assert.equal(PV.getSelected('kaomoji'), 3);
  assert.equal(PV.getSelected('emoji'), 0, '没设过的类别不受影响');
  /* 非法值回落 0,绝不把越界值带到渲染里 */
  PV.setSelected('emoji', -1);
  assert.equal(PV.getSelected('emoji'), 0);
  PV.resetMemo();
  assert.equal(PV.getSelected('symbols'), 0);
});

test('滚动位置按 kind 各记一份,resetMemo 清空', () => {
  const { PV, doc } = load();
  const a = doc.createElement('div');
  const b = doc.createElement('div');
  a.scrollTop = 120;
  b.scrollTop = 40;
  PV.rememberGroupScroll('symbols', a);
  PV.rememberGroupScroll('kaomoji', b);
  assert.equal(PV.getGroupScroll('symbols'), 120);
  assert.equal(PV.getGroupScroll('kaomoji'), 40);
  assert.equal(PV.getGroupScroll('emoji'), 0);
  /* 负值/非数值不记（浏览器夹取前可能给出异常值） */
  const c = doc.createElement('div');
  c.scrollTop = -5;
  PV.rememberGroupScroll('emoji', c);
  assert.equal(PV.getGroupScroll('emoji'), 0);
  PV.resetMemo();
  assert.equal(PV.getGroupScroll('symbols'), 0);
});

test('渲染:面板尺寸取自传入的盒子,与布局预览同一尺寸', () => {
  const { PV, doc } = load();
  const h = host(doc);
  const out = PV.render(h, opts({ unit: 36, width: 576, height: 400 }));
  assert.ok(out, '有数据时应返回结果对象');
  const panel = out.panel;
  assert.equal(panel.style.width, '576px');
  assert.equal(panel.style.height, '400px');
  assert.equal(panel.style.boxSizing, 'border-box');
  assert.equal(panel.style.overflow, 'hidden', '面板高度钉死,内部各自滚动');
  assert.equal(panel.style.borderRadius, PV.SPEC.panelCornerDp + 'px');
  assert.equal(panel.style.background, 'rgb(39, 29, 28)', '面板底来自注入的 surface()');
  assert.equal(h.children.length, 1, 'host 里只该有面板本身');
  assert.equal(h.children[0], panel);
});

test('渲染:左列 84dp、底部两个热键与格子同款底色', () => {
  const { PV, doc } = load();
  const h = host(doc);
  const out = PV.render(h, opts({ unit: 36 }));
  assert.equal(out.leftCol.style.width, '84px');
  assert.equal(out.leftCol.style.flex, '0 0 auto');
  assert.equal(out.listBox.style.minHeight, '0', 'flex 子项不设 min-height:0 就滚不动');
  assert.equal(out.listBox.style.overflowY, 'auto');
  assert.equal(out.rightCol.style.minHeight, '0');
  assert.equal(out.rightCol.style.overflowY, 'auto');
  const hotkeys = findAll(out.panel, 'sym-pv-hotkey');
  assert.equal(hotkeys.length, 2);
  assert.equal(hotkeys[0].textContent, '⌨');
  assert.equal(hotkeys[1].textContent, '⌫');
  hotkeys.forEach((k) => {
    /* 与格子同款:底色 = keyBackgroundColor、字色 = candidateTextColor */
    assert.equal(k.style.background, 'rgb(66, 55, 53)');
    assert.equal(k.style.color, 'rgb(241, 222, 220)');
    assert.equal(k.style.height, '40px');
    assert.equal(k.style.lineHeight, '40px');
    assert.equal(k.style.fontSize, '20px');
    assert.equal(k.style.border, '1px solid rgb(120, 100, 98)', '描边开启时同款');
  });
  assert.equal(hotkeys[0].style.marginLeft, '0');
});

test('渲染:按行分组,末行不足 6 条不补空位(格子 flex 等分)', () => {
  const { PV, SP, doc } = load();
  const h = host(doc);
  const out = PV.render(h, opts({ unit: 36 }));
  const cols = out.columns;
  assert.equal(cols, 6);
  assert.equal(out.cells.length, out.groups[0].count);
  /* 行数 = ceil(条目数 / 每行格数) */
  assert.equal(out.rows.length, Math.ceil(out.groups[0].count / cols));
  /* 除最后一行外每行恰好 cols 格;最后一行是余数(不为 0 时) */
  const rem = out.groups[0].count % cols;
  out.rows.forEach((row, i) => {
    const want = (i === out.rows.length - 1 && rem !== 0) ? rem : cols;
    assert.equal(row.children.length, want, `第 ${i} 行应有 ${want} 格`);
  });
  out.cells.forEach((c) => {
    assert.equal(c.style.flex, '1 1 0', '行内等分靠 flex');
    assert.equal(c.style.minWidth, '0');
    assert.equal(c.style.height, '40px');
    assert.equal(c.style.lineHeight, '40px');
    assert.equal(c.style.fontSize, '22px');
    assert.equal(c.style.borderRadius, '6px');
    assert.equal(c.style.background, 'rgb(66, 55, 53)');
    assert.equal(c.style.color, 'rgb(241, 222, 220)');
  });
  /* 首格内容就是该组第一条符号 */
  assert.equal(out.cells[0].textContent, '1');
  SP.getState().kind = 'symbols';
});

test('渲染:颜文字(multiLine)每行 1 格、高自适应、不截断', () => {
  const { PV, SP, doc } = load();
  SP.getState().kind = 'kaomoji';
  const h = host(doc);
  const out = PV.render(h, opts({ unit: 36 }));
  assert.equal(out.multiLine, true);
  assert.equal(out.columns, 1);
  out.rows.forEach((row) => assert.equal(row.children.length, 1));
  out.cells.forEach((c) => {
    assert.equal(c.style.minHeight, '40px');
    assert.equal(c.style.height, undefined, 'multiLine 用 minHeight,不固定高度');
    assert.equal(c.style.whiteSpace, 'pre-wrap');
    assert.equal(c.style.wordBreak, 'break-all');
    assert.equal(c.style.lineHeight, '1.3');
  });
  /* 非 multiLine 才用 nowrap 截断近似 */
  const h2 = host(doc);
  SP.getState().kind = 'emoji';
  const out2 = PV.render(h2, opts({ unit: 36 }));
  out2.cells.forEach((c) => {
    assert.equal(c.style.whiteSpace, 'nowrap');
    assert.equal(c.style.textOverflow, 'ellipsis');
  });
  SP.getState().kind = 'symbols';
});

test('渲染:点击分组切换选中并就地重渲染,滚动位置不丢', () => {
  const { PV, SP, doc } = load();
  const h = host(doc);
  const out = PV.render(h, opts({ unit: 36 }));
  assert.equal(out.selected, 0);
  /* 先把左列滚到 120,再点第 3 组 */
  out.listBox.scrollTop = 120;
  const groupEls = findAll(out.listBox, 'sym-pv-group');
  assert.equal(groupEls.length, out.groups.length);
  groupEls[2].click();
  assert.equal(PV.getSelected('symbols'), 2);
  assert.equal(PV.getGroupScroll('symbols'), 120, '点击前再读一次,防 scroll 事件未派发的竞态');
  /* 就地重渲染:host 里仍只有一个面板,且新的左列已被恢复滚动位置 */
  assert.equal(h.children.length, 1);
  const again = findAll(h, 'sym-pv-group');
  assert.equal(again.length, out.groups.length);
  assert.equal(again[2].style.background, 'rgb(255, 180, 168)', '选中项底 = 注入的高亮色');
  assert.equal(again[0].style.background, undefined, '未选中项底透明(不写 background)');
  const listBox2 = findAll(h, 'sym-pv-groups')[0];
  assert.equal(listBox2.scrollTop, 120, '恢复滚动位置必须在新节点挂进文档之后');
  SP.getState().kind = 'symbols';
});

test('渲染:没有分组时不画面板,画空状态并返回 null', () => {
  const { PV, SP, doc } = load();
  SP.getState().profiles.symbols = { multiLine: false, groups: [] };
  const h = host(doc);
  const out = PV.render(h, opts({ unit: 36 }));
  assert.equal(out, null);
  assert.equal(findAll(h, 'sym-pv').length, 0);
  const empty = findAll(h, 'sym-pv-empty');
  assert.equal(empty.length, 1);
  /* 桩里 textContent 只在本节点上,文字在子 div 里 —— 递归收全 */
  const texts = [];
  (function walk(el) {
    if (el._text) texts.push(el._text);
    (el.children || []).forEach(walk);
  })(empty[0]);
  assert.ok(texts.join(' ').includes('还没有分组'), `空状态应说明原因,实际:${texts.join(' / ')}`);
});

test('渲染:重渲染会清空旧内容(DOM 桩的 children 是数组,不能只清 innerHTML)', () => {
  const { PV, doc } = load();
  const h = host(doc);
  PV.render(h, opts({ unit: 36 }));
  const first = h.children[0];
  PV.render(h, opts({ unit: 36 }));
  assert.equal(h.children.length, 1, '不能越渲染越多');
  assert.notEqual(h.children[0], first, '应是新节点');
});

test('渲染:说明文字随返回值交出,不画进预览区(否则撑高盒子)', () => {
  const { PV, doc } = load();
  const h = host(doc);
  const out = PV.render(h, opts({ unit: 36 }));
  assert.equal(out.notes.length, 2);
  assert.ok(out.notes[0].includes('符号面板预览'));
  assert.ok(out.notes[0].includes('每行 6 格'));
  assert.ok(out.notes[1].includes('84dp'));
  assert.ok(out.notes[1].includes('最近'), '要写明 App 会插「最近」组而编辑器不显示');
  /* host 里只有面板,没有说明文字节点 */
  assert.equal(findAll(h, 'status').length, 0);
  assert.equal(h.children.length, 1);
});

test('渲染:取不到注入配色时不写样式(走 CSS 兜底),不写 undefined', () => {
  const { PV, doc } = load();
  const h = host(doc);
  const out = PV.render(h, { unit: 36, width: 576, height: 400 });
  assert.equal(out.panel.style.background, undefined);
  out.cells.forEach((c) => {
    assert.equal(c.style.background, undefined);
    assert.equal(c.style.color, undefined);
    assert.equal(c.style.border, undefined, '描边开关取不到 → 不画描边');
  });
  const hotkeys = findAll(out.panel, 'sym-pv-hotkey');
  hotkeys.forEach((k) => {
    assert.equal(k.style.background, undefined);
    assert.equal(k.style.color, undefined);
  });
});

test('描边必须两个开关同时开:只看其一就不画', () => {
  const { PV, doc } = load();
  const h1 = host(doc);
  const a = PV.render(h1, opts({ strokeEnabled: () => false }));
  a.cells.forEach((c) => assert.equal(c.style.border, undefined));
  const h2 = host(doc);
  const b = PV.render(h2, opts({ strokeEnabled: () => true }));
  b.cells.forEach((c) => assert.equal(c.style.border, '1px solid rgb(120, 100, 98)'));
});

test('unit 缺失时按宿主宽度推算,宿主宽度也是 0 则回退 380', () => {
  const { PV, doc } = load();
  const h = host(doc);          /* 桩里 clientWidth 恒 undefined */
  const out = PV.render(h, { width: 576, height: 400 });
  /* unit = 380/10 = 38 → 84dp 换算为 88.67px */
  assert.equal(out.leftCol.style.width, PV.dp(84, 38) + 'px');
});

/* ---------- 接线层：预览必须真的挂进 f5a 的页签与预览区 ----------
 * 上面 18 例只证明「模块自己能画对」。这一层证明「app.js/index.html 真的把它接上了」，
 * 否则模块写得再对，用户在页面上也看不到（本轮之前 random-theme.js 就踩过这个坑）。
 */

test('index.html 在 symbol-panel.js 之后、app.js 之前引入 symbol-preview.js', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const at = (n) => html.indexOf(`js/${n}`);
  assert.ok(at('symbol-preview.js') > 0, 'index.html 未引入 symbol-preview.js');
  assert.ok(at('symbol-panel.js') < at('symbol-preview.js'), 'symbol-preview.js 必须先于 symbol-panel.js 装载');
  assert.ok(at('symbol-preview.js') < at('app.js'), 'symbol-preview.js 必须在 app.js 之前装载');
});

test('app.js 在符号页签渲染符号预览、离开时还原布局预览', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  /* 分支：切到 tab-symbols 时改走符号预览 */
  assert.match(src, /state\.activeTab === "tab-symbols"\)\s*\{\s*renderSymbolPanelPreview\(root\);\s*return;/);
  /* 还原：非符号页签时清掉符号态 */
  assert.match(src, /root\.classList\.remove\("layout-preview-symbol"\)/);
  /* 说明文字走独立容器，不能占用键盘预览的绝对定位覆盖层 */
  assert.match(src, /symbol-preview-notes/);
  /* 面板标题随页签切换 */
  assert.match(src, /function syncPreviewPanelTitle/);
  assert.match(src, /符号面板预览/);
});

test('数据变更后预览跟着刷新:SP.render 被包住(SP 自身不派发任何事件)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.match(src, /function hookSymbolPanelRender/);
  assert.match(src, /SP\.__previewHooked/);
  assert.match(src, /SP\.render = function/);
});

test('描边开关在 app.js 侧要求两个开关同时为真', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const m = src.match(/function symbolPreviewStrokeEnabled\(\)\s*\{\s*return ([^;]+);/);
  assert.ok(m, '未找到 symbolPreviewStrokeEnabled');
  assert.match(m[1], /borderEnabled/);
  assert.match(m[1], /borderOutline/);
});
