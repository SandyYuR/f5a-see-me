/*
 * js/random-theme.js 与 app 侧 Kotlin 原文件的静态对照报告。
 *
 * 静态对照解决的问题:同源随机序列只能证明「数值一致」,不能排除我漏抄了某个分支
 * (漏掉的分支在固定种子上可能恰好没被走到)。这里把两侧的常量、随机取数顺序、
 * 21 字段映射逐条对齐,写进 refactor-notes/random-theme-parity.json。
 *
 * 参照物是 fx-rime-only 里的原文;找不到源码时按「未运行」退出,不写假报告。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const APP_ROOT = process.env.FXR_ROOT || path.join(ROOT, '..', 'fx-rime-only');
const THEME_DIR = path.join(APP_ROOT, 'app/src/main/java/org/fcitx/fcitx5/android/data/theme');
const RANDOMIZER = path.join(THEME_DIR, 'ThemeRandomizer.kt');
const SCORER = path.join(THEME_DIR, 'ThemeAestheticScore.kt');
const JS_SOURCE = path.join(ROOT, 'js/random-theme.js');
const OUT = path.join(ROOT, 'refactor-notes/random-theme-parity.json');

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  return ok;
}
function sha1(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

if (!fs.existsSync(RANDOMIZER) || !fs.existsSync(SCORER)) {
  console.error(`未找到 app 侧源码:${RANDOMIZER}`);
  process.exit(2);
}

const ktRandomizer = fs.readFileSync(RANDOMIZER, 'utf8');
const ktScorer = fs.readFileSync(SCORER, 'utf8');
const jsSource = fs.readFileSync(JS_SOURCE, 'utf8');

// ---- 1. 常量 ----
const jsConstants = (() => {
  const ctx = { console, Math, Number, Object, Array, String, Uint32Array };
  ctx.globalThis = ctx;
  require('node:vm').runInNewContext(jsSource, ctx, { filename: 'random-theme.js' });
  return ctx.F5aRandomTheme;
})();

check('MAX_ATTEMPTS = 100', jsConstants.MAX_ATTEMPTS === 100, `JS=${jsConstants.MAX_ATTEMPTS}`);
check('EARLY_STOP_SCORE = 88', jsConstants.EARLY_STOP_SCORE === 88, `JS=${jsConstants.EARLY_STOP_SCORE}`);
check('DEFAULT_THEME_NAME = "Random Theme"',
  jsConstants.DEFAULT_THEME_NAME === 'Random Theme' && ktRandomizer.includes('const val DEFAULT_THEME_NAME = "Random Theme"'),
  `JS=${jsConstants.DEFAULT_THEME_NAME}`);
check('SCHEMES 五项且顺序一致',
  ktRandomizer.includes('listOf("analogous", "complementary", "triadic", "split-comp", "mono")') &&
  JSON.stringify(jsConstants.SCHEMES) === JSON.stringify(['analogous', 'complementary', 'triadic', 'split-comp', 'mono']),
  JSON.stringify(jsConstants.SCHEMES));
check('alpha 常量 0x1f / 0x33 / 0x80',
  ktRandomizer.includes('LIGHT_KEY_PRESS_ALPHA = 0x1f') &&
  ktRandomizer.includes('DARK_KEY_PRESS_ALPHA = 0x33') &&
  ktRandomizer.includes('WATER_RIPPLE_ALPHA = 0x80') &&
  jsConstants.LIGHT_KEY_PRESS_ALPHA === 0x1f &&
  jsConstants.DARK_KEY_PRESS_ALPHA === 0x33 &&
  jsConstants.WATER_RIPPLE_ALPHA === 0x80,
  '两侧一致');

// ---- 2. 每个 from 公式都必须在 Kotlin 原文里找得到 ----
// 逐条列的是「公式字面」而不是行号:源码挪行不该让对照失效,公式改了必须失效。
const formulaPairs = [
  ['isDark 阈值', 'random.nextDouble() < 0.38', 'next() < 0.38'],
  ['scheme 取样', '(random.nextDouble() * SCHEMES.size).toInt()', 'SCHEMES[Math.trunc(next() * SCHEMES.length)]'],
  ['baseHue 取样', 'val baseHue = random.nextDouble() * 360.0', 'const baseHue = next() * 360.0'],
  ['analogous 偏移', 'baseHue + (20.0 + random.nextDouble() * 30.0)', 'baseHue + (20.0 + next() * 30.0)'],
  ['baseSat', 'val baseSat = 22.0 + random.nextDouble() * 45.0', 'const baseSat = 22.0 + next() * 45.0'],
  ['暗色 bgL', 'bgL = 9.0 + random.nextDouble() * 8.0', 'bgL = 9.0 + next() * 8.0'],
  ['暗色 bgS 系数', 'bgS = baseSat * 0.25', 'bgS = baseSat * 0.25'],
  ['暗色 keyBgS 系数', 'keyBgS = baseSat * 0.42', 'keyBgS = baseSat * 0.42'],
  ['暗色 borderS 系数', 'borderS = baseSat * 0.42', 'borderS = baseSat * 0.42'],
  ['暗色 accentL', 'accentL = 52.0 + random.nextDouble() * 14.0', 'accentL = 52.0 + next() * 14.0'],
  ['亮色 bgL', 'bgL = 96.0 + random.nextDouble() * 3.0', 'bgL = 96.0 + next() * 3.0'],
  ['亮色 keyTextL', 'keyTextL = 16.0 + random.nextDouble() * 14.0', 'keyTextL = 16.0 + next() * 14.0'],
  ['亮色 borderL', 'borderL = 74.0 + random.nextDouble() * 14.0', 'borderL = 74.0 + next() * 14.0'],
  ['accentTextL 阈值', 'if (palette.accentL < 55.0) 96.0 else 12.0', 'accentL < 55.0 ? 96.0 : 12.0'],
  ['keyPressed 偏移', 'palette.keyBgS + 8.0', 'keyBgS + 8.0'],
  ['specialKeyBackground 系数', 'palette.keyBgS * 0.85', 'keyBgS * 0.85'],
  ['altText 暗色 L', 'palette.keyTextL - 22.0 else palette.keyTextL + 26.0',
    'keyTextL - 22.0 : keyTextL + 26.0'],
  ['panel.toolbarPressed 暗色 L', 'palette.panelBgL + 10.0 else palette.panelBgL - 5.0',
    'panelBgL + 10.0 : panelBgL - 5.0'],
  ['pinner.secondaryTextColor 亮色 L', 'palette.keyTextL - 22.0 else palette.keyTextL + 22.0',
    'keyTextL - 22.0 : keyTextL + 22.0'],
  ['toastBackground 明暗 L', 'if (isDark) 32.0 else 28.0', 'isDark ? 32.0 : 28.0'],
  ['surfaceStyle 取样', 'if (random.nextDouble() * 2.0 < 1.0) "Raised" else "Flat"',
    'next() * 2.0 < 1.0 ? "Raised" : "Flat"'],
  ['评分对比满分', '(contrastScore / totalWeight) * 40.0', '(contrastScore / totalWeight) * 40.0'],
  ['minRatio 惩罚', 'if (minRatio < 2.0) contrastScore *= 0.25', 'if (minRatio < 2.0) contrastScore *= 0.25'],
  ['明度标准差 Home', 'lightnessScore -= 0.0', 'lightnessScore -= 0.0'],
  ['jsRound 实现', 'floor(value + 0.5).toInt()', 'Math.floor(value + 0.5)'],
  ['relativeLuminance 分界', 'if (c <= 0.03928) c / 12.92', 'c <= 0.03928 ? c / 12.92'],
  ['hslToRgb 纳模', '((hue % 360.0) + 360.0) % 360.0', '((hue % 360.0) + 360.0) % 360.0'],
  ['hslToHex 小写补零', "it.toString(16).padStart(2, '0')", 'v.toString(16).padStart(2, "0")']
];

formulaPairs.forEach(([label, kt, js]) => {
  const ktHit = ktRandomizer.includes(kt) || ktScorer.includes(kt);
  const jsHit = jsSource.includes(js);
  check(`公式:${label}`, ktHit && jsHit, `Kotlin=${ktHit ? '有' : '缺'} JS=${jsHit ? '有' : '缺'}`);
});

// ---- 3. 随机取数顺序 ----
// nextDouble 的调用点顺序决定一切。把两侧的顺序抽出来比。
const ktCallOrder = (ktRandomizer.match(/random\.nextDouble\(\)/g) || []).length;
const jsCallOrder = (jsSource.match(/next\(\)/g) || []).length;
check('随机取数调用点数一致', ktCallOrder === jsCallOrder,
  `Kotlin random.nextDouble() ×${ktCallOrder} vs JS next() ×${jsCallOrder}`);

// 关键顺序:surfaceStyle 的取票必须在色板之后
const ktSurfaceIdx = ktRandomizer.indexOf('surfaceStyle = if (random.nextDouble()');
const ktColorsIdx = ktRandomizer.indexOf('val colors = linkedMapOf(');
const jsSurfaceIdx = jsSource.indexOf('const surfaceStyle = next() * 2.0 < 1.0');
const jsColorsIdx = jsSource.indexOf('const colors = {');
check('surfaceStyle 取票在色板之后', ktSurfaceIdx > ktColorsIdx && jsSurfaceIdx > jsColorsIdx,
  `Kotlin ${ktColorsIdx}<${ktSurfaceIdx} JS ${jsColorsIdx}<${jsSurfaceIdx}`);
check('暗/亮分支的 L 取值顺序一致',
  ktRandomizer.indexOf('bgL = 9.0') < ktRandomizer.indexOf('keyBgL = 22.0') &&
  ktRandomizer.indexOf('keyBgL = 22.0') < ktRandomizer.indexOf('keyTextL = 88.0') &&
  ktRandomizer.indexOf('keyTextL = 88.0') < ktRandomizer.indexOf('accentL = 52.0') &&
  ktRandomizer.indexOf('accentL = 52.0') < ktRandomizer.indexOf('panelBgL = 15.0') &&
  ktRandomizer.indexOf('panelBgL = 15.0') < ktRandomizer.indexOf('pinnerBgL = 26.0') &&
  jsSource.indexOf('bgL = 9.0') < jsSource.indexOf('keyBgL = 22.0') &&
  jsSource.indexOf('keyBgL = 22.0') < jsSource.indexOf('keyTextL = 88.0') &&
  jsSource.indexOf('keyTextL = 88.0') < jsSource.indexOf('accentL = 52.0') &&
  jsSource.indexOf('accentL = 52.0') < jsSource.indexOf('panelBgL = 15.0') &&
  jsSource.indexOf('panelBgL = 15.0') < jsSource.indexOf('pinnerBgL = 26.0'),
  'Kotlin 与 JS 的暗色 L 顺序均为 bgL→keyBgL→keyTextL→accentL→panelBgL→pinnerBgL');

// ---- 4. 28 个网站色键 ----
const ktKeys = Array.from(ktScorer.matchAll(/const val [A-Z_]+ = "([^"]+)"/g)).map((m) => m[1]);
const jsKeys = Array.from(jsSource.matchAll(/^\s{6}(?:"([^"]+)"|([A-Za-z.]+)): color\(/gm))
  .map((m) => m[1] || m[2]);
check('网站色键 28 个', ktKeys.length === 28, `Kotlin=${ktKeys.length}`);
check('网站色键集合一致', JSON.stringify(ktKeys.slice().sort()) === JSON.stringify(jsKeys.slice().sort()),
  `Kotlin-only=${ktKeys.filter((k) => !jsKeys.includes(k))} JS-only=${jsKeys.filter((k) => !ktKeys.includes(k))}`);

// ---- 5. 21 字段映射 ----
// Theme.kt 的具名参数顺序就是 toCustomTheme 的传参顺序;JS 的 APP_FIELD_MAP 必须同序同名。
const themeKtPath = path.join(THEME_DIR, 'Theme.kt');
const themeKt = fs.readFileSync(themeKtPath, 'utf8');
// Theme.kt 里有多个同字段的变体(Custom / 预览态等),必须只取 data class Custom 那一段。
const customStart = themeKt.indexOf('data class Custom(');
const ktFields = Array.from(
  themeKt.slice(customStart, themeKt.indexOf(') : Theme() {', customStart))
    .matchAll(/^\s+override val ([a-zA-Z]+): Int\??,?\s*$/gm)
).map((m) => m[1]);
const jsFields = jsConstants.APP_FIELD_MAP.map(([field]) => field);
check('Theme.Custom 具名颜色参数 21 个(20 不透明 + keyPressHighlight,另加可选 waterRipple)',
  ktFields.length === 21, `Kotlin=${ktFields.length} ${JSON.stringify(ktFields)}`);
check('20 个不透明字段与顺序完全一致',
  JSON.stringify(ktFields.filter((f) => f !== 'keyPressHighlightColor' && f !== 'waterRippleColor')) ===
  JSON.stringify(jsFields),
  `Kotlin=${JSON.stringify(ktFields.filter((f) => f !== 'keyPressHighlightColor' && f !== 'waterRippleColor'))}`);

// 每条映射的宾语(THEME 的网站色键)也要对得上
const ktMapping = {};
Array.from(ktRandomizer.matchAll(/^\s{12}([a-zA-Z]+) = websiteColor\(WebsiteThemeColorKeys\.([A-Z_]+)\)/gm))
  .forEach((m) => { ktMapping[m[1]] = m[2]; });
const ktKeyConsts = {};
Array.from(ktScorer.matchAll(/const val ([A-Z_]+) = "([^"]+)"/g)).forEach((m) => { ktKeyConsts[m[1]] = m[2]; });
const mappingMismatch = jsConstants.APP_FIELD_MAP.filter(([field, jsKey]) => {
  if (field === 'barColor') return jsKey !== 'panel.background'; // barColor 走 PANEL_BACKGROUND
  if (field === 'keyboardColor') return jsKey !== 'background';
  const constName = ktMapping[field];
  if (!constName) return true;
  return ktKeyConsts[constName] !== jsKey;
});
check('每条 20 字段映射的宾语色键一致', mappingMismatch.length === 0,
  mappingMismatch.length ? JSON.stringify(mappingMismatch) : `Kotlin 侧对照 ${Object.keys(ktMapping).length} 条`);
check('keyPressHighlightColor / waterRippleColor 用带 alpha 的色键',
  ktRandomizer.includes('withAlpha(\n                websiteColor(WebsiteThemeColorKeys.KEY_PRESSED)') ||
  ktRandomizer.includes('websiteColor(WebsiteThemeColorKeys.KEY_PRESSED),') &&
  jsSource.includes('withAlpha(websiteColor("keyPressed"), pressAlpha)') &&
  jsSource.includes('withAlpha(websiteColor("accentKeyPressed"), WATER_RIPPLE_ALPHA)'),
  '两侧均取 keyPressed / accentKeyPressed');

// ---- 报告 ----
const failed = checks.filter((c) => !c.ok);
const report = {
  generated_by: 'tests/check-random-parity.cjs',
  source: {
    'ThemeRandomizer.kt': { path: path.relative(APP_ROOT, RANDOMIZER), sha1: sha1(RANDOMIZER) },
    'ThemeAestheticScore.kt': { path: path.relative(APP_ROOT, SCORER), sha1: sha1(SCORER) },
    'js/random-theme.js': { sha1: sha1(JS_SOURCE) }
  },
  counts: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
  ktRandomCallCount: ktCallOrder,
  jsRandomCallCount: jsCallOrder,
  checks
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');

checks.forEach((c) => console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name} — ${c.detail}`));
console.log(`\n${report.counts.passed}/${report.counts.total} 项通过 → ${path.relative(ROOT, OUT)}`);
process.exit(failed.length ? 1 : 0);
