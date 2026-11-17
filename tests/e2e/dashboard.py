"""Dashboard goal cards, horizontal rail scrolling, module navigation and dedicated-page editing."""
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
        expect(main.locator(".goal-board, .dashboard-goals")).to_have_count(1)
        expect(main.locator("progress, .goal-card-percent")).to_have_count(0)
        expect(main.locator(".task-summary, .task-toggle, .item-card.card")).to_have_count(0)

    goals = [mutate("POST", "/goals", {"title": f"方向 {i}", "description": "", "tone": "violet"}) for i in range(1, 9)]
    mutate("POST", f'/goals/{goals[0]["id"]}/tasks', {"title": "完成一次练习"})
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
    cards = page.locator(".goal-board-card")
    expect(cards).to_have_count(8)
    expect(page.get_by_role("tab")).to_have_count(0)
    readonly(page)
    # Two cards per view on desktop, with the third one peeking on the right.
    board = page.locator(".goal-board").bounding_box()
    assert abs(page.locator(".goal-board-card").first.bounding_box()["x"] - board["x"]) < 1
    third = page.locator(".goal-board-card").nth(2).bounding_box()
    assert abs((board["x"] + board["width"]) - third["x"] - 36) < 1
    first = page.locator(".goal-board-card", has_text="方向 1")
    expect(first.locator(".check-row")).to_have_text("完成一次练习")
    expect(first.locator(".check-row")).not_to_have_class(re.compile(r"\bdone\b"))
    first.locator(".goal-board-title").click()
    expect(page).to_have_url(base + "/")
    first.locator(".goal-board-go").click()
    expect(page).to_have_url(goal_url)
    expect(page.get_by_role("heading", name="方向 1", exact=True)).to_be_visible()
    expect(page.get_by_text("完成一次练习", exact=True)).to_be_visible()

    page.goto(base)
    page.wait_for_load_state("networkidle")
    expect(page).to_have_url(base + "/")
    readonly(page)

    page.locator(".goal-board-card", has_text="方向 2").locator(".goal-board-go").click()
    expect(page).to_have_url(base + "/goals/" + goals[1]["id"])
    expect(page.get_by_role("heading", name="方向 2", exact=True)).to_be_visible()
    expect(page.get_by_text("暂无任务", exact=True)).to_be_visible()

    phone.goto(base)
    phone.wait_for_load_state("networkidle")
    expect(phone.locator(".goal-board-card")).to_have_count(8)
    expect(phone.get_by_role("tab")).to_have_count(0)
    readonly(phone)
    # The rail bleeds to the screen edges: the card keeps the same left/right edges as the cards
    # below, while the neighbours show as a 7px sliver clipped by the screen, not by the content box.
    assert phone.evaluate("getComputedStyle(document.querySelector('.goal-board')).columnGap") == "7px"
    card = phone.locator(".goal-board-card").first.bounding_box()
    finance = phone.locator(".finance-card").bounding_box()
    assert abs(card["x"] - finance["x"]) < 1
    assert abs((card["x"] + card["width"]) - (finance["x"] + finance["width"])) < 1
    second = phone.locator(".goal-board-card").nth(1).bounding_box()
    assert abs(phone.evaluate("innerWidth") - second["x"] - 7) < 1
    phone.evaluate("""() => {
      const rail = document.querySelector('.goal-board')
      const cards = rail.querySelectorAll('.goal-board-card')
      rail.scrollTo({ left: cards[1].offsetLeft - cards[0].offsetLeft, behavior: 'instant' })
    }""")
    phone.wait_for_timeout(400)
    assert abs(phone.locator(".goal-board-card").nth(1).bounding_box()["x"] - card["x"]) < 1
    assert abs(phone.locator(".goal-board-card").first.bounding_box()["x"] + card["width"] - 7) < 1
    phone.evaluate("document.querySelector('.goal-board').scrollTo({ left: 0, behavior: 'instant' })")
    phone.wait_for_timeout(300)
    phone.locator(".goal-board-card", has_text="方向 1").locator(".goal-board-title").tap()
    expect(phone).to_have_url(base + "/")
    phone.locator(".goal-board-card", has_text="方向 1").locator(".goal-board-go").tap()
    expect(phone).to_have_url(goal_url)
    phone.goto(base)
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
    expect(page.get_by_role("button", name="新建任务")).to_be_visible()
    task = page.get_by_role("checkbox", name="完成一次练习")
    task.check()
    expect(task).to_be_checked()
    expect(page.get_by_role("button", name="编辑任务")).to_be_visible()
    expect(page.get_by_role("button", name="删除任务")).to_be_visible()
    expect(page.get_by_role("button", name="新建任务")).to_be_visible()

    page.goto(base)
    page.wait_for_load_state("networkidle")
    expect(page.locator(".goal-board-card", has_text="方向 1").locator(".check-row")).to_have_class(re.compile(r"\bdone\b"))
    readonly(page)

    page.get_by_role("navigation", name="页面").get_by_role("link", name="财务概览", exact=True).click()
    expect(page).to_have_url(base + "/finance")
    expect(page.get_by_role("button", name="记一笔")).to_be_visible()
    page.get_by_role("button", name="更新存款").click()
    expect(page.get_by_role("dialog")).to_be_visible()
    page.get_by_role("button", name="取消", exact=True).click()
    page.get_by_role("navigation", name="页面").get_by_role("link", name="思考记录", exact=True).click()
    expect(page).to_have_url(base + "/notes")
    expect(page.get_by_role("button", name="新建思考")).to_be_visible()
    page.goto(base)
    page.wait_for_load_state("networkidle")
    page.locator("#main").get_by_role("link", name=re.compile("工作台测试思考")).click()
    expect(page).to_have_url(base + "/notes/" + note["id"])
    expect(page.get_by_role("button", name="编辑", exact=True)).to_be_visible()
    phone.goto(base)
    phone.wait_for_load_state("networkidle")
    phone.locator(".goal-board-card", has_text="方向 1").locator(".goal-board-go").tap()
    expect(phone).to_have_url(goal_url)
    phone.goto(base)
    readonly(phone)

    if os.environ.get("BUXU_SCREENSHOTS"):
        output = Path(os.environ["BUXU_SCREENSHOTS"])
        output.mkdir(parents=True, exist_ok=True)
        for view, name in [(page, "desktop"), (phone, "mobile")]:
            view.goto(base)
            expect(view.locator(".goal-board-card").first).to_be_visible()
            view.screenshot(path=output / f"dashboard-{name}.png", full_page=True)

    mutate("DELETE", "/notes/" + note["id"], {"version": note["version"]})
    for goal in goals:
        current = page.request.get(base + "/api/v1/goals/" + goal["id"]).json()["data"]
        mutate("DELETE", "/goals/" + goal["id"], {"version": current["version"], "tasks": current["total_tasks"]})
    for view in (page, phone):
        view.goto(base)
        expect(view.get_by_text("还没有目标", exact=True)).to_be_visible()
        readonly(view)
    print("Dashboard: goal rail cards, read-only summary and dedicated-page editing passed", flush=True)
