/*
 * Oracle 驱动:直接调用 app 侧未改动的 ThemeRandomizer / ThemeAestheticScore,
 * 在固定随机源下把候选色板、评分导出为 JSON 快照,并回放 toCustomTheme 的映射公式。
 *
 * 它同时承担「对照物未被改动」的自证:输出两个源文件的 SHA-1,与
 * tests/theme-random-parity.json 里记录的值比对,对不上就说明参照物变了。
 *
 * 这里只桥接 JVM 侧没有的 Kotlin 类型:kotlin.random.Random 的零值实现。
 * 算法本身一行都没有改写;app 主题字段名是从 Theme.kt 原样抄下来的,
 * 映射关系在 tests/theme-random.test.cjs 里另有静态断言守着。
 */
package oracle

import org.fcitx.fcitx5.android.data.theme.RandomThemeResult
import org.fcitx.fcitx5.android.data.theme.ThemeAestheticScore
import org.fcitx.fcitx5.android.data.theme.ThemeCandidate
import org.fcitx.fcitx5.android.data.theme.ThemeRandomizer
import org.fcitx.fcitx5.android.data.theme.ThemeScore
import kotlin.random.Random

/** nextBits 恒返回 0 的随机源,对应 Kotlin 单测里的 ZeroRandom。 */
private object ZeroRandom : Random() {
    override fun nextBits(bitCount: Int): Int = 0
}

private fun jsonString(value: String): String {
    val sb = StringBuilder("\"")
    value.forEach { c ->
        when (c) {
            '"' -> sb.append("\\\"")
            '\\' -> sb.append("\\\\")
            '\n' -> sb.append("\\n")
            '\r' -> sb.append("\\r")
            '\t' -> sb.append("\\t")
            else -> if (c.code < 0x20) sb.append("\\u").append(c.code.toString(16).padStart(4, '0')) else sb.append(c)
        }
    }
    return sb.append("\"").toString()
}

private fun <T> jsonArray(items: List<T>, render: (T) -> String): String =
    items.joinToString(prefix = "[", postfix = "]", separator = ",") { render(it) }

private fun hexToInt(hex: String): Int = ThemeAestheticScore.hexToRgb(hex).let {
    (0xff shl 24) or (it.red shl 16) or (it.green shl 8) or it.blue
}

private fun pad8(v: Int): String = v.toUInt().toString(16).padStart(8, '0')

private fun renderColors(colors: Map<String, String>): String =
    colors.entries.joinToString(prefix = "{", postfix = "}", separator = ",") { (k, v) ->
        "${jsonString(k)}:${jsonString(v)}"
    }

private fun renderScore(score: ThemeScore): String = buildString {
    append("{")
    append("\"total\":").append(score.total).append(",")
    append("\"contrast\":").append(score.contrast).append(",")
    append("\"hue\":").append(score.hue).append(",")
    append("\"sat\":").append(score.sat).append(",")
    append("\"light\":").append(score.light).append(",")
    append("\"minRatio\":").append(score.minRatio)
    append("}")
}

private fun renderCandidate(candidate: ThemeCandidate): String = buildString {
    append("{")
    append("\"scheme\":").append(jsonString(candidate.scheme)).append(",")
    append("\"isDark\":").append(candidate.isDark).append(",")
    append("\"baseHue\":").append(candidate.baseHue).append(",")
    append("\"accentHue\":").append(candidate.accentHue).append(",")
    append("\"baseSat\":").append(candidate.baseSat).append(",")
    append("\"surfaceStyle\":").append(jsonString(candidate.surfaceStyle)).append(",")
    append("\"colors\":").append(renderColors(candidate.colors))
    append("}")
}

/** 回放 ThemeRandomizer.toCustomTheme 的常量与 withAlpha 语义(用于给 JS 侧更多可对照的读数)。 */
private const val LIGHT_KEY_PRESS_ALPHA = 0x1f
private const val DARK_KEY_PRESS_ALPHA = 0x33
private const val WATER_RIPPLE_ALPHA = 0x80

private fun withAlpha(color: Int, alpha: Int): Int =
    (color and 0x00ffffff) or ((alpha.coerceIn(0, 255)) shl 24)

