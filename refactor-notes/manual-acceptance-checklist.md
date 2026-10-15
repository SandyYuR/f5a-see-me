# 人工验收清单（浏览器专属项 59 项）

这批功能项在 Node 侧**无法取得运行时证据**：f5a-see-me 是纯静态页面，仓库无 jsdom/playwright，
本轮只能用自写最小 DOM 装载 app.js。以下 59 项依赖真实浏览器能力（canvas、指针事件、
文件下载、IndexedDB、IME 接口、CSS 布局），因此**不在 Node 侧声称已验证**，改为登记待人工验收。

> 本清单与 [f5a-inventory.md](f5a-inventory.md) §5 一一对应，编号即核对表行号。
> 已在 Node 侧取得运行时证据的 15 项（#1 #2 #3 #5 #6 #23 #24 #44 #46 #57 #68 #70 #72 #73 #74）**不在此列**。

## 验收方法

浏览器直接打开 `index.html`（file:// 即可，IME 相关项需部署到注入 `IME_API_BASE` 的环境），
然后按表逐项：**操作「DOM 入口」→ 观察是否出现「预期行为」→ 打开控制台确认无 JS 报错**。
三个界面配色态（`site-light` / `site-dark` / `site-auto`）各过一遍观感类项。

| # | 功能项 | DOM 入口 | 预期行为 | 为何需浏览器验收 | 通过判据 |
|---|---|---|---|---|---|
| 4 | 回到顶部 | `float-top` | 滚动回页首，滚动超阈值显示 | 依赖真实滚动位置与布局高度，无布局引擎 | 操作入口后出现所述行为，控制台无 error |
| 7 | 预览工具条-高度 | `pt-height` | 设置当前布局高度覆盖 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 8 | 预览工具条-圆角/横纵距 | `pt-corner / pt-gap-h / pt-gap-v` | 写 themeAppSync 并重渲 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 9 | 预览工具条-边框/描边 | `pt-border / pt-stroke` | 开关按键边框与描边 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 10 | 预览工具条-提示/图例 | `pt-hints + preview-hint-legend` | 显隐按键提示徽章与图例 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 11 | 预览工具条-合成中 | `pt-composing` | 预览合成中按键状态（不改布局） | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 12 | 预览工具条-分体 | `pt-split / pt-align-halves / pt-split-gap` | 分体预览、中缝对齐与中缝宽度 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 13 | 预览工具条-Gboard | `pt-gboard-style` | Gboard 风格操作按钮预览 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 14 | 点击预览键编辑 | `layout-preview（委托）` | 点击/Enter/空格打开按键编辑对话框 | 依赖真实事件派发与键盘焦点，需浏览器事件循环 | 操作入口后出现所述行为，控制台无 error |
| 15 | 预览键按压反馈 | `layout-preview（pointer）` | pressed 高亮 | 依赖真实事件派发与键盘焦点，需浏览器事件循环 | 操作入口后出现所述行为，控制台无 error |
| 16 | 布局/子模式切换 | `layout-base-select / layout-submode-select` | 切换当前编辑的布局与子模式 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 17 | 新增布局/子布局 | `layout-add-layout → layout-add-dialog` | 类型/名称/复制来源后添加 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 18 | 删除布局/子模式 | `layout-delete-layout` | 删除当前布局或子模式 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 19 | 重命名布局 | `layout-rename-layout` | 重命名当前布局 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 20 | 重置示例 | `layout-reset` | 载入默认示例布局 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 21 | 分体布局编辑开关 | `layout-split-mode` | 编辑 __variant__:split 排列 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 22 | 布局专用高度 | `layout-height-override / -landscape` | 竖屏/横屏高度覆盖 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 25 | 按键编辑对话框 | `layout-key-dialog` | 类型/字符/标签/权重/行高编辑保存 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 26 | 显示文本编辑 | `layout-key-open-display-text → display-dialog` | 简单文本或模式映射 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 27 | 标签编辑 | `layout-key-open-labels → labels-dialog` | 上/下划、旧划动、副、长按标签 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 28 | 事件编辑（5 通道） | `layout-key-open-macro → macro-dialog` | 点击/上下划/旧划动/长按事件编辑与清空 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 29 | 事件步骤编辑 | `macro-event-dialog` | 步骤增删、类型、fcitx 键/宏键 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 30 | 按键颜色编辑 | `layout-key-open-colors → colors-dialog` | 多角色颜色 + jscolor 取色 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 31 | 合成中按键编辑 | `layout-key-open-compose` | 独立颜色、嵌套编辑、清除合成键 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 32 | 按键完整 JSON | `layout-key-open-json → key-json-dialog` | 直接编辑按键 JSON | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 33 | 分体断点 | `layout-key-split-after` | 本键后断开分体 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 34 | 完全透明键 | `layout-key-transparent` | 占位不画键底 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 35 | 渐变着色 | `layout-open-gradient → gradient-dialog` | 锚点四色二维插值到全部键 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 36 | 清除按键颜色 | `layout-clear-colors → 确认对话框` | 清除全部颜色覆盖 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 37 | 辅助选择栏 | `layout-open-aux-bar → aux-bar-dialog` | 位置/尺寸/按键 chip 编辑排序 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 38 | 导出布局 JSON | `layout-download-json` | 下载布局 JSON | 依赖真实文件流（FileReader / Blob 下载 / JSZip），Node 侧无文件系统与下载栈 | 操作入口后出现所述行为，控制台无 error |
| 39 | 导入布局 JSON 文件 | `layout-import-file` | 文件导入布局 | 依赖真实文件流（FileReader / Blob 下载 / JSZip），Node 侧无文件系统与下载栈 | 操作入口后出现所述行为，控制台无 error |
| 40 | 布局 IME 读写 | `layout-ime-load/save/profile/refresh` | 经 IME API 读取/保存布局 profile | 依赖部署时注入的 IME_API_BASE 与后端接口，离线环境不可达 | 操作入口后出现所述行为，控制台无 error |
| 41 | 分享布局二维码 | `layout-share-current → layout-qr-dialog` | LZMA 分片生成码、翻页、下载长图 | 依赖 canvas 与 QR 编解码库（QRious / jsQR），Node 最小 DOM 无画布 | 操作入口后出现所述行为，控制台无 error |
| 42 | 导入布局二维码 | `layout-import-qr-image(+file)` | 长图扫描分片重组导入 | 依赖 canvas 与 QR 编解码库（QRious / jsQR），Node 最小 DOM 无画布 | 操作入口后出现所述行为，控制台无 error |
| 43 | 布局 JSON 面板 | `layout-json + check/fix/format/copy` | 实时编辑、宽松校验修复、格式化、复制 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 45 | 复制/改名/删除主题 | `theme-create-from-current / rename-custom / delete-custom` | 自定义主题管理 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 47 | 背景图导入/清除 | `theme-import-background(+file) / clear-background` | 设置/清除背景图（存 IndexedDB） | 依赖真实文件流（FileReader / Blob 下载 / JSZip），Node 侧无文件系统与下载栈 | 操作入口后出现所述行为，控制台无 error |
| 48 | 背景参数 | `theme-background-brightness/blur/rotation` | 亮度/模糊/旋转 | 依赖 IndexedDB 与图片解码（Blob / Image） | 操作入口后出现所述行为，控制台无 error |
| 49 | 背景裁剪 | `theme-background-open-crop → theme-crop-dialog` | 拖选区+手柄裁剪、重置/清除/应用 | 依赖 IndexedDB 与图片解码（Blob / Image） | 操作入口后出现所述行为，控制台无 error |
| 50 | 同步 App 主题配置 | `theme-app-* ×7` | 边框/描边/Gboard/键距/圆角/标点位置 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 51 | 导出主题 JSON | `theme-export-json` | 下载主题 JSON | 依赖真实文件流（FileReader / Blob 下载 / JSZip），Node 侧无文件系统与下载栈 | 操作入口后出现所述行为，控制台无 error |
| 52 | 导入主题 | `theme-import-shared(+file)` | zip/二维码长图导入主题 | 依赖真实文件流（FileReader / Blob 下载 / JSZip），Node 侧无文件系统与下载栈 | 操作入口后出现所述行为，控制台无 error |
| 53 | 分享主题二维码 | `theme-share-current → theme-qr-dialog` | 生成码、翻页、下载长图 | 依赖 canvas 与 QR 编解码库（QRious / jsQR），Node 最小 DOM 无画布 | 操作入口后出现所述行为，控制台无 error |
| 54 | 主题 IME 读写 | `theme-ime-load/save` | 经 IME API 读/存主题 | 依赖部署时注入的 IME_API_BASE 与后端接口，离线环境不可达 | 操作入口后出现所述行为，控制台无 error |
| 55 | 主题 JSON 面板 | `theme-json + 4 按钮` | 同布局 JSON 面板 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 56 | 弹出字符新增映射 | `popup-add-mapping` | 添加映射条目 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 58 | 弹出字符导入导出 JSON | `popup-export/import-json(+file)` | JSON 下载与文件导入 | 依赖真实文件流（FileReader / Blob 下载 / JSZip），Node 侧无文件系统与下载栈 | 操作入口后出现所述行为，控制台无 error |
| 59 | 弹出字符二维码 | `popup-generate-qr → popup-qr-dialog / import-qr-image(+file)` | 生成/导入二维码长图 | 依赖 canvas 与 QR 编解码库（QRious / jsQR），Node 最小 DOM 无画布 | 操作入口后出现所述行为，控制台无 error |
| 60 | 弹出字符 IME 读写 | `popup-ime-load/save` | 经 IME API 读/存弹出字符 | 依赖部署时注入的 IME_API_BASE 与后端接口，离线环境不可达 | 操作入口后出现所述行为，控制台无 error |
| 61 | 弹出字符 JSON 面板 | `popup-json + 4 按钮` | 同上 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 62 | 图标主题新建/改名/删除 | `icon-theme-create-new/rename/delete` | 图标主题管理 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 63 | 图标主题列表选择 | `icon-theme-list（动态卡片）` | 选择当前图标主题 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 64 | 导出图标主题 JSON/ZIP | `icon-theme-export-json / export-zip` | JSON 下载 / JSZip 打包 | 依赖真实文件流（FileReader / Blob 下载 / JSZip），Node 侧无文件系统与下载栈 | 操作入口后出现所述行为，控制台无 error |
| 65 | 导入图标主题 | `icon-theme-import-json(+file) / import-shared(+file)` | JSON 或 zip/长图导入 | 依赖真实文件流（FileReader / Blob 下载 / JSZip），Node 侧无文件系统与下载栈 | 操作入口后出现所述行为，控制台无 error |
| 66 | 图标主题二维码 | `icon-theme-generate-qr → qr-dialog / import-qr-image(+file)` | 生成/导入二维码 | 依赖 canvas 与 QR 编解码库（QRious / jsQR），Node 最小 DOM 无画布 | 操作入口后出现所述行为，控制台无 error |
| 67 | 图标主题 IME 读写 | `icon-theme-ime-load/save` | 经 IME API 读/存 | 依赖部署时注入的 IME_API_BASE 与后端接口，离线环境不可达 | 操作入口后出现所述行为，控制台无 error |
| 69 | 图标主题 JSON 面板 | `icon-theme-json + 4 按钮` | 同上 | 依赖真实浏览器事件循环与布局（CSS 生效、元素可见性与尺寸） | 操作入口后出现所述行为，控制台无 error |
| 71 | 无障碍键激活预览键 | `layout-preview keydown` | Enter/空格触发编辑 | 依赖真实事件派发与键盘焦点，需浏览器事件循环 | 操作入口后出现所述行为，控制台无 error |

## 未做而因此未证的部分（如实声明）

- **观感**（令牌配色、间距、hover 态、浅色模式）只做了静态推断，未在真实浏览器中比对三态。
  对应 `refactor-design.md` §7「逐面板视觉验收要点」。
- **指针交互**（拖拽排序、chip 右键删、裁剪手柄拖选）与 **jscolor 取色**未做真实交互验证；
  `tests/dynamic-render.test.cjs` 断言的只是渲染产出结构（行数、按钮存在、`rowIndex` 顺序），
  不等于这些事件驱动的行为仍然可用。
