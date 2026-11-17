"""Mobile drawer DOM interactions; Chromium uses native browser touch input.

Playwright does not emulate Android's OS-level back gesture; that needs device QA.
"""
import os
import time
from pathlib import Path

from playwright.sync_api import expect


def verify_mobile_drawer(page):
    context = page.context
    chromium = context.browser.browser_type.name == "chromium"
    client = context.new_cdp_session(page) if chromium else None
    drawer = page.locator("#mobile-menu")
    trigger = page.get_by_role("button", name="展开菜单")
    initial_url = page.url

    def touch(kind, x, y, timestamp=None):
        if client:
            payload = {
                "type": kind,
                "touchPoints": [] if kind in ["touchEnd", "touchCancel"] else [{"x": x, "y": y, "id": 1}],
            }
            if timestamp is not None:
                payload["timestamp"] = timestamp
            client.send("Input.dispatchTouchEvent", payload)
        else:
            # WebKit's automation protocol does not expose continuous touch input.
            page.evaluate("""({kind, x, y, timestamp}) => {
                const name = kind.toLowerCase();
                if (name === 'touchstart') window.drawerTouchTarget = document.elementFromPoint(x, y);
                const target = window.drawerTouchTarget;
                const touch = {identifier: 1, target, clientX: x, clientY: y};
                const event = new Event(name, {bubbles: true, cancelable: true});
                Object.defineProperties(event, {
                    touches: {value: ['touchend', 'touchcancel'].includes(name) ? [] : [touch]},
                    changedTouches: {value: [touch]}
                });
                if (timestamp !== null) Object.defineProperty(event, 'timeStamp', {value: timestamp * 1000 - performance.timeOrigin});
                target.dispatchEvent(event);
                if (['touchend', 'touchcancel'].includes(name)) delete window.drawerTouchTarget;
            }""", {"kind": kind, "x": x, "y": y, "timestamp": timestamp})

    def swipe(start, end, steps=10, pause=20, hold=130, cancel=False, during=None, duration=None):
        # Set physical event times for flicks: automation round trips can exceed a frame.
        started = time.time() if duration is not None else None

        def timestamp(step):
            return started + duration * step / (steps + 1) / 1000 if started is not None else None

        touch("touchStart", *start, timestamp=timestamp(0))
        for step in range(1, steps + 1):
            x = start[0] + (end[0] - start[0]) * step / steps
            y = start[1] + (end[1] - start[1]) * step / steps
            touch("touchMove", x, y, timestamp=timestamp(step))
            page.wait_for_timeout(pause)
        if during:
            during()
        page.wait_for_timeout(hold)
        touch("touchCancel" if cancel else "touchEnd", *end, timestamp=timestamp(steps + 1))
        page.wait_for_timeout(360)

    def opened():
        expect(drawer).to_have_attribute("aria-hidden", "false")
        expect(drawer).to_be_visible()
        expect(page.locator(".workspace")).to_have_attribute("inert", "")
        expect(page.locator("body")).to_have_css("position", "fixed")

    def closed():
        expect(drawer).to_have_attribute("aria-hidden", "true")
        expect(drawer).to_be_hidden()
        expect(trigger).to_have_attribute("aria-expanded", "false")
        expect(page.locator("body")).not_to_have_css("position", "fixed")

    def following_finger():
        assert page.locator(".drawer-layer").evaluate("el => el.classList.contains('dragging')")
        left = drawer.evaluate("el => el.getBoundingClientRect().left")
        assert -250 < left < -20, left
        assert drawer.evaluate("el => getComputedStyle(el).transitionDuration") == "0s"

    def lose_touch_control():
        page.evaluate("""() => {
            const event = new Event('touchmove', {bubbles: true, cancelable: false});
            Object.defineProperty(event, 'touches', {value: [{identifier: 1}]});
            document.dispatchEvent(event);
        }""")

    def system_swipe(start, end):
        page.evaluate("""() => {
            window.drawerSystemMoves = [];
            window.drawerSystemObserver = event => window.drawerSystemMoves.push(event.defaultPrevented);
            window.addEventListener('touchmove', window.drawerSystemObserver, {passive: true});
        }""")
        initial_progress = page.locator(".drawer-layer").evaluate("el => el.style.getPropertyValue('--drawer-progress')")

        def untouched():
            assert not page.locator(".drawer-layer").evaluate("el => el.classList.contains('dragging')")
            assert page.locator(".drawer-layer").evaluate("el => el.style.getPropertyValue('--drawer-progress')") == initial_progress

        swipe(start, end, during=untouched)
        prevented = page.evaluate("""() => {
            window.removeEventListener('touchmove', window.drawerSystemObserver);
            const moves = window.drawerSystemMoves;
            delete window.drawerSystemObserver;
            delete window.drawerSystemMoves;
            return moves;
        }""")
        assert prevented and not any(prevented), prevented

    closed()
    trigger.tap()
    opened()
    expect(drawer.locator('[aria-current="page"]')).to_be_focused()
    drawer.locator(".brand").focus()
    page.keyboard.press("Shift+Tab")
    expect(drawer.get_by_role("link", name="设置")).to_be_focused()
    page.keyboard.press("Tab")
    expect(drawer.locator(".brand")).to_be_focused()
    page.keyboard.press("Escape")
    page.wait_for_timeout(360)
    closed()
    expect(trigger).to_be_focused()

    trigger.tap()
    opened()
    page.locator(".drawer-backdrop").tap(position={"x": page.viewport_size["width"] - 20, "y": 300})
    page.wait_for_timeout(360)
    closed()

    # Both screen edges belong to Android/iOS/browser navigation, even across the opening band.
    viewport_width = page.viewport_size["width"]
    system_swipe((18, 350), (230, 350))
    closed()
    system_swipe((viewport_width - 18, 350), (viewport_width - 230, 350))
    closed()
    system_swipe((80, page.viewport_size["height"] - 18), (230, page.viewport_size["height"] - 18))
    closed()

    # A short slow pull inside the page returns to closed; a long pull tracks the finger and opens.
    swipe((80, 350), (134, 350))
    closed()
    swipe((80, 350), (270, 350), during=following_finger)
    opened()
    assert page.url == initial_url
    system_swipe((18, 350), (230, 350))
    opened()
    system_swipe((viewport_width - 18, 350), (viewport_width - 230, 350))
    opened()
    assert page.locator(".drawer-backdrop").evaluate("el => getComputedStyle(el).touchAction") == "auto"
    swipe((230, 350), (180, 350), during=lose_touch_control)
    opened()

    # Swiping from a link must close without following that link.
    link = drawer.get_by_role("link", name="AI 对话历史").bounding_box()
    y = link["y"] + link["height"] / 2
    swipe((240, y), (28, y))
    closed()
    assert page.url == initial_url

    # Flicks can complete at short distance; canceled gestures return to their start.
    swipe((80, 350), (160, 350), steps=3, pause=5, hold=0, duration=64)
    opened()
    swipe((230, 350), (180, 350), cancel=True)
    opened()
    swipe((230, 350), (155, 350), steps=3, pause=5, hold=0, duration=64)
    closed()
    swipe((80, 350), (270, 350), cancel=True)
    closed()
    swipe((80, 350), (270, 350), during=lose_touch_control)
    closed()

    # Vertical scrolling and swipes in the middle of the page do not open navigation.
    swipe((80, 400), (82, 250))
    closed()
    swipe((130, 350), (310, 350))
    closed()

    page.locator("#main").evaluate("el => el.style.minHeight = '1800px'")
    page.evaluate("window.scrollTo(0, 450)")
    page.wait_for_timeout(80)
    scroll = page.evaluate("window.scrollY")
    trigger.tap()
    opened()
    drawer.get_by_role("button", name="关闭菜单").tap()
    page.wait_for_timeout(360)
    closed()
    assert abs(page.evaluate("window.scrollY") - scroll) < 2
    page.locator("#main").evaluate("el => el.style.minHeight = ''")
    page.evaluate("window.scrollTo(0, 0)")

    trigger.tap()
    opened()
    drawer.get_by_role("link", name="AI 对话历史").tap()
    expect(page).to_have_url(initial_url.rstrip("/") + "/chats")
    page.wait_for_timeout(360)
    closed()
    trigger.tap()
    opened()
    # Browser/system back still navigates normally and releases the drawer's scroll lock.
    page.go_back()
    expect(page).to_have_url(initial_url)
    page.wait_for_timeout(360)
    closed()
    trigger.tap()
    opened()
    page.set_viewport_size({"width": 1024, "height": 768})
    expect(drawer).to_be_hidden()
    expect(page.locator(".sidebar")).to_be_visible()
    expect(page.locator("body")).not_to_have_css("position", "fixed")
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(100)
    closed()

    page.emulate_media(reduced_motion="reduce")
    trigger.tap()
    opened()
    assert drawer.evaluate("el => getComputedStyle(el).transitionDuration") == "0s"
    if os.environ.get("BUXU_SCREENSHOTS"):
        output = Path(os.environ["BUXU_SCREENSHOTS"])
        output.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=output / f"drawer-{context.browser.browser_type.name}.png")
    drawer.get_by_role("button", name="关闭菜单").tap()
    page.emulate_media(reduced_motion="no-preference")
    page.goto(initial_url)
    page.wait_for_load_state("networkidle")
    if client:
        client.detach()
    print(f"Mobile drawer: {context.browser.browser_type.name} passed", flush=True)
