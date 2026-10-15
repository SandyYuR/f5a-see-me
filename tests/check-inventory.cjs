/* 逐行核对 refactor-notes/f5a-inventory.md §5 的 74 行功能项：
 * 抽出每行的 DOM 入口记号（id / class / data-* / js 文件），在 index.html 与
 * js/*.js 里按字面或前缀定位，输出每行状态。脚本只报「记号定位到了没有」，
 * 不判断功能是否正常——那属于运行时证据。 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const inv = fs.readFileSync(path.join(root, 'refactor-notes/f5a-inventory.md'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const jsFiles = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'));
const jsText = jsFiles.map(f => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n');
const all = html + '\n' + jsText;

// 定位 §5 表格
const start = inv.indexOf('## 5. 核对表底稿');
const lines = inv.slice(start).split('\n').slice(4);
const rows = [];
for (const line of lines) {
  const m = line.match(/^\|\s*(\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)\|/);
  if (!m) { if (rows.length) break; continue; }
  rows.push({ n: +m[1], name: m[2].trim(), entry: m[3].trim(), behavior: m[4].trim(), status: m[5].trim() });
}
if (rows.length !== 74) { console.error(`解析出 ${rows.length} 行，预期 74`); process.exit(1); }

/* 从「DOM 入口」列抽记号。规则（上次假阳性来自把通配当字面量）：
 * - 反引号里的是文件名，如 `draft-assets.js`
 * - `.xxx` 是 class
 * - `data-xxx` 是属性名
 * - 含 `*` 或 `×N` 的是通配，取公共前缀做前缀匹配
 * - 括号里的中文说明整段丢弃 */
function tokens(entry) {
  const cleaned = entry.replace(/（[^）]*）/g, ' ').replace(/\([^)]*\)/g, ' ');
  const out = [];
  for (const m of cleaned.matchAll(/`([^`]+)`/g)) out.push({ kind: 'file', v: m[1] });
  const rest = cleaned.replace(/`[^`]+`/g, ' ');
  for (const m of rest.matchAll(/[.#]?[A-Za-z_][\w-]*/g)) {
    const raw = m[0];
    const bare = raw.replace(/^[.#]/, '');
    if (/^(x|×)\d+$/.test(bare)) continue;            // ×3、×7 这类计数
    if (bare.length < 3) continue;                     // 过短片段无定位意义
    const kind = raw.startsWith('.') ? 'class' : raw.startsWith('#') ? 'id' : (bare.startsWith('data-') ? 'data' : 'token');
    out.push({ kind, v: bare });
  }
  return out;
}

function locate(tok) {
  if (tok.kind === 'file') {
    const inHtml = html.includes(tok.v);
    const onDisk = fs.existsSync(path.join(root, 'js', tok.v));
    return (inHtml || onDisk) ? 'html+disk' : null;
  }
  if (all.includes(tok.v)) return 'html+js';
  return null;
}

const report = rows.map(r => {
  const toks = tokens(r.entry);
  const missing = toks.filter(t => !locate(t));
  return {
    n: r.n, name: r.name, entry: r.entry,
    tokens: toks.length,
    located: toks.length - missing.length,
    status: toks.length === 0 ? '无记号' : (missing.length === 0 ? '入口已定位' : `未定位:${missing.map(x => x.v).join(',')}`),
  };
});

const notLocated = report.filter(r => r.status !== '入口已定位' && r.status !== '无记号');
console.log(`总行数 ${report.length}`);
console.log(`入口全部定位 ${report.filter(r => r.status === '入口已定位').length} 行`);
console.log(`无记号（行为级/内部实现） ${report.filter(r => r.status === '无记号').length} 行`);
console.log(`未定位 ${notLocated.length} 行`);
notLocated.forEach(r => console.log(`  #${r.n} ${r.name} → ${r.status}`));
console.log('\n--- 无记号行（需运行时证据）---');
report.filter(r => r.status === '无记号').forEach(r => console.log(`  #${r.n} ${r.name} | ${r.entry}`));
fs.writeFileSync(path.join(__dirname, 'inventory-check.json'), JSON.stringify(report, null, 2));
console.log('\n明细写入 tests/inventory-check.json');
