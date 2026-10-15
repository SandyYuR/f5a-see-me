#!/usr/bin/env node
/**
 * 从 fx-rime-only 的 app 内置资源生成 f5a-see-me 的预置数据。
 *
 * 产出(全部可重跑,内容确定性):
 *   data/theme-presets.json        12 个内置主题(21 色 token,十进制 int32 ARGB)
 *   data/icon-theme-presets.json   3 个内置图标主题(name/version/thumbnail_svg/icons)
 *   data/symbols.json              app 的符号目录
 *   data/emoji.json                app 的表情目录
 *   data/kaomoji.json              app 的颜文字目录
 *   js/builtin-presets.js          上述主题/图标主题的内嵌副本(供 file:// 下直接用)
 *   js/symbol-data.js              上述符号目录的内嵌副本
 *
 * 用法:
 *   node tests/gen-presets.cjs            生成
 *   node tests/gen-presets.cjs --verify   只校验现有产物与源一致,不写文件
 *
 * 源目录可用环境变量 FXR_ASSETS 覆盖;默认按工作区相对路径解析。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const HERE = __dirname;                       // f5a-see-me/tests
const REPO = path.resolve(HERE, "..");        // f5a-see-me
const DEFAULT_ASSETS = path.resolve(REPO, "..", "fx-rime-only", "app", "src", "main", "assets", "bundled");
const ASSETS = process.env.FXR_ASSETS || DEFAULT_ASSETS;

const VERIFY = process.argv.includes("--verify");

const THEME_META_KEYS = ["name", "isDark", "backgroundImage", "version"];
const SYMBOL_FILES = ["symbols", "emoji", "kaomoji"];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function listJson(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
}

/** 收集主题预置,保持 app 的文件名字典序 */
function collectThemePresets() {
  const dir = path.join(ASSETS, "themes");
  return listJson(dir).map((file) => {
    const raw = readJson(path.join(dir, file));
    const colors = {};
    Object.keys(raw)
      .filter((k) => !THEME_META_KEYS.includes(k))
      .sort()
      .forEach((k) => { colors[k] = raw[k]; });
    return {
      file,
      name: raw.name,
      isDark: !!raw.isDark,
      backgroundImage: raw.backgroundImage || "",
      version: raw.version,
      colors,
    };
  });
}

/** 收集图标主题预置 */
function collectIconThemePresets() {
  const dir = path.join(ASSETS, "icon_themes");
  return listJson(dir).map((file) => {
    const raw = readJson(path.join(dir, file));
    return {
      file,
      name: raw.name,
      version: raw.version,
      thumbnail_svg: raw.thumbnail_svg || "",
      icons: raw.icons || {},
    };
  });
}

/** 收集符号目录,转成 f5a 侧使用的小驼峰字段 */
function collectSymbolCatalog(kind) {
  const raw = readJson(path.join(ASSETS, "symbols", `${kind}.json`));
  return {
    multiLine: !!raw.multiLine,
    groups: (raw.groups || []).map((g) => ({
      names: { ...(g.names || {}) },
      symbols: [...(g.symbols || [])],
    })),
  };
}

