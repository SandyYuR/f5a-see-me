# f5a-see-me 易用性优化清单(判据 8 交付物)

本清单逐项写「改前 / 改后」两栏,并给出来源。**改前与改后由同一个探针 `tests/cdp-probe.cjs` 采集**,保证口径一致:

| 代号 | 采集对象 | 命令 |
|---|---|---|
| `HEAD-L` | 重构前快照 `refactor-notes/_head/`(亮色) | `node tests/cdp-probe.cjs refactor-notes/_head light` |
| `HEAD-D` | 重构前快照(暗色) | `node tests/cdp-probe.cjs refactor-notes/_head dark` |
| `AFTER-L` | 当前工作区(亮色) | `node tests/cdp-probe.cjs . light` |
| `AFTER-D` | 当前工作区(暗色) | `node tests/cdp-probe.cjs . dark` |

读数文件:改后 `refactor-notes/cdp-usability-{light,dark}.json`;改前 `refactor-notes/cdp-usability-head-{light,dark}.json`。
探针退出码均为 0;`AFTER-L` / `AFTER-D` 的 `interact.problems` 均为 `[]`。

> 范围声明:本清单只覆盖**能由探针或源码静态取证的**改动。依赖真实指针/触屏的交互(拖拽排序、右键删除、取色器、文件下载、剪贴板、输入法接口)不在下表,另见 [manual-acceptance-checklist.md](manual-acceptance-checklist.md)。

---

## 1. 主题列表:来源分组小标题

| | |
|---|---|
| **改前** | 21 张主题卡片挤在一个平铺网格里,没有任何来源标识。`AFTER` 探针新增的断言在 HEAD 上报「多来源时未渲染分组小标题,实测 0 个」——`HEAD-L.interact.steps["分组小标题与卡片副标题"].heads = []`。 |
| **改后** | 按「编辑器自带 → 输入法内置 → 自定义」固定顺序分组,每组带小标题与条数。`AFTER-L` 读到 `heads = ["编辑器自带主题9", "输入法内置主题12"]`(两个分组),`groups = [{source:"local",n:9},{source:"app",n:12}]`。 |
| **来源** | 源码 `js/app.js:1192-1200`(`themeSourceOrder`)、`js/app.js:1175-1179`(`themeGroupLabel`)、`js/app.js:1252-1258`(分组渲染);样式 `style.css:3635-3662`;读数 `cdp-usability-light.json → interact.steps["分组小标题与卡片副标题"]`。 |

## 2. 主题列表:卡片来源/明暗副标题

| | |
|---|---|
| **改前** | 0 条副标题。`HEAD-L` 报「卡片副标题数应等于卡片数,实测 0/9」,`metaCount = 0`,`metaSample = []`。 |
| **改后** | 每张卡片显示「来源 · 明暗」。`AFTER-L` 的 `metaCount = 21`,与卡片数 21 相等;`metaSample = ["编辑器自带 · 浅色","编辑器自带 · 深色","编辑器自带 · 浅色"]`。 |
| **来源** | `js/app.js:1165-1169`(`themeCardMetaText`)、`js/app.js:1228`(卡片模板);样式 `style.css:3675`;读数同上。 |

## 3. 主题列表:按名称搜索

| | |
|---|---|
| **改前** | 无搜索框。`HEAD-L` 报「主题搜索框不可见」,`主题工具条.searchVisible = false`。 |
| **改后** | 工具条内有搜索框(占位「按名称筛主题,如 dark / 长日」)。`AFTER-L` 的 `searchVisible = true`;探针填入不可能匹配串后 `cards = 0` 且出现空状态,点击「清除筛选」后 `cards` 回到 `21`、`filterValue = ""`。 |
| **来源** | `index.html:190`(`#theme-filter`);`js/app.js:1293-1300`(input 绑定)、`js/app.js:1182-1189`(`filterThemeCatalog`);读数 `interact.steps["主题列表(无匹配)"]`、`["主题列表(点清除筛选后)"]`。 |

