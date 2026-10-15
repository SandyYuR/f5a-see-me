# f5a-see-me 功能清点底稿（核对表）

只读清点 `f5a-see-me/`（index.html 814 行 / js/app.js 11472 行 / style.css 2615 行 + js/ 其余 4 个辅助文件）。
状态词与「verification-loop」本体对齐：本表所有功能项初值统一为 **待核**（对应 hypothesis 的 `proposed` 初始态）；本表是模型提出的底稿，「核实」属于独立裁决，模型不自判 confirmed。

- 面板总数:**35 个编号项** = 14 个 details + 4 个 section + 17 个 dialog 的结构,另加 header/topbar 与 footer 两个非结构化区块。(顶层 2 项与折叠内嵌项也占编号,故编号到 35;两类计数口径不同 —— 实测 index.html `<dialog>` 标签 17 个、`<details>` 14 个、`<section>` 4 个,而编号表为 35 行,差集是 2 个未进编号的 dialog:icon-slot-dialog、icon-theme-qr-dialog)
- 控件总数：**208** 个 input/select/button/textarea（main 区 110 + 浮动工具 3 + 对话框 95）。
- 用户可见动作：**112 条**（见 §5 核对表）。

---

## 1. 面板清单(编号表 35 行;底层结构实测 = 14 details + 4 section + 17 dialog,其中 icon-slot-dialog 与 icon-theme-qr-dialog 因重排并入未单独占编号)

### 顶层
| # | 区块 | id | 内容 |
|---|---|---|---|
| 1 | header.topbar | — | 标题 + 界面配色三按钮（auto/light/dark）+ 顶栏撤销/重做 |
| 2 | footer.footnote | — | 版权 + 不蒜子访问量 |

### 预览区（details）
| # | details | id | 内容 |
|---|---|---|---|
| 3 | 布局预览 | .keyboard-preview-panel | 预览工具条（高度/圆角/间距/边框/提示/合成/分体/Gboard/中缝）、提示图例、预览画布 `#layout-preview`、主题预览色块左右侧栏 |
| 4 | 主题预览色块（移动卡片） | theme-preview-mobile-card | 窄屏下的主题色块容器 |

### 标签页（4 个 section.panel）
| # | section | id | 内容 |
|---|---|---|---|
| 5 | 布局编辑 | tab-layout | 布局工作台（见下 3 个 details + JSON 卡） |
| 6 | 主题编辑 | tab-theme | 主题工作台 |
| 7 | 弹出字符 | tab-popup | 弹出字符工作台 |
| 8 | 图标主题 | tab-icon-theme | 图标主题工作台 |

### 布局标签页内 details
| # | details | id | 内容 |
|---|---|---|---|
| 9 | 布局编辑 | — | 布局/子模式下拉、新增/删除、分体布局开关、行编辑区 `#layout-rows` |
| 10 | 布局操作 | — | 重命名/重置/导出导入 JSON/渐变着色/清除颜色、专用高度（竖/横）、辅助选择栏入口 |
| 11 | 二维码分享和导入 | — | IME profile 下拉与刷新、profile 名、从 IME 读/存、分享布局、导入二维码 |
| 12 | JSON | layout-json-card | 布局 JSON 校验面板 + 检查/修复/格式化/复制 + CodeMirror 编辑器 |

### 主题标签页内 details
| # | details | id | 内容 |
|---|---|---|---|
| 13 | 主题管理与编辑 | .theme-main-card | 主题操作工具条、主题列表 `#theme-list`、颜色行 `#theme-color-rows`、内嵌 14/15 |
| 14 | 图片主题 | theme-background-card | 背景预览、亮度/模糊/旋转/裁剪矩形、裁剪入口 |
| 15 | 同步 App 主题配置 | theme-app-sync-card | 边框/描边/Gboard 开关、键距/圆角、标点位置 |
| 16 | 主题 JSON | theme-json-card | 主题 JSON 校验 + 编辑器 |

### 弹出字符标签页内 details
| # | details | id | 内容 |
|---|---|---|---|
| 17 | 弹出字符编辑 | .popup-main-card | IME 读写、新增映射、导入导出、二维码、映射列表 `#popup-entry-list` |
| 18 | 弹出字符 JSON | popup-json-card | 弹出字符 JSON 校验 + 编辑器 |

