const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./dom-app-harness.cjs');

// The ZIP decoder is the external boundary. Run the real import transaction with
// entries carrying distinct bytes, so wrong basename matches cannot pass unnoticed.
function importer(entries) {
  const reads = [];
  const JSZip = { loadAsync: async () => ({
    forEach(callback) {
      for (const [name, value] of entries) callback(name, {
        dir: false,
        unsafeOriginalName: name,
        _data: { uncompressedSize: Buffer.byteLength(value) },
        async(type) {
          reads.push(name);
          return Promise.resolve(type === 'base64' ? Buffer.from(value).toString('base64') : value);
        },
      });
    },
  }) };
  const { api } = loadApp({ JSZip });
  return { api, reads, load: () => api.importIconThemeFromZipFile({ size: 100 }) };
}

const theme = (icons) => JSON.stringify({ name: 'Test', author: 'Author', version: 1, icons });

test('图标 ZIP 通过完整路径读取同名资源,兼容旧包名绝对引用', async () => {
  const { load } = importer([
    ['Test.json', theme({ 'toolbar.undo': 'file:/storage/emulated/0/Android/data/old.package/files/button_icons/Test/icon.png' })],
    ['button_icons/Other/icon.png', 'wrong image'],
    ['button_icons/Test/icon.png', 'correct image'],
  ]);
  const imported = await load();
  assert.equal(imported.icons['toolbar.undo'], 'data:image/png;base64,' + Buffer.from('correct image').toString('base64'));
});

test('图标 ZIP 支持同一个顶层文件夹里的定义和资源', async () => {
  const { load } = importer([
    ['wrapper/Test.json', theme({ 'toolbar.undo': 'file:button_icons/Test/icon.png' })],
    ['wrapper/button_icons/Test/icon.png', 'wrapped image'],
  ]);
  const imported = await load();
  assert.equal(imported.icons['toolbar.undo'], 'data:image/png;base64,' + Buffer.from('wrapped image').toString('base64'));
});

test('多个主题定义在读取前拒绝,不因异步完成顺序随机覆盖当前主题', async () => {
  const { api, reads, load } = importer([['First.json', theme({})], ['Second.json', theme({})]]);
  const original = api.state.selectedIconThemeId;
  const count = api.state.iconThemeCatalog.length;
  await assert.rejects(load(), /多个 JSON/);
  assert.deepEqual(reads, []);
  assert.equal(api.state.selectedIconThemeId, original);
  assert.equal(api.state.iconThemeCatalog.length, count);
});

test('缺失或歧义的资源拒绝整份导入,不猜测同名图片', async () => {
  for (const entries of [
    [['Test.json', theme({ 'toolbar.undo': 'file:button_icons/Test/icon.png' })], ['button_icons/Other/icon.png', 'wrong']],
    [['wrapper/Test.json', theme({ 'toolbar.undo': 'file:button_icons/Test/icon.png' })],
      ['button_icons/Test/icon.png', 'first'], ['wrapper/button_icons/Test/icon.png', 'second']],
  ]) {
    const { api, load } = importer(entries);
    const original = api.state.selectedIconThemeId;
    await assert.rejects(load(), /缺少|歧义/);
    assert.equal(api.state.selectedIconThemeId, original);
  }
});

test('无效槽位数据和穿越路径拒绝,XML文件恢复为可预览的内联图标', async () => {
  const invalid = importer([['Test.json', theme({ 'toolbar.undo': null })]]);
  await assert.rejects(invalid.load(), /必须是字符串/);
  const traversal = importer([['Test.json', theme({})], ['../bad.png', 'bad']]);
  await assert.rejects(traversal.load(), /无效路径/);
  const xml = '<vector width="24dp" height="24dp" viewportWidth="24" viewportHeight="24"><path fillColor="#000000" pathData="M0,0h24v24z"/></vector>';
  const { load } = importer([['Test.json', theme({ 'toolbar.undo': 'file:button_icons/Test/icon.xml' })], ['button_icons/Test/icon.xml', xml]]);
  assert.equal((await load()).icons['toolbar.undo'], xml);
});
