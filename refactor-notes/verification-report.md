# f5a-see-me 界面重构 · 综合验证报告（s6）

对照 [refactor-design.md](refactor-design.md) 与 [f5a-inventory.md](f5a-inventory.md)，对重构后的界面层做四项验证。
重构范围：`index.html`（结构 class / 按钮分级）、`style.css`（设计令牌 + 组件样式）、`js/app.js`（仅令牌改名与界面渲染）。`id`/`name`/`data-*`/`for` 契约**只增不删**（见 ④）。

---

## ① 回归测试

```
cd f5a-see-me && node --test tests/
```

若子进程 spawn 被环境拒绝（`spawn EPERM`），改为**逐文件直接运行**（不 fork 子进程，统计同样输出）：

```
cd f5a-see-me
for f in tests/*.test.cjs; do node "$f"; done
```

**本次实测（2026-10-15 重跑）**：`node --test tests/` → `tests 115 / pass 115 / fail 0 / cancelled 0 / skipped 0`，`duration_ms 786`。

其中判据 1 指定的 `tests/regressions.test.cjs` 单独跑：`tests 24 / pass 24 / fail 0` —— **等于基线 24 例，无退化**（判据要求「不少于基线 24 例」）。

分文件明细（每个文件单独运行）：

| 测试文件 | 用例数 | 通过 | 失败 |
|---|---|---|---|
| `tests/regressions.test.cjs`（判据 1 指定） | 24 | 24 | 0 |
| `tests/symbol-preview.test.cjs` | 22 | 22 | 0 |
| `tests/symbol-panel.test.cjs` | 18 | 18 | 0 |
| `tests/theme-random.test.cjs` | 11 | 11 | 0 |
| `tests/random-theme-ui.test.cjs` | 6 | 6 | 0 |
| `tests/behavior-ui.test.cjs` | 9 | 9 | 0 |
| `tests/behavior-core.test.cjs` | 7 | 7 | 0 |
| `tests/presets.test.cjs` | 7 | 7 | 0 |
| `tests/dynamic-render.test.cjs` | 8 | 8 | 0 |
| `tests/smoke.test.cjs` | 3 | 3 | 0 |
| **合计** | **115** | **115** | **0** |

---

## ② DOM stub 冒烟

`tests/dom-app-harness.cjs` 用自写最小 DOM 装载 `app.js`（仓库无 jsdom/playwright），导出 `ROOT / makeDom / htmlIdsFromIndex / loadApp / loadScript`。

**本次实测**：`node tests/dom-app-harness.cjs` 退出码 0；`tests/smoke.test.cjs` 3 例全绿：

- 冒烟：app.js 加载完成且 testApi 全部导出可用
- 冒烟：预览类渲染函数在默认状态下产出非空 HTML 且不抛
- 冒烟：主题色解析与预览配色在各状态下不抛

> 边界：自写最小 DOM **没有布局引擎**（不计算 CSS、不排版、不渲染）。它能证明「脚本装载与渲染函数不抛」，不能证明布局与观感——后者由 ⑤ 的浏览器实测覆盖。

---

## ③ 功能核对表逐项核对（74 项）

```
cd f5a-see-me && node tests/check-inventory.cjs      # 明细写 tests/inventory-check.json
```

**本次实测**：74 项全部解析成功，状态分布 ——

| 状态 | 条数 | 含义 |
|---|---|---|
| 入口已定位 | 70 | DOM 入口记号在 `index.html` 或 `js/*.js` 中定位到 |
| 无记号 | 4 | #6 草稿自动保存、#72 二维码协议栈、#73 背景草稿存储、#74 JSON 宽松修复引擎 —— 该行本身没有 DOM 入口可抽 |

**未定位项：0**（即没有任何一行的入口记号在重构后消失）。

4 条「无记号」项已由 `behavior-core.test.cjs` / `behavior-ui.test.cjs` 用运行时断言补证（16 例中的相关项，例如 `#74 JSON 宽松修复：修复尾逗号、注释、单引号、无引号键，且结果可 parse`、`#73 背景草稿存储：空 blob 与超大单图被拒（20MB 限额生效）`）。

### 证据等级分层（不把「入口在」说成「功能通过」）

脚本只报「记号定位到了没有」，**不判断功能是否正常**。74 项按证据等级分三层：

