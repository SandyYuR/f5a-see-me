# foxy-editor 结构化分析报告

> 分析对象：`D:\GitHub\foxy\foxy-editor`（只读，未做任何修改）
> 材料：`index.html`（481 行）、`style.css`（1482 行）、`js/` 13 个文件（只看模块划分）、`AGENT.md`、`docs/README.md`、`docs/history/project-history.md`（入口索引）。
> 交互模式部分含从 HTML 结构与 js 模块名的**推断**，均注明依据。

## 0. 项目一句话

Foxy 键盘布局的纯前端、零构建、零运行时依赖可视化编辑器：`index.html` 可直接 `file://` 打开；唯一状态源 `FE.state`，数据变更走 `mutate(fn)`（快照+撤销）；编辑「布局 / 按键定义 / 动作宏 / 弹出菜单 / 主题 / 符号面板」六类文档，每类都有「图形编辑 + 实时同步的 JSON 文本编辑」双视图。

---

## 1. 设计令牌全表

### 1.1 静态令牌（`:root`，style.css:5-26，共 **18 个**）

**颜色（14）**

| 变量 | 值（暗色基准） | 浅色覆盖（site-light / site-auto + prefers-color-scheme: light） |
|---|---|---|
| `--bg` | `#121316` | `#f2f3f5` |
| `--bg-soft` | `#1a1c20` | `#e8eaed` |
| `--card` | `#202329` | `#ffffff` |
| `--card-inner` | `#262a31` | `#f0f1f4` |
| `--border` | `#34383f` | `#d4d7dd` |
| `--text` | `#e6e8ec` | `#1c1e22` |
| `--text-dim` | `#9aa0a8` | `#5f656e` |
| `--accent` | `#4c8dff` | （不覆盖，同值） |
| `--accent-soft` | `#2c3a55` | `#d7e6ff` |
| `--danger` | `#e2564f` | 不覆盖 |
| `--ok` | `#48c26a` | 不覆盖 |
| `--warn` | `#e2a33f` | 不覆盖 |
| `--err` | `#ee6b64` | 不覆盖 |
| `--sel` | `#ffb020` | 不覆盖 |

**圆角（1）**：`--radius: 10px`

**字体（1）**：`--mono: ui-monospace, SFMono-Regular, Consolas, "Courier New", monospace`

**布局几何（2）**：`--content-max: 1298px`；`--content-pad-x: 20px`（`@media (max-width:640px)` 下收窄为 `10px`）

**主题机制**：暗色是 `:root` 基准；浅色整套覆盖写在 `html.site-light` 与 `@media (prefers-color-scheme: light)` 下的 `html.site-auto`（JS 在 `<html>` 上切 `site-light/site-dark/site-auto` 三类，localStorage 记选择）。浅色只覆盖上表 8 个变量，其余靠逐组件显式浅色规则（`html.site-light …`）补齐——这是该项目刻意模式：不用变量覆盖全部，防"变量没盖到就穿帮"。

### 1.2 运行时令牌（app.js 按主题 JSON 写入，CSS 以 `var(--x, fallback)` 消费，共 **9 个**）

`--kb-bg`（键盘容器底色）、`--kb-inset`（容器内描边）、`--kb-key-bg`、`--kb-key-fg`、`--kb-key-bg-fn`（功能键底）、`--kb-key-fg-fn`、`--kb-key-bg-action`、`--kb-key-shadow`、`--kb-icon-active`。写入点：`.kb` 容器与 `#layout-sections`；未导入主题时变量不存在、`var()` 回落到与旧版逐像素一致的写死值。

### 1.3 总数

