/*
 * f5a-see-me — 网页键盘布局编辑器
 * toolbar-preview.js — 键盘顶部工具栏预览（对照 foxy-editor 的 js/toolbar-preview.js）
 *
 * 存在理由
 *   布局预览已经能逐键还原键盘主体，但真实 App 的键盘上方还有一条工具栏（左侧
 *   工具栏开关 + 中间 KawaiiBar 按钮组 + 右侧收起键盘），工具栏开关还能升起一块
 *   状态区按钮面板。缺了它，用户在编辑器里调主题色 / 图标主题 / 分体布局时看不到
 *   最终效果，也容易误以为 App 里没有那排按钮。
 *
 * 移植来源
 *   D:/GitHub/foxy/foxy-editor/js/toolbar-preview.js（547 行）提供两样东西：
 *   ① 「预览里也要画出工具栏」这个能力本身；② 主题图标的两种渲染策略（图标自带
 *   实色就原样画，纯单色则跟随主题文字色染色）。几何与配色换成真实 App 依据：
 *   fx-rime-only 的 KeyboardPreviewUi.kt:649-711（左 menu 钮、中 ButtonsBarUi、
 *   右 hide 钮）、ToolbarMetrics.kt（BASE_HEIGHT_DP=40、BASE_ICON_DP=20、
 *   BUTTON_FOOTPRINT_DP=44 不随百分比变）、ToolButton.kt（未激活
 *   altKeyTextColor、激活 accentKeyBackgroundColor、按下 keyPressHighlightColor）、
 *   ButtonsConfig.kt:107-124（默认按钮表）、IconTheme.kt:77-107（槽位表）。
 *
 * 与 foxy 版的差异（都是 f5a 侧没有对应物，不是简化）
 *   - foxy 用 7 个 chip 横排 + 行尾「展开箭头」表示 main/expanded 两态。真实 App 的
 *     工具栏是「左开关 + 中按钮组 + 右收起」（KeyboardPreviewUi.kt:649-711 的
 *     menuButton + ButtonsBarUi + hideButton），状态区是 toolbar_toggle 升起的独立
 *     InputWindow（StatusAreaWindow.kt:51 用 attachWindow 整块替换键盘窗口），所以
 *     这里把状态区画成「4 列 96dp 条目面板替换键盘」，而不是叠在主行上方。
 *   - f5a 没有 candidateBackgroundColor / candidatePressedColor / toolTextColor /
 *     accentColor 这些 foxy 字段，配色由 app.js 用 21 个主题 token 就近映射后经
 *     opts.colors 注入。
 *   - 主题图标可能是 file:/data:/blob: URL；SVG 一律走 <img> 或 CSS mask，绝不
 *     innerHTML 内联（安全隔离，缘由见 app.js 的 renderSvgPreviewHtml）。
 *   - 尺寸按 pxPerDp 换算：预览是等比缩放的，不是真机 dp。
 *
 * 只挂 window.F5aToolbarPreview；无 DOM 环境下纯逻辑可用（Node 测试直接调 render）。
 */
