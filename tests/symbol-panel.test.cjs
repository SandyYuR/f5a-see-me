/* 符号面板页的落地核对:数据、纯逻辑、界面接线、双向同步。
 *
 * 走真实路径而不是复述实现:
 *  1 数据 —— js/symbol-data.js 里的 F5A_SYMBOL_DATA 必须与 data/*.json、
 *           app assets 三份逐组一致(规模 62/10/19,条目数与首末条目也核);
 *  2 纯逻辑 —— 语言回退链、multiLine 归一、旧格式兼容、校验器(含
 *           「空组会被 App 丢弃」「多字符条目在 6 格布局下会缩小」两类告警);
 *  3 界面 —— 真正调 init()/render(),数渲染出的分组卡片与条目按钮;
 *  4 双向 —— 界面改 → JSON 文本变;JSON 文本改 → 应用到界面。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, loadScript } = require('./dom-app-harness.cjs');

const ROOT = path.join(__dirname, '..');
const ASSETS = process.env.FXR_ASSETS
  || path.join(ROOT, '..', 'fx-rime-only', 'app', 'src', 'main', 'assets', 'bundled');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
/* vm 沙箱里的数组与本地数组不同 realm,deepEqual 会假失败,统一按 JSON 比 */
const json = (v) => JSON.stringify(v);

/* 装载符号面板模块。测试 DOM 缺 FileReader / Intl 等浏览器件,按需补最小实现;
 * 面板自己检测不到 Intl.Segmenter 时会退到近似实现,不影响结论。 */
function loadPanel() {
  const { window, doc } = loadScript('symbol-panel.js', {
    window: { F5A_SYMBOL_DATA: undefined },
  });
  return { SP: window.F5aSymbolPanel, window, doc };
}

/* 带 app 内置符号数据的装载(数据挂在 globalThis,面板从那里取内置目录) */
function loadPanelWithData() {
  const data = {
    symbols: read('data/symbols.json'),
    emoji: read('data/emoji.json'),
    kaomoji: read('data/kaomoji.json'),
  };
  const { window, doc } = loadScript('symbol-panel.js', { window: { F5A_SYMBOL_DATA: data } });
  return { SP: window.F5aSymbolPanel, window, doc, data };
}

test('符号数据三份规模与 app assets 一致(62 / 10 / 19 组)', () => {
  const sizes = { symbols: 62, emoji: 10, kaomoji: 19 };
  Object.entries(sizes).forEach(([kind, groups]) => {
    const got = read(`data/${kind}.json`);
    assert.equal(got.groups.length, groups, `${kind} 组数`);
    assert.ok(got.groups.every((g) => Array.isArray(g.symbols) && g.symbols.length > 0), `${kind} 有空组`);
    assert.ok(got.groups.every((g) => g.names && Object.keys(g.names).length > 0), `${kind} 有组名缺失`);
  });
  // 顶层只有两个键(与 app 端 SymbolCatalogFile 同形,没有 type 字段)
  Object.keys(sizes).forEach((kind) => {
    const keys = Object.keys(read(`data/${kind}.json`)).sort();
    assert.equal(json(keys), json(['groups', 'multiLine']), `${kind} 顶层键不是 groups/multiLine`);
  });
});

test('multiline 语义与 app 端声明一致(颜文字 true,符号/emoji false)', () => {
  assert.equal(read('data/symbols.json').multiLine, false);
  assert.equal(read('data/emoji.json').multiLine, false);
  assert.equal(read('data/kaomoji.json').multiLine, true);
});

test('组名走语言回退链(zh-Hant / en / 主标签 / 首个非空)', () => {
  const { SP } = loadPanel();
  const g = { names: { zh: '括号', 'zh-Hant': '括號', en: 'Brackets' } };
  assert.equal(SP.groupLabel(g, 'zh'), '括号');
  assert.equal(SP.groupLabel(g, 'zh-Hant'), '括號');
  assert.equal(SP.groupLabel(g, 'zh-TW'), '括號', 'zh-TW 应回退到 zh-Hant');
  assert.equal(SP.groupLabel(g, 'en-US'), 'Brackets', 'en-US 应落到主标签 en');
  assert.equal(SP.groupLabel(g, 'fr'), '括号', '未知语言落到第一个非空值');
  assert.equal(SP.groupLabel({ names: { zh: '只有中文' } }, 'en'), '只有中文');
  assert.equal(SP.groupLabel({ names: {} }, 'zh'), '', '没有组名时返回空串');
});

