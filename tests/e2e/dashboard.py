"""Dashboard goal rail, inline goal/note editing and the empty-state entry points."""
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

    def save(view, fields):
        dialog = view.get_by_role("dialog")
        for label, value in fields.items():
            dialog.get_by_label(label, exact=True).fill(value)
        dialog.get_by_role("button", name="保存", exact=True).click()
        expect(dialog).to_be_hidden()

    def delete_goal(goal_id):
        current = page.request.get(base + "/api/v1/goals/" + goal_id).json()["data"]
        mutate("DELETE", "/goals/" + goal_id, {"version": current["version"], "tasks": current["total_tasks"]})

    # The empty dashboard offers a single icon-only entry point.
    page.goto(base)
    page.wait_for_load_state("networkidle")
    expect(page.locator(".goal-empty-add")).to_be_visible()
    expect(page.locator(".goal-empty")).to_have_text("")
    expect(page.get_by_role("navigation", name="页面").get_by_role("link")).to_have_count(4)

    goals = [mutate("POST", "/goals", {"title": f"方向 {i}", "description": "", "tone": "violet"}) for i in range(1, 9)]
    mutate("POST", f'/goals/{goals[0]["id"]}/tasks', {"title": "完成一次练习"})
    mutate("POST", "/notes", {"title": "工作台测试思考", "body": "工作台直接编辑这条记录"})

    page.goto(base)
    page.wait_for_load_state("networkidle")
    cards = page.locator(".goal-board-card")
    expect(cards).to_have_count(8)
    expect(page.locator(".goal-add-card")).to_have_count(1)

    # Two cards per view on desktop, with the third one peeking on the right.
    board = page.locator(".goal-board").bounding_box()
    assert abs(cards.first.bounding_box()["x"] - board["x"]) < 1
    third = cards.nth(2).bounding_box()
    assert abs((board["x"] + board["width"]) - third["x"] - 36) < 1

    # Checking a task is a local visual toggle: no request leaves the page.
    first = page.locator(".goal-board-card", has_text="方向 1")
    row = first.locator(".check-row")
    expect(row).to_have_text("完成一次练习")
    checkbox = first.get_by_role("checkbox")
    expect(checkbox).not_to_be_checked()
    writes = []

    def observe(request):
        if "/api/v1/" in request.url and request.method not in ("GET", "HEAD"):
            writes.append(request.url)

    page.on("request", observe)
    checkbox.check()
    expect(checkbox).to_be_checked()
    expect(row.locator("label")).to_have_class(re.compile(r"\bdone\b"))
    checkbox.uncheck()
    expect(checkbox).not_to_be_checked()
    expect(row.locator("label")).not_to_have_class(re.compile(r"\bdone\b"))
    page.wait_for_timeout(300)
    page.remove_listener("request", observe)
    assert not writes, writes

    # The goal editor renames the goal, deletes selected tasks and deletes the goal itself.
    second = page.locator(".goal-board-card", has_text="方向 2")
    second.get_by_role("button", name="编辑目标").click()
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_label("目标名称", exact=True)).to_have_value("方向 2")
    expect(dialog.get_by_text("暂无任务", exact=True)).to_be_visible()
    dialog.get_by_role("button", name="取消", exact=True).click()
    expect(dialog).to_be_hidden()

    for title in ("任务 A", "任务 B"):
        mutate("POST", f'/goals/{goals[1]["id"]}/tasks', {"title": title})
    page.reload()
    page.wait_for_load_state("networkidle")
    second = page.locator(".goal-board-card", has_text="方向 2")
    second.get_by_role("button", name="编辑目标").click()
    expect(dialog.get_by_label("目标名称", exact=True)).to_be_visible()
    dialog.get_by_label("目标名称", exact=True).fill("方向二")
    picker = dialog.locator(".task-picker-row")
    expect(picker).to_have_count(2)
    picker.first.click()
    expect(dialog.locator(".task-picker-count")).to_have_text("1")
    dialog.get_by_role("button", name="删除所选任务").click()
    expect(dialog.locator(".delete-copy")).to_contain_text("删除选中的 1 个任务")
    dialog.get_by_role("button", name="确认删除").click()
    expect(picker).to_have_count(1)
    dialog.get_by_role("button", name="保存", exact=True).click()
    expect(dialog).to_be_hidden()
    renamed = page.locator(".goal-board-card", has_text="方向二")
    expect(renamed).to_be_visible()
    expect(renamed.locator(".check-row")).to_have_text("任务 B")

    renamed.get_by_role("button", name="编辑目标").click()
    dialog.get_by_role("button", name="删除目标").click()
    expect(dialog.locator(".delete-copy")).to_contain_text("方向二")
    dialog.get_by_role("button", name="确认删除").click()
    expect(dialog).to_be_hidden()
    expect(page.locator(".goal-board-card", has_text="方向二")).to_have_count(0)

    # Notes: create, edit and delete straight from the dashboard card.
    notes = page.locator(".notes-card")
    notes.get_by_role("button", name="新建思考").click()
    save(page, {"正文": "新建的思考"})
    expect(page.locator(".note-card", has_text="新建的思考")).to_be_visible()
    edited = page.locator(".note-card", has_text="工作台测试思考")
    edited.get_by_role("button", name="编辑思考").click()
    dialog.get_by_label("正文", exact=True).fill("工作台改过的正文")
    dialog.get_by_role("button", name="保存", exact=True).click()
    expect(dialog).to_be_hidden()
    expect(page.locator(".note-card", has_text="工作台改过的正文")).to_be_visible()
    page.locator(".note-card", has_text="新建的思考").get_by_role("button", name="删除思考").click()
    page.get_by_role("dialog").get_by_role("button", name="确认删除").click()
    expect(page.locator(".note-card")).to_have_count(1)

    # A single goal still exposes the trailing "new goal" card next to it.
    for goal in goals[2:]:
        delete_goal(goal["id"])
    page.reload()
    page.wait_for_load_state("networkidle")
    expect(page.locator(".goal-board-card")).to_have_count(1)
    only = page.locator(".goal-board-card").first.bounding_box()
    add_box = page.locator(".goal-add-card").bounding_box()
    assert add_box["x"] > only["x"] + only["width"]
    page.locator(".goal-add-card").click()
    save(page, {"目标名称": "滑出来的目标"})
    expect(page.locator(".goal-board-card", has_text="滑出来的目标")).to_be_visible()

    # Mobile keeps the rail bleeding to the screen edges with the add card one swipe away.
    phone.goto(base)
    phone.wait_for_load_state("networkidle")
    expect(phone.locator(".goal-board-card")).to_have_count(2)
    assert phone.evaluate("getComputedStyle(document.querySelector('.goal-board')).columnGap") == "7px"
    card = phone.locator(".goal-board-card").first.bounding_box()
    finance = phone.locator(".finance-card").bounding_box()
    assert abs(card["x"] - finance["x"]) < 1
    assert abs((card["x"] + card["width"]) - (finance["x"] + finance["width"])) < 1
    second = phone.locator(".goal-board-card").nth(1).bounding_box()
    assert abs(phone.evaluate("innerWidth") - second["x"] - 7) < 1
    phone.evaluate("""() => {
      const rail = document.querySelector('.goal-board')
      rail.scrollTo({ left: rail.scrollWidth, behavior: 'instant' })
    }""")
    phone.wait_for_timeout(400)
    assert abs(phone.locator(".goal-add-card").bounding_box()["x"] - card["x"]) < 1
    assert phone.evaluate("document.documentElement.scrollWidth === innerWidth")

    if os.environ.get("BUXU_SCREENSHOTS"):
        output = Path(os.environ["BUXU_SCREENSHOTS"])
        output.mkdir(parents=True, exist_ok=True)
        for view, name in [(page, "desktop"), (phone, "mobile")]:
            view.goto(base)
            expect(view.locator(".goal-board-card").first).to_be_visible()
            view.screenshot(path=output / f"dashboard-{name}.png", full_page=True)

    for goal in page.request.get(base + "/api/v1/goals").json()["data"]["items"]:
        delete_goal(goal["id"])
    for note in page.request.get(base + "/api/v1/notes").json()["data"]["items"]:
        mutate("DELETE", "/notes/" + note["id"], {"version": note["version"]})
    for view in (page, phone):
        view.goto(base)
        expect(view.locator(".goal-empty-add")).to_be_visible()
        expect(view.locator(".note-card")).to_have_count(0)
    print("Dashboard: goal rail, inline editing and note cards passed", flush=True)