## 4. 主题列表:按来源筛选

| | |
|---|---|
| **改前** | 0 个来源筛选控件。`HEAD-L` 报「来源筛选 chip 应为 4 个,实测 0」,`chipCount = 0`。 |
| **改后** | 4 枚胶囊按钮(全部 / 输入法内置 / 编辑器自带 / 自定义),选中态走 `aria-pressed`。`AFTER-L` 的 `chipCount = 4`;点「输入法内置」后 `cards = 12`、`aria-pressed = "true"`、提示为「匹配 12 / 21 个主题」。 |
| **来源** | `index.html:192-197`(`.chip-group` 与 4 个 `data-theme-source`);`js/app.js:1287-1309`(`syncThemeFilterChips` / `bindThemeFilters`);样式 `style.css:3591-3621`;读数 `interact.steps["主题列表(输入法内置)"]`。 |

## 5. 主题列表:空状态与一键复位

| | |
|---|---|
| **改前** | 无匹配时列表直接空白,没有提示也没有恢复入口。`HEAD-L` 的 `主题列表(全部).hint = null`(根本没有计数提示位)。 |
| **改后** | 无匹配时显示「没有匹配的主题。」并附「清除筛选」按钮,点击可同时复位搜索词与来源筛选。`AFTER-L` 的 `hasEmpty = true`、`emptyText = "没有匹配的主题。清除筛选"`;点复位后 `input.value === ""` 且 `cards = 21`。 |
| **来源** | `js/app.js:1246-1251`(空状态渲染)、`js/app.js:1274-1285`(`bindThemeFilterReset`);样式 `style.css:3623`(`.list-empty`);读数 `interact.steps["主题列表(无匹配)"]`。 |

## 6. 主题列表:结果计数提示

| | |
|---|---|
| **改前** | 无计数位(`hint = null`)。用户不知道「总共有多少 / 筛掉了多少」。 |
| **改后** | 工具条右侧常驻计数:未筛选时「21 个主题」,筛选后「匹配 12 / 21 个主题」。 |
| **来源** | `js/app.js:1233-1239`(`syncThemeListCountHint`);`index.html:197`(`#theme-count-hint`);读数 `interact.steps["主题列表(全部)"].hint = "21 个主题"`。 |

## 7. 图标主题页:搜索与计数

| | |
|---|---|
| **改前** | 无工具条。`index.html` HEAD 版在该页没有 `.list-toolbar`(见 `diff refactor-notes/_head/index.html index.html`:在 `337a350,353` 处新增)。 |
| **改后** | 该页同样有搜索框与计数位;`AFTER-L` 的 `图标主题筛选` 步骤:`before = 4`,`after = 0`,`hasEmpty = true`。 |
| **来源** | `index.html:350-353`(`#icon-theme-filter`、`#icon-theme-count-hint`);`js/app.js:10138`;读数 `interact.steps["图标主题筛选"]`。 |

## 8. 页签键盘导航(roving tabindex + 方向键)

| | |
|---|---|
| **改前** | 页签不是 `role="tab"`,没有 `tabindex` 管理,方向键无效。`HEAD-L` 报「ArrowRight 未切到第 2 个页签」与「roving tabindex 应只有 1 个 tabindex=0,实测 0」;`方向键导航 = {active:"tab-icon-theme", focused:"tab-layout"}`(焦点与激活项脱节)。 |
| **改后** | 页签加 `role="tab"` + `id="tabbtn-*"` + `tabindex` 轮转(当前项 `0`、其余 `-1`),面板回指 `aria-labelledby`;方向键可切换。`AFTER-L` 的 `方向键导航 = {active:"tab-theme", focused:"tab-theme"}`(焦点与激活项一致),`tabbables.length === 1`,`interact.problems = []`。 |
| **来源** | `index.html:69-74`(`data-tab-nav`、`role="tab"`、`tabindex`)、各 panel 的 `aria-labelledby`;读数 `interact.steps["方向键导航"]`。 |