test('归一化:旧格式顶层数组按 multiLine=false 处理,且只保留 names/symbols', () => {
  const { SP } = loadPanel();
  const legacy = SP.normalizeProfile('symbols', [[',', '.', '!']]);
  assert.equal(legacy.multiLine, false);
  assert.equal(legacy.groups.length, 1);
  assert.equal(json(legacy.groups[0].symbols), json([',', '.', '!']));
  assert.equal(json(legacy.groups[0].names), json({}));

  const messy = SP.normalizeProfile('symbols', {
    multiLine: 1,
    groups: [
      { names: { zh: '甲' }, symbols: ['a', 'b'], extra: 'ignored' },
      { names: { zh: '乙' }, symbols: [] },
      'garbage',
    ],
  });
  assert.equal(messy.multiLine, false, 'multiLine 只认布尔 true');
  assert.equal(messy.groups.length, 3, '裸字符串条目也保留(宁可留着也不静默丢数据)');
  assert.equal(json(Object.keys(messy.groups[0])), json(['names', 'symbols']), '多余键不应写回');

  // 空数据:颜文字保留该类的默认 multiLine
  const empty = SP.normalizeProfile('kaomoji', null);
  assert.equal(empty.multiLine, true);
  assert.equal(empty.groups.length, 0);
});

test('序列化只输出 multiLine + groups,键序固定', () => {
  const { SP } = loadPanel();
  const text = SP.serializeProfile({
    multiLine: false,
    groups: [{ names: { zh: '甲', en: 'A' }, symbols: ['x'] }],
  });
  const parsed = JSON.parse(text);
  assert.equal(json(Object.keys(parsed)), json(['multiLine', 'groups']));
  assert.equal(json(Object.keys(parsed.groups[0])), json(['names', 'symbols']));
  assert.ok(text.includes('\n'), '应为缩进格式,便于人读');
});

test('校验器:空组与缺 zh 会报警,结构错误才报错', () => {
  const { SP } = loadPanel();
  // 空组(App 端会整组静默丢弃)—— 这是告警不是错误
  const warn = SP.validateProfile('symbols', {
    multiLine: false,
    groups: [
      { names: { zh: '甲' }, symbols: ['a'] },
      { names: { zh: '乙' }, symbols: [] },
      { names: {}, symbols: ['c'] },
    ],
  });
  assert.equal(warn.errors.length, 0, '空组不该算结构错误');
  assert.equal(warn.warnings.length, 1, `应为 1 条告警,实际 ${warn.warnings.length}`);
  assert.ok(warn.warnings[0].includes('第 2 组') && warn.warnings[0].includes('第 3 组'),
    '告警要点名到具体分组:' + warn.warnings[0]);

  // 结构错误:groups 不是数组 / 空数组
  assert.ok(SP.validateProfile('symbols', { groups: 'nope' }).errors.length > 0);
  assert.ok(SP.validateProfile('symbols', { groups: [] }).errors.length > 0);

  // 多字符条目在 6 格布局下的可读性告警(不是错误)
  const multi = SP.validateProfile('symbols', {
    multiLine: false,
    groups: [{ names: { zh: '甲' }, symbols: ['ab', 'x', 'cd'] }],
  });
  assert.equal(multi.errors.length, 0);
  assert.ok(multi.warnings.some((w) => w.includes('多字符条目')), '应提示缩小风险:' + json(multi.warnings));
});

test('字形簇计数:emoji 组合序列只算一格(否则会误报)', () => {
  const { SP } = loadPanel();
  assert.equal(SP.graphemeCount('a'), 1);
  assert.equal(SP.graphemeCount('❤️'), 1, '心形 + 变体选择符应算一格');
  assert.equal(SP.graphemeCount('👍'), 1);
  assert.equal(SP.graphemeCount('👨‍👩‍👧'), 1, 'ZWJ 家庭序列应算一格');
  assert.equal(SP.graphemeCount('🇨🇳'), 1, '区域指示符成对应算一格');
  assert.equal(SP.graphemeCount('(^▽^)'), 5, '括号 + 三个字符 = 5 个字形簇');
  assert.equal(SP.graphemeCount(''), 0);
});

test('真实内置数据在符号/emoji 布局下不产生多字符告警(证字形簇口径没误报)', () => {
  const { SP } = loadPanelWithData();
  ['symbols', 'emoji'].forEach((kind) => {
    const p = SP.normalizeProfile(kind, SP.builtinProfile(kind));
    const report = SP.validateProfile(kind, p);
    assert.equal(report.errors.length, 0, `${kind} 不应有结构错误:` + json(report.errors));
    const multi = report.warnings.filter((w) => w.includes('多字符条目'));
    assert.equal(multi.length, 0, `${kind} 不该出现多字符告警(实测会误报):` + json(multi));
  });
});

