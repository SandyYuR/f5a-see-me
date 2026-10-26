"""Real-browser coverage for the layout workspace.
Run: python tests/workspace-browser.py
Requires Playwright for Python and Chromium (CHROMIUM_PATH overrides its path).
Screenshots are written to F5A_SHOTS when set; no external services are required.
"""
import functools
import json
import os
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
        page.screenshot(path=str(Path(shots) / f'{name}.png'), full_page=True)


def layout(page):
    return json.loads(page.locator('#layout-json').input_value())


def key(page, row=0, index=0):
    return page.locator(f'#layout-preview [data-preview-row="{row}"][data-preview-key="{index}"]').first


def upload(page, data):
    page.locator('#layout-import-file').set_input_files({
        'name': 'layout.json', 'mimeType': 'application/json',
        'buffer': json.dumps(data).encode(),
    })


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, color_scheme='light')
        # Exercise the static/offline editor, including its textarea fallback.
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(url) else route.abort())
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url, wait_until='domcontentloaded')
        expect(page.locator('body')).to_have_class('layout-workspace-active')
        expect(page.locator('#layout-json-card')).not_to_be_visible()
        expect(page.locator('#layout-download-json')).to_be_visible()
        page.locator('#layout-import-file').set_input_files({
            'name': 'broken.json', 'mimeType': 'application/json', 'buffer': b'{broken',
        })
        expect(page.locator('#workspace-feedback')).to_be_visible()
        expect(page.locator('#workspace-feedback')).to_contain_text('导入失败')
        assert len(layout(page)['default'][0]) == 10
        snapshot(page, 'workspace-light-empty')
        key(page).click()
        expect(page.locator('#inspector-main')).to_have_value('Q')
        assert not page.locator('#layout-key-dialog').evaluate('(d) => d.open')
        # Changing a field then clicking the next key must work on the first click.
        page.locator('#inspector-main').fill('Ω')
        key(page, 0, 1).click()
        expect(page.locator('#inspector-main')).to_have_value('W')
        assert layout(page)['default'][0][0]['main'] == 'Ω'
        page.locator('#inspector-main').fill('AB')
        page.locator('#inspector-next').click()
        expect(page.locator('#inspector-status')).to_contain_text('单个字符')
        assert layout(page)['default'][0][1]['main'] == 'W'
        expect(page.locator('#inspector-key-position')).to_contain_text('第 2 键')
        downloads = []
        page.on('download', lambda item: downloads.append(item))
        page.locator('#layout-download-json').click()
        page.wait_for_timeout(100)
        assert not downloads, 'invalid pending input must block export'
        page.locator('#inspector-revert').click()
        expect(page.locator('#inspector-main')).to_have_value('W')
        page.locator('#inspector-weight').fill('0.15')
        page.locator('#inspector-weight').press('Tab')
        assert layout(page)['default'][0][1]['weight'] == 0.15
        page.locator('#inspector-weight').fill('')
        page.locator('#inspector-weight').press('Tab')
        assert 'weight' not in layout(page)['default'][0][1]
        page.locator('#inspector-duplicate').click()
        assert len(layout(page)['default'][0]) == 11
        page.locator('#inspector-right').click()
        assert layout(page)['default'][0][3]['main'] == 'W'
        page.locator('#inspector-delete').click()
        assert len(layout(page)['default'][0]) == 10
        page.locator('#top-undo').click()
        assert len(layout(page)['default'][0]) == 11
        page.locator('#top-redo').click()
        assert len(layout(page)['default'][0]) == 10
        key(page).click()
        page.locator('#inspector-advanced').click()
        page.locator('#layout-key-alt').fill('9')
        page.locator('#layout-key-save').click()
        expect(page.locator('#inspector-alt')).to_have_value('9')
        assert layout(page)['default'][0][0]['alt'] == '9'
        # Full editor is still cancellable without touching the saved layout.
        page.locator('#inspector-advanced').click()
        page.locator('#layout-key-main').fill('X')
        page.locator('#layout-key-cancel').click()
        assert layout(page)['default'][0][0]['main'] == 'Ω'
        snapshot(page, 'workspace-light')
        page.locator('[data-site-theme="dark"]').click()
        snapshot(page, 'workspace-dark')
        page.locator('[data-site-theme="light"]').click()
        for tab in ['theme', 'popup', 'icon-theme', 'symbols', 'layout']:
            page.locator(f'#tabbtn-{tab}').click()
            expect(page.locator(f'#tab-{tab}')).to_be_visible()
            host = 'layout-canvas-host' if tab == 'layout' else 'shared-preview-host'
            assert page.locator('.keyboard-preview-panel').evaluate('(p) => p.parentElement.id') == host
        page.locator('#workspace-json-toggle').click()
        expect(page.locator('#layout-json-card')).to_be_visible()
        source = layout(page)
        source['default'][0][0]['main'] = 'K'
        page.locator('#layout-json').fill(json.dumps(source))
        expect(page.locator('#inspector-main')).to_have_value('K')
        page.locator('#layout-json').fill('{broken')
        expect(page.locator('#layout-json-status')).to_contain_text('JSON 错误')
        expect(page.locator('#inspector-main')).to_have_value('K')
        page.locator('#layout-json').fill(json.dumps(source))
        page.locator('#workspace-json-toggle').click()
        expect(page.locator('#layout-json-card')).not_to_be_visible()
        # Split preview must select and modify the displayed variant, not the normal key.
        alpha = lambda main: {'type': 'AlphabetKey', 'main': main, 'alt': '1'}
        fixture = {'default': {'default': [[alpha('A'), alpha('B')]], '__variant__:split': [[alpha('X'), alpha('Y')]]}}
        upload(page, fixture)
        page.locator('.preview-settings > summary').click()
        page.locator('#pt-split').check()
        key(page).click()
        expect(page.locator('#layout-split-mode')).to_be_checked()
        expect(page.locator('#inspector-main')).to_have_value('X')
        page.locator('#inspector-main').fill('Z')
        page.locator('#inspector-main').press('Enter')
        data = layout(page)['default']
        assert data['default'][0][0]['main'] == 'A'
        assert data['__variant__:split'][0][0]['main'] == 'Z'
        page.locator('#layout-split-mode').uncheck()
        key(page).click()
        expect(page.locator('#inspector-main')).to_have_value('A')
        # A pending edit may rebuild the selects; it must not swallow the choice.
        upload(page, {'first': [[alpha('A')]], 'second': [[alpha('B')]]})
        key(page).click()
        page.locator('#inspector-main').fill('C')
        page.locator('#layout-base-select').select_option('second')
        expect(page.locator('#layout-base-select')).to_have_value('second')
        assert layout(page)['first'][0][0]['main'] == 'C'
        key(page).click()
        page.locator('#inspector-main').fill('invalid')
        page.locator('#layout-base-select').select_option('first')
        expect(page.locator('#layout-base-select')).to_have_value('second')
        page.locator('#tabbtn-theme').click()
        expect(page.locator('#tab-layout')).to_be_visible()
        page.locator('#inspector-revert').click()
        # Quick edits preserve nested events, display maps, and compose overrides.
        fixture = {'custom': [[{'type': 'MacroKey', 'label': 'hello', 'tap': {'macro': [{'type': 'text', 'text': 'hi'}]}, 'displayText': {'schema': 'Hello'}, 'composeOverride': {'type': 'MacroKey', 'label': 'composing', 'tap': {'macro': [{'type': 'text', 'text': 'ok'}]}}}]]}
        upload(page, fixture)
        key(page).click()
        original = layout(page)['custom'][0][0]
        page.locator('#inspector-label').fill('greeting')
        page.locator('#inspector-label').press('Enter')
        edited = layout(page)['custom'][0][0]
        assert edited['label'] == 'greeting'
        for prop in ['tap', 'displayText', 'composeOverride']:
            assert edited[prop] == original[prop], prop
        with page.expect_download() as download:
            page.locator('#layout-download-json').click()
        assert json.loads(Path(download.value.path()).read_text()) == layout(page)
        page.reload(wait_until='domcontentloaded')
        expect(page.locator('#layout-base-select')).to_have_value('custom')
        assert layout(page)['custom'][0][0]['label'] == 'greeting'
        # Actual desktop drag/drop still works with selection and inspector enabled.
        upload(page, {'drag': [[alpha('A'), alpha('B'), alpha('C')]]})
        chips = page.locator('#layout-rows .layout-chip')
        chips.nth(0).drag_to(chips.nth(2), target_position={'x': 30, 'y': 15})
        assert layout(page)['drag'][0][-1]['main'] == 'A'
        # Real touch selection and narrow-width checks.
        mobile = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, color_scheme='light')
        mobile.route('**/*', lambda route: route.continue_() if route.request.url.startswith(url) else route.abort())
        mp = mobile.new_page()
        mp.on('pageerror', lambda error: errors.append(str(error)))
        mp.goto(url, wait_until='domcontentloaded')
        expect(mp.locator('body')).to_have_class('layout-workspace-active')
        key(mp).tap()
        expect(mp.locator('#inspector-form')).to_be_visible()
        expect(mp.locator('#inspector-main')).to_have_value('Q')
        mp.locator('#inspector-back-to-canvas').tap()
        expect(mp.locator('#inspector-back-to-canvas')).to_be_visible()
        mp.locator('#layout-rows .layout-chip').first.tap()
        mp.locator('#inspector-advanced').tap()
        mp.locator('#layout-key-alt').fill('7')
        mp.locator('#layout-key-save').tap()
        expect(mp.locator('#inspector-alt')).to_have_value('7')
        assert mp.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile horizontal overflow'
        snapshot(mp, 'workspace-mobile')
        for width in [360, 768, 1024, 1920]:
            page.set_viewport_size({'width': width, 'height': 900})
            page.wait_for_timeout(150)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow at {width}'
        assert errors == [], errors
        browser.close()
        print('PASS: workspace selection, validation, edits, copy/move/delete, undo/redo, advanced editor, tabs, JSON, split variants, nested data, export, draft restore, drag, touch and responsive layout')
finally:
    server.shutdown()
    server.server_close()
