// 用 Edge 无头 + CDP 取真实布局与观感证据（Node 原生 WebSocket，无需 puppeteer）。
// 用法: node tests/cdp-probe.cjs [targetDir] [light|dark]
//   light/dark 会先写 localStorage('f5a-editor-site-theme') 再 reload 强制主题模式。
// 输出关键字段:
//   errorsByKind / errorsDetailed —— 控制台条目按来源分类(js-exception 页面脚本异常 /
//     cors-file-fetch file:// 下 fetch 被 CORS 拦 / external-cdn-unreachable 外部 CDN 不可达 /
//     local-resource-missing 本地资源缺失 / browser-internal 浏览器自身日志 / other 未归类)
//   failedRequests —— Network.loadingFailed 逐条资源 URL 与 errorText
//   jsExceptions —— 页面脚本异常计数;判「渲染无 JS 报错」只看它,不看网络层
//   targetDir 省略时测当前工作区的 index.html；传 HEAD 快照目录可测基线版。
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = path.resolve(__dirname, '..');
const target = process.argv[2] ? path.resolve(process.argv[2]) : ROOT;
const indexUrl = 'file:///' + path.join(target, 'index.html').replace(/\\/g, '/');

function getJson(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => {
      let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

async function main() {
  const port = 9333 + (process.pid % 200);
  // 用系统临时目录:工作区内的 profile 目录 Edge 会锁文件,最后 rmSync 报 EPERM
  const userDir = path.join(require('node:os').tmpdir(), 'f5a-cdp-profile-' + process.pid);
  fs.rmSync(userDir, { recursive: true, force: true });
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`,
    '--window-size=1440,1000', 'about:blank',
  ], { stdio: 'ignore' });

  // 等 CDP 端口起来
  let list = null;
  for (let i = 0; i < 60; i++) {
    try { list = await getJson(`http://127.0.0.1:${port}/json/list`); if (list && list.length) break; } catch (e) { /* 未起来 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!list) { edge.kill(); throw new Error('CDP 端口未就绪'); }

  const wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl || list[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  const errors = [];
  const errorsDetailed = [];
  const netReqs = new Map();   // requestId -> url(用于把 loadingFailed 归因到具体资源)
  const failedRequests = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Network.requestWillBeSent') {
      netReqs.set(m.params.requestId, m.params.request?.url || '');
      return;
    }
    if (m.method === 'Network.loadingFailed') {
      const url = netReqs.get(m.params.requestId) || '';
      failedRequests.push({ url, errorText: m.params.errorText || null, blockedReason: m.params.blockedReason || null });
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const text = m.params.exceptionDetails?.text + ' ' + (m.params.exceptionDetails?.exception?.description || '');
      errors.push(text);
      errorsDetailed.push({ kind: 'js-exception', url: m.params.exceptionDetails?.url || null, text: String(text).slice(0, 200) });
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      const e = m.params.entry;
      const u = e.url || '';
      const t = e.text || '';
      let kind = 'other';
      if (/Access to fetch at/.test(t)) kind = 'cors-file-fetch';
      else if (/^https?:\/\//.test(u)) kind = 'external-cdn-unreachable';
      else if (/^file:\/\//.test(u)) kind = 'local-resource-missing';
      else if (!u) kind = 'browser-internal';
      errors.push('[log] ' + t);
      errorsDetailed.push({ kind, url: u || null, text: t.slice(0, 200) });
    }
  });

  // mode 参数:先落地 localStorage 再 reload,强制 light/dark;省略则走 auto(系统偏好)
  const mode = process.argv[3];
  await send('Page.navigate', { url: indexUrl });
  await new Promise((r) => setTimeout(r, 2500));
  if (mode) {
    await send('Runtime.evaluate', { expression: `try{localStorage.setItem('f5a-editor-site-theme','${mode}')}catch(e){}` });
    await send('Page.reload', { ignoreCache: false });
  }
  await new Promise((r) => setTimeout(r, 9000));

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text };
    return r.result?.result?.value;
  };

  const out = { target, url: indexUrl, errors: [], errorsDetailed: [], failedRequests: [], errorsByKind: {}, jsExceptions: 0, data: {}, interact: null };
  out.data = await evaluate(`(${probeFn.toString()})()`);
  out.interact = await evaluate(`(${interactFn.toString()})()`);
  out.interactNote = "点开与筛选通过脚本触发,可证明事件接线与渲染分支生效;真实指针/触屏与视觉观感仍需人工确认";
  out.errors = errors;
  out.errorsDetailed = errorsDetailed;
  out.failedRequests = failedRequests;
  out.jsExceptions = errorsDetailed.filter((e) => e.kind === 'js-exception').length;
  for (const e of errorsDetailed) out.errorsByKind[e.kind] = (out.errorsByKind[e.kind] || 0) + 1;

  ws.close(); edge.kill();
  // 不 rmSync:Edge 仍锁着 profile 目录里的文件,清理必然 EPERM;交给系统临时目录回收
  console.log(JSON.stringify(out, null, 2));
}