## 9. 小于 24px 的触控目标

| | |
|---|---|
| **改前** | 8 个高度 13px 的复选框(全部是布局预览工具条与分体模式那些开关):`pt-border` / `pt-stroke` / `pt-hints` / `pt-composing` / `pt-split` / `pt-gboard-style` / `pt-align-halves` / `layout-split-mode`。`HEAD-L.smallTargets` 与 `HEAD-D.smallTargets` 长度均为 8。 |
| **改后** | 两模式均为 0 个。`AFTER-L.smallTargets = []`、`AFTER-D.smallTargets = []`。 |
| **来源** | `style.css:740` 附近(复选框命中区撑到 ≥24px,视觉方块不变);读数 `data.smallTargets`。 |

## 10. 对话框按钮分级(主操作 / 危险操作)

| | |
|---|---|
| **改前** | 「保存 / 删除 / 取消」外观完全一致。`HEAD-L.meta.primaryBtns = 0`、`dangerBtns = 0`;`HEAD-D.meta.dialogToolbar = 0`(底栏根本没样式钩子);`危险按钮文案.labels = []`。 |
| **改后** | `AFTER-L.meta.primaryBtns = 18(本轮新增「生成随机主题」主按钮,写清单时为 17)`、`dangerBtns = 7`、`dialogToolbar = 13`。危险按钮文案实测分布:`删除本组 ×62`(符号面板动态行)、`清除 ×2`、`🗑 ×1`、`删除当前主题`、`删除当前图标主题`、`删除按键`、`清除裁剪` 各 1。 |
| **来源** | `index.html`(静态分级,如 `layout-key-save.primary`、`layout-key-delete.danger`);`refactor-notes/panel-changelog.md §1`;读数 `data.meta`、`interact.steps["危险按钮文案"]`。 |

## 11. 页签与面板数量(新增符号面板入口)

| | |
|---|---|
| **改前** | 4 个页签 / 4 个面板:布局编辑、主题编辑、弹出字符、图标主题。`HEAD-L.meta = {tabs:4, panels:4}`。 |
| **改后** | 5 个页签 / 5 个面板,新增「符号面板」。`AFTER-L.meta = {tabs:5, panels:5}`;`页签数.labels = ["布局编辑","主题编辑","弹出字符","图标主题","符号面板"]`。逐个点开后 5 个面板 `panelActive = true` 且高度均 > 0。 |
| **来源** | `index.html:375` 起(`#tab-symbols`);读数 `interact.steps["页签数"]` 与各 `切页签 *`。 |

## 12. 设计令牌可用性

| | |
|---|---|
| **改前** | 探针采样的 15 个令牌中只有 4 个有值(`--bg`、`--border`、`--text`、`--ok`),其余 11 个为空串——写 `var(--danger)` 之类等于没写。 |
| **改后** | 15 个全部有值:`--bg:#f2f3f5`、`--bg-soft:#e8eaed`、`--card:#ffffff`、`--card-inner:#f0f1f4`、`--border:#d4d7dd`、`--text:#1c1e22`、`--text-dim:#5f656e`、`--accent:#4c8dff`、`--danger:#e2564f`、`--ok:#48c26a`、`--warn:#e2a33f`、`--radius:10px`、`--content-max:1360px`、`--space-md:12px`、`--fs-base:14px`。 |
| **来源** | `style.css` `:root` 段;读数 `data.tokens` 两版对比。 |

## 13. 对比度(非全面胜出,如实记录)

| 对 | 改前(HEAD-L) | 改后(AFTER-L) | 变化 |
|---|---|---|---|
| 正文文本 / 页面底 | 14.22 | 15.03 | ↑ |
| 弱化文本 / 卡片底 | 5.37 | 5.29 | ↓ 0.08 |
| 页签激活态 / 页签底 | 3.45 | 3.20 | ↓ 0.25 |

