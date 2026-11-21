const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./dom-app-harness.cjs');

function rawTheme(version = '2.1', extra = {}) {
  return { name: 'Test', isDark: false, version,
    barColor: 0xff123456, keyTextColor: 0xff111111, altKeyTextColor: 0xff222222,
    accentKeyBackgroundColor: 0xff345678, accentKeyTextColor: 0xffeeeeee,
    popupBackgroundColor: 0xffabcdef, popupTextColor: 0xff987654,
    genericActiveBackgroundColor: 0xffaabbcc, genericActiveForegroundColor: 0xffddeeff,
    candidateTextColor: 0xff555555, candidateLabelColor: 0xff666666, candidateCommentColor: 0xff777777,
    ...extra };
}
const signed = (value) => value | 0;

test('App 1.0/2.0主题迁移按实际serializer顺序补齐颜色,2.1保留独立候选色', () => {
  const { api } = loadApp();
  const { normalizeImportedThemePayload: read } = api;
  const old = rawTheme('1.0');
  delete old.version;
  const v1 = read(old);
  assert.equal(v1.colors.popupBackgroundColor, signed(old.barColor));
  assert.equal(v1.colors.popupTextColor, signed(old.keyTextColor));
  assert.equal(v1.colors.genericActiveBackgroundColor, signed(old.accentKeyBackgroundColor));
  assert.equal(v1.colors.candidateTextColor, signed(old.keyTextColor));
  assert.equal(v1.colors.candidateLabelColor, signed(old.keyTextColor));
  assert.equal(v1.colors.candidateCommentColor, signed(old.altKeyTextColor));
  assert.equal(read(rawTheme('1.0', { backgroundImage: null })).colors.popupBackgroundColor, signed(0xffeeeeee));
  assert.equal(read(rawTheme('1.0', { backgroundImage: null, isDark: true })).colors.popupBackgroundColor, signed(0xff373737));
  const v2 = read(rawTheme('2.0'));
  assert.equal(v2.colors.popupBackgroundColor, signed(0xffabcdef));
  assert.equal(v2.colors.candidateTextColor, signed(0xff111111));
  assert.equal(read(rawTheme()).colors.candidateTextColor, signed(0xff555555));
  assert.throws(() => read(rawTheme('3.0')), /不支持的主题版本/);
});

test('网页colors包装和App二维码包装均读入当前颜色,图片路径不擅自加目录', () => {
  const { api } = loadApp();
  const raw = rawTheme('2.1', { backgroundImage: { croppedFilePath: 'crop.png', srcFilePath: 'source.png', cropRect: null } });
  const qr = api.normalizeImportedThemePayload({ schema: 'f5a-theme-qr-v1', theme: JSON.stringify(raw) });
  assert.equal(qr.backgroundImageObject.croppedFilePath, 'crop.png');
  const nested = api.normalizeImportedThemePayload({ name: 'Web', colors: { candidateTextColor: 0xffabcdef } });
  assert.equal(nested.colors.candidateTextColor, signed(0xffabcdef));
});

function decoder(entries) {
  const files = Object.fromEntries(entries.map(([name, data]) => [name, {
    name, unsafeOriginalName: name, dir: false, _data: { uncompressedSize: Buffer.byteLength(data) },
    async: async (type) => type === 'blob' ? new Blob([data]) : data,
  }]));
  const { api } = loadApp({ JSZip: { loadAsync: async () => ({ files }) }, DraftAssets: { save: async () => {} } });
  return { api, load: () => api.decodeThemeFromZipFile({ size: 100, type: 'application/zip', arrayBuffer: async () => new ArrayBuffer(0) }) };
}
const pictured = (paths = {}) => JSON.stringify(rawTheme('2.1', { backgroundImage: {
  croppedFilePath: 'Test/crop.png', srcFilePath: 'Test/source.png',
  cropRect: { left: 1, top: 0, right: 3, bottom: 3 }, cropRotation: 90, ...paths,
} }));

test('主题ZIP精确选择源图供再次裁剪,不把已裁剪图当原图', async () => {
  const { load } = decoder([
    ['wrapper/Test.json', pictured()],
    ['wrapper/Other/source.png', 'wrong source'],
    ['wrapper/Test/crop.png', 'cropped image'],
    ['wrapper/Test/source.png', 'original source'],
  ]);
  const theme = await load();
  try {
    assert.equal(await (await fetch(theme.backgroundImage)).text(), 'original source');
    assert.equal(theme.backgroundImageObject.cropRotation, 90);
    assert.equal(theme.backgroundImageObject.srcFilePath, 'Test/source.png');
  } finally { URL.revokeObjectURL(theme.backgroundImage); }
});