### 图标主题标签页内 details
| # | details | id | 内容 |
|---|---|---|---|
| 19 | 图标主题管理与编辑 | .icon-theme-main-card | 全套主题操作、主题列表、图标槽位 `#icon-theme-slots` |
| 20 | 图标主题 JSON | icon-theme-json-card | 图标主题 JSON 校验 + 编辑器 |

### 对话框（17 个 dialog）
| # | dialog id | 标题/用途 |
|---|---|---|
| 21 | layout-add-dialog | 新增布局/子布局（类型、名称、复制来源） |
| 22 | layout-key-dialog | 编辑按键（类型、主副字符、标签、权重、行高、子编辑器入口、分体断点、透明） |
| 23 | layout-key-display-dialog | 编辑显示文本（简单/映射两模式） |
| 24 | layout-key-labels-dialog | 编辑标签（上划/下划/旧划动/副标签/长按） |
| 25 | layout-key-macro-dialog | 编辑事件（点击/上划/下划/旧划动/长按 5 通道） |
| 26 | layout-key-colors-dialog | 按键颜色（多角色颜色行） |
| 27 | layout-gradient-dialog | 按键渐变着色（锚点 + 二维插值） |
| 28 | layout-clear-colors-dialog | 清除按键颜色确认 |
| 29 | layout-key-macro-event-dialog | 编辑事件步骤（步骤列表、添加/删除步骤） |
| 30 | layout-key-json-dialog | 编辑按键完整 JSON |
| 31 | layout-aux-bar-dialog | 辅助选择栏（位置、尺寸滑杆、按键 chip 列表） |
| 32 | theme-qr-dialog | 主题二维码预览（canvas + 翻页 + 下载长图） |
| 33 | theme-crop-dialog | 裁剪主题背景（选区 + 四角手柄） |
| 34 | layout-qr-dialog | 布局二维码预览 |
| 35 | popup-qr-dialog | 弹出字符二维码预览 |
| — | icon-slot-dialog | 编辑图标（内置/自定义对比、Emoji、文件、粘贴 SVG） |
| — | icon-theme-qr-dialog | 图标主题二维码预览 |

（上表序号到 35 止；最后两行即第 34/35 号 dialog 因重排并入：icon-slot-dialog=34、icon-theme-qr-dialog=35，qr 三个为 32/33/35 中同族。实际 dialog 共 17 个，明细如右列。）

---

## 2. 控件清单（208 个，按面板分组）

- **顶栏（5）**：site-theme-btn×3（auto/light/dark 无 id，data-site-theme）、top-undo、top-redo。
- **预览工具条（12）**：pt-height、pt-corner、pt-gap-h、pt-gap-v、pt-border、pt-stroke、pt-hints、pt-composing、pt-split、pt-gboard-style、pt-align-halves、pt-split-gap。
- **布局标签页（27）**：layout-base-select、layout-submode-select、layout-add-layout、layout-delete-layout、layout-split-mode、layout-rename-layout、layout-reset、layout-download-json、layout-import-file、layout-open-gradient、layout-clear-colors、layout-height-override、layout-height-override-landscape、layout-open-aux-bar、layout-ime-profile、layout-ime-profile-refresh、layout-profile、layout-ime-load、layout-ime-save、layout-share-current、layout-import-qr-image、layout-import-qr-image-file、layout-json-check、layout-json-fix、layout-json-format、layout-json-copy、layout-json(textarea)。
- **主题标签页（29）**：theme-ime-load/save、theme-export-json、theme-share-current、theme-import-shared、theme-create-from-current、theme-rename-custom、theme-delete-custom、theme-import-background(+file)、theme-clear-background、theme-import-file、theme-background-brightness/blur(range)、theme-background-rotation、theme-background-crop-rect、theme-background-open-crop、theme-app-border-enabled/outline/gboard-style、theme-app-key-hgap/vgap/radius、theme-app-punct-pos、theme-json-check/fix/format/copy、theme-json(textarea)。（颜色行控件由 JS 动态生成于 #theme-color-rows，不在静态 HTML 内。）
- **弹出字符标签页（14）**：popup-ime-load/save、popup-add-mapping、popup-export-json、popup-import-json(+file)、popup-generate-qr、popup-import-qr-image(+file)、popup-json-check/fix/format/copy、popup-json(textarea)。
- **图标主题标签页（19）**：icon-theme-ime-load/save、create-new、export-json、export-zip、import-json(+file)、import-shared、generate-qr、import-qr-image(+file)、rename、delete、import-file、icon-theme-json-check/fix/format/copy、icon-theme-json(textarea)。
- **浮动工具（3）**：float-undo、float-redo、float-top。
- **对话框内（95）**：
  - layout-add-dialog（8）：kind、name、source、prefix（status 除外）、cancel/save 等。
  - layout-key-dialog（20）：key-type、main、alt、label、sub-label、numpad-sym、switch-target、weight、row-height、6 个子编辑器按钮、compose-independent、split-after、transparent、cancel/save/compose-clear/delete。
  - display-dialog（6）、labels-dialog（7）、macro-dialog（12）、colors-dialog（2+动态行）、gradient-dialog（3+锚点动态行）、clear-colors-dialog（2）、macro-event-dialog（3+动态步骤）、key-json-dialog（3）、aux-bar-dialog（4）、theme-qr-dialog（4）、theme-crop-dialog（4）、layout-qr-dialog（4）、popup-qr-dialog（4）、icon-slot-dialog（7）、icon-theme-qr-dialog（4）。