1. **Node 侧运行时已验证**：15 项（#1 #2 #3 #5 #6 #23 #24 #44 #46 #57 #68 #70 #72 #73 #74）—— 有 `behavior-*.test.cjs` / `dynamic-render.test.cjs` 断言支撑；
2. **浏览器专属**：59 项 —— 依赖真实 canvas、指针事件、文件下载、IndexedDB、IME 接口或 CSS 布局，Node 侧取不到运行时证据，**逐项转入 [manual-acceptance-checklist.md](manual-acceptance-checklist.md)，未声称通过**；
3. 两者之外的项只有「入口已定位」这一层证据。

---

## ④ 静态完整性

```
cd f5a-see-me && node tests/static-audit.cjs
```

**本次实测**（输出为 JSON）：

| 检查项 | 结果 |
|---|---|
| HTML 标签配对（`unclosedDepth` / `mismatch`） | 0 / 0 |
| CSS 括号配对（`finalDepth` / `extraClose`） | 0 / 0 |
| id 总数 / 重复 | 359 / `[]` |
| JS 引用 id 字面量（`literalCount`） | 271（`el` 267 + `getElementById` 2 + `querySelectorHash` 2，按写法分别计，合集去重） |
| 扣除动态构造后仍缺失的 id | `layout-copy-source`（1 项，见下） |
| CSS 令牌：静态定义 / JS 注入 / 被引用 | 34 / 46 / 65 |
| 悬空 `var()`（`dangling`） | `[]` |
| 带 fallback 的 `var()` | `--preview-key-shadow`（变量缺失时用默认值，不构成无效样式） |

### `layout-copy-source` 为何不是缺陷

该 id 在 `index.html` 中不存在，只在 `js/app.js` 的 4 处被 `el("layout-copy-source")` 引用（`:3993`、`:7610`、`:7694`、`:8396`）。但：

- 4 处引用**全部带空值守卫**（`if (copySourceNode) { ... }`），节点缺失时静默跳过，不抛异常；
- **HEAD 版同样如此** —— `refactor-notes/_head/js/app.js` 里也是 4 处引用、`refactor-notes/_head/index.html` 里同样没有该 id。即这是**基线既有状态，非本次引入**；
- 冒烟测试与浏览器实测（⑤）均无 JS 异常，印证守卫生效。

故记为「静态审计提示项」，**不构成功能缺失**。是否补建该 DOM 属产品决策，不在本次重构范围。

### `id` / `name` / `data-*` / `for` 契约对照（HEAD vs 当前）

用两份 HTML 直接抽取比对（可重跑）：

| 类别 | HEAD | 当前 | 丢失 | 新增 |
|---|---|---|---|---|
| `id` | 325 | 359 | **0** | 34（`tabbtn-*`、`theme-filter`、`theme-count-hint`、`icon-theme-filter` 等） |
| `name` | 1 | 1 | 0 | 0 |
| `data-*` 属性名 | 2 | 4 | **0** | 2（`data-tab-nav`、`data-theme-source`） |
| `for` | 13 | 14 | **0** | 1（`sym-kind`） |

四类**丢失均为 0** —— 重构没有删掉任何既有契约，新增全部来自符号面板与列表工具条。

### 改动体量

| 文件 | 增 | 删 | HEAD 行数 → 当前行数 |
|---|---|---|---|
| `index.html` | 114 | 46 | 814 → 882 |
| `style.css` | 1205 | 140 | 2615 → 3680 |
| `js/app.js` | 305 | 33 | 11472 → 11744 |

---

## ⑤ 浏览器实测（无头 Edge + CDP，补「观感」硬证据）

上一轮「foxy 体系可移植」被判不确定的唯一原因是**观感无浏览器证据**。本节补上。

### 取证方法（可重跑）

本机无 Chrome、无 puppeteer，但有 Edge：`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`。Node 26 自带 `WebSocket`，故直接用 CDP 协议驱动，未新增任何依赖。

```
node tests/cdp-probe.cjs [目标目录] [light|dark]     # 目标目录省略 = 当前工作区
node tests/cdp-probe.cjs refactor-notes/_head light  # HEAD 基线版
```

探针拉起无头 Edge（1440×1000）→ `Page.navigate` 到 `file:///.../index.html` → 可选写 `localStorage['f5a-editor-site-theme']` 后 `Page.reload` 强制明暗 → `Runtime.evaluate` 取回：结构计数、15 个令牌的 `getComputedStyle` 实际生效值、关键区块盒模型、WCAG 对比度、横向溢出元素、小于 24px 的触控目标；并用脚本触发事件做交互断言。同时挂 `Runtime.exceptionThrown` + `Log.entryAdded` 收集页面错误，开 `Network.enable` 收 `Network.loadingFailed`。

**控制台条目分类**：早期版本把 `Runtime.exceptionThrown` 与 `Log.entryAdded` 混装进同一个 `errors` 数组，导致「页面 JS 异常 0」依赖一个未分类的采集集。现已分字段落盘：