- 静态自定义属性：**18**（`:root` 唯一来源；浅色变体只是覆盖、无新名）
- 加运行时键盘变量合计：**27**（去重后；另有间距/字号/阴影**没有**做成令牌，全部写死在组件规则里，见 §5「需要扩展」）
- 阴影：仅 2 处成体系（`dialog` 的 `0 18px 60px rgba(0,0,0,.55)`、浮动按钮 `0 2px 10px rgba(0,0,0,.45)`），未令牌化。动效：仅 `transition 0.06–0.2s` 与 3 个 `@keyframes flash-hold*`，未令牌化。

---

## 2. 页面骨架结构清单（index.html 顶层，共 **8 个区块**）

```
body
├─ 1. header.topbar          品牌标题+仓库链接 / 网站明暗三态按钮组 / 撤销重做（.topbar-main > .topbar-title + .topbar-actions）
└─ main（max-width: var(--content-max) 居中）
   ├─ 2. details.panel.preview-panel   布局预览：preview-toolbar（layout-tabs + 状态开关行 + 几何旋钮行）→ .preview-stage > #preview-kb → .preview-legend → #preview-meta
   ├─ 3. div.tabs[role=tablist]        6 个 tab：布局编辑/按键定义/动作与宏｜弹出菜单｜主题｜符号面板
   ├─ 4. section#tab-layout.tabpanel   .workbench > .col-main > 3×details.card（布局与文件操作 / 布局编辑 / 布局 JSON）
   ├─ 5. section#tab-keys.tabpanel     1×details.card（按键定义列表 + 搜索/新建工具条）
   ├─ 6. section#tab-actions.tabpanel  2×details.card（动作定义 / 宏）
   ├─ 7. section#tab-popup.tabpanel    4×details.card（弹出菜单文件 / 弹出效果预览 / schemas / JSON）
   ├─ 8. section#tab-theme.tabpanel    5×details.card（主题文件 / 校验 / 槽位26色 / keyTypes / JSON）
   └─ 9. section#tab-symbols.tabpanel  4×details.card（符号文件 / 面板选项 / 分组与条目 / JSON）
（main 外）
├─ 10. div.float-layer > .float-rail   浮动工具：右上撤销/重做、右下回到顶部（滚出顶栏后出现）
└─ 11. footer.footnote                格式依据说明
```

说明：按「顶层语义区块」口径为 **8**（topbar / preview-panel / tabs / 6 个 tabpanel 合并为 1 类计则为 8；逐 tabpanel 拆开数为 13）。上面树状图给出 11 个具名节点，可数可核。对话框（`dialog.editor-dialog`）由 JS 动态创建，不在静态骨架内。

---

## 3. 组件体系清单（**15 类**）

