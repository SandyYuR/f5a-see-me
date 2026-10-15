/*
 * 随机主题移植的等价性对照。
 *
 * 参照物不是手抄的参数表,而是被编起来跑过的 app 原文件:
 *   bash tests/oracle/run-oracle.sh  →  refactor-notes/random-theme-oracle.json
 * oracle 里既有「同一随机源下 Kotlin 的实际输出」,也有「Kotlin 原样吐出的 nextDouble 序列」。
 * 本测试把那段序列喂给 js/random-theme.js,逐字段比 —— 任何不一致都只能来自算法本身,
 * PRNG 的实现差异被排除在外。
 *
 * oracle 需要本机 Kotlin 编译链,不保证随时可跑;因此:
 *   - 快照存在 → 全量对照;
 *   - 快照缺失 → 该文件里所有用例 skip,不伪装通过(靠 test 名上的 [oracle] 前缀可辨)。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ORACLE_PATH = path.join(ROOT, 'refactor-notes', 'random-theme-oracle.json');
const SOURCE_PATH = path.join(ROOT, 'js', 'random-theme.js');

// oracle 里记录的「参照物身份」:对不上就说明 app 侧算法改过了,对照失效。
const EXPECTED_SHA1 = {
  'ThemeRandomizer.kt': '863015625b7207f523a448047b4a0aee849f10d0',
  'ThemeAestheticScore.kt': '4b099b2a44d69e46eaa3845af32a0a0049107986'
};

const hasOracle = fs.existsSync(ORACLE_PATH);
const oracle = hasOracle ? JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8')) : null;

/** 在干净上下文里装载模块,拿到它挂出来的 API。 */
function loadModule() {
  const context = {
    console, Math, JSON, Number, Object, Array, String,
    Uint32Array,
    window: undefined,
    globalThis: undefined
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(SOURCE_PATH, 'utf8'), context, { filename: 'random-theme.js' });
  return context.F5aRandomTheme;
}

const api = loadModule();

/** 浮点比较:Kotlin 与 JS 都是 IEEE754 double,按位相同才接受;只给极小容差防跨引擎微差。 */
function closeEnough(actual, expected, label) {
  if (expected === 0) {
    assert.ok(Math.abs(actual) < 1e-4, `${label}: 期望 ~0,实得 ${actual}`);
    return;
  }
  const rel = Math.abs(actual - expected) / Math.abs(expected);
  assert.ok(rel < 1e-9, `${label}: 期望 ${expected},实得 ${actual}(相对差 ${rel})`);
}

function pickSequence(label) {
  const entry = oracle.sequences.find((s) => s.label === label);
  assert.ok(entry, `oracle 缺少随机序列 ${label}`);
  return entry.values;
}

// ---------------------------------------------------------------- 参照物身份

test('[oracle] 快照记录的 app 源码 SHA-1 与本测试声明的一致', { skip: !hasOracle && 'oracle 快照缺失' }, () => {
  assert.strictEqual(JSON.stringify(oracle.source.sha1), JSON.stringify(EXPECTED_SHA1));
});

// ---------------------------------------------------------------- 基础换算

test('[oracle] hslToHex 边界值逐个一致', { skip: !hasOracle && 'oracle 快照缺失' }, () => {
  const cases = [
    [0.0, 100.0, 50.0], [120.0, 100.0, 50.0], [240.0, 100.0, 50.0],
    [360.0, 100.0, 50.0], [-720.0, 0.0, 50.0], [31.0, 150.0, -1.0],
    [31.0, -1.0, 101.0]
  ];
  cases.forEach(([h, s, l], i) => {
    assert.strictEqual(api.hslToHex(h, s, l), oracle.boundaries.hslToHex[i],
      `hslToHex(${h},${s},${l})`);
  });
});

test('[oracle] hslToRgb 边界值逐个一致', { skip: !hasOracle && 'oracle 快照缺失' }, () => {
  const cases = [[0.0, 100.0, 50.0], [120.0, 100.0, 50.0], [240.0, 100.0, 50.0]];
  cases.forEach(([h, s, l], i) => {
    const rgb = api.hslToRgb(h, s, l);
    assert.strictEqual(JSON.stringify([rgb.red, rgb.green, rgb.blue]), JSON.stringify(oracle.boundaries.hslToRgb[i]),
      `hslToRgb(${h},${s},${l})`);
  });
  // 顺带钉住钳制与纳模的语义(Kotlin 单测同款断言)
  assert.strictEqual(JSON.stringify(api.hslToRgb(360, 100, 50)), JSON.stringify({ red: 255, green: 0, blue: 0 }));
  assert.strictEqual(JSON.stringify(api.hslToRgb(-720, 0, 50)), JSON.stringify({ red: 128, green: 128, blue: 128 }));
  assert.strictEqual(JSON.stringify(api.hslToRgb(31, 150, -1)), JSON.stringify({ red: 0, green: 0, blue: 0 }));
  assert.strictEqual(JSON.stringify(api.hslToRgb(31, -1, 101)), JSON.stringify({ red: 255, green: 255, blue: 255 }));
});