async function interactFn() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const out = { steps: [], problems: [] };
  const log = (name, detail) => out.steps.push({ name, ...detail });

  const tabs = qa('.tabs .tab');
  log('页签数', { value: tabs.length, labels: tabs.map((t) => t.textContent.trim()) });

  // A. 逐个页签点开,记录面板可见性、卡片数与 JS 异常
  for (const tab of tabs) {
    const id = tab.dataset.tabTarget;
    tab.click();
    await wait(120);
    const panel = document.getElementById(id);
    const active = panel ? panel.classList.contains('active') : false;
    const visible = panel ? panel.getBoundingClientRect().height > 0 : false;
    const cards = panel ? panel.querySelectorAll('details.card').length : 0;
    if (!active || !visible) out.problems.push('点开 ' + id + ' 后面板不可见');
    log('切页签 ' + id, { ariaSelected: tab.getAttribute('aria-selected'), tabindex: tab.getAttribute('tabindex'), panelActive: active, panelHeight: Math.round(panel ? panel.getBoundingClientRect().height : 0), cardCount: cards });
  }

  // B. 主题页:来源 chip 过滤 + 名称筛选 + 空状态
  const themeTab = tabs.find((t) => t.dataset.tabTarget === 'tab-theme');
  if (themeTab) {
    themeTab.click();
    await wait(200);
    const listEl = document.getElementById('theme-list');
    const countAll = listEl ? listEl.querySelectorAll('.theme-card').length : 0;
    const groups = listEl ? Array.from(listEl.querySelectorAll('.theme-group')).map((g) => ({ source: g.dataset.themeGroup, n: g.querySelectorAll('.theme-card').length })) : [];
    log('主题列表(全部)', { cards: countAll, groups, hint: (document.getElementById('theme-count-hint') || {}).textContent || null });

    // B0. s5 易用性:分组小标题 + 卡片副标题 + 工具条三件套是否真的渲染出来
    const heads = listEl ? Array.from(listEl.querySelectorAll('.theme-group-head')).map((h) => h.textContent.trim()) : [];
    const metas = listEl ? Array.from(listEl.querySelectorAll('.theme-card-meta')).map((m) => m.textContent.trim()) : [];
    if (countAll > 0 && heads.length < 2) out.problems.push('多来源时未渲染分组小标题,实测 ' + heads.length + ' 个');
    if (countAll > 0 && metas.length !== countAll) out.problems.push('卡片副标题数应等于卡片数,实测 ' + metas.length + '/' + countAll);
    log('分组小标题与卡片副标题', { heads, metaCount: metas.length, metaSample: metas.slice(0, 3) });

    // 卡片副标题不能与卡片标题完全重合(否则等于没加信息)
    const titles = listEl ? Array.from(listEl.querySelectorAll('.theme-card-title')).map((t) => t.textContent.trim()) : [];
    const dupMeta = titles.filter((t, i) => t === metas[i]).length;
    if (dupMeta) out.problems.push('有 ' + dupMeta + ' 张卡片副标题与标题完全相同');

    // 工具条控件可见性:搜索框 + 4 个来源 chip + 计数提示
    const toolbar = document.querySelector('#theme-list') ? document.querySelector('#theme-list').previousElementSibling : null;
    const chipCount = toolbar ? toolbar.querySelectorAll('.chip[data-theme-source]').length : 0;
    const searchVisible = !!(toolbar && toolbar.querySelector('input[type="search"]') && toolbar.querySelector('input[type="search"]').getBoundingClientRect().height > 0);
    if (chipCount !== 4) out.problems.push('来源筛选 chip 应为 4 个,实测 ' + chipCount);
    if (!searchVisible) out.problems.push('主题搜索框不可见');
    log('主题工具条', { searchVisible, chipCount });

    const appChip = document.querySelector('[data-theme-source="app"]');
    if (appChip) {
      appChip.click();
      await wait(200);
      const n = listEl.querySelectorAll('.theme-card').length;
      const pressed = appChip.getAttribute('aria-pressed');
      if (pressed !== 'true') out.problems.push('点「输入法内置」后 aria-pressed 未置 true');
      log('主题列表(输入法内置)', { cards: n, ariaPressed: pressed, hint: (document.getElementById('theme-count-hint') || {}).textContent || null });
      if (n !== 12) out.problems.push('输入法内置筛选应为 12 个,实测 ' + n);
    }

    const input = document.getElementById('theme-filter');
    if (input) {
      input.value = 'zzz-不可能匹配-zzz';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(200);
      const empty = listEl.querySelector('.list-empty');
      const n = listEl.querySelectorAll('.theme-card').length;
      if (!empty || n !== 0) out.problems.push('无匹配时未显示空状态(卡片数 ' + n + ')');
      log('主题列表(无匹配)', { cards: n, hasEmpty: !!empty, emptyText: empty ? empty.textContent.trim().slice(0, 40) : null });
      const reset = listEl.querySelector('[data-theme-filter-reset]');
      if (reset) {
        reset.click();
        await wait(200);
        log('主题列表(点清除筛选后)', { cards: listEl.querySelectorAll('.theme-card').length, filterValue: input.value });
        if (input.value !== '') out.problems.push('清除筛选后输入框未清空');
      } else out.problems.push('空状态里没有「清除筛选」按钮');
    }
  }

  // C. 图标主题页筛选
  const iconTab = tabs.find((t) => t.dataset.tabTarget === 'tab-icon-theme');
  if (iconTab) {
    iconTab.click();
    await wait(200);
    const el2 = document.getElementById('icon-theme-list');
    const before = el2 ? el2.querySelectorAll('.icon-theme-card').length : 0;
    const input2 = document.getElementById('icon-theme-filter');
    if (input2) {
      input2.value = 'zzz-不可能匹配-zzz';
      input2.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(200);
      const empty2 = el2.querySelector('.list-empty');
      if (!empty2) out.problems.push('图标主题无匹配时未显示空状态');
      log('图标主题筛选', { before, after: el2.querySelectorAll('.icon-theme-card').length, hasEmpty: !!empty2 });
    }
  }

  // D. 键盘导航:焦点在页签上按 ArrowRight 应切到下一个页签
  const first = tabs[0];
  first.focus();
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await wait(200);
  const activeAfter = document.querySelector('.tabs .tab.active');
  log('方向键导航', { active: activeAfter ? activeAfter.dataset.tabTarget : null, focused: document.activeElement ? (document.activeElement.dataset ? document.activeElement.dataset.tabTarget : document.activeElement.tagName) : null });
  if (!activeAfter || activeAfter.dataset.tabTarget !== tabs[1].dataset.tabTarget) out.problems.push('ArrowRight 未切到第 2 个页签');
  const tabbables = qa('.tabs .tab').filter((t) => t.getAttribute('tabindex') === '0');
  if (tabbables.length !== 1) out.problems.push('roving tabindex 应只有 1 个 tabindex=0,实测 ' + tabbables.length);

  // E. 危险操作文案
  const dangerLabels = qa('button.danger, .mini-button.danger').map((b) => b.textContent.trim());
  log('危险按钮文案', { labels: dangerLabels });

  // F. 提示类可点元素是否都有可见文字或 title
  const nameless = qa('button').filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')).map((b) => b.id || b.className);
  log('无文字按钮', { count: nameless.length, sample: nameless.slice(0, 8) });

  // G. 随机主题:点生成 → 评分/配色/主题卡/选中态
  {
    const themeTab = tabs.find((t) => t.dataset.tabTarget === 'tab-theme');
    if (themeTab) themeTab.click();
    await wait(120);
    const gen = document.getElementById('random-theme-generate');
    const scoreNode = document.getElementById('random-theme-score');
    const paletteNode = document.getElementById('random-theme-palette');
    const copyBtn = document.getElementById('random-theme-copy');
    const before = {
      genFound: !!gen,
      scoreHiddenAtStart: scoreNode ? scoreNode.hidden : null,
      copyDisabledAtStart: copyBtn ? copyBtn.disabled : null,
      cards: qa('#theme-list .theme-card').length
    };
    if (gen) gen.click();
    await wait(400);
    const cardsAfter = qa('#theme-list .theme-card').length;
    const active = document.querySelector('#theme-list .theme-card.active');
    const swatches = qa('#random-theme-palette .random-swatch').length;
    const sample = qa('#random-theme-palette .random-swatch').slice(0, 3)
      .map((n) => n.getAttribute('title'));
    const statusText = (document.getElementById('random-theme-status') || {}).textContent || '';
    log('随机主题(点生成)', {
      ...before,
      cardsAfter,
      activeName: active ? (active.querySelector('.theme-card-title') || {}).textContent : null,
      scoreText: scoreNode ? scoreNode.textContent : null,
      scoreHiddenAfter: scoreNode ? scoreNode.hidden : null,
      copyDisabledAfter: copyBtn ? copyBtn.disabled : null,
      swatches,
      sample,
      statusText
    });
    if (!gen) out.problems.push('随机主题:未找到 #random-theme-generate 按钮');
    else {
      if (cardsAfter !== before.cards + 1) out.problems.push(`随机主题:生成后卡片数应为 ${before.cards + 1},实测 ${cardsAfter}`);
      if (!(scoreNode && scoreNode.textContent && /美学评分/.test(scoreNode.textContent))) out.problems.push('随机主题:评分未展示');
      if (swatches < 24) out.problems.push(`随机主题:配色色块应 ≥24,实测 ${swatches}`);
      if (!active || !/随机主题/.test(active.textContent || '')) out.problems.push('随机主题:生成后未选中该主题');
      if (copyBtn && copyBtn.disabled) out.problems.push('随机主题:复制按钮仍禁用');
    }

    // 再点一次:应复用同一个 slot,不新增卡片
    if (gen) gen.click();
    await wait(400);
    const cardsTwice = qa('#theme-list .theme-card').length;
    log('随机主题(再生成一次)', { cardsTwice, scoreText: scoreNode ? scoreNode.textContent : null });
    if (cardsTwice !== cardsAfter) out.problems.push(`随机主题:重复生成不应加卡片,实测 ${cardsTwice}`);
  }

  return out;
}

