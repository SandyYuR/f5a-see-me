#!/usr/bin/env bash
# 编译并运行 Kotlin oracle,把 app 侧随机主题在固定随机源下的输出写成 JSON 快照。
#
# 产物:refactor-notes/random-theme-oracle.json
# 用法:bash tests/oracle/run-oracle.sh [app 源码根]
#
# 之所以要真编 Kotlin:判据要求「JS 移植与 app 的 ThemeRandomizer 在同源随机序列下
# 复现同一结果」。拿我自己抄的参数当参照物等于自证,所以这里直接跑未改动的原文件。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
APP_SRC="${1:-$REPO/../fx-rime-only}"

# 注意不能用 /tmp:那是 cygwin 挂载点,不是真实盘符路径,转不成 Windows 路径给 java 用。
BUILD="/c/Users/yurun/AppData/Local/Temp/f5a-kotlin-oracle"
GCLIB="/c/Users/yurun/.gradle/caches/modules-2/files-2.1"

winpath() { # cygwin 风格 -> Windows 路径(本机没有 cygpath)
  # dsh-bash 的 pwd 给的是 /cygdrive/d/...,而资源路径是 /c/...;两种前缀都要认。
  local p="${1#/cygdrive}" drive rest
  drive="${p:1:1}"; rest="${p:3}"; rest="${rest//\//\\}"
  printf '%s:\\%s' "${drive^^}" "$rest"
}

# 相对路径先取绝对路径,否则 winpath 会把 "." 当成盘符。
APP_SRC_ABS="$(cd "$APP_SRC" && pwd)"
APP_SRC_WIN="$(winpath "$APP_SRC_ABS")"

jar_of() { # jar_of <artifact 目录> <文件名 glob> -> 版本最高的那个 jar 的 Windows 路径
  local f
  f=$(find "$GCLIB/$1" -name "$2" ! -name "*-sources.jar" 2>/dev/null | sort -V | tail -1)
  [ -n "$f" ] || { echo "缺少 jar: $1/$2" >&2; return 1; }
  winpath "$f"
}

# stub 随 Theme.kt 一起重生成:字段名从原文件机械抽出,不是手写。
node "$HERE/make-theme-stub.cjs" >/dev/null

rm -rf "$BUILD"
mkdir -p "$BUILD"

bash "$REPO/tests/kotlinc.sh" \
  "$HERE/Oracle.kt" "$HERE/ThemeStub.kt" \
  "$APP_SRC_ABS/app/src/main/java/org/fcitx/fcitx5/android/data/theme/ThemeRandomizer.kt" \
  "$APP_SRC_ABS/app/src/main/java/org/fcitx/fcitx5/android/data/theme/ThemeAestheticScore.kt" \
  -d "$BUILD"

RUNTIME="$(jar_of org.jetbrains.kotlin/kotlin-stdlib 'kotlin-stdlib-2*.jar')"
RUNTIME="$RUNTIME;$(jar_of org.jetbrains.kotlin/kotlin-reflect 'kotlin-reflect-2*.jar')"
RUNTIME="$RUNTIME;$(jar_of org.jetbrains/annotations 'annotations-*.jar')"
RUNTIME="$RUNTIME;$(winpath "$BUILD")"

OUT="$REPO/refactor-notes/random-theme-oracle.json"
/c/dev/jdk-17/bin/java.exe -cp "$RUNTIME" oracle.OracleKt "$APP_SRC_WIN" > "$OUT"

node -e '
const fs = require("fs");
const p = process.argv[1];
const d = JSON.parse(fs.readFileSync(p, "utf8"));
console.log(JSON.stringify({
  out: p,
  source: d.source.sha1,
  bestOf: d.bestOf.map((b) => ({ label: b.label, attempts: b.result.attempts, total: b.result.score.total, scheme: b.result.candidate.scheme })),
  boundaryKeys: Object.keys(d.boundaries)
}, null, 2));
' "$OUT"
