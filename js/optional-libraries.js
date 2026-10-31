(function () {
  "use strict";
  const libraries = {
    qrious: { label: "二维码生成组件", url: "https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js", ready: () => typeof window.QRious === "function" },
    jsqr: { label: "二维码识别组件", url: "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js", ready: () => typeof window.jsQR === "function" },
    lzma: { label: "二维码压缩组件", url: "https://cdn.jsdelivr.net/npm/lzma-wasm@1.0.7/dist/iife/index.js", ready: () => !!window.lzma_wasm },
    jszip: { label: "主题压缩包组件", url: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", ready: () => !!window.JSZip }
  };
  const pending = new Map();
  function load(name) {
    const library = libraries[name];
    if (!library) return Promise.reject(new Error("未知的可选组件"));
    if (library.ready()) return Promise.resolve();
    if (pending.has(name)) return pending.get(name);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => fail(), 10000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        reject(new Error(`${library.label}加载失败，请检查网络后重试；普通编辑和 JSON 导出仍可使用。`));
      }
      script.async = true;
      script.src = library.url;
      script.onload = () => { clearTimeout(timer); if (library.ready()) resolve(); else fail(); };
      script.onerror = fail;
      document.head.appendChild(script);
    });
    pending.set(name, promise);
    promise.catch(() => pending.delete(name));
    return promise;
  }
  // Optional network requests start only when a QR/ZIP action needs them.
  window.EditorLibraries = { ensure: names => Promise.all(names.map(load)) };
})();
