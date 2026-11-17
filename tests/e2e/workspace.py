import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import sync_playwright, expect
from mobile_drawer import verify_mobile_drawer
from dashboard import verify_dashboard

ROOT = Path(__file__).resolve().parents[2]


def login(page, base, password, heading=None):
    page.goto(base)
    expect(page).to_have_url(base + "/login")
    page.get_by_label("账号").fill("workspace-test")
    page.get_by_label("密码").fill(password)
    page.get_by_role("button", name="登录", exact=True).click()
    if heading:
        expect(page.get_by_role("heading", name=heading)).to_be_visible()
    else:
        expect(page.locator(".goal-empty-add")).to_be_visible()
    page.wait_for_load_state("networkidle")


def save(page, fields):
    dialog = page.get_by_role("dialog")
    for label, value in fields.items():
        dialog.get_by_label(label, exact=True).fill(value)
    dialog.get_by_role("button", name="保存", exact=True).click()
    expect(dialog).to_be_hidden()


def verify_mobile_login(playwright, base, password):
    browser = playwright.webkit.launch()
    try:
        context = browser.new_context(**playwright.devices["iPhone 13"])
        page = context.new_page()
        delayed = []
        page.route("**/_app/immutable/entry/start.*.js", lambda route: delayed.append(route), times=1)
        page.goto(base, wait_until="domcontentloaded")
        expect(page).to_have_url(base + "/login")
        username = page.get_by_label("账号")
        password_field = page.get_by_label("密码")
        username.fill("workspace-test")
        password_field.fill("incorrect-password")

        # Keep hydration behind the first edits so the regression does not depend on browser speed.
        assert delayed, "Login client entry was not intercepted"
        delayed[0].continue_()
        page.wait_for_load_state("networkidle")
        expect(username).to_have_value("workspace-test")
        expect(password_field).to_have_value("incorrect-password")

        submit = page.get_by_role("button", name="登录", exact=True)
        submit.tap()
        expect(page.get_by_role("alert")).to_have_text("账号或密码错误")
        expect(username).to_have_value("workspace-test")
        password_field.fill(password)
        with page.expect_request(lambda request: request.method == "POST" and request.url == base + "/login"):
            submit.tap()
        expect(page).to_have_url(base + "/")
        expect(page.locator(".goal-empty-add")).to_be_visible()
        page.wait_for_load_state("networkidle")
        verify_mobile_drawer(page)
    finally:
        browser.close()


