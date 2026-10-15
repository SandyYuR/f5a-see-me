/*
 * 从 app 侧未被改动的 Theme.kt 里机械抽出 Theme.Custom 的参数表,生成编译用的最小 stub。
 *
 * 为什么要 stub:Theme.kt 依赖 android.graphics / parcelize / serialization,没有 Android SDK
 * 就编不过。但 ThemeRandomizer.toCustomTheme 必须能调,否则「字段名 → 网站色键」这层映射
 * 就没有独立对照物。于是只保留参数名与类型(一字不改地抄),剥掉在 JVM 上编不过的
 * 注解与 Android 类型。
 *
 * 参数名、顺序、默认值全部来自原文件;本脚本不手写任何字段名。
 * 生成结果由 tests/theme-random.test.cjs 断言「参数表与原文件完全一致」。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const SRC = path.resolve(__dirname, "../../../fx-rime-only/app/src/main/java/org/fcitx/fcitx5/android/data/theme/Theme.kt");
const OUT = path.resolve(__dirname, "ThemeStub.kt");

/** 取出 `data class <name>(` 之后到与之匹配的 `)` 之间的参数文本。 */
function extractParams(text, className) {
  const start = text.indexOf(`data class ${className}(`);
  if (start < 0) throw new Error(`Theme.kt 里找不到 data class ${className}`);
  let i = text.indexOf("(", start + `data class ${className}`.length);
  let depth = 0;
  const begin = i + 1;
  for (; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error(`data class ${className} 的参数表括号不闭合`);
  return text.slice(begin, i);
}

/** 把带注解/Android 类型的参数行整理成能在纯 JVM 上编译的写法,语义不变。 */
function sanitize(raw) {
  return raw
    .split("\n")
    .map((line) =>
      line
        .replace(/@\w+(\([^)]*\))?\s*/g, "") // 剥注解
        .replace(/\bRect\?/g, "Any?") // android.graphics.Rect 无 SDK,换成 Any
        .replace(/^\s*override\s+/, "    ") // 父类属性在 stub 里不存在,去掉 override
        .replace(/\s+$/, "")
    )
    .join("\n")
    .trim();
}

const theme = fs.readFileSync(SRC, "utf8");
const customParams = sanitize(extractParams(theme, "Custom"));
const backgroundParams = sanitize(extractParams(theme, "CustomBackground"));

// 采集到的字段名清单,供测试断言(只认 `val x: T` 形式的参数)。
function fieldNames(paramText) {
  return paramText
    .split(/,\s*\n/)
    .map((part) => (part.match(/\bval\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/) || [])[1])
    .filter(Boolean);
}

const stub = `/*
 * 自动生成,请勿手改:由 tests/oracle/make-theme-stub.cjs 从
 * fx-rime-only/app/src/main/java/org/fcitx/fcitx5/android/data/theme/Theme.kt 抽出。
 * 只保留 Theme.Custom 的参数表,供 Oracle 编译 ThemeRandomizer.kt 使用。
 */
package org.fcitx.fcitx5.android.data.theme

sealed class Theme {
    data class CustomBackground(
${backgroundParams}
    )

    data class Custom(
${customParams}
    ) : Theme()

    companion object {
        /** 原文件里的字段顺序,供对照脚本核对 stub 没有被手改。 */
        val CUSTOM_FIELDS = listOf(${fieldNames(customParams).map((n) => `"${n}"`).join(", ")})
        val BACKGROUND_FIELDS = listOf(${fieldNames(backgroundParams).map((n) => `"${n}"`).join(", ")})
        val SOURCE_SHA1 = "${require("crypto").createHash("sha1").update(fs.readFileSync(SRC)).digest("hex")}"
    }
}
`;

fs.writeFileSync(OUT, stub);
console.log(JSON.stringify({
  out: path.relative(path.resolve(__dirname, "../.."), OUT),
  customFields: fieldNames(customParams),
  customFieldCount: fieldNames(customParams).length,
  backgroundFields: fieldNames(backgroundParams),
  sourceSha1: require("crypto").createHash("sha1").update(fs.readFileSync(SRC)).digest("hex")
}, null, 2));