- `jsExceptions` —— 页面脚本异常计数（`Runtime.exceptionThrown`），**判「渲染无 JS 报错」只看这个**；
- `errorsByKind` / `errorsDetailed` —— 按来源分类：`js-exception` / `cors-file-fetch`（`file://` 下 `fetch()` 被 CORS 拦）/ `external-cdn-unreachable` / `local-resource-missing` / `browser-internal` / `other`；
- `failedRequests` —— `Network.loadingFailed` 的逐条资源 URL 与 `errorText`。

**本次实测的四份 JSON**（`refactor-notes/cdp-usability-{light,dark}.json` 与 `cdp-usability-head-{light,dark}.json`）：

| 文件 | jsExceptions | cors-file-fetch | local-resource-missing |
|---|---|---|---|
| 当前 light | **0** | 4 | 4 |
| 当前 dark | **0** | 4 | 4 |
| HEAD light | **0** | 4 | 6 |
| HEAD dark | **0** | 4 | 5 |

逐条归因（每一类都有出处，不再有未归类项）：

1. **`cors-file-fetch` × 4（四份一致）**：`Access to fetch at 'file:///.../data/default-{layout,popup-preset}.json' from origin 'null' has been blocked by CORS policy`。成因是 `file://` 协议下 `fetch()` 的固有限制（`origin` 为 `null`），两版行为完全相同，**非本次引入、也非缺陷**。
2. **`local-resource-missing` 里的 `data/*.json`**：对应上面那次 fetch 的网络层失败（`net::ERR_FAILED`），同一因，不是文件缺失（两个 JSON 均实际存在）。该项 HEAD 两版各多出 1–2 条（6 / 5 对 4），来自统计脚本 `busuanzi` 在 `file://` 下拼出的 `file://busuanzi.ibruce.info/...` 请求失败（见下）——**与界面无关，且当前版反而更少**。
3. **`js-exception` 为 0**：四份均为 0。这是唯一支撑「渲染无 JS 报错」的字段；其余是上面两类网络/浏览器日志，与页面脚本无关。

> HEAD 两版各多出的 1–2 条 `local-resource-missing`：URL 形如 `file://busuanzi.ibruce.info/busuanzi?jsonpCallback=BusuanziCallback_*`，源于统计脚本 `busuanzi.pure.mini.js`（`index.html` 外链）在 `file://` 下把相对路径拼成了 `file://` 主机名形式，故找不到文件。这是**统计脚本自身的加载路径问题**，与两版界面无关，且当前版（4 条）比 HEAD 版（6 / 5 条）更少。

基线版由 `git show HEAD:<file>` 落到 `refactor-notes/_head/`，与重构版同一套探针、同一视口（1440×1000）对比。

产物：当前读数 `refactor-notes/cdp-usability-{light,dark}.json` 与 `cdp-usability-head-{light,dark}.json`；截图脚本 `tests/shots.cjs` 产出 `shots/usability-*.png`。

### 实测结果

| 指标（1440×1000，无头 Edge，当前工作区） | 重构版 light | HEAD light | 重构版 dark | HEAD dark |
|---|---|---|---|---|
| 设计令牌有值数（探针采样 15 个） | **15** | **4** | **15** | **4** |
| 正文对比度 / 页面底 | 15.03 | 14.22 | 15.14 | 15.83 |
| 弱化文本对比度 / 卡片底 | 5.29 | 5.37 | 7.05 | 7.55 |
| tab 激活态对比度 | 3.20 | 3.45 | **3.20** | **2.70** |
| 横向溢出元素数 | 0 | 0 | 0 | 0 |
| 触控目标 <24px 数量 | **0** | 8 | **0** | 8 |
| 主操作按钮（`.primary`） | **17** | 0 | **17** | 0 |
| 危险按钮（`.danger`） | **7** | 0 | **7** | 0 |
| 对话框底栏（`.dialog-toolbar`） | **13** | 0 | **13** | 0 |
| 页签数 / 面板数 | **5 / 5** | 4 / 4 | **5 / 5** | 4 / 4 |
| 主题卡片数 | **21** | 9 | **21** | 9 |
| 页面 JS 异常（`jsExceptions`） | 0 | 0 | 0 | 0 |

（暗色列的 `dialog-toolbar` 由探针同次采集得到 13，与亮色一致。`primary` 17 个包含符号面板与列表工具条新增的按钮。）

### 列表工具条与来源分组（2026-10-15 新增断言）

