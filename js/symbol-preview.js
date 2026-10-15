/* f5a-see-me — 网页键盘布局编辑器
 * symbol-preview.js — 符号面板预览（对照 foxy-editor 的 symbol-preview.js）
 *
 * 存在理由：符号 / emoji / 颜文字 三类 catalog 在 App 里**不是弹层**，
 * 而是一块**整屏替换键盘**的横排面板。编辑符号时看不到它长什么样，
 * 很难判断格子密度、分组名长度、multiLine 是否合适 —— 所以切到「符号面板」
 * 页签时，把预览区从键盘换成这个面板：
 *
 *   切换由 app.js 的 setActiveTab() 决定；
 *   本模块只负责「把面板画进给定容器」。
 *
 * 移植来源：`D:/GitHub/foxy/foxy-editor/js/symbol-preview.js`（500 行），
 * 其几何规格来自 App 反编译逐行核对（`foxy/foxy-render-spec.md` §8，
 * `ly.java` / `cu.java` / `cv.java`）。**改这里的几何必须先看那份规范**。
 *
 * 与 foxy 版的差异（都是 f5a 侧没有对应物，不是简化）：
 *   · 配色走 f5a 自己的 21 个主题 token。foxy 用的 candidateHighlightColor /
 *     keyHintTextColor / toolTextColor / altKeyboardColor 在 f5a 没有同名 token，
 *     按语义就近映射（见「二、配色」的 MAPPING 注释）。
 *   · 面板底与「布局预览容器底」同一条规则（f5a 的 resolvePreviewSurfaceColor），
 *     由 app.js 通过 opts.surface() 注入，模块不自己判 —— 保证与键盘预览同色。
 *   · 描边开关 f5a 是 borderEnabled + borderOutline 两个（对应 foxy 的 B/C）。
 *   · 尺寸由 app.js 传入（复用 f5a 已有的预览宽高解析），模块不另算一套。
 *   · 数据从 window.F5aSymbolPanel.getState() 读，不反向依赖 app.js 内部。
 *
 * 本文件只挂 window.F5aSymbolPreview / globalThis / module.exports；
 * 无 DOM 环境下（Node 测试）dp/SPEC/box/groups 等纯逻辑照常可用。
 */
