/* f5a-see-me — 符号 / Emoji / 颜文字面板编辑标签页
 *
 * 移植自 D:/GitHub/foxy/foxy-editor/js/symbol-editor.js(小狐狸 see me 的同一页),
 * 数据源改为**本项目输入法 app 的内置符号目录**:
 *   fx-rime-only/app/src/main/assets/bundled/symbols/{symbols,emoji,kaomoji}.json
 * 由 tests/gen-presets.cjs 生成为 data/{symbols,emoji,kaomoji}.json 与
 * js/symbol-data.js(root.F5A_SYMBOL_DATA)。格式契约与 App 端一致,必须照抄的点:
 *   · 顶层只有两个键,**没有 type 字段**:{ "multiLine": false, "groups": [
 *       { "names": {"zh":...,"zh-Hant":...,"en":...}, "symbols": ["...","..."] } ] };
 *   · 组名走语言回退链(FE.symbolGroupLabel);
 *   · 空 names / 空 symbols 的组会被 App **整组静默丢弃** → 校验器报警;
 *   · multiLine 语义:true → 每行 1 格、行高自适应;false → 每行 6 格、固定 40dp 高,
 *     多字符条目会被**等比缩小**到很小(不是裁掉,只是难认),校验器给 warn;
 *   · 旧格式兼容:顶层直接是数组时按 {multiLine:false, groups:[...]} 处理;
 *   · 三类是**独立文件**,彼此不共用 multiLine。
 *
 * 与 foxy 版的差异(有意为之):
 *   · 数据来源不是「外部存储目录」而是 APK 内置 assets —— 本编辑器的定位是
 *     「编辑后导出 JSON,再放进 app 的符号目录」,所以不提供目录扫描,只提供
 *     导入/导出/内置样例;路径提示按本项目的实际落点写。
 *   · 不用 FE.defFilterValue / FE.collapsibleDefItem 这套 foxy 框架件,改用
 *     f5a 自己的 .inner-card / .mini-input 体系,避免引入跨页依赖。
 *
 * 本文件只挂 window.F5aSymbolPanel,不改 app.js 的任何状态;无 DOM 环境下
 * (Node 测试)纯逻辑部分照常可用。
 */
