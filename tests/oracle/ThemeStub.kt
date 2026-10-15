/*
 * 自动生成,请勿手改:由 tests/oracle/make-theme-stub.cjs 从
 * fx-rime-only/app/src/main/java/org/fcitx/fcitx5/android/data/theme/Theme.kt 抽出。
 * 只保留 Theme.Custom 的参数表,供 Oracle 编译 ThemeRandomizer.kt 使用。
 */
package org.fcitx.fcitx5.android.data.theme

sealed class Theme {
    data class CustomBackground(
val croppedFilePath: String,
            val srcFilePath: String,
            val brightness: Int = 70,
            val cropRect: Any?,
            val cropRotation: Int = 0,
            val blurRadius: Float = 0f // 0 = no blur, 1-25 = blur radius
    )

    data class Custom(
val name: String,
    val isDark: Boolean,
        /**
         * absolute paths of cropped and src png files
         */
        val backgroundImage: CustomBackground?,
    val backgroundColor: Int,
    val barColor: Int,
    val keyboardColor: Int,
    val keyBackgroundColor: Int,
    val keyTextColor: Int,
    val candidateTextColor: Int,
    val candidateLabelColor: Int,
    val candidateCommentColor: Int,
    val altKeyBackgroundColor: Int,
    val altKeyTextColor: Int,
    val accentKeyBackgroundColor: Int,
    val accentKeyTextColor: Int,
    val keyPressHighlightColor: Int,
    val keyShadowColor: Int,
    val popupBackgroundColor: Int,
    val popupTextColor: Int,
    val spaceBarColor: Int,
    val dividerColor: Int,
    val clipboardEntryColor: Int,
    val genericActiveBackgroundColor: Int,
    val genericActiveForegroundColor: Int,
    val waterRippleColor: Int? = null
    ) : Theme()

    companion object {
        /** 原文件里的字段顺序,供对照脚本核对 stub 没有被手改。 */
        val CUSTOM_FIELDS = listOf("name", "isDark", "backgroundImage", "backgroundColor", "barColor", "keyboardColor", "keyBackgroundColor", "keyTextColor", "candidateTextColor", "candidateLabelColor", "candidateCommentColor", "altKeyBackgroundColor", "altKeyTextColor", "accentKeyBackgroundColor", "accentKeyTextColor", "keyPressHighlightColor", "keyShadowColor", "popupBackgroundColor", "popupTextColor", "spaceBarColor", "dividerColor", "clipboardEntryColor", "genericActiveBackgroundColor", "genericActiveForegroundColor", "waterRippleColor")
        val BACKGROUND_FIELDS = listOf("croppedFilePath", "srcFilePath", "brightness", "cropRect", "cropRotation", "blurRadius")
        val SOURCE_SHA1 = "5de23fb11d6ae12a8e64aa40782a32ad510b18b9"
    }
}
