(function () {
  "use strict";

  // Interaction state belongs to the workspace, never to the exported layout.
  window.createLayoutWorkspace = function (deps) {
    const { el, state, getRows, keyTypeCapabilities, keyTypeLabel, editorKeyLabel,
      normalizeRowHeightKey, normalizeDraftForSaveByAppRules, sync, openAdvanced } = deps;
    let selected = null;
    let context = "";
    let dirty = false;
    let applying = false;
    let sourceSignature = "";
    const form = el("inspector-form");
    const fields = { main: "inspector-main", alt: "inspector-alt", label: "inspector-label",
      weight: "inspector-weight", rowHeightPercent: "inspector-row-height" };
    const contextKey = () => JSON.stringify([state.selectedBase, state.selectedSubmode, state.editingSplit]);
    const currentKey = () => selected && getRows()[selected.row]?.[selected.index];
    const status = (text, error = false) => {
      el("inspector-status").textContent = text;
      el("inspector-status").className = `status ${error ? "err" : "ok"}`;
    };

    function highlight() {
      const active = state.activeTab === "tab-layout";
      // A split preview can display different rows from the arrangement being edited.
      const matchesPreview = !state.previewSplit || state.editingSplit || !deps.hasSplitRows();
      document.querySelectorAll("#layout-preview [data-preview-key], #layout-rows .layout-chip").forEach(node => {
        const preview = node.hasAttribute("data-preview-key");
        const row = Number(preview ? node.dataset.previewRow : node.dataset.rowIndex);
        const index = Number(preview ? node.dataset.previewKey : node.dataset.keyIndex);
        const on = active && !!selected && row === selected.row && index === selected.index && (!preview || matchesPreview);
        node.classList.toggle("workspace-selected", on);
        node.setAttribute("aria-pressed", String(on));
      });
    }

    function refresh() {
      if (context !== contextKey()) {
        selected = null;
        context = contextKey();
        dirty = false;
      }
      const rows = getRows();
      el("workspace-layout-count").textContent = `${rows.length} 行 · ${rows.reduce((n, row) => n + row.length, 0)} 个按键`;
      const key = currentKey();
      const signature = JSON.stringify(key);
      if (signature !== sourceSignature) dirty = false;
      sourceSignature = signature;
      if (!key) selected = null;
      el("inspector-empty").hidden = !!key;
      form.hidden = !key;
      if (key) {
        const c = keyTypeCapabilities(key.type);
        el("inspector-key-face").textContent = editorKeyLabel(key);
        el("inspector-key-name").textContent = editorKeyLabel(key);
        el("inspector-key-position").textContent = `第 ${selected.row + 1} 行 · 第 ${selected.index + 1} 键`;
        el("inspector-type").textContent = keyTypeLabel(key.type);
        for (const [prop, id] of Object.entries(fields)) {
          const input = el(id);
          const visible = prop === "main" || prop === "alt" ? c.hasMainAlt : prop === "label" ? c.hasLabel : true;
          input.disabled = !visible;
          input.closest("label").hidden = !visible;
          if (!dirty || applying) input.value = key[prop] ?? "";
        }
        const positions = keyPositions();
        const pos = positions.findIndex(p => p.row === selected.row && p.index === selected.index);
        el("inspector-prev").disabled = pos <= 0;
        el("inspector-next").disabled = pos === positions.length - 1;
        el("inspector-left").disabled = selected.index === 0;
        el("inspector-right").disabled = selected.index === rows[selected.row].length - 1;
      }
      highlight();
    }

    function apply() {
      if (!dirty || !currentKey()) return true;
      if (!form.reportValidity()) return false;
      const key = JSON.parse(JSON.stringify(currentKey()));
      try {
        for (const [prop, id] of Object.entries(fields)) {
          const input = el(id);
          if (input.disabled) continue;
          if (!input.value.trim()) delete key[prop];
          else key[prop] = prop === "weight" || prop === "rowHeightPercent" ? Number(input.value) : input.value;
        }
        normalizeRowHeightKey(key);
        normalizeDraftForSaveByAppRules(key);
        getRows()[selected.row][selected.index] = key;
        dirty = false;
        applying = true;
        sync();
        status("已应用到布局");
        return true;
      } catch (error) {
        status(error.message, true);
        return false;
      } finally {
        applying = false;
      }
    }

    function select(row, index) {
      if (!apply()) return false;
      if (!getRows()[row]?.[index]) return false;
      selected = { row, index };
      context = contextKey();
      dirty = false;
      status("");
      refresh();
      if (window.matchMedia("(max-width: 900px)").matches) {
        el("key-inspector").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return true;
    }

    function clear() {
      selected = null;
      dirty = false;
      status("");
      refresh();
    }

    function keyPositions() {
      return getRows().flatMap((row, r) => row.map((_, index) => ({ row: r, index })));
    }

    function navigate(offset) {
      if (!selected || !apply()) return;
      const positions = keyPositions();
      const pos = positions.findIndex(p => p.row === selected.row && p.index === selected.index);
      const next = positions[pos + offset];
      if (next) select(next.row, next.index);
    }

    function move(offset) {
      if (!selected || !apply()) return;
      const row = getRows()[selected.row];
      const next = selected.index + offset;
      if (next < 0 || next >= row.length) return;
      const [key] = row.splice(selected.index, 1);
      row.splice(next, 0, key);
      selected.index = next;
      sync();
      status("已移动按键，可撤销");
    }

    form.addEventListener("input", event => {
      if (event.target.matches("input")) { dirty = true; status("离开输入框或按 Enter 应用修改"); }
    });
    // Keep the clicked key alive until its click handler runs. Re-rendering on
    // change/blur would remove it between pointerdown and click.
    form.addEventListener("focusout", event => {
      if (!event.target.matches("input")) return;
      if (event.relatedTarget?.matches("#layout-preview [data-preview-key], #layout-rows .layout-chip, #inspector-revert, #inspector-delete")) return;
      apply();
    });
    form.addEventListener("submit", event => { event.preventDefault(); apply(); });
    el("inspector-revert").addEventListener("click", () => { dirty = false; refresh(); status("已还原未应用的输入"); });
    el("inspector-prev").addEventListener("click", () => navigate(-1));
    el("inspector-next").addEventListener("click", () => navigate(1));
    el("inspector-left").addEventListener("click", () => move(-1));
    el("inspector-right").addEventListener("click", () => move(1));
    el("inspector-advanced").addEventListener("click", () => {
      if (selected && apply()) openAdvanced(selected.row, selected.index, false);
    });
    el("inspector-duplicate").addEventListener("click", () => {
      if (!selected || !apply()) return;
      const copy = JSON.parse(JSON.stringify(currentKey()));
      getRows()[selected.row].splice(++selected.index, 0, copy);
      sync();
      status("已在右侧复制按键，可撤销");
    });
    el("inspector-delete").addEventListener("click", () => {
      if (!selected) return;
      getRows()[selected.row].splice(selected.index, 1);
      clear();
      sync();
    });
    // Avoid silently abandoning invalid input when switching layouts or editing JSON.
    ["layout-base-select", "layout-submode-select", "layout-split-mode"].forEach(id => {
      el(id).addEventListener("change", event => {
        const desiredValue = event.target.value;
        const desiredChecked = event.target.checked;
        if (apply()) {
          // Applying a pending edit rebuilds selectors. Retain the user's new
          // choice for the app's subsequent change listener.
          if (id === "layout-split-mode") event.target.checked = desiredChecked;
          else event.target.value = desiredValue;
          return;
        }
        event.stopImmediatePropagation();
        if (id === "layout-base-select") event.target.value = state.selectedBase;
        if (id === "layout-submode-select") event.target.value = state.selectedSubmode;
        if (id === "layout-split-mode") event.target.checked = state.editingSplit;
      }, true);
    });
    el("layout-key-dialog").addEventListener("close", refresh);
    ["layout-download-json", "layout-share-current", "layout-ime-save"].forEach(id => {
      el(id).addEventListener("click", event => {
        if (apply()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        el("key-inspector").scrollIntoView({ behavior: "smooth", block: "start" });
      }, true);
    });
    el("inspector-back-to-canvas").addEventListener("click", () => {
      if (apply()) el("layout-canvas-host").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const jsonCard = el("layout-json-card");
    const jsonToggle = el("workspace-json-toggle");
    jsonToggle.addEventListener("click", () => {
      if (!apply()) return;
      jsonCard.open = !jsonCard.open;
      if (jsonCard.open) jsonCard.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    jsonCard.addEventListener("toggle", () => jsonToggle.setAttribute("aria-expanded", String(jsonCard.open)));

    function setTab(id) {
      const layout = id === "tab-layout";
      document.body.classList.toggle("layout-workspace-active", layout);
      const panel = document.querySelector(".keyboard-preview-panel");
      const host = el(layout ? "layout-canvas-host" : "shared-preview-host");
      if (panel.parentElement !== host) host.appendChild(panel);
      highlight();
    }

    // Preview re-renders also happen independently for themes, composition and resizing.
    new MutationObserver(highlight).observe(el("layout-preview"), { childList: true });
    setTab(state.activeTab);
    refresh();
    return { select, clear, refresh, setTab, apply };
  };
})();
