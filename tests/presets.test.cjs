/* 输入法 app 内置资源的落地核对:预置数据与目录构成。
 *
 * 三层证据:
 *  1 生成物与源逐字段一致(调 gen-presets.cjs --verify,退出码即结论);
 *  2 运行时目录构成(装载真实 app.js,数主题/图标主题/符号目录);
 *  3 逐字段抽查(把运行时目录里的颜色与源 JSON 对照,不是只看条数)。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadApp } = require('./dom-app-harness.cjs');

const ROOT = path.join(__dirname, '..');
const ASSETS = process.env.FXR_ASSETS || path.join(ROOT, '..', 'fx-rime-only', 'app', 'src', 'main', 'assets', 'bundled');

const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

test('预置生成物与 app 内置资源逐字段一致(gen-presets --verify)', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'gen-presets.cjs'), '--verify'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const summary = JSON.parse(out);
  assert.deepEqual(summary.diffs, [], '生成物与源存在差异');
  assert.equal(summary.themes, 12);
  assert.equal(summary.iconThemes, 3);
  assert.equal(summary.themeTokens, 21);
});

test('运行时主题目录 = 9 个本地预设 + 12 个 app 内置', () => {
  const { api } = loadApp();
  const catalog = api.state.themeCatalog;
  assert.equal(catalog.length, 21, `主题目录应为 21 项,实际 ${catalog.length}`);
  const appItems = catalog.filter((t) => t.id.startsWith('app-'));
  assert.equal(appItems.length, 12, 'app 内置主题应为 12 项');
  appItems.forEach((t) => assert.equal(t.builtin, true, `${t.name} 应为内置(不可编辑)`));
  // 本地预设未被替换,仍全部在册
  ['MaterialLight', 'MaterialDark', 'PixelLight', 'PixelDark', 'NordLight', 'NordDark', 'DeepBlue', 'Monokai', 'AMOLEDBlack']
    .forEach((name) => assert.ok(catalog.some((t) => t.name === name), `本地预设 ${name} 丢失`));
});

test('运行时图标主题目录 = 1 个空壳 + 3 个 app 内置', () => {
  const { api } = loadApp();
  const catalog = api.state.iconThemeCatalog;
  assert.equal(catalog.length, 4, `图标主题目录应为 4 项,实际 ${catalog.length}`);
  const appItems = catalog.filter((t) => t.id.startsWith('app-icon-'));
  assert.equal(appItems.length, 3);
  // vm 沙箱里造出来的数组与本地数组不同 realm,deepEqual 会假失败,故按 JSON 比
  assert.equal(JSON.stringify(appItems.map((t) => t.name)), JSON.stringify(['无题', '谷歌', '长日将烬']));
  appItems.forEach((t) => {
    assert.ok(Object.keys(t.icons).length > 0, `${t.name} 应带图标字典`);
    assert.ok(typeof t.thumbnailSvg === 'string' && t.thumbnailSvg.length > 0, `${t.name} 应带缩略图 SVG`);
  });
});

test('app 内置主题的明暗来自 app 的 isDark,不靠名字猜', () => {
  const { api } = loadApp();
  const catalog = api.state.themeCatalog.filter((t) => t.id.startsWith('app-'));
  const source = read('data/theme-presets.json');
  source.forEach((src) => {
    const got = catalog.find((t) => t.name === src.name);
    assert.ok(got, `运行时缺少主题 ${src.name}`);
    assert.equal(got.isDark, src.isDark, `${src.name} 明暗与 app 声明不一致`);
  });
  // 名字里没有 Dark 却确实是暗色的样本,用来证明确实读的是 isDark 而非正则
  const caramelEmber = catalog.find((t) => t.name === 'Caramel Ember');
  assert.equal(caramelEmber.isDark, true);
  assert.ok(!/Dark|AMOLED|Monokai|DeepBlue/.test(caramelEmber.name));
});

test('app 内置主题的 21 个 token 色值与源 JSON 全等', () => {
  const { api } = loadApp();
  const catalog = api.state.themeCatalog.filter((t) => t.id.startsWith('app-'));
  const source = read('data/theme-presets.json');
  assert.equal(source.length, 12);
  source.forEach((src) => {
    const got = catalog.find((t) => t.name === src.name);
    assert.ok(got, `运行时缺少主题 ${src.name}`);
    const gotKeys = Object.keys(got.colors).filter((k) => k !== 'waterRippleColor').sort();
    const srcKeys = Object.keys(src.colors).sort();
    assert.deepEqual(gotKeys, srcKeys, `${src.name} token 键集不一致`);
    srcKeys.forEach((k) => {
      assert.equal(got.colors[k], src.colors[k], `${src.name}.${k} 色值不一致`);
    });
  });
});

test('符号目录三份数据与 app assets 逐组一致', () => {
  if (!fs.existsSync(ASSETS)) return; // 无输入法工程时跳过(校验器已覆盖生成物)
  ['symbols', 'emoji', 'kaomoji'].forEach((kind) => {
    const src = JSON.parse(fs.readFileSync(path.join(ASSETS, 'symbols', `${kind}.json`), 'utf8'));
    const got = read(`data/${kind}.json`);
    assert.equal(got.multiLine, !!src.multiLine, `${kind} multiLine 不一致`);
    assert.equal(got.groups.length, src.groups.length, `${kind} 组数不一致`);
    src.groups.forEach((g, i) => {
      assert.deepEqual(got.groups[i].names, g.names, `${kind} 第 ${i + 1} 组组名不一致`);
      assert.deepEqual(got.groups[i].symbols, g.symbols, `${kind} 第 ${i + 1} 组条目不一致`);
    });
  });
});

test('符号三份数据规模符合 app assets 实测(62/10/19 组)', () => {
  const sizes = { symbols: 62, emoji: 10, kaomoji: 19 };
  Object.entries(sizes).forEach(([kind, groups]) => {
    const got = read(`data/${kind}.json`);
    assert.equal(got.groups.length, groups, `${kind} 组数应为 ${groups}`);
    assert.ok(got.groups.every((g) => Array.isArray(g.symbols)), `${kind} 每组都应有 symbols 数组`);
    assert.ok(got.groups.every((g) => g.names && Object.keys(g.names).length > 0), `${kind} 每组都应有组名`);
  });
});