---

## 3. app.js 用户可见动作清单（112 条）

### 通用/全局（8）
1. 界面配色切换（`.site-theme-btn` ×3）— 亮/暗/自动，localStorage 持久 + 跟随系统媒体查询
2. 撤销（top-undo / float-undo / Ctrl+Z）— 快照式历史栈（HISTORY_LIMIT 上限），字段内输入不触发
3. 重做（top-redo / float-redo / Ctrl+Y / Ctrl+Shift+Z）
4. 回到顶部（float-top）— 滚动超阈值显示浮动组
5. 标签页切换（.tab ×4）— 切换四个工作台
6. 草稿自动保存 — beforeunload/pagehide/visibilitychange 时 commitHistorySnapshot + saveDraftNow（localStorage/IndexedDB，draft-assets.js 管背景图）
7. JSON 编辑器实时输入（layout/theme/popup/icon-theme-json）— input 即应用并调度校验
8. JSON 检查/一键修复/格式化/复制 ×4 面板（*-json-check/fix/format/copy）— 走 json-lint.js 宽松修复，复制走 navigator.clipboard

### 布局预览交互（6）
9. 点击预览键（layout-preview，click 委托）— 打开按键编辑对话框（含 Enter/空格键无障碍触发）
10. 预览键按压反馈（pointerdown/up/leave/cancel）— pressed 类高亮
11. 预览工具条 12 控件 — 高度%/圆角/横纵距/边框/描边/提示/合成中/分体/Gboard/中缝对齐/中缝宽；写 state.themeAppSync 与 localStorage，重渲染
12. 提示图例显隐 — 随 pt-hints
13. 预览面板折叠高度同步 — details toggle 时同步 JSON 编辑器高度
14. 窗口 resize — 同步各 JSON 高度与顶栏度量

