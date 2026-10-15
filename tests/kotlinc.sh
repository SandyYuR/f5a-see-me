#!/usr/bin/env bash
# 用 Gradle 缓存里的 kotlin-compiler-embeddable 直接跑 kotlinc(本机没有独立 kotlinc 发行版)。
# 用途:把 app 侧 ThemeRandomizer/ThemeAestheticScore 的原版 Kotlin 编成 oracle,
# 供 tests/theme-random.test.cjs 做同源随机序列的逐字段对照。
# 用法:bash tests/kotlinc.sh <源码目录或文件...> -d <输出目录> [其它 kotlinc 参数]
set -euo pipefail

GC="/c/Users/yurun/.gradle/caches/modules-2/files-2.1"
JAVA="/c/dev/jdk-17/bin/java.exe"

winpath() { # /c/Users/... -> C:\Users\...（cygwin 风格转 Windows 路径，本机没有 cygpath）
  local p="$1" drive rest
  drive="${p:1:1}"
  rest="${p:3}"
  rest="${rest//\//\\}"
  printf '%s:\\%s' "${drive^^}" "$rest"
}

CP=""
STDLIB=""
add() { # add <artifact 名> <文件名 glob>：取版本最高的那个 jar
  local f
  f=$(find "$GC/$1" -name "$2" ! -name "*-sources.jar" 2>/dev/null | sort -V | tail -1)
  [ -n "$f" ] || { echo "缺少 jar: $1/$2" >&2; return 1; }
  CP="${CP}${CP:+;}$(winpath "$f")"
}

add org.jetbrains.kotlin/kotlin-compiler-embeddable "kotlin-compiler-embeddable-*.jar"
STDLIB="$(winpath "$(find "$GC/org.jetbrains.kotlin/kotlin-stdlib" -name 'kotlin-stdlib-2*.jar' ! -name '*-sources.jar' | sort -V | tail -1)")"
add org.jetbrains.kotlin/kotlin-stdlib "kotlin-stdlib-2*.jar"
add org.jetbrains.kotlin/kotlin-reflect "kotlin-reflect-2*.jar"
add org.jetbrains.kotlin/kotlin-script-runtime "kotlin-script-runtime-2*.jar"
add org.jetbrains.kotlin/kotlin-daemon-embeddable "kotlin-daemon-embeddable-*.jar"
add org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm "kotlinx-coroutines-core-jvm-*.jar"
add org.jetbrains/annotations "annotations-*.jar" # 代码生成阶段要写 @NotNull,缺了会在 ClassCodegen 里炸

# -no-stdlib 只是关掉「去 KOTLIN_HOME 里找 stdlib」的自动行为;
# 编译期 classpath 必须显式给,否则会报 "cannot access built-in declaration 'kotlin.String'"。
exec "$JAVA" -cp "$CP" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -cp "$STDLIB" "$@"
