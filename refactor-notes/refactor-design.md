# f5a-see-me 界面重构 · 设计方案（对照 foxy-editor）

依据：[foxy-analysis.md](foxy-analysis.md)（foxy 界面体系分析）、[f5a-inventory.md](f5a-inventory.md)（f5a 功能清点）。

## 0. 定位与硬约束

- **只动界面层**：`style.css` 为主战场；`index.html` 只重排结构、换 class、分组，不改 `id`/`name`/`data-*` 与文本语义；`app.js` 原则上不动，仅当样式需要个别静态容器类而 HTML 不便表达时最小增补。
- **功能守恒**：`tests/regressions.test.cjs` 全绿（≥24 例）+ 74 项核对表全 confirmed 才算完成。
- **品牌**：「小狐狸 see me / Foxy」是 foxy 编辑器的品牌与标题文案，**不迁移**；f5a 保留「fcitx5-android see me」自身品牌。迁移的是界面体系，不是文案。

## 1. 直接迁移（原样或近似原样移植）

| foxy 体系 | 迁移形式 | 理由 |
|---|---|---|
| 设计令牌骨架 `--bg/--bg-soft/--card/--card-inner/--border/--text/--text-dim/--accent/--accent-soft/--danger/--ok/--warn/--err/--radius/--mono`（+`--sel`） | f5a `:root` 全量重建为这套 16 个令牌；f5a 现有 `--panel/--panel-2/--panel-inner/--panel-soft/--panel-deep/--sub/--primary/--macro` 8 个全部映射退役；另保留 f5a 专属 `--topbar-height/--preview-panel-height/--preview-zoom` | foxy 令牌语义清晰（表面层级 bg<bg-soft<card<card-inner）、与组件一一对应；f5a 现状 9 色面板系语义重叠，映射即可无损替换 |
| `html.site-light / site-dark / site-auto` 明暗机制 + `@media (prefers-color-scheme: light)` | 机制原样移植：暗色 `:root` 基准 + 浅色整套覆盖；f5a 现有亮暗覆写（Light 覆盖段）并入统一机制 | foxy 的三态机制已含 localStorage 记忆与系统跟随，f5a 功能等价但实现分散，统一后行为不变 |
| `details.card` 折叠卡片（summary 标题栏 + 内容内边距）+ `.inner-card` 子卡 | 原样迁移样式，f5a 现有 details 卡片改用同款 | f5a 已用 details 折叠（14 个），视觉升级到 foxy 观感零结构改动 |
| 按钮体系：`button/.mini-button` 基准 + `.primary`、`.danger`、`.icon-button`（含 `.icon-button.danger`）、`.icon-only`、`.attention` | 全量迁移 6 变体；f5a 现状按钮样式替换 | f5a 按钮外观现状零散，foxy 体系完整覆盖全部使用场景 |
| 表单紧凑控件：`.mini-input/.mini-select/.mini-range/.num-input/.pt-unit/.mini-label(.check)` | **样式定义迁移,控件不批量套用**(见 panel-changelog §5) | f5a 表单控件密度高（208 个），紧凑控件族正对症 |
| `.form-row(.form-inline)/.form-grid-2` 布局 | 迁移 | 直接用于 s5 面板重组 |
| jscolor 集成 `.color-input` + `.color-adv-card/.color-state-card` 高级颜色子卡 | 迁移（f5a 本就用 jscolor，样式对接） | foxy 注释明示「f5a-see-me 同款点击弹出」，两边同源 |
| 原生 `<dialog>` 三件套（`.dialog-titlebar/.dialog-toolbar/.dialog-body`）+ `.flash-hold` 高亮 + 草稿守卫样式 | 迁移样式 | f5a 17 个 dialog 现状样式零散，统一 |
| `.workbench` 双栏（`.col-main` + `.col-side` 380px，≤980px 竖排 stretch） | 迁移到布局编辑页主区 | f5a 布局页主区结构与 foxy 同源（网格+侧栏），foxy 已解决竖排横向溢出问题（注释中的 flex-start→stretch 教训直接继承） |
| 浮动工具层（撤销/重做 + 回到顶部，滚动接管） | 迁移样式与定位 | f5a 顶栏已是「随页面滚动 + 悬浮接管」同款设计，样式统一 |
| `.tabs/.tab(.active)` 标签页 + `.tabpanel` | 迁移 | f5a 四标签页结构与 foxy 同款 |
| `.toolbar`、`.folder-hint`（黄框警示行）、`.pill`、`code` 样式 | 迁移 | 直接对应 f5a 现有同类元素 |
| 键盘焦点可见性（`:focus-visible` outline） | 迁移 | 易用性提升 |