def run_browser(base, password, import_demo=False):
    with sync_playwright() as playwright:
        if not import_demo:
            verify_mobile_login(playwright, base, password)
        browser_options = {}
        if os.environ.get("BUXU_CHROMIUM"):
            browser_options["executable_path"] = os.environ["BUXU_CHROMIUM"]
        browser = playwright.chromium.launch(**browser_options)
        desktop = browser.new_context(viewport={"width": 1440, "height": 940})
        mobile = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        page = desktop.new_page()
        phone = mobile.new_page()
        page.set_default_timeout(8000)
        phone.set_default_timeout(8000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        phone.on("pageerror", lambda error: errors.append(str(error)))
        login(page, base, password)
        login(phone, base, password)

        if not import_demo:
            verify_mobile_drawer(phone)
            verify_dashboard(page, phone, base)

        if import_demo:
            first_payload = None
            for demo_file in ["index.html", "步序-Demo.html"]:
                sample = desktop.new_page()
                sample.on("dialog", lambda dialog: dialog.accept())
                sample.goto((ROOT / "demo" / demo_file).as_uri())
                with sample.expect_download() as transfer:
                    sample.get_by_role("button", name="导出 Demo 数据").click()
                export = transfer.value.path()
                payload = export.read_text(encoding="utf-8")
                assert '"buxu-demo"' in payload and '"apiKey"' not in payload and '"baseUrl"' not in payload
                if first_payload is None:
                    first_payload = payload
                page.goto(base + "/settings")
                page.get_by_label("导入 Demo 数据").set_input_files({
                    "name": "buxu-demo.json", "mimeType": "application/json", "buffer": first_payload.encode("utf-8")
                })
                if demo_file == "index.html":
                    page.get_by_role("button", name="确认导入").click()
                    expect(page.get_by_role("status").filter(has_text="Demo 数据已导入")).to_be_visible()
                    snapshot = page.request.get(base + "/api/v1/data/export").json()
                    assert len(snapshot["data"]["goals"]) == 3 and len(snapshot["data"]["tasks"]) == 13
                    assert not ({"sessions", "users", "apiKey"} & snapshot.keys())
                else:
                    expect(page.get_by_text("此文件已导入", exact=True)).to_be_visible()
                sample.close()
            browser.close()
            return

        settings_url = base + "/api/v1/ai/settings"
        anonymous = playwright.request.new_context()
        assert anonymous.get(settings_url).status == 401
        anonymous.dispose()
        phone.get_by_role("button", name="AI 助手").click()
        phone.get_by_role("dialog", name="AI 助手").get_by_role("link", name="AI 设置").click()
        expect(phone).to_have_url(base + "/settings#ai-settings")
        expect(phone.get_by_role("dialog", name="AI 助手")).to_be_hidden()
        model = phone.get_by_role("region", name="AI 设置")
        legacy = model.get_by_role("listitem").filter(has_text="legacy-model")
        expect(legacy.get_by_text("当前模型")).to_be_visible()
        legacy.get_by_role("button", name="编辑").click()
        expect(model.get_by_label("API Key")).to_have_value("")
        model.get_by_role("button", name="测试连接").click()
        expect(model.get_by_role("status")).to_have_text("连接成功")
        model.get_by_role("button", name="取消").click()
        initial_version = phone.request.get(settings_url).json()["data"]["version"]
        model.get_by_role("button", name="添加模型").click()
        expect(model.get_by_label("模型名称")).to_have_value("deepseek-flash")
        model.get_by_label("模型服务").select_option("openai-compatible")
        model.get_by_label("接口地址").fill("https://127.0.0.1/v1")
        model.get_by_label("模型名称").fill("compatible-model")
        model.get_by_label("API Key").fill("local-compatible-fixture")
        model.get_by_role("button", name="测试连接").click()
        expect(model.get_by_role("alert")).to_have_text("请输入供应商的公网 HTTPS 接口地址")
        model.get_by_label("接口地址").fill("https://provider.example.com/v1")
        model.get_by_label("API Key").fill("wrong-test-key")
        model.get_by_role("button", name="测试连接").click()
        expect(model.get_by_role("alert")).to_have_text("模型鉴权失败")
        model.get_by_label("API Key").fill("local-compatible-fixture")
        model.get_by_label("显示名称（可选）").fill("兼容模型")
        model.get_by_role("button", name="测试连接").click()
        expect(model.get_by_role("status")).to_have_text("连接成功")
        assert phone.request.get(settings_url).json()["data"]["version"] == initial_version
        model.get_by_role("button", name="保存 AI 配置").click()
        expect(model.get_by_role("status")).to_have_text("AI 配置已保存")
        phone.reload()
        compatible = model.get_by_role("listitem").filter(has_text="compatible-model")
        compatible.get_by_role("button", name="编辑").click()
        expect(model.get_by_label("接口地址")).to_have_value("https://provider.example.com/v1")
        expect(model.get_by_label("API Key")).to_have_value("")
        assert phone.evaluate("document.documentElement.scrollWidth === window.innerWidth")
        model.get_by_label("接口地址").fill("https://other.example.com/v1")
        assert model.get_by_label("API Key").get_attribute("required") is not None
        current = phone.request.get(settings_url).json()["data"]
        compatible_ref = next(entry["ref"] for entry in current["models"] if entry["id"] == "compatible-model")
        invalid = phone.request.post(settings_url + "/test", headers={"Origin": base}, data={
            "ref": compatible_ref, "version": current["version"], "provider": "openai-compatible", "id": "compatible-model",
            "baseUrl": "https://other.example.com/v1", "apiKey": "",
        })
        assert invalid.status == 422 and invalid.json()["error"]["code"] == "AI_KEY_REQUIRED"
        model.get_by_label("接口地址").fill("https://provider.example.com/v1")
        model.get_by_role("button", name="测试连接").click()
        expect(model.get_by_role("status")).to_have_text("连接成功")
        model.get_by_role("button", name="保存 AI 配置").click()
        expect(model.get_by_role("status")).to_have_text("AI 配置已保存")
        model.get_by_role("button", name="添加模型").click()
        model.get_by_label("模型名称").fill("saved-model")
        model.get_by_label("API Key").fill("local-saved-fixture")
        model.get_by_role("button", name="保存 AI 配置").click()
        expect(model.get_by_role("status")).to_have_text("AI 配置已保存")
        compatible.get_by_role("button", name="设为当前").click()
        expect(compatible.get_by_text("当前模型")).to_be_visible()
        settings = phone.request.get(settings_url).json()["data"]
        refs = {entry["id"]: entry["ref"] for entry in settings["models"]}
        assert settings["activeRef"] == refs["compatible-model"]
        stale = phone.request.patch(settings_url + "/active", headers={"Origin": base}, data={
            "ref": refs["saved-model"], "version": settings["version"] - 1,
        })
        assert stale.status == 409 and stale.json()["error"]["code"] == "VERSION_CONFLICT"
        for endpoint in (settings_url, base + "/api/v1/data/export"):
            payload = phone.request.get(endpoint).text()
            assert all(secret not in payload for secret in ("local-saved-fixture", "local-compatible-fixture", "local-test-only", '"credential"'))
        assert "local-compatible-fixture" not in phone.content()
        page.get_by_role("button", name="AI 助手").click()
        panel = page.get_by_role("complementary", name="AI 助手")
        picker = panel.get_by_role("combobox", name="当前模型")
        expect(picker).to_have_value(refs["compatible-model"], timeout=22_000)
        panel.get_by_role("textbox", name="消息").fill("检查模型切换")
        panel.get_by_role("button", name="发送").click()
        expect(panel.get_by_text("兼容模型连接正常。", exact=True)).to_be_visible()
        expect(picker).to_be_enabled()
        chat = next(chat for chat in page.request.get(base + "/api/v1/conversations").json()["data"]["items"] if chat["title"] == "检查模型切换")
        assert page.request.delete(base + "/api/v1/conversations/" + chat["id"],
            headers={"Origin": base, "Idempotency-Key": str(uuid.uuid4())}, data={"version": chat["version"]}).ok
        panel.get_by_role("button", name="新建会话").click()
        picker.select_option(refs["saved-model"])
        expect(picker).to_be_enabled()
        assert phone.request.get(settings_url).json()["data"]["activeRef"] == refs["saved-model"]
        phone.reload()
        compatible.get_by_role("button", name="删除").click()
        model.get_by_role("button", name="确认删除").click()
        expect(compatible).to_have_count(0)
        expect(legacy).to_be_visible()
        panel.get_by_role("button", name="关闭 AI 助手").click()
        phone.goto(base)

        page.goto(base)
        page.wait_for_load_state("networkidle")
        page.get_by_role("button", name="新建目标").click()
        save(page, {"目标名称": "练习英语"})
        goal_card = page.locator(".goal-board-card", has_text="练习英语")
        expect(goal_card).to_be_visible()
        goal_id = goal_card.get_attribute("id").removeprefix("goal-")
        goal_card.get_by_role("button", name="新建任务").click()
        save(page, {"任务名称": "录音练习"})
        task = goal_card.get_by_role("checkbox", name="录音练习")
        task.check()
        expect(task).to_be_checked()
        task.uncheck()
        expect(task).not_to_be_checked()
        expect(phone.locator(".goal-board-card", has_text="练习英语")).to_be_visible(timeout=22_000)
        assert phone.evaluate("document.documentElement.scrollWidth === window.innerWidth")

        page.get_by_role("button", name="编辑目标").click()
        dialog = page.get_by_role("dialog")
        edit_title = dialog.get_by_label("目标名称", exact=True)
        expect(edit_title).to_have_value("练习英语")
        expect(dialog.get_by_role("checkbox", name="录音练习")).to_be_visible()
        dialog.get_by_role("button", name="取消", exact=True).click()
        expect(dialog).to_be_hidden()

        page.locator(".notes-card").get_by_role("button", name="新建思考").click()
        save(page, {"正文": "从三分钟的练习开始"})
        note_card = page.locator(".note-card", has_text="从三分钟的练习开始")
        expect(note_card).to_be_visible()
        note_id = note_card.get_attribute("id").removeprefix("note-")
        phone.goto(base)
        phone.wait_for_load_state("networkidle")
        phone.locator(".note-card", has_text="从三分钟的练习开始").get_by_role("button", name="编辑思考").click()
        phone.get_by_label("正文", exact=True).fill("手机保留的草稿")
        note_card.get_by_role("button", name="编辑思考").click()
        save(page, {"正文": "桌面先保存的版本"})
        phone.get_by_role("dialog").get_by_role("button", name="保存", exact=True).click()
        expect(phone.get_by_role("dialog").get_by_text("记录已在其他位置更新", exact=False)).to_be_visible()
        expect(phone.get_by_label("正文", exact=True)).to_have_value("手机保留的草稿")
        phone.get_by_role("button", name="保留草稿并采用最新版本").click()
        save(phone, {})
        expect(phone.locator(".note-card", has_text="手机保留的草稿")).to_be_visible()

        page.goto(base)
        page.wait_for_load_state("networkidle")
        page.get_by_role("button", name="收支记录").click()
        ledger = page.get_by_role("dialog", name="收支记录")
        expect(ledger.get_by_text("这个月暂无收支记录")).to_be_visible()
        ledger.get_by_role("button", name="记一笔").click()
        editor = page.get_by_role("dialog", name="记一笔")
        for label, value in {"金额（元）": "38.50", "日期": "2026-10-28", "备注（选填）": "午饭"}.items():
            editor.get_by_label(label, exact=True).fill(value)
        editor.get_by_role("button", name="保存", exact=True).click()
        expect(editor).to_be_hidden()
        ledger.get_by_label("月份").fill("2026-10")
        expect(ledger.get_by_text("午饭", exact=True)).to_be_visible()
        expect(ledger.get_by_text("¥-38.50", exact=True)).to_be_visible()
        ledger.get_by_label("月份").fill("2026-11")
        expect(ledger.get_by_text("这个月暂无收支记录")).to_be_visible()
        ledger.get_by_role("button", name="关闭", exact=True).click()
        expect(ledger).to_be_hidden()
        page.get_by_role("button", name="填写存款").click()
        save(page, {"当前存款（元）": "0", "存款目标（元）": "100"})
        expect(page.get_by_text("¥0.00", exact=True).last).to_be_visible()

        phone.get_by_role("button", name="展开菜单").click()
        phone.get_by_role("navigation", name="移动端页面").get_by_role("link", name="设置").click()
        preferences_url = base + "/api/v1/preferences"
        original = phone.request.get(preferences_url).json()["data"]
        phone.get_by_label("账号时区").fill("UTC")
        phone.get_by_role("checkbox", name="目标管理", exact=True).check()
        phone.get_by_text("暗黑", exact=True).click()
        expect(phone.locator("html")).to_have_attribute("data-theme", "dark")
        expect(phone.locator("html")).to_have_css("color-scheme", "dark")
        phone.get_by_label("语言").select_option("en")
        expect(phone.get_by_role("heading", name="Settings", exact=True)).to_be_visible()
        expect(phone.locator("html")).to_have_attribute("lang", "en")
        expect(phone.get_by_label("Account time zone")).to_have_value("UTC")
        expect(phone.get_by_role("checkbox", name="Goals", exact=True)).to_be_checked()
        expect(phone.get_by_text("Data changed on another device. Your draft is preserved.")).to_be_hidden()

        prefs = phone.request.get(preferences_url).json()["data"]
        assert prefs["theme"] == "dark" and prefs["language"] == "en"
        assert prefs["timezone"] == original["timezone"]
        assert [prefs[key] for key in ["ai_goals", "ai_notes", "ai_finance"]] == [0, 0, 0]

        phone.route(preferences_url, lambda route: route.abort())
        phone.get_by_label("Language").select_option("zh-CN")
        expect(phone.get_by_role("alert")).to_have_text("Connection failed. Try again.")
        expect(phone.get_by_label("Language")).to_have_value("en")
        expect(phone.locator("html")).to_have_attribute("lang", "en")
        phone.unroute(preferences_url)

        phone.get_by_label("Language").select_option("zh-CN")
        expect(phone.get_by_role("heading", name="设置", exact=True)).to_be_visible()
        phone.get_by_label("语言").select_option("en")
        expect(phone.locator("html")).to_have_attribute("lang", "en")
        page.goto(base + "/settings")
        expect(page.get_by_role("heading", name="Settings", exact=True)).to_be_visible()
        expect(page.locator("html")).to_have_attribute("data-theme", "dark")
        page.emulate_media(color_scheme="dark")
        page.get_by_text("System", exact=True).click()
        expect(page.locator("html")).to_have_attribute("data-theme", "system")
        expect(page.locator("html")).to_have_css("color-scheme", "dark")
        page.get_by_text("Light", exact=True).click()
        expect(page.locator("html")).to_have_css("color-scheme", "light")
        page.get_by_text("Dark", exact=True).click()
        expect(page.locator("html")).to_have_attribute("data-theme", "dark")

        response = phone.reload()
        expect(phone.locator("html")).to_have_attribute("lang", "en")
        assert '<html lang="en" data-theme="dark">' in response.text()

        phone.get_by_role("button", name="AI assistant").click()
        regular_chat = phone.get_by_role("dialog", name="AI assistant")
        regular_chat.get_by_label("Message", exact=True).fill("普通流式对话")
        regular_chat.get_by_role("button", name="Send", exact=True).click()
        expect(regular_chat.get_by_text("收到，这是一条测试回复。", exact=True)).to_be_visible()
        expect(regular_chat.get_by_role("button", name="Send", exact=True)).to_be_visible()
        regular_chat.get_by_role("button", name="Close AI assistant").click()
        phone.goto(base + "/chats")
        phone.get_by_role("button", name="Delete chat").click()
        phone.get_by_role("dialog").get_by_role("button", name="Delete", exact=True).click()
        expect(phone.get_by_text("No chats yet")).to_be_visible()
        phone.goto(base + "/settings")
        phone.get_by_role("checkbox", name="Goals", exact=True).check()
        phone.get_by_role("button", name="Save", exact=True).click()
        expect(phone.get_by_role("status").filter(has_text="Saved")).to_be_visible()
        page.goto(base)
        page.wait_for_load_state("networkidle")
        goal_card = page.locator(".goal-board-card", has_text="练习英语")
        goal_card.get_by_role("button", name="Share with AI").click()
        panel = page.get_by_role("complementary", name="AI assistant")
        expect(panel.get_by_text("练习英语", exact=True)).to_be_visible()
        panel.get_by_label("Message", exact=True).fill("Please complete the recording task.")
        panel.get_by_role("button", name="Send", exact=True).click()
        expect(panel.get_by_text("Awaiting confirmation")).to_be_visible(timeout=10_000)
        history = page.request.get(base + "/api/v1/conversations").json()["data"]["items"]
        chat_id = history[0]["id"]
        items = page.request.get(base + f"/api/v1/conversations/{chat_id}/messages").json()["data"]["items"]
        proposal_id = next(item["proposalId"] for item in items if item["proposalId"])
        goal_task = goal_card.get_by_role("checkbox", name="录音练习")
        expect(goal_task).not_to_be_checked()
        panel.get_by_role("button", name="Apply change").click()
        expect(panel.get_by_text("Applied", exact=True)).to_be_visible()
        expect(goal_task).to_be_checked()
        result = mobile.request.post(base + f"/api/v1/ai/proposals/{proposal_id}/decision",
            headers={"Origin": base, "Idempotency-Key": str(uuid.uuid4())}, data={"decision": "approve"})
        assert result.ok and result.json()["data"]["status"] == "applied"
        saved_goal = page.request.get(base + "/api/v1/goals/" + goal_id).json()["data"]
        assert saved_goal["done_tasks"] == 1
        phone.goto(base + "/chats")
        phone.get_by_role("button", name="Please complete the recording task.", exact=False).click()
        fullscreen = phone.get_by_role("dialog", name="AI assistant")
        expect(fullscreen.get_by_text("Applied", exact=True)).to_be_visible()
        fullscreen.get_by_label("Message", exact=True).fill("A mobile draft")
        fullscreen.get_by_role("button", name="Close AI assistant").click()
        expect(fullscreen).to_be_hidden()
        phone.get_by_role("button", name="AI assistant").click()
        expect(fullscreen.get_by_label("Message", exact=True)).to_have_value("A mobile draft")
        fullscreen.get_by_role("button", name="Close AI assistant").click()
        phone.get_by_role("button", name="Delete chat").click()
        phone.get_by_role("dialog").get_by_role("button", name="Delete", exact=True).click()
        expect(phone.get_by_text("No chats yet")).to_be_visible()
        phone.get_by_role("button", name="AI assistant").click()
        expect(fullscreen.get_by_text("What would you like to discuss?")).to_be_visible()
        fullscreen.get_by_role("button", name="Close AI assistant").click()
        phone.goto(base + "/settings")

        body = {"title": "updated", "body": "http retry", "version": 3}
        headers = {"Origin": base, "Idempotency-Key": str(uuid.uuid4())}
        endpoint = base + "/api/v1/notes/" + note_id
        first = desktop.request.patch(endpoint, headers=headers, data=body)
        retry = desktop.request.patch(endpoint, headers=headers, data=body)
        assert first.ok and retry.json()["replayed"] is True
        rejected = desktop.request.patch(endpoint, headers={**headers, "Origin": "https://example.invalid"}, data=body)
        assert rejected.status == 403

        phone.get_by_role("button", name="Sign out").click()
        expect(phone).to_have_url(base + "/login")
        assert phone.request.get(base + "/api/v1/dashboard").status == 401
        assert desktop.request.get(base + "/api/v1/dashboard").ok
        if os.environ.get("BUXU_SCREENSHOTS"):
            output = Path(os.environ["BUXU_SCREENSHOTS"])
            output.mkdir(parents=True, exist_ok=True)
            page.goto(base)
            page.wait_for_load_state("networkidle")
            page.screenshot(path=output / "desktop.png", full_page=True)
            login(phone, base, password, heading="练习英语")
            phone.screenshot(path=output / "mobile.png", full_page=True)
        assert not errors, errors
        browser.close()


def main(import_demo=False):
    node = subprocess.check_output([shutil.which("node"), "-p", "process.execPath"], text=True).strip()
    with tempfile.TemporaryDirectory(prefix="buxu-e2e-") as temp:
        path = Path(temp)
        password = str(uuid.uuid4())
        password_file = path / "test-password"
        password_file.write_text(password, encoding="utf-8")
        model_file = path / "test-model-key"
        model_file.write_text("local-test-only", encoding="utf-8")
        with socket.socket() as server:
            server.bind(("127.0.0.1", 0))
            port = server.getsockname()[1]
        base = f"http://127.0.0.1:{port}"
        env = {**os.environ, "DATA_DIR": str(path / "data"), "HOST": "127.0.0.1", "PORT": str(port), "ORIGIN": base, "BODY_SIZE_LIMIT": "8M"}
        env.update({"AI_PROVIDER": "deepseek", "AI_MODEL": "deepseek-flash", "AI_API_KEY_FILE": str(model_file)})
        subprocess.run([node, "scripts/account.mjs", "init", "workspace-test", str(password_file)], cwd=ROOT, env=env, check=True)
        model_config = path / "data" / "ai-model.json"
        if not import_demo:
            model_config.write_text(json.dumps({
                "provider": "deepseek", "id": "legacy-model", "baseUrl": "https://api.deepseek.com",
                "apiKey": "local-test-only", "version": 2,
            }), encoding="utf-8")
        with (path / "server.log").open("w+", encoding="utf-8") as log:
            process = subprocess.Popen([node, "--import", "./tests/e2e/mock-provider.mjs", "build"], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
            try:
                for _ in range(100):
                    if process.poll() is not None:
                        raise RuntimeError("Server exited during startup")
                    try:
                        with urlopen(base + "/health/ready", timeout=1) as response:
                            if response.status == 200:
                                break
                    except OSError:
                        time.sleep(0.1)
                else:
                    raise RuntimeError("Server readiness timed out")
                run_browser(base, password, import_demo)
            except Exception:
                log.seek(0)
                print(log.read())
                raise
            finally:
                process.terminate()
                process.wait(timeout=10)
        if import_demo:
            print("Demo download, preview, import, deduplication and formal export passed.")
            return
        encrypted = model_config.read_text(encoding="utf-8")
        assert all(secret not in encrypted for secret in ("local-test-only", "local-saved-fixture", "local-compatible-fixture", '"apiKey"'))
        saved = json.loads(encrypted)
        assert saved["format"] == 2 and len(saved["models"]) == 2
        assert all(set(profile["credential"]) == {"nonce", "tag", "ciphertext"} for profile in saved["models"])
        assert (path / "data" / "ai-config.key").is_file()
        snapshot = path / "snapshot.sqlite"
        subprocess.run([node, "scripts/backup.mjs", str(snapshot)], cwd=ROOT, env=env, check=True)
        restore_dir = path / "restored"
        restore_dir.mkdir()
        shutil.copyfile(snapshot, restore_dir / "buxu.sqlite")
        subprocess.run([node, "--input-type=module", "-e", """
            import { openDatabase } from './src/lib/server/db/storage.mjs';
            const db = openDatabase();
            const note = db.prepare('SELECT body FROM notes').get();
            if (note?.body !== 'http retry') process.exit(1);
            db.close();
        """], cwd=ROOT, env={**env, "DATA_DIR": str(restore_dir)}, check=True)
    print("Desktop/mobile workspace, cross-device conflicts, mock AI approval and backup/restore passed.")


if __name__ == "__main__":
    main()
    main(import_demo=True)
