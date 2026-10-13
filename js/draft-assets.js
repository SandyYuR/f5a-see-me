(function () {
  "use strict";

  const DB_NAME = "f5a-editor-assets-v1";
  const STORE = "backgrounds";
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
  let opening = null;

  function openDatabase() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("浏览器不支持图片草稿存储"));
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onerror = () => reject(request.error || new Error("无法打开图片草稿存储"));
      request.onblocked = () => reject(new Error("图片草稿存储被其他页面占用，请关闭旧页面后重试"));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
    }).catch((error) => { opening = null; throw error; });
    return opening;
  }

  async function save(id, blob, retainedIds) {
    if (!(blob instanceof Blob) || !blob.size) throw new Error("背景图片为空");
    if (blob.size > MAX_IMAGE_BYTES) throw new Error("单张背景图片超过 20 MB，请缩小图片后重新导入");
    const db = await openDatabase();
    const keep = new Set(retainedIds || []);
    keep.add(id);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      let failure = null;
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error("图片草稿存储失败"));
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result;
        const total = records.reduce((sum, record) => sum + (keep.has(record.id) && record.id !== id ? record.blob.size : 0), blob.size);
        if (total > MAX_TOTAL_BYTES) {
          failure = new Error("背景图片草稿超过 64 MB，请导出后减少图片或重新打开页面");
          tx.abort();
          return;
        }
        // 保留当前文档、持久草稿和撤销/重做仍引用的资源，回收其余旧图片。
        records.forEach((record) => { if (!keep.has(record.id)) store.delete(record.id); });
        store.put({ id, blob });
      };
    });
  }

  async function load(ids) {
    if (!ids.length) return new Map();
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const assets = new Map();
      tx.oncomplete = () => resolve(assets);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("无法读取图片草稿"));
      const store = tx.objectStore(STORE);
      ids.forEach((id) => {
        const request = store.get(id);
        request.onsuccess = () => { if (request.result?.blob) assets.set(id, request.result.blob); };
      });
    });
  }

  window.F5aDraftAssets = { save, load };
})();