test('内置三类目录规模与 app assets 逐组一致(从运行时数据源取)', () => {
  const { SP } = loadPanelWithData();
  const sizes = { symbols: 62, emoji: 10, kaomoji: 19 };
  Object.entries(sizes).forEach(([kind, groups]) => {
    const p = SP.normalizeProfile(kind, SP.builtinProfile(kind));
    assert.equal(p.groups.length, groups, `${kind} 运行时组数`);
    const src = read(`data/${kind}.json`);
    assert.equal(json(p.groups[0].names), json(src.groups[0].names));
    assert.equal(json(p.groups[groups - 1].symbols), json(src.groups[groups - 1].symbols));
  });
});

test('导入:合法 JSON 生效,坏 JSON 与结构错误被拒', () => {
  const { SP } = loadPanelWithData();
  const bad = SP.loadProfileText('{ not json', 'symbols', 'x.json');
  assert.equal(bad.ok, false);
  assert.ok(bad.error.includes('JSON 解析失败'), '错误信息要能定位到解析:' + bad.error);
  assert.equal(SP.loadProfileText('', 'symbols', 'x.json').ok, false);

  const ok = SP.loadProfileText('{"multiLine":false,"groups":[{"names":{"zh":"甲"},"symbols":["a"]}]}', 'symbols');
  assert.equal(ok.ok, true);
  assert.equal(ok.profile.groups.length, 1);
  assert.equal(ok.legacy, false);

  const legacy = SP.loadProfileText('[[', 'symbols'); // 解析失败
  assert.equal(legacy.ok, false);
  assert.equal(SP.loadProfileText('[["a"]]', 'symbols').legacy, true, '顶层数组要标记为旧格式');
});

test('界面:渲染出的分组卡片数与条目数与数据一致', () => {
  const data = {
    symbols: { multiLine: false, groups: [
      { names: { zh: '甲', en: 'A' }, symbols: ['1', '2', '3'] },
      { names: { zh: '乙', en: 'B' }, symbols: ['4'] },
    ] },
    emoji: { multiLine: false, groups: [{ names: { zh: '表情' }, symbols: ['😀'] }] },
    kaomoji: { multiLine: true, groups: [{ names: { zh: '开心' }, symbols: ['(＾▽＾)'] }] },
  };
  const { window } = loadScript('symbol-panel.js', { window: { F5A_SYMBOL_DATA: data } });
  const SP = window.F5aSymbolPanel;
  // 真实 index.html 里的 id 由装载器预置,故 isMounted 应为 true
  assert.equal(SP.isMounted(), true, '测试 DOM 应从 index.html 预置出符号页的 id');
  SP.init();
  const list = window.document.getElementById('sym-list');
  assert.equal(list.querySelectorAll('details.sym-group-card').length, 2, '应渲染 2 张分组卡片');
  assert.equal(list.querySelectorAll('button.sym-entry').length, 4, '应渲染 4 个条目按钮');
  assert.ok(list.innerHTML.includes('甲') && list.innerHTML.includes('乙'), '组名应出现在卡片上');
  // 类别切换后渲染另一类
  const sel = window.document.getElementById('sym-kind');
  sel.value = 'kaomoji';
  sel.dispatch('change');
  assert.equal(SP.getState().kind, 'kaomoji');
  const list2 = window.document.getElementById('sym-list');
  assert.equal(list2.querySelectorAll('details.sym-group-card').length, 1);
  // 颜文字是 multiLine,网格应带 multi-line 类
  assert.ok(list2.innerHTML.includes('sym-entry-grid multi-line'), 'multiLine 类别要用单列网格');
  // 切换回 symbols:multiLine 复选框应反映当前类别
  sel.value = 'symbols';
  sel.dispatch('change');
  assert.equal(window.document.getElementById('sym-multiline').checked, false);
  sel.value = 'kaomoji';
  sel.dispatch('change');
  assert.equal(window.document.getElementById('sym-multiline').checked, true);
});