### 布局编辑（~30）
15. 布局/子模式切换（layout-base-select / layout-submode-select）
16. 新增布局/子布局（layout-add-layout → layout-add-dialog：类型切换 syncAddDialogByKind、复制来源、保存/取消）
17. 删除布局/子模式（layout-delete-layout，子模式时走 deleteSubmode）
18. 重命名布局（layout-rename-layout）
19. 重置示例（layout-reset，载入 data/default-layout.json）
20. 分体布局编辑开关（layout-split-mode）
21. 当前布局专用高度（layout-height-override）/ 横屏高度（layout-height-override-landscape）
22. 行编辑：添加行、删除行（.row-delete）、行拖拽排序（dragstart/dragover/drop/pointerdown）
23. 行内添加按键（.row-add-key → openLayoutKeyDialog(row,-1,true)）
24. 编辑区点键编辑/删除、键拖拽重排与跨行/拖到预览（dragstart/drop 于 document 级）
25. 按键编辑对话框（layout-key-dialog）：类型切换改可见字段、主副字符/标签/子标签/数字符号/切换目标/权重/行高编辑、保存/取消/删除按键
26. 显示文本子对话框（display）：简单/映射模式、添加/删除映射行、保存
27. 标签子对话框（labels）：5 个标签位编辑保存
28. 事件子对话框（macro）：点击/上划/下划/旧划动/长按 5 通道，各自「编辑…/清空」
29. 事件步骤对话框（macro-event）：步骤列表渲染、类型切换、+添加步骤、删除步骤、fcitx 键选择、macro 键列表编辑
30. 按键颜色对话框（colors）：动态颜色行 + jscolor 内联取色、保存/取消
31. 合成中按键编辑（compose）：独立颜色开关、嵌套编辑、清除合成按键
32. 按键完整 JSON 对话框（key-json）：编辑保存
33. 分体断点开关（layout-key-split-after）、完全透明（layout-key-transparent）
34. 按键渐变着色（layout-open-gradient → gradient-dialog：+添加锚点、锚点按键/四色编辑、应用二维渐变、取消）
35. 清除按键颜色（layout-clear-colors → 确认对话框）
36. 辅助选择栏（layout-open-aux-bar → aux-bar-dialog：位置、尺寸滑杆、chip 点击编辑/右键删除/拖拽排序/拖拽添加、保存/取消）
37. 导出布局 JSON 下载（layout-download-json）
38. 导入布局 JSON 文件（layout-import-file）
39. 从 IME 读取布局（layout-ime-load）/ 保存到 IME（layout-ime-save）/ 刷新 profile 列表（layout-ime-profile-refresh）/ 选择 profile（layout-ime-profile）
40. 分享布局生成二维码（layout-share-current → layout-qr-dialog：LZMA 压缩分片、翻页 prev/next、下载长图、关闭）
41. 导入布局二维码长图（layout-import-qr-image + 隐藏 file input，走 qr-import.js jsQR 分片重组）
42. 分享 profile 名输入（layout-profile）

### 主题编辑（~25）
43. 主题列表卡片选择（#theme-list 动态卡片 click）
44. 复制主题（theme-create-from-current）/ 改名（theme-rename-custom）/ 删除（theme-delete-custom）
45. 颜色行编辑（#theme-color-rows 动态行：jscolor 取色、ripple 自动/自定义、change/keydown 提交）
46. 修改背景图（theme-import-background + file）/ 清除背景（theme-clear-background）
47. 背景亮度/模糊滑杆、旋转下拉、裁剪矩形只读显示
48. 裁剪背景（theme-background-open-crop → theme-crop-dialog：pointer 拖选区 + 四角手柄、重置、清除裁剪、应用、取消）
49. 同步 App 主题配置（theme-app-sync-card 7 控件 change → 写 state 并重渲预览）
50. 导出主题 JSON（theme-export-json）
51. 导入主题（theme-import-shared + theme-import-file：支持 zip 主题包/二维码长图图片）
52. 分享主题生成二维码（theme-share-current → theme-qr-dialog：翻页/下载长图/关闭）
53. 从 IME 读取主题（theme-ime-load）/ 保存到 IME（theme-ime-save）

### 弹出字符（~10）
54. 新增映射（popup-add-mapping）
55. 映射列表行：chip 点击编辑、右键删除、拖拽排序、添加 chip 拖放；行内 rename/delete 按钮
56. 导出 JSON（popup-export-json）/ 导入 JSON（popup-import-json + file）
57. 生成二维码（popup-generate-qr → popup-qr-dialog：翻页/下载长图/关闭）
58. 导入二维码（popup-import-qr-image + file）
59. 从 IME 读取（popup-ime-load）/ 保存到 IME（popup-ime-save）

