// 截图工具(可重跑):用 Edge 无头 + CDP 截当前工作区 / HEAD 基线快照的界面。
// 用法: node tests/shots.cjs <输出前缀> [light|dark] [页签 id]
//   例:node tests/shots.cjs usability-after light tab-theme
// 说明:切到指定页签后再截,便于对照某一页的改动;不传页签则截默认的布局编辑页。
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = path.resolve(__dirname, '..');

function getJson(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => {
      let b = '';
      r.on('data', (d) => (b += d));
      r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

async function main() {
  const prefix = process.argv[2] || 'shot';
  const mode = process.argv[3] || 'light';
  const tab = process.argv[4] || '';
  const target = process.env.SHOT_TARGET ? path.resolve(process.env.SHOT_TARGET) : ROOT;
  const indexUrl = 'file:///' + path.join(target, 'index.html').replace(/\\/g, '/');
  const outDir = path.join(ROOT, 'refactor-notes', 'shots');
  fs.mkdirSync(outDir, { recursive: true });

  const port = 9500 + (process.pid % 300);
  const userDir = path.join(os.tmpdir(), 'f5a-shot-profile-' + process.pid);
  fs.rmSync(userDir, { recursive: true, force: true });
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`,
    '--window-size=1440,1200', '--force-device-scale-factor=1', 'about:blank',
  ], { stdio: 'ignore' });

  for (let i = 0; i < 60; i++) {
    try { await getJson(`http://127.0.0.1:${port}/json/version`); break; } catch (e) { await new Promise((r) => setTimeout(r, 250)); }
  }
  const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('未找到 page target');

  const WebSocket = globalThis.WebSocket;
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };

  await send('Page.enable');
  await send('Page.navigate', { url: indexUrl });
  await new Promise((r) => setTimeout(r, 2500));
  await evaluate(`try{localStorage.setItem('f5a-editor-site-theme','${mode}')}catch(e){}`);
  await send('Page.reload', { ignoreCache: false });
  await new Promise((r) => setTimeout(r, 9000));

  if (tab) {
    await evaluate(`(() => { const b = document.querySelector('.tabs .tab[data-tab-target="${tab}"]'); if (b) b.click(); })()`);
    await new Promise((r) => setTimeout(r, 1200));
  }
  await evaluate(`window.scrollTo(0, 0)`);

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const data = shot.result?.data;
  if (!data) throw new Error('captureScreenshot 无数据');
  const outPath = path.join(outDir, `${prefix}-${mode}${tab ? '-' + tab.replace(/^tab-/, '') : ''}.png`);
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  console.log('written', outPath, fs.statSync(outPath).size, 'bytes; target=', target);

  ws.close();
  edge.kill();
}

main().catch((e) => { console.error(e); process.exit(1); });