## 2. 需要扩展（foxy 有基础，f5a 需补齐）

| 项 | 扩展内容 | 落点 |
|---|---|---|
| 间距/字号/阴影/动效令牌 | foxy 未令牌化（分析报告已指出）；f5a 面板是 foxy 的 2 倍多（35 vs ~15），新增 `--space-xs/sm/md/lg`、`--fs-sm/base/lg/title`、`--shadow-dialog`、`--dur-fast` 等少量令牌，只用于本次重构新增的骨架与通用规则，存量选择器不强行替换 | `:root` 新增区 |
| 浅色散点覆盖 | foxy 浅色散点规则约 40 条（按钮/输入框/卡片/对话框/tab/颜色行等逐组件覆盖）；f5a 组件集更大，按 f5a 实际组件清单逐类补齐，**沿用 foxy 的「散点覆盖」模式而非引入主题引擎** | `html.site-light` + `html.site-auto` 媒体查询两节 |
| 内容列几何 `--content-max/--content-pad-x` | foxy 用 1298px/20px 供顶栏、main、浮动工具三方对齐；f5a 现状为 vh/clamp 流式（`clamp(12px,1.8vh,15px)` 字号、92% 宽度顶栏）。f5a 改为中心内容列（`--content-max` 建议 1360px，f5a 面板更宽）+ 保留 f5a 已有的 clamp 响应式字号，两者结合：大屏居中限宽，小屏流式 | `:root` + `main`/`.topbar-main` |
| 键盘预览区样式 | foxy 有整套 `.kb-*` 预览样式（运行时 9 个 `--kb-*` 变量）；f5a 预览区是四标签页共用的顶部预览面板（`--preview-panel-height` 等 3 个专属变量保留），**只迁移观感令牌与按钮/旋钮槽位样式，不迁移 foxy 的 26 色槽位语义** | `.preview-panel` 区 |
| 图标主题/弹出字符两个 f5a 专属标签页 | foxy 无对应页；按迁移后的通用组件体系（details.card/mini-控件/表格行样式）组合搭建，不新增专属大样式块 | 对应 `.tabpanel` |

## 3. 不迁移（明确排除）

| 项 | 理由 |
|---|---|
| foxy 全部 Foxy 语义：26 色槽位、keyTypes、键盘几何常量、`--kb-*` 9 个运行时变量的业务含义 | 属于 foxy 编辑器的数据模型，f5a 有自己的主题色行/按键类型体系，迁移即破坏功能 |
| foxy 品牌（标题「小狐狸 see me」、🦊 图标、仓库链接文案、README 风格脚注） | 品牌不迁移 |
| foxy 顶栏「标题即仓库链接 + 图标按钮组」的具体文案与链接 | f5a 有自己的仓库链接与标题层级，仅迁移布局结构（左标题右按钮组 + 分隔线） |
| foxy 的拖放 chips（定义拖拽排序）样式 | f5a 无同款交互 |
| foxy 预览区 issue 点击定位的具体实现 | f5a 的 JSON 检查面板有自己的定位方式，只迁移 `.flash-hold` 高亮样式 |

## 4. 迁移映射表（f5a 现有令牌 → foxy 目标）

| f5a 现状（s6 全部退役） | foxy 目标 | 备注 |
|---|---|---|
| `--bg: #0f1115` | `--bg: #121316` | 基底略提亮，观感更柔 |
| `--panel: #171a21` | `--card: #202329` | 卡片 |
| `--panel-2: #1d2230` | `--bg-soft: #1a1c20` | 次表面（tab 未选中、hover 基底） |
| `--panel-inner: #10131b` / `--panel-deep: #11151d` | `--card-inner: #262a31` | 内层卡/输入框底；f5a 两个近黑色合并为一个内层色，避免「黑洞」观感 |
| `--panel-soft: #151923` | 并入 `--bg-soft` | 语义重复 |
| `--text: #e8ebf2` | `--text: #e6e8ec` | 微调 |
| `--sub: #9aa4ba` | `--text-dim: #9aa0a8` | 语义更名 |
| `--primary: #4f8cff` | `--accent: #4c8dff` | 语义更名 |
| `--macro: #3f8f6a` | `--ok: #48c26a`（宏相关用 `--ok`） | f5a 专属 `--macro` 退役，宏标识色并入 ok 绿 |
| `--border: #2a3142` | `--border: #34383f` | 提亮，暗色下边界更清 |
| `--ok/--err` 保留语义 | `--ok/--err` + 新增 `--warn/--danger/--sel/--accent-soft/--radius/--mono` | 补齐 foxy 全套 |
| `--topbar-height/--preview-panel-height/--preview-zoom` | 原样保留 | f5a 专属几何，foxy 无对应 |
| 新增 | `--content-max: 1360px`、`--content-pad-x: 20px` | 中心内容列 |
| 新增（少量） | `--space-sm/md/lg`、`--shadow-dialog`、`--dur-fast` | 仅新骨架用 |