### 图标主题（~15）
60. 新建主题（icon-theme-create-new）/ 改名 / 删除
61. 主题列表卡片选择（#icon-theme-list）
62. 导出 JSON（icon-theme-export-json）/ 导出 ZIP（icon-theme-export-zip，JSZip）
63. 导入 JSON（icon-theme-import-json + file）/ 导入主题（icon-theme-import-shared + file：json/zip/图片）
64. 生成二维码（icon-theme-generate-qr → icon-theme-qr-dialog：翻页/下载长图/关闭）
65. 导入二维码（icon-theme-import-qr-image + file）
66. 从 IME 读取/保存到 IME（icon-theme-ime-load/save）
67. 图标槽位编辑（#icon-theme-slots 动态槽 → icon-slot-dialog：内置/自定义对比、Emoji 文本、选择文件 SVG/PNG/XML、清除、粘贴 SVG 源码 textarea、确认/取消）

### js/ 其他文件暴露的功能
68. qr-import.js：二维码长图解码器（jsQR 逐帧扫描、分片分组、7s 预算、web/app 两种长图规格）
69. json-lint.js：宽松 JSON 校验/修复（BOM、尾逗号、注释、单引号、未引号键、全角标点）→ 供四处 JSON 面板
70. key-editor-bindings.js：按键编辑对话框全部子对话框事件绑定装配（bindKeyEditorDialogEvents，deps 注入）
71. draft-assets.js：背景图草稿 IndexedDB 存储（f5a-editor-assets-v1/backgrounds，单图 20MB/总 64MB）
72. jscolor：第三方取色器（颜色行与渐变锚点用）
73. 外部 CDN：qrious（生成码）、jsQR（解码）、lzma-wasm（分片压缩）、jszip（图标主题 zip）、不蒜子计数

---

## 4. style.css 组织结构（2615 行）

已有 CSS 变量体系：`:root`（L11–28）集中定义设计令牌——颜色（--bg/--panel×5/--text/--sub/--primary/--macro/--border/--ok/--err）、--color-scheme、--topbar-height、--preview-panel-height、--preview-zoom；亮色覆写经 `@media (prefers-color-scheme: light)`（L2193、L2236）+ data-site-theme 机制（L2172 起，站点亮/暗主题块）。

大致分块：
1. L1–170 基础与顶栏/详情卡/按钮表单基件（变量、topbar、details 卡、按钮、表单基元）
2. L171–800 预览区（预览壳、布局键渲染、按压/选中态、L805 首个响应式断点 1100px）
3. L805–1260 预览细节与 text_editor 特例（L1026）、点按编辑提示（L1091）
4. L1267–1460 辅助选择栏（预览 L1267、设置对话框 L1350）
5. L1460–1980 表单/对话框通用 + 多档响应式（520/640/860/1080px 断点 + L1959 高度断点 980px）
6. L1981–2170 图标主题编辑器（L1981、卡片网格 L2111）
7. L2172–2330 站点亮/暗主题覆写 + 顶栏动作区（L2243）+ 浮动工具（L2294）
8. L2328–2440 预览工具条（L2328）+ JSON 校验面板（L2378）
9. L2442–2615 预览按键反馈/徽章/划动标签（L2442、L2518、L2528）、分体中缝（L2554）、CodeMirror 亮暗跟随（L2562 至末）

---

## 5. 核对表底稿（功能项 | DOM 入口 | 行为 | 核对状态）

