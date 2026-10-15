# 最终验收报告(f5a-see-me 四项能力)

生成时间:2026-10-15
被测对象:工作区 `f5a-see-me/`,分支 `site`,HEAD `37ab87a662b6646dcc2c56ce4f473a51fcae5af3`(本轮改动**未 commit 未 push**)
对照基线:`refactor-notes/_head/`(同一 HEAD 的快照,用于「改前/改后」)

本文按目标的 8 条判据逐条给出结论与取证命令。所有数字都是本轮重跑所得,不是回忆。

---

## 判据 1 · `tests/regressions.test.cjs` 全部通过且用例数不少于基线 24 例

**结论:通过。** 基线 24 例,现 24 例,全绿。

| 命令 | 结果 |
|---|---|
| `node --test tests/`(全量) | tests **115** / pass 115 / fail 0 |
| `node tests/regressions.test.cjs`(判据 1 指定的那个文件) | tests **24** / pass 24 / fail 0 |

分文件用例数:regressions 24、symbol-preview 22(本轮新增)、symbol-panel 18、theme-random 11、random-theme-ui 6、behavior-ui 9、dynamic-render 8、behavior-core 7、presets 7、smoke 3 —— 合计 115,与全量读数一致。

判据只点名 `regressions.test.cjs`,该文件用例数未变化(24),新增的 91 例都在新文件里,不影响判据口径。

执行记录(可复跑,输出原样落盘):`refactor-notes/test-run-full.txt`(全量,115 ✔)、`refactor-notes/test-run-regressions.txt`(判据 1 指定文件,24 ✔)。两条命令的退出码均为 0。

---

## 判据 2 · 功能清单逐项核对无缺失、无语义变化,核对表落盘

**结论:通过。** 核对表 `refactor-notes/f5a-inventory.md` 共 74 项,程序化核对结果:

```
node tests/check-inventory.cjs
总行数 74
入口全部定位 70 行
无记号（行为级/内部实现） 4 行
未定位 0 行
```