(function (root) {
  'use strict';

  var SP = {};

  /* ================================================================
   * 一、纯逻辑(Node 测试直接可用,不依赖 DOM)
   * ================================================================ */

  SP.KINDS = [
    { id: 'symbols', label: '符号', dir: 'symbols', file: 'symbols.json', multiLine: false,
      desc: '单字符符号(每行 6 格)' },
    { id: 'emoji', label: 'Emoji', dir: 'emoji', file: 'emoji.json', multiLine: false,
      desc: 'Emoji 表情(每行 6 格)' },
    { id: 'kaomoji', label: '颜文字', dir: 'kaomoji', file: 'kaomoji.json', multiLine: true,
      desc: '多字符颜文字(每行 1 格,默认 multiLine)' }
  ];

  SP.kindMeta = function (kind) {
    var list = SP.KINDS;
    for (var i = 0; i < list.length; i++) if (list[i].id === kind) return list[i];
    for (var j = 0; j < list.length; j++) {
      if (kind && String(kind).toLowerCase() === list[j].id) return list[j];
    }
    return list[0];
  };

  SP.isPlainObject = function (v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  };

  /* 字形簇计数:multiLine=false 的「多字符条目」判断要用它。
   * 为什么不用 String.length:`❤️` 是 2 个码元、`🏴󠁧󠁢󠁷󠁬󠁳󠁿` 是 7 个码元,
   * 在 App 的格子里都只占一格 —— 拿 length 判断会把内置 emoji 全判成多字符而刷屏误报。 */
  var segmenter = null;
  SP.graphemeCount = function (s) {
    s = String(s == null ? '' : s);
    if (!s) return 0;
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      try {
        if (!segmenter) segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
        var n = 0;
        var it = segmenter.segment(s)[Symbol.iterator]();
        for (var r = it.next(); !r.done; r = it.next()) n++;
        return n;
      } catch (e) { /* 落到近似实现 */ }
    }
    return graphemesLite(s);
  };

  function isMark(cp) {
    try { return /\p{M}/u.test(String.fromCodePoint(cp)); }
    catch (e) { return cp >= 0x0300 && cp <= 0x036F; }
  }

  function graphemesLite(s) {
    var cps = Array.from(s);
    var n = 0, i = 0;
    function cpAt(k) { return k < cps.length ? cps[k].codePointAt(0) : -1; }
    while (i < cps.length) {
      var cp = cpAt(i);
      /* 区域指示符(国旗)成对算一格 */
      if (cp >= 0x1F1E6 && cp <= 0x1F1FF) {
        var nx = cpAt(i + 1);
        i += (nx >= 0x1F1E6 && nx <= 0x1F1FF) ? 2 : 1;
        n++;
        continue;
      }
      n++; i++;
      /* 吸收后续 ZWJ 序列 / 变体选择符 / 肤色修饰符 / 组合记号 / tag 字符 */
      for (;;) {
        var c2 = cpAt(i);
        if (c2 < 0) break;
        if (c2 === 0x200D) { i++; if (i < cps.length) i++; continue; }
        if ((c2 >= 0xFE00 && c2 <= 0xFE0F) || (c2 >= 0xE0100 && c2 <= 0xE01EF) ||
            (c2 >= 0x1F3FB && c2 <= 0x1F3FF) || c2 === 0x20E3 ||
            (c2 >= 0xE0020 && c2 <= 0xE007F) || isMark(c2)) { i++; continue; }
        break;
      }
    }
    return n;
  }

  /* 容错归一化。接受:
   *   · 标准对象 { multiLine, groups }
   *   · 旧格式:顶层直接是数组(multiLine 强制 false)
   *   · null / undefined → 空文档(multiLine 取该类的默认值:颜文字 true)
   * 只保留 names / symbols 两个已知键(多余的键不会写回文件);无法识别的分组条目丢弃。 */
  SP.normalizeProfile = function (kind, p) {
    var meta = SP.kindMeta(kind);
    var out = { multiLine: false, groups: [] };
    var rawGroups = null;
    if (Array.isArray(p)) {
      /* 旧格式两种写法都要认:
       *   ["a","b","c"]        —— 一个分组的条目列表
       *   [["a","b"],[...]]    —— 每个子数组一个分组
       * 一律按「每项各作一组」解析会把前者拆成三个单条目分组,是错的。 */
      var allStrings = p.length > 0 && p.every(function (x) { return typeof x === 'string'; });
      rawGroups = allStrings ? [p] : p;
    } else if (SP.isPlainObject(p)) {
      out.multiLine = (p.multiLine === true || p.multiLine === 'true');
      rawGroups = Array.isArray(p.groups) ? p.groups : [];
    } else {
      out.multiLine = meta.multiLine === true;
      return out;
    }
    function takeSymbols(arr, dst) {
      (Array.isArray(arr) ? arr : []).forEach(function (s) {
        if (s == null) return;
        dst.push(typeof s === 'string' ? s : String(s));
      });
    }
    rawGroups.forEach(function (g) {
      var names = {}, symbols = [];
      if (SP.isPlainObject(g)) {
        if (SP.isPlainObject(g.names)) {
          Object.keys(g.names).forEach(function (k) {
            var v = g.names[k];
            if (v == null) return;
            names[k] = typeof v === 'string' ? v : String(v);
          });
        }
        takeSymbols(g.symbols, symbols);
      } else if (Array.isArray(g)) {
        takeSymbols(g, symbols);
      } else if (typeof g === 'string') {
        symbols.push(g);
      } else {
        return;
      }
      out.groups.push({ names: names, symbols: symbols });
    });
    return out;
  };

  /* 序列化:顶层键序固定为 multiLine → groups(App 只认这两个键,无 type)。 */
  SP.serializeProfile = function (p) {
    var n = SP.normalizeProfile(null, p);
    var ordered = { multiLine: n.multiLine === true, groups: [] };
    n.groups.forEach(function (g) {
      ordered.groups.push({ names: g.names, symbols: g.symbols });
    });
    return JSON.stringify(ordered, null, 2);
  };

  /* 组名按语言回退链取值(与 App 端 SymbolCatalogs.resolveName 口径一致):
   *   1. names[完整标签] 精确命中(如 zh-Hant / zh-TW / en);
   *   2. 未命中 → 取第一个 "-" 之前的主标签 V;
   *      · V === 'zh' 且标签 ∈ {zh-TW, zh-HK, zh-MO} 且存在 zh-Hant → zh-Hant;
   *      · 否则 names[V];
   *   3. V === 'zh' 仍未命中 → 再试 names['zh-Hant'];
   *   4. 兜底:names 里的第一个非空值(依赖解析保序)。 */
  SP.groupLabel = function (group, lang) {
    var names = (group && SP.isPlainObject(group.names)) ? group.names : {};
    var keys = Object.keys(names);
    function get(k) {
      var v = k == null ? null : names[k];
      return (typeof v === 'string' && v !== '') ? v : null;
    }
    function first() {
      for (var i = 0; i < keys.length; i++) {
        var v = names[keys[i]];
        if (typeof v === 'string' && v !== '') return v;
      }
      return '';
    }
    var tag = (lang == null || lang === '') ? '' : String(lang);
    if (tag) {
      var exact = get(tag);
      if (exact) return exact;
      var v = tag.split('-')[0];
      if (v) {
        if (v === 'zh' && ['zh-TW', 'zh-HK', 'zh-MO'].indexOf(tag) >= 0) {
          var hant = get('zh-Hant');
          if (hant) return hant;
        }
        var main = get(v);
        if (main) return main;
        if (v === 'zh') {
          var hant2 = get('zh-Hant');
          if (hant2) return hant2;
        }
      }
    }
    return first();
  };

  /* 校验。宁可少报不要乱报(一个 err 会让 App 端整份文件不可用):
   *   err  —— 结构根本不合法(groups 不是非空数组、分组不是对象、names/symbols 类型错);
   *   warn —— App 会静默丢弃或行为可疑的(空 names / 空 symbols 的组、缺 zh 组名、
   *           非字符串条目、multiLine=false 时的多字符条目可读性风险)。 */
  SP.validateProfile = function (kind, p) {
    var errors = [], warnings = [];
    if (Array.isArray(p)) {
      warnings.push('顶层是数组(旧格式):App 端会把 multiLine 强制当作 false 处理');
    } else if (!SP.isPlainObject(p)) {
      errors.push('符号数据必须是 JSON 对象(旧格式也接受顶层数组)');
      return { errors: errors, warnings: warnings };
    }
    var groups = Array.isArray(p) ? p : p.groups;
    if (!Array.isArray(groups)) {
      errors.push('groups 必须是数组');
      return { errors: errors, warnings: warnings };
    }
    if (!groups.length) {
      errors.push('groups 必须是非空数组(空文件在 App 端会抛 empty catalog)');
      return { errors: errors, warnings: warnings };
    }
    var multiLine = Array.isArray(p) ? false : (p.multiLine === true || p.multiLine === 'true');

    var dropped = [], missingZh = [], badNames = [], badSymbols = [], nonString = 0;
    var multi = 0, multiSample = '';
    var totalEntries = 0;
    groups.forEach(function (g, i) {
      var where = '第 ' + (i + 1) + ' 组';
      if (!SP.isPlainObject(g)) { errors.push(where + ' 不是对象'); return; }
      if (g.names != null && !SP.isPlainObject(g.names)) badNames.push(where);
      if (g.symbols != null && !Array.isArray(g.symbols)) badSymbols.push(where);
      var names = SP.isPlainObject(g.names) ? g.names : {};
      var symbols = Array.isArray(g.symbols) ? g.symbols : [];
      if (!Object.keys(names).length || !symbols.length) { dropped.push(where); return; }
      if (!names.zh) missingZh.push(where);
      totalEntries += symbols.length;
      symbols.forEach(function (s) {
        if (typeof s !== 'string') nonString++;
        if (multiLine) return;
        if (SP.graphemeCount(s) > 1) {
          multi++;
          if (!multiSample) multiSample = String(s);
        }
      });
    });

    if (badNames.length) errors.push(badNames.join('、') + ' 的 names 不是对象(应为 {"zh":"..."})');
    if (badSymbols.length) errors.push(badSymbols.join('、') + ' 的 symbols 不是数组');
    if (dropped.length) warnings.push(dropped.join('、') + ' 的 names 或 symbols 为空 —— App 端会整组静默丢弃');
    if (missingZh.length) warnings.push(missingZh.join('、') + ' 缺少 zh 组名(App 会走回退链取第一个可用的名字)');
    if (nonString) warnings.push(nonString + ' 个条目不是字符串(已按字符串处理)');
    /* 只有多字符条目占了相当比例(>25%)才提示开 multiLine:少量多字符条目
     * (拼音、国际音标)是这类目录的常态,全部报警等于没报。 */
    if (multi && multi / Math.max(1, totalEntries) > 0.25) {
      warnings.push('multiLine 为 false 但有 ' + multi + ' / ' + totalEntries +
        ' 个多字符条目(如「' + ellipsis(multiSample, 12) +
        '」):App 端格子固定 40dp 高,这类条目会被等比缩小到很小(不是裁掉,只是可读性差);' +
        '若整份文件都是这种长条目,应开启 multiLine');
    }
    return { errors: errors, warnings: warnings, multiCharCount: multi, entryCount: totalEntries };
  };

  function ellipsis(s, n) {
    var cps = Array.from(String(s == null ? '' : s));
    if (cps.length <= n) return cps.join('');
    return cps.slice(0, n).join('') + '...';
  }
  SP.ellipsis = ellipsis;
  /* 近似实现暴露出来,供测试用真 Intl.Segmenter 对拍(环境无 Segmenter 时走它) */
  SP.graphemeCountLite = graphemesLite;

  /* 搜索匹配文本:组名(三语全部)+ 全部条目内容 */
  SP.groupMatchText = function (g) {
    var parts = [];
    if (SP.isPlainObject(g.names)) Object.keys(g.names).forEach(function (k) { parts.push(g.names[k]); });
    (Array.isArray(g.symbols) ? g.symbols : []).forEach(function (s) { parts.push(s); });
    return parts.join(' ');
  };

  /* 分组显示名:组本身没有 name 字段(名字在 names 里),用 zh 回退链的结果;
   * 同名分组追加 #2/#3 保证唯一(展开态键与定位都依赖它唯一)。 */
  SP.groupDisplayNames = function (groups) {
    var used = {}, out = [];
    (groups || []).forEach(function (g) {
      var base = SP.groupLabel(g, 'zh') || '(未命名分组)';
      var n = used[base] || 0;
      used[base] = n + 1;
      out.push(n ? base + ' #' + (n + 1) : base);
    });
    return out;
  };

  /* 内置极小样例:仅供「载入内置样例」快速上手。刻意不放进 data/(那三份是
   * app assets 的逐字段副本,不该被样例污染)。 */
  SP.SAMPLES = {
    symbols: {
      multiLine: false,
      groups: [
        { names: { zh: '常用标点', 'zh-Hant': '常用標點', en: 'Punctuation' },
          symbols: [',', '.', '!', '?', ';', ':', '(', ')', '"', "'", '...', '—'] },
        { names: { zh: '数学符号', 'zh-Hant': '數學符號', en: 'Math' },
          symbols: ['+', '-', '×', '÷', '=', '≈', '≠', '≤', '≥', '∞', '√', 'π'] }
      ]
    },
    emoji: {
      multiLine: false,
      groups: [
        { names: { zh: '笑脸', 'zh-Hant': '笑臉', en: 'Smileys' },
          symbols: ['😀', '😄', '😊', '🙂', '😉', '😍'] },
        { names: { zh: '常用', 'zh-Hant': '常用', en: 'Common' },
          symbols: ['👍', '🙏', '💯', '🔥', '✨', '❤️'] }
      ]
    },
    kaomoji: {
      multiLine: true,
      groups: [
        { names: { zh: '开心', 'zh-Hant': '開心', en: 'Happy' },
          symbols: ['(＾▽＾)', '(≧▽≦)', 'ヽ(✿ﾟ▽ﾟ)ノ', '(๑•̀ㅂ•́)و✧'] },
        { names: { zh: '无奈', 'zh-Hant': '無奈', en: 'Helpless' },
          symbols: ['(・_・;)', '(-_-;)', '(￣▽￣;)'] }
      ]
    }
  };

  /* 从文本载入。返回 { ok, profile?, error? } —— 与 foxy 版同义,
   * 但错误信息按本项目的文件说明写。 */
  SP.loadProfileText = function (text, kind, fileName) {
    var raw = String(text == null ? '' : text);
    if (!raw.trim()) {
      return { ok: false, error: (fileName ? fileName + ':' : '') + '内容为空' };
    }
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { ok: false, error: (fileName ? fileName + ':' : '') + 'JSON 解析失败 —— ' + e.message };
    }
    var profile = SP.normalizeProfile(kind, parsed);
    return { ok: true, profile: profile, legacy: Array.isArray(parsed) };
  };

  /* ================================================================
   * 二、编辑器状态
   * ================================================================ */

  var state = {
    kind: 'symbols',
    profiles: {},        /* kind -> profile */
    fileNames: {},       /* kind -> 上次导入的文件名 */
    sources: {},         /* kind -> 'builtin' | 'file' | 'sample' */
    filter: '',
    openGroups: {},      /* 展开态,键是「类别:显示名」 */
    selectedEntry: null, /* { kind, gi, ei } —— 选中后「插入选中项」用它 */
    dirty: false
  };

  function profile() {
    var meta = SP.kindMeta(state.kind);
    if (!SP.isPlainObject(state.profiles[meta.id])) {
      state.profiles[meta.id] = SP.normalizeProfile(meta.id, builtinProfile(meta.id));
      state.sources[meta.id] = 'builtin';
    }
    return state.profiles[meta.id];
  }

  function builtinProfile(kind) {
    var data = root.F5A_SYMBOL_DATA;
    if (data && SP.isPlainObject(data[kind])) return data[kind];
    return null;
  }

  SP.builtinProfile = builtinProfile;

  SP.getState = function () { return state; };

  SP.resetToBuiltin = function (kind) {
    var meta = SP.kindMeta(kind || state.kind);
    var data = builtinProfile(meta.id);
    state.profiles[meta.id] = SP.normalizeProfile(meta.id, data);
    state.sources[meta.id] = 'builtin';
    delete state.fileNames[meta.id];
    state.dirty = false;
    return state.profiles[meta.id];
  };

  /* ================================================================
   * 三、DOM 渲染
   * ================================================================ */

  var BENCH_IDS = [
    'symbol-panel-status', 'sym-kind', 'sym-multiline', 'sym-source-hint',
    'sym-import-file', 'sym-json-card', 'sym-json', 'sym-json-status', 'sym-json-issues',
    'sym-filter', 'sym-new-group', 'sym-list', 'sym-count-hint'
  ];

  function $(id) {
    if (typeof document === 'undefined' || !document.getElementById) return null;
    return document.getElementById(id);
  }

  function setStatus(id, text, mode) {
    var node = $(id);
    if (!node) return;
    node.classList.remove('ok', 'err');
    if (mode === 'ok') node.classList.add('ok');
    if (mode === 'err') node.classList.add('err');
    node.textContent = text || '';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 在页签存在时渲染;页签不在(旧页面/测试)则空转。 */
  SP.isMounted = function () {
    return !!(typeof document !== 'undefined' && document.getElementById && $('sym-list'));
  };

  SP.render = function () {
    if (!SP.isMounted()) return;
    renderToolbar();
    renderGroupList();
    syncJsonFromState();
    renderHint();
  };

  function renderToolbar() {
    var sel = $('sym-kind');
    if (sel) {
      if (!sel.options || !sel.options.length) {
        sel.innerHTML = SP.KINDS.map(function (m) {
          return '<option value="' + m.id + '">' + escapeHtml(m.label) + '</option>';
        }).join('');
      }
      sel.value = state.kind;
    }
    var chk = $('sym-multiline');
    if (chk) chk.checked = profile().multiLine === true;
    var src = $('sym-source-hint');
    if (src) {
      var meta = SP.kindMeta(state.kind);
      var from = state.sources[state.kind] || 'builtin';
      var label = from === 'builtin' ? '来自输入法内置资源'
        : from === 'sample' ? '内置样例(不是 app 数据)' : '来自导入文件';
      var name = state.fileNames[state.kind] || meta.file;
      src.textContent = `${meta.label} · ${label} · ${name}`;
    }
  }

  function renderHint() {
    var host = $('sym-path-hint');
    if (!host) return;
    var meta = SP.kindMeta(state.kind);
    host.innerHTML =
      '<div>编辑完成后点「导出 JSON」,把文件放进 app 的符号目录 ' +
      '<code>Android/data/org.fcitx.fcitx5.android.fx.rime/files/symbols/' + escapeHtml(meta.dir) + '/&lt;名&gt;.json</code>' +
      '(外部存储根下按 app 实际包名对应),再到「设置 → 符号面板」里选中该文件才生效。</div>' +
      '<div>⚠️ 内置符号走 APK assets:放一份同名文件<strong>不会</strong>自动覆盖内置,必须显式选中。</div>' +
      '<div>' + escapeHtml(meta.desc) + ';顶层只有 <code>multiLine</code> 与 <code>groups</code> 两个键,<strong>没有 type 字段</strong>。</div>';
  }

  function groupKey(displayName) {
    return state.kind + ':' + displayName;
  }

  function renderGroupList() {
    var host = $('sym-list');
    if (!host) return;
    var p = profile();
    var groups = p.groups || [];
    var names = SP.groupDisplayNames(groups);
    var filter = (state.filter || '').trim().toLowerCase();
    var idx = groups.map(function (_, i) { return i; });
    if (filter) {
      idx = idx.filter(function (i) {
        var hay = (names[i] + ' ' + SP.groupMatchText(groups[i])).toLowerCase();
        return hay.indexOf(filter) >= 0;
      });
    }
    var cnt = $('sym-count-hint');
    if (cnt) {
      cnt.textContent = filter
        ? `匹配 ${idx.length} / ${groups.length} 个分组`
        : `${groups.length} 个分组 · ${groups.reduce(function (a, g) { return a + (g.symbols || []).length; }, 0)} 个条目`;
    }
    if (!groups.length) {
      host.innerHTML = '<div class="status">该类别还没有分组。用上方「新建分组」添加;一个分组 = 一个名字 + 一串条目。</div>';
      return;
    }
    if (!idx.length) {
      host.innerHTML = '<div class="status">没有匹配的分组。</div>';
      return;
    }
    host.innerHTML = idx.map(function (gi) {
      var g = groups[gi];
      var dn = names[gi];
      var count = (g.symbols || []).length;
      var langs = SP.isPlainObject(g.names) ? Object.keys(g.names) : [];
      var empty = !count || !langs.length;
      var open = !!state.openGroups[groupKey(dn)];
      return `
        <details class="inner-card sym-group-card" data-gi="${gi}"${open ? ' open' : ''}>
          <summary>
            <span class="sym-group-name">${escapeHtml(dn)}</span>
            <span class="def-badges${empty ? ' st-warn' : ''}">${empty ? '⚠ ' : ''}${count} 条 · 组名 ${escapeHtml(langs.length ? langs.join('/') : '(空,会被丢弃)')}</span>
          </summary>
          <div class="inner-card-body sym-group-body">
            ${buildGroupEditor(gi, g)}
          </div>
        </details>
      `;
    }).join("");
    bindGroupList();
  }

  function buildGroupEditor(gi, g) {
    var names = SP.isPlainObject(g.names) ? g.names : {};
    var symbols = Array.isArray(g.symbols) ? g.symbols : [];
    var entryHtml = symbols.map(function (s, ei) {
      return `<button type="button" class="sym-entry" data-gi="${gi}" data-ei="${ei}" title="${escapeHtml(s)}">${escapeHtml(s)}</button>`;
    }).join("");
    return `
      <div class="form-row form-inline">
        <label>组名 zh</label>
        <input class="mini-input" data-sym-name="zh" data-gi="${gi}" value="${escapeHtml(names.zh || '')}" placeholder="必填">
        <label>zh-Hant</label>
        <input class="mini-input" data-sym-name="zh-Hant" data-gi="${gi}" value="${escapeHtml(names['zh-Hant'] || '')}" placeholder="可选">
        <label>en</label>
        <input class="mini-input" data-sym-name="en" data-gi="${gi}" value="${escapeHtml(names.en || '')}" placeholder="可选">
      </div>
      <div class="sym-entry-grid${profile().multiLine ? ' multi-line' : ''}">${entryHtml || '<span class="status">(空分组,会被 App 丢弃)</span>'}</div>
      <div class="toolbar sym-group-toolbar">
        <input class="mini-input" data-sym-new-entry="${gi}" placeholder="新增条目(可含多个词,按空格拆)">
        <button type="button" class="mini-button" data-sym-add-entry="${gi}">添加到末尾</button>
        <button type="button" class="mini-button danger" data-sym-del-group="${gi}">删除本组</button>
      </div>
    `;
  }

  function bindGroupList() {
    var host = $('sym-list');
    if (!host) return;
    host.querySelectorAll('details.sym-group-card').forEach(function (node) {
      node.addEventListener('toggle', function () {
        var gi = Number(node.dataset.gi);
        var dn = SP.groupDisplayNames(profile().groups)[gi];
        if (!dn) return;
        if (node.open) state.openGroups[groupKey(dn)] = true;
        else delete state.openGroups[groupKey(dn)];
      });
    });
    host.querySelectorAll('input[data-sym-name]').forEach(function (input) {
      input.addEventListener('change', function () {
        var gi = Number(input.dataset.gi);
        var g = profile().groups[gi];
        if (!g) return;
        var lang = input.dataset.symName;
        var value = input.value.trim();
        if (!g.names) g.names = {};
        if (value) g.names[lang] = value;
        else delete g.names[lang];
        markDirty(`已更新第 ${gi + 1} 组组名`);
        SP.render();
      });
    });
    host.querySelectorAll('button[data-sym-add-entry]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var gi = Number(btn.dataset.symAddEntry);
        var input = host.querySelector(`input[data-sym-new-entry="${gi}"]`);
        var raw = input ? input.value : '';
        var parts = String(raw || '').split(/\s+/).filter(Boolean);
        if (!parts.length) { setStatus('symbol-panel-status', '请先输入要新增的条目', 'err'); return; }
        var g = profile().groups[gi];
        if (!g) return;
        if (!Array.isArray(g.symbols)) g.symbols = [];
        parts.forEach(function (s) { g.symbols.push(s); });
        markDirty(`已新增 ${parts.length} 个条目`);
        SP.render();
      });
    });
    host.querySelectorAll('button[data-sym-del-group]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var gi = Number(btn.dataset.symDelGroup);
        var g = profile().groups[gi];
        if (!g) return;
        var dn = SP.groupDisplayNames(profile().groups)[gi];
        if (typeof confirm === 'function' && !confirm(`删除分组「${dn}」及其 ${(g.symbols || []).length} 个条目?`)) return;
        profile().groups.splice(gi, 1);
        delete state.openGroups[groupKey(dn)];
        markDirty(`已删除分组「${dn}」`);
        SP.render();
      });
    });
    host.querySelectorAll('button.sym-entry').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var gi = Number(btn.dataset.gi), ei = Number(btn.dataset.ei);
        var prev = state.selectedEntry;
        if (prev && prev.gi === gi && prev.ei === ei) {
          state.selectedEntry = null;
        } else {
          state.selectedEntry = { kind: state.kind, gi: gi, ei: ei };
        }
        host.querySelectorAll('button.sym-entry.selected').forEach(function (n) { n.classList.remove('selected'); });
        if (state.selectedEntry) btn.classList.add('selected');
        renderEntryOps();
      });
    });
    renderEntryOps();
  }

  /* 选中条目后出现的操作条:上移 / 下移 / 编辑 / 删除。
   * 这些是 foxy 版有而 f5a 缺的高频动作 —— 少了它就只能改 JSON。 */
  function renderEntryOps() {
    var host = $('sym-entry-ops');
    if (!host) return;
    var sel = state.selectedEntry;
    if (!sel || sel.kind !== state.kind) {
      host.innerHTML = '<span class="sym-ops-hint">点一个条目可上移/下移/编辑/删除</span>';
      return;
    }
    var g = profile().groups[sel.gi];
    var total = g ? (g.symbols || []).length : 0;
    host.innerHTML = `
      <span class="sym-ops-hint">选中第 ${sel.gi + 1} 组第 ${sel.ei + 1}/${total} 条</span>
      <button type="button" class="mini-button" data-sym-op="up">上移</button>
      <button type="button" class="mini-button" data-sym-op="down">下移</button>
      <button type="button" class="mini-button" data-sym-op="edit">编辑</button>
      <button type="button" class="mini-button danger" data-sym-op="del">删除</button>
    `;
    host.querySelectorAll('button[data-sym-op]').forEach(function (btn) {
      btn.addEventListener('click', function () { runEntryOp(btn.dataset.symOp); });
    });
  }

  function runEntryOp(op) {
    var sel = state.selectedEntry;
    if (!sel) return;
    var g = profile().groups[sel.gi];
    if (!g || !Array.isArray(g.symbols)) return;
    var list = g.symbols;
    var ei = sel.ei;
    if (op === 'up') {
      if (ei <= 0) { setStatus('symbol-panel-status', '已经是第一条', 'err'); return; }
      var tmp = list[ei - 1]; list[ei - 1] = list[ei]; list[ei] = tmp;
      sel.ei = ei - 1;
      markDirty('已上移条目');
    } else if (op === 'down') {
      if (ei >= list.length - 1) { setStatus('symbol-panel-status', '已经是最后一条', 'err'); return; }
      var tmp2 = list[ei + 1]; list[ei + 1] = list[ei]; list[ei] = tmp2;
      sel.ei = ei + 1;
      markDirty('已下移条目');
    } else if (op === 'edit') {
      var current = list[ei];
      var next = typeof prompt === 'function' ? prompt('修改条目', current) : null;
      if (next == null) return;
      if (!String(next).trim()) { setStatus('symbol-panel-status', '条目不能为空(空条目会被 App 丢弃)', 'err'); return; }
      list[ei] = String(next).trim();
      markDirty('已修改条目');
    } else if (op === 'del') {
      list.splice(ei, 1);
      state.selectedEntry = null;
      markDirty('已删除条目');
    }
    SP.render();
  }

  function markDirty(msg) {
    state.dirty = true;
    setStatus('symbol-panel-status', msg || '已修改', 'ok');
  }

  /* ---- JSON 卡片 ---- */

  SP.currentJsonText = function () {
    return SP.serializeProfile(profile()) + '\n';
  };

  function syncJsonFromState() {
    var ta = $('sym-json');
    if (!ta) return;
    ta.value = SP.currentJsonText();
    renderIssues(SP.validateProfile(state.kind, profile()));
  }

  function renderIssues(report) {
    var panel = $('sym-json-issues');
    if (!panel) return;
    if (!report || (!report.errors.length && !report.warnings.length)) {
      panel.className = 'json-issues';
      panel.innerHTML = '';
      return;
    }
    panel.className = 'json-issues show' + (report.errors.length ? ' error' : ' warn');
    panel.innerHTML = report.errors.map(function (e) {
      return `<div class="json-issue-line"><span class="json-issue-main">✘ ${escapeHtml(e)}</span></div>`;
    }).concat(report.warnings.map(function (w) {
      return `<div class="json-issue-line"><span class="json-issue-main">• ${escapeHtml(w)}</span></div>`;
    })).join("");
  }

  SP.applyJsonText = function () {
    var ta = $('sym-json');
    if (!ta) return { ok: false, error: '页面未挂载' };
    var loaded = SP.loadProfileText(ta.value, state.kind, '符号面板 JSON');
    if (!loaded.ok) {
      setStatus('sym-json-status', loaded.error, 'err');
      return loaded;
    }
    var report = SP.validateProfile(state.kind, loaded.profile);
    if (report.errors.length) {
      setStatus('sym-json-status', '结构有错,未应用:' + report.errors[0], 'err');
      renderIssues(report);
      return { ok: false, error: report.errors[0], report: report };
    }
    state.profiles[state.kind] = loaded.profile;
    state.sources[state.kind] = 'file';
    state.selectedEntry = null;
    state.dirty = true;
    setStatus('sym-json-status', '已应用到当前类别', 'ok');
    SP.render();
    return { ok: true, report: report };
  };

  /* ---- 导出 / 导入 ---- */

  SP.exportName = function () {
    var meta = SP.kindMeta(state.kind);
    return state.fileNames[state.kind] || meta.file;
  };

  SP.exportJson = function () {
    var text = SP.serializeProfile(profile()) + '\n';
    if (typeof document === 'undefined') return text;
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = SP.exportName();
    a.click();
    URL.revokeObjectURL(url);
    setStatus('symbol-panel-status', `已导出 ${SP.exportName()}`, 'ok');
    return text;
  };

  SP.importText = function (text, fileName) {
    var loaded = SP.loadProfileText(text, state.kind, fileName);
    if (!loaded.ok) {
      setStatus('symbol-panel-status', loaded.error, 'err');
      return loaded;
    }
    var report = SP.validateProfile(state.kind, loaded.profile);
    state.profiles[state.kind] = loaded.profile;
    state.sources[state.kind] = 'file';
    state.fileNames[state.kind] = fileName || SP.kindMeta(state.kind).file;
    state.selectedEntry = null;
    state.dirty = true;
    SP.render();
    if (report.errors.length) {
      setStatus('symbol-panel-status', `已导入但结构有错:${report.errors[0]}`, 'err');
    } else if (report.warnings.length) {
      setStatus('symbol-panel-status', `已导入 ${fileName || ''}(${report.warnings.length} 条提醒)`, 'ok');
    } else {
      setStatus('symbol-panel-status', `已导入 ${fileName || ''}`, 'ok');
    }
    return { ok: true, report: report };
  };

  /* ================================================================
   * 四、接线
   * ================================================================ */

  SP.init = function () {
    if (!SP.isMounted()) return;
    if (SP.init._done) return;
    SP.init._done = true;

    var sel = $('sym-kind');
    if (sel) {
      sel.addEventListener('change', function () {
        state.kind = SP.kindMeta(sel.value).id;
        state.selectedEntry = null;
        profile();
        setStatus('symbol-panel-status', `已切到「${SP.kindMeta(state.kind).label}」`, '');
        SP.render();
      });
    }

    var chk = $('sym-multiline');
    if (chk) {
      chk.addEventListener('change', function () {
        profile().multiLine = chk.checked;
        markDirty(chk.checked ? '已开启 multiLine(每行 1 格,高度自适应)' : '已关闭 multiLine(每行 6 格,固定 40dp 高)');
        SP.render();
      });
    }

    var filter = $('sym-filter');
    if (filter) {
      filter.addEventListener('input', function () {
        state.filter = filter.value;
        renderGroupList();
      });
    }

    var addGroup = $('sym-new-group-add');
    var newGroup = $('sym-new-group');
    function doAddGroup() {
      var name = newGroup ? newGroup.value.trim() : '';
      if (!name) { setStatus('symbol-panel-status', '请先输入分组名', 'err'); return; }
      var p = profile();
      if (p.groups.some(function (g) { return SP.groupLabel(g, 'zh') === name; })) {
        setStatus('symbol-panel-status', `已有同名分组「${name}」`, 'err');
        return;
      }
      p.groups.push({ names: { zh: name }, symbols: [] });
      if (newGroup) newGroup.value = '';
      markDirty(`已新建分组「${name}」(空分组会被 App 丢弃,记得加条目)`);
      SP.render();
    }
    if (addGroup) addGroup.addEventListener('click', doAddGroup);
    if (newGroup) {
      newGroup.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); doAddGroup(); }
      });
    }

    var exportBtn = $('sym-export-json');
    if (exportBtn) exportBtn.addEventListener('click', function () { SP.exportJson(); });

    var importBtn = $('sym-import-json');
    var fileInput = $('sym-import-file');
    if (importBtn && fileInput) {
      importBtn.addEventListener('click', function () { fileInput.value = ''; fileInput.click(); });
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () { SP.importText(reader.result, file.name); };
        reader.onerror = function () { setStatus('symbol-panel-status', '文件读取失败', 'err'); };
        reader.readAsText(file);
      });
    }

    var sampleBtn = $('sym-load-sample');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', function () {
        var meta = SP.kindMeta(state.kind);
        var sample = SP.SAMPLES[meta.id];
        state.profiles[state.kind] = SP.normalizeProfile(state.kind, sample);
        state.sources[state.kind] = 'sample';
        delete state.fileNames[state.kind];
        state.selectedEntry = null;
        state.dirty = true;
        SP.render();
        setStatus('symbol-panel-status', '已载入内置样例(不是 app 数据)', 'ok');
      });
    }

    var resetBtn = $('sym-reset-builtin');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (typeof confirm === 'function' && !confirm('放弃当前修改,恢复输入法内置的该类目录?')) return;
        SP.resetToBuiltin(state.kind);
        state.selectedEntry = null;
        SP.render();
        setStatus('symbol-panel-status', '已恢复输入法内置数据', 'ok');
      });
    }

    var applyBtn = $('sym-json-apply');
    if (applyBtn) applyBtn.addEventListener('click', function () { SP.applyJsonText(); });

    var checkBtn = $('sym-json-check');
    if (checkBtn) {
      checkBtn.addEventListener('click', function () {
        var report = SP.validateProfile(state.kind, profile());
        renderIssues(report);
        var total = report.errors.length + report.warnings.length;
        setStatus('sym-json-status', total ? `发现 ${report.errors.length} 个错误、${report.warnings.length} 条提醒` : '结构正常', total ? 'err' : 'ok');
      });
    }

    var formatBtn = $('sym-json-format');
    if (formatBtn) {
      formatBtn.addEventListener('click', function () {
        var result = SP.applyJsonText();
        if (result.ok) setStatus('sym-json-status', '已格式化并应用', 'ok');
      });
    }

    var copyBtn = $('sym-json-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', async function () {
        var text = SP.currentJsonText();
        try {
          await navigator.clipboard.writeText(text);
          setStatus('sym-json-status', '已复制到剪贴板', 'ok');
        } catch (_) {
          var ta = $('sym-json');
          if (ta) { ta.select(); document.execCommand('copy'); setStatus('sym-json-status', '已复制到剪贴板', 'ok'); }
        }
      });
    }

    var ta = $('sym-json');
    if (ta) {
      ta.addEventListener('input', function () {
        var report = SP.validateProfile(state.kind, safeParse(ta.value));
        renderIssues(report);
      });
    }

    SP.render();
  };

  function safeParse(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  /* 页签切换时调用:页签内容依赖当前数据,每次进入都重渲染一次。 */
  SP.renderOnTabEnter = function () {
    if (!SP.isMounted()) return;
    SP.render();
  };

  SP.BENCH_IDS = BENCH_IDS;

  root.F5aSymbolPanel = SP;
  /* 浏览器里 window === globalThis;测试沙箱里两者是不同对象,两处都挂。 */
  if (typeof module !== 'undefined' && module.exports) module.exports = SP;
})(typeof window !== 'undefined' ? window : globalThis);
