/*
 * 随机主题:app 侧 ThemeRandomizer.kt + ThemeAestheticScore.kt 的 JS 等价移植。
 *
 * 为什么要有这个文件:f5a-see-me 的主题模型与 app 的 Theme.Custom 是同名 21 token,
 * 随机主题算法本身就是「网站色板」上加一层到 21 token 的映射。算法确定性强,可以逐行照搬。
 *
 * 与原实现的唯一区别是随机源:JS 侧不重造 Kotlin 的 PRNG,而是消费一串 nextDouble()。
 * 这样测试可以喂进 oracle 从真实 Kotlin 导出的一模一样的数列
 * (tests/oracle/run-oracle.sh → refactor-notes/random-theme-oracle.json 的 sequences),
 * 「同一随机序列下产出同一结果」就能逐字段核,而不是拿自己抄的参数自证。
 *
 * 对照读数见 tests/theme-random.test.cjs。
 */
(function () {
  "use strict";

  // ---- 常量:与 ThemeRandomizer.kt 顶部逐一对应 ----
  const DEFAULT_THEME_NAME = "Random Theme";
  const MAX_ATTEMPTS = 100;
  const EARLY_STOP_SCORE = 88;
  const SCHEMES = ["analogous", "complementary", "triadic", "split-comp", "mono"];

  const LIGHT_KEY_PRESS_ALPHA = 0x1f;
  const DARK_KEY_PRESS_ALPHA = 0x33;
  const WATER_RIPPLE_ALPHA = 0x80;

  // ---- ThemeAestheticScore.kt ----

  /** Kotlin 的 floor(value + 0.5).toInt():floor 之后已是整数,JS 的 Math.floor 等价。 */
  function jsRound(value) {
    return Math.floor(value + 0.5);
  }

  /** hslToRgb:含输入钳制(h 纳模 360,s/l 钳到 0..100)。 */
  function hslToRgb(hue, saturation, lightness) {
    const h = ((hue % 360.0) + 360.0) % 360.0;
    const s = Math.min(Math.max(saturation, 0.0), 100.0) / 100.0;
    const l = Math.min(Math.max(lightness, 0.0), 100.0) / 100.0;
    const c = (1.0 - Math.abs(2.0 * l - 1.0)) * s;
    const x = c * (1.0 - Math.abs(((h / 60.0) % 2.0) - 1.0));
    const m = l - c / 2.0;
    let r, g, b;
    if (h < 60.0) { r = c; g = x; b = 0.0; }
    else if (h < 120.0) { r = x; g = c; b = 0.0; }
    else if (h < 180.0) { r = 0.0; g = c; b = x; }
    else if (h < 240.0) { r = 0.0; g = x; b = c; }
    else if (h < 300.0) { r = x; g = 0.0; b = c; }
    else { r = c; g = 0.0; b = x; }
    return {
      red: jsRound((r + m) * 255.0),
      green: jsRound((g + m) * 255.0),
      blue: jsRound((b + m) * 255.0)
    };
  }

  /** 小写 #rrggbb。分量补零到两位。 */
  function hslToHex(hue, saturation, lightness) {
    const rgb = hslToRgb(hue, saturation, lightness);
    const part = (v) => v.toString(16).padStart(2, "0");
    return `#${part(rgb.red)}${part(rgb.green)}${part(rgb.blue)}`;
  }

  /** hexToRgb:长度 8 时按 #AARRGGBB 丢掉前两位;长度 3 时每位双写;解析失败按 0。 */
  function hexToRgb(hex) {
    let value = String(hex);
    if (value.startsWith("#")) value = value.slice(1);
    if (value.length === 8) value = value.slice(2);
    if (value.length === 3) value = value.split("").map((ch) => ch + ch).join("");
    // Kotlin 是 toLongOrNull(16) ?: 0L:非十六进制整串一律退化成 0。
    let number = 0;
    if (/^[0-9a-fA-F]+$/.test(value)) number = parseInt(value, 16);
    return {
      red: (number >>> 16) & 0xff,
      green: (number >>> 8) & 0xff,
      blue: number & 0xff
    };
  }

  /** rgbToHsl:h 不纳模。 */
  function rgbToHsl(rgb) {
    const r = rgb.red / 255.0;
    const g = rgb.green / 255.0;
    const b = rgb.blue / 255.0;
    const maxChannel = Math.max(r, Math.max(g, b));
    const minChannel = Math.min(r, Math.min(g, b));
    let h = 0.0;
    let s = 0.0;
    const l = (maxChannel + minChannel) / 2.0;
    if (maxChannel !== minChannel) {
      const d = maxChannel - minChannel;
      s = l > 0.5 ? d / (2.0 - maxChannel - minChannel) : d / (maxChannel + minChannel);
      if (maxChannel === r) h = ((g - b) / d + (g < b ? 6.0 : 0.0)) * 60.0;
      else if (maxChannel === g) h = ((b - r) / d + 2.0) * 60.0;
      else h = ((r - g) / d + 4.0) * 60.0;
    }
    return { hue: h, saturation: s * 100.0, lightness: l * 100.0 };
  }

  /** WCAG 相对亮度,分界点用原实现的 0.03928。 */
  function relativeLuminance(rgb) {
    const toLinear = (channel) => {
      const c = channel / 255.0;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(rgb.red) + 0.7152 * toLinear(rgb.green) + 0.0722 * toLinear(rgb.blue);
  }

  function contrastRatio(first, second) {
    const a = typeof first === "string" ? hexToRgb(first) : first;
    const b = typeof second === "string" ? hexToRgb(second) : second;
    const firstLuminance = relativeLuminance(a);
    const secondLuminance = relativeLuminance(b);
    const lighter = Math.max(firstLuminance, secondLuminance);
    const darker = Math.min(firstLuminance, secondLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function hueDist(first, second) {
    const distance = Math.abs(first - second) % 360.0;
    return distance > 180.0 ? 360.0 - distance : distance;
  }

  // 评分用的 9 组对比对(前景、背景、权重),顺序与原实现一致。
  const CONTRAST_PAIRS = [
    ["keyText", "keyBackground", 6],
    ["specialKeyText", "specialKeyBackground", 5],
    ["accentKeyText", "accentKeyBackground", 6],
    ["panel.candidateText", "panel.candidateBackground", 4],
    ["panel.toolbarText", "panel.background", 4],
    ["panel.candidateIndex", "panel.candidateBackground", 3],
    ["pinner.textColor", "pinner.background", 4],
    ["pinner.secondaryTextColor", "pinner.background", 2],
    ["altText", "background", 3]
  ];

  /** scoreTheme:加权对比 40 分 + 色相 25 分 + 饱和 20 分 + 明度 15 分,满分 100。 */
  function scoreTheme(candidate) {
    const colors = candidate.colors;
    const color = (key) => {
      const value = colors[key];
      if (value === undefined) throw new Error(`Theme candidate is missing website color '${key}'`);
      return value;
    };

    let contrastScore = 0.0;
    let totalWeight = 0;
    let minRatio = 21.0;
    CONTRAST_PAIRS.forEach(([foreground, background, weight]) => {
      const ratio = contrastRatio(color(foreground), color(background));
      minRatio = Math.min(minRatio, ratio);
      let ratioScore;
      if (ratio >= 7.0) ratioScore = 1.0;
      else if (ratio >= 4.5) ratioScore = 0.85;
      else if (ratio >= 3.0) ratioScore = 0.6;
      else if (ratio >= 2.0) ratioScore = 0.3;
      else if (ratio >= 1.5) ratioScore = 0.1;
      else ratioScore = 0.0;
      contrastScore += ratioScore * weight;
      totalWeight += weight;
    });
    contrastScore = (contrastScore / totalWeight) * 40.0;
    if (minRatio < 2.0) contrastScore *= 0.25;
    else if (minRatio < 3.0) contrastScore *= 0.55;

    const baseHue = rgbToHsl(hexToRgb(color("keyBackground"))).hue;
    const accentHue = rgbToHsl(hexToRgb(color("accentKeyBackground"))).hue;
    const panelHue = rgbToHsl(hexToRgb(color("panel.background"))).hue;
    const pinnerHue = rgbToHsl(hexToRgb(color("pinner.background"))).hue;
    const d1 = hueDist(baseHue, accentHue);
    const d2 = hueDist(baseHue, panelHue);
    const d3 = hueDist(baseHue, pinnerHue);

    let hueScore = 25.0;
    const evalHueDist = (distance) => {
      if (distance <= 15.0) return 1.0;
      if (distance >= 20.0 && distance <= 50.0) return 1.0;
      if (distance >= 100.0 && distance <= 140.0) return 0.92;
      if (distance >= 155.0 && distance <= 205.0) return 0.95;
      if (distance >= 50.0 && distance <= 100.0) return 0.35;
      if (distance >= 140.0 && distance <= 155.0) return 0.7;
      if (distance >= 205.0 && distance <= 300.0) return 0.25;
      return 0.15;
    };
    hueScore *= evalHueDist(d1);
    if (d2 > 60.0) hueScore -= 5.0;
    if (d3 > 60.0) hueScore -= 3.0;
    if (candidate.scheme === "mono" && d1 > 30.0) hueScore -= 6.0;
    hueScore = Math.max(0.0, hueScore);

    const hslValues = Object.keys(colors).map((key) => rgbToHsl(hexToRgb(colors[key])));
    const saturations = hslValues.map((hsl) => hsl.saturation);
    const averageSaturation = saturations.reduce((a, b) => a + b, 0) / saturations.length;
    const maxSaturation = saturations.reduce((a, b) => Math.max(a, b), 0.0);
    let saturationScore = 20.0;
    if (maxSaturation > 92.0) saturationScore -= 15.0;
    else if (maxSaturation > 82.0) saturationScore -= 8.0;
    else if (maxSaturation > 72.0) saturationScore -= 3.0;
    if (averageSaturation < 22.0 || averageSaturation > 48.0) {
      if (averageSaturation < 12.0 || averageSaturation > 60.0) saturationScore -= 9.0;
      else saturationScore -= 3.0;
    }
    saturationScore = Math.max(0.0, saturationScore);

    const lightnesses = hslValues.map((hsl) => hsl.lightness);
    const averageLightness = lightnesses.reduce((a, b) => a + b, 0) / lightnesses.length;
    const variance = lightnesses.reduce((a, v) => a + Math.pow(v - averageLightness, 2), 0) / lightnesses.length;
    const lightnessStandardDeviation = Math.sqrt(variance);
    let lightnessScore = 15.0;
    if (lightnessStandardDeviation < 8.0) lightnessScore -= 10.0;
    else if (lightnessStandardDeviation < 12.0) lightnessScore -= 5.0;
    else if (lightnessStandardDeviation >= 15.0 && lightnessStandardDeviation <= 32.0) lightnessScore -= 0.0;
    else if (lightnessStandardDeviation > 42.0) lightnessScore -= 8.0;
    else if (lightnessStandardDeviation > 32.0) lightnessScore -= 3.0;
    lightnessScore = Math.max(0.0, lightnessScore);

    const total = contrastScore + hueScore + saturationScore + lightnessScore;
    return {
      total: jsRound(total),
      contrast: jsRound(contrastScore),
      hue: jsRound(hueScore),
      sat: jsRound(saturationScore),
      light: jsRound(lightnessScore),
      minRatio
    };
  }

  // ---- ThemeRandomizer.kt ----

  /**
   * 生成一个「网站色板」候选:随机取数顺序与原实现严格一致,
   * 少取或多取一个 double 都会让后续所有字段错位。
   */
  function generateCandidate(random) {
    const next = () => random.nextDouble();

    const isDark = next() < 0.38;
    const scheme = SCHEMES[Math.trunc(next() * SCHEMES.length)];
    const baseHue = next() * 360.0;
    let accentHue;
    if (scheme === "analogous") accentHue = baseHue + (20.0 + next() * 30.0);
    else if (scheme === "complementary") accentHue = baseHue + 180.0;
    else if (scheme === "triadic") accentHue = baseHue + 120.0;
    else if (scheme === "split-comp") accentHue = baseHue + 150.0;
    else accentHue = baseHue; // mono 与未知分支都等于 baseHue
    accentHue = ((accentHue % 360.0) + 360.0) % 360.0;

    const baseSat = 22.0 + next() * 45.0;

    // 14 个参数的取值顺序必须照抄:其中 7 个 L 值各消费一个 double。
    let bgL, bgS, keyBgL, keyBgS, keyTextL, keyTextS, borderL, borderS,
      accentL, accentS, panelBgL, panelBgS, pinnerBgL, pinnerBgS;
    if (isDark) {
      bgL = 9.0 + next() * 8.0; bgS = baseSat * 0.25;
      keyBgL = 22.0 + next() * 8.0; keyBgS = baseSat * 0.42;
      keyTextL = 88.0 + next() * 8.0; keyTextS = baseSat * 0.15;
      borderL = 34.0 + next() * 12.0; borderS = baseSat * 0.42;
      accentL = 52.0 + next() * 14.0; accentS = baseSat * 0.72;
      panelBgL = 15.0 + next() * 8.0; panelBgS = baseSat * 0.28;
      pinnerBgL = 26.0 + next() * 10.0; pinnerBgS = baseSat * 0.38;
    } else {
      bgL = 96.0 + next() * 3.0; bgS = baseSat * 0.12;
      keyBgL = 89.0 + next() * 7.0; keyBgS = baseSat * 0.32;
      keyTextL = 16.0 + next() * 14.0; keyTextS = baseSat * 0.42;
      borderL = 74.0 + next() * 14.0; borderS = baseSat * 0.32;
      accentL = 42.0 + next() * 14.0; accentS = baseSat * 0.68;
      panelBgL = 93.0 + next() * 4.0; panelBgS = baseSat * 0.18;
      pinnerBgL = 85.0 + next() * 8.0; pinnerBgS = baseSat * 0.28;
    }

    const accentTextL = accentL < 55.0 ? 96.0 : 12.0;
    const accentTextS = accentL < 55.0 ? 8.0 : 15.0;
    const color = (hue, saturation, lightness) => hslToHex(hue, saturation, lightness);

    // 插入顺序即评分时 colors.values 的遍历顺序,不要重排。
    const colors = {
      keyBackground: color(baseHue, keyBgS, keyBgL),
      keyPressed: color(baseHue, keyBgS + 8.0, isDark ? keyBgL + 6.0 : keyBgL - 8.0),
      keyBorderStroke: color(baseHue, borderS, borderL),
      keyText: color(baseHue, keyTextS, keyTextL),
      specialKeyBackground: color(baseHue, keyBgS * 0.85, isDark ? keyBgL + 4.0 : keyBgL - 4.0),
      specialKeyPressed: color(baseHue, keyBgS + 6.0, isDark ? keyBgL + 8.0 : keyBgL - 10.0),
      specialKeyBorderStroke: color(baseHue, borderS, borderL),
      specialKeyText: color(baseHue, keyTextS, keyTextL),
      accentKeyBackground: color(accentHue, accentS, accentL),
      accentKeyPressed: color(accentHue, accentS, accentL - 10.0),
      accentKeyBorderStroke: color(accentHue, accentS, accentL - 5.0),
      accentKeyText: color(accentHue, accentTextS, accentTextL),
      altText: color(baseHue, keyTextS * 0.5, isDark ? keyTextL - 22.0 : keyTextL + 26.0),
      background: color(baseHue, bgS, bgL),
      "panel.background": color(baseHue, panelBgS, panelBgL),
      "panel.toolbarText": color(baseHue, keyTextS * 0.7, keyTextL - 4.0),
      "panel.toolbarActived": color(accentHue, accentS * 0.92, accentL),
      "panel.toolbarIcon": color(baseHue, keyTextS * 0.7, keyTextL - 4.0),
      "panel.candidateBackground": color(baseHue, panelBgS, panelBgL),
      "panel.candidateText": color(baseHue, keyTextS, keyTextL),
      "panel.candidateIndex": color(accentHue, accentS * 0.88, accentL),
      "panel.candidateDivider": color(baseHue, borderS * 0.85, borderL),
      "panel.toolbarPressed": color(accentHue, accentS * 0.5, isDark ? panelBgL + 10.0 : panelBgL - 5.0),
      "pinner.background": color(baseHue, pinnerBgS, pinnerBgL),
      "pinner.textColor": color(baseHue, keyTextS, keyTextL),
      "pinner.secondaryTextColor": color(baseHue, keyTextS * 0.5, isDark ? keyTextL - 22.0 : keyTextL + 22.0),
      toastBackground: color(baseHue, keyBgS * 0.6, isDark ? 32.0 : 28.0),
      toastText: color(baseHue, 8.0, 96.0)
    };

    // surfaceStyle 在色板之后才取票,顺序不能提前。
    const surfaceStyle = next() * 2.0 < 1.0 ? "Raised" : "Flat";

    return {
      colors,
      scheme,
      baseHue,
      accentHue,
      baseSat,
      isDark,
      surfaceStyle
    };
  }

  /** 网站色 #RRGGBB → 不透明 #AARRGGBB 整数。 */
  function opaqueArgb(hex) {
    const rgb = hexToRgb(hex);
    return ((0xff << 24) | (rgb.red << 16) | (rgb.green << 8) | rgb.blue) | 0;
  }

  function withAlpha(color, alpha) {
    const clamped = Math.min(Math.max(alpha, 0), 255);
    return ((color & 0x00ffffff) | (clamped << 24)) | 0;
  }

  /** 21 个 f5a token 的落点:字段名 → 网站色键。 */
  const APP_FIELD_MAP = [
    ["backgroundColor", "background"],
    ["barColor", "panel.background"],
    ["keyboardColor", "background"],
    ["keyBackgroundColor", "keyBackground"],
    ["keyTextColor", "keyText"],
    ["candidateTextColor", "panel.candidateText"],
    ["candidateLabelColor", "panel.candidateIndex"],
    ["candidateCommentColor", "pinner.secondaryTextColor"],
    ["altKeyBackgroundColor", "specialKeyBackground"],
    ["altKeyTextColor", "specialKeyText"],
    ["accentKeyBackgroundColor", "accentKeyBackground"],
    ["accentKeyTextColor", "accentKeyText"],
    ["keyShadowColor", "keyBorderStroke"],
    ["popupBackgroundColor", "toastBackground"],
    ["popupTextColor", "toastText"],
    ["spaceBarColor", "specialKeyBackground"],
    ["dividerColor", "panel.candidateDivider"],
    ["clipboardEntryColor", "panel.toolbarPressed"],
    ["genericActiveBackgroundColor", "panel.toolbarActived"],
    ["genericActiveForegroundColor", "panel.toolbarText"]
  ];

  /**
   * 网站色板 → f5a 的 21 个 token(带符号 int32)。
   * keyPressHighlightColor 与 waterRippleColor 带 alpha,单独算。
   */
  function toThemeColors(candidate) {
    const colors = candidate.colors;
    const websiteColor = (key) => {
      const value = colors[key];
      if (value === undefined) throw new Error(`Theme candidate is missing website color '${key}'`);
      return opaqueArgb(value);
    };
    const out = {};
    APP_FIELD_MAP.forEach(([field, siteKey]) => { out[field] = websiteColor(siteKey); });
    const pressAlpha = candidate.isDark ? DARK_KEY_PRESS_ALPHA : LIGHT_KEY_PRESS_ALPHA;
    out.keyPressHighlightColor = withAlpha(websiteColor("keyPressed"), pressAlpha);
    out.waterRippleColor = withAlpha(websiteColor("accentKeyPressed"), WATER_RIPPLE_ALPHA);
    return out;
  }

  /** 展开成 f5a 主题对象(与 app.js 里内置预设同形)。 */
  function toTheme(candidate, name) {
    return {
      name: name || DEFAULT_THEME_NAME,
      isDark: candidate.isDark,
      backgroundImage: "",
      colors: toThemeColors(candidate)
    };
  }

  /**
   * 生成至多 MAX_ATTEMPTS 个候选,取评分最高者;一旦 bestTotal 达到 EARLY_STOP_SCORE 提前停。
   * 返回 { theme, candidate, score, attempts };surfaceStyle 一并带出便于界面展示。
   */
  function generateBestRandomTheme(random, name) {
    let bestCandidate = null;
    let bestScore = null;
    let bestTotal = -2147483648;
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
      const candidate = generateCandidate(random);
      const score = scoreTheme(candidate);
      attempts += 1;
      if (score.total > bestTotal) {
        bestTotal = score.total;
        bestCandidate = candidate;
        bestScore = score;
      }
      if (bestTotal >= EARLY_STOP_SCORE) break;
    }

    if (!bestCandidate) throw new Error("No random theme candidate was generated");
    return {
      theme: toTheme(bestCandidate, name),
      candidate: bestCandidate,
      score: bestScore,
      attempts
    };
  }

  // ---- 随机源 ----

  /** 消费固定 double 序列的随机源:用来喂 oracle 导出的真 Kotlin 数列。 */
  function createSequenceRandom(values) {
    let index = 0;
    return {
      get consumed() { return index; },
      nextDouble() {
        if (index >= values.length) throw new Error("随机序列已耗尽,请给更长的序列");
        const value = values[index];
        index += 1;
        return value;
      }
    };
  }

  /** 浏览器可用的随机源,等价于 Kotlin 的 Random.Default。 */
  function createBrowserRandom() {
    const cryptoObj = (typeof window !== "undefined" && window.crypto) || null;
    if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
      const buffer = new Uint32Array(2);
      return {
        nextDouble() {
          cryptoObj.getRandomValues(buffer);
          // 取 53 位有效位拼成 [0,1),与 Math.random 的取值范围一致。
          const hi = buffer[0] >>> 5;  // 27 位
          const lo = buffer[1] >>> 6;  // 26 位
          return (hi * 67108864 + lo) / 9007199254740992;
        }
      };
    }
    return { nextDouble: () => Math.random() };
  }

  const api = {
    DEFAULT_THEME_NAME,
    MAX_ATTEMPTS,
    EARLY_STOP_SCORE,
    SCHEMES,
    LIGHT_KEY_PRESS_ALPHA,
    DARK_KEY_PRESS_ALPHA,
    WATER_RIPPLE_ALPHA,
    jsRound,
    hslToRgb,
    hslToHex,
    hexToRgb,
    rgbToHsl,
    relativeLuminance,
    contrastRatio,
    hueDist,
    scoreTheme,
    generateCandidate,
    toThemeColors,
    toTheme,
    generateBestRandomTheme,
    createSequenceRandom,
    createBrowserRandom,
    APP_FIELD_MAP
  };

  if (typeof window !== "undefined") window.F5aRandomTheme = api;
  if (typeof globalThis !== "undefined" && globalThis !== (typeof window !== "undefined" ? window : null)) {
    globalThis.F5aRandomTheme = api;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