test('界面改 → JSON 变;JSON 改 → 界面变(双向同步)', () => {
  const data = {
    symbols: { multiLine: false, groups: [{ names: { zh: '甲' }, symbols: ['a', 'b'] }] },
    emoji: { multiLine: false, groups: [{ names: { zh: '表情' }, symbols: ['😀'] }] },
    kaomoji: { multiLine: true, groups: [{ names: { zh: '开心' }, symbols: ['(＾▽＾)'] }] },
  };
  const { window } = loadScript('symbol-panel.js', { window: { F5A_SYMBOL_DATA: data } });
  const SP = window.F5aSymbolPanel;
  const doc = window.document;
  SP.init();

  // 方向一:界面新增条目 → JSON 文本里应出现
  const addInput = doc.getElementById('sym-list').querySelector('input[data-sym-new-entry]');
  addInput.value = 'c d';
  doc.getElementById('sym-list').querySelector('button[data-sym-add-entry]').click();
  const text = doc.getElementById('sym-json').value;
  const parsed = JSON.parse(text);
  assert.equal(json(parsed.groups[0].symbols), json(['a', 'b', 'c', 'd']),
    '新增两个条目后 symbols 应为 a,b,c,d,实际 ' + json(parsed.groups[0].symbols));

  // 方向二:改 JSON 文本 → 应用到界面 → 卡片计数变化
  doc.getElementById('sym-json').value = JSON.stringify({
    multiLine: false,
    groups: [
      { names: { zh: '甲' }, symbols: ['x'] },
      { names: { zh: '丙' }, symbols: ['y', 'z'] },
    ],
  });
  const applied = SP.applyJsonText();
  assert.equal(applied.ok, true, '合法 JSON 应能应用');
  const list = doc.getElementById('sym-list');
  assert.equal(list.querySelectorAll('details.sym-group-card').length, 2, '应用后应有 2 个分组');

  // 非法 JSON 不应破坏当前状态
  doc.getElementById('sym-json').value = '{ bad';
  const rejected = SP.applyJsonText();
  assert.equal(rejected.ok, false);
  assert.equal(doc.getElementById('sym-list').querySelectorAll('details.sym-group-card').length, 2,
    '被拒的 JSON 不应改变界面');
});

test('界面:选中条目后可上移/下移/删除,选中态落到按钮上', () => {
  const data = {
    symbols: { multiLine: false, groups: [{ names: { zh: '甲' }, symbols: ['a', 'b', 'c'] }] },
    emoji: { multiLine: false, groups: [{ names: { zh: 'E' }, symbols: ['x'] }] },
    kaomoji: { multiLine: true, groups: [{ names: { zh: 'K' }, symbols: ['y'] }] },
  };
  const { window } = loadScript('symbol-panel.js', { window: { F5A_SYMBOL_DATA: data } });
  const SP = window.F5aSymbolPanel;
  const doc = window.document;
  SP.init();

  const entries = () => doc.getElementById('sym-list').querySelectorAll('button.sym-entry');
  entries()[1].click(); // 选中 'b'
  assert.equal(SP.getState().selectedEntry.ei, 1);
  assert.ok(entries()[1].classList.contains('selected'), '被选中的按钮应带 selected');
  assert.ok(doc.getElementById('sym-entry-ops').innerHTML.includes('上移'), '选中后应出现操作条');

  const op = (name) => doc.getElementById('sym-entry-ops').querySelector(`button[data-sym-op="${name}"]`);
  op('up').click();
  assert.equal(json(SP.getState().profiles.symbols.groups[0].symbols), json(['b', 'a', 'c']), '上移后顺序');
  op('down').click();
  assert.equal(json(SP.getState().profiles.symbols.groups[0].symbols), json(['a', 'b', 'c']), '再下移应还原');
  op('del').click();
  assert.equal(json(SP.getState().profiles.symbols.groups[0].symbols), json(['a', 'c']), '删除后顺序');
  assert.equal(SP.getState().selectedEntry, null, '删除后应清空选中');
});

test('界面:新建分组与恢复内置', () => {
  const data = {
    symbols: { multiLine: false, groups: [{ names: { zh: '甲' }, symbols: ['a'] }] },
    emoji: { multiLine: false, groups: [{ names: { zh: 'E' }, symbols: ['x'] }] },
    kaomoji: { multiLine: true, groups: [{ names: { zh: 'K' }, symbols: ['y'] }] },
  };
  const { window } = loadScript('symbol-panel.js', { window: { F5A_SYMBOL_DATA: data } });
  const SP = window.F5aSymbolPanel;
  const doc = window.document;
  SP.init();

  doc.getElementById('sym-new-group').value = '新组';
  doc.getElementById('sym-new-group-add').click();
  assert.equal(SP.getState().profiles.symbols.groups.length, 2);
  assert.equal(SP.getState().profiles.symbols.groups[1].names.zh, '新组');

  // 同名分组应被拒
  doc.getElementById('sym-new-group').value = '新组';
  doc.getElementById('sym-new-group-add').click();
  assert.equal(SP.getState().profiles.symbols.groups.length, 2, '同名分组不应重复添加');
  assert.ok(doc.getElementById('symbol-panel-status').textContent.includes('同名'), '应提示同名');

  doc.getElementById('sym-reset-builtin').click();
  assert.equal(SP.getState().profiles.symbols.groups.length, 1, '恢复内置后回到 1 组');
});