function writeJson(rel, obj) {
  const p = path.join(REPO, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
  return p;
}

function writeText(rel, text) {
  const p = path.join(REPO, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return p;
}

function banner(src, extra) {
  return [
    "/* 由 tests/gen-presets.cjs 从输入法 app 内置资源生成,请勿手改。",
    ` * 源:${src}`,
    ` * 重新生成:node tests/gen-presets.cjs`,
    extra ? ` * ${extra}` : null,
    " */",
  ].filter(Boolean).join("\n");
}

function buildBuiltinPresetsJs(themes, iconThemes) {
  const themesJson = JSON.stringify(themes.map((t) => ({
    name: t.name, isDark: t.isDark, backgroundImage: t.backgroundImage, version: t.version, colors: t.colors,
  })), null, 2);
  const iconsJson = JSON.stringify(iconThemes.map((t) => ({
    name: t.name, version: t.version, thumbnailSvg: t.thumbnail_svg, icons: t.icons,
  })), null, 2);
  return `${banner("bundled/themes/ + bundled/icon_themes/", `${themes.length} 主题 / ${iconThemes.length} 图标主题`)}

"use strict";

(function (root) {
  var THEMES = ${themesJson};

  var ICON_THEMES = ${iconsJson};

  root.F5A_BUILTIN_PRESETS = { themes: THEMES, iconThemes: ICON_THEMES };
  // 浏览器里 window === globalThis;测试沙箱里两者是不同对象,两处都挂。
  var G = typeof globalThis !== "undefined" ? globalThis : root;
  if (G !== root) G.F5A_BUILTIN_PRESETS = root.F5A_BUILTIN_PRESETS;
})(typeof window !== "undefined" ? window : globalThis);
`;
}

function buildSymbolDataJs(catalogs) {
  return `${banner("bundled/symbols/", SYMBOL_FILES.map((k) => `${k} ${catalogs[k].groups.length} 组`).join(" / "))}

"use strict";

(function (root) {
  var DATA = ${JSON.stringify(catalogs, null, 2)};

  root.F5A_SYMBOL_DATA = DATA;
  // 浏览器里 window === globalThis;测试沙箱里两者是不同对象,两处都挂。
  var G = typeof globalThis !== "undefined" ? globalThis : root;
  if (G !== root) G.F5A_SYMBOL_DATA = root.F5A_SYMBOL_DATA;
})(typeof window !== "undefined" ? window : globalThis);
`;
}

function stableStringify(obj) {
  return JSON.stringify(obj);
}

/** 逐字段比对,返回差异描述数组(空数组 = 完全一致) */
function diffThemePresets(source, produced) {
  const diffs = [];
  if (source.length !== produced.length) diffs.push(`主题条数 源=${source.length} 产物=${produced.length}`);
  source.forEach((src, i) => {
    const got = produced[i];
    if (!got) { diffs.push(`缺少主题 ${src.name}`); return; }
    ["name", "isDark", "backgroundImage", "version"].forEach((k) => {
      if (!Object.is(src[k], got[k])) diffs.push(`主题 ${src.name}.${k} 源=${JSON.stringify(src[k])} 产物=${JSON.stringify(got[k])}`);
    });
    const srcKeys = Object.keys(src.colors).sort();
    const gotKeys = Object.keys(got.colors || {}).sort();
    if (stableStringify(srcKeys) !== stableStringify(gotKeys)) {
      diffs.push(`主题 ${src.name} token 键集不一致`);
      return;
    }
    srcKeys.forEach((k) => {
      if (!Object.is(src.colors[k], got.colors[k])) {
        diffs.push(`主题 ${src.name}.${k} 源=${src.colors[k]} 产物=${got.colors[k]}`);
      }
    });
  });
  return diffs;
}

function diffIconThemePresets(source, produced) {
  const diffs = [];
  if (source.length !== produced.length) diffs.push(`图标主题条数 源=${source.length} 产物=${produced.length}`);
  source.forEach((src, i) => {
    const got = produced[i];
    if (!got) { diffs.push(`缺少图标主题 ${src.name}`); return; }
    ["name", "version"].forEach((k) => {
      if (!Object.is(src[k], got[k])) diffs.push(`图标主题 ${src.name}.${k} 源=${JSON.stringify(src[k])} 产物=${JSON.stringify(got[k])}`);
    });
    const srcSvg = src.thumbnail_svg;
    const gotSvg = got.thumbnail_svg;
    if (srcSvg !== gotSvg) diffs.push(`图标主题 ${src.name}.thumbnail_svg 不一致(${srcSvg.length} vs ${String(gotSvg).length} 字符)`);
    const srcKeys = Object.keys(src.icons).sort();
    const gotKeys = Object.keys(got.icons || {}).sort();
    if (stableStringify(srcKeys) !== stableStringify(gotKeys)) {
      diffs.push(`图标主题 ${src.name} 图标键集不一致:源 ${srcKeys.length} 键 / 产物 ${gotKeys.length} 键`);
      return;
    }
    srcKeys.forEach((k) => {
      if (src.icons[k] !== got.icons[k]) diffs.push(`图标主题 ${src.name}.icons[${k}] SVG 内容不一致`);
    });
  });
  return diffs;
}

function diffSymbolCatalog(kind, source, produced) {
  const diffs = [];
  if (source.multiLine !== produced.multiLine) diffs.push(`${kind}.multiLine 源=${source.multiLine} 产物=${produced.multiLine}`);
  if (source.groups.length !== produced.groups.length) {
    diffs.push(`${kind} 组数 源=${source.groups.length} 产物=${produced.groups.length}`);
    return diffs;
  }
  source.groups.forEach((g, i) => {
    const got = produced.groups[i];
    if (stableStringify(g.names) !== stableStringify(got.names)) diffs.push(`${kind} 第 ${i + 1} 组 names 不一致`);
    if (stableStringify(g.symbols) !== stableStringify(got.symbols)) {
      diffs.push(`${kind} 第 ${i + 1} 组 symbols 不一致(${g.symbols.length} vs ${got.symbols.length})`);
    }
  });
  return diffs;
}

function readProducedJson(rel) {
  const p = path.join(REPO, rel);
  if (!fs.existsSync(p)) return null;
  return readJson(p);
}

/** 从生成的 JS 里取回内嵌对象,确保 JS 与 JSON 两份产物同源一致 */
function readEmbedded(rel, globalName, key) {
  const p = path.join(REPO, rel);
  if (!fs.existsSync(p)) return null;
  const sandbox = {};
  // 生成文件只是给挂点赋值,在受控沙箱里执行即可取回对象
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  new Function("window", "globalThis", fs.readFileSync(p, "utf8"))(sandbox, sandbox);
  return key ? (sandbox[globalName] || {})[key] : sandbox[globalName];
}

function main() {
  if (!fs.existsSync(ASSETS)) {
    console.error(`找不到 app 资源目录:${ASSETS}`);
    process.exit(2);
  }

  const themes = collectThemePresets();
  const iconThemes = collectIconThemePresets();
  const catalogs = {};
  SYMBOL_FILES.forEach((k) => { catalogs[k] = collectSymbolCatalog(k); });

  const themePresets = themes.map((t) => ({
    name: t.name, isDark: t.isDark, backgroundImage: t.backgroundImage, version: t.version, colors: t.colors,
  }));
  const iconThemePresets = iconThemes.map((t) => ({
    name: t.name, version: t.version, thumbnail_svg: t.thumbnail_svg, icons: t.icons,
  }));

  if (!VERIFY) {
    writeJson("data/theme-presets.json", themePresets);
    writeJson("data/icon-theme-presets.json", iconThemePresets);
    SYMBOL_FILES.forEach((k) => writeJson(`data/${k}.json`, catalogs[k]));
    writeText("js/builtin-presets.js", buildBuiltinPresetsJs(themes, iconThemes));
    writeText("js/symbol-data.js", buildSymbolDataJs(catalogs));
  }

  // 校验:JSON 产物 vs 源
  const diffs = [];
  const jt = readProducedJson("data/theme-presets.json");
  const ji = readProducedJson("data/icon-theme-presets.json");
  if (!jt) diffs.push("缺少 data/theme-presets.json");
  else diffs.push(...diffThemePresets(themes, jt));
  if (!ji) diffs.push("缺少 data/icon-theme-presets.json");
  else diffs.push(...diffIconThemePresets(iconThemes, ji.map((t) => ({ ...t, thumbnail_svg: t.thumbnail_svg }))));
  SYMBOL_FILES.forEach((k) => {
    const got = readProducedJson(`data/${k}.json`);
    if (!got) diffs.push(`缺少 data/${k}.json`);
    else diffs.push(...diffSymbolCatalog(k, catalogs[k], got));
  });

  // 校验:内嵌 JS 产物 vs 源
  const embedded = readEmbedded("js/builtin-presets.js", "F5A_BUILTIN_PRESETS");
  if (!embedded) diffs.push("缺少 js/builtin-presets.js");
  else {
    diffs.push(...diffThemePresets(themes, embedded.themes.map((t) => ({ ...t, colors: t.colors }))));
    diffs.push(...diffIconThemePresets(iconThemes, embedded.iconThemes.map((t) => ({ name: t.name, version: t.version, thumbnail_svg: t.thumbnailSvg, icons: t.icons }))));
  }

  const embeddedSymbols = readEmbedded("js/symbol-data.js", "F5A_SYMBOL_DATA");
  if (!embeddedSymbols) diffs.push("缺少 js/symbol-data.js");
  else SYMBOL_FILES.forEach((k) => diffs.push(...diffSymbolCatalog(k, catalogs[k], embeddedSymbols[k])));

  const summary = {
    assets: ASSETS,
    mode: VERIFY ? "verify" : "generate",
    themes: themes.length,
    themeTokens: themes[0] ? Object.keys(themes[0].colors).length : 0,
    iconThemes: iconThemes.length,
    iconKeys: iconThemes.map((t) => Object.keys(t.icons).length),
    symbols: SYMBOL_FILES.map((k) => ({ kind: k, groups: catalogs[k].groups.length, symbols: catalogs[k].groups.reduce((a, g) => a + g.symbols.length, 0), multiLine: catalogs[k].multiLine })),
    diffs,
    ok: diffs.length === 0,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(diffs.length === 0 ? 0 : 1);
}

main();
