/* 运行时核对用的最小 DOM 与 app.js 装载器。
 *
 * 背景：f5a-see-me 是纯静态页面（index.html + js/*.js，无构建、无 jsdom），
 * 回归套件 tests/regressions.test.cjs 只覆盖纯函数。要拿到「功能项真的还在」
 * 的运行时证据，需要把 app.js 跑起来——为此实现一个够用的最小 DOM：
 * 元素树 + innerHTML 栈式解析 + querySelector 按 class / data-* 匹配。
 *
 * 只在装载时 hook 掉与核对目标无关的渲染与浏览器服务（预览、二维码 UI、
 * 取色器、网络），被测的渲染函数与协议函数全部真实调用，不复制实现。 */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/* HTML 空元素：不进栈，否则手写 HTML 里未闭合的 <input>/<br> 之后的
 * 节点会被全吞成它的子孙。 */
const VOID_TAGS = new Set(['INPUT', 'BR', 'HR', 'IMG', 'META', 'LINK', 'SOURCE']);

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function makeDom(htmlIds) {
  const registry = new Map();
  class El {
    constructor(tag = 'div') {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.attrs = {};
      this.dataset = {};
      this.style = { setProperty(k, v) { this[k] = v; } };
      this._text = '';
      this._html = '';
      this.handlers = {};
      this.classList = {
        _s: new Set(),
        add(...c) { c.forEach(x => this._s.add(x)); },
        remove(...c) { c.forEach(x => this._s.delete(x)); },
        toggle(c, on) {
          if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
          else if (on) this._s.add(c); else this._s.delete(c);
        },
        contains(c) { return this._s.has(c); },
      };
    }
    get className() { return [...this.classList._s].join(' '); }
    set className(v) { this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get id() { return this.attrs.id || ''; }
    set id(v) { this.attrs.id = v; }
    setAttribute(k, v) { this.attrs[k] = v; if (k.startsWith('data-')) this.dataset[camel(k.slice(5))] = v; }
    getAttribute(k) { return this.attrs[k] ?? null; }
    appendChild(c) { this.children.push(c); c.parentElement = this; return c; }
    remove() { /* 核对场景不需要真实移除 */ }
    addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); }
    focus() {}
    click() { (this.handlers.click || []).forEach(f => f({ target: this })); }
    /* 派发事件:符号面板靠 details 的 toggle 维护展开态,测试要能主动触发 */
    dispatch(t, detail) { (this.handlers[t] || []).forEach(f => f({ type: t, target: this, detail })); }
    /* innerHTML：栈式解析成真正的父子树。必须保留嵌套——渲染函数会
     * row.querySelector(".theme-color-input") 这样按层级取子节点，
     * 平铺成兄弟节点会让它们取到 null。 */
    set innerHTML(html) {
      this.children = [];
      this._text = '';
      this._html = String(html);
      const stack = [this];
      const re = /<\/?([a-zA-Z][\w-]*)\b([^>]*?)(\/?)>|([^<]+)/g;
      let m;
      while ((m = re.exec(this._html))) {
        if (m[4] !== undefined) {
          const top = stack[stack.length - 1];
          if (top !== this || this.children.length === 0) top._text += m[4];
          continue;
        }
        const raw = m[0];
        const tag = m[1].toUpperCase();
        const attrs = m[2] || '';
        if (raw.startsWith('</')) {
          for (let i = stack.length - 1; i > 0; i--) {
            if (stack[i].tagName === tag) { stack.length = i; break; }
          }
          continue;
        }
        const node = new El(m[1]);
        const cls = attrs.match(/class="([^"]*)"/);
        if (cls) node.className = cls[1];
        const id = attrs.match(/\bid="([^"]*)"/);
        if (id) node.attrs.id = id[1];
        for (const d of attrs.matchAll(/data-([a-zA-Z-]+)="([^"]*)"/g)) node.dataset[camel(d[1])] = d[2];
        for (const d of attrs.matchAll(
          /\b(type|value|placeholder|title|role|tabindex|hidden|checked|readonly|disabled)="([^"]*)"/g)) {
          node.attrs[d[1]] = d[2];
          if (d[1] === 'value') node.value = d[2];
          if (d[1] === 'checked') node.checked = true;
        }
        if (/\bopen(?=[\s>])/.test(attrs)) node.open = true;
        stack[stack.length - 1].appendChild(node);
        if (m[3] !== '/' && !VOID_TAGS.has(tag)) stack.push(node);
      }
    }
    get innerHTML() { return this._html; }
    set textContent(v) { this._text = String(v); }
    get textContent() { return this._text; }
    /* 复合选择器:标签名 / .class / #id / [data-x] / [data-x="v"] 可任意组合,
     * 如 'details.sym-group-card'、'input[data-sym-name]'。以前只认单一形式,
     * 带标签前缀的选择器会退化成标签比较,导致渲染函数里的
     * querySelectorAll('details.sym-group-card') 之类静默返回空 —— 那是假阴性。 */
    matches(sel) {
      let rest = String(sel).trim();
      const tagMatch = rest.match(/^[a-zA-Z][\w-]*/);
      if (tagMatch) {
        if (this.tagName !== tagMatch[0].toUpperCase()) return false;
        rest = rest.slice(tagMatch[0].length);
      }
      let m;
      const re = /([.#][\w-]+)|\[data-([a-zA-Z-]+)(?:="([^"]*)")?\]/g;
      while ((m = re.exec(rest))) {
        if (m[1] && m[1][0] === '.') { if (!this.classList.contains(m[1].slice(1))) return false; continue; }
        if (m[1] && m[1][0] === '#') { if (this.id !== m[1].slice(1)) return false; continue; }
        if (m[2]) {
          const k = camel(m[2]);
          if (m[3] === undefined) { if (!(k in this.dataset)) return false; }
          else if (this.dataset[k] !== m[3]) return false;
        }
      }
      return true;
    }
    *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
    /* 支持后代组合选择器（如 ".tabs .tab"、"main .panel"）。
     * 只对最后一段做匹配是不够的：那样会把文档里所有 .tab 都 toggle，
     * 掩盖掉"只有当前标签页该变"的真实行为。 */
    querySelectorAll(sel) {
      const parts = sel.trim().split(/\s+/);
      const last = parts[parts.length - 1];
      let pool = [...this.walk()];
      if (parts.length > 1) {
        const ancestor = parts[0];
        pool = pool.filter(n => {
          let p = n.parentElement;
          while (p) { if (p.matches(ancestor)) return true; p = p.parentElement; }
          return false;
        });
      }
      return pool.filter(n => n.matches(last));
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    closest(sel) { let n = this; while (n) { if (n.matches(sel)) return n; n = n.parentElement; } return null; }
  }
  const doc = {
    documentElement: new El('html'),
    body: new El('body'),
    head: new El('head'),
    createElement: (t) => new El(t),
    createElementNS: (ns, t) => new El(t),
    addEventListener() {},
    querySelectorAll: (s) => doc.body.querySelectorAll(s),
    querySelector: (s) => doc.body.querySelector(s),
    getElementById: (id) => {
      if (!registry.has(id)) { const e = new El('div'); e.attrs.id = id; registry.set(id, e); doc.body.appendChild(e); }
      return registry.get(id);
    },
  };
  // 预置 index.html 中真实存在的元素，让 el(id) 拿到非 null
  // 带 class 的元素挂在 main 下，使 "main .panel" 这类后代选择器能命中
  const mainEl = new El('main');
  mainEl.className = 'app-main';
  doc.body.appendChild(mainEl);
  for (const spec of htmlIds) {
    const node = doc.getElementById(spec.id);
    if (typeof spec === 'string') continue;
    node.tagName = spec.tag;
    if (spec.className) node.className = spec.className;
    for (const [k, v] of Object.entries(spec.data || {})) {
      node.attrs['data-' + k] = v;
      node.dataset[camel(k)] = v;
    }
    if (spec.className) {
      // 重新挂到 main 下：getElementById 首次创建时挂在 body 上
      if (node.parentElement) node.parentElement.children =
        node.parentElement.children.filter(c => c !== node);
      mainEl.appendChild(node);
    }
  }
  return { doc, registry, El };
}

/* 从 index.html 解析出每个带 id 元素的 class 与 data-*" 属性。
 * 只给 id 不给 class 是不够的：setActiveTab 走
 * document.querySelectorAll(".tabs .tab") / "main .panel"，
 * 元素没有对应 class 就永远匹配不到，函数再真实也没有作用对象。 */
function htmlIdsFromIndex() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const out = [];
  const re = /<([a-zA-Z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[2];
    const cls = attrs.match(/\bclass="([^"]*)"/);
    const data = {};
    for (const d of attrs.matchAll(/\bdata-([a-zA-Z-]+)="([^"]*)"/g)) data[d[1]] = d[2];
    out.push({
      tag: m[1].toUpperCase(),
      id: m[3],
      className: cls ? cls[1] : '',
      data,
    });
  }
  return out;
}