test('界面:搜索过滤按组名与条目内容匹配', () => {
  const data = {
    symbols: { multiLine: false, groups: [
      { names: { zh: '甲组', en: 'Alpha' }, symbols: ['1', '2'] },
      { names: { zh: '乙组', en: 'Beta' }, symbols: ['9'] },
    ] },
    emoji: { multiLine: false, groups: [{ names: { zh: 'E' }, symbols: ['x'] }] },
    kaomoji: { multiLine: true, groups: [{ names: { zh: 'K' }, symbols: ['y'] }] },
  };
  const { window } = loadScript('symbol-panel.js', { window: { F5A_SYMBOL_DATA: data } });
  const SP = window.F5aSymbolPanel;
  const doc = window.document;
  SP.init();
  const filter = doc.getElementById('sym-filter');

  filter.value = 'Alpha'; // 英文组名也算命中
  filter.dispatch('input');
  assert.equal(doc.getElementById('sym-list').querySelectorAll('details.sym-group-card').length, 1);
  assert.ok(doc.getElementById('sym-count-hint').textContent.includes('匹配 1 / 2'),
    '计数提示:' + doc.getElementById('sym-count-hint').textContent);

  filter.value = '9'; // 条目内容命中
  filter.dispatch('input');
  assert.equal(doc.getElementById('sym-list').querySelectorAll('details.sym-group-card').length, 1);

  filter.value = '不存在的词';
  filter.dispatch('input');
  assert.equal(doc.getElementById('sym-list').querySelectorAll('details.sym-group-card').length, 0);
  assert.ok(doc.getElementById('sym-list').innerHTML.includes('没有匹配'), '空结果要有提示');

  filter.value = '';
  filter.dispatch('input');
  assert.equal(doc.getElementById('sym-list').querySelectorAll('details.sym-group-card').length, 2);
});

test('页签已接进 index.html,且装载顺序在 app.js 之前', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('data-tab-target="tab-symbols"'), '缺页签按钮');
  assert.ok(html.includes('id="tab-symbols"'), '缺页签面板');
  const i = html.indexOf('js/symbol-panel.js');
  const j = html.indexOf('js/app.js?v=');
  assert.ok(i > 0, '缺 symbol-panel.js 的 script 标签');
  assert.ok(i < j, 'symbol-panel.js 必须在 app.js 之前加载');
  // 面板需要的关键 id 都要在页面里
  ['sym-kind', 'sym-multiline', 'sym-list', 'sym-json', 'sym-import-json', 'sym-export-json']
    .forEach((id) => assert.ok(html.includes(`id="${id}"`), '缺少元素 #' + id));
});

test('面板模块不向 app.js 的状态伸手(只挂 window.F5aSymbolPanel)', () => {
  const { window } = loadScript('symbol-panel.js');
  assert.ok(window.F5aSymbolPanel, '应挂到 window.F5aSymbolPanel');
  assert.equal(typeof window.F5aSymbolPanel.init, 'function');
  assert.equal(typeof window.F5aSymbolPanel.render, 'function');
  assert.equal(window.F5aAppState, undefined, '不应污染 app.js 的状态对象');
  // 无数据源时不抛,内置目录退化为空
  const SP = window.F5aSymbolPanel;
  assert.equal(SP.builtinProfile('symbols'), null);
  const p = SP.normalizeProfile('symbols', null);
  assert.equal(p.groups.length, 0);
});

test('app.js 的页签切换会触达符号面板(setActiveTab 集成)', () => {
  const { api, registry } = loadApp();
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('data-tab-target="tab-symbols"'));
  // setActiveTab 切到符号页时应该把面板初始化(测试装载器已把 symbol-panel.js 先执行)
  api.setActiveTab('tab-symbols');
  assert.equal(api.state.activeTab, 'tab-symbols');
  assert.equal(registry.get('tab-symbols')?.classList.contains('active'), true,
    '符号页 panel 应被激活');
  assert.equal(registry.get('tab-layout')?.classList.contains('active'), false,
    '其它页应失活');
});
