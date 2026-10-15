# f5a-see-me 界面重构 · 结案汇总

对照 `D:\GitHub\foxy\foxy-editor` 重构 f5a-see-me 网页编辑器的界面层。仓库 `f5a-see-me`，分支 `site`，HEAD `37ab87a`，**未 commit、未 push**。

---

## 一、结论

界面层已按 foxy 体系重建，功能全部保留，并取得**真实浏览器实测证据**。三条判断的裁决：

| 判断 | 裁决 | 核心依据 |
|---|---|---|
| 功能守恒 | **支持**（独立核验） | 回归 51 例全绿（原 24 例无退化）；74 项功能清单入口零缺失；`id`/`data-*` 契约 lost=0 / add=0 |
| foxy 体系可移植 | **不确定 → 已补浏览器证据** | 布局破坏已排除（溢出 0）、可读性无下降（最低对比度 5.29 > 4.5）、令牌完整性 4→15、触控目标 8→0、按钮分级 0→12+7。升格与否由独立评估者裁决 |
| UI 层可独立重构 | **支持**（独立核验） | `js/app.js` 仅 5 行令牌改名，核心数据逻辑未动 |

**q1 重构深度**：采纳「以 UI 层为主、app.js 仅动绑定」。实测结果——`app.js` 只改了 5 行（全部是 `var(--sub)` → `var(--text-dim)`、`var(--primary)` → `var(--accent)` 的令牌改名），核心编辑/导入导出逻辑一行未动；界面改动集中在 `style.css`（+844/−140）与 `index.html`（+32/−32）。这证明 f5a 的界面层确实可以独立重排。

**q2 视觉方向**：采纳「以 foxy 风格为标杆移植」。落地为 foxy 的 16 令牌骨架（颜色/间距/圆角/字号/阴影/动效）与组件分层（顶栏两层结构、`details.card` 卡片、对话框标题栏/底栏、按钮 primary/danger 分级）。**一处有依据的偏离**：不批量把静态控件换成 foxy 的 `mini-*` 族——因为 `app.js` 动态生成的控件从不带 `mini-` 类（改用 `theme-color-input`、`macro-key-code-select` 等自有类），而 `mini-input` 的底色是硬编码 `#17191d`、与动态控件的 `var(--card-inner)` 不同，并排会出现观感撕裂。理由：一致性 > 局部紧凑。

---

## 二、改动文件

| 文件 | 改动 | 内容 |
|---|---|---|
| `style.css` | +844 / −140（2615 → 3319 行） | 设计令牌体系重建、组件样式、明暗双写、按钮分级、动态行 hover 规范、硬编码色令牌化、复选框易用性修复 |
| `index.html` | +32 / −32（814 行） | 13 处对话框底栏加 `.dialog-toolbar`、19 处按钮分级（12 primary + 7 danger） |
| `js/app.js` | +5 / −5（11472 行） | 仅 5 处内联 style 的旧令牌改名，无逻辑改动 |

**新增产物**（未跟踪，属您决定是否入库）：

- `refactor-notes/`：`foxy-analysis.md`（foxy 体系分析）、`f5a-inventory.md`（f5a 清点 + 74 项核对表）、`refactor-design.md`（设计方案）、`panel-changelog.md`（面板层改动记录）、`manual-acceptance-checklist.md`（59 项人工验收清单）、`verification-report.md`（验证报告）、`cdp-*.json`（浏览器实测数据）、`shots/`（6 张对比截图）
- `tests/`：`dom-app-harness.cjs`（最小 DOM 脚手架）、`dynamic-render.test.cjs`（8 例）、`behavior-core.test.cjs`（7 例）、`behavior-ui.test.cjs`（9 例）、`smoke.test.cjs`（3 例）、`check-inventory.cjs`、`static-audit.cjs`、`cdp-probe.cjs`

---

## 三、验证结果

### 回归

```
cd f5a-see-me && node --test tests/
# tests 51 / pass 51 / fail 0  (耗时 ~0.35s)
```

构成：原 `regressions.test.cjs` 24 例（无退化）+ 新增 `smoke` 3 + `dynamic-render` 8 + `behavior-core` 7 + `behavior-ui` 9。

### 浏览器实测（无头 Edge + CDP）

本机无 Chrome、无 puppeteer，用 Edge `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` + Node 26 原生 `WebSocket` 走 CDP 协议驱动，**零新增依赖**：

```
node tests/cdp-probe.cjs [目标目录] [light|dark]
```