test('[oracle] hexToRgb 含 #AARRGGBB 与三位缩写', { skip: !hasOracle && 'oracle 快照缺失' }, () => {
  ['#abc', '#80112233', '#ffffff'].forEach((hex, i) => {
    const rgb = api.hexToRgb(hex);
    assert.strictEqual(JSON.stringify([rgb.red, rgb.green, rgb.blue]), JSON.stringify(oracle.boundaries.hexToRgb[i]), hex);
  });
});

test('[oracle] hueDist / rgbToHsl / contrastRatio 一致', { skip: !hasOracle && 'oracle 快照缺失' }, () => {
  assert.strictEqual(api.hueDist(350, 170), oracle.boundaries.hueDist[0]);
  assert.strictEqual(api.hueDist(350, 10), oracle.boundaries.hueDist[1]);

  const hslCases = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0]];
  hslCases.forEach(([r, g, b], i) => {
    const hsl = api.rgbToHsl({ red: r, green: g, blue: b });
    const expected = oracle.boundaries.rgbToHsl[i];
    closeEnough(hsl.hue, expected[0], `rgbToHsl(${r},${g},${b}).hue`);
    closeEnough(hsl.saturation, expected[1], `rgbToHsl(${r},${g},${b}).saturation`);
    closeEnough(hsl.lightness, expected[2], `rgbToHsl(${r},${g},${b}).lightness`);
  });

  const ratioCases = [['#ffffff', '#000000'], ['#737373', '#000000']];
  ratioCases.forEach(([a, b], i) => {
    closeEnough(api.contrastRatio(a, b), oracle.boundaries.contrastRatio[i], `contrastRatio(${a},${b})`);
  });
});

// ---------------------------------------------------------------- 候选生成

test('[oracle] 同源序列下 3 个单候选逐字段一致(色板 + 元数据 + 评分)', { skip: !hasOracle && 'oracle 快照缺失' }, () => {
  oracle.candidates.forEach((entry) => {
    const random = api.createSequenceRandom(pickSequence(entry.label));
    const candidate = api.generateCandidate(random);
    const expected = entry.candidate;

    assert.strictEqual(candidate.isDark, expected.isDark, `${entry.label}: isDark`);
    assert.strictEqual(candidate.scheme, expected.scheme, `${entry.label}: scheme`);
    assert.strictEqual(candidate.surfaceStyle, expected.surfaceStyle, `${entry.label}: surfaceStyle`);
    closeEnough(candidate.baseHue, expected.baseHue, `${entry.label}: baseHue`);
    closeEnough(candidate.accentHue, expected.accentHue, `${entry.label}: accentHue`);
    closeEnough(candidate.baseSat, expected.baseSat, `${entry.label}: baseSat`);

    const keys = Object.keys(expected.colors);
    assert.strictEqual(Object.keys(candidate.colors).length, keys.length, `${entry.label}: 色键个数`);
    keys.forEach((key, i) => {
      assert.strictEqual(candidate.colors[key], expected.colors[key], `${entry.label}: colors.${key}`);
      // 顺序也要对:评分的遍历顺序影响平均饱和度/明度的浮点求和结果。
      assert.strictEqual(Object.keys(candidate.colors)[i], key, `${entry.label}: 色键顺序第 ${i} 位`);
    });

    const score = api.scoreTheme(candidate);
    assert.strictEqual(score.total, entry.score.total, `${entry.label}: score.total`);
    assert.strictEqual(score.contrast, entry.score.contrast, `${entry.label}: score.contrast`);
    assert.strictEqual(score.hue, entry.score.hue, `${entry.label}: score.hue`);
    assert.strictEqual(score.sat, entry.score.sat, `${entry.label}: score.sat`);
    assert.strictEqual(score.light, entry.score.light, `${entry.label}: score.light`);
    closeEnough(score.minRatio, entry.score.minRatio, `${entry.label}: score.minRatio`);
  });
});

// ---------------------------------------------------------------- best-of-N 与 21 token 映射

test('[oracle] best-of-N 的 attempts / 评分 / 21 token 色值与 Kotlin 逐字段一致', { skip: !hasOracle && 'oracle 快照缺失' }, () => {
  oracle.bestOf.forEach((entry) => {
    const label = entry.label;
    const result = entry.result;
    const random = api.createSequenceRandom(pickSequence(label === 'zero' ? 'zero' : label));
    const mine = api.generateBestRandomTheme(random, result.app.name);

    assert.strictEqual(mine.attempts, result.attempts, `${label}: attempts`);
    assert.strictEqual(mine.score.total, result.score.total, `${label}: score.total`);
    closeEnough(mine.score.minRatio, result.score.minRatio, `${label}: score.minRatio`);
    assert.strictEqual(mine.candidate.scheme, result.candidate.scheme, `${label}: scheme`);
    assert.strictEqual(mine.candidate.surfaceStyle, result.candidate.surfaceStyle, `${label}: surfaceStyle`);
    assert.strictEqual(mine.theme.isDark, result.app.isDark, `${label}: isDark`);

    // app 侧字段名 → oracle 的 colors 键(oracle 用 21 个字段名 + 2 个带 alpha 的)
    const expectedColors = result.app.colors;
    Object.keys(expectedColors).forEach((field) => {
      assert.ok(field in mine.theme.colors, `${label}: 少了字段 ${field}`);
      const expectedInt = parseInt(expectedColors[field].slice(1), 16) | 0;
      assert.strictEqual(mine.theme.colors[field], expectedInt,
        `${label}: ${field} 期望 ${expectedColors[field]} (${expectedInt}) 实得 ${mine.theme.colors[field]}`);
    });
    assert.strictEqual(Object.keys(mine.theme.colors).length, Object.keys(expectedColors).length,
      `${label}: token 个数`);
  });
});