| # | 组件 | 关键 class | 样式/状态模式 |
|---|---|---|---|
| 1 | 按钮 | `button` / `.mini-button`，变体 `.primary` / `.danger` / `.attention` / `.icon-button` / `.icon-only` | 基准 `#2c3037`+1px border；hover 换 `#363b44`+亮 border；`:disabled` 用 `opacity:.45`+`not-allowed`；primary=accent 实心；danger=透明底红字红边、hover 加深红底；attention=warn 实心黄（需用户动手的引导按钮） |
| 2 | 输入框 | `.mini-input`（`.wide`）、`.num-input`（等宽右对齐+`.pt-unit` 单位） | 深底 `#17191d`+border；`:focus` 用 `outline:1px solid var(--accent)`；placeholder 靠 UA；浅色下显式白底规则覆盖 |
| 3 | 下拉 | `.mini-select`（`.wide`） | 与 mini-input 同款盒模型；宽度修饰类控制 |
| 4 | 滑杆 | `.mini-range` | 固定 110px、`accent-color: var(--accent)` 原生美化 |
| 5 | 复选/标签行 | `label.check`、`.mini-label` | 行内 flex+`white-space:nowrap`，字号 12px 次要色 |
| 6 | 折叠面板/卡片 | `details.card`+`summary`、`.panel`、`.inner-card` | 原生 `<details>` 折叠；summary 充标题栏（背景 `#23262c`+下边框），`[open]` 切换边框；子内容靠 `> *:not(summary)` 加 margin；inner-card 是二级嵌套变体（圆角 8px） |
| 7 | 标签页 | `.tabs` > `.tab`（`.active`）+ `.tabpanel` | 上圆角 tab、active=卡片底色+加粗；`aria-selected/aria-controls` 齐全；功能分组用 `margin-left:22px` 间距（tab-popup/tab-theme）而非样式差异 |
| 8 | 徽章/pill | `.pill`（`.active`）、`.cand-idx`、`.kb-badge-lp/-hold/-popup`、`.color-state-dot` | 999px 圆角 pill 做预览布局切换；active=accent 实心；角标是预览私有标注（写死色不跟主题，注释明确声明） |
| 9 | 状态/提示文本 | `.status`（`.ok/.error/.warn/.dim`）、`.st-*`、`.folder-hint`（黄框警示条） | 12.5px 次要色+语义色修饰类；警示条=warn 左边框 4px+12% 透明度底 |
| 10 | JSON 编辑器 | `textarea.json-editor`（`.small`）+ `.json-issues`（`.warn/.error/.ok`） | 等宽、min-height 320px、`resize:vertical`；问题面板默认 `display:none`，按级别类显示+左边框 3px 语义色+10% 透明度底 |
| 11 | 对话框 | `dialog.editor-dialog`（`.wide`）、`.dialog-titlebar/.dialog-body/.dialog-toolbar`、FE.uiAlert/uiConfirm/uiPrompt | 原生 `<dialog showModal>`；`::backdrop` 半透明+blur(2px)；标题栏/工具栏分色分层；宽 560px（wide 720px），≤640px 近全屏 |
| 12 | 键盘预览 | `.kb`（`.kb-dark/.kb-light`）> `.kb-section > .kb-row > .kb-slot > .kb-key`（`.kt-function/.kt-action`）、`.kb-grid`、`.kb-label/.kb-hint*/.kb-icon` | 色值全部 `var(--kb-*, fallback)` 双通道；键文字强制单行 ellipsis；`.pressed` 禁滤镜（颜色由 JS 写）；`.kb-key-broken` 红虚线、`.kb-key-sel` 黄实线 |
| 13 | 编辑 chips/网格 | `.chip`（`.chip-fn/.chip-sel/.chip-broken/.dragging/.drop-before`）、`.chip-add`、`.chip-box.drop-target`、`.gedit*`（grid 画布+自绘滚动条 `.gedit-scrollbar/.gedit-thumb`）、`.drag-ghost` | 拖放三态：dragging 降透明度 / drop-target accent 边框+7% 底 / drop-before 左侧 3px 色条；拖动替身大阴影；网格画布隐藏原生滚动条、自绘轨道+滑块 |
| 14 | 列表项 | `.def-item`（`.def-row-click/.def-collapsible`）、`.def-summary`+`.def-summary-caret`、`.macro-step`（可拖拽排序）、`.usage-item`（`.usage-jump`）、`.picker-item`（`.active`）+`.picker-group`（sticky 分组头） | 整行可点=hover 换底+border 提亮；可折叠项 caret 旋转 90°；跳转项 hover accent 边框；sticky 分组头是长列表导航模式 |
| 15 | 浮动工具层 | `.float-layer/.float-rail`、`.float-top-right/.float-bottom-right` | fixed 全屏层 `pointer-events:none`，子按钮重开；用 `left: calc(100% - pad + 8px)` 贴**内容列外缘**而非视口缘；≤1638px 退回贴视口；`[hidden]` 显隐由 JS 按 scrollTop 控制 |

---

## 4. 交互模式清单（**8 条**）