| 指标（1440×1000，无头 Edge） | 重构 light | HEAD light | 重构 dark | HEAD dark |
|---|---|---|---|---|
| 设计令牌有值数（共 16） | **15** | 4 | **15** | 4 |
| 正文对比度 / 页面底 | 15.03 | 14.22 | 15.14 | 15.83 |
| 弱化文本对比度 / 卡片底 | 5.29 | 5.37 | 7.05 | 7.55 |
| tab 激活态对比度 | 3.20 | 3.45 | **3.20** | **2.70** |
| 横向溢出元素数 | 0 | 0 | 0 | 0 |
| 触控目标 <24px | **0** | 8 | **0** | 8 |
| 主操作按钮 `.primary` | **12** | 0 | **12** | 0 |
| 危险按钮 `.danger` | **7** | 0 | **7** | 0 |
| 页面 JS 异常 | 0 | 0 | 0 | 0 |

### 静态完整性

`node tests/static-audit.cjs`：HTML 标签配对 unclosedDepth 0 / mismatch 0；CSS 括号 finalDepth 0 / extraClose 0；id 325 个重复 0；JS 引用 id 字面量 263 个，扣掉运行时动态生成后缺失仅 `layout-copy-source`（**基线既存**）；CSS 令牌静态定义 34 + 注入 46，悬空 0。

---

## 四、四项可量化改善

1. **令牌体系 4 → 15**。HEAD 版浅色模式下 `--card` / `--card-inner` / `--text-dim` / `--accent` / `--danger` / `--warn` / `--radius` 全部取不到值（`getComputedStyle` 返回空），浅色界面靠零散硬编码色顶着，改一处要动多处。这是**基线缺陷，非本次引入**。重构后两模式均完整。
2. **tab 激活态对比度 dark 下 2.70 → 3.20**。HEAD 的 2.70 **低于** WCAG 对 UI 组件的 3.0 要求，重构版达标。
3. **小触控目标 8 → 0**。`style.css:740` 把复选框由默认 13px 撑到 ≥24px，`accent-color: var(--accent)` 顺带跟随主题色；视觉方块大小不变，只是命中区变大。
4. **按钮分级 0 → 12 primary + 7 danger**。HEAD 版这两个类计数为 0，即不存在主操作/危险操作的分级样式；且 `.primary` 在暗色下完全不起作用（只有浅色覆盖、无暗色基准）。重构版补齐暗色基准 + 浅色赢回 + 禁用态。

---

## 五、已知限制（如实列出）

1. **对比度不是全面胜出**。dark 下正文 15.14 < HEAD 15.83、弱化 7.05 < 7.55，light 下弱化 5.29 < 5.37。最低读数 5.29 仍远超 WCAG AA 的 4.5 门槛，差异在感官阈值内。已作为未解释项登记并按「无下降、有局部改善」如实写，**未做「全面胜出」的宣称**。
2. **交互行为仍缺真实输入证据**。CDP 探针只按静态态取值，拖拽排序、chip 右键删、jscolor 取色、文件下载、剪贴板、IME 接口未覆盖。51 例运行时断言覆盖的是**渲染产出结构**（行数、按钮存在、顺序），不等于事件驱动的交互行为。这 59 项已逐项转入 `manual-acceptance-checklist.md`。
3. **hover / focus 等状态样式未取证**，需人工过一遍。
4. **IME API 读写依赖部署时注入的 `IME_API_BASE`**，静态与无头环境都无法确认其可用性。
5. **截图本人无法判读**（当前模型不支持图像输入）。`refactor-notes/shots/` 下 6 张同视口 1440×1000 的对比截图仅作物证交付给您目视复核，我的判断只依据上表的数值读数。

---

## 六、待您决策

1. **`layout-copy-source` 悬空引用是否顺手修正**：`app.js` 的 `3993` / `7610` / `7694` / `8396` 四处取该 id，但 `index.html` 与 HEAD 版都没有它（实际存在的是 `layout-add-source`）。四处都有 `if (node)` 兜底，无运行时故障，属**基线既存**。修不修由您定。
2. **59 项浏览器专属条目是否补证据**：可人工按清单过，或授权装无头浏览器做交互级取证（当前只做了静态态取值）。
3. **本轮改动是否入库**：三个文件已改动但未 commit，产物目录未跟踪。按 AGENTS.md 纪律，未经您明确要求不提交。

---

## 七、过程中的两个坑（供后续参考）

1. **L3/L4 步骤交付不能自判**。`AdvancePlan` 带 `results` 字段会被系统拒绝——裁决只能由独立评估者写。
2. **无头浏览器的 profile 目录不能放在工作区**。Edge 会锁住里面文件，收尾 `rmSync` 必然 `EPERM`；改用系统临时目录且**不要清理**，交给系统回收。
