"""Dashboard directions, task updates, pointer sorting and browser persistence."""
import os
import uuid
from pathlib import Path

from playwright.sync_api import expect


def verify_dashboard(page, phone, base):
    def mutate(method, path, data):
        response = page.request.fetch(base + "/api/v1" + path, method=method, data=data,
            headers={"Origin": base, "Idempotency-Key": str(uuid.uuid4())})
        assert response.ok, response.text()
        return response.json()["data"]

    goals = [mutate("POST", "/goals", {"title": f"方向 {i}", "description": "", "tone": "violet"}) for i in range(1, 9)]
    item = mutate("POST", f'/goals/{goals[0]["id"]}/items', {"title": "每日练习"})
    mutate("POST", f'/items/{item["id"]}/tasks', {"title": "完成一次练习"})
    page.goto(base)
    page.wait_for_load_state("networkidle")
    topbar = page.locator(".topbar")
    expect(topbar.get_by_role("button")).to_have_count(2)
    expect(topbar.locator("a, time, .brand")).to_have_count(0)
    topbar.get_by_role("button", name="关闭菜单").click()
    expect(page.locator(".sidebar")).to_be_hidden()
    topbar.get_by_role("button", name="展开菜单").click()
    expect(page.locator(".sidebar")).to_be_visible()
    expect(page.locator(".hero")).to_have_count(0)
    expect(page.locator("#main").get_by_role("heading", name="目标管理")).to_have_count(0)
    expect(page.locator("#main").get_by_role("link", name="查看全部")).to_have_count(0)
    tabs = page.get_by_role("tab")
    expect(tabs).to_have_count(8)
    page.get_by_role("tab", name="方向 1", exact=True).click()
    expect(page.get_by_role("heading", name="每日练习")).to_be_visible()
    task = page.get_by_role("checkbox", name="完成一次练习")
    expect(task).to_be_visible()
    task.check()
    expect(page.locator(".goal-workspace-progress strong")).to_have_text("100%")
    expect(page.get_by_role("tab", name="方向 1", exact=True)).to_have_attribute("aria-selected", "true")
    expect(tabs).to_have_count(8)
    task.uncheck()
    expect(page.locator(".goal-workspace-progress strong")).to_have_text("0%")
    page.get_by_role("tab", name="方向 2", exact=True).click()
    expect(page.get_by_role("heading", name="方向 2", exact=True)).to_be_visible()
    expect(page.get_by_role("checkbox", name="完成一次练习")).to_have_count(0)

    before = tabs.all_text_contents()
    source = tabs.nth(0).locator("[data-sort-handle]").bounding_box()
    target = tabs.nth(2).bounding_box()
    page.mouse.move(source["x"] + source["width"] / 2, source["y"] + source["height"] / 2)
    page.mouse.down()
    page.mouse.move(target["x"] + target["width"] - 8, target["y"] + target["height"] / 2, steps=12)
    page.mouse.up()
    after = tabs.all_text_contents()
    assert after != before and after.index(before[0]) == 2, (before, after)
    page.reload()
    expect(tabs).to_have_count(8)
    assert tabs.all_text_contents() == after
    expect(page.get_by_role("tab", name="方向 2", exact=True)).to_have_attribute("aria-selected", "true")
    focused = tabs.nth(1)
    moved = focused.text_content()
    focused.focus()
    page.keyboard.press("Alt+ArrowLeft")
    expect(tabs.nth(0)).to_have_text(moved)
    page.keyboard.press("End")
    expect(tabs.nth(7)).to_be_focused()
    expect(tabs.nth(7)).to_have_attribute("aria-selected", "true")

    phone.goto(base)
    phone.wait_for_load_state("networkidle")
    mobile_tabs = phone.get_by_role("tab")
    expect(mobile_tabs).to_have_count(8)
    before = mobile_tabs.all_text_contents()
    source = mobile_tabs.nth(0).locator("[data-sort-handle]").bounding_box()
    target = mobile_tabs.nth(1).bounding_box()
    client = phone.context.new_cdp_session(phone)
    x = source["x"] + source["width"] / 2
    y = source["y"] + source["height"] / 2
    end = target["x"] + target["width"] - 8
    client.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    for step in range(1, 11):
        client.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + (end - x) * step / 10, "y": y}]})
        phone.wait_for_timeout(25)
    client.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    client.detach()
    after = mobile_tabs.all_text_contents()
    assert after[:2] == before[1::-1], (before, after)
    expect(phone.locator("#mobile-menu")).to_be_hidden()
    phone.reload()
    expect(mobile_tabs).to_have_count(8)
    assert mobile_tabs.all_text_contents() == after
    phone.get_by_role("tab", name="方向 1", exact=True).click()
    expect(phone.get_by_role("checkbox", name="完成一次练习")).to_be_visible()
    assert phone.evaluate("document.documentElement.scrollWidth === innerWidth")

    if os.environ.get("BUXU_SCREENSHOTS"):
        output = Path(os.environ["BUXU_SCREENSHOTS"])
        output.mkdir(parents=True, exist_ok=True)
        page.get_by_role("tab", name="方向 1", exact=True).click()
        expect(page.get_by_role("checkbox", name="完成一次练习")).to_be_visible()
        page.screenshot(path=output / "dashboard-desktop.png", full_page=True)
        phone.screenshot(path=output / "dashboard-mobile.png", full_page=True)

    for goal in goals:
        current = page.request.get(base + "/api/v1/goals/" + goal["id"]).json()["data"]
        mutate("DELETE", "/goals/" + goal["id"], {"version": current["version"], "items": current["items"], "tasks": current["total_tasks"]})
    page.goto(base)
    phone.goto(base)
    expect(page.get_by_text("还没有目标", exact=True)).to_be_visible()
    print("Dashboard: tabs, expanded tasks, desktop/touch sorting, keyboard order and persistence passed", flush=True)