private fun renderAppTheme(result: RandomThemeResult): String {
    val candidate = result.candidate
    val c = candidate.colors
    val pressAlpha = if (candidate.isDark) DARK_KEY_PRESS_ALPHA else LIGHT_KEY_PRESS_ALPHA
    // 与 toCustomTheme 的 21 个色字段一一对应:字段名 → 网站色键
    val mapping = listOf(
        "backgroundColor" to "background",
        "barColor" to "panel.background",
        "keyboardColor" to "background",
        "keyBackgroundColor" to "keyBackground",
        "keyTextColor" to "keyText",
        "candidateTextColor" to "panel.candidateText",
        "candidateLabelColor" to "panel.candidateIndex",
        "candidateCommentColor" to "pinner.secondaryTextColor",
        "altKeyBackgroundColor" to "specialKeyBackground",
        "altKeyTextColor" to "specialKeyText",
        "accentKeyBackgroundColor" to "accentKeyBackground",
        "accentKeyTextColor" to "accentKeyText",
        "keyShadowColor" to "keyBorderStroke",
        "popupBackgroundColor" to "toastBackground",
        "popupTextColor" to "toastText",
        "spaceBarColor" to "specialKeyBackground",
        "dividerColor" to "panel.candidateDivider",
        "clipboardEntryColor" to "panel.toolbarPressed",
        "genericActiveBackgroundColor" to "panel.toolbarActived",
        "genericActiveForegroundColor" to "panel.toolbarText"
    )
    val entries = mapping.map { (field, siteKey) ->
        "${jsonString(field)}:${jsonString("#" + pad8(hexToInt(c.getValue(siteKey))))}"
    } + listOf(
        "${jsonString("keyPressHighlightColor")}:${jsonString("#" + pad8(withAlpha(hexToInt(c.getValue("keyPressed")), pressAlpha)))}",
        "${jsonString("waterRippleColor")}:${jsonString("#" + pad8(withAlpha(hexToInt(c.getValue("accentKeyPressed")), WATER_RIPPLE_ALPHA)))}"
    )
    return buildString {
        append("{")
        append("\"name\":").append(jsonString(result.theme.name)).append(",")
        append("\"isDark\":").append(result.theme.isDark).append(",")
        append("\"keyPressAlpha\":").append(pressAlpha).append(",")
        append("\"colors\":{").append(entries.joinToString(",")).append("}")
        append("}")
    }
}

private fun renderResult(result: RandomThemeResult): String = buildString {
    append("{")
    append("\"attempts\":").append(result.attempts).append(",")
    append("\"candidate\":").append(renderCandidate(result.candidate)).append(",")
    append("\"score\":").append(renderScore(result.score)).append(",")
    append("\"app\":").append(renderAppTheme(result))
    append("}")
}

private fun sha1Of(path: String): String {
    val bytes = java.io.File(path).readBytes()
    val md = java.security.MessageDigest.getInstance("SHA-1")
    return md.digest(bytes).joinToString("") { "%02x".format(it) }
}

/**
 * 把 Kotlin 随机源实际吐出的 double 序列原样导出。
 *
 * 为什么导出序列而不是让 JS 重新实现 Kotlin 的 PRNG:判据要的是「同源随机序列下产出同一结果」,
 * 直接喂同一串 double 就把 PRNG 实现差异彻底排除在对照之外——JS 侧只要按同一取数顺序消费,
 * 剩余的任何字段不一致都只能来自算法本身。序列长度按最坏情况给:100 次尝试 × 每次约 22 个 double。
 */
private const val RAW_SEQUENCE_LENGTH = 2400

private fun rawSequence(random: Random): String =
    (0 until RAW_SEQUENCE_LENGTH).joinToString(prefix = "[", postfix = "]", separator = ",") {
        random.nextDouble().toString()
    }

private fun seededRandom(label: String): Random = when (label) {
    "zero" -> ZeroRandom
    "seed713" -> Random(713)
    "seed20" -> Random(20)
    "seed20261014" -> Random(20261014)
    "seed1" -> Random(1)
    else -> error("未登记的随机源标签:$label")
}

private const val RANDOMIZER = "app/src/main/java/org/fcitx/fcitx5/android/data/theme/ThemeRandomizer.kt"
private const val SCORER = "app/src/main/java/org/fcitx/fcitx5/android/data/theme/ThemeAestheticScore.kt"