test('[oracle] ZeroRandom 分支的常数与 Kotlin 单测期望值一致', { skip: !hasOracle && 'oracle 快照缺失' }, () => {
  const random = api.createSequenceRandom(pickSequence('zero'));
  const candidate = api.generateCandidate(random);
  assert.strictEqual(candidate.isDark, true);
  assert.strictEqual(candidate.scheme, 'analogous');
  assert.strictEqual(candidate.baseHue, 0);
  assert.strictEqual(candidate.accentHue, 20);
  assert.strictEqual(candidate.baseSat, 22);
  assert.strictEqual(candidate.colors.keyBackground, '#3d3333');
  assert.strictEqual(candidate.colors.background, '#181616');
  assert.strictEqual(candidate.surfaceStyle, 'Raised');
  assert.strictEqual(Object.keys(candidate.colors).length, 28);

  // 全零随机源下拿不到 88 分,必须跑满 100 次(THEME 单测同款断言)
  const zeroBest = api.generateBestRandomTheme(api.createSequenceRandom(pickSequence('zero')), 'zero');
  assert.strictEqual(zeroBest.attempts, api.MAX_ATTEMPTS);
  assert.ok(zeroBest.score.total < api.EARLY_STOP_SCORE, `total=${zeroBest.score.total}`);
});

// ---------------------------------------------------------------- 常量与随机源契约

test('常量与 app 端 ThemeRandomizer 完全一致', () => {
  assert.strictEqual(api.DEFAULT_THEME_NAME, 'Random Theme');
  assert.strictEqual(api.MAX_ATTEMPTS, 100);
  assert.strictEqual(api.EARLY_STOP_SCORE, 88);
  assert.strictEqual(JSON.stringify(api.SCHEMES), JSON.stringify(["analogous", "complementary", "triadic", "split-comp", "mono"]));
  assert.strictEqual(api.LIGHT_KEY_PRESS_ALPHA, 0x1f);
  assert.strictEqual(api.DARK_KEY_PRESS_ALPHA, 0x33);
  assert.strictEqual(api.WATER_RIPPLE_ALPHA, 0x80);
});

test('21 个 token 的映射面与 f5a 主题模型对齐', () => {
  const fields = api.APP_FIELD_MAP.map(([field]) => field);
  const expected = [
    'backgroundColor', 'barColor', 'keyboardColor', 'keyBackgroundColor', 'keyTextColor',
    'candidateTextColor', 'candidateLabelColor', 'candidateCommentColor', 'altKeyBackgroundColor',
    'altKeyTextColor', 'accentKeyBackgroundColor', 'accentKeyTextColor', 'keyShadowColor',
    'popupBackgroundColor', 'popupTextColor', 'spaceBarColor', 'dividerColor',
    'clipboardEntryColor', 'genericActiveBackgroundColor', 'genericActiveForegroundColor'
  ];
  // vm 沙箱里造出的数组与本地数组属不同 realm,deepStrictEqual 会假失败,比 JSON 串。
  assert.strictEqual(JSON.stringify(fields), JSON.stringify(expected), '映射表字段名与顺序');
  // 加上带 alpha 的两个,合计正是 f5a 的 21 个 token + waterRippleColor 可选 token
  const theme = api.toTheme(api.generateCandidate(api.createSequenceRandom(pickSequenceOrNull('seed1'))), 'n');
  const tokenCount = Object.keys(theme.colors).length;
  assert.strictEqual(tokenCount, 22, `应有 20 个不透明 + 2 个带 alpha = 22 个键,实得 ${tokenCount}`);
  assert.ok('keyPressHighlightColor' in theme.colors);
  assert.ok('waterRippleColor' in theme.colors);
});

function pickSequenceOrNull(label) {
  if (hasOracle) return pickSequence(label);
  // oracle 不在时用浏览器源造一个占位,只为让这条「结构」用例仍能跑。
  return api.createBrowserRandom();
}

test('序列随机源按顺序消费,耗尽即报错', () => {
  const random = api.createSequenceRandom([0.1, 0.2]);
  assert.strictEqual(random.nextDouble(), 0.1);
  assert.strictEqual(random.nextDouble(), 0.2);
  assert.throws(() => random.nextDouble(), /随机序列已耗尽/);
});