(function (root) {
  'use strict';

  var PV = {};
  if (root.F5aSymbolPreview) return;

  /* ================================================================
   * 一、几何换算
   * ================================================================ */

  /* App 的 dp → 预览 px。
   *
   * 键盘预览里 `unit = portraitW / 10`，即「10 个键宽单位铺满屏宽」，
   * 相当于真实手机的 360dp 宽屏（10 × 36dp）。所以：
   *     1dp ≈ portraitW / 360 px = unit / 36
   * 用这个比例把规范 §8 表里的 dp 值换成预览像素，面板才会与键盘同一尺度。
   * （别用固定 px：预览宽度随窗口变，写死会让面板与键盘比例失调。） */
  PV.dp = function (dp, unit) {
    var u = (typeof unit === 'number' && unit > 0) ? unit : 36;
    return Math.round(dp * (u / 36) * 100) / 100;
  };
  /* 别名：与 foxy 的 FE.symbolPreviewDp 同名，便于两文件对照阅读 */
  PV.symbolPreviewDp = PV.dp;

  /* 规范 §8 的固定规格（dp/sp）——集中一处，便于对照 foxy 的
   * FE.SYMBOL_PREVIEW_SPEC 逐项核对。**数值一字不改**。 */
  PV.SPEC = {
    panelLeftColDp: 84,        /* ly.java:148 b(84) */
    groupItemHeightDp: 40,     /* ly.java:207 this.g */
    groupItemFontSp: 13,       /* ly.java:285 */
    groupItemPadX: 4, groupItemPadY: 2,   /* ly.java:288 b(4),b(2),b(4),b(2) */
    groupItemMarginDp: 2,      /* ly.java:141/145 b(2) */
    cellHeightDp: 40,          /* ly.java:207/46 this.g */
    cellFontSp: 22,            /* ly.java:204 */
    cellMarginDp: 2,           /* ly.java:216-217 */
    cellRowGapDp: 4,           /* ly.java:198 bottomMargin b(4) */
    cellCornerDp: 6,           /* ly.java:335 this.i=6 */
    cellStrokeDp: 1,           /* ly.java:333 b(1) */
    columnsPerRow: 6,          /* ly.java:45 this.f=6 */
    columnsPerRowMultiLine: 1, /* ly.java:423 z ? 1 : 6 */
    hotkeyFontSp: 20,          /* ly.java:162 */
    leftColPadLeftDp: 2, leftColPadRightDp: 4,  /* ly.java:65 */
    cellsLeftMarginDp: 4,      /* ly.java:152 */
    panelCornerDp: 6,          /* 面板圆角，与键盘容器同一观感 */
    listTopMarginDp: 4         /* 分组列表与面板顶的距离 */
  };
  PV.SYMBOL_PREVIEW_SPEC = PV.SPEC;

  /* 盒子高度兜底单位数：布局预览拿不到高度时用它，保证盒子始终确定。
   * 与 foxy 的 FE.SYMBOL_PREVIEW_FALLBACK_UNITS 同值同因 ——
   * 高度退化成 100% 会让面板塌成内容高度（分组一多就撑高），
   * 与「尺寸固定 = 布局预览尺寸」正好相反。 */
  PV.FALLBACK_UNITS = 5;

  /* 面板要占的盒子尺寸（**与布局预览严格相同**）。
   * opts.width / opts.height 由 app.js 复用 f5a 的预览宽高解析算好传入；
   * 缺失时回落到 unit 推算，绝不让尺寸变成 NaN / auto。 */
  PV.box = function (unit, opts) {
    opts = opts || {};
    var u = (typeof unit === 'number' && unit > 0) ? unit : 36;
    var HK = (typeof opts.heightK === 'number' && opts.heightK > 0) ? opts.heightK : 1;
    var W = (typeof opts.width === 'number' && opts.width > 0) ? opts.width : null;
    var H = (typeof opts.height === 'number' && opts.height > 0) ? opts.height : null;
    var units = (typeof opts.units === 'number' && opts.units > 0) ? opts.units : PV.FALLBACK_UNITS;
    return {
      width: W,
      height: H != null ? H : Math.max(24, units * u * HK)
    };
  };

  /* ================================================================
   * 二、配色（由 app.js 通过 opts.theme(field) 注入）
   * ================================================================ */

  /* f5a 侧 token 映射（foxy 字段 → f5a token）：
   *   keyBackgroundColor      → keyBackgroundColor      （同名，格子底）
   *   candidateTextColor      → candidateTextColor      （同名，格子字）
   *   candidateHighlightColor → keyPressHighlightColor  （选中格子底；f5a 无「候选高亮」，
   *                                                      按压高亮是同一语义的可用 token）
   *   keyHintTextColor        → candidateCommentColor   （未选中分组字，次要文字）
   *   toolTextColor           → candidateTextColor      （选中分组字，主文字）
   *   keyBorderColor          → keyShadowColor          （f5a 的「按键边框/阴影」）
   *   面板底                  → opts.surface()          （与布局预览容器同一条规则）
   * 取不到就返回 null，调用方跳过写样式、走 CSS 兜底。 */
  function themeCss(opts, field) {
    if (!opts || typeof opts.theme !== 'function') return null;
    var v = opts.theme(field);
    return (typeof v === 'string' && v) ? v : null;
  }

  /* 描边是否画：f5a 的「按键边框」与「边框描边」**同时开启**才画。
   * 对应 foxy 的 `if (m00Var.B && m00Var.C) setStroke(...)`（ly.java:332-334）。
   * ⚠️ 必须**同时**判 B：只看描边的话，一旦草稿带了描边而用户把键边框关掉，
   * 预览仍会画描边，与实机不符。 */
  function strokeOn(opts) {
    if (opts && typeof opts.strokeEnabled === 'function') return !!opts.strokeEnabled();
    return false;
  }

  /* ================================================================
   * 三、数据准备
   * ================================================================ */

  /* 当前类别的 catalog：`{multiLine, groups}`。
   * 事实来源是 symbol-panel.js 的 state.profiles[kind]；
   * 它还没初始化时按内置 profile 兜底，绝不抛。 */
  PV.data = function () {
    var SP = root.F5aSymbolPanel;
    if (!SP || typeof SP.getState !== 'function') {
      return { kind: 'symbols', multiLine: false, groups: [] };
    }
    var st = SP.getState() || {};
    var kind = st.kind || 'symbols';
    var p = (st.profiles && SP.isPlainObject(st.profiles[kind])) ? st.profiles[kind] : null;
    if (!p && SP.isPlainObject && SP.isPlainObject(st.symbolProfile)) p = st.symbolProfile;
    if (!p && typeof SP.normalizeProfile === 'function' && typeof SP.builtinProfile === 'function') {
      /* 只读兜底：**不写回** SP 的 state，避免预览改变编辑器的「已改」判定 */
      p = SP.normalizeProfile(kind, SP.builtinProfile(kind));
    }
    var groups = (p && Array.isArray(p.groups)) ? p.groups : [];
    return { kind: kind, multiLine: !!(p && p.multiLine === true), groups: groups };
  };

  /* 面板要显示的分组列表。
   *
   * ⚠️ App 端会在最前面插一个「最近」组（ly.java:228-257，数据来自
   * SharedPreferences `recent_<ns>`）。**编辑器不显示它** —— 编辑器没有
   * 「最近使用」运行时状态，凭空造一个只会误导用户以为文件里有这组。
   * 这里刻意不加，并在说明文字里写明。 */
  PV.groups = function (data) {
    var SP = root.F5aSymbolPanel;
    var list = (data && data.groups) || [];
    /* 显示名与左侧编辑列表同一个口径（'zh' + 重名去重），两处才不会各显各的。
     * 传 null 会落到底链的「第一个值」，与左侧列表可能不一致。 */
    var names = (SP && typeof SP.groupDisplayNames === 'function')
      ? SP.groupDisplayNames(list)
      : list.map(function (g, i) { return '分组 ' + (i + 1); });
    return list.map(function (g, i) {
      var syms = (g && Array.isArray(g.symbols)) ? g.symbols : [];
      return { index: i, name: names[i] || '', count: syms.length, symbols: syms };
    });
  };

  /* ================================================================
   * 四、跨重渲染要记住的东西
   * ================================================================ */

  /* 每一类符号的：选中分组 + 左列分组列表滚到哪。
   *
   * **为什么必须做**：预览每次重渲染都是清空容器再重建，所以 `.sym-pv-groups`
   * **每次都是全新节点**，scrollTop 天然归零。用户把分组列表滚到下面（分组多的
   * catalog 很常见，「其他」这类汇总组总在最后），点一下切换分组 —— 列表立刻
   * 弹回顶部，而他要选的分组就在下面，于是得反复重新滚下去。
   * App 端没有这个问题：分组列表是常驻 View，切换分组只换右侧格子
   * （ly.java:228+），左列滚动位置自然不变。这里是在编辑器里补上同样的观感。
   *
   * 认领靠 `kind`（symbols / emoji / kaomoji 各记一份）—— 节点被换掉了，只能靠
   * 标记认出「这是哪一类的列表」，标记对不上就跳过，**绝不会把 emoji 的位置
   * 错认给颜文字**。
   *
   * ⚠️ **只记左列**：右列格子区在切换分组时整个换内容，理应回到顶部（新内容
   * 从头看），给它保位置反而是错的。 */
  var selectedByKind = {};
  var groupScrollByKind = {};

  PV.getSelected = function (kind) {
    var v = parseInt(selectedByKind[kind], 10);
    return (v >= 0) ? v : 0;
  };
  PV.getGroupScroll = function (kind) { return groupScrollByKind[kind] || 0; };
  PV.resetMemo = function () { selectedByKind = {}; groupScrollByKind = {}; };

  /* 外部设选中分组（app.js 若要把左侧编辑列表的展开项同步过来时用）。
   * 负值/非法一律回落 0 —— 越界值绝不能带进渲染。 */
  PV.setSelected = function (kind, index) {
    var v = parseInt(index, 10);
    selectedByKind[kind] = (v >= 0) ? v : 0;
  };
  /* 对外暴露滚动记忆：① 让测试能钉住「按 kind 各记一份」；② app.js 若在
   * 预览重建前先读一次当前滚动位置，可以走这个入口。 */
  PV.rememberGroupScroll = rememberGroupScroll;

  /* 记住某一类当前列表的滚动位置。两个调用时机：
   *   ① 左列自身的 scroll 事件 —— 持续记忆，覆盖「改数据 → 重渲染」这类
   *      **非点击**路径（新增/删除分组、导入、重置都会重建预览）；
   *   ② 点击分组时**重建前再读一次** —— 真实浏览器里 scroll 事件是异步派发的，
   *      紧跟着点一下可能还没派发到，只靠 ① 会漏记最后那一段滚动。 */
  function rememberGroupScroll(kind, el) {
    if (!el || kind == null) return;
    var top = el.scrollTop;
    if (typeof top !== 'number' || !(top >= 0)) return;
    groupScrollByKind[kind] = top;
  }

  /* ================================================================
   * 五、渲染
   * ================================================================ */

  var lastRender = null;   /* { host, opts } —— 点击分组后据此就地重渲染 */

  function makeEl(tag) {
    return root.document.createElement(tag);
  }

  /* 极小的建节点helper：attrs 里 `class` 走 className（DOM 桩的 setAttribute
   * 不更新 classList），其余走 setAttribute；text 走 textContent。 */
  function h(tag, attrs, text) {
    var el = makeEl(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v == null) continue;
        if (k === 'class') el.className = v;
        else el.setAttribute(k, v);
      }
    }
    if (text != null) el.textContent = String(text);
    return el;
  }

  /* 把符号面板画进 host。
   * opts:
   *   unit         —— dp→px 的尺度（app.js 传 renderWidth/10，与键盘同尺度）
   *   width/height —— 面板盒子尺寸（**与布局预览严格相同**）
   *   theme(field) —— 取一个主题 token 的 CSS 色串，取不到返回 null
   *   surface()    —— 面板底（与布局预览容器同一条规则）
   *   strokeEnabled() —— 是否画描边（键边框 + 边框描边同时开启）
   *   onSelectGroup(kind, index) —— 可选，点击预览里的分组时通知外部（如同步左侧列表）
   *
   * 返回 { groups, selected, cells, multiLine, columns, kind, notes }；
   *   · notes 是**说明文字的数组** —— 刻意**不**画进 host：
   *     host 就是键盘预览区，那里只该有「手机的样貌」（文字会把盒子撑高，
   *     也会挡住用户想看的观感），所以交回给 app.js 放进预览面板的状态行。
   * 画不出时返回 null。 */
  PV.render = function (host, opts) {
    if (!host || !root.document) return null;
    opts = opts || {};
    var unit = (typeof opts.unit === 'number' && opts.unit > 0) ? opts.unit : null;
    if (!unit) {
      /* DOM 桩 clientWidth 恒 0 → 回退 380（与 foxy 的 renderPreview 同口径），
       * 保证测试里几何可算、不断言到 NaN。 */
      var rawW = host.clientWidth;
      unit = (rawW || 380) / 10;
    }
    clearHost(host);
    lastRender = { host: host, opts: opts };

    var data = PV.data();
    if (!data.groups.length) {
      var meta = (root.F5aSymbolPanel && root.F5aSymbolPanel.kindMeta)
        ? root.F5aSymbolPanel.kindMeta(data.kind) : { label: data.kind };
      var empty = h('div', { class: 'sym-pv-empty' });
      empty.appendChild(h('div', null,
        '当前类别「' + meta.label + '」还没有分组。'));
      empty.appendChild(h('div', { class: 'status' },
        '在下方「符号面板」页新建分组，或点「重置为内置」载入内置目录后回来查看预览。'));
      host.appendChild(empty);
      return null;
    }

    var groups = PV.groups(data);
    var multi = data.multiLine;
    var spec = PV.SPEC;
    var notes = [];

    var sel = PV.getSelected(data.kind);
    if (!(sel >= 0 && sel < groups.length)) sel = 0;

    /* ---- 配色（注入取不到 → 全 null，走 CSS 兜底） ---- */
    var bgPanel = (typeof opts.surface === 'function') ? opts.surface() : null;
    var bgCell = themeCss(opts, 'keyBackgroundColor');
    var fgCell = themeCss(opts, 'candidateTextColor');
    var bgCellSel = themeCss(opts, 'keyPressHighlightColor');
    var fgGroup = themeCss(opts, 'candidateCommentColor');
    var fgGroupSel = themeCss(opts, 'candidateTextColor');
    var strokeCss = strokeOn(opts) ? themeCss(opts, 'keyShadowColor') : null;

    /* ---- 盒子：与布局预览同尺寸 ---- */
    var box = PV.box(unit, opts);

    /* ---- 面板容器：横排（ly.java:61 setOrientation(0)） ---- */
    var panel = h('div', { class: 'sym-pv' });
    panel.style.display = 'flex';
    panel.style.flexDirection = 'row';
    panel.style.width = box.width ? (box.width + 'px') : '100%';
    panel.style.height = box.height ? (box.height + 'px') : '100%';
    panel.style.boxSizing = 'border-box';
    panel.style.borderRadius = PV.dp(spec.panelCornerDp, unit) + 'px';
    /* ⚠️ overflow hidden 是关键：面板高度被**钉死**，内部两列各自滚动，
     * 绝不因为分组/条目多而把键盘预览撑高（也对齐 App 的两个 ScrollView
     * 行为 —— ly.java:66-71 与 149-153）。 */
    panel.style.overflow = 'hidden';
    if (bgPanel) panel.style.background = bgPanel;

    /* ---- 左列：分组列表 + 底部两个热键（宽 84dp） ---- */
    var leftCol = h('div', { class: 'sym-pv-left' });
    leftCol.style.width = PV.dp(spec.panelLeftColDp, unit) + 'px';
    leftCol.style.flex = '0 0 auto';
    leftCol.style.display = 'flex';
    leftCol.style.flexDirection = 'column';
    leftCol.style.paddingLeft = PV.dp(spec.leftColPadLeftDp, unit) + 'px';
    leftCol.style.paddingRight = PV.dp(spec.leftColPadRightDp, unit) + 'px';
    leftCol.style.boxSizing = 'border-box';

    var listBox = h('div', { class: 'sym-pv-groups' });
    listBox.style.flex = '1 1 auto';
    listBox.style.overflowY = 'auto';
    listBox.style.marginTop = PV.dp(spec.listTopMarginDp, unit) + 'px';
    /* 持续记忆滚动位置（见 rememberGroupScroll）：这样**非点击**导致的重渲染
     * （新增/删除分组、导入、重置）也不会把用户滚下去的位置丢掉。 */
    listBox.addEventListener('scroll', function () { rememberGroupScroll(data.kind, listBox); });

    var gH = PV.dp(spec.groupItemHeightDp, unit);
    var gGap = PV.dp(spec.groupItemMarginDp, unit);
    var groupEls = [];
    groups.forEach(function (g) {
      var on = g.index === sel;
      var el = h('div', {
        class: 'sym-pv-group' + (on ? ' sym-pv-group-sel' : ''),
        title: (g.name || '（未命名）') + '（' + g.count + ' 条）',
        'data-group-index': String(g.index)
      }, g.name || '（未命名）');
      el.style.height = gH + 'px';
      el.style.lineHeight = gH + 'px';
      el.style.fontSize = PV.dp(spec.groupItemFontSp, unit) + 'px';
      el.style.padding = PV.dp(spec.groupItemPadY, unit) + 'px ' +
        PV.dp(spec.groupItemPadX, unit) + 'px';
      el.style.marginBottom = gGap + 'px';
      el.style.boxSizing = 'border-box';
      el.style.overflow = 'hidden';
      el.style.whiteSpace = 'nowrap';
      el.style.textOverflow = 'ellipsis';
      el.style.textAlign = 'center';
      el.style.cursor = 'pointer';
      /* 未选中：底**透明**（ly.java:320-321）
       * 已选中：底 = 选中底色的映射 token */
      if (on && fgGroupSel) el.style.color = fgGroupSel;
      else if (!on && fgGroup) el.style.color = fgGroup;
      if (on && bgCellSel) el.style.background = bgCellSel;
      el.addEventListener('click', function () {
        /* ⚠️ 重建**之前**先把左列滚到哪记下来：随后重渲染会清空并重建面板，
         * 新的 .sym-pv-groups 是全新节点、scrollTop 归零。少了这一句，
         * 用户滚到下面的分组后一点切换就被弹回顶部（而他要选的分组就在下面）。
         * 这里再读一次是防「scroll 事件尚未派发」的竞态。 */
        rememberGroupScroll(data.kind, listBox);
        selectedByKind[data.kind] = g.index;
        if (typeof opts.onSelectGroup === 'function') opts.onSelectGroup(data.kind, g.index);
        if (lastRender) PV.render(lastRender.host, lastRender.opts);
      });
      groupEls.push(el);
      listBox.appendChild(el);
    });
    leftCol.appendChild(listBox);

    /* 底部「⌨」「⌫」：高 40dp、各占 1/2 宽、字号 20sp（ly.java:139-147,159-171）。
     * App 里 ⌨ = 返回键盘、⌫ = 删除；预览里只画出来（编辑器不执行上屏）。
     *
     * ⭐ **底色/圆角/描边与右侧符号格子完全同款** —— 这是必须还原的：
     * 创建它们的 `a()`（ly.java:159-171，`f(z9Var)` 在 :167）与创建格子那段
     * （ly.java:202-218，`f(z9Var)` 在 :209）调的是**同一个 `f()`**
     * （ly.java:326-341）：
     *     gradientDrawable.setColor(this.a.j)          // 底 = keyBackgroundColor
     *     if (B && C) setStroke(b(1), this.a.l)        // 描边仅当两个开关同时开
     *     setCornerRadius(clamp(6dp, 0, min(w,h)/2))   // 圆角 6dp 且夹到短边一半
     * 字色也同一个：`this.a.n`（candidateTextColor，:166 与 :208）。
     * 若只给字色不给底色，两个热键看起来像浮在面板上的纯文字，
     * 而手机上它们是和右边一样的圆角色块。 */
    var hotkeys = h('div', { class: 'sym-pv-hotkeys' });
    hotkeys.style.display = 'flex';
    hotkeys.style.flex = '0 0 auto';
    hotkeys.style.marginBottom = gGap + 'px';
    var hkH = PV.dp(spec.cellHeightDp, unit);
    var hkRadius = Math.min(PV.dp(spec.cellCornerDp, unit), hkH / 2);
    var hkStroke = PV.dp(spec.cellStrokeDp, unit);
    ['⌨', '⌫'].forEach(function (glyph, gi) {
      var b = h('div', {
        class: 'sym-pv-hotkey',
        title: gi === 0 ? '返回键盘（App 端）' : '删除（App 端）'
      }, glyph);
      b.style.flex = '1 1 0';
      b.style.height = hkH + 'px';
      b.style.lineHeight = hkH + 'px';
      b.style.textAlign = 'center';
      b.style.fontSize = PV.dp(spec.hotkeyFontSp, unit) + 'px';
      b.style.marginLeft = gi === 0 ? '0' : gGap + 'px';
      b.style.boxSizing = 'border-box';
      b.style.borderRadius = hkRadius + 'px';
      if (bgCell) b.style.background = bgCell;
      if (fgCell) b.style.color = fgCell;
      if (strokeCss) b.style.border = hkStroke + 'px solid ' + strokeCss;
      hotkeys.appendChild(b);
    });
    leftCol.appendChild(hotkeys);
    panel.appendChild(leftCol);

    /* ---- 左列的滚动容器尺寸约束 ----
     * 左列是 flex 纵向布局：分组列表 flex:1 滚动、底部热键固定。
     * 必须给列表 minHeight:0，否则 flex 子项的 min-height:auto 会让它按内容撑高、
     * 把整个面板顶出盒子（滚动失效）。这是 CSS flex 滚动的经典坑。 */
    listBox.style.minHeight = '0';

    /* ---- 右列：符号格子区（ScrollView，左边距 4dp） ----
     * ⚠️ 右列**自己滚动**（overflow-y:auto），高度受左列/面板约束 ——
     * 不靠「把面板拉高」来显示全部条目：App 端符号区就是一个 ScrollView
     * （ly.java:149-153），条目多时滚动而不是撑高。 */
    var rightCol = h('div', { class: 'sym-pv-cells-wrap' });
    rightCol.style.flex = '1 1 auto';
    rightCol.style.minWidth = '0';
    rightCol.style.minHeight = '0';   /* flex 子项默认 min-height:auto 会撑着不滚 */
    rightCol.style.marginLeft = PV.dp(spec.cellsLeftMarginDp, unit) + 'px';
    rightCol.style.overflowY = 'auto';
    rightCol.style.overflowX = 'hidden';

    var grid = h('div', { class: 'sym-pv-cells' + (multi ? ' sym-pv-multiline' : '') });
    /* 每行格子数 = multiLine ? 1 : 6（cu.java:85、ly.java:45）。
     *
     * ⚠️ **必须按行分组渲染，不能用一个 grid 固定 6 等分** —— App 端每凑满一行
     * 就新开一个独立的横向 LinearLayout，格子用 `LayoutParams(0, h, 1.0f)` 在
     * **该行内**等分（ly.java:192-200 新建行、:215-218 加格子）。
     * 后果：**末行不足 6 条时，那几条会各自拉宽占满整行**（2 条各占半宽），
     * 而不是挤在左侧、右边留空。 */
    var cols = multi ? spec.columnsPerRowMultiLine : spec.columnsPerRow;
    grid.style.display = 'flex';
    grid.style.flexDirection = 'column';
    grid.style.gap = PV.dp(spec.cellRowGapDp, unit) + 'px';

    var cH = PV.dp(spec.cellHeightDp, unit);
    var cGap = PV.dp(spec.cellMarginDp, unit);
    var cRadius = PV.dp(spec.cellCornerDp, unit);
    var cur = groups[sel];
    var cellEls = [];
    var rowEls = [];
    /* 按 cols 条切行：每行一个 flex 行容器，行内格子 `flex:1 1 0` 等分
     * （ly.java:192-218）。margin 仍按「每格左右各 2dp」写（App 用
     * setMarginStart/End(b(2))），行的首尾格因此也带 margin —— 与 App 一致。 */
    var syms = (cur.symbols || []);
    for (var ri = 0; ri < syms.length; ri += cols) {
      var rowSyms = syms.slice(ri, ri + cols);
      var rowEl = h('div', { class: 'sym-pv-row' });
      rowEl.style.display = 'flex';
      rowEl.style.flexDirection = 'row';
      rowSyms.forEach(function (sym) {
        var cell = h('div', {
          class: 'sym-pv-cell',
          /* 提示语按 App 实际行为描述：multiLine=false 时格子固定 40dp 高，
           * 超长条目被**等比缩小**（z9 Proportional）而不是裁掉。 */
          title: multi ? sym : (sym + '（格高固定 40dp，过长会等比缩小）')
        }, sym === '' ? '（空）' : sym);
        cell.style.flex = '1 1 0';
        cell.style.minWidth = '0';   /* flex 子项默认 min-width:auto 会被长内容顶宽 */
        /* multiLine=true → 行高自适应（WRAP_CONTENT）；false → 固定 40dp */
        if (multi) {
          cell.style.minHeight = cH + 'px';
          cell.style.whiteSpace = 'pre-wrap';
          cell.style.wordBreak = 'break-all';
          cell.style.padding = cGap + 'px';
          cell.style.lineHeight = '1.3';
        } else {
          cell.style.height = cH + 'px';
          cell.style.lineHeight = cH + 'px';
          cell.style.padding = '0 ' + cGap + 'px';
          /* ⚠️ 这里用 nowrap + overflow hidden 作**视觉近似**：
           * App 给格子设了 `setScaleMode(y9.a)` = Proportional（ly.java:206、
           * y9.java:19），z9 会取 min(1, 宽比, 高比) 再把文字**等比缩小**画进去
           * （z9.java:102-105、259），即「变小」而非「裁掉」。浏览器没有等价的
           * 自动缩字，故用截断近似；想精确复现需按 文字宽/格宽 换算 font-size。 */
          cell.style.whiteSpace = 'nowrap';
          cell.style.overflow = 'hidden';
          cell.style.textOverflow = 'ellipsis';
        }
        cell.style.boxSizing = 'border-box';
        cell.style.marginLeft = cGap + 'px';
        cell.style.marginRight = cGap + 'px';
        cell.style.fontSize = PV.dp(spec.cellFontSp, unit) + 'px';
        cell.style.textAlign = 'center';
        /* 圆角 6dp 且 clamp 到「短边一半」（ly.java:335-340）。 */
        cell.style.borderRadius = Math.min(cRadius, cH / 2) + 'px';
        if (bgCell) cell.style.background = bgCell;
        if (fgCell) cell.style.color = fgCell;
        if (strokeCss) {
          cell.style.border = PV.dp(spec.cellStrokeDp, unit) + 'px solid ' + strokeCss;
        }
        cellEls.push(cell);
        rowEl.appendChild(cell);
      });
      rowEls.push(rowEl);
      grid.appendChild(rowEl);
    }
    rightCol.appendChild(grid);
    panel.appendChild(rightCol);

    /* ---- 挂上去 ---- */
    host.appendChild(panel);

    /* ---- 恢复左列滚动位置（见 rememberGroupScroll） ----
     * ⚠️ **必须放在填充分组项、且挂进文档之后**，不能挪到创建时：真实浏览器里
     * scrollTop 会被夹到 `scrollHeight - clientHeight`，节点还没内容 / 还没挂载时
     * 那个值是 0，早设等于白设（DOM 桩不模拟夹取，所以放前面测试照样「通过」——
     * 别据此把这段挪上去）。 */
    var keepGroupTop = groupScrollByKind[data.kind] || 0;
    if (keepGroupTop > 0) listBox.scrollTop = keepGroupTop;

    /* ---- 说明文字**不画进 host** ---- */
    var meta = (root.F5aSymbolPanel && root.F5aSymbolPanel.kindMeta)
      ? root.F5aSymbolPanel.kindMeta(data.kind) : { label: data.kind };
    notes.push('符号面板预览 · ' + meta.label + ' · 分组 ' + groups.length +
      ' 个 · 当前「' + (cur.name || '（未命名）') + '」' + cur.count + ' 条 · 每行 ' +
      cols + ' 格（' + (multi ? 'multiLine=true → 1 格/行、高自适应'
        : 'multiLine=false → 6 格/行、格高固定 40dp') + '）');
    notes.push('左列 ' + spec.panelLeftColDp + 'dp 为分组列表与 ⌨/⌫；格子字号 ' +
      spec.cellFontSp + 'sp、圆角 ' + spec.cellCornerDp + 'dp；面板底与键盘底同色' +
      '（键边框联动）。面板(.sym-pv 576)与键盘画布(.layout-row .keys 576)同宽,各比宿主(#layout-preview 596)窄 10px 内边距，分组区与符号区各自滚动' +
      '（对齐 App 的两个 ScrollView）。⚠️ App 会在最前面插入运行时生成的' +
      '「最近」分组，编辑器没有该状态，故预览不显示。');

    return {
      groups: groups, selected: sel, cells: cellEls, rows: rowEls,
      multiLine: multi, columns: cols, kind: data.kind, notes: notes,
      panel: panel, leftCol: leftCol, listBox: listBox, rightCol: rightCol, hotkeys: hotkeys
    };
  };

  /* 清空容器。
   *
   * ⚠️ **不能写成 `while (host.children.length) host.children.pop()`**：
   * 真实浏览器里 `children` 是只读的 HTMLCollection，没有 `pop`，直接抛
   * TypeError（而在测试 DOM 桩里 children 是普通数组，那样写「能过」——
   * 正是这种「桩能过、线上炸」的差别必须在这里按真实 DOM 分支）。
   * 也不能只靠 `innerHTML = ''`：DOM 桩里那样只清 `_html`，children 数组残留。
   * 所以按「桩 → 真浏览器」的顺序判：数组就地清空，否则走标准 DOM 移除。 */
  function clearHost(host) {
    if (Array.isArray(host.children)) {
      host.children.length = 0;
      if (typeof host.replaceChildren === 'function') host.replaceChildren();
      return;
    }
    if (typeof host.replaceChildren === 'function') { host.replaceChildren(); return; }
    while (host.firstChild) host.removeChild(host.firstChild);
  }

  root.F5aSymbolPreview = PV;
  /* 浏览器里 window === globalThis；测试沙箱里两者是不同对象，两处都挂。 */
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.F5aSymbolPreview = PV;
  if (typeof module !== 'undefined' && module.exports) module.exports = PV;
})(typeof window !== 'undefined' ? window : globalThis);
