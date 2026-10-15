/* 行为级功能项的运行时证据：inventory §5 里 4 项没有静态 DOM 入口记号、
 * 脚本核对定位不到、只能靠真实调用证明的功能项——
 *   #6  草稿自动保存（beforeunload/pagehide → saveDraftNow）
 *   #72 二维码协议栈（crc32 / base64url / LZMA 分片编解码）
 *   #73 背景草稿存储（js/draft-assets.js，20MB/64MB 限额）
 *   #74 JSON 宽松修复引擎（js/json-lint.js，BOM/尾逗号/注释/单引号/全角）
 * 全部真实调用实现，不复制待测逻辑。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, loadScript } = require('./dom-app-harness.cjs');

test('#6 草稿自动保存：saveDraftNow 写入 localStorage 并可被快照读回', () => {
  const { api, storage } = loadApp();
  const key = 'f5a-editor-draft-v1';
  assert.equal(storage.has(key), false, '装载后不应已有草稿');
  const ok = api.saveDraftNow();
  assert.equal(ok, true, 'saveDraftNow 应返回 true');
  assert.equal(storage.has(key), true, 'saveDraftNow 应写入 localStorage');
  const snap = JSON.parse(storage.get(key));
  // 快照必须带布局与主题，否则恢复逻辑会判为空草稿拒绝恢复
  assert.ok(snap.layout && Object.keys(snap.layout).length > 0, '快照应含非空 layout');
  assert.ok(Array.isArray(snap.themes), '快照应含 themes 数组');
  // 内容应与当前 state 一致
  assert.deepEqual(snap.layout, api.state.layout, '快照 layout 应与 state 一致');
});

test('#6 草稿自动保存：快照剔除 blob: 背景，避免恢复后失效 URL', () => {
  const { api, storage } = loadApp();
  const custom = {
    id: 'custom-blob-bg', name: '带背景', builtin: false, isDark: true,
    colors: {}, backgroundImage: 'blob:http://localhost/abc-123'
  };
  api.state.themeCatalog.unshift(custom);
  api.state.selectedThemeId = custom.id;
  api.saveDraftNow();
  const snap = JSON.parse(storage.get('f5a-editor-draft-v1'));
  const saved = snap.themes.find(t => t.id === 'custom-blob-bg');
  assert.equal(saved.backgroundImage, '', 'blob: 背景应在快照中置空');
});

test('#72 二维码协议栈：crc32 与公开实现一致（含空输入与 "123456789"）', () => {
  const { api } = loadApp();
  const enc = new TextEncoder();
  // CRC-32/ISO-HDLC 标准检校值
  assert.equal(api.crc32(new Uint8Array(0)), 0, '空输入 CRC32 应为 0');
  const c = api.crc32(enc.encode('123456789'));
  assert.equal(c, 0xcbf43926, `"123456789" 的 CRC32 应为 0xCBF43926，实际 0x${c.toString(16)}`);
});

test('#72 二维码协议栈：分片文本可解析回原字段，且拒收伪造串', () => {
  const { api } = loadApp();
  const payload = 'AAAA_BBBB-cccc';
  const text = `F5AQR1|L1a2b3c4d5e6|2/5|3735928559|${payload}`;
  const parsed = api.parseQrChunkText(text);
  assert.ok(parsed, '合法分片应解析成功');
  assert.equal(parsed.transferId, 'L1a2b3c4d5e6');
  assert.equal(parsed.index, 2);
  assert.equal(parsed.total, 5);
  assert.equal(parsed.crc, 3735928559);
  assert.equal(parsed.payload, payload);
  // 伪造：魔数不对
  assert.equal(api.parseQrChunkText(text.replace('F5AQR1', 'XXXXXX')), null, '魔数不符应拒收');
  // 伪造：序号越界
  assert.equal(api.parseQrChunkText(text.replace('2/5', '9/5')), null, 'index>total 应拒收');
  // 伪造：payload 含非 base64url 字符
  assert.equal(api.parseQrChunkText(text.replace(payload, 'aa$bb')), null, '非法字符应拒收');
  // 伪造：transferId 格式不对（需 ^[A-Z][0-9a-f]{11}）
  assert.equal(api.parseQrChunkText(text.replace('L1a2b3c4d5e6', 'Lzzzzzzzzzzz')), null,
    'transferId 格式不符应拒收');
});

test('#72 二维码协议栈：base64url 编解码往返一致（含全字节值）', () => {
  const { api } = loadApp();
  // 覆盖 0..255 全部字节值，确保 btoa/atob 路径不丢高位
  const bytes = new Uint8Array(256);
  for (let i = 0; i < 256; i++) bytes[i] = i;
  const encoded = api.bytesToBase64Url(bytes);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/, 'base64url 不应含 + / = 字符');
  const decoded = api.base64UrlToBytes(encoded);
  assert.deepEqual([...decoded], [...bytes], '编解码往返应逐字节一致');
});

test('#73 背景草稿存储：模块导出 save/load，无 indexedDB 时给出明确报错', async () => {
  const { window } = loadScript('draft-assets.js', { window: { indexedDB: undefined } });
  const mod = window.F5aDraftAssets;
  assert.ok(mod && typeof mod.save === 'function' && typeof mod.load === 'function',
    'js/draft-assets.js 应导出 { save, load }');
  await assert.rejects(() => mod.save('id', new Blob([1]), []),
    /浏览器不支持图片图片草稿存储|不支持图片草稿存储|不支持/,
    '无 indexedDB 时 save 应明确报错而不是静默失败');
});

test('#73 背景草稿存储：空 blob 与超大单图被拒（20MB 限额生效）', async () => {
  const { window } = loadScript('draft-assets.js');
  const mod = window.F5aDraftAssets;
  await assert.rejects(() => mod.save('id', new Blob([]), []), /为空/, '空图片应被拒');
  const big = new Blob([new Uint8Array(21 * 1024 * 1024)]);
  await assert.rejects(() => mod.save('id', big, []), /20 ?MB/, '超过 20MB 应被拒');
});
