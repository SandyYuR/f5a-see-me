/* 随机主题的界面接线核对(判据 6 的「可生成 / 可展示评分与配色方案」那半)。
 *
 * 算法与 Kotlin 的同源复现由 tests/theme-random.test.cjs 与
 * tests/check-random-parity.cjs 负责(真 Kotlin oracle);这里只钉住:
 *  1 index.html 里 random-theme.js 必须在 app.js 之前加载,否则界面拿不到模块;
 *  2 点「生成随机主题」后:目录多出一项、选中它、评分文本出现、配色色块出现;
 *  3 重复生成复用同一个槽位,不把目录撑大;
 *  4 「复制为自定义主题」保留名同名校验,且落进自定义目录。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./dom-app-harness.cjs');

const ROOT = path.join(__dirname, '..');
const html = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('index.html 里 random-theme.js 在 app.js 之前加载', () => {
  const src = html();
  const iRandom = src.indexOf('js/random-theme.js');
  const iApp = src.indexOf('js/app.js');
  assert.ok(iRandom > 0, 'index.html 未引用 js/random-theme.js');
  assert.ok(iRandom < iApp, 'random-theme.js 必须早于 app.js 加载');
});

test('主题页有随机主题的入口与展示区', () => {
  const src = html();
  ['random-theme-generate', 'random-theme-copy', 'random-theme-score', 'random-theme-palette', 'random-theme-status']
    .forEach((id) => assert.ok(src.includes(`id="${id}"`), `缺少 #${id}`));
});

test('app.js 里随机主题已接线:能生成、能展示评分与配色', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.ok(/random-theme-generate[\s\S]{0,200}addEventListener\("click",\s*generateRandomTheme\)/.test(src),
    '生成按钮未绑定 generateRandomTheme');
  assert.ok(/random-theme-copy[\s\S]{0,200}addEventListener\("click",\s*copyRandomThemeAsCustom\)/.test(src),
    '复制按钮未绑定 copyRandomThemeAsCustom');
  // 展示:评分文本 + 配色色块都要真的渲染出来
  assert.ok(/random-theme-score[\s\S]{0,800}randomThemeScoreText/.test(src), '评分未渲染到 #random-theme-score');
  assert.ok(/random-theme-palette[\s\S]{0,800}randomThemePaletteHtml/.test(src), '配色未渲染到 #random-theme-palette');
});

test('生成随机主题:目录加一项、选中它、评分与配色都出现', () => {
  const { api } = loadApp();
  const before = api.state.themeCatalog.length;
  assert.equal(api.state.randomTheme, null, '初始应无随机主题结果');
  api.generateRandomTheme();
  const after = api.state.themeCatalog.length;
  assert.equal(after, before + 1, `生成后目录应多一项,实际 ${before} → ${after}`);
  const entry = api.state.themeCatalog.find((t) => t.id === 'random-theme-slot');
  assert.ok(entry, '未找到随机主题槽位');
  assert.equal(entry.name, '随机主题');
  assert.equal(api.state.selectedThemeId, entry.id, '生成后应选中该主题');
  // 21 个 token 全部有值(有符号 int32 或数字)
  const colors = entry.colors || {};
  assert.equal(Object.keys(colors).length >= 21, true, `主题色 token 应 ≥21,实际 ${Object.keys(colors).length}`);
  Object.entries(colors).forEach(([k, v]) => {
    assert.equal(typeof v, 'number', `${k} 应为数字,实际 ${typeof v}`);
    assert.ok(Number.isFinite(v), `${k} 应为有限数`);
  });
  // 评分四分项与配色方案都在
  const score = api.state.randomTheme.score;
  ['total', 'contrast', 'hue', 'sat', 'light'].forEach((k) => {
    assert.equal(typeof score[k], 'number', `评分缺 ${k}`);
  });
  assert.ok(['analogous', 'complementary', 'triadic', 'split-comp', 'mono'].includes(api.state.randomTheme.candidate.scheme),
    `配色方案应在五种之内,实际 ${api.state.randomTheme.candidate.scheme}`);
  assert.equal(Object.keys(api.state.randomTheme.candidate.colors).length, 28, '候选色板应为 28 色');
});

test('重复生成复用同一个槽位,不会把目录撑大', () => {
  const { api } = loadApp();
  api.generateRandomTheme();
  const once = api.state.themeCatalog.length;
  api.generateRandomTheme();
  assert.equal(api.state.themeCatalog.length, once, '重复生成不应再加卡片');
  assert.equal(api.state.themeCatalog.filter((t) => t.id === 'random-theme-slot').length, 1, '槽位应唯一');
});

test('复制为自定义主题:保留名与重名都被拒,合法名落进目录', () => {
  const names = [];
  const { api } = loadApp({ prompt: () => (names.length ? names.shift() : null) });
  api.generateRandomTheme();

  names.push('随机主题');
  api.copyRandomThemeAsCustom();
  assert.equal(api.state.themeCatalog.filter((t) => t.name === '随机主题' && t.id !== 'random-theme-slot').length, 0,
    '「随机主题」是保留名,不应复制成功');

  const existing = api.state.themeCatalog.find((t) => t.builtin)?.name;
  names.push(existing);
  api.copyRandomThemeAsCustom();
  assert.equal(api.state.themeCatalog.filter((t) => t.name === existing).length, 1, '不应产生重名主题');

  names.push('我的随机主题');
  const before = api.state.themeCatalog.length;
  api.copyRandomThemeAsCustom();
  assert.equal(api.state.themeCatalog.length, before + 1, '合法名应落进目录');
  const made = api.state.themeCatalog.find((t) => t.name === '我的随机主题');
  assert.ok(made, '未找到复制出的主题');
  assert.equal(made.builtin, false, '复制出的应为自定义主题');
  assert.equal(api.state.selectedThemeId, made.id, '复制后应选中新主题');
});