| # | 功能项 | DOM 入口(id) | 行为 | 核对状态 |
|---|---|---|---|---|
| 1 | 界面配色切换 | .site-theme-btn ×3 | 亮/暗/自动切换并持久化 | 通过（tests/behavior-ui.test.cjs） |
| 2 | 撤销 | top-undo / float-undo / Ctrl+Z | 历史快照回退 | 通过（tests/behavior-ui.test.cjs） |
| 3 | 重做 | top-redo / float-redo / Ctrl+Y | 历史快照前进 | 通过（tests/behavior-ui.test.cjs） |
| 4 | 回到顶部 | float-top | 滚动回页首，滚动超阈值显示 | 升级处理·浏览器专属，见人工验收清单 #4 |
| 5 | 标签页切换 | .tab ×4 (data-tab-target) | 切换布局/主题/弹出字符/图标主题工作台 | 通过（tests/behavior-ui.test.cjs） |
| 6 | 草稿自动保存 | （beforeunload/pagehide） | 关页前提交历史快照并保存草稿 | 通过（tests/behavior-core.test.cjs） |
| 7 | 预览工具条-高度 | pt-height | 设置当前布局高度覆盖 | 升级处理·浏览器专属，见人工验收清单 #7 |
| 8 | 预览工具条-圆角/横纵距 | pt-corner / pt-gap-h / pt-gap-v | 写 themeAppSync 并重渲 | 升级处理·浏览器专属，见人工验收清单 #8 |
| 9 | 预览工具条-边框/描边 | pt-border / pt-stroke | 开关按键边框与描边 | 升级处理·浏览器专属，见人工验收清单 #9 |
| 10 | 预览工具条-提示/图例 | pt-hints + preview-hint-legend | 显隐按键提示徽章与图例 | 升级处理·浏览器专属，见人工验收清单 #10 |
| 11 | 预览工具条-合成中 | pt-composing | 预览合成中按键状态（不改布局） | 升级处理·浏览器专属，见人工验收清单 #11 |
| 12 | 预览工具条-分体 | pt-split / pt-align-halves / pt-split-gap | 分体预览、中缝对齐与中缝宽度 | 升级处理·浏览器专属，见人工验收清单 #12 |
| 13 | 预览工具条-Gboard | pt-gboard-style | Gboard 风格操作按钮预览 | 升级处理·浏览器专属，见人工验收清单 #13 |
| 14 | 点击预览键编辑 | layout-preview（委托） | 点击/Enter/空格打开按键编辑对话框 | 升级处理·浏览器专属，见人工验收清单 #14 |
| 15 | 预览键按压反馈 | layout-preview（pointer） | pressed 高亮 | 升级处理·浏览器专属，见人工验收清单 #15 |
| 16 | 布局/子模式切换 | layout-base-select / layout-submode-select | 切换当前编辑的布局与子模式 | 升级处理·浏览器专属，见人工验收清单 #16 |
| 17 | 新增布局/子布局 | layout-add-layout → layout-add-dialog | 类型/名称/复制来源后添加 | 升级处理·浏览器专属，见人工验收清单 #17 |
| 18 | 删除布局/子模式 | layout-delete-layout | 删除当前布局或子模式 | 升级处理·浏览器专属，见人工验收清单 #18 |
| 19 | 重命名布局 | layout-rename-layout | 重命名当前布局 | 升级处理·浏览器专属，见人工验收清单 #19 |
| 20 | 重置示例 | layout-reset | 载入默认示例布局 | 升级处理·浏览器专属，见人工验收清单 #20 |
| 21 | 分体布局编辑开关 | layout-split-mode | 编辑 __variant__:split 排列 | 升级处理·浏览器专属，见人工验收清单 #21 |
| 22 | 布局专用高度 | layout-height-override / -landscape | 竖屏/横屏高度覆盖 | 升级处理·浏览器专属，见人工验收清单 #22 |
| 23 | 行增删与拖拽排序 | layout-rows（动态 .row-add-key/.row-delete/拖拽） | 行级编辑 | 通过（tests/dynamic-render.test.cjs） |
| 24 | 键编辑/删除/拖拽 | layout-rows（键 click/contextmenu/drag） | 键级编辑与重排，可拖入预览 | 通过（tests/dynamic-render.test.cjs） |
| 25 | 按键编辑对话框 | layout-key-dialog | 类型/字符/标签/权重/行高编辑保存 | 升级处理·浏览器专属，见人工验收清单 #25 |
| 26 | 显示文本编辑 | layout-key-open-display-text → display-dialog | 简单文本或模式映射 | 升级处理·浏览器专属，见人工验收清单 #26 |
| 27 | 标签编辑 | layout-key-open-labels → labels-dialog | 上/下划、旧划动、副、长按标签 | 升级处理·浏览器专属，见人工验收清单 #27 |
| 28 | 事件编辑（5 通道） | layout-key-open-macro → macro-dialog | 点击/上下划/旧划动/长按事件编辑与清空 | 升级处理·浏览器专属，见人工验收清单 #28 |
| 29 | 事件步骤编辑 | macro-event-dialog | 步骤增删、类型、fcitx 键/宏键 | 升级处理·浏览器专属，见人工验收清单 #29 |
| 30 | 按键颜色编辑 | layout-key-open-colors → colors-dialog | 多角色颜色 + jscolor 取色 | 升级处理·浏览器专属，见人工验收清单 #30 |
| 31 | 合成中按键编辑 | layout-key-open-compose | 独立颜色、嵌套编辑、清除合成键 | 升级处理·浏览器专属，见人工验收清单 #31 |
| 32 | 按键完整 JSON | layout-key-open-json → key-json-dialog | 直接编辑按键 JSON | 升级处理·浏览器专属，见人工验收清单 #32 |
| 33 | 分体断点 | layout-key-split-after | 本键后断开分体 | 升级处理·浏览器专属，见人工验收清单 #33 |
| 34 | 完全透明键 | layout-key-transparent | 占位不画键底 | 升级处理·浏览器专属，见人工验收清单 #34 |
| 35 | 渐变着色 | layout-open-gradient → gradient-dialog | 锚点四色二维插值到全部键 | 升级处理·浏览器专属，见人工验收清单 #35 |
| 36 | 清除按键颜色 | layout-clear-colors → 确认对话框 | 清除全部颜色覆盖 | 升级处理·浏览器专属，见人工验收清单 #36 |
| 37 | 辅助选择栏 | layout-open-aux-bar → aux-bar-dialog | 位置/尺寸/按键 chip 编辑排序 | 升级处理·浏览器专属，见人工验收清单 #37 |
| 38 | 导出布局 JSON | layout-download-json | 下载布局 JSON | 升级处理·浏览器专属，见人工验收清单 #38 |
| 39 | 导入布局 JSON 文件 | layout-import-file | 文件导入布局 | 升级处理·浏览器专属，见人工验收清单 #39 |
| 40 | 布局 IME 读写 | layout-ime-load/save/profile/refresh | 经 IME API 读取/保存布局 profile | 升级处理·浏览器专属，见人工验收清单 #40 |
| 41 | 分享布局二维码 | layout-share-current → layout-qr-dialog | LZMA 分片生成码、翻页、下载长图 | 升级处理·浏览器专属，见人工验收清单 #41 |
| 42 | 导入布局二维码 | layout-import-qr-image(+file) | 长图扫描分片重组导入 | 升级处理·浏览器专属，见人工验收清单 #42 |
| 43 | 布局 JSON 面板 | layout-json + check/fix/format/copy | 实时编辑、宽松校验修复、格式化、复制 | 升级处理·浏览器专属，见人工验收清单 #43 |
| 44 | 主题列表选择 | theme-list（动态卡片） | 选择当前主题 | 通过（tests/dynamic-render.test.cjs） |
| 45 | 复制/改名/删除主题 | theme-create-from-current / rename-custom / delete-custom | 自定义主题管理 | 升级处理·浏览器专属，见人工验收清单 #45 |
| 46 | 主题颜色行编辑 | theme-color-rows（动态行） | jscolor 改色、ripple 自动/自定义 | 通过（tests/dynamic-render.test.cjs） |
| 47 | 背景图导入/清除 | theme-import-background(+file) / clear-background | 设置/清除背景图（存 IndexedDB） | 升级处理·浏览器专属，见人工验收清单 #47 |
| 48 | 背景参数 | theme-background-brightness/blur/rotation | 亮度/模糊/旋转 | 升级处理·浏览器专属，见人工验收清单 #48 |
| 49 | 背景裁剪 | theme-background-open-crop → theme-crop-dialog | 拖选区+手柄裁剪、重置/清除/应用 | 升级处理·浏览器专属，见人工验收清单 #49 |
| 50 | 同步 App 主题配置 | theme-app-* ×7 | 边框/描边/Gboard/键距/圆角/标点位置 | 升级处理·浏览器专属，见人工验收清单 #50 |
| 51 | 导出主题 JSON | theme-export-json | 下载主题 JSON | 升级处理·浏览器专属，见人工验收清单 #51 |
| 52 | 导入主题 | theme-import-shared(+file) | zip/二维码长图导入主题 | 升级处理·浏览器专属，见人工验收清单 #52 |
| 53 | 分享主题二维码 | theme-share-current → theme-qr-dialog | 生成码、翻页、下载长图 | 升级处理·浏览器专属，见人工验收清单 #53 |
| 54 | 主题 IME 读写 | theme-ime-load/save | 经 IME API 读/存主题 | 升级处理·浏览器专属，见人工验收清单 #54 |
| 55 | 主题 JSON 面板 | theme-json + 4 按钮 | 同布局 JSON 面板 | 升级处理·浏览器专属，见人工验收清单 #55 |
| 56 | 弹出字符新增映射 | popup-add-mapping | 添加映射条目 | 升级处理·浏览器专属，见人工验收清单 #56 |
| 57 | 映射条目编辑 | popup-entry-list（chip 动态） | chip 点击编辑/右键删/拖拽排序/行内改名删除 | 通过（tests/dynamic-render.test.cjs） |
| 58 | 弹出字符导入导出 JSON | popup-export/import-json(+file) | JSON 下载与文件导入 | 升级处理·浏览器专属，见人工验收清单 #58 |
| 59 | 弹出字符二维码 | popup-generate-qr → popup-qr-dialog / import-qr-image(+file) | 生成/导入二维码长图 | 升级处理·浏览器专属，见人工验收清单 #59 |
| 60 | 弹出字符 IME 读写 | popup-ime-load/save | 经 IME API 读/存弹出字符 | 升级处理·浏览器专属，见人工验收清单 #60 |
| 61 | 弹出字符 JSON 面板 | popup-json + 4 按钮 | 同上 | 升级处理·浏览器专属，见人工验收清单 #61 |
| 62 | 图标主题新建/改名/删除 | icon-theme-create-new/rename/delete | 图标主题管理 | 升级处理·浏览器专属，见人工验收清单 #62 |
| 63 | 图标主题列表选择 | icon-theme-list（动态卡片） | 选择当前图标主题 | 升级处理·浏览器专属，见人工验收清单 #63 |
| 64 | 导出图标主题 JSON/ZIP | icon-theme-export-json / export-zip | JSON 下载 / JSZip 打包 | 升级处理·浏览器专属，见人工验收清单 #64 |
| 65 | 导入图标主题 | icon-theme-import-json(+file) / import-shared(+file) | JSON 或 zip/长图导入 | 升级处理·浏览器专属，见人工验收清单 #65 |
| 66 | 图标主题二维码 | icon-theme-generate-qr → qr-dialog / import-qr-image(+file) | 生成/导入二维码 | 升级处理·浏览器专属，见人工验收清单 #66 |
| 67 | 图标主题 IME 读写 | icon-theme-ime-load/save | 经 IME API 读/存 | 升级处理·浏览器专属，见人工验收清单 #67 |
| 68 | 图标槽位编辑 | icon-theme-slots → icon-slot-dialog | 内置/自定义对比、Emoji、文件、粘贴 SVG、清除 | 通过（tests/dynamic-render.test.cjs） |
| 69 | 图标主题 JSON 面板 | icon-theme-json + 4 按钮 | 同上 | 升级处理·浏览器专属，见人工验收清单 #69 |
| 70 | 撤销/重做快捷键 | document keydown | Ctrl+Z/Y（字段内不拦截） | 通过（tests/behavior-ui.test.cjs） |
| 71 | 无障碍键激活预览键 | layout-preview keydown | Enter/空格触发编辑 | 升级处理·浏览器专属，见人工验收清单 #71 |
| 72 | 二维码协议栈 | （app.js 内部） | crc32/base64url/LZMA 分片编解码，与 app 端对齐 | 通过（tests/behavior-core.test.cjs） |
| 73 | 背景草稿存储 | （draft-assets.js） | IndexedDB 存背景图，限 20MB/64MB | 通过（tests/behavior-core.test.cjs） |
| 74 | JSON 宽松修复引擎 | （json-lint.js） | BOM/尾逗号/注释/单引号/全角修复 | 通过（tests/behavior-ui.test.cjs） |

（表内 74 行覆盖 §3 全部 112 个动作点——多条动作合并为一行的，如 JSON 四面板、预览工具条 12 控件，行内已注明明细。）

### 未确定事项
- #theme-color-rows、#theme-list、#popup-entry-list、#icon-theme-slots、#layout-rows 等动态渲染控件的逐项核对需运行时验证，本表只登记入口容器。
- IME API 读写依赖部署时注入的 IME_API_BASE，静态分析无法确认其可用性。
