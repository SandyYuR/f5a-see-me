(function () {
  "use strict";

  // Unapplied edits are kept outside state.layout and its undo/export snapshots.
  window.createLayoutWorkspace = function (deps) {
    const { el, state, getRows, keyTypeCapabilities, keyTypeLabel, editorKeyLabel,
      normalizeRowHeightKey, normalizeDraftForSaveByAppRules, sync, openAdvanced, renderPreview } = deps;
    const clone = value => JSON.parse(JSON.stringify(value));
    const storageKey = "f5a-workspace-key-drafts-v2";
    const form = el("inspector-form");
    const inspector = el("key-inspector");
    const fields = { main: "inspector-main", alt: "inspector-alt", label: "inspector-label",
      displayText: "inspector-display", weight: "inspector-weight", rowHeightPercent: "inspector-row-height" };
    let session = null;
    let drafts = {};
    let leaving = null;
    let restored = false;
    const contextKey = () => JSON.stringify([state.selectedBase, state.selectedSubmode, !!state.editingSplit]);
    const sessionKey = s => `${s.context}:${s.row}:${s.index}`;
    const valid = s => s && s.context === contextKey() && s.source === JSON.stringify(getRows());
    const dirty = () => !!session && (session.destination !== session.index || Object.keys(session.values).length > 0);
    const status = (text, error = false) => {
      el("inspector-status").textContent = text;
      el("inspector-status").className = `status inspector-draft-status${error ? " err" : ""}`;
    };

    function persist() {
      if (!restored) return;
      if (session) {
        if (dirty()) drafts[sessionKey(session)] = clone(session);
        else delete drafts[sessionKey(session)];
      }
      try { localStorage.setItem(storageKey, JSON.stringify({ drafts, active: session ? sessionKey(session) : null })); }
      catch (_) { status("未应用的修改无法缓存到浏览器，请保持页面打开并及时应用。", true); }
    }

    function draftKey() {
      const key = clone(session.original);
      for (const [prop, value] of Object.entries(session.values)) {
        if (!value.trim()) delete key[prop];
        else key[prop] = prop === "weight" || prop === "rowHeightPercent" ? Number(value) : value;
      }
      return key;
    }

    function highlight() {
      document.querySelectorAll("#layout-preview [data-preview-key], #layout-rows .layout-chip").forEach(node => {
        const preview = node.hasAttribute("data-preview-key");
        const row = Number(preview ? node.dataset.previewRow : node.dataset.rowIndex);
        const index = Number(preview ? node.dataset.previewKey : node.dataset.keyIndex);
        const matches = !preview || !state.previewSplit || state.editingSplit || !deps.hasSplitRows();
        const on = valid(session) && matches && state.activeTab !== "tab-symbols" && row === session.row && index === session.index;
        node.classList.toggle("workspace-selected", !!on);
        node.setAttribute("aria-pressed", String(!!on));
      });
      if (session) {
        const rendered = document.querySelector(`#layout-preview [data-preview-row="${session.row}"][data-preview-key="${session.index}"]`);
        const sample = el("inspector-key-face");
        if (rendered) {
          sample.innerHTML = rendered.querySelector(".layout-key-main, .text-editor-key-label")?.innerHTML || "";
          const colors = getComputedStyle(rendered);
          sample.style.background = colors.backgroundColor;
          sample.style.color = colors.color;
        } else sample.textContent = editorKeyLabel(draftKey());
      }
    }

    function renderTabs() {
      const root = el("preview-layout-tabs");
      root.textContent = "";
      const select = el("layout-base-select");
      for (const option of select.options) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option.textContent;
        button.setAttribute("aria-pressed", String(option.value === state.selectedBase));
        button.addEventListener("click", () => {
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        root.appendChild(button);
      }
    }

    function refresh() {
      if (session && !valid(session)) {
        // External changes (imports/undo) must never reapply an old key at a new index.
        if (dirty()) drafts[sessionKey(session)] = clone(session);
        session = null;
      }
      const rows = getRows();
      el("workspace-layout-count").textContent = `${rows.length} 行 · ${rows.reduce((n, row) => n + row.length, 0)} 个按键`;
      inspector.classList.toggle("is-empty", !session);
      el("inspector-empty").hidden = !!session;
      form.hidden = !session;
      el("inspector-empty").querySelector("p").textContent = Object.keys(drafts).length
        ? "有暂存的按键草稿。回到原布局并选择原按键可继续编辑。"
        : "点击预览中的按键开始编辑。";
      if (session) {
        const key = session.original;
        const c = keyTypeCapabilities(key.type);
        el("inspector-key-name").textContent = `${state.selectedBase} / ${state.selectedSubmode} · ${editorKeyLabel(key)}`;
        el("inspector-key-position").textContent = `第 ${session.row + 1} 行 · 第 ${session.destination + 1} 键${state.editingSplit ? " · 分体" : ""}`;
        el("inspector-type").textContent = keyTypeLabel(key.type);
        for (const [prop, id] of Object.entries(fields)) {
          const input = el(id);
          const visible = prop === "main" || prop === "alt" ? c.hasMainAlt : prop === "label" ? c.hasLabel
            : prop === "displayText" ? c.hasDisplayText && typeof key.displayText !== "object" : true;
          input.disabled = !visible;
          input.closest("label").hidden = !visible;
          input.value = session.values[prop] ?? key[prop] ?? "";
        }
        const positions = keyPositions();
        const pos = positions.findIndex(p => p.row === session.row && p.index === session.index);
        el("inspector-prev").disabled = pos <= 0;
        el("inspector-next").disabled = pos === positions.length - 1;
        el("inspector-left").disabled = session.destination === 0;
        el("inspector-right").disabled = session.destination === rows[session.row].length - 1;
        el("inspector-apply").disabled = !dirty();
        status(dirty() ? "有未应用的修改 · 预览中显示草稿" : "已应用 · 修改后点应用保存");
      }
      renderTabs();
      highlight();
    }

    function apply() {
      if (!dirty()) return true;
      if (!valid(session)) { status("布局已经变化，请重新选择按键。", true); return false; }
      if (!form.reportValidity()) return false;
      try {
        const key = draftKey();
        normalizeRowHeightKey(key);
        normalizeDraftForSaveByAppRules(key);
        const row = getRows()[session.row];
        row.splice(session.index, 1);
        row.splice(session.destination, 0, key);
        delete drafts[sessionKey(session)];
        session.index = session.destination;
        session.original = clone(key);
        session.values = {};
        session.source = JSON.stringify(getRows());
        sync();
        persist();
        return true;
      } catch (error) { status(error.message, true); return false; }
    }

    function revert() {
      if (!session) return;
      delete drafts[sessionKey(session)];
      session.values = {};
      session.destination = session.index;
      refresh();
      renderPreview();
      persist();
    }

    function guard(next) {
      if (!dirty()) return true;
      if (!el("workspace-leave-dialog").open) {
        leaving = next;
        el("workspace-leave-dialog").showModal();
      }
      return false;
    }
    el("workspace-leave-stay").addEventListener("click", () => el("workspace-leave-dialog").close());
    el("workspace-leave-discard").addEventListener("click", () => {
      const next = leaving;
      revert();
      el("workspace-leave-dialog").close();
      next?.(false);
    });
    el("workspace-leave-apply").addEventListener("click", () => {
      const next = leaving;
      el("workspace-leave-dialog").close();
      if (!apply()) return;
      next?.(true);
    });

    function select(row, index) {
      if (session?.row === row && session.index === index && valid(session)) return true;
      // A preview selection addresses the original key even while it is moved in a draft.
      const afterApplyIndex = session?.row === row && dirty() ? (
        index === session.index ? session.destination
          : session.index < index && index <= session.destination ? index - 1
          : session.destination <= index && index < session.index ? index + 1 : index
      ) : index;
      if (!guard(applied => select(row, applied ? afterApplyIndex : index))) return false;
      if (!getRows()[row]?.[index]) return false;
      session = { context: contextKey(), source: JSON.stringify(getRows()), row, index, destination: index,
        original: clone(getRows()[row][index]), values: {} };
      const saved = drafts[sessionKey(session)];
      if (valid(saved)) session = clone(saved);
      inspector.hidden = false;
      el("editing-workspace").classList.add("has-inspector");
      refresh();
      renderPreview();
      persist();
      return true;
    }

    function clear() {
      if (session) delete drafts[sessionKey(session)];
      session = null;
      refresh();
      persist();
    }
    function suspend() {
      persist();
      session = null;
      refresh();
    }
    function keyPositions() {
      return getRows().flatMap((row, r) => row.map((_, index) => ({ row: r, index })));
    }
    function navigate(offset) {
      if (!session) return;
      const positions = keyPositions();
      const pos = positions.findIndex(p => p.row === session.row && p.index === session.index);
      const next = positions[pos + offset];
      if (next) select(next.row, next.index);
    }
    function move(offset) {
      if (!session) return;
      const next = session.destination + offset;
      if (next < 0 || next >= getRows()[session.row].length) return;
      session.destination = next;
      refresh();
      renderPreview();
      persist();
    }

    form.addEventListener("input", event => {
      if (!session) return;
      const prop = Object.keys(fields).find(prop => fields[prop] === event.target.id);
      if (!prop) return;
      if (event.target.value === String(session.original[prop] ?? "")) delete session.values[prop];
      else session.values[prop] = event.target.value;
      status(dirty() ? "有未应用的修改 · 预览中显示草稿" : "已应用 · 修改后点应用保存");
      el("inspector-apply").disabled = !dirty();
      renderPreview();
      persist();
    });
    form.addEventListener("submit", event => { event.preventDefault(); apply(); });
    el("inspector-revert").addEventListener("click", revert);
    el("inspector-prev").addEventListener("click", () => navigate(-1));
    el("inspector-next").addEventListener("click", () => navigate(1));
    el("inspector-left").addEventListener("click", () => move(-1));
    el("inspector-right").addEventListener("click", () => move(1));
    const advanced = () => {
      if (!session || !guard(advanced)) return;
      const { row, index } = session;
      clear();
      openAdvanced(row, index, false);
    };
    el("inspector-advanced").addEventListener("click", advanced);
    const duplicate = () => {
      if (!session || !guard(duplicate)) return;
      const { row, index } = session;
      getRows()[row].splice(index + 1, 0, clone(getRows()[row][index]));
      clear(); sync(); select(row, index + 1);
    };
    el("inspector-duplicate").addEventListener("click", duplicate);
    const remove = () => {
      if (!session || !guard(remove)) return;
      getRows()[session.row].splice(session.index, 1);
      clear(); sync();
    };
    el("inspector-delete").addEventListener("click", remove);
    const close = () => {
      if (!guard(close)) return;
      clear();
      inspector.hidden = true;
      el("editing-workspace").classList.remove("has-inspector");
      renderPreview();
    };
    el("inspector-close").addEventListener("click", close);

    ["layout-base-select", "layout-submode-select", "layout-split-mode"].forEach(id => {
      el(id).addEventListener("change", event => {
        const target = event.target;
        const value = target.value;
        const checked = target.checked;
        if (guard(() => {
          target.value = value; target.checked = checked;
          target.dispatchEvent(new Event("change", { bubbles: true }));
        })) { suspend(); return; }
        event.stopImmediatePropagation();
        if (id === "layout-base-select") target.value = state.selectedBase;
        if (id === "layout-submode-select") target.value = state.selectedSubmode;
        if (id === "layout-split-mode") target.checked = state.editingSplit;
      }, true);
    });
    ["pt-split", "pt-composing"].forEach(id => el(id).addEventListener("change", suspend, true));
    el("layout-key-dialog").addEventListener("close", refresh);
    // Structural changes and file replacements must resolve a key draft first.
    ["layout-download-json", "layout-share-current", "layout-ime-save", "layout-import-file", "layout-import-qr-image",
      "layout-ime-load", "layout-reset", "layout-delete-layout", "layout-add-layout", "layout-rename-layout",
      "layout-clear-colors", "layout-open-gradient", "layout-open-aux-bar", "layout-json-apply", "top-undo", "top-redo", "float-undo", "float-redo"].forEach(id => {
      el(id)?.addEventListener("click", event => {
        if (guard(() => el(id).click())) return;
        event.preventDefault(); event.stopImmediatePropagation();
      }, true);
    });
    // Do not start a drag behind the draft-resolution dialog; retry after resolving it.
    el("layout-rows").addEventListener("pointerdown", event => {
      if (!dirty() || event.button !== 0) return;
      guard(() => {});
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    document.addEventListener("keydown", event => {
      if (!(event.ctrlKey || event.metaKey) || !["z", "y"].includes(event.key.toLowerCase())) return;
      if (event.target.closest("input, textarea, [contenteditable]")) return;
      const id = event.key.toLowerCase() === "y" || event.shiftKey ? "top-redo" : "top-undo";
      if (!guard(() => el(id).click())) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);

    const jsonCard = el("layout-json-card");
    const jsonToggle = el("workspace-json-toggle");
    jsonToggle.addEventListener("click", () => {
      jsonCard.open = !jsonCard.open;
      if (jsonCard.open) jsonCard.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    jsonCard.addEventListener("toggle", () => jsonToggle.setAttribute("aria-expanded", String(jsonCard.open)));

    function setTab(id) {
      document.body.classList.toggle("layout-workspace-active", id === "tab-layout");
      document.querySelector(".canvas-help").textContent = id === "tab-symbols"
        ? "切换左侧分组查看符号，在下方编辑分组与内容。"
        : "点预览按键进入属性窗；点下方排列区按键打开完整编辑。";
      if (id === "tab-symbols") suspend();
      highlight();
    }
    function previewRows(rows) {
      if (!valid(session) || !dirty() || (state.previewSplit && !state.editingSplit && deps.hasSplitRows())) return rows;
      const result = rows.slice();
      const row = rows[session.row].map((key, i) => ({ ...key, __workspaceIndex: i }));
      row.splice(session.index, 1);
      row.splice(session.destination, 0, { ...draftKey(), __workspaceIndex: session.index });
      result[session.row] = row;
      return result;
    }
    function restore() {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
        drafts = saved?.drafts || {};
        const active = drafts[saved?.active];
        if (valid(active)) session = active;
      } catch (_) {}
      restored = true;
      refresh(); renderPreview();
    }
    window.addEventListener("pagehide", persist);
    new MutationObserver(highlight).observe(el("layout-preview"), { childList: true });
    new ResizeObserver(entries => {
      inspector.style.setProperty("--inspector-height", `${Math.max(380, Math.round(entries[0].target.getBoundingClientRect().height))}px`);
    }).observe(el("shared-preview-host"));
    // Stable IDs keep saved fold state independent of DOM order.
    document.querySelectorAll("details[id]").forEach(details => {
      const key = `f5a-workspace-fold:${details.id}`;
      try { const saved = localStorage.getItem(key); if (saved !== null) details.open = saved === "1"; } catch (_) {}
      details.addEventListener("toggle", () => { try { localStorage.setItem(key, details.open ? "1" : "0"); } catch (_) {} });
    });
    setTab(state.activeTab);
    refresh();
    return { select, clear, suspend, refresh, setTab, apply, guard, previewRows, restore };
  };
})();