test('主题ZIP拒绝多个定义和缺失/歧义资源', async () => {
  for (const entries of [
    [['a.json', JSON.stringify(rawTheme())], ['b.json', JSON.stringify(rawTheme())]],
    [['Test.json', pictured()], ['Other/crop.png', 'wrong'], ['Test/source.png', 'source']],
    [['wrapper/Test.json', pictured()], ['Test/crop.png', 'first'], ['wrapper/Test/crop.png', 'second'], ['Test/source.png', 'source']],
  ]) {
    await assert.rejects(decoder(entries).load(), /多个 JSON|缺少|歧义/);
  }
});

test('图片主题导出分别打包裁剪旋转PNG和原图,保留运行时亮度与模糊参数', async () => {
  class Zip {
    constructor() { this.files = new Map(); }
    file(path, data) { this.files.set(path, data); }
    async generateAsync() { return this.files; }
  }
  class Image {
    constructor() { this.naturalWidth = 4; this.naturalHeight = 3; }
    set src(_) { this.onload(); }
  }
  const source = new Blob(['original source'], { type: 'image/jpeg' });
  const { api, doc } = loadApp({ JSZip: Zip, Image, fetch: async () => ({ ok: true, blob: async () => source }) });
  const draws = [];
  let canvas;
  doc.createElement = () => (canvas = {
    getContext: () => ({ translate: (...args) => draws.push(['translate', ...args]),
      rotate: (...args) => draws.push(['rotate', ...args]), drawImage: (_, ...args) => draws.push(['draw', ...args]) }),
    toBlob: (done, type) => done(new Blob(['cropped PNG'], { type })),
  });
  const theme = { name: 'Test', backgroundImage: 'blob:source', colors: {},
    backgroundImageObject: { croppedFilePath: 'Test/crop.jpg', srcFilePath: 'Test/source.jpg',
      cropRect: { left: 1, top: 0, right: 3, bottom: 3 }, cropRotation: 90, brightness: 42, blurRadius: 12 } };
  const files = await api.buildThemeZipBlob(theme);
  const exported = JSON.parse(files.get('Test.json'));
  assert.equal(canvas.width, 3);
  assert.equal(canvas.height, 2);
  assert.deepEqual(draws, [['translate', 1.5, 1], ['rotate', Math.PI / 2], ['draw', 1, 0, 2, 3, -1, -1.5, 2, 3]]);
  assert.equal(exported.backgroundImage.croppedFilePath, 'Test/crop.png');
  assert.equal(exported.backgroundImage.brightness, 42);
  assert.equal(exported.backgroundImage.blurRadius, 12);
  assert.equal(files.get('Test/crop.png').type, 'image/png');
  assert.equal(await files.get('Test/crop.png').text(), 'cropped PNG');
  assert.equal(files.get('Test/source.jpg'), source);
  assert.equal(theme.backgroundImageObject.croppedFilePath, 'Test/crop.jpg', '导出不能修改当前主题');
});

test('裁剪预览复用像素缓存,完成后不再旋转整个容器,修改选区才重新生成', async () => {
  class Image {
    constructor() { this.naturalWidth = 4; this.naturalHeight = 3; }
    set src(_) { this.onload(); }
  }
  let reads = 0;
  const { api, doc } = loadApp({ Image, fetch: async () => {
    reads++;
    return { ok: true, blob: async () => new Blob(['source'], { type: 'image/png' }) };
  } });
  doc.createElement = () => ({ getContext: () => ({ translate() {}, rotate() {}, drawImage() {} }),
    toBlob: (done, type) => done(new Blob(['cropped'], { type })) });
  const theme = { backgroundImage: 'blob:original', backgroundImageObject: {
    cropRect: { left: 1, top: 0, right: 3, bottom: 3 }, cropRotation: 90, brightness: 42, blurRadius: 0,
  } };
  api.buildThemeBackgroundImageLayerCss(theme);
  api.buildThemeBackgroundImageLayerCss(theme);
  assert.equal(reads, 1);
  await new Promise(setImmediate);
  const baked = api.buildThemeBackgroundImageLayerCss(theme);
  assert.equal(baked.backgroundSize, 'cover');
  assert.equal(baked.transform, 'rotate(0deg) scale(1)');
  assert.notEqual(baked.backgroundImage, 'url("blob:original")');
  assert.equal(baked.filter, 'blur(0px) brightness(42%)');
  theme.backgroundImageObject.brightness = 55;
  api.buildThemeBackgroundImageLayerCss(theme);
  assert.equal(reads, 1, '亮度是运行时滤镜,不重复裁剪');
  theme.backgroundImageObject.cropRect.left = 0;
  api.buildThemeBackgroundImageLayerCss(theme);
  assert.equal(reads, 2);
});

