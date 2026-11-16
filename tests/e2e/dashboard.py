"""Simple dashboard goal card, module navigation and dedicated-page editing."""
import os
import re
import uuid
from pathlib import Path

from playwright.sync_api import expect


def verify_dashboard(page, phone, base):
    def mutate(method, path, data):
        response = page.request.fetch(base + "/api/v1" + path, method=method, data=data,
            headers={"Origin": base, "Idempotency-Key": str(uuid.uuid4())})
        assert response.ok, response.text()
        return response.json()["data"]

    def readonly(view):
        main = view.locator("#main")
        expect(main.locator("input, textarea, select, form, [data-sort-handle], .row-actions")).to_have_count(0)
        expect(main.get_by_role("button", name=re.compile("新建|编辑|删除|记一笔|更新存款|填写存款"))).to_have_count(0)
        expect(view.get_by_role("dialog")).to_have_count(0)
        card = main.locator(".dashboard-directions")
        expect(card).to_have_class(re.compile(r"\bcard\b"))
        expect(card.locator("a, progress, .task-toggle, .item-card.card")).to_have_count(0)
        expect(card.get_by_text(re.compile(r"已完成.*项任务|\d+%"))).to_have_count(0)

    goals = [mutate("POST", "/goals", {"title": f"方向 {i}", "description": "", "tone": "violet"}) for i in range(1, 9)]
    item = mutate("POST", f'/goals/{goals[0]["id"]}/items', {"title": "每日练习"})
    mutate("POST", f'/items/{item["id"]}/tasks', {"title": "完成一次练习"})
    note = mutate("POST", "/notes", {"title": "工作台测试思考", "body": "只读展示，进入详情后编辑"})
    goal_url = base + "/goals/" + goals[0]["id"]
    writes = []

    def observe(request):
        if "/api/v1/" in request.url and request.method not in ("GET", "HEAD"):
            writes.append(request.url)

    page.on("request", observe)
    phone.on("request", observe)
    page.goto(base)
    page.wait_for_load_state("networkidle")
    topbar = page.locator(".topbar")
    expect(topbar.get_by_role("button")).to_have_count(2)
    topbar.get_by_role("button", name="关闭菜单").click()
    expect(page.locator(".sidebar")).to_be_hidden()
    topbar.get_by_role("button", name="展开菜单").click()
    expect(page.locator(".sidebar")).to_be_visible()
    tabs = page.get_by_role("tab")
    expect(tabs).to_have_count(8)
    page.get_by_role("tab", name="方向 1", exact=True).click()
    expect(page.get_by_role("heading", name="每日练习")).to_be_visible()
    expect(page.locator(".task-summary")).to_have_text("完成一次练习")
    expect(page.locator(".task-status")).to_have_attribute("aria-label", "待完成")
    readonly(page)
    page.get_by_role("heading", name="每日练习").click()
    page.locator(".task-summary").click()
    expect(page).to_have_url(base + "/")
    expect(page.locator(".task-summary")).to_be_visible()
    page.get_by_role("tab", name="方向 2", exact=True).click()
    expect(page.get_by_role("heading", name="方向 2", exact=True)).to_be_visible()
    expect(page.get_by_text("还没有事项", exact=True)).to_be_visible()
    readonly(page)
    page.reload()
    expect(page.get_by_role("tab", name="方向 2", exact=True)).to_have_attribute("aria-selected", "true")
    selected = page.get_by_role("tab", name="方向 2", exact=True)
    selected.focus()
    page.keyboard.press("End")
    expect(tabs.nth(7)).to_be_focused()
    expect(tabs.nth(7)).to_have_attribute("aria-selected", "true")

    phone.goto(base)
    phone.wait_for_load_state("networkidle")
    expect(phone.get_by_role("tab")).to_have_count(8)
    phone.get_by_role("tab", name="方向 1", exact=True).tap()
    expect(phone.locator(".task-summary")).to_be_visible()
    readonly(phone)
    assert phone.evaluate("document.documentElement.scrollWidth === innerWidth")
    assert not writes, writes
    page.remove_listener("request", observe)
    phone.remove_listener("request", observe)

    # Goal editing remains available from the sidebar and dedicated pages.
    page.get_by_role("navigation", name="页面").get_by_role("link", name="目标管理", exact=True).click()
    expect(page).to_have_url(base + "/goals")
    expect(page.get_by_role("button", name="新建目标")).to_be_visible()
    page.goto(goal_url)
    expect(page).to_have_url(goal_url)
    expect(page.get_by_role("button", name="编辑", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="删除目标")).to_be_visible()
    expect(page.get_by_role("button", name="新建事项")).to_be_visible()
    page.get_by_role("button", name="展开任务").click()
    task = page.get_by_role("checkbox", name="完成一次练习")
    task.check()
    expect(task).to_be_checked()
    expect(page.get_by_text("目标进度 100%", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="编辑任务")).to_be_visible()
    expect(page.get_by_role("button", name="删除任务")).to_be_visible()
    expect(page.get_by_role("button", name="新建任务")).to_be_visible()

    page.goto(base)
    page.get_by_role("tab", name="方向 1", exact=True).click()
    expect(page.locator(".task-status")).to_have_attribute("aria-label", "已完成")
    readonly(page)
    page.locator(".task-summary").click()
    expect(page).to_have_url(base + "/")

    page.goto(base)
    page.get_by_role("link", name="财务详情").click()
    expect(page).to_have_url(base + "/finance")
    expect(page.get_by_role("button", name="记一笔")).to_be_visible()
    page.get_by_role("button", name="更新存款").click()
    expect(page.get_by_role("dialog")).to_be_visible()
    page.get_by_role("button", name="取消", exact=True).click()
    page.goto(base)
    page.locator("#main").get_by_role("link", name="全部记录", exact=True).click()
    expect(page).to_have_url(base + "/notes")
    expect(page.get_by_role("button", name="新建思考")).to_be_visible()
    page.goto(base)
    page.locator("#main").get_by_role("link", name=re.compile("工作台测试思考")).click()
    expect(page).to_have_url(base + "/notes/" + note["id"])
    expect(page.get_by_role("button", name="编辑", exact=True)).to_be_visible()
    phone.locator(".task-summary").tap()
    expect(phone).to_have_url(base + "/")
    readonly(phone)

    if os.environ.get("BUXU_SCREENSHOTS"):
        output = Path(os.environ["BUXU_SCREENSHOTS"])
        output.mkdir(parents=True, exist_ok=True)
        for view, name in [(page, "desktop"), (phone, "mobile")]:
            view.goto(base)
            expect(view.locator(".task-summary")).to_be_visible()
            view.screenshot(path=output / f"dashboard-{name}.png", full_page=True)

    mutate("DELETE", "/notes/" + note["id"], {"version": note["version"]})
    for goal in goals:
        current = page.request.get(base + "/api/v1/goals/" + goal["id"]).json()["data"]
        mutate("DELETE", "/goals/" + goal["id"], {"version": current["version"], "items": current["items"], "tasks": current["total_tasks"]})
    for view in (page, phone):
        view.goto(base)
        expect(view.get_by_text("还没有目标", exact=True)).to_be_visible()
        readonly(view)
        expect(view.locator("#main").get_by_role("link", name="目标管理")).to_have_count(0)
        expect(view.locator("#main").get_by_role("link", name="全部记录")).to_be_visible()
    print("Dashboard: simple goal card, static tasks, module links and dedicated-page editing passed", flush=True)