(function (root) {
  'use strict';

  var TB = {};
  if (root.F5aToolbarPreview) return;

  /* ---------------------------------------------------------------- 规格 */

  TB.SPEC = {
    heightDp: 40,      // ToolbarMetrics.BASE_HEIGHT_DP
    footprintDp: 44,   // BUTTON_FOOTPRINT_DP（不随百分比变）
    iconDp: 20,        // BASE_ICON_DP
    iconMaxDp: 22,     // foxy 侧 chip 图标上限
    gapDp: 3,
    cornerDp: 12,
    labelDp: 16,       // ToolButton 的 BASE_LABEL_SIZE
    edgeMarginDp: 2
  };

  /* ButtonsConfig.kt:107-124 default()：kawaiiBarButtons / statusAreaButtons。
     行首 toolbarToggleButton、行尾 hideKeyboardButton 固定存在（:92 / :101）。 */
  TB.KAWAII_BUTTONS = [
    { id: 'undo', label: '撤销', slot: 'toolbar.undo' },
    { id: 'redo', label: '重做', slot: 'toolbar.redo' },
    { id: 'cursor_move', label: '文本编辑', slot: 'toolbar.cursor_move' },
    { id: 'floating_toggle', label: '浮动键盘', slot: 'toolbar.floating_toggle' },
    { id: 'clipboard', label: '剪贴板', slot: 'toolbar.clipboard' },
    { id: 'theme_toggle', label: '亮色/暗色主题', slot: 'toolbar.theme_toggle' }
  ];

  TB.STATUS_BUTTONS = [
    { id: 'theme', label: '主题', slot: 'toolbar.theme' },
    { id: 'icon_theme', label: '图标主题', slot: 'toolbar.icon_theme' },
    { id: 'reload_config', label: '重载配置', slot: 'toolbar.reload_config' },
    { id: 'virtual_keyboard', label: '虚拟键盘', slot: 'toolbar.virtual_keyboard' },
    { id: 'one_handed_keyboard', label: '单手键盘', slot: 'toolbar.one_handed_keyboard' },
    /* StatusAreaWindow.kt:85/126：input_method_options 固定追加在末尾，不可配置。 */
    { id: 'input_method_options', label: '输入法设置', slot: 'toolbar.input_method_options', fixed: true }
  ];

  /* IconTheme.kt:102-107 SYSTEM_SLOTS；IdleUi.kt:272 把 toolbar_toggle 映射到
     system.toolbar_toggle。默认图标照 ButtonsCustomizerActivity.kt:1264/1270 与
     KeyboardPreviewUi.kt:653-670：menu = more_horiz（三个横点）、hide = arrow_drop_down。 */
  TB.SYSTEM_BUTTONS = {
    toggle: { id: 'toolbar_toggle', label: '状态区域（工具栏开关）', slot: 'system.toolbar_toggle' },
    hide: { id: 'hide_keyboard', label: '隐藏键盘', slot: 'system.hide_keyboard' }
  };

  /* App 状态区是 4 列网格（ButtonsConfig.kt 注释），预览按同样列数排。 */
  TB.STATUS_COLUMNS = 4;

  /* StatusAreaEntryUi.kt：条目根高 96dp，48dp 圆形底色块（上留 4dp），图标居中
     （默认 drawable 24dp），下方 6dp 处 12sp 标签。 */
  TB.STATUS_ENTRY = {
    heightDp: 96,
    circleDp: 48,
    circleTopDp: 4,
    iconDp: 24,
    labelDp: 12,
    labelGapDp: 6
  };
  /* ---------------------------------------------------------------- 工具 */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function num(v, fallback) {
    var n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  /* SVG 只作为图片 / mask 使用，必须补 xmlns（data URL 里没有继承的命名空间）；
     encodeURIComponent 不转义 ' ( )，内联 style 里用单引号包 URL，所以补转义。 */
  TB.svgDataUrl = function (svg) {
    var text = String(svg == null ? '' : svg).trim();
    if (!/^<svg/i.test(text)) return '';
    if (!/xmlns\s*=/.test(text)) {
      text = text.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text)
      .replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
  };

  var COLOR_KEYWORDS = ['none', 'transparent', 'currentcolor', 'inherit', 'unset', 'initial', 'context-fill', 'context-stroke'];
  var NAMED_COLORS = ('aqua black blue fuchsia gray green lime maroon navy olive orange purple red silver teal white yellow ' +
    'aliceblue antiquewhite aquamarine azure beige bisque blanchedalmond blueviolet brown burlywood cadetblue chartreuse ' +
    'chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkkhaki ' +
    'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray ' +
    'darkturquoise darkviolet deeppink deepskyblue dimgray dodgerblue firebrick floralwhite forestgreen gainsboro ' +
    'ghostwhite gold goldenrod greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush ' +
    'lawngreen lemonchiffon lightblue lightcoral lightcyan lightgray lightgreen lightpink lightsalmon lightseagreen ' +
    'lightskyblue lightslategray lightsteelblue lightyellow limegreen linen mediumaquamarine mediumblue mediumorchid ' +
    'mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue ' +
    'mintcream mistyrose moccasin navajowhite oldlace olivedrab orangered orchid palegoldenrod palegreen paleturquoise ' +
    'palevioletred papayawhip peachpuff peru pink plum powderblue rebeccapurple rosybrown royalblue saddlebrown salmon ' +
    'sandybrown seagreen seashell sienna skyblue slateblue slategray snow springgreen steelblue tan thistle tomato ' +
    'turquoise violet wheat whitesmoke yellowgreen').split(' ');

  /* 与 foxy 的 FE.iconTintable 同一判据（App hk0.w(String) 的反编译结论）：图标里
     出现任意具体颜色（hex / rgb() / 具名色）就不染色、原样画；否则套主题文字色。 */
  TB.iconTintable = function (payload) {
    var text = String(payload == null ? '' : payload).trim();
    if (!text) return true;
    text = text.replace(/^(svg|xml):/i, '').replace(/^\uFEFF/, '').trim();
    if (!/^<svg/i.test(text)) return true;
    var guard = 0;
    var before = null;
    while (before !== text && guard++ < 20) {
      before = text;
      text = text.replace(/<\?xml[\s\S]*?\?>/gi, '')
        .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    }
    var m;
    var attrRe = /\b(fill|stroke)\s*=\s*("([^"]*)"|'([^']*)')/gi;
    while ((m = attrRe.exec(text))) {
      var raw = String(m[3] != null ? m[3] : m[4] || '').trim().toLowerCase();
      if (!raw) continue;
      if (raw.indexOf('url(') === 0) continue;
      if (COLOR_KEYWORDS.indexOf(raw) >= 0) continue;
      if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(raw)) return false;
      if (/^rgba?\(/.test(raw) || /^hsla?\(/.test(raw)) return false;
      if (NAMED_COLORS.indexOf(raw) >= 0) return false;
    }
    var styleRe = /style\s*=\s*("([^"]*)"|'([^']*)')/gi;
    while ((m = styleRe.exec(text))) {
      var sty = String(m[2] != null ? m[2] : m[3] || '');
      if (/(fill|stroke|color)\s*:\s*(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(sty)) return false;
    }
    return true;
  };

  /* app.js 传来的图标描述归一化：{ kind:'svg'|'url'|'text', value } 或裸字符串。
     空值一律 null（调用方回落内置矢量）。 */
  function normalizeIcon(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      var s = raw.trim();
      if (!s) return null;
      return /^<svg/i.test(s) ? { kind: 'svg', value: s } : { kind: 'text', value: s };
    }
    if (typeof raw !== 'object') return null;
    var value = raw.value;
    if (raw.kind === 'text') return value == null || String(value) === '' ? null : { kind: 'text', value: String(value) };
    if (raw.kind === 'svg' || raw.kind === 'url') return value ? { kind: raw.kind, value: String(value) } : null;
    return normalizeIcon(value);
  }

  /* ---------------------------------------------------------------- 尺寸 */

  function metrics(pxPerDp, heightPx) {
    var s = TB.SPEC;
    var unit = num(pxPerDp, 1);
    if (unit <= 0) unit = 1;
    var footprint = Math.max(20, Math.round(s.footprintDp * unit));
    var height = Math.max(16, Math.round(heightPx > 0 ? heightPx : s.heightDp * unit));
    /* App 的工具栏百分比只放大图标与行高，footprint 恒为 44dp（ToolbarMetrics）。 */
    var iconScale = height > 0 ? height / Math.max(1, s.heightDp * unit) : 1;
    var icon = Math.round(s.iconDp * unit * iconScale);
    icon = Math.min(footprint - 4, Math.max(10, Math.min(Math.round(s.iconMaxDp * unit), icon)));
    return {
      pxPerDp: unit,
      height: height,
      footprint: footprint,
      icon: icon,
      gap: Math.max(1, Math.round(s.gapDp * unit)),
      corner: Math.max(2, Math.round(s.cornerDp * unit)),
      label: Math.max(9, Math.round(s.labelDp * unit * iconScale)),
      margin: Math.max(0, Math.round(s.edgeMarginDp * unit))
    };
  }

  /* ---------------------------------------------------------------- 按钮 */

  /* 图标 → 内层 HTML。三支：文字图标、可染色（CSS mask）、自带实色（<img> 原样）。 */
  function iconInner(icon, size, fg) {
    if (!icon) return '';
    if (icon.kind === 'text') {
      return '<span class="kb-tb-label" style="font-size:inherit;line-height:1.15;color:' + esc(fg) + '">' +
        esc(icon.value) + '</span>';
    }
    var url = icon.kind === 'svg' ? TB.svgDataUrl(icon.value) : icon.value;
    if (!url) {
      return '<span class="kb-tb-dot" style="width:' + size + 'px;height:' + size + 'px;border:2px solid ' +
        esc(fg) + ';border-radius:50%;box-sizing:border-box;"></span>';
    }
    var tintable = icon.kind === 'svg' ? TB.iconTintable(icon.value) : true;
    if (!tintable) {
      return '<img class="kb-tb-img" alt="" style="width:' + size + 'px;height:' + size +
        'px;object-fit:contain;" src="' + esc(url) + '">';
    }
    var mask = 'mask-image:url(&quot;' + esc(url) + '&quot;);-webkit-mask-image:url(&quot;' + esc(url) + '&quot;);' +
      'mask-size:contain;-webkit-mask-size:contain;mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat;' +
      'mask-position:center;-webkit-mask-position:center;background-color:' + esc(fg) + ';';
    return '<span class="kb-tb-mask" style="width:' + size + 'px;height:' + size + 'px;' + mask + '"></span>';
  }

  function iconHint(icon) {
    if (!icon) return '无图标';
    if (icon.kind === 'text') return '文字图标';
    if (icon.kind !== 'svg') return '图标';
    return TB.iconTintable(icon.value) ? '单色图标，跟随主题文字色' : '图标自带实色，原样渲染';
  }

  /* 中间那排：图标按钮固定 44dp 方框；文字图标按内容撑开（ToolButton 的
     image / textView 两支），激活态另加 accentKeyBackgroundColor(0x3f) + 8dp 圆角。 */
  function mainButtonHtml(button, ctx) {
    var m = ctx.metrics;
    var icon = normalizeIcon(ctx.iconFor ? ctx.iconFor(button) : null);
    var active = ctx.activeIds.indexOf(button.id) >= 0;
    var fg = active ? ctx.colors.active : ctx.colors.icon;
    var title = button.label + ' · ' + iconHint(icon) + (active ? ' · 已激活' : '');
    var style;
    var inner;

    if (icon && icon.kind === 'text') {
      inner = iconInner(icon, m.icon, fg);
      style = 'height:' + m.height + 'px;min-width:' + m.footprint + 'px;padding:0 ' +
        Math.round(4 * m.pxPerDp) + 'px;border-radius:' + Math.max(2, Math.round(8 * m.pxPerDp)) + 'px;' +
        'font-size:' + m.label + 'px;background:' + (active ? ctx.colors.activeSoft : 'transparent') + ';';
    } else {
      inner = iconInner(icon, m.icon, fg) ||
        '<span class="kb-tb-label" style="font-size:' + m.label + 'px;color:' + esc(fg) + '">' + esc(button.label) + '</span>';
      style = 'width:' + m.footprint + 'px;height:' + m.height + 'px;border-radius:' + m.corner + 'px;' +
        'font-size:' + m.label + 'px;';
    }
    return '<button type="button" class="kb-tb-btn" data-kb-tb-btn="' + esc(button.id) + '" tabindex="-1"' +
      ' title="' + esc(title) + '" style="' + style + '">' + inner + '</button>';
  }

  /* 行首/行尾系统按钮：App 里宽度也等于 barHeight（KeyboardPreviewUi 的
     buttonSize = barHeight），所以比中间那排窄。 */
  function edgeButtonHtml(button, ctx) {
    var m = ctx.metrics;
    var icon = normalizeIcon(ctx.iconFor ? ctx.iconFor(button) : null);
    var inner = iconInner(icon, m.icon, ctx.colors.icon) ||
      '<span class="kb-tb-label" style="font-size:' + m.label + 'px;color:' + esc(ctx.colors.icon) + '">' +
      esc(button.label) + '</span>';
    return '<button type="button" class="kb-tb-btn kb-tb-edge" data-kb-tb-btn="' + esc(button.id) + '" tabindex="-1"' +
      ' title="' + esc(button.label + ' · ' + iconHint(icon) + '（App 内固定存在，不可移除）') + '"' +
      ' style="width:' + m.height + 'px;height:' + m.height + 'px;border-radius:' + m.corner +
      'px;font-size:' + m.label + 'px;flex:0 0 auto;">' + inner + '</button>';
  }

  /* ---------------------------------------------------------------- 状态区 */

  /* 状态区条目（StatusAreaEntryUi.kt），48dp 圆形底色块 + 居中图标 + 下方标签。
     底色：激活 genericActiveBackgroundColor 否则 keyBackgroundColor；
     图标/文字色：激活 genericActiveForegroundColor 否则 keyTextColor；标签 keyTextColor。 */
  function statusCellHtml(button, ctx) {
    var m = ctx.metrics;
    var s = TB.STATUS_ENTRY;
    var icon = normalizeIcon(ctx.iconFor ? ctx.iconFor(button) : null);
    var active = ctx.activeIds.indexOf(button.id) >= 0;
    var fg = active ? ctx.colors.statusActiveFg : ctx.colors.statusFg;
    var circleBg = active ? ctx.colors.statusActiveBg : ctx.colors.statusCircle;
    var circle = Math.max(16, Math.round(s.circleDp * m.pxPerDp));
    var iconSize = Math.max(10, Math.min(circle - 8, Math.round(s.iconDp * m.pxPerDp)));
    var labelSize = Math.max(8, Math.round(s.labelDp * m.pxPerDp));
    var inner = iconInner(icon, iconSize, fg) ||
      '<span class="kb-tb-label" style="font-size:' + iconSize + 'px;color:' + esc(fg) + '">' +
      esc(firstChar(button.label)) + '</span>';
    return '<div class="kb-tb-cell" data-kb-tb-btn="' + esc(button.id) + '" title="' +
      esc(button.label + ' · ' + iconHint(icon) + (active ? ' · 已激活' : '') + (button.fixed ? ' · App 内固定存在' : '')) +
      '" style="height:' + Math.max(40, Math.round(s.heightDp * m.pxPerDp)) + 'px;">' +
      '<span class="kb-tb-circle" style="width:' + circle + 'px;height:' + circle + 'px;margin-top:' +
      Math.max(0, Math.round(s.circleTopDp * m.pxPerDp)) + 'px;background:' + esc(circleBg) + ';">' + inner + '</span>' +
      '<span class="kb-tb-celllabel" style="font-size:' + labelSize + 'px;margin-top:' +
      Math.max(0, Math.round(s.labelGapDp * m.pxPerDp)) + 'px;color:' + esc(ctx.colors.statusLabel) + ';">' +
      esc(button.label) + '</span></div>';
  }

  /* 无图标、无自定义文字时，App 取标签首字符当文字图标（StatusAreaEntryUi.getFirstCharacter）。 */
  function firstChar(label) {
    var text = String(label == null ? '' : label);
    return text ? Array.from(text)[0] : '';
  }

  function buildCtx(o, m) {
    var colors = o.colors || {};
    return {
      metrics: m,
      colors: {
        bar: colors.bar || 'transparent',
        icon: colors.icon || 'currentColor',
        active: colors.active || colors.icon || 'currentColor',
        activeSoft: colors.activeSoft || 'transparent',
        panel: colors.panel || colors.bar || 'transparent',
        statusBg: colors.statusBg || colors.panel || colors.bar || 'transparent',
        statusCircle: colors.statusCircle || colors.panel || 'transparent',
        statusActiveBg: colors.statusActiveBg || colors.activeSoft || 'transparent',
        statusFg: colors.statusFg || colors.icon || 'currentColor',
        statusActiveFg: colors.statusActiveFg || colors.active || 'currentColor',
        statusLabel: colors.statusLabel || colors.statusFg || 'currentColor'
      },
      iconFor: o.iconFor,
      activeIds: o.activeIds || []
    };
  }

  /* ---------------------------------------------------------------- 渲染 */

  /* 工具栏行（KeyboardPreviewUi.kt:649-711 的 menuButton + ButtonsBarUi + hideButton）。
     opts:
       show          是否显示（false → 空串）
       keyBorder     同 App 的 key_border_enabled：开则工具栏透明
       heightPx      真机 kawaiiBarHeightPx 换算出的行高（可选）
       pxPerDp       预览的 dp→px 比例
       colors        { bar, icon, active, activeSoft, panel }
       iconFor(btn)  → null | { kind:'svg'|'url'|'text', value }
       activeIds     激活态按钮 id（默认空） */
  TB.render = function (opts) {
    var o = opts || {};
    if (!o.show) return '';
    var m = metrics(o.pxPerDp, o.heightPx);
    var ctx = buildCtx(o, m);
    var barBg = o.keyBorder ? 'transparent' : esc(ctx.colors.bar);
    var row = '<div class="kb-tb-row" style="display:flex;align-items:center;justify-content:space-between;' +
      'gap:' + m.gap + 'px;height:' + m.height + 'px;padding:0 ' + m.margin + 'px;box-sizing:border-box;">' +
      edgeButtonHtml(TB.SYSTEM_BUTTONS.toggle, ctx) +
      '<div class="kb-tb-group" style="display:flex;align-items:center;justify-content:space-around;gap:' +
      m.gap + 'px;flex:1 1 auto;min-width:0;height:100%;">' +
      TB.KAWAII_BUTTONS.map(function (b) { return mainButtonHtml(b, ctx); }).join('') +
      '</div>' +
      edgeButtonHtml(TB.SYSTEM_BUTTONS.hide, ctx) +
      '</div>';
    TB.lastMetrics = m;
    return '<div class="kb-tb-shell" style="border-radius:' + m.corner + 'px;background:' + barBg +
      ';box-sizing:border-box;">' + row + '</div>';
  };

  /* 状态区面板（toolbar_toggle 升起，App 内整块替换键盘窗口）；4 列网格，
     每格 96dp 高；key_border 关时面板底色 = barColor（StatusAreaWindow.kt:44）。 */
  TB.renderStatusArea = function (opts) {
    var o = opts || {};
    var m = metrics(o.pxPerDp, o.heightPx);
    var ctx = buildCtx(o, m);
    var cells = TB.STATUS_BUTTONS.map(function (b) { return statusCellHtml(b, ctx); }).join('');
    var bg = o.keyBorder ? 'transparent' : esc(ctx.colors.statusBg || ctx.colors.bar);
    TB.lastMetrics = m;
    return '<div class="kb-tb-status" style="display:grid;grid-template-columns:repeat(' + TB.STATUS_COLUMNS +
      ',minmax(0,1fr));gap:' + m.gap + 'px;padding:' + m.margin + 'px;box-sizing:border-box;border-radius:' +
      m.corner + 'px;background:' + bg + ';">' + cells + '</div>';
  };

  TB.metricsFor = metrics;
  root.F5aToolbarPreview = TB;
})(typeof window !== 'undefined' ? window : globalThis);
