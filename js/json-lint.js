/*
 * f5a-see-me JSON 宽松校验/修复（借鉴 foxy-see-me 的 inspectJsonText 实现）。
 * 单遍扫描：检测并修复 UTF-8 BOM、尾逗号、// 与 块注释、单引号字符串、
 * 未加引号的键名、全角标点/引号。无依赖，挂到 window.F5aJsonLint。
 */
(function () {
  "use strict";

  const FULLWIDTH_MAP = {
    "\uFF0C": ",",  /* ， */
    "\uFF1A": ":",  /* ： */
    "\uFF1B": ";",  /* ； */
    "\u201C": "\"", /* “ */
    "\u201D": "\"", /* ” */
    "\u2018": "\"", /* ' */
    "\u2019": "\"", /* ' */
    "\uFF3B": "[",  /* ［ */
    "\uFF3D": "]",  /* ］ */
    "\uFF5B": "{",  /* ｛ */
    "\uFF5D": "}",  /* ｝ */
    "\u3000": " "   /* 全角空格 */
  };

  const ISSUE_LABELS = [
    ["trailingComma", "多余尾逗号（对象/数组最后一项之后）"],
    ["lineComment", "行注释 //（JSON 不支持）"],
    ["blockComment", "块注释 /* */（JSON 不支持）"],
    ["singleQuote", "单引号字符串（JSON 只接受双引号）"],
    ["unquotedKey", "未加引号的键名"],
    ["fullwidth", "全角标点/引号（，： \"\" 等）"]
  ];

  function inspectJsonText(text) {
    const original = String(text);
    let src = original;
    let bomOffset = 0;
    const bomFound = src.charCodeAt(0) === 0xFEFF;
    if (bomFound) { src = src.slice(1); bomOffset = 1; }
    const n = src.length;
    let i = 0;
    let line = 1;
    const out = [];
    const found = { trailingComma: [], lineComment: [], blockComment: [], singleQuote: [], unquotedKey: [], fullwidth: [] };
    const record = (kind, pos) => { found[kind].push({ line, pos: pos + bomOffset }); };

    while (i < n) {
      const c = src.charAt(i);

      if (c === "\n") { line++; out.push(c); i++; continue; }

      // 双引号字符串（顺带把全角引号规范化为双引号）：
      // ASCII " 开启的字符串只由 ASCII " 闭合，内部全角引号视为内容；
      // 全角引号开启的字符串由全角引号或 ASCII " 闭合。
      if (c === "\"" || c === "\u201C" || c === "\u201D") {
        const openedAscii = c === "\"";
        if (!openedAscii) record("fullwidth", i);
        out.push("\"");
        i++;
        while (i < n) {
          const d = src.charAt(i);
          if (d === "\\") {
            out.push(d);
            const nx = src.charAt(i + 1);
            if (nx) { out.push(nx); if (nx === "\n") line++; i += 2; } else i++;
            continue;
          }
          if (d === "\n") { line++; out.push(d); i++; continue; }
          if (openedAscii ? (d === "\"") : (d === "\"" || d === "\u201C" || d === "\u201D")) {
            if (!openedAscii && d !== "\"") record("fullwidth", i);
            out.push("\"");
            i++;
            break;
          }
          out.push(d); i++;
        }
        continue;
      }

      // 单引号字符串 → 双引号
      if (c === "'" || c === "\u2018" || c === "\u2019") {
        const singleAscii = c === "'";
        record("singleQuote", i);
        if (!singleAscii) record("fullwidth", i);
        i++;
        let buf = "";
        while (i < n) {
          const d2 = src.charAt(i);
          if (d2 === "\\") {
            const e2 = src.charAt(i + 1);
            if (e2 === "'" || e2 === "\u2018" || e2 === "\u2019") { buf += "'"; i += 2; continue; }
            if (e2 === "\"") { buf += "\\\""; i += 2; continue; }
            if (e2 === "\\") { buf += "\\\\"; i += 2; continue; }
            if (e2 === "n") { buf += "\\n"; i += 2; continue; }
            if (e2 === "t") { buf += "\\t"; i += 2; continue; }
            if (e2 === "r") { buf += "\\r"; i += 2; continue; }
            buf += "\\" + (e2 || ""); i += 2; continue;
          }
          if (d2 === "\"") { buf += "\\\""; i++; continue; }
          if (d2 === "\n") line++;
          if (singleAscii ? (d2 === "'") : (d2 === "'" || d2 === "\u2018" || d2 === "\u2019")) { i++; break; }
          buf += d2; i++;
        }
        out.push("\"" + buf + "\"");
        continue;
      }

      // 注释（JSON 不支持；移除但保留换行以维持行号）
      if (c === "/" && src.charAt(i + 1) === "/") {
        record("lineComment", i);
        while (i < n && src.charAt(i) !== "\n") i++;
        continue;
      }
      if (c === "/" && src.charAt(i + 1) === "*") {
        record("blockComment", i);
        i += 2;
        let keptNewline = false;
        while (i < n && !(src.charAt(i) === "*" && src.charAt(i + 1) === "/")) {
          if (src.charAt(i) === "\n") { line++; out.push("\n"); keptNewline = true; }
          i++;
        }
        i += 2;
        // 单行块注释至少留下空白，防止相邻 token 被静默拼接
        if (!keptNewline) out.push(" ");
        continue;
      }

      // } / ] 前的多余尾逗号
      if (c === ",") {
        let j = i + 1;
        while (j < n && /\s/.test(src.charAt(j))) j++;
        if (j < n && (src.charAt(j) === "}" || src.charAt(j) === "]")) {
          record("trailingComma", i);
          i++;
          continue;
        }
        out.push(c); i++; continue;
      }

      // 全角结构标点（全角逗号同样参与尾逗号判定）
      if (FULLWIDTH_MAP[c] != null) {
        if (FULLWIDTH_MAP[c] === ",") {
          let mj = i + 1;
          while (mj < n && /\s/.test(src.charAt(mj))) mj++;
          if (mj < n && (src.charAt(mj) === "}" || src.charAt(mj) === "]")) {
            record("fullwidth", i);
            record("trailingComma", i);
            i++;
            continue;
          }
        }
        record("fullwidth", i);
        out.push(FULLWIDTH_MAP[c]);
        i++;
        continue;
      }

      // 未加引号的键名（identifier 后跟冒号）
      if (/[A-Za-z_$]/.test(c)) {
        let k = i;
        while (k < n && /[A-Za-z0-9_$]/.test(src.charAt(k))) k++;
        let m = k;
        while (m < n && /\s/.test(src.charAt(m))) m++;
        if (src.charAt(m) === ":") {
          record("unquotedKey", i);
          out.push("\"" + src.slice(i, k) + "\"");
          i = k;
          continue;
        }
      }

      out.push(c); i++;
    }

    const issues = [];
    if (bomFound) {
      issues.push({ kind: "bom", label: "文件开头的 UTF-8 BOM 字符", count: 1, lines: [1], positions: [0], fixable: true });
    }
    ISSUE_LABELS.forEach(([kind, label]) => {
      const arr = found[kind];
      if (!arr.length) return;
      issues.push({
        kind, label, count: arr.length,
        lines: arr.map((x) => x.line),
        positions: arr.map((x) => x.pos),
        fixable: true
      });
    });

    const fixedText = out.join("");
    const total = issues.reduce((a, b) => a + b.count, 0);
    const report = { issues, total, fixedText, changed: fixedText !== original, parseOk: false, parseError: null };
    try { JSON.parse(fixedText); report.parseOk = true; } catch (e) { report.parseError = e.message; }
    return report;
  }

  window.F5aJsonLint = { inspectJsonText, sanitizeJsonText: (text) => inspectJsonText(text).fixedText };
})();
