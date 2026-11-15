# 步序

步序是管理目标、记录思考和查看收支的个人工作台。正式版使用 SvelteKit 和 SQLite，同一账号在多个浏览器中共享数据。

## 本地运行

使用 Node.js 24.18.0 和 npm 11.16.0。准备一个工作区外的 UTF-8 密码文件，只写一行至少 12 个字符的密码。

```bash
npm ci
npm run account -- init <账号名> <密码文件路径>
npm run dev -- --host 127.0.0.1
```

打开终端显示的本地地址并登录。账号名接受英文字母、数字、下划线、点和短横线。数据库默认为 `data/buxu.sqlite`，可通过 `DATA_DIR` 指定独立目录。重置密码使用 `npm run account -- reset <账号名> <密码文件路径>`，会撤销现有会话。

### 手机访问开发环境

电脑和手机连接同一 Wi-Fi 后，运行 `npm run dev:lan`，在手机浏览器打开终端显示的 `Network` 地址（`http://电脑的局域网IP:5173`）。此命令固定使用 5173 端口；端口被占用时会报错。Windows 防火墙需允许当前 Wi-Fi 子网访问该端口。使用与电脑相同的账号登录，保持电脑开机、服务运行。电脑重新连接网络后，IP 地址可能变化。

本地数据库与加密后的 AI 配置保存在已被 Git 忽略的 `data/` 中，API Key 应通过「设置 → AI 设置」保存，或放在仓库外的私有文件中。不要将真实密钥或测试密码写入源码、文档或提交。

## 配置 AI

登录后进入「设置 → AI 设置 → 添加模型」，填写供应商、模型名称和 API Key。兼容接口使用供应商的公网 HTTPS 基础地址（例如 `https://api.example.com/v1`）。可测试连接后保存多套配置，在列表中编辑、删除或设为当前模型，也可在聊天侧栏切换。当前选择在同一账号的设备间同步，切换对之后发送的消息生效。

部署后，API Key 通过 HTTPS 提交，以 AES-256-GCM 加密保存在服务端的 `ai-model.json`。保存后界面只允许保留或替换密钥。旧版单条配置在首次读取时迁移。迁移和保存会使用服务端加密密钥，默认首次使用时在数据目录生成 `ai-config.key`。生产环境可在首次保存或迁移前，通过 `AI_CONFIG_KEY_FILE` 指向单独挂载的私有文件，内容为 32 字节随机数据的无填充 Base64URL 编码（43 个字符）。AI 配置与 SQLite 快照和 JSON 导出分开。迁移服务器时，保留 `ai-model.json` 并在独立的私有位置备份与之配套的加密密钥文件。

也可通过 `AI_API_KEY_FILE` 指定供应商密钥文件，并用 `AI_PROVIDER`、`AI_MODEL`、`AI_BASE_URL` 提供一条部署配置。默认供应商为 DeepSeek，默认模型为 `deepseek-flash`。目标、思考和财务的访问权限在设置中分别开启。当前操作卡支持确认单个任务的完成状态。

## 验证与备份

```bash
npm run check
npm test
npm run build
python -m pip install playwright==1.61.0
python -m playwright install chromium webkit
python tests/e2e/workspace.py
```

浏览器测试启动正式构建，使用临时账号和临时数据库，覆盖 Chromium 桌面和手机视口、WebKit 移动端登录及快照恢复。用 `npm run backup -- <新快照文件路径>` 创建完整性校验后的 SQLite 快照。恢复时暂停写入，将快照以 `buxu.sqlite` 放到新的数据目录，再用对应版本的程序验证数据。

仓库提供 `.githooks/pre-commit` 暂存区扫描。安装 Gitleaks 后，在本仓库运行 `git config core.hooksPath .githooks` 启用。CI 也会扫描检出的文件。

## 预发布

`deploy/compose.yaml` 提供单实例应用、SQLite 持久卷和 Caddy HTTPS。将 `BUXU_DOMAIN` 设为解析到服务器的域名，挂载私有密码文件，使用同一应用镜像执行账号初始化，执行 `npm run migrate` 后启动 Compose。可用 Compose 覆盖文件将私有密钥文件只读挂载到应用容器，并用 `AI_CONFIG_KEY_FILE`（配置加密）或 `AI_API_KEY_FILE`（可选部署模型）指向容器内路径。生产启动参数和发布验收见[正式开发实现文档](docs/步序正式开发实现文档.md)。

[单文件 Demo](demo/步序-Demo.html) 与[多文件 Demo](demo/index.html) 可独立打开。首次启动正式版会创建空数据库。需要迁移时，在保存着数据的 Demo 中点击「导出 Demo 数据」，然后在正式版设置中预览并导入。