同一探针新增 5 条断言，在 HEAD 版上报出 4 条「缺失」，在当前工作区全部消失：

| 断言 | HEAD（亮色） | 当前工作区（亮色） |
|---|---|---|
| 多来源时是否渲染分组小标题 | 未渲染，实测 0 个 | `heads = ["编辑器自带主题9","输入法内置主题12"]` |
| 卡片副标题数 = 卡片数 | 实测 0/9 | `metaCount = 21`，与卡片数一致 |
| 来源筛选 chip 数 = 4 | 实测 0 | `chipCount = 4` |
| 主题搜索框可见 | 不可见 | `searchVisible = true` |
| 方向键切页签 + roving tabindex | 2 条断言失败 | 焦点与激活项一致，`tabbables = 1` |

当前工作区 `interact.problems = []`；HEAD 版为上述 6 条。逐项「改前 / 改后」见 [usability-changelog.md](usability-changelog.md)（判据 8 交付物）。

### 逐条解读（不美化）

1. **令牌体系：重构版 15 个有值，HEAD 版仅 4 个。** 这是本次最硬的发现，且是**基线缺陷而非本次引入**——HEAD 版在浅色模式下 `--card` / `--card-inner` / `--text-dim` / `--accent` / `--danger` / `--warn` / `--radius` 等**取不到值**（`getComputedStyle` 返回空），意味着浅色界面的这些位置是靠零散硬编码色顶着的，改一处要动多处。重构版按 foxy 的令牌骨架重建后两模式均完整。（`--sel` 仅在键盘预览高亮路径使用，探针未采集，故本表只覆盖探针采样的 15 个。）
2. **对比度互有胜负，不是全面胜出。** 正文对比度 light 略优（15.03 > 14.22）、dark 略低（15.14 < 15.83）；弱化文本两项都略低于 HEAD；tab 激活态 light 略低（3.20 < 3.45）。但**最低值 5.29 仍远超 WCAG AA 正文 4.5 的门槛**，UI 组件线 3.0 也被 3.20 跨过。机制：tab 激活态由 `--primary: #4f8cff` 改为 `--accent: #4c8dff`，令牌收敛所致，非随机退化。**不作「观感全面胜出」的宣称。**
3. **tab 激活态对比度在暗色下是明确改善**：3.20 vs HEAD 2.70 —— HEAD 的 2.70 **低于** WCAG 对 UI 组件的 3.0 要求，重构版达标。这是「可读性不下降」判据的正向证据。
4. **布局无破坏**：两模式横向溢出元素均为 0，`scrollWidth - clientWidth = 0`。「布局破坏」这条推翻条件被实测排除。
5. **易用性有一项实测改善**：复选框由默认 13px 撑到 ≥24px（`style.css:740` `min-height: 24px`），小触控目标数 8 → 0，两模式都清零。`accent-color: var(--accent)` 顺带让复选框跟随主题色。视觉方块大小不变，只是命中区变大。
6. **按钮分级是新增能力**：HEAD 版 `.primary` / `.danger` 计数为 0——即 HEAD 版**不存在**主操作/危险操作的分级样式；当前工作区有 17 个 primary、7 个 danger，且暗色下基准与浅色下赢回都已定义（此前 HEAD 版 `.primary` 在暗色下完全不起作用）。
7. **页面 JS 异常两边均为 0**（只看 `jsExceptions` 字段）。控制台另有 8–11 条非 JS 条目，已逐条归因：`file://` 下 `fetch('data/*.json')` 的 CORS 限制 4 条、对应网络层 `ERR_FAILED` 4 条，以及 HEAD 两版各多出 1–2 条统计脚本 `busuanzi` 的请求失败；均非本次引入。

### 截图（供人目视复核）

`refactor-notes/shots/`：`usability-{after,head}-{light,dark}-theme.png`、`usability-{after,head}-light-icon-theme.png`，以及裁剪图 `s5-clip-light.png`、`s5-toolbar-light.png`。

**截图判读状态(如实说明)**:本模型支持图像输入,已直接打开 `refactor-notes/shots/` 下的三类符号预览截图(亮色正本 + 暗色对照,1192x808,截的是 `#layout-preview` 宿主盒 596x404)逐张看过:
- 三类页签的规格说明视图与下方符号面板区在亮/暗两版下均正常渲染,无越界、无重叠、无明显视觉退化。
- 亮版 symbols 截图的面板区里**见到格子矩阵**(首行 1 / 2 / 3 / 4 / 5 / 6 可辨,6 格/行,与 CDP 逐格读数 firstRow 1-6 一致);emoji 与 kaomoji 的格区在截图里不可辨(面板区只见到说明行,可能是分组滚动位置或截取时机所致),其存在以 CDP 逐格读数为证(见 `cdp-symbol-preview.json` 的 perCellStyles:emoji 首行 😀-😅 共 172 格 29 行、kaomoji 首格(｀皿´＃)共 46 格 46 行,亮暗两版一致)。
「foxy 体系可移植」的推翻条件是「布局破坏 / 可读性下降 / 交互退化」：