function probeFn() {
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const cs = (e, p) => (e ? getComputedStyle(e).getPropertyValue(p).trim() : null);

  const doc = document.documentElement;
  const body = document.body;

  // 1. 横向溢出：任何元素右边界超出视口宽度
  const vw = doc.clientWidth;
  const overflow = qa('*').filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.right > vw + 1;
  }).slice(0, 12).map((e) => ({ tag: e.tagName, id: e.id, cls: e.className?.toString?.().slice(0, 40), right: Math.round(e.getBoundingClientRect().right) }));

  // 2. 关键区块盒模型
  const key = {};
  for (const sel of ['.topbar', '.topbar-main', 'main', '.tabs', '.panel.active', '.layout-workbench', '.card', 'details.card', '.keyboard-preview-panel']) {
    const e = q(sel);
    key[sel] = { box: box(e), bg: cs(e, 'background-color'), color: cs(e, 'color'), radius: cs(e, 'border-radius') };
  }

  // 3. 设计令牌实际生效值
  const tokens = {};
  for (const t of ['--bg', '--bg-soft', '--card', '--card-inner', '--border', '--text', '--text-dim', '--accent', '--danger', '--ok', '--warn', '--radius', '--content-max', '--space-md', '--fs-base']) {
    tokens[t] = cs(doc, t);
  }

  // 4. 对比度：body 文本 / 卡片文本 / 弱化文本 vs 各自背景
  const lum = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const [r, g, b] = m[1].split(',').map((v) => parseFloat(v));
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; if (x == null || y == null) return null; const [hi, lo] = x > y ? [x, y] : [y, x]; return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100; };
  const contrast = {
    'body文本/页面底': ratio(cs(body, 'color'), cs(body, 'background-color')),
    '弱化文本/卡片底': (() => { const e = q('.hint, .status, .text-dim, small'); return e ? ratio(cs(e, 'color'), cs(e.closest('.card') || body, 'background-color')) : null; })(),
    '主按钮/按钮底': (() => { const e = q('button.primary, .mini-button.primary'); return e ? ratio(cs(e, 'color'), cs(e, 'background-color')) : null; })(),
    'tab激活/tab底': (() => { const e = q('.tab.active'); return e ? ratio(cs(e, 'color'), cs(e, 'background-color')) : null; })(),
  };

  // 5. 触控目标尺寸（易用性：可点击元素高度 < 24px 记一笔）
  const smallTargets = qa('button, .mini-button, .tab, input[type=checkbox], select').filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.height < 24;
  }).slice(0, 12).map((e) => ({ tag: e.tagName, id: e.id, cls: e.className?.toString?.().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) }));

  // 6. 结构与主题状态
  const meta = {
    htmlClass: doc.className,
    siteTheme: (() => { try { return localStorage.getItem('f5a-editor-site-theme'); } catch (e) { return null; } })(),
    details: qa('details').length,
    detailsCard: qa('details.card').length,
    dialogs: qa('dialog').length,
    dialogTitlebar: qa('.dialog-titlebar').length,
    dialogToolbar: qa('.dialog-toolbar').length,
    buttons: qa('button').length,
    primaryBtns: qa('button.primary, .mini-button.primary').length,
    dangerBtns: qa('button.danger, .mini-button.danger, .icon-button.danger').length,
    tabs: qa('.tab').length,
    panels: qa('.panel').length,
    scrollW: doc.scrollWidth, clientW: doc.clientWidth,
    verticalOverflow: doc.scrollWidth - doc.clientWidth,
  };

  return { meta, tokens, key, contrast, overflow, smallTargets };
}

main().catch((e) => { console.error(e); process.exit(1); });