fun main(args: Array<String>) {
    val srcRoot = args.getOrNull(0) ?: "../fx-rime-only"

    // 单候选:随机调用次数固定,用来钉 generateCandidate 的取数顺序与公式。
    val singles = jsonArray(listOf("zero", "seed713", "seed1")) { label ->
        val candidate = when (label) {
            "zero" -> ThemeRandomizer.generateCandidate(ZeroRandom)
            "seed713" -> ThemeRandomizer.generateCandidate(Random(713))
            else -> ThemeRandomizer.generateCandidate(Random(1))
        }
        buildString {
            append("{")
            append("\"label\":").append(jsonString(label)).append(",")
            append("\"candidate\":").append(renderCandidate(candidate)).append(",")
            append("\"score\":").append(renderScore(ThemeAestheticScore.scoreTheme(candidate)))
            append("}")
        }
    }

    // best-of-N:覆盖提前退出分支,并给出 toCustomTheme 的逐字段读数。
    val bestOf = jsonArray(listOf("zero" to ZeroRandom, "seed20" to Random(20), "seed20261014" to Random(20261014))) { pair ->
        val (label, random) = pair
        val result = ThemeRandomizer.generateBestRandomTheme(random, "oracle-$label")
        buildString {
            append("{")
            append("\"label\":").append(jsonString(label)).append(",")
            // renderResult 返回的是完整对象,必须挂在键下面,否则拼出 {"label":"x",{...}} 这种非法 JSON。
            append("\"result\":").append(renderResult(result))
            append("}")
        }
    }

    // 同源随机序列:每个标签一份全新的 Random(或 ZeroRandom),序列本身是 JS 侧的输入。
    // 必须新开实例——上面 singles/bestOf 已经把对应实例消费过了。
    val sequences = jsonArray(listOf("zero", "seed713", "seed20", "seed20261014", "seed1")) { label ->
        buildString {
            append("{")
            append("\"label\":").append(jsonString(label)).append(",")
            append("\"values\":").append(rawSequence(seededRandom(label)))
            append("}")
        }
    }

    val boundaries = buildString {        append("{")
        append("\"hslToHex\":")
        append(jsonArray(listOf(
            Triple(0.0, 100.0, 50.0), Triple(120.0, 100.0, 50.0), Triple(240.0, 100.0, 50.0),
            Triple(360.0, 100.0, 50.0), Triple(-720.0, 0.0, 50.0), Triple(31.0, 150.0, -1.0),
            Triple(31.0, -1.0, 101.0)
        )) { (h, s, l) -> jsonString(ThemeAestheticScore.hslToHex(h, s, l)) })
        append(",\"hslToRgb\":")
        append(jsonArray(listOf(Triple(0.0, 100.0, 50.0), Triple(120.0, 100.0, 50.0), Triple(240.0, 100.0, 50.0))) { (h, s, l) ->
            val rgb = ThemeAestheticScore.hslToRgb(h, s, l)
            "[${rgb.red},${rgb.green},${rgb.blue}]"
        })
        append(",\"hexToRgb\":")
        append(jsonArray(listOf("#abc", "#80112233", "#ffffff")) { hex ->
            val rgb = ThemeAestheticScore.hexToRgb(hex)
            "[${rgb.red},${rgb.green},${rgb.blue}]"
        })
        append(",\"hueDist\":")
        append(jsonArray(listOf(350.0 to 170.0, 350.0 to 10.0)) { (a, b) ->
            ThemeAestheticScore.hueDist(a, b).toString()
        })
        append(",\"rgbToHsl\":")
        append(jsonArray(listOf(Triple(0, 0, 0), Triple(255, 255, 255), Triple(255, 0, 0), Triple(0, 255, 0))) { (r, g, b) ->
            val hsl = ThemeAestheticScore.rgbToHsl(r, g, b)
            "[${hsl.hue},${hsl.saturation},${hsl.lightness}]"
        })
        append(",\"contrastRatio\":")
        append(jsonArray(listOf("#ffffff" to "#000000", "#737373" to "#000000")) { (a, b) ->
            ThemeAestheticScore.contrastRatio(a, b).toString()
        })
        append("}")
    }

    val out = buildString {
        append("{")
        append("\"source\":{")
        append("\"root\":").append(jsonString(srcRoot)).append(",")
        append("\"sha1\":{")
        append(jsonString("ThemeRandomizer.kt")).append(":").append(jsonString(sha1Of("$srcRoot/$RANDOMIZER"))).append(",")
        append(jsonString("ThemeAestheticScore.kt")).append(":").append(jsonString(sha1Of("$srcRoot/$SCORER")))
        append("}},")
        append("\"constants\":{")
        append("\"MAX_ATTEMPTS\":").append(ThemeRandomizer.MAX_ATTEMPTS).append(",")
        append("\"EARLY_STOP_SCORE\":").append(ThemeRandomizer.EARLY_STOP_SCORE).append(",")
        append("\"DEFAULT_THEME_NAME\":").append(jsonString(ThemeRandomizer.DEFAULT_THEME_NAME)).append(",")
        append("\"SCHEMES\":").append(jsonArray(ThemeRandomizer.SCHEMES) { jsonString(it) })
        append("},")
        append("\"candidates\":").append(singles).append(",")
        append("\"bestOf\":").append(bestOf).append(",")
        append("\"sequences\":").append(sequences).append(",")
        append("\"boundaries\":").append(boundaries)
        append("}")
    }

    println(out)
}