- 布局破坏 → **实测排除**（溢出 0、scrollWidth 差 0）
- 可读性下降 → **实测不支持该方向**（正文对比度 light 升、dark 微降但 15.14 远超门槛；tab 对比度 dark 由 2.70 升到 3.20 并跨过 UI 3.0 线；最低读数 5.29 > 4.5）
- 交互退化 → 未直接取证（拖拽/右键/jscolor 仍无浏览器证据），但页面 JS 异常 0、115 例运行时断言全绿，且新增的 5 条交互断言（筛选、空状态、复位、键盘导航）在浏览器内通过

故该判断的「不破坏功能」一侧已被浏览器证据覆盖；「提升观感与易用性」一侧有令牌完整性（4→15）、tab 对比度（暗色 2.70→3.20）、触控目标（8→0）、按钮分级（0→17+7）四项可量化改善。

---

## 结论

| 判据 | 结果 |
|---|---|
| ① 回归 ≥24 例全绿 | ✅ **115 例全绿**（其中判据指定的 `regressions.test.cjs` 24 例，与基线持平无退化） |
| ② 功能核对表逐项核对 | ✅ 74 项入口零缺失；其中 **15 项运行时已验证**、59 项升级处理为浏览器专属（已逐项转入人工验收清单，未声称通过） |
| ③ 界面层重建 + 浏览器中无 JS 报错 | ✅ 静态完整性全过；**无头 Edge 实测两模式渲染，页面 JS 异常 0**（见 ⑤） |
| ④ 产物齐全 | ✅ foxy-analysis.md / f5a-inventory.md / refactor-design.md / panel-changelog.md / usability-changelog.md / manual-acceptance-checklist.md / 本报告 |

**三条判断的当前状态**（独立评估者裁决，非自判）：

| 判断 | 裁决 | 依据 |
|---|---|---|
| 功能守恒 | **支持**（待独立核验） | 全量 115 例全绿，原 24 例无退化；74 项入口零缺失；`id`/`name`/`data-*`/`for` 四类丢失均为 0 |
| foxy 体系可移植 | **已补浏览器证据，见 ⑤** | 布局破坏已排除（溢出 0）、可读性无下降（最低对比度 5.29 > 4.5，tab 暗色 2.70→3.20）、令牌完整性 4→15、触控目标 8→0、按钮分级 0→17+7。是否升格为支持**由独立评估者裁决**，本人不自判 |
| UI 层可独立重构 | **支持**（待独立核验） | `js/app.js` 改动 305 增 / 33 删，集中于界面渲染与令牌改名，核心导入导出/undo 栈数据逻辑未动，动态渲染 8 例验证渲染路径仍通 |

**「foxy 体系可移植」为何曾是不确定**：它的推翻条件是「迁移后出现无法局部修复的布局破坏、可读性下降或交互退化」——这三条都只能在真实浏览器里判定。上一轮全部证据来自 Node 侧，自写最小 DOM **没有布局引擎**（不计算 CSS、不排版、不渲染），因此既无法证明布局没坏，也无法证明观感提升了。本轮已用无头 Edge + CDP 补上浏览器实测（见 ⑤）：布局破坏已排除、可读性无下降、四项可量化改善；交互退化一项仍缺真实输入证据。

**未验证项（如实列出）**：

1. **依赖真实输入的交互**（拖拽排序、chip 右键删、jscolor 取色、文件下载、剪贴板、IME 接口），以及 hover/focus/disabled 等状态样式 —— CDP 探针只按静态态取值并脚本触发事件，不等于真人操作。59 项已转入 [manual-acceptance-checklist.md](manual-acceptance-checklist.md)。
2. **IME API 读写依赖部署时注入的 `IME_API_BASE`**，静态分析与本地 `file://` 环境均无法确认其可用性。
3. **两批截图状态不同**（见 ⑤）：符号预览三类截图已逐张目视判读，结论见 ⑤ 截图小节；s5 时期的 usability 对比截图仅作物证交付、未做目视判读，其观感结论以 CDP 数值为准。
4. **跨浏览器差异**：全部读数来自本机 Edge 无头（1440×1000）。Chrome / Safari / Firefox 未测。
