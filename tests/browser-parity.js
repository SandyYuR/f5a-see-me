/* Run in a real browser after loading index.html. Uses the application's bound
 * controls and file import/export handlers; no copy of editor implementation.
 * F5aBrowserParity.runCore(), .runAssets(), .restoreStorage(). */
(function () {
  const $ = selector => document.querySelector(selector);
  const byId = id => document.getElementById(id);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const pause = () => new Promise(resolve => setTimeout(resolve, 40));
  async function until(predicate, message) {
    const deadline = Date.now() + 10000;
    while (!predicate() && Date.now() < deadline) await pause();
    assert(predicate(), message);
  }
  async function input(id, value) {
    const field = byId(id) || $(id);
    assert(field, `missing control: ${id}`);
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    await pause();
  }
  async function click(selector) { assert($(selector), selector); $(selector).click(); await pause(); }
  async function upload(id, file) {
    const dt = new DataTransfer(); dt.items.add(file);
    byId(id).files = dt.files;
    byId(id).dispatchEvent(new Event('change', { bubbles: true }));
    await pause();
  }
  const file = data => new File([JSON.stringify(data)], 'fixture.json', { type: 'application/json' });
  const layout = () => JSON.parse(byId('layout-json').value);
  const fixture = { default: [[{ type: 'AlphabetKey', main: 'A', alt: '1' }, { type: 'AlphabetKey', main: 'B', alt: '2' }]],
    number: [[{ type: 'NumPadKey', sym: 65513, label: 'Custom' }]],
    text_editor: [[{ type: 'LayoutSwitchKey', label: 'ABC' }, { type: 'MacroKey', label: 'Copy', tap: { macro: [{ type: 'edit', action: 'copy' }] } }]] };
  const api = window.F5aBrowserParity = { results: [], errors: [] };
  window.addEventListener('error', e => api.errors.push(e.message));
  window.addEventListener('unhandledrejection', e => api.errors.push(String(e.reason)));
  const stored = Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]));
  const downloads = [];
  const blobs = new Map();
  const createUrl = URL.createObjectURL.bind(URL);
  const anchorClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = blob => { const url = createUrl(blob); blobs.set(url, blob); return url; };
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) { downloads.push({ name: this.download, blob: blobs.get(this.href) }); return; }
    return anchorClick.call(this);
  };
  api.restoreStorage = function () {
    Object.keys(localStorage).forEach(key => { if (!(key in stored)) localStorage.removeItem(key); });
    Object.entries(stored).forEach(([key, value]) => localStorage.setItem(key, value));
    URL.createObjectURL = createUrl;
    HTMLAnchorElement.prototype.click = anchorClick;
  };
  api.runCore = async function () {
    await click('#tabbtn-layout');
    await upload('layout-import-file', file(fixture));
    await input('layout-base-select', 'default');
    await click('#layout-preview [data-preview-row="0"][data-preview-key="0"]');
    await input('inspector-main', 'Ω');
    assert(layout().default[0][0].main === 'A', 'draft committed early');
    await click('#layout-preview [data-preview-row="0"][data-preview-key="1"]');
    assert(byId('workspace-leave-dialog').open, 'missing draft guard');
    await click('#workspace-leave-apply');
    assert(layout().default[0][0].main === 'Ω', 'guard apply');
    await click('#inspector-close');
    await click('#top-undo'); assert(layout().default[0][0].main === 'A', 'undo');
    await click('#top-redo'); assert(layout().default[0][0].main === 'Ω', 'redo');
    api.results.push('inspector draft guard / apply / undo / redo');

    await click('#layout-add-layout');
    await input('layout-add-kind', 'layer');
    await input('layout-add-name', '数字');
    await input('layout-add-source', 'number');
    await click('#layout-add-dialog-save');
    assert(layout().default['__layer__:数字'][0][0].sym === 65513, 'layer copy');
    await input('layout-height-override', '40');
    await input('layout-height-override-landscape', '48');
    await click('#layout-split-mode');
    assert(Array.isArray(layout().default['__layer__:数字']['__variant__:split']), 'split rows');
    const confirmBefore = window.confirm; window.confirm = () => true;
    await click('#layout-delete-layout'); window.confirm = confirmBefore;
    assert(layout().default['__layer__:数字'] && !layout().default['__layer__:数字']['__variant__:split'], 'split deletion removed layer');
    assert(layout().default['__layer__:数字'].__meta__.keyboard_height_percent === 40, 'shared height');
    api.results.push('layer create / source copy / shared height / split-only deletion');

    await input('layout-base-select', 'default');
    await input('layout-submode-select', 'default');
    await click('#layout-split-mode');
    await click('#layout-rows .row-settings');
    await input('layout-row-settings-height', '35.5');
    await input('layout-row-settings-boundary', '0');
    await click('#layout-row-settings-keep-together');
    await click('#layout-row-settings-save');
    let row = layout().default['__variant__:split'][0];
    assert(row[0].rowHeightPercent === 35.5 && row[0].splitRowDisabled === true, 'row settings');
    await click('#layout-rows .row-settings');
    await input('layout-row-settings-height', '101'); await click('#layout-row-settings-save');
    assert(byId('layout-row-settings-dialog').open, 'bad height dismissed');
    await click('#layout-row-settings-cancel');
    await click('#top-undo'); await click('#top-redo');
    api.results.push('row settings / invalid value preserves dialog / history');

    await click('#layout-split-mode');
    await input('layout-base-select', 'number');
    await click('#layout-rows .layout-chip'); await input('layout-key-weight', '0.25'); await click('#layout-key-save');
    assert(layout().number[0][0].sym === 65513 && layout().number[0][0].label === 'Custom', 'NumPad data loss');
    const macro = { macros: [[{ type: 'MacroKey', label: 'Macro', tap: { macro: [
      { type: 'tap', keys: [{ android: 29 }, { fcitx: 'U1F600' }] },
      { type: 'shortcut', modifiers: [{ android: 113 }], key: { android: 31 } },
      { type: 'layer', mode: 'to', target: '跨布局层' }, { type: 'app', id: 'js_app:plugin/custom' }
    ] } }]] };
    await upload('layout-import-file', file(macro)); await click('#layout-rows .layout-chip');
    await click('#layout-key-open-macro'); await click('#layout-key-macro-edit-tap');
    assert($('.macro-key-type-select').value === 'android', 'Android UI type');
    await click('#layout-key-macro-event-save'); await click('#layout-key-macro-save'); await click('#layout-key-save');
    assert(JSON.stringify(layout().macros[0][0].tap) === JSON.stringify(macro.macros[0][0].tap), 'macro round trip');
    api.results.push('NumPad custom keysym/label / complete macro round trip');

    await click('#tabbtn-popup'); await input('popup-json', '{"q":[]," ":[" ",""]}');
    assert(JSON.parse(byId('popup-json').value).q.length === 0, 'popup empty override');
    await click('#tabbtn-symbols'); await input('sym-kind', 'kaomoji');
    const symbols = { multiLine: true, groups: [{ names: { zh: '自定义' }, symbols: ['( ＾▽＾ )', ' second '] }] };
    await input('sym-json', JSON.stringify(symbols)); await click('#sym-json-apply');
    assert(byId('sym-json').value.includes('( ＾▽＾ )'), 'kaomoji spaces');
    await click('#top-undo'); await click('#top-redo');
    assert(byId('sym-json').value.includes('( ＾▽＾ )'), 'symbol history');
    await input('sym-json', '{unfinished'); await input('sym-kind', 'emoji'); await input('sym-kind', 'kaomoji');
    assert(byId('sym-json').value === '{unfinished', 'symbol JSON draft lost');
    await input('sym-json', JSON.stringify(symbols)); await click('#sym-json-apply');
    await input('pt-symbol-style', 'bottom');
    assert($('.sym-pv').style.flexDirection === 'column', 'symbol bottom style');
    await input('pt-symbol-style', 'sidebar');
    assert($('.sym-pv').style.flexDirection === 'row', 'symbol sidebar style');
    const saved = JSON.parse(localStorage.getItem('f5a-editor-draft-v1'));
    assert(saved.symbols.profiles.kaomoji.groups[0].symbols[0] === '( ＾▽＾ )', 'symbol autosave');
    api.results.push('popup literal override / symbol history / drafts / both panel styles');

    await click('#tabbtn-layout'); await upload('layout-import-file', file(fixture)); await input('layout-base-select', 'default');
    await input('pt-orientation', 'portrait');
    const portrait = $('#layout-preview').getBoundingClientRect();
    await input('pt-orientation', 'landscape');
    const landscape = $('#layout-preview').getBoundingClientRect();
    assert(landscape.height / landscape.width < portrait.height / portrait.width, 'orientation geometry unchanged');
    await input('pt-orientation', 'portrait');
    assert(api.errors.length === 0, api.errors.join('\n'));
    api.results.push('independent screen orientation and zero JavaScript errors');
    return { pass: api.results, errors: api.errors };
  };

  async function pixels(blob) {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    return { width: canvas.width, height: canvas.height, at: (x,y) => [...ctx.getImageData(x,y,1,1).data] };
  }
  api.runAssets = async function () {
    await click('#tabbtn-theme');
    const promptBefore = window.prompt; window.prompt = () => 'Browser crop fixture';
    await click('#theme-create-from-current'); window.prompt = promptBefore;
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 40;
    const ctx = canvas.getContext('2d');
    for (const [color,x,y] of [['red',0,0],['lime',40,0],['blue',0,20],['yellow',40,20]]) { ctx.fillStyle=color;ctx.fillRect(x,y,40,20); }
    const source = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
    await upload('theme-import-background-file', new File([source], 'colors.png', { type: 'image/png' }));
    let definition = JSON.parse(byId('theme-json').value);
    definition.backgroundImage.cropRect = { left: 0, top: 0, right: 40, bottom: 40 };
    definition.backgroundImage.cropRotation = 90;
    await input('theme-json', JSON.stringify(definition));
    await until(() => getComputedStyle($('#layout-preview')).backgroundImage.includes('blob:'), 'preview failed to settle');
    const downloadCount = downloads.length;
    await click('#theme-share-current');
    await until(() => downloads.length > downloadCount, 'theme ZIP not exported');
    const zipped = downloads.at(-1);
    assert(zipped.name.endsWith('.zip') && zipped.blob, 'missing ZIP blob');
    const archive = await JSZip.loadAsync(zipped.blob);
    const jsonName = Object.keys(archive.files).find(name=>name.endsWith('.json'));
    const exported = JSON.parse(await archive.file(jsonName).async('string'));
    const cropBlob = await archive.file(exported.backgroundImage.croppedFilePath).async('blob');
    const sourceBlob = await archive.file(exported.backgroundImage.srcFilePath).async('blob');
    const crop = await pixels(cropBlob), src = await pixels(sourceBlob);
    assert(crop.width === 40 && crop.height === 40, `crop size ${crop.width}x${crop.height}`);
    assert(src.width === 80 && src.height === 40, 'source image replaced');
    assert(crop.at(5,5)[2] === 255 && crop.at(35,5)[0] === 255, 'rotation pixels incorrect');
    const bg = getComputedStyle($('#layout-preview'));
    const url = bg.backgroundImage.match(/url\("?([^"\)]+)"?\)/)[1];
    const preview = await pixels(await (await fetch(url)).blob());
    assert(preview.width === crop.width && preview.at(5,5)[2] === 255, 'keyboard preview differs from ZIP crop');
    await upload('theme-import-file', new File([zipped.blob], 'roundtrip.zip', {type:'application/zip'}));
    await until(() => !byId('theme-qr-meta').textContent.includes('导入中'), 'ZIP roundtrip stalled');
    assert(!byId('theme-qr-meta').classList.contains('err'), byId('theme-qr-meta').textContent);
    api.results.push('real Canvas crop / rotation pixels / distinct ZIP source / preview parity / reimport');
    return { pass: api.results, image: { crop: [crop.width,crop.height], source:[src.width,src.height], topLeft:crop.at(5,5),topRight:crop.at(35,5) }, errors:api.errors };
  };
  api.runSharing = async function () {
    await click('#tabbtn-layout');
    await input('layout-base-select', 'default');
    await input('pt-orientation', 'landscape');
    await click('#layout-share-current');
    await until(() => byId('layout-qr-dialog').open || byId('layout-qr-meta').classList.contains('err'), 'QR preparation did not finish');
    assert(byId('layout-qr-dialog').open, byId('layout-qr-meta').textContent);
    const count = downloads.length;
    await click('#layout-download-qr-preview');
    await until(() => downloads.length > count || byId('layout-qr-meta').classList.contains('err'), 'QR long image did not finish');
    assert(downloads.length > count, byId('layout-qr-meta').textContent);
    const exported = downloads.at(-1);
    assert(exported.name.endsWith('.png') && exported.blob, 'missing QR PNG');
    const image = await pixels(exported.blob);
    assert(image.width > 500 && image.height > 500, 'empty QR long image');
    api.results.push('real QR compression / generation / current keyboard Canvas / PNG export');
    await click('#layout-close-qr-preview');
    return { pass: api.results, longImage:[image.width,image.height], errors:api.errors };
  };
  api.runAltLabels = async function () {
    await click('#tabbtn-layout');
    const tap = { macro: [{ type: 'text', text: 'A' }] };
    const testKey = { type: 'MacroKey', label: 'A', swipeDownLabel: ' 剪切 ', tap, swipeDown: tap, longPress: tap };
    const keyRow = [
      { type: 'AlphabetKey', main: 'A', alt: '副标' },
      testKey,
      { ...testKey, swipeUpLabel: '上滑', swipeDownLabel: '下滑' },
      { type: 'MacroKey', label: 'A', tap }
    ];
    const testLayout = { default: Array.from({ length: 3 }, () => JSON.parse(JSON.stringify(keyRow))) };
    await upload('layout-import-file', file(testLayout));
    const checked = async (id, value) => {
      byId(id).checked = value;
      byId(id).dispatchEvent(new Event('change', { bubbles: true }));
      await pause();
    };
    const measure = () => [...document.querySelectorAll('#layout-preview .layout-key[data-preview-row]')].map(k => {
      const face=k.querySelector('.layout-key-main'), keyBox=k.getBoundingClientRect(), box=face.getBoundingClientRect();
      return { x:box.x-keyBox.x,y:box.y-keyBox.y,width:box.width,height:box.height,font:getComputedStyle(face).fontSize,
        labels:[...k.querySelectorAll('.layout-key-native-alt')].map(n=>({text:n.textContent,x:n.getBoundingClientRect().x-keyBox.x,y:n.getBoundingClientRect().y-keyBox.y,position:getComputedStyle(n).position,align:getComputedStyle(n).textAlign})) };
    });
    await input('pt-orientation','portrait');
    await checked('pt-show-alt',true); await checked('pt-move-main-alt',true); await checked('pt-alt-on-side',false);
    await input('theme-app-punct-pos','bottom');
    const withLabels=measure();
    assert(withLabels[1].labels[0].text === ' 剪切 ', 'native labels changed their literal text');
    assert(withLabels[0].labels[0].align === 'center' && withLabels[1].labels[0].align === 'center', 'single lower labels must be centered');
    assert(Math.abs(withLabels[0].y-withLabels[1].y)<0.5, 'alphabet and macro main placement differs');
    assert(withLabels[2].y > withLabels[1].y, 'two labels should keep main centered');
    await checked('pt-hints',false); const withoutBadges=measure();
    await checked('pt-hints',true); const withBadges=measure();
    assert(JSON.stringify(withoutBadges) === JSON.stringify(withBadges), 'operation badges move native key content');
    assert([...document.querySelectorAll('.key-badge')].every(n=>getComputedStyle(n).position==='absolute'), 'badges participate in layout');
    await checked('pt-move-main-alt',false); const centered=measure();
    assert(centered[1].y > withLabels[1].y && Math.abs(centered[1].y-centered[3].y)<0.5, 'movement disabled must center main');
    await checked('pt-alt-on-side',true); await input('pt-alt-side','left');
    assert(!byId('pt-alt-side').disabled, 'enabled side picker disabled');
    assert(measure()[1].labels[0].align === 'left', 'physical left label preference');
    await input('pt-alt-side','right'); assert(measure()[1].labels[0].align === 'right','physical right label preference');
    await checked('pt-show-alt',false);
    assert(!document.querySelector('#layout-preview .layout-key-native-alt'), 'native label switch did not hide all labels');
    assert(document.querySelector('#layout-preview .key-badge'), 'native label switch removed editor badges');
    await checked('pt-alt-on-side',false); assert(byId('pt-alt-side').disabled, 'side selector not disabled');
    await checked('pt-show-alt',true); await checked('pt-move-main-alt',true);
    await input('pt-orientation','landscape');
    const smallBefore=measure(); await checked('pt-hints',false); const smallAfter=measure();
    assert(JSON.stringify(smallBefore) === JSON.stringify(smallAfter), 'badges move content in short landscape keys');
    await checked('pt-hints',true);
    assert(JSON.stringify(layout()) === JSON.stringify(testLayout), 'preview options changed the saved layout');
    assert(byId('theme-app-move-main-alt').checked && !byId('theme-app-alt-on-side').checked && byId('theme-app-show-alt').checked, 'theme controls did not synchronize');
    api.results.push('native lower/dual labels / movement / side preferences / visibility / badge-independent geometry');
    return { pass:api.results, errors:api.errors, labels:withLabels, centered };
  };
  api.runTextPreview = async function () {
    await click('#tabbtn-layout');
    const row = 'gjpqyÉ中'.split('').map(main => ({type:'AlphabetKey',main,alt:'1'}));
    await upload('layout-import-file', file({ default:Array.from({length:5},()=>row), text_editor:fixture.text_editor }));
    await input('layout-base-select','default');
    const metrics = () => [...document.querySelectorAll('#layout-preview .layout-key-main')].map(node=>{
      const s=getComputedStyle(node),ctx=document.createElement('canvas').getContext('2d');
      ctx.font=`${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const text=ctx.measureText(node.textContent),box=node.getBoundingClientRect(),key=node.closest('.layout-key').getBoundingClientRect();
      return {text:node.textContent,height:box.height,width:box.width,textWidth:Math.max(text.width,text.actualBoundingBoxLeft+text.actualBoundingBoxRight),fontHeight:text.fontBoundingBoxAscent+text.fontBoundingBoxDescent,overflow:s.overflow,
        inside:box.top >= key.top-0.5 && box.bottom <= key.bottom+0.5};
    });
    const glyphMetrics=[];
    for (const orientation of ['portrait','landscape']) {
      await input('pt-orientation',orientation);
      const measured=metrics();
      assert(measured.every(m=>m.height+0.5 >= m.fontHeight && m.textWidth<=m.width+0.5 && m.inside && m.overflow==='visible'), 'main glyph box clips font metrics');
      glyphMetrics.push({orientation,keys:measured});
    }
    const narrowRow=[{type:'MacroKey',label:'复制选中到剪贴板',displayText:'复制选中到剪贴板',weight:0.1,tap:{macro:[{type:'edit',action:'copy'}]}},{type:'AlphabetKey',main:'g',weight:1}];
    await upload('layout-import-file',file({default:Array.from({length:10},()=>narrowRow),text_editor:fixture.text_editor}));
    await input('pt-height','10');
    const compact=metrics();
    assert(compact.length===20 && compact.every(m=>m.height+0.5>=m.fontHeight && m.textWidth<=m.width+0.5 && m.inside),'narrow labels or short rows still clip at the minimum font size');
    glyphMetrics.push({orientation:'landscape / 10% height / 10 rows / narrow macro',keys:compact});
    await input('pt-height','');
    await click('#tabbtn-theme');
    const palette={name:'Title palette fixture',isDark:false,version:'2.1',colors:{backgroundColor:'#FFF0D0C0',barColor:'#FFC0D0F0',keyboardColor:'#FFD0F0C0',altKeyTextColor:'#FF123456',keyTextColor:'#FF654321'}};
    await upload('theme-import-file',file(palette));
    await click('#tabbtn-layout'); await input('layout-base-select','text_editor');
    const setBorder = async value=>{byId('pt-border').checked=value;byId('pt-border').dispatchEvent(new Event('change',{bubbles:true}));await pause();};
    for (const mode of ['light','dark','auto']) {
      await click(`[data-site-theme="${mode}"]`);
      await setBorder(true);
      assert(getComputedStyle($('.text-editor-titlebar')).backgroundColor==='rgba(0, 0, 0, 0)','bordered title must reveal IME background');
      assert(getComputedStyle($('#layout-preview')).backgroundColor==='rgb(240, 208, 192)','IME title backing must be backgroundColor');
      assert(getComputedStyle($('.text-editor-pad-area')).backgroundColor==='rgb(208, 240, 192)','content background must stay keyboardColor');
      assert(getComputedStyle($('.te-title')).color==='rgb(18, 52, 86)','title foreground changed');
      assert([...document.querySelectorAll('.text-editor-titlebar .te-btn')].every(n=>getComputedStyle(n).backgroundColor==='rgba(0, 0, 0, 0)'), 'global button theme paints text editor buttons');
      await setBorder(false);
      assert(getComputedStyle($('.text-editor-titlebar')).backgroundColor==='rgb(192, 208, 240)','unbordered title must use barColor');
    }
    await setBorder(true);
    api.results.push('text editor title/button surfaces / mode and border switches / complete main font metrics');
    return {pass:api.results,errors:api.errors,metrics:glyphMetrics};
  };
})();