1. **面板折叠**：全站用原生 `<details>/<summary>`（preview-panel、每个 card、inner-card、def-collapsible），无手风琴互斥逻辑；`app.js` 对 preview panel 监听 `toggle` 事件在展开时补渲染（依据：index.html 结构 + style.css `.card[open]` 规则 + app.js `pd.addEventListener('toggle',…)`）。
2. **Tab 切换**：`.tabs` 按钮按 `data-tab` 对应 `.tabpanel.active` 显隐（`display:none/block`）；`aria-selected/aria-controls` 同步；切 tab 时 `syncPreviewPanelChrome()` 按页隐藏/显示预览工具栏的对应组（依据：index.html:122-129、注释行 46-48）。
3. **对话框流程**：原生 `<dialog showModal()>`；`close()` 只作内部关闭，用户主动关闭（遮罩点击/Esc/取消按钮）必须走 `requestClose()`，经 `opts.onBeforeClose` 草稿改动检测（`FE.snapshotGuard`）拦截；跳转类动作用 `leaveThen(fn)`；浏览器原生 alert/confirm/prompt 被 `FE.uiAlert/uiConfirm/uiPrompt` 自绘对话框替代（依据：key-dialog.js:16-89、AGENT.md §7）。
4. **撤销/重做**：顶栏右上 + 浮动层右上两处入口，状态双向同步（`updateUndoButtons`）；快捷键 Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z，输入框聚焦时放行（依据：index.html:33-34,452-455；app.js:6507-6512、5640-5653）。快照由 `mutate(fn)` 统一产生；连续取色用 `beginGesture()/endGesture()` 合并为一次历史（AGENT.md §7）。
5. **拖放**：行 chips 与网格键均用 Pointer Events 自实现拖动（`touch-action:none` 接管、`.drag-ghost` 跟随替身、`.drop-target/.drop-before/.gedit-drop` 落点高亮）；宏步骤用 `.macro-step-handle` 抓手拖动排序；超宽网格配自绘横向滚动条（滑块 `touch-action:none` 与键的拖动分离）（依据：style.css .chip.dragging/.drag-ghost/.gedit-scrollbar 及注释；模块名 app.js）。
6. **点击定位/跳转**：校验 issue、使用数（usage）条目可点击跳到对应按键/定义，落点挂 `.flash-hold` 持续光晕（蓝=新建/定位、红=出错、黄=选中键），直到用户下一次 pointerdown/keydown 才摘除（`holdFlash` 一次性监听）（依据：style.css:421-462 长注释、`.issue-locatable`、`.usage-jump`）。
7. **快捷键**：全局仅撤销/重做一组（Ctrl+Z/Y/Shift+Z），`e.target` 为 input/textarea/select 时跳过（app.js:6507-6512）。无其它全局快捷键；列表行用 `tabindex`+`keydown` 做键盘可达（app.js:5080-5086）。
8. **预览状态旋钮**：复选框组（Shift/组字/ASCII/停用/分体/横屏/边框/描边/滑动提示）+滑杆/数字框实时改预览建模参数，只影响预览不写入数据文件；深浅槽位下拉与主题页槽位是同一状态双向联动（`setPreviewSlot`）（依据：index.html:49-105 注释）。**推断**：实时联动靠各 input 的 change/input 监听重渲染，模块入口在 app.js。

---

## 5. 可迁移性结论（迁入方：f5a-see-me，含二维码导入、剪贴板、符号面板等额外面板）

### 可直接迁移

- **令牌骨架**：`:root` 18 个静态令牌 + 浅色变体"只盖 8 色、其余逐组件显式规则"的模式，以及"暗色为基准、`<html>` 类名切三态 + localStorage"的机制，整套可照搬。
- **组件双名模式**（`.mini-button/.mini-input/.mini-select/.mini-label` + `.wide/.primary/.danger/.attention` 修饰类）——修饰类语义完整，新功能直接复用。
- **原生 `<details>` 卡片体系**（card/inner-card/summary 标题栏）与**原生 `<dialog>` + requestClose/onBeforeClose 草稿守卫**的对话框协议。
- **`.status` + `.json-issues` 语义色提示条**、`.def-toolbar`（搜索框内嵌 ✕ 清空按钮 + 新建组）列表工具条模式。
- **浮动工具层"贴内容列外缘"的定位法**（float-layer/rail + left:calc 公式 + 1638px 断点回退）。
- **拖放视觉三态**（dragging/drop-target/drop-before + drag-ghost）与自绘滚动条思路。
- 交互模式 1/2/3/4/6/7 全部（折叠、tab、对话框守卫、撤销重做双入口+快捷键、点击定位 flash-hold、键盘可达）。