浅色令牌整套按 foxy 值迁移：`--bg:#f2f3f5 / --bg-soft:#e8eaed / --card:#fff / --card-inner:#f0f1f4 / --border:#d4d7dd / --text:#1c1e22 / --text-dim:#5f656e / --accent-soft:#d7e6ff`。

## 5. index.html 结构重排（不改 id/绑定）

1. **顶栏**：改为 foxy 的 `.topbar-main`（max-width 居中，左标题右动作组，`.topbar-sep` 分隔）。f5a 现有顶栏控件（配色三态按钮、撤销/重做、仓库链接）原 id 原位保留，只换容器结构与 class。
2. **主区**：`main` 加 `max-width: var(--content-max)` 居中；顶部预览面板保持 sticky 现状（f5a 特有，foxy 无），仅观感升级。
3. **标签页**：`.tabs` 样式迁移；四个 `.tabpanel` id 与切换逻辑不动。
4. **面板分组**：14 个 details + 4 个 section 全部套 `.card`/`.panel` 观感；布局编辑页主区改 `.workbench` 双栏（如现状已是左右结构则只换 class）。
5. **对话框**：17 个 dialog 统一 `.dialog-titlebar/.dialog-toolbar/.dialog-body` 结构 class（内部控件不动）。
6. **表单**:`.mini-*/.num-input/.pt-unit` 紧凑控件族**样式已定义**(style.css 中 mini-input/mini-select/mini-range/mini-label 均有规则),但**不批量套用到现有静态控件**——动态控件自带自有 class、且静态侧硬编码底色与动态侧令牌不同,并排会撕裂(偏离记录见 panel-changelog.md §5)。
7. 不动：全部 `id`、`name`、`data-*`、`for`、动态渲染容器（theme-color-rows 等）、script 引入顺序与版本参数。

## 6. style.css 重组（s6 执行顺序）

1. 头部重建 `:root`（16 令牌 + f5a 专属 5 + 少量新骨架令牌）。
2. 明暗机制节（`html.site-light` + auto 媒体查询 + 浅色散点覆盖，按 f5a 组件清单逐类补齐）。
3. 基础元素（body/code/a/[hidden]/滚动条）。
4. 顶栏 / main 内容列 / tabs / workbench。
5. 卡片与表单通用件（details.card/inner-card/form-row/按钮族/mini-控件族/color-input/folder-hint/pill）。
6. 预览面板（f5a 专属，观感升级）。
7. 对话框三件套 + flash-hold + 各 dialog 专属残留样式。
8. 布局网格/主题色行/弹出字符/图标主题四个业务区的样式（这些是 f5a 大头，**以「替换色值与表面令牌、保留几何与交互样式」为原则逐块改写**，不重排选择器逻辑）。
9. 响应式断点整理（保留 f5a 现有断点，新增 980px workbench 竖排规则）。
10. 全文将旧令牌名（--panel/--sub/--primary/--macro 等）替换为新令牌后，删除旧定义。

## 7. 逐面板视觉验收要点（s7 核对用）

- 顶栏：窄屏换行不重叠；配色三态按钮 active 态可见；撤销/重做禁用态可读。
- 预览面板：sticky 不挡内容；缩放旋钮槽位对齐。
- 四个标签页：active/未选中对比度（浅色下未选中浅灰底）。
- 每个 details 卡片：summary 标题栏分隔线、展开态内容内边距。
- 每个 dialog：标题栏/工具栏/正文三层分明；`flash-hold` 高亮可见。
- 主题色行/按键行等动态行：行 hover、选中、危险按钮态。
- 浅色/暗色/site-auto 三态各过一遍；`prefers-color-scheme: light` 下 auto 生效。
- 980px 以下 workbench 竖排无横向溢出；超宽网格只在自身 wrap 内横滚。

## 8. 风险与回退

- **class 替换漏网**：控件 208 个，s5 逐面板核对；核对表兜底。
- **浅色散点覆盖不全**：foxy 模式是「发现一处补一处」；s7 三态过堂专门检查，缺失即补。
- **选择器权重变化导致旧覆写失效**：f5a 现状有零散 `!important` 与覆写；改写时保留原权重关系，发现退化对照 git diff 回退单块。
- **回退**：git 工作区干净起步，任何一步退化可 `git diff` 定位、`git checkout -- <file>` 单文件回退；不做 commit 直至全部验证通过（提交需用户明确要求）。
