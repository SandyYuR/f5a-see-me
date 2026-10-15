#!/usr/bin/env node
/* 静态完整性审计：把验证报告里的所有计数口径落到一个可重跑脚本里。
 * 用法（不 fork 子进程）：node tests/static-audit.cjs
 * 产物：tests/static-audit.json
 * 口径全部在此登记，不在报告里另立。 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const R = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(R, p), 'utf8');
const html = read('index.html');
const css = read('style.css');
const jsFiles = fs.readdirSync(path.join(R, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);
const jsAll = jsFiles.map((f) => read(f));
const jsByName = Object.fromEntries(jsFiles.map((f, i) => [f, jsAll[i]]));
const app = jsByName['js/app.js'] || '';
const out = {};

/* 1. HTML 标签配对 */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const stack = [];
let mismatch = 0;
for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
  const close = m[1];
  const tag = m[2];
  const attrs = m[3];
  const t = tag.toLowerCase();
  if (VOID.has(t) || /\/\s*$/.test(attrs)) continue;
  if (!close) stack.push(t);
  else {
    const top = stack.pop();
    if (top !== t) mismatch++;
  }
}
out.html = { unclosedDepth: stack.length, mismatch, note: 'VOID 标签与自闭合不进栈' };

/* 2. CSS 括号平衡 */
let depth = 0;
let extra = 0;
for (const ch of css) {
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth < 0) {
      extra++;
      depth = 0;
    }
  }
}
out.css = { finalDepth: depth, extraClose: extra };

/* 3. id 唯一性 */
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
out.ids = { total: ids.length, duplicates: [...new Set(dup)] };

/* 4. JS 引用 id 口径：标准字面量 el("x") / getElementById("x") / querySelector("#x")
 *    不含模板字面量拼接（那些无法静态解析，单独登记） */
const literal = new Set();
const byKind = { el: new Set(), getElementById: new Set(), querySelectorHash: new Set() };
const tmpl = new Set();
for (const src of jsAll) {
  for (const m of src.matchAll(/\bel\(\s*"([^"]+)"\s*\)/g)) { literal.add(m[1]); byKind.el.add(m[1]); }
  for (const m of src.matchAll(/getElementById\(\s*"([^"]+)"\s*\)/g)) { literal.add(m[1]); byKind.getElementById.add(m[1]); }
  for (const m of src.matchAll(/querySelector(?:All)?\(\s*"#([A-Za-z][\w-]*)"/g)) { literal.add(m[1]); byKind.querySelectorHash.add(m[1]); }
  for (const m of src.matchAll(/(?:el|getElementById|querySelector(?:All)?)\(\s*[`'"][^`'"]*\$\{/g)) tmpl.add(m[0]);
}
const htmlIdSet = new Set(ids);
/* 运行时动态生成的 id：js 与 html 里出现的 id="..." 字面（不含 ${}） */
const dynIds = new Set();
for (const src of [...jsAll, html]) {
  for (const m of src.matchAll(/\bid="([^"$]+)"/g)) dynIds.add(m[1]);
}
const missing = [...literal].filter((x) => !htmlIdSet.has(x) && !dynIds.has(x));
out.jsIdRefs = {
  literalCount: literal.size,
  byKind: { el: byKind.el.size, getElementById: byKind.getElementById.size, querySelectorHash: byKind.querySelectorHash.size },
  kindNote: '三种写法分别计数；合集的并集 literalCount 小于三者之和（同一 id 被多种写法引用只算一次）',
  templateExprCount: tmpl.size,
  templateNote: '模板字面量拼接的 id 无法静态解析，不计入 literalCount',
  dynamicIdLiterals: dynIds.size,
  missingAfterDynamicDeduct: missing
};

/* 5. CSS 令牌：静态定义 vs 注入 vs 引用 */
const staticDef = new Set();
for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) staticDef.add(m[1]);
const injected = new Set();
const injectedBy = { setPropertyLiteral: new Set(), styleAttrLiteral: new Set(), varTable: new Set() };
for (const src of [...jsAll, html]) {
  /* ① setProperty 直接传字面量：root.style.setProperty("--x", v) */
  for (const m of src.matchAll(/setProperty\(\s*["'`](--[\w-]+)["'`]/g)) { injected.add(m[1]); injectedBy.setPropertyLiteral.add(m[1]); }
  /* ② 内联 style 属性里的字面量：style="--key-width:40%" 或模板里 style="--x:${...}" */
  for (const m of src.matchAll(/(?:--[\w-]+\s*:\s*[^;"'`]*(?:;|")[\s\S]{0,200})?/g)) { /* noop：见下条更精确的扫描 */ break; }
  for (const m of src.matchAll(/(?:^|[\s"'`;])(--[\w-]+)\s*:\s*(?:"|'|`|\$\{|[^;"'>`]*)/g)) {
    if (src.slice(Math.max(0, m.index - 40), m.index).indexOf('style') >= 0 || /style\s*=\s*["'`][^"'`]*$/.test(src.slice(0, m.index))) {
      injected.add(m[1]); injectedBy.styleAttrLiteral.add(m[1]);
    }
  }
}
/* ③ 变量表对象注入：Object.entries(X).forEach(([cssVar, token]) => ...) 里 X 声明的键 */
const OBJECT_ENTRIES_RE = /Object\.entries\(([\w.]+)\)\.forEach/g;
for (const m of app.matchAll(OBJECT_ENTRIES_RE)) {
  const raw = m[1];
  const name = raw.split('.').join('\\.');
  const declRe = new RegExp(name + '\\s*=\\s*\\{([\\s\\S]{0,4000}?)\\n\\s*\\}');
  const decl = declRe.exec(app);
  if (!decl) continue;
  for (const k of decl[1].matchAll(/["'`]?(--[\w-]+)["'`]?\s*:/g)) { injected.add(k[1]); injectedBy.varTable.add(k[1]); }
}
const referenced = new Set();
for (const src of [...jsAll, html, css]) {
  for (const m of src.matchAll(/var\(\s*(--[\w-]+)/g)) referenced.add(m[1]);
}
const known = new Set([...staticDef, ...injected]);
/* 带 fallback 的引用：var(--x, <默认值>)。这些在变量未注入时由 fallback 兜底，
 * 属于"设计上的可选注入"，与真正会解析成无效值的悬空引用分列登记。 */
const withFallback = new Set();
for (const src of [...jsAll, html, css]) {
  for (const m of src.matchAll(/var\(\s*(--[\w-]+)\s*,/g)) withFallback.add(m[1]);
}
const danglingRaw = [...referenced].filter((x) => !known.has(x));
out.tokens = {
  staticDefined: staticDef.size,
  injected: injected.size,
  injectedByKind: {
    setPropertyLiteral: injectedBy.setPropertyLiteral.size,
    styleAttrLiteral: injectedBy.styleAttrLiteral.size,
    varTable: injectedBy.varTable.size,
    note: '三者并集为 injected；分项之和可能大于并集（同一变量多种注入方式）'
  },
  referenced: referenced.size,
  dangling: danglingRaw.filter((x) => !withFallback.has(x)),
  danglingWithFallback: danglingRaw.filter((x) => withFallback.has(x)),
  fallbackNote: '带 fallback 的 var() 在变量缺失时使用默认值，不构成无效样式；此处单独列出以免与真悬空混淆',
  injectedChipSample: [...injected].filter((x) => x.indexOf('chip') === 0).slice(0, 12)
};

fs.writeFileSync(path.join(R, 'tests/static-audit.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