### 需要扩展

- **令牌覆盖面**：间距、字号、阴影、动效目前全部写死，无 `--space-*/--fs-*/--shadow-*/--dur-*`。面板增多后（二维码/剪贴板/符号面板并排出现）建议先补这四组令牌再迁，否则改一处要扫全文件。
- **浅色覆盖模式的可维护性**：散点式 `html.site-light .xxx` 规则已 40+ 条，且有多处"权重赢回"补丁（注释自承 button.primary/.pill.active 同病）。新面板每加一个组件就要补浅色档；建议迁移时顺手把组件底色全部收进变量，浅色只覆盖变量。
- **键盘预览变量通道**（`--kb-*` + fallback 写死值）：f5a 的数据模型不同，fallback 色值与 kt-function/kt-action 分类要按 f5a 键型重映射；`applyKeyColors` 的行内写入协议可保留思路、不能照抄。
- **tab 分组**：现有"间距分组"（margin-left:22px）在 6 tab 时已勉强，加面板后建议改为分组容器或滚动 tab 条；≤640px 下 tab 已 `flex:1` 铺满，更多 tab 需要横向滚动策略。
- **每文档"图形+JSON 双视图 + 导入/导出/示例"四件套卡片模板**可扩展复用到二维码/剪贴板面板，但二维码需要新增 canvas/图像预览组件（现无此类），剪贴板需要新增"列表项+批量操作"模式（现有 def-item 仅单项操作）。

### 不适用 / 不应迁移

- **一切 Foxy 语义**：26 色槽位字段、keyTypes 三类、foxy-render-spec 对齐的预览旋钮（高度%/圆角/间隙 dp）、`#AARRGGBB`→CSS `#RRGGBBAA` 转换、kb-text-editor 触控板预览、符号面板两列 ScrollView 仿真——这些是 Foxy App 渲染契约的镜像，f5a 只应借鉴交互方式（AGENT.md 第 10 行亦明确：不要用 f5a 格式替换 Foxy 格式，反之同理）。
- **写死色值的"编辑器私有标注"**（角标三色 #8fd0ff/#ffd28f/#9fe0b0 等）：语义要重定义为 f5a 自己的图例。
- **自绘滚动条与 `.gedit` 网格的几何常量**（614px/1228px、MAX_GRID_CELLS=4000）是 Foxy 竖屏口径，不可带数值迁移。
- **测试桩体系**（dom-stub 的 buildSkeleton 与源码级正则断言钉住写死色值）与具体 DOM 结构强耦合，迁移时需按新骨架重建。

---

## 附：js 模块划分（13 文件，未逐行读）

`data.js`（常量/默认数据）、`default-profile.js`（内置默认方案）、`examples-bundle.js`（打包示例）、`app.js`（主状态 FE.state/mutate/渲染/快捷键/浮动工具）、`folder-import.js`（文件夹多文件导入）、`key-dialog.js`（按键编辑对话框+对话框协议）、`macro-editor.js`、`popup-editor.js`、`theme-editor.js`、`color-source.js`（颜色链路）、`symbol-editor.js`、`symbol-preview.js`、`jscolor/jscolor.js`（第三方取色器，唯一"依赖"，本地打包）。加载顺序在 index.html:465-477 显式排列，跨文件调用用 `if (FE.xxx)` 保护（AGENT.md §4）。
