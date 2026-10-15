# f5a-see-me 界面重构 · 面板层改动记录（s5）

依据：[foxy-analysis.md](foxy-analysis.md)、[f5a-inventory.md](f5a-inventory.md)、[refactor-design.md](refactor-design.md)。
配套：s4 已完成设计令牌体系重建（`:root` 29 个令牌 + 亮暗两套覆盖），本步在令牌之上落实**面板层的观感与易用性**。

硬约束未破:`index.html` 的 `id`/`name`/`data-*`/`for` 集合与 HEAD 逐一比对——**id 325→325、name 1→1、data-* 属性名 2→2、for 13→13,逐类零丢失、零新增**(合计 341;此处此前记作「327→327」是把 id 字面量数与 `data-*` 属性名数混算,实测见 §7);`node tests/regressions.test.cjs` 始终 **24 例全绿**。

---

## 1. 对话框按钮分级（19 处）

**问题**：17 个对话框底栏的「保存 / 删除 / 取消」三种按钮外观完全一致——用户没法一眼分辨哪个是主操作、哪个会删东西。

**做法**：按 foxy 的 `mini-button primary` / `mini-button danger` 语义给静态按钮分级（foxy 的动态按钮在 `js/key-dialog.js`、`js/app.js`、`js/macro-editor.js`、`js/theme-editor.js` 里用了 7 处 `class: 'mini-button primary'`，用途一致：对话框主操作）。

| 类别 | class | 按钮（id） |
|---|---|---|
| 主操作 | `primary` | layout-add-dialog-save、layout-key-save、layout-key-display-save、layout-key-labels-save、layout-key-macro-save、layout-key-colors-save、layout-gradient-apply、layout-key-macro-event-save、layout-key-json-save、layout-aux-bar-save、theme-crop-apply、icon-slot-save（12 个） |
| 危险操作 | `danger` | layout-key-delete、layout-clear-colors-confirm、theme-crop-clear、icon-slot-clear、theme-delete-custom、icon-theme-delete、layout-delete-layout（7 个） |

**配套样式改动（style.css）**：

1. **补齐 primary 的暗色基准**——原先只在 `html.site-light` / `html.site-auto` 两处浅色覆盖里定义 `.primary`，**暗色下这个类完全不起作用**（加了等于没加）。已对照 foxy `style.css:303` 确认 foxy 是「暗色基准 + 浅色赢回」两条都有，按同样结构补齐 `button.primary / .mini-button.primary / .file-button.primary`。
2. **primary/danger 的浅色覆盖**（此前完全没有）：`html.site-light button` 的白底覆盖权重 (0,1,2) 压过 `button.primary` 的 (0,1,1)，不单独写就是白字浮白底、对比度 1.0 完全隐形。danger 在浅色下改为 `transparent + #8f2020 红字 + #fbeaea hover`，与 `.popup-entry-delete` 已有的浅红体系一致。
3. **primary/danger 的禁用态**：原先只有通用的 `button:disabled { opacity: .5 }`，primary 禁用后仍是一块明显的蓝，与可点态几乎无法区分。新增规则在半透明之外退掉强调底色。
4. **`.icon-button.danger` 补静态色**：foxy 只在 `:hover` 时给危险色，f5a 沿用会造成「平时看不出是危险操作、鼠标移上去才变红」。`layout-delete-layout` 的 🗑 按钮现在静态即为 `--danger` 色。

---

## 2. 动态行 hover 规范（5 类行）

**问题**：主题色行、宏步骤行、弹出字符行、显示映射行、图标槽行都是 JS 动态生成的密集列表，原先**只有 `.icon-slot-row` 有 hover**——几十行里没有指针反馈。

**做法**：统一一层——hover 抬到 `--bg-soft`（比 `--card-inner` 高一级，与 foxy 的表面层级语义一致），加 `--dur-fast` 过渡。只抬背景不抬边框（边框跟着变会让密集行 hover 时"抖"）。

- `.theme-color-row`、`.macro-step-row`、`.popup-entry-row`、`.display-map-row`、`.icon-slot-row`
- 附带修 `.display-map-row`：原本是裸 grid 行、连底色都没有，hover 会从透明直接跳成一块底色（"凭空浮出"）。补了 padding / 边框 / `--card-inner` 底。

---

## 3. 硬编码深底令牌化（4 处）

这些在浅色模式下是**不可读的深底配深字**，逐个换成表面令牌：

| 选择器 | 原值 | 新值 |
|---|---|---|
| `.macro-step-row` | `#141925` | `var(--card-inner)` |
| `.macro-chip` / `.macro-chip-select` | `#1e2636` | `var(--card-inner)` |
| `.macro-chip` 的 `color` | `var(--fg)` | `var(--text)` |
| — | — | — |

其中 **`var(--fg)` 是一个从未定义过的变量**（在 HEAD 版 style.css 里也没有定义），属存量 bug：颜色会 fallback 成继承值。顺手修掉。

---

## 4. 浅色覆盖补漏（宏编辑区 + pill）

