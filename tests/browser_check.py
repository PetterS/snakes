# /// script
# requires-python = ">=3.11, <3.14"
# dependencies = ["playwright==1.63.0"]
# ///
"""Browser checks for the static file, native touch tools, and simultaneous pointers."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = (ROOT / "index.html").as_uri()
INSTRUMENT = """(() => {
  let engine;
  Object.defineProperty(window, 'DeepBelow', {
    configurable: true,
    get: () => engine,
    set: value => {
      const Original = value.Game;
      value.Game = class extends Original { constructor(seed, upgrades) { super(11223344, upgrades); window.testGame = this; } };
      engine = value;
    }
  });
})();"""


def check(browser, name):
    context = browser.new_context(viewport={"width": 1024, "height": 768},
                                  device_scale_factor=2, is_mobile=True, has_touch=True)
    context.add_init_script(INSTRUMENT)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL)
    page.locator("#start").tap()
    page.wait_for_function("testGame.state === 'playing'")
    # Native touchscreen taps: no mouse click fallback and no duplicate flare use.
    page.locator("#flare").tap()
    page.wait_for_function("testGame.player.flares === 2")
    page.wait_for_timeout(250)
    assert page.evaluate("testGame.player.flares") == 2
    page.locator("#drill").tap()
    page.wait_for_function("testGame.player.drillCooldown > 0")
    page.wait_for_function("testGame.player.y >= 9 && testGame.player.drilling === 0")
    assert page.locator("#drill").is_disabled()

    # Real multi-touch through Chrome's input protocol: hold steering while tapping a tool.
    page.evaluate("testGame.snakes=[];for(const [k,v] of testGame.items)if(v.type!=='relic')testGame.items.delete(k);testGame.player.invincible=100")
    cdp = context.new_cdp_session(page)
    steering = {"x": 512, "y": 600, "id": 10, "radiusX": 8, "radiusY": 8}
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [steering]})
    page.wait_for_timeout(250)
    before_touch = page.evaluate("testGame.player.y")
    flare_count = page.evaluate("testGame.player.flares")
    r = page.locator("#flare").bounding_box()
    tool_touch = {"x": r["x"] + r["width"] / 2, "y": r["y"] + r["height"] / 2, "id": 11, "radiusX": 8, "radiusY": 8}
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [steering, tool_touch]})
    page.wait_for_function("testGame.player.flares === " + str(flare_count - 1))
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": [tool_touch]})
    page.wait_for_timeout(350)
    assert page.evaluate("testGame.player.y") > before_touch
    assert page.evaluate("testGame.player.flares") == flare_count - 1
    # Recharge for a second native tool press while the original steering finger stays down.
    page.evaluate("testGame.player.drillCooldown=0")
    page.wait_for_function("!document.querySelector('#drill').disabled")
    drill_before = page.evaluate("testGame.player.y")
    r = page.locator("#drill").bounding_box()
    tool_touch.update(x=r["x"] + r["width"] / 2, y=r["y"] + r["height"] / 2)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [steering, tool_touch]})
    page.wait_for_function("testGame.player.drillCooldown > 0")
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": [tool_touch]})
    page.wait_for_function("testGame.player.y >= " + str(drill_before + 6) + " && testGame.player.drilling === 0")
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    stopped_touch = page.evaluate("testGame.player.y")
    page.wait_for_timeout(250)
    assert page.evaluate("testGame.player.y") == stopped_touch

    # Pointer ownership and cancellation also cover interruptions from OS gestures.
    page.evaluate("""() => {
      const g=testGame;g.snakes=[];g.player.invincible=100;g.player.flares=3;
      const c=document.querySelector('#game'),r=c.getBoundingClientRect();
      c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:41,pointerType:'touch',clientX:r.width/2,clientY:r.height*.78,bubbles:true,cancelable:true}));
    }""")
    page.wait_for_timeout(350)
    before = page.evaluate("testGame.player.y")
    page.locator("#flare").tap()
    page.wait_for_timeout(450)
    after = page.evaluate("testGame.player.y")
    assert after > before, (name, "tool finger stopped steering", before, after)
    assert page.evaluate("testGame.player.flares") == 2
    # A second canvas finger cannot steal steering or stop it when lifted.
    page.evaluate("""() => {
      const c=document.querySelector('#game');
      c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:99,pointerType:'touch',clientX:10,clientY:10,bubbles:true,cancelable:true}));
      c.dispatchEvent(new PointerEvent('pointerup',{pointerId:99,pointerType:'touch',bubbles:true}));
    }""")
    page.wait_for_timeout(350)
    assert page.evaluate("testGame.player.y") > after
    page.evaluate("document.querySelector('#game').dispatchEvent(new PointerEvent('pointercancel',{pointerId:41,pointerType:'touch',bubbles:true}))")
    stopped = page.evaluate("testGame.player.y")
    page.wait_for_timeout(300)
    assert page.evaluate("testGame.player.y") == stopped

    # Native pause/resume, orientation change, and large touch targets.
    page.locator("#pause").tap()
    assert page.evaluate("testGame.state") == "paused"
    page.locator("#resume").tap()
    for w, h in [(1024, 768), (768, 1024), (390, 844)]:
        page.set_viewport_size({"width": w, "height": h})
        page.wait_for_timeout(150)
        geometry = page.evaluate("""() => {
          const c=document.querySelector('#game').getBoundingClientRect();
          return {canvas:[c.width,c.height], viewport:[innerWidth,innerHeight],
            overflow:document.documentElement.scrollWidth>innerWidth || document.documentElement.scrollHeight>innerHeight,
            tools:['#drill','#flare'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {w:r.width,h:r.height,x:r.x,y:r.y};})};
        }""")
        assert geometry["canvas"] == geometry["viewport"]
        assert not geometry["overflow"]
        for r in geometry["tools"]:
            assert r["w"] >= 44 and r["h"] >= 44
            assert r["x"] >= 0 and r["x"] + r["w"] <= w
            assert r["y"] >= 0 and r["y"] + r["h"] <= h
        page.screenshot(path=f"/tmp/deep-below-{name}-{w}x{h}.png")

    # Exercise the relic UI, perk choices, end screen and permanent upgrades.
    page.set_viewport_size({"width": 1024, "height": 768})
    for i in range(3):
        page.evaluate("""i => {
          const g=testGame,r=g.relics[i];Object.assign(g.player,{x:r.x,y:r.y,oldX:r.x,oldY:r.y});
          g.reveal(10);g.collect(g.items.get(DeepBelow.key(r.x,r.y)));
        }""", i)
        page.locator("[data-perk]").first.wait_for()
        page.locator("[data-perk]").first.tap()
        page.wait_for_function("testGame.state === 'playing'")
    page.screenshot(path=f"/tmp/deep-below-{name}-ember.png")
    page.evaluate("testGame.player.y=3;testGame.finish(true)")
    page.locator("#again").wait_for()
    assert "Du tog ljuset med dig hem" in page.locator("#panel").inner_text()
    assert page.evaluate("testGame.result.complete")
    page.locator('[data-upgrade="pick"]').tap()
    page.locator("#again").tap()
    page.wait_for_function("testGame.state === 'playing'")
    assert page.evaluate("testGame.upgrades.pick") == 1
    assert not errors, errors
    context.close()
    print(f"PASS {name}: native touch tools, multi-pointer steering, cancellation, pause, responsive layouts, relics, victory, upgrades; no page errors")


with sync_playwright() as p:
    # Reuse the browser launched by the user's browser skill. Only our test context closes.
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    check(browser, "chrome")