/* 装载 js/app.js：把入口 main(); 换成 hook，其余原样执行。
 * hook 只做两件事：① 把无关渲染/浏览器服务置为空实现；② 导出 testApi。 */
function loadApp(opts = {}) {
  const { doc, registry } = makeDom(htmlIdsFromIndex());
  const storage = new Map();
  const noOp = () => {};
  const context = {
    console, URL, URLSearchParams, TextEncoder, TextDecoder,
    Uint8Array, Blob, Math, JSON, Date, btoa, atob,
    /* 符号面板用 Intl.Segmenter 数字形簇;浏览器里一定有,vm 沙箱默认没有 ——
     * 不补的话测试跑的是近似实现,和线上不是同一条路径。 */
    Intl,
    document: doc,
    window: {
      location: { protocol: 'file:', hostname: '', search: '', origin: '' },
      addEventListener: noOp,
      matchMedia: () => ({ matches: false, addEventListener: noOp }),
      getComputedStyle: () => ({ getPropertyValue: () => '' }),
      // 刻意不提供 jscolor：installThemeColorPicker 有 if (!window.jscolor) return 守卫
    },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    queueMicrotask: noOp,
    setTimeout: noOp, clearTimeout: noOp, requestAnimationFrame: noOp,
    alert: noOp, confirm: () => true,
    /* prompt 可注入:测试要覆盖保留名/重名分支时传入自己的实现 */
    prompt: opts.prompt || (() => null),
    fetch: () => Promise.reject(new Error('no network in test')),
    indexedDB: undefined,
  };
  context.window.document = doc;
  context.globalThis = context;

  const hook = `
    /* beginHistoryTracking 在 main() 里调用，而 main 已被 hook 取代——
     * 不补调它，history.started 恒为 false，commitHistorySnapshot 会
     * 直接从守卫 return，撤销栈永远为空。 */
    beginHistoryTracking();
    syncLayoutJsonFromState = syncThemeJsonFromState = syncPopupJsonFromState = syncIconThemeJsonFromState = () => {};
    syncThemeJsonHeight = syncPopupJsonHeight = syncIconThemeJsonHeight = () => {};
    renderThemeSupplementPreview = renderLayoutPreview = applyPreviewThemeSurface = () => {};
    updateQrUi = updateThemeQrUi = updatePopupQrUi = updateIconThemeQrUi = () => {};
    syncThemeAppSyncUiFromState = syncPreviewToolbarUi = () => {};
    /* syncRippleTheme 是 renderThemeEditor 内部的 const 箭头函数（app.js:2417），
     * 不是顶层 function，不能在 hook 里赋值——严格模式下给未声明变量赋值会抛
     * ReferenceError。它内部只做 rippleInput 的 readOnly/value 同步，无需 hook。 */
    window.testApi = {
      state,
      renderThemeEditor, renderThemeList, renderPopupEditor,
      renderIconThemeSlots, renderIconThemeList, renderLayoutEditor,
      serializePopupEntries, currentIconThemeEntry,
      getRows, setRows, themeColorTokens, isCurrentIconThemeEditable,
      normalizeLayoutObject, resolveThemeTokenColor, toArgbHex, deepClone,
      // 行为级功能项
      saveDraftNow, currentHistorySnapshot, crc32,
      bytesToBase64Url, base64UrlToBytes,
      parseQrChunkText, normalizeQrChunkText, chunkGroupKey, buildTransferId,
      undo, redo, commitHistorySnapshot, setSiteTheme, applySiteThemeClass,
      setActiveTab,
      generateRandomTheme, copyRandomThemeAsCustom, renderRandomTheme
    };
  `;
  const source = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const marker = '\n  main();';
  if (!source.includes(marker)) throw new Error('app.js 入口 main(); 未找到，装载器需同步更新');
  // app.js 读 globalThis.F5A_BUILTIN_PRESETS / F5A_SYMBOL_DATA(app 内置预置),
  // 生产页面靠 index.html 里的 <script> 先加载;测试里按同样顺序先执行这两份。
  for (const file of ['builtin-presets.js', 'symbol-data.js', 'symbol-panel.js', 'symbol-preview.js', 'random-theme.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', file), 'utf8'), context, { filename: file });
  }
  vm.runInNewContext(source.replace(marker, hook), context, { filename: 'app.js' });
  return { api: context.window.testApi, doc, registry, storage };
}

/* 单独装载一个 js 模块（如 js/json-lint.js、js/draft-assets.js），
 * 它自己会挂到传入的 window 上。 */
function loadScript(file, extra = {}) {
  const { doc, registry } = makeDom(htmlIdsFromIndex());
  const noOp = () => {};
  const context = {
    console, URL, URLSearchParams, TextEncoder, TextDecoder,
    Uint8Array, Blob, Math, JSON, Date, btoa, atob,
    Intl, // 同上:符号面板的字形簇计数要走真实现
    document: doc,
    window: {
      location: { protocol: 'file:' },
      addEventListener: noOp,
      matchMedia: () => ({ matches: false, addEventListener: noOp }),
      ...extra.window,
    },
    localStorage: { getItem: () => null, setItem: noOp },
    setTimeout: noOp, clearTimeout: noOp, requestAnimationFrame: noOp,
    fetch: () => Promise.reject(new Error('no network in test')),
    ...extra,
  };
  context.window.document = doc;
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', file), 'utf8'), context, { filename: file });
  return { window: context.window, doc, registry };
}

module.exports = { ROOT, makeDom, htmlIdsFromIndex, loadApp, loadScript };