沿用 foxy「发现一处补一处」的散点模式，每条 `html.site-light X` 都配一条 `@media (prefers-color-scheme: light) { html.site-auto X }`：

- **宏编辑区**：`.macro-step-row` / `.macro-chip` / `.macro-chip-select` / `.macro-chip-add` / `.macro-step-delete` 整套翻成浅底浅字，删除按钮用浅红底（与 `.popup-entry-delete` 同套色）。
- **`.pill` 未选中态**：暗色是 `#23262c` 深灰底配 `--text-dim`；浅色下若沿用会配 `--text-dim` 深灰字，对比度不足，改 `#eef0f3` + `#d4d7dd` 边框。

**已确认无需补的**：foxy 的 `button.danger` 也是 `transparent + var(--danger)`，两套主题下都成立——f5a 原先与 foxy 一致，这类不需要浅色覆盖。

---

## 5. 有依据的偏离（不照搬 foxy 的地方）

| 设计方案的条目 | 是否执行 | 理由 |
|---|---|---|
| §5.6 表单控件统一到 `mini-` 族 | **不执行** | app.js 动态生成的控件**从不带 mini- 族**（grep 计数 0），用的是自有 class：`theme-color-input` / `color-custom-input` / `macro-key-code-select` / `color-theme-select` / `display-map-key` 等。批量把静态控件换成 `mini-*` 会让静态侧（硬编码 `#17191d`）与动态侧（`var(--card-inner)`）在同一个表单里并排出现、观感撕裂。**一致性优先于局部紧凑。** |
| `.dialog-body` 包裹层 | **只加 class 不包 div** | 17 个 dialog 的 body 内容各自不同，包裹层会改变 `.editor-form` 的直接子元素关系，而 `.dialog-body .form-row`（style.css:1914）是后代选择器——不包反而天然命中。 |
| `section.panel` 加 `.tabpanel` | **不做** | `.tabpanel.active{display:block}`（L181-182）会与 `.panel.active{display:grid}`（L223）冲突，把布局的 grid 打成 block。`app.js:2279` 的 `main .panel` + `data-tab-target` 是唯一切换钩子，容器 class 只能加不能换。 |
| `.layout-workbench` → foxy `.workbench` | **不做** | 该 class 被多条规则按字面命中：归零规则 `main .layout-workbench, main .card { margin-left/right: 0 }`（style.css:199-203，注释写死结构 `main > section.panel > div.layout-workbench > .card`）、断点规则 2269-2292（两栏 grid）、2356-2361（单列回退）、2438（窄屏边距）。改名会让归零规则静默失效、横向变双倍缩进。f5a 是 grid 双栏，与 foxy 的 flex `.workbench` 结构不同。 |

---

## 6. 依赖清单（后续改动前必读）

以下规则按**字面 class** 命中，改这些 class 会静默失效：

1. `main .layout-workbench, main .card`（style.css:199-203）— 归零横向 margin。
2. `app.js` 三处 `jsonCard.querySelector(".toolbar")`（7394 / 7455 / 10080）在 `syncThemeJsonHeight` / `syncPopupJsonHeight` / `syncIconThemeJsonHeight` 里取 `offsetHeight` 算高度——**给 json-card 内 `.toolbar` 叠 class 前要先过这三处**。本轮 13 处 `dialog-toolbar` 只加在 `<dialog>` 内的底部按钮行，未触及 json-card，未影响高度计算。
3. `app.js` 按 class 取元素：`.keyboard-preview-panel`（4267 / 11413 / 11459）、`.preview-shell`（11460）、`.preview-center`（4280）、`.theme-preview-extra-side`（4281）、`.layout-main-column-card` / `.layout-main-column`（7311 / 11433）、`.theme-main-card`（2672）、`.popup-main-card`（2222）。

---

## 7. 本轮改动统计

| 文件 | 差异 | 内容 |
|---|---|---|
| `index.html` | +32/−32 | 13 处对话框底栏 `toolbar → toolbar dialog-toolbar`；19 处按钮分级（primary 12 / danger 7） |
| `style.css` | +838/−140 | 令牌体系（s4）+ 本轮：primary/danger 基准与浅色/禁用态、动态行 hover、硬编码深底令牌化、`--fg` 残留修复、宏区与 pill 浅色覆盖 |
| `js/app.js` | +5/−5 | 仅 5 处内联 style 的令牌改名（`var(--sub)`→`var(--text-dim)`、`var(--primary)`→`var(--accent)`），**数据逻辑未动** |

验证：`node tests/regressions.test.cjs` → tests 24 / pass 24 / fail 0；CSS 括号平衡深度 0；`id` 集合 325 → 325、`name` 1 → 1、`data-*` 属性名 2 → 2、`for` 13 → 13,逐类无变化(合计 341)。

**契约比对口径(可重跑)**:id / name / data-* / for 四类分别取集合后对 HEAD 与当前逐类求差,四类 lost/add 均为 0。data-* 只比对**属性名**(index.html 静态属性仅 data-slot-preview、data-icon-preview 两个);动态注入的 data-*(app.js 模板内生成)不在此口径内,由 tests/dynamic-render.test.cjs 的运行时断言覆盖。