test('超过12个存活图片主题不循环逐出重绘,目录删除后等待长图释放再回收', async () => {
  class Image {
    constructor() { this.naturalWidth = 4; this.naturalHeight = 3; }
    set src(_) { this.onload(); }
  }
  let reads = 0;
  const { api, doc } = loadApp({ Image, fetch: async () => {
    reads++;
    return { ok: true, blob: async () => new Blob(['source'], { type: 'image/png' }) };
  } });
  doc.createElement = () => ({ getContext: () => ({ translate() {}, rotate() {}, drawImage() {} }),
    toBlob: (done, type) => done(new Blob(['cropped'], { type })) });
  const themes = Array.from({ length: 13 }, (_, index) => ({ id: `image-${index}`,
    backgroundImage: `blob:source-${index}`, backgroundImageObject: {
      cropRect: { left: 1, top: 0, right: 3, bottom: 3 }, cropRotation: 90,
    } }));
  api.state.themeCatalog = themes;
  const pending = themes.map(theme => api.themePreviewImage(theme));
  await Promise.all(pending.map(image => image.ready));
  const urls = themes.map(theme => api.themePreviewImage(theme).url);
  api.pruneThemeCropPreviewCache();
  for (let pass = 0; pass < 3; pass++) {
    assert.deepEqual(themes.map(theme => api.themePreviewImage(theme).url), urls);
  }
  assert.equal(reads, 13);
  const exported = api.themePreviewImage(themes[0]);
  exported.entry.users++;
  api.state.themeCatalog = themes.slice(1);
  api.pruneThemeCropPreviewCache();
  assert.equal(await (await fetch(exported.url)).text(), 'cropped', '仍在导出的图片URL必须可读');
  exported.entry.users--;
  api.pruneThemeCropPreviewCache();
  await assert.rejects(fetch(exported.url), /fetch failed/);
});

test('主键盘背景、背景编辑预览和模糊mask均绑定同一裁剪图', async () => {
  class Image {
    constructor() { this.naturalWidth = 4; this.naturalHeight = 3; }
    set src(_) { this.onload(); }
  }
  const { api, doc } = loadApp({ Image, fetch: async () => ({
    ok: true, blob: async () => new Blob(['source'], { type: 'image/png' }),
  }) });
  const makeElement = doc.createElement.bind(doc);
  doc.createElement = (tag) => tag === 'canvas' ? {
    getContext: () => ({ translate() {}, rotate() {}, drawImage() {} }),
    toBlob: (done, type) => done(new Blob(['cropped'], { type })),
  } : makeElement(tag);
  const theme = { id: 'image', builtin: false, colors: {}, backgroundImage: 'blob:source', backgroundImageObject: {
    cropRect: { left: 1, top: 0, right: 3, bottom: 3 }, cropRotation: 90, blurRadius: 5, brightness: 70,
  } };
  api.state.themeCatalog = [theme]; api.state.selectedThemeId = theme.id;
  await api.themePreviewImage(theme).ready;
  const croppedUrl = api.themePreviewImage(theme).url;
  api.actualApplyPreviewThemeSurface();
  const root = doc.getElementById('layout-preview');
  assert.ok(root.style.backgroundImage.includes(croppedUrl));
  assert.ok(root.style.backgroundSize.split(', ').every(size => size === 'cover'));
  api.actualRenderThemeBackgroundEditor();
  const editorImage = doc.getElementById('theme-background-preview').children[0];
  assert.equal(editorImage.style.backgroundImage, `url("${croppedUrl}")`);
  assert.match(editorImage.style.transform, /^rotate\(0deg\)/);
  root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200 });
  api.actualSyncPreviewBlurMaskGeometry();
  assert.equal(root.style['--preview-bg-url'], `url("${croppedUrl}")`);
});
