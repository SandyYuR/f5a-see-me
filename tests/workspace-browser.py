"""Browser regression coverage for workspace transactions and toolbar previews.
Run: python tests/workspace-browser.py
Requires Python Playwright and Chromium (override CHROMIUM_PATH if needed).
Set F5A_SHOTS to save the reviewed desktop, mobile, and symbols screenshots.
"""
import functools
import json
import os
import re
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}'
shots = os.environ.get('F5A_SHOTS')


def snapshot(page, name):
    if shots:
        Path(shots).mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(Path(shots) / f'{name}.png'), full_page='mobile' not in name)


def layout(page):
    return json.loads(page.locator('#layout-json').input_value())


def key(page, row=0, index=0):
    return page.locator(f'#layout-preview [data-preview-row="{row}"][data-preview-key="{index}"]').first


def upload(page, data, target='layout-import-file'):
    page.locator(f'#{target}').set_input_files({
        'name': 'fixture.json', 'mimeType': 'application/json', 'buffer': json.dumps(data).encode(),
    })


def alpha(main):
    return {'type': 'AlphabetKey', 'main': main, 'alt': '1'}


def offline(route):
    if '/api/v1/' in route.request.url:
        route.fulfill(status=404, content_type='application/json', body='{"message":"offline"}')
    elif route.request.url.startswith(url):
        route.continue_()
    else:
        route.abort()


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, color_scheme='light')
        context.route('**/*', offline)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url, wait_until='domcontentloaded')
        expect(page.locator('body')).to_have_class('layout-workspace-active')
        assert page.evaluate('''() => {
            const ids = Array.from(document.querySelectorAll('[id]'), e => e.id);
            return ids.length === new Set(ids).size;
        }'''), 'duplicate DOM IDs'
        expect(page.locator('#layout-json-card')).to_be_visible()
        expect(page.locator('#layout-json')).not_to_be_empty()
        # Preview and inspector share the workspace across tabs; tabs follow it on desktop.
        assert page.locator('#editing-workspace').bounding_box()['y'] < page.locator('.tabs').bounding_box()['y']
        assert page.locator('.keyboard-preview-panel').evaluate('(p) => p.parentElement.id') == 'shared-preview-host'
        key(page).click()
        expect(page.locator('#inspector-main')).to_have_value('Q')
        page.locator('#inspector-main').fill('Ω')
        page.locator('#inspector-weight').click()
        expect(key(page)).to_contain_text('Ω')
        assert layout(page)['default'][0][0]['main'] == 'Q', 'blur must not commit a draft'
        key(page, 0, 1).click()
        expect(page.locator('#workspace-leave-dialog')).to_be_visible()
        page.locator('#workspace-leave-stay').click()
        expect(page.locator('#inspector-main')).to_have_value('Ω')
        key(page, 0, 1).click()
        page.locator('#workspace-leave-apply').click()
        expect(page.locator('#inspector-main')).to_have_value('W')
        assert layout(page)['default'][0][0]['main'] == 'Ω'
        page.locator('#inspector-main').fill('AB')
        page.locator('#inspector-apply').click()
        expect(page.locator('#inspector-status')).to_contain_text('单个字符')
        assert layout(page)['default'][0][1]['main'] == 'W'
        page.locator('#inspector-revert').click()
        page.locator('#inspector-weight').fill('0.15')
        page.locator('#inspector-position > summary').click()
        page.locator('#inspector-right').click()
        assert layout(page)['default'][0][1]['main'] == 'W'
        expect(page.locator('#inspector-key-position')).to_contain_text('第 3 键')
        page.locator('#inspector-revert').click()
        expect(page.locator('#inspector-key-position')).to_contain_text('第 2 键')
        page.locator('#inspector-main').fill('Ж')
        page.locator('#inspector-right').click()
        page.locator('#inspector-apply').click()
        assert layout(page)['default'][0][2]['main'] == 'Ж'
        page.locator('#top-undo').click()
        assert layout(page)['default'][0][1]['main'] == 'W', 'one undo restores movement and fields together'
        page.locator('#top-redo').click()
        assert layout(page)['default'][0][2]['main'] == 'Ж'
        # Row chips retain the complete modal editor; cancel keeps committed data.
        page.locator('#layout-rows .layout-chip').first.click()
        expect(page.locator('#layout-key-dialog')).to_be_visible()
        page.locator('#layout-key-main').fill('X')
        page.locator('#layout-key-cancel').click()
        assert layout(page)['default'][0][0]['main'] == 'Ω'
        # Refresh preserves an unfinished key independently from the layout document.
        key(page).click()
        page.locator('#inspector-main').fill('Д')
        page.reload(wait_until='domcontentloaded')
        expect(page.locator('#inspector-main')).to_have_value('Д')
        assert layout(page)['default'][0][0]['main'] == 'Ω'
        page.locator('#tabbtn-theme').click()
        page.locator('#workspace-leave-discard').click()
        expect(page.locator('#tab-theme')).to_be_visible()
        page.locator('#tabbtn-layout').click()
        key(page).click()
        expect(page.locator('#inspector-main')).to_have_value('Ω')
        # JSON is an explicit draft, survives malformed input/refresh, and guards export.
        source = layout(page)
        source['default'][0][0]['main'] = 'K'
        page.locator('#layout-json').fill(json.dumps(source))
        expect(key(page)).to_contain_text('Ω')
        page.locator('#layout-download-json').click()
        expect(page.locator('#workspace-json-dialog')).to_be_visible()
        with page.expect_download() as download:
            page.locator('#workspace-json-current').click()
        assert json.loads(Path(download.value.path()).read_text())['default'][0][0]['main'] == 'Ω'
        page.locator('#layout-json-format').click()
        expect(key(page)).to_contain_text('Ω')
        expect(page.locator('#layout-json-status')).to_contain_text('未应用')
        page.locator('#layout-json-apply').click()
        expect(key(page)).to_contain_text('K')
        page.locator('#layout-json').fill('{unfinished')
        page.reload(wait_until='domcontentloaded')
        expect(page.locator('#layout-json')).to_have_value('{unfinished')
        expect(key(page)).to_contain_text('K')
        page.locator('#layout-download-json').click()
        page.locator('#workspace-json-apply').click()
        expect(page.locator('#layout-json-status')).to_contain_text('JSON 错误')
        expect(page.locator('#layout-json')).to_have_value('{unfinished')
        page.locator('#layout-json-revert').click()
        assert layout(page)['default'][0][0]['main'] == 'K'
        # Split simulation suspends the draft and resumes it on the same source key.
        key(page).click()
        page.locator('#inspector-main').fill('D')
        page.locator('#preview-simulation > summary').click()
        page.locator('#pt-split').check()
        expect(page.locator('#inspector-empty')).to_be_visible()
        page.locator('#pt-split').uncheck()
        key(page).click()
        expect(page.locator('#inspector-main')).to_have_value('D')
        page.locator('#inspector-revert').click()
        # The split preview edits its actual variant; regular layout remains untouched.
        upload(page, {'default': {'default': [[alpha('A'), alpha('B')]], '__variant__:split': [[alpha('X'), alpha('Y')]]}})
        page.locator('#pt-split').check()
        key(page).click()
        expect(page.locator('#layout-split-mode')).to_be_checked()
        expect(page.locator('#inspector-main')).to_have_value('X')
        page.locator('#inspector-main').fill('Z')
        page.locator('#inspector-apply').click()
        data = layout(page)['default']
        assert data['default'][0][0]['main'] == 'A'
        assert data['__variant__:split'][0][0]['main'] == 'Z'
        page.locator('#layout-split-mode').uncheck()
        # A guarded selector change must retain the requested destination after apply.
        upload(page, {'first': [[alpha('A')]], 'second': [[alpha('B')]]})
        key(page).click()
        page.locator('#inspector-main').fill('C')
        page.locator('#layout-base-select').select_option('second')
        expect(page.locator('#layout-base-select')).to_have_value('first')
        page.locator('#workspace-leave-apply').click()
        expect(page.locator('#layout-base-select')).to_have_value('second')
        assert layout(page)['first'][0][0]['main'] == 'C'
        # Preserve Android-specific nested actions and display maps during quick edits.
        fixture = {'custom': [[{'type': 'MacroKey', 'label': 'hello', 'tap': {'macro': [{'type': 'text', 'text': 'hi'}]}, 'displayText': {'schema': 'Hello'}, 'composeOverride': {'type': 'MacroKey', 'label': 'composing', 'tap': {'macro': [{'type': 'text', 'text': 'ok'}]}}}]]}
        upload(page, fixture)
        key(page).click()
        original = layout(page)['custom'][0][0]
        page.locator('#inspector-label').fill('greeting')
        page.locator('#inspector-apply').click()
        edited = layout(page)['custom'][0][0]
        for prop in ['tap', 'displayText', 'composeOverride']:
            assert edited[prop] == original[prop], prop
        # Copying a row creates an independent copy and one undo removes it.
        page.locator('#layout-rows .row-copy').first.click()
        assert len(layout(page)['custom']) == 2
        page.locator('#top-undo').click()
        assert len(layout(page)['custom']) == 1
        # Desktop drag remains functional after explicit edits.
        upload(page, {'drag': [[alpha('A'), alpha('B'), alpha('C')]]})
        chips = page.locator('#layout-rows .layout-chip')
        chips.nth(0).drag_to(chips.nth(2), target_position={'x': 30, 'y': 15})
        assert layout(page)['drag'][0][-1]['main'] == 'A'
        print('PASS workspace drafts, guards, JSON, undo, split, and drag')

        # Switching themes, importing a theme, and saving a slot repaint immediately.
        page.locator('#tabbtn-icon-theme').click()
        toolbar = page.locator('#layout-preview > .kb-tb-host')
        before = toolbar.inner_html()
        page.locator('.icon-theme-card').nth(1).click()
        page.wait_for_function('(before) => document.querySelector("#layout-preview > .kb-tb-host").innerHTML !== before', arg=before)
        upload(page, {'name': 'Toolbar test', 'icons': {'system.toolbar_toggle': 'TEST-A'}}, 'icon-theme-import-json-file')
        toggle = page.locator('#layout-preview [data-kb-tb-btn="toolbar_toggle"]')
        expect(toggle).to_contain_text('TEST-A')
        page.locator('.icon-slot-edit-btn[data-slot="system.toolbar_toggle"]').click()
        page.locator('#icon-slot-emoji').fill('TEST-B')
        page.locator('#icon-slot-save').click()
        expect(toggle).to_contain_text('TEST-B')
        # Async file icons repaint on completion, deduplicate requests, and ignore late old themes.
        pending = []
        page.route('**/api/v1/icon-theme/preview?*', lambda route: pending.append(route))
        upload(page, {'name': 'Async icons', 'icons': {'system.toolbar_toggle': 'file:button_icons/one.png'}}, 'icon-theme-import-json-file')
        page.wait_for_timeout(150)
        assert len(pending) == 1, 'slot and toolbar should share one fetch'
        pending.pop().fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="red"/></svg>')
        expect(toggle.locator('.kb-tb-mask')).to_have_attribute('style', re.compile('mask-image:url.*blob:'))
        upload(page, {'name': 'Late icons', 'icons': {'system.toolbar_toggle': 'file:button_icons/late.png'}}, 'icon-theme-import-json-file')
        page.wait_for_timeout(150)
        assert len(pending) == 1
        page.locator('.icon-theme-card', has_text='Toolbar test').click()
        expect(toggle).to_contain_text('TEST-B')
        pending.pop().fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="12"/></svg>')
        page.wait_for_timeout(100)
        expect(toggle).to_contain_text('TEST-B')
        expect(page.locator('.icon-slot-row[data-slot="system.toolbar_toggle"] .icon-slot-custom-preview img')).to_have_count(0)
        expect(page.locator('.icon-slot-row[data-slot="system.toolbar_toggle"] .icon-slot-custom-preview')).to_contain_text('TEST')
        # A different file in the same theme/slot must not reuse the previous blob.
        page.locator('.icon-theme-card', has_text='Async icons').click()
        icon_source = json.loads(page.locator('#icon-theme-json').input_value())
        icon_source['icons']['system.toolbar_toggle'] = 'file:button_icons/two.png'
        page.locator('#icon-theme-json').fill(json.dumps(icon_source))
        page.locator('#icon-theme-json-format').click()
        page.wait_for_timeout(150)
        assert len(pending) == 1, 'changed file reference must fetch a new preview'
        pending.pop().fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="12" height="12"/></svg>')
        expect(toggle.locator('.kb-tb-mask')).to_have_attribute('style', re.compile('mask-image:url.*blob:'))
        page.locator('.icon-theme-card', has_text='Toolbar test').click()
        # Symbol categories and group clicks keep their toolbar sibling intact.
        page.locator('#tabbtn-symbols').click()
        expect(toolbar).to_be_visible()
        expect(toggle).to_contain_text('TEST-B')
        for kind in ['symbols', 'emoji', 'kaomoji']:
            page.locator('#sym-kind').select_option(kind)
            expect(toolbar).to_be_visible()
            groups = page.locator('#layout-preview [data-group-index]')
            if groups.count() > 1:
                groups.nth(1).click()
                expect(toolbar).to_be_visible()
        h = page.locator('#layout-preview').bounding_box()['height']
        page.locator('#pt-kb-toolbar-status').check()
        expect(page.locator('#layout-preview .kb-tb-status')).to_be_visible()
        assert abs(page.locator('#layout-preview').bounding_box()['height'] - h) <= 2
        page.locator('#pt-kb-toolbar-status').uncheck()
        page.locator('#pt-kb-toolbar').uncheck()
        expect(toolbar).to_have_count(0)
        page.locator('#pt-kb-toolbar').check()
        expect(toolbar).to_be_visible()
        # Keep documentation screenshots free of test-only icon text.
        page.locator('#tabbtn-icon-theme').click()
        page.locator('.icon-theme-card[data-icon-theme-id="builtin-default"]').click()
        page.locator('#tabbtn-symbols').click()
        snapshot(page, 'workspace-symbols-toolbar')
        print('PASS theme selection, slot save, async icon refresh/race, and symbol toolbar')

        # Full default keyboard screenshots, including selected inspector and dark mode.
        page.locator('#tabbtn-layout').click()
        page.on('dialog', lambda d: d.accept())
        page.locator('#layout-reset').click()
        key(page).click()
        page.evaluate('window.scrollTo(0,0)')
        snapshot(page, 'workspace-desktop-light')
        page.locator('[data-site-theme="dark"]').click()
        snapshot(page, 'workspace-desktop-dark')
        page.locator('[data-site-theme="light"]').click()
        # Touch uses a bottom sheet with fixed sample and reachable actions on a short viewport.
        mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, color_scheme='light')
        mobile.route('**/*', offline)
        mp = mobile.new_page()
        mp.on('pageerror', lambda e: errors.append(str(e)))
        mp.goto(url, wait_until='domcontentloaded')
        expect(mp.locator('body')).to_have_class('layout-workspace-active')
        assert mp.locator('.tabs').bounding_box()['y'] < mp.locator('#editing-workspace').bounding_box()['y']
        key(mp).tap()
        expect(mp.locator('#inspector-form')).to_be_visible()
        mp.locator('#inspector-main').fill('M')
        expect(mp.locator('#inspector-key-face')).to_contain_text('M')
        assert layout(mp)['default'][0][0]['main'] == 'Q'
        mp.locator('#inspector-apply').tap()
        assert layout(mp)['default'][0][0]['main'] == 'M'
        snapshot(mp, 'workspace-mobile')
        mp.set_viewport_size({'width': 390, 'height': 480})
        for selector in ['.inspector-sample', '.inspector-actions']:
            box = mp.locator(selector).bounding_box()
            assert 0 <= box['y'] and box['y'] + box['height'] <= 481, selector
        mp.locator('#inspector-close').tap()
        mp.locator('#layout-rows .layout-chip').first.tap()
        expect(mp.locator('#layout-key-dialog')).to_be_visible()
        mp.locator('#layout-key-cancel').tap()
        assert mp.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile horizontal overflow'
        for width in [360, 768, 1024, 1920]:
            page.set_viewport_size({'width': width, 'height': 900})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow at {width}px'
        assert not errors, errors
        print('PASS desktop/mobile geometry, touch, and zero page errors')
        browser.close()
finally:
    server.shutdown()
