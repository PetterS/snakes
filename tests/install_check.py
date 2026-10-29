# /// script
# requires-python = ">=3.11, <3.14"
# dependencies = ["playwright==1.63.0"]
# ///
"""Home-screen, update and offline checks in background tabs of existing Chrome."""
import functools
import http.server
import json
from pathlib import Path
import shutil
import tempfile
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGES = []
INSTRUMENT = """(() => {
  let engine;
  Object.defineProperty(window, 'DeepBelow', {
    get: () => engine,
    set: value => {
      const Original = value.Game;
      value.Game = class extends Original {
        constructor(seed, upgrades) { super(11223344, upgrades); window.testGame = this; }
      };
      engine = value;
    }
  });
})();"""


def open_tab(browser, script=""):
    context = browser.contexts[0]
    browser_cdp = browser.new_browser_cdp_session()
    with context.expect_page() as created:
        browser_cdp.send("Target.createTarget", {
            "url": "about:blank", "background": True, "newWindow": False,
        })
    browser_cdp.detach()
    page = created.value
    PAGES.append(page)
    page.set_viewport_size({"width": 768, "height": 1024})
    cdp = context.new_cdp_session(page)
    cdp.send("Emulation.setFocusEmulationEnabled", {"enabled": True})
    cdp.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
    page.add_init_script(INSTRUMENT)
    if script:
        page.add_init_script(script)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    return page, cdp, errors


def tap(page, cdp, selector):
    locator = page.locator(selector)
    # Wait for the HUD to enable a tool after resuming, then use real touch.
    locator.click(trial=True)
    rect = locator.bounding_box()
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{
        "x": rect["x"] + rect["width"] / 2, "y": rect["y"] + rect["height"] / 2,
        "id": 1, "radiusX": 5, "radiusY": 5,
    }]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


