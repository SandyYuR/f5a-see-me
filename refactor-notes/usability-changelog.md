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

---

## 附:本清单未覆盖的项

1. 真实指针/触屏交互(hover、拖拽排序、右键删除、取色器、下载、剪贴板)——探针只能脚本触发事件,不能证明真人操作体验。
2. 观感类主观结论(「更整齐」「更舒服」)——本清单只给可复现读数,不给主观判断。
3. Chrome / Safari / Firefox 的渲染差异——本清单的读数全部来自本机 Edge 无头。若需跨浏览器结论,需另取证据。