暗色下页签激活态由 **2.70 → 3.20**(↑),跨过 WCAG UI 3.0 线。

**降低项的机制**(不是随手改的)`:style.css` 中改后为 `.tab.active { background: var(--accent); color:#fff }`,改前为 `background: var(--primary)`,而改前的 `--primary: #4f8cff` 比改后的 `--accent: #4c8dff` 略深。即令牌从 `primary` 收敛到 `accent` 所致。

**判断**:三项中两项下降但绝对值仍远高于 4.5(文本)与 3.0(UI 组件)门槛,不构成可读性退化。

## 14. 键盘顶部工具栏预览（对齐 App KawaiiBar 与状态区）

| | |
|---|---|
| **改前** | 布局预览只画按键与可选辅助栏；App 键盘正上方的工具栏（KeyboardPreviewUi.kt:649-711 + ToolbarMetrics.kt）与 toolbar_toggle 升起的状态区（StatusAreaWindow.kt）在 f5a 里完全看不到,预览与真机观感脱节。 |
| **改后** | 预览卡片顶部按 App 真实结构画出工具栏一行:左 toolbar_toggle（三横点,system.toolbar_toggle） + 中间默认 6 键（撤销/重做/文本编辑/浮动键盘/剪贴板/亮色·暗色主题） + 右 hide_keyboard（下箭头,system.hide_keyboard）。新控件 #pt-kb-toolbar 与 #pt-kb-toolbar-status（「状态区」）随 pt-split 一并写入 f5a-editor-preview-split。勾选「状态区」后按 StatusAreaWindow 的语义替换键盘区内容而不改预览高度(键盘行仍留在 DOM 里当高度基准,visibility:hidden 仍参与布局;状态区叠在其上方并裁剪收口)。开关前后卡片外框尺寸与工具栏位置零位移,状态区条目比按键少,下方留白是正常的,画出 4 列面板（48 逻辑 px 圆底 + 图标 + 12px 标签,含固定末尾的 input_method_options）。 |
| **几何依据** | 行高 40dp、按钮足迹 44dp、图标 20/22dp、圆角 12dp、间距 3dp（ToolbarMetrics.kt）；状态区条目高 96dp、圆 48dp、标签 12dp（StatusAreaEntryUi.kt）。工具栏宽度与键盘一致（min(100%,--preview-keyboard-max-width)）,380px 窄屏仍为 8 键且无溢出（按钮被 flex-shrink 压缩）。 |
| **配色依据** | 由 app.js 注入:barColor（工具栏底）/altKeyTextColor（图标）/accentKeyBackgroundColor（激活）/强调色 25% 透明（文字按钮激活底）/keyboardColor（状态区底）/keyBackgroundColor + keyTextColor（状态区圆与标签）/genericActiveBackgroundColor + genericActiveForegroundColor（状态区激活）,依据 ToolButton.kt:132-135、:212-229 与 StatusAreaEntryUi.kt。keyBorder 开启时工具栏与状态区底透明（与 App fakeKawaiiBar.backgroundColor 一致）。 |
| **实现** | 新文件 js/toolbar-preview.js（389 行）:SVG 只走 CSS mask-image（单色可染色）或 img（自带实色）,不 innerHTML 内联。js/app.js 新增 resolveToolbarPreviewColors / previewToolbarPxPerDp / toolbarPreviewIconFor / renderKeyboardToolbarPreviewHtml / renderKeyboardStatusAreaPreviewHtml,并让 renderLayoutPreview 在工具栏出现时把 --preview-top-bar-height 记为 0px（避免与真机预留重复留白。状态区展开改用 .kb-tb-status-stage / .kb-tb-status-underlay / .kb-tb-status-overlay 三层固定高度容器(style.css),键盘行不再从 DOM 消失,预览高度只由未展开时的键盘行决定）。站点浅色主题的 `html.site-light button:not(.layout-chip)`（style.css:2755-2798，特异性 (0,2,2)）会盖过纯类选择器，故工具栏按钮选择器改用 `#layout-preview .kb-tb-btn` 提升特异性，并显式重置 hover/focus 背景；否则浅色站点主题下按钮会渲染成白底药丸。 |
| **证据** | 状态区固定高度回归:light 与 dark 下开关前后 rootY/rootH 均为 213/452,deltaH=0、回切后 deltaH=0、jsExceptions 0;截图 kb-status-height-before/after-light.png 与 -dark.png;一次性探针 tests/tb-probe5-row.cjs。截图 refactor-notes/shots/kb-tb-light.png、kb-tb-dark.png、kb-tb-status-light.png、kb-tb-status-dark.png、kb-tb-narrow-380.png、kb-tb-zoom3-light.png、kb-tb-row-light.png / kb-tb-row-dark.png（站点明/暗主题下按钮均为透明底，白底药丸已修）；探针 tests/cdp-probe.cjs（light:jsExceptions 0、problems 空）。13 个测试脚本全过,tests/static-audit.json 更新（id 365→369）。 |
| **未覆盖** | 真实指针 hover/点击反馈——探针只验证静态几何与计算样式。 |
## 15. 浅色站点主题「白底白字」按钮族对比度修复(标签页 / 筛选 chip / 新增行按钮)