def check(browser):
    class Handler(http.server.SimpleHTTPRequestHandler):
        unavailable = False

        def log_message(self, *_):
            pass

        def do_GET(self):
            if self.unavailable:
                self.send_error(503)
            else:
                super().do_GET()

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

    with tempfile.TemporaryDirectory(prefix="deep-below-install-") as directory:
        served = Path(directory) / "snakes"
        served.mkdir()
        for filename in ["index.html", "style.css", "engine.js", "game.js", "install.js", "sw.js", "manifest.webmanifest"]:
            shutil.copy2(ROOT / filename, served / filename)
        shutil.copytree(ROOT / "icons", served / "icons")
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=directory))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{server.server_port}/snakes/"
        page, cdp, errors = open_tab(browser)
        try:
            page.goto(url)
            page.wait_for_function("navigator.serviceWorker.controller !== null")
            page.wait_for_function("document.querySelector('.offline-status').textContent.includes('redo')")
            manifest = cdp.send("Page.getAppManifest")
            assert not manifest["errors"], manifest
            data = json.loads(manifest["data"])
            assert data["display"] == "standalone" and data["name"] == "Djupt under" and data["lang"] == "sv"
            assert data["scope"] == "./" and data["start_url"] == "./" and data["id"] == "./"
            assert not cdp.send("Page.getInstallabilityErrors")["installabilityErrors"]
            icons = page.evaluate("""async () => {
              const manifest=await (await fetch('manifest.webmanifest')).json();
              const paths=[document.querySelector('[rel="apple-touch-icon"]').href,...manifest.icons.map(i=>i.src)];
              return Promise.all(paths.map(async path=>{
                const i=new Image();i.src=path;await i.decode();return [i.naturalWidth,i.naturalHeight];
              }));
            }""")
            assert icons == [[180, 180], [192, 192], [512, 512]], icons
            assert page.locator('[name="apple-mobile-web-app-capable"]').get_attribute("content") == "yes"

            # Help is usable with touch, keyboard, and both iPad orientations.
            for width, height in [(1024, 768), (768, 1024), (390, 844), (844, 390)]:
                page.set_viewport_size({"width": width, "height": height})
                if page.locator(".install-help").get_attribute("open") is None:
                    tap(page, cdp, ".install-help summary")
                assert "Öppna som webbapp" in page.locator(".install-help").inner_text()
                assert "Android och Chrome" in page.locator(".install-help").inner_text()
                assert page.evaluate("document.documentElement.scrollWidth===innerWidth && document.documentElement.scrollHeight===innerHeight")
                assert page.evaluate("document.querySelector('#panel').scrollWidth===document.querySelector('#panel').clientWidth")
                page.screenshot(path=f"/tmp/deep-below-install-{width}x{height}.png")
            page.set_viewport_size({"width": 768, "height": 1024})
            tap(page, cdp, ".install-help summary")
            page.locator(".install-help summary").focus()
            page.keyboard.press("Tab")
            assert page.locator("#start").evaluate("el=>el===document.activeElement")
            page.keyboard.press("Shift+Tab")
            assert page.locator(".install-help summary").evaluate("el=>el===document.activeElement")

            # Exercise the Chrome prompt lifecycle without installing on the host OS.
            for outcome in ["dismissed", "accepted", "error"]:
                page.evaluate("""outcome => {
                  window.promptCalls=0;
                  const event=new Event('beforeinstallprompt',{cancelable:true});
                  event.prompt=async()=>{window.promptCalls++;if(outcome==='error')throw Error('unavailable')};
                  event.userChoice=Promise.resolve({outcome});
                  window.dispatchEvent(event);
                  if(!event.defaultPrevented)throw Error('prompt was not deferred');
                }""", outcome)
                if page.locator(".install-help").get_attribute("open") is None:
                    tap(page, cdp, ".install-help summary")
                tap(page, cdp, ".install-button")
                assert page.evaluate("promptCalls") == 1
                assert page.locator(".install-button").is_hidden()
            page.evaluate("window.dispatchEvent(new Event('appinstalled'))")
            assert page.locator(".install-help").is_hidden()
            page.reload()
            print("PASS installability, icons, four layouts, keyboard focus and install prompt lifecycle", flush=True)

            # Native tools and hold-to-steer still work with installation enabled.
            tap(page, cdp, "#start")
            page.evaluate("testGame.snakes=[];testGame.player.invincible=100")
            steering = {"x": 384, "y": 780, "id": 10}
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [steering]})
            page.wait_for_function("testGame.player.y > 4")
            before = page.evaluate("testGame.player.y")
            rect = page.locator("#flare").bounding_box()
            tool = {"x": rect["x"] + rect["width"] / 2, "y": rect["y"] + rect["height"] / 2, "id": 11}
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [steering, tool]})
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": [tool]})
            page.wait_for_function(f"testGame.player.y > {before} && testGame.player.flares === 2")
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            position = page.evaluate("testGame.player.y")
            page.wait_for_timeout(250)
            assert page.evaluate("testGame.player.y") == position
            tap(page, cdp, "#pause")
            tap(page, cdp, ".install-help summary")
            assert page.evaluate("testGame.state") == "paused"
            tap(page, cdp, "#resume")
            assert page.locator("#overlay").is_hidden()
            tap(page, cdp, "#drill")
            page.wait_for_function("testGame.player.drillCooldown>0 && testGame.player.drilling===0")
            tap(page, cdp, "#pause")

            # A worker update must preserve a running expedition and other apps' caches.
            saved = {"bank": 123, "best": 45, "runs": 2, "wins": 1, "upgrades": {"pick": 1, "boots": 2, "armor": 0}}
            page.evaluate("saved=>localStorage.setItem('deep-below-camp',JSON.stringify(saved))", saved)
            page.evaluate("caches.open('bygga-unrelated-test')")
            position = page.evaluate("[testGame.player.x,testGame.player.y,testGame.player.flares]")
            sw = served / "sw.js"
            sw.write_text(sw.read_text().replace("${PREFIX}v7", "${PREFIX}v8").replace("?v=7", "?v=8"))
            html = served / "index.html"
            html.write_text(html.read_text().replace("?v=7", "?v=8"))
            game = served / "game.js"
            game.write_text(game.read_text() + "\nwindow.testUpdatedBundle = true;\n")
            page.evaluate("""async()=>{
              const registration=await navigator.serviceWorker.getRegistration();
              const changed=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
              await registration.update();await changed;
            }""")
            page.wait_for_function("navigator.serviceWorker.controller.state==='activated'")
            assert not page.evaluate("window.testUpdatedBundle === true")
            assert page.evaluate("[testGame.player.x,testGame.player.y,testGame.player.flares]") == position
            assert page.evaluate("testGame.state") == "paused"
            keys = page.evaluate("caches.keys()")
            assert "deep-below-/snakes/-v8" in keys and "deep-below-/snakes/-v7" not in keys, keys
            assert "bygga-unrelated-test" in keys, keys
            page.reload()
            page.wait_for_function("window.testUpdatedBundle === true")
            assert page.evaluate("JSON.parse(localStorage.getItem('deep-below-camp'))") == saved
            assert page.evaluate("testGame.upgrades") == saved["upgrades"]
            print("PASS native multi-touch, pause help, worker update preserves expedition and unrelated caches", flush=True)

            # A server error also falls back to a complete cached shell.
            Handler.unavailable = True
            page.reload()
            page.wait_for_function("window.testUpdatedBundle === true")
            Handler.unavailable = False

            # Stop the server: workers have independent network access, so merely
            # setting the page offline would not prove the offline cache works.
            server.shutdown()
            server.server_close()
            cdp.send("Network.enable")
            cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
            cdp.send("Network.emulateNetworkConditions", {
                "offline": True, "latency": 0, "downloadThroughput": -1, "uploadThroughput": -1,
            })
            page.goto(url + "?offline-check=1")
            page.wait_for_function("window.testUpdatedBundle === true")
            assert page.evaluate("JSON.parse(localStorage.getItem('deep-below-camp'))") == saved
            tap(page, cdp, "#start")
            tap(page, cdp, "#drill")
            page.wait_for_function("testGame.player.drillCooldown>0 && testGame.player.drilling===0")
            assert not errors, errors
            print("PASS manifest/installability/icons; Swedish touch/keyboard help at four sizes; Chrome prompt lifecycle; multi-touch tools; update without interrupting play; scoped caches; offline reload/play and saved upgrades", flush=True)

            # Installed Safari and Chromium both suppress redundant install help.
            for script in ["Object.defineProperty(navigator,'standalone',{value:true})", """(() => {
              const original=window.matchMedia.bind(window);
              window.matchMedia=query=>query==='(display-mode: standalone)'?{matches:true,addEventListener(){}}:original(query);
            })()"""]:
                installed, _, installed_errors = open_tab(browser, script)
                installed.goto(url)
                installed.locator("#start").wait_for()
                assert installed.locator(".install-help").count() == 0
                assert not installed_errors, installed_errors
                installed.close()
        finally:
            # This temporary origin is test-owned; leave the user's sites intact.
            if not page.is_closed() and page.url.startswith(url):
                page.evaluate("""async()=>{
                  for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();
                  for(const key of await caches.keys())await caches.delete(key);
                  localStorage.clear();
                }""")
            if thread.is_alive():
                server.shutdown()
                server.server_close()

    # Direct file play skips installation and works with unavailable storage/SW.
    local, local_cdp, local_errors = open_tab(browser, """
      Object.defineProperty(window,'localStorage',{get(){throw Error('storage unavailable')}});
      Object.defineProperty(navigator,'serviceWorker',{value:{register(){throw Error('unexpected file registration')}}});
    """)
    local.goto((ROOT / "index.html").as_uri())
    assert local.locator(".install-help").count() == 0
    tap(local, local_cdp, "#start")
    tap(local, local_cdp, "#drill")
    local.wait_for_function("testGame.player.y>=9 && testGame.player.drilling===0")
    assert not local_errors, local_errors
    print("PASS installed-mode help suppression and direct file play with storage unavailable", flush=True)


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.connect_over_cdp("http://127.0.0.1:9222")
        try:
            check(browser)
        finally:
            for page in PAGES:
                if not page.is_closed():
                    page.close()