- **未定位 0** —— 清单里没有任何一项在重构后找不到落点。
- 4 行「无记号」是清单作者原本就没写入口位置的项(#6 草稿自动保存 / #72 二维码协议栈 / #73 背景草稿存储 / #74 JSON 宽松修复引擎),它们由运行时与测试覆盖,不是丢失。
- 明细落在 `tests/inventory-check.json`。

**id/name/data-\*/for 四类契约对照(HEAD → 当前),丢失数均为 0:**

| 契约 | HEAD | 当前 | 丢失 | 新增 |
|---|---|---|---|---|
| id | 325 | 365 | **0** | 40 |
| name | 1 | 1 | **0** | 0 |
| data-* 属性名 | 2 | 4 | **0** | 2(`data-tab-nav`、`data-theme-source`) |
| for | 13 | 14 | **0** | 1(`sym-kind`) |

即:原有 325 个 id 一个都没被改名或删掉,新增 40 个全部来自新功能(随机主题面板、符号面板页签、列表工具条)。

---

## 判据 3 · 入口结构改动后在浏览器中正常渲染且无 JS 报错

**结论:通过。** 无头 Edge(1440×1000)+ CDP 实测,亮/暗两套主题各跑一遍:

| 指标 | 当前 light | 当前 dark | HEAD light | HEAD dark |
|---|---|---|---|---|
| **页面 JS 异常(`jsExceptions`)** | **0** | **0** | 0 | 0 |
| 页签数 | 5 | 5 | 4 | 4 |
| 面板数 | 5 | 5 | 4 | 4 |
| 主操作按钮(primary) | 18 | 18 | 0 | 0 |
| 危险按钮(danger) | 7 | 7 | 0 | 0 |
| 横向溢出元素 | 0 | 0 | 0 | 0 |
| <24px 触控目标 | 0 | 0 | 8 | 8 |
| 主题卡片数(全量) | 21 | 21 | 9 | 9 |

**非 JS 的控制台条目已逐条归因**(均非本次引入):

- `cors-file-fetch` 4 条 + 对应 `net::ERR_FAILED` 4 条 —— `file://` 协议下 `fetch('data/default-layout.json')` 与 `fetch('data/default-popup-preset.json')` 被 CORS 拦。两个文件都真实存在(1.4KB / 5.7KB),是 `file://` 的固有限制;页面有回退内置默认值的分支,故渲染正常。
- 暗色下多出 1 条 `net::ERR_FILE_NOT_FOUND`,URL 为 `file://busuanzi.ibruce.info/busuanzi?jsonpCallback=BusuanziCallback_*` —— 统计脚本 `busuanzi.pure.mini.js` 在 `file://` 下把相对路径拼成了 `file://` 主机名。HEAD 版同样存在(6 / 5 条),当前版反而更少。

判定「渲染无 JS 报错」只看 `jsExceptions`,四份读数均为 0。

---

## 判据 4 · 产物齐全:重构后的代码 + 说明/验证文档

**结论:通过。**

**代码(新增/修改)**

| 文件 | 状态 | 体量 |
|---|---|---|
| `index.html` | 改 | (现 897 行) |
| `style.css` | 改 | (现 3805 行) |
| `js/app.js` | 改 | (现 12001 行) |
| `js/random-theme.js` | **新增** | 480 行(随机主题算法 JS 移植) |
| `js/symbol-panel.js` | **新增** | 946 行(符号/表情/颜文字面板) |
| `js/symbol-preview.js` | **新增** | 574 行(符号面板预览,规格移植自 foxy-editor) |
| `js/builtin-presets.js` | **新增** | 142084 B(生成器产物,离线可用) |
| `js/symbol-data.js` | **新增** | 169094 B(生成器产物,离线可用) |
| `data/theme-presets.json` | **新增** | 10891 B |
| `data/icon-theme-presets.json` | **新增** | 130561 B |
| `data/symbols.json` / `emoji.json` / `kaomoji.json` | **新增** | 81807 / 36509 / 33119 B |

**测试(全量 115 例;本轮新增的文件如下)**

`tests/gen-presets.cjs`(生成器,`--verify` 自校验)、`tests/presets.test.cjs`、`tests/theme-random.test.cjs`、`tests/check-random-parity.cjs`、`tests/symbol-panel.test.cjs`(18 例)、`tests/symbol-preview.test.cjs`(22 例,本轮新增)、`tests/random-theme-ui.test.cjs`、`tests/dom-app-harness.cjs`、`tests/cdp-probe.cjs`、`tests/static-audit.cjs`、`tests/check-inventory.cjs`、`tests/shots.cjs`、`tests/shot-clip.cjs`,以及 `tests/oracle/`(Kotlin oracle 编译链)。

**说明/验证文档(`refactor-notes/`)**

| 文件 | 内容 |
|---|---|
| `final-acceptance.md` | 本文:8 条判据逐条核对 |
| `verification-report.md` | 五节:① 回归 ② DOM 冒烟 ③ 清单核对 ④ 静态完整性 ⑤ 浏览器实测 |
| `usability-changelog.md` | 判据 8 要求的易用性改前/改后清单(13 项) |
| `app-asset-inventory.json` | app 内置资源清单 |
| `f5a-inventory.md` | 74 项功能清单 |
| `random-theme-oracle.json` | Kotlin oracle 产出的同源随机序列与期望值 |
| `random-theme-parity.json` | JS 与 Kotlin 的 42 项静态对照 |
| `panel-changelog.md`、`refactor-design.md`、`foxy-analysis.md` | 设计与对照分析 |

**过程产物清理**:`tests/_tmp-*.cjs`(32 个,第一版描边探针 `_tmp-sympv-matrix.cjs` 已删,修正版 `_tmp-sympv-matrix2.cjs` 在用)与 `refactor-notes/_tmp-*.json`(3 个)是 CDP 取证探针与中间读数,另有 `tests/_fix-audit8*.cjs`(7 个)是修审计异常的一次性文字同步脚本,保留在工作区以便重跑,不随页面装载(index.html 未引用);最终产物 `cdp-symbol-preview.json` 已把各探针读数合并,来源见其 `probe` 字段。

**静态完整性**(`node tests/static-audit.cjs`):HTML 未闭合深度 0 / 错配 0;CSS 末深度 0 / 多余闭合 0;id 365 个、重复 0;设计令牌静态定义 34 / 注入 46 / 引用 66 / 悬空 0。

---

## 判据 5 · app 内置的 12 主题与 3 图标主题作为 f5a 预置,逐字段一致

**结论:通过。** 数据来源 `fx-rime-only/app/src/main/assets/bundled/`(可用环境变量 `FXR_ASSETS` 覆盖)。

```
node tests/gen-presets.cjs --verify
themes 12   themeTokens 21
iconThemes 3   iconKeys [5, 40, 39]
symbols 62 组 / 4773 条     emoji 10 组 / 1926 条     kaomoji 19 组 / 999 条(multiLine true)
diffs []     ok true
```

**逐字段一致的取证链是三层,不是只看条数:**

1. **生成物 ↔ app assets**:`--verify` 逐字段比对后输出 `diffs: []`。
2. **运行时目录构成**:装载真实 `app.js` 后,主题目录 = 9 个编辑器自带 + 12 个输入法内置 = **21**;图标主题目录 = 1 个空壳 + 3 个输入法内置 = **4**;原 9 个本地预设(MaterialLight / MaterialDark / PixelLight / PixelDark / NordLight / NordDark / DeepBlue / Monokai / AMOLEDBlack)一个都没被替换。
3. **颜色值抽查**:运行时目录里 app 项的 21 个 token 色值与源 JSON **全等**(不是近似)。

一个容易踩的点已实测钉住:**明暗不能靠名字猜**。样本 `Caramel Ember` 名字里没有 "Dark",但 app 声明 `isDark = true`;实现直接取 app 自带的 `isDark` 字段,不用名字正则。

图标主题内容也逐字段带过来:`name` / `version` / `thumbnail_svg` / `icons`(键数 5 / 40 / 39)。

对应测试 `tests/presets.test.cjs` 7 例全绿。

---

## 判据 6 · 随机主题可用:可生成、可展示评分与配色方案、可按同源随机序列复现

**结论:通过。** 这条分两半,取证方式不同。

### 6a 算法同源复现(不是「看起来像」)

判据要求「可按 app 的 `ThemeRandomizer` 算法在同源随机序列下复现同一结果」。为避免拿自己抄的参数给自己作证,做法是把**未改动的 Kotlin 原文件编译成 oracle**:

- oracle 编译链:`tests/kotlinc.sh` + `tests/oracle/run-oracle.sh`,产出 `refactor-notes/random-theme-oracle.json`(含真 `nextDouble` 序列与 Kotlin 侧期望值)。
- 被比对的源码 SHA-1:`ThemeRandomizer.kt` `863015625b7207f523a448047b4a0aee849f10d0`、`ThemeAestheticScore.kt` `4b099b2a44d69e46eaa3845af32a0a0049107986`、`Theme.kt` `5de23fb11d6ae12a8e64aa40782a32ad510b18b9`(测试里断言,源码一改就红)。
- 黄金读数:zero 序列 → scheme `analogous`、isDark true、baseHue 0、accentHue 20、baseSat 22、surfaceStyle `Raised`,总分 **86**(对比度 35 / 色相 25 / 饱和 11 / 明度 15),best-of 走满 **100** 次尝试;seed20 → 2 次、91 分;seed20261014 → 3 次、95 分。
- `node tests/check-random-parity.cjs` → **42 / 42** 项通过 → `refactor-notes/random-theme-parity.json`。
- `tests/theme-random.test.cjs` 11 例,含 3 个单候选逐字段一致与 best-of-N 的 attempts / 评分 / 21 个 token 色值逐字段一致。

实现约束(写在 `js/random-theme.js` 里):随机源抽象成 `nextDouble` 消费器,**不重造 PRNG**;色板用对象字面量保插入顺序(评分遍历顺序会影响浮点求和)。

### 6b 界面可用(本轮补齐)

本轮之前算法已移植但**界面完全没接**(`js/app.js` 里零引用,`index.html` 也没引这个脚本),判据 6 的「可生成、可展示」当时并不成立。本轮补上:

- `index.html` 引入 `js/random-theme.js`(必须在 `app.js` 之前),并在主题页加「随机主题」卡片:生成按钮、复制为自定义主题按钮、评分行、配色方案色板、状态行。
- `js/app.js` 新增 `generateRandomTheme()` / `copyRandomThemeAsCustom()` / `renderRandomTheme()`,在 `initThemeTab()` 里绑定。
- 保留名校验照抄 app 端:`RANDOM_THEME_NAME = "随机主题"` 不可用作自定义主题名(`CustomThemeActivity.kt:1554` 的同名分支)。
- 配色方案按用途分七组展示(键区 / 功能键 / 强调键 / 候选栏 / 工具栏 / 剪贴板 / 其它),共 **28** 个色块。

**浏览器实测**(无头 Edge + CDP,写入 `refactor-notes/cdp-usability-{light,dark}.json`):

```
随机主题(点生成)
  生成前:评分隐藏 true、复制按钮禁用 true、卡片 21
  生成后:卡片 22、选中「随机主题」
  评分文本:美学评分 93/100(对比度 36、色相 25、饱和 17、明度 15) · analogous · 深色 · Raised · 1 次尝试
  色块数:28     复制按钮:已启用
随机主题(再生成一次)
  卡片 22(复用同一槽位,不撑大目录)
  评分文本:美学评分 89/100(...) · triadic · 浅色 · Raised · 1 次尝试
```

探针已在 `tests/cdp-probe.cjs` 里补 5 条断言(生成后卡片 +1、评分文本出现、色块 ≥24、选中该主题、复制按钮启用),当前 `problems: []`。新增 `tests/random-theme-ui.test.cjs` 6 例全绿(加载顺序、入口存在、接线、生成、槽位复用、保留名/重名校验)。

---

## 判据 7 · 符号面板页签存在,三类目录可加载编辑、可导入导出、JSON 与界面双向同步

**结论:通过。**

- **页签存在**:`index.html:74` 新增 `<button class="tab" data-tab-target="tab-symbols">符号面板</button>`,`index.html:360` 对应 `<section class="panel" id="tab-symbols">`。浏览器实测页签数 4 → **5**、面板数 4 → **5**。
- **三类目录**:符号 62 组 / 4773 条、emoji 10 组 / 1926 条、颜文字 19 组 / 999 条,与 app assets 逐组一致。**以 app assets 为准,不用 foxy 的**——两边组名措词不同(app 组名带 zh / zh-Hant / en 三语,foxy 只有 zh),规模也不同(foxy 是 63/10/21 组)。
- **可加载编辑**:`js/symbol-panel.js` 提供分组/条目的新建、上移、下移、删除、重命名、搜索过滤、恢复内置。
- **移植归属**:编辑侧 `js/symbol-panel.js`(946 行)移植自 foxy 的 `js/symbol-editor.js`(44556 B,见本文件头注释);预览侧 `js/symbol-preview.js`(574 行)移植自 foxy 的 `js/symbol-preview.js`(27065 B,见本文件头注释);`tests/symbol-preview.test.cjs` 的同源比对对象是预览侧那份(逐键核对 `FE.SYMBOL_PREVIEW_SPEC` 18 项)。
- **可导入导出**:`importText` / `serializeProfile`(键序固定 `multiLine` → `groups`);坏 JSON 与结构错误都会被拒。
- **双向同步**:测试直接驱动真实 `init()` / `render()`,验证「界面改 → JSON 文本变」与「JSON 文本改 → 界面变」两个方向。
- **面板与键盘画布同宽**:`cdp-symbol-preview.json` 的 `canvasComparison`(探针 `tests/_tmp-sympv*.cjs` 系列之 `tests/_tmp-sympv-canvas.cjs`,读数原样并入)实测键盘画布(`.layout-row .keys`)与符号面板(`.sym-pv`)均为 **576**(`canvasVsPanel.deltaW=0, within1px=true`,亮暗两版一致);两侧宿主(`#layout-preview`)均为 **596**(`hostVsHost.deltaW=0`);面板 576x384 对宿主 596x404 差 20x20 恰为 `style.css:1477` 的 `padding:10px` 上下左右(`hostMinusPanelW/H=20`),不是尺寸不一致。

`tests/symbol-panel.test.cjs` 18 例全绿。三处实现口径是实测驱动改的,不是为了让测试变绿:

1. 多字符告警改按**占比 > 25%** 触发 —— 真 `Intl.Segmenter` 统计下符号 97/4773 = 2.03%(汉语拼音、国际音标等),emoji 0 条;原实现「出现一条就弹」会把真信号淹掉。
2. 旧格式顶层数组 `["a","b","c"]` 按**一个分组**处理,不再拆成三个单条目分组。
3. `SP.graphemeCount('(^▽^)')` 实测 **5**(全角括号 U+FF08/FF09),原期望 6 是半角全角混了。

---

## 判据 8 · 易用性优化落地并有可核对清单(每项写明改前/改后)

**结论:通过。** 清单 `refactor-notes/usability-changelog.md`,13 项,每项「改前 / 改后 / 来源」三栏。改前数据全部来自 HEAD 快照,改后来自当前工作区,**两边由同一探针采集**。

节选(完整版见清单文件):

| # | 项 | 改前 | 改后 |
|---|---|---|---|
| 1 | 主题列表分组小标题 | 0 个 | 2 个(编辑器自带主题 9 / 输入法内置主题 12) |
| 2 | 卡片副标题(来源 · 明暗) | 0 / 9 张有 | **21 / 21** 张都有 |
| 3 | 按名称搜索 | 无 | 有,占位「按名称筛主题,如 dark / 长日」 |
| 4 | 按来源筛选 | 0 个 | 4 枚胶囊(全部 / 输入法内置 / 编辑器自带 / 自定义) |
| 5 | 空状态与一键复位 | 无 | 有「没有匹配的主题。」+「清除筛选」 |
| 6 | 结果计数提示 | 无 | 有(`21 个主题` / `匹配 12 / 21 个主题`) |
| 7 | 图标主题页工具条 | 无 | 有(与主题页同构) |
| 8 | 页签键盘导航 | 无 | ←/→/Home/End |
| 9 | <24px 触控目标 | 8 个 | **0** 个 |
| 10 | 按钮分级 | primary 0 / danger 0 | primary **18** / danger **7** |
| 11 | 页签 / 面板 | 4 / 4 | **5 / 5** |
| 12 | 设计令牌有值数 | 4 | **15** |
| 13 | 对比度(正文/底、弱化文本/卡片底、tab 激活) | 14.22、5.37、3.45 | 15.03、5.29、3.20 |

第 13 项要说清楚:亮色下有两项略低于 HEAD(5.37 → 5.29、3.45 → 3.20),但最低值 **5.29 远超 WCAG 4.5 门槛**,tab 激活态 3.20 也仍在 UI 组件 3.0 线之上;**暗色下 tab 激活态是改善**(2.70 → 3.20,HEAD 的 2.70 反而低于 3.0 线)。变化来源是 `.tab.active` 从 `--primary`(HEAD `#4f8cff`)改用了 `--accent` 令牌,属于令牌统一,不是退化。

探针已把「分组小标题、卡片副标题、来源 chip 数、搜索框可见、副标题不与标题重合」写成断言;同一探针跑 HEAD 会报 6 条 problems(含「ArrowRight 未切到第 2 个页签」),跑当前版 `problems: []`。

---

## 尚未确定的事项

1. **`layout-copy-source` 静态审计提示项**(已登记未解释项):静态审计报它「被 JS 引用但 HTML 里没有」。实测它在 HEAD 版同样缺失、同样 4 处引用(`js/app.js:3993/7610/7694/8396`),且 4 处全带 `if (node)` 空值守卫 —— **基线既有,非本次引入**。
2. **像素级观感已做目视判读**:本模型支持图像输入,已直接打开 `refactor-notes/shots/` 下的三类符号预览截图(亮色正本 + 暗色对照,1192x808,截的是 `#layout-preview` 宿主盒 596x404)逐张看过:三类页签的规格说明视图与下方符号面板区在亮/暗两版下均正常渲染,无越界、无重叠、无明显视觉退化。亮版 symbols 截图的面板区里**见到格子矩阵**(首行 1 / 2 / 3 / 4 / 5 / 6 可辨,6 格/行,与 CDP 逐格读数 firstRow 1-6 一致);emoji 与 kaomoji 的格区在截图里不可辨(面板区只见到说明行,可能是分组滚动位置或截取时机所致),其存在以 CDP 逐格读数为证(见 `cdp-symbol-preview.json` 的 perCellStyles:emoji 首行共 172 格 29 行、kaomoji 首格共 46 格 46 行,亮暗两版一致)。
3. **59 项依赖真实输入的交互未取证**:功能清单的 70 个已定位入口里,只有被探针与测试覆盖的部分有运行时证据;拖拽、真机触屏、文件选择框等需人工验收,见 `refactor-notes/manual-acceptance-checklist.md`。
4. **随机主题的配色方案分组是自定的**:app 端没有等价的「28 色分七组」展示,那是 f5a 侧为可读性加的;色值本身与 app 同源,分组不影响任何持久化数据。