| | |
|---|---|
| **改前** | 站点浅色主题(`html.site-light`,以及 `html.site-auto` + `prefers-color-scheme:light`)下,三类配白字的控件被 `html.site-light button:not(.layout-chip) { background:#ffffff }`(style.css:2755-2797,特异性 (0,2,2))盖成白底,而它们自身的 `color:#fff` 仍然生效 → 文字与底同色、**完全隐形**:1 选中标签页 `.tab.active`(0,2,0);2 主题来源筛选 chip `.chip[aria-pressed="true"]`(0,2,0);3 布局编辑「新增行」按钮 `.add-row-button`(0,1,0)。暗色主题正常(深底),所以只在浅色下暴露。根因与作者已修的 `.primary`/`.danger` 同类(:2752-2754 注释自述),只是这三处漏写赢回规则。 |
| **改后** | 三条各自把蓝底赢回并显式覆盖 `:hover`(否则悬停掉回浅灰底、白字再次隐形):`.tab.active` → (0,3,1)/(0,4,1);`.chip[aria-pressed="true"]` → (0,3,0)/(0,4,0);`button.add-row-button` → (0,2,2)/(0,3,2)。`site-auto` 各在 `@media (prefers-color-scheme: light)` 内双写。style.css:2830-2853。 |
| **证据** | 一次性计算样式探针(tests/contrast-probe.cjs,已删):light 改前 chip/add-row 均为 `bg rgb(255,255,255) + color rgb(255,255,255)`;改后均为 `bg rgb(76,141,255) + color rgb(255,255,255)`。dark 改前改后均 accent,无回归。截图 refactor-notes/shots/chipfix-light.png(选中 chip「全部」蓝底白字)、tabfix-light.png 与 tabfix-dark.png(选中「布局编辑」蓝底白字;tabfix-dark 与修复前字节完全相同)。 |
| **未覆盖** | 真人指针的 hover/focus-visible 观感——只静态验证了计算样式与 :hover 规则命中。 |


---

## 附:本清单未覆盖的项

1. 真实指针/触屏交互(hover、拖拽排序、右键删除、取色器、下载、剪贴板)——探针只能脚本触发事件,不能证明真人操作体验。
2. 观感类主观结论(「更整齐」「更舒服」)——本清单只给可复现读数,不给主观判断。
3. Chrome / Safari / Firefox 的渲染差异——本清单的读数全部来自本机 Edge 无头。若需跨浏览器结论,需另取证据。
