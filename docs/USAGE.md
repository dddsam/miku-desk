# Miku Desk 使用手册

圆形视频桌宠 + 本地 Agent 工作台。面向 Windows 10/11 x64。支持 5 段自定义动作视频；请先按 [素材说明](../assets/README.md) 放入素材。视频在本机播放，不需要模型参与。

## 0.1.2 模型选择与连接诊断

- 模型 ID 改为可搜索的选择窗口：鼠标滚轮、滚动条、方向键和 Enter 均可使用。完整列表不截断，支持长模型名，也保留手动输入。
- 列表按供应商地址和凭据分别缓存，获取列表成功不代表模型当前可调用。
- 连接测试结果保留在页面上，可展开复制服务端原始回复。预算池耗尽、模型不可用、鉴权失败等错误增加中文说明。
- 顶部状态改为「未验证 / 最近成功 / 最近失败」，仅反映本次运行中的最近请求结果。修改请求参数后需要重新测试；未保存的设置不会改变实际聊天模型的显示。
- 累计保留 0.1.1 的桌宠拖动修复。


## 0.1.1 拖动修复

修复旧版连续拖动时窗口尺寸可能越来越大的问题。旧版在 pointermove 中反复使用 setPosition，尺寸依赖 Electron 当前返回值；新版统一使用主进程 DIP 光标坐标，每次 setBounds 都明确携带设置中的固定宽高，并合并高频移动事件。点击仍打开聊天，拖动松开不会误触聊天。

右键桌宠或托盘图标，可使用「恢复桌宠大小与位置」，按当前配置尺寸恢复到主屏右下角。配置和历史记录的位置保持一致。


## 开始使用

### Windows 解压即用版

1. 将项目维护者发布的 Windows 构建包 **完整解压**到一个文件夹；源码仓库本身不含可执行程序。
2. 双击文件夹里的 `MikuDesk.exe`。不要单独移动这个 exe，它需要旁边的资源文件。
3. 点击圆框打开面板，在「模型」中填写接口类型、Base URL、API Key 和模型 ID。
4. 点击「测试连接」，选择「对话模型供应商」，再「保存设置」。
5. 回到「对话」输入任务。拖动圆框可以移动位置，右键可以停止任务、切换置顶和退出。

桌宠主体不需要另装 Node.js。MCP、Hooks 或子代理若使用 `node`、`npx`、`python` 等命令，仍需在电脑上安装对应运行环境。该构建未做 Windows 代码签名。

### 从源码运行

安装 Node.js 24，按 [素材说明](../assets/README.md) 添加素材，解压源码包后双击 `Start-Windows.cmd`；或在项目文件夹运行：

```powershell
npm ci
npm start
```

如果安装时禁用了生命周期脚本，导致提示找不到 Electron：

```powershell
node node_modules/electron/install.js
npm start
```

开发命令：`npm test` 运行核心测试；`npm run pack:win` 生成 `dist/MikuDesk-win32-x64/`。

## 动作与交互

| 场景 | 视频 | 行为 |
| --- | --- | --- |
| 待机 | miku_standby.mp4 | 循环 |
| 开心工作 | miku_work_happy.mp4 | 循环 |
| 生气工作 | miku_work_angry.mp4 | 循环 |
| 方案被驳回 / 系统长时间无操作 | miku_not_understand.mp4 | 循环 |
| 本轮任务完成 | miku_finishwork.mp4 | 播放一次，再按当前状态切换 |

点击「驳回刚才的方案」会停止当前运行、记录你的拒绝并显示疑惑，等待新要求；不会自动把已经做出的修改回滚。长时间无操作默认 5 分钟，可在「性格与外观」调整。检测采用系统空闲时间，不读取你敲入的按键内容。

状态优先级：手动预览 → 驳回 → 完成动画 → 长时间无操作 → 工作 → 待机。若你在任务运行时离开电脑，到达空闲阈值会显示疑惑，但任务仍继续。完成动画结束时，如果仍处于空闲状态，则回到疑惑。

「自动」情绪默认开心：可选 System One 在任务开始前判断；对话模型也能调用 `pet_mood` 工具调整。选择固定的开心或生气模式后，模型不会改动你的选择。名字、系统提示词、圆框尺寸、置顶均可修改。

## 五种模型接口

| 选择 | 示例 Base URL | 自动请求端点 | 用途 |
| --- | --- | --- | --- |
| OpenAI 兼容 | https://example.com/v1 | /chat/completions | 对话 + 工具 |
| OpenAI Responses | https://example.com/v1 | /responses | 对话 + 工具 |
| Anthropic 兼容 | https://example.com/v1 | /messages | 对话 + 工具 |
| Gemini 兼容 | https://example.com/v1beta | /models/{model}:generateContent | 对话 + 工具 |
| System One | https://example.com/v1 | /systemone | 辅助判断、情绪分类 |

也可以填写完整请求端点。只填域名时，OpenAI / Responses / Anthropic / System One 自动补 `/v1`，Gemini 自动补 `/v1beta`。若代理在自定义前缀下提供 Anthropic 接口，请填到 `/v1` 或完整 `/messages`。

System One 是 `state + questions → answers` 决策协议，不是普通对话接口，所以需要另外选一个对话模型。模型应支持 function/tool calling，才能执行任务；不支持工具的模型可能仅能聊天，或拒绝带 tools 的请求。

「获取列表」请求供应商的 models 接口，成功后打开可搜索、可滚动的选择窗口。后续点击模型 ID 右侧的「⌄」可再次打开，选择后点击「保存设置」生效。如果供应商没有列表接口，直接手填模型 ID。「未验证」表示尚未得到本次运行中的请求结果；「最近成功」不保证服务持续可用。「测试连接」会发送一次真实基础请求，可能按供应商规则计费；正式 Agent 任务还会携带工具定义。

如果报 `AgentRouter: Budget pool quota has been exhausted`，需在 AgentRouter 或密钥提供方处增加预算限额、换预算池，或选用另一个有额度的供应商。相同预算池下只换模型可能仍失败。`not asked again before 19:36 UTC+8` 之类提示是网关暂缓重试时间，不保证到时恢复额度。升级桌宠不能补充供应商额度。

可以用环境变量名代替填写 Key。若同时填写，则环境变量优先。变量要在启动 Miku Desk 的环境中可见。额外请求体支持供应商参数，例如：

```json
{"chat_template_kwargs":{"enable_thinking":false}}
```

部分旧 OpenAI 兼容服务只接受 `max_tokens`，可在额外请求体填写 `{"max_tokens":4096}`，程序会移除默认的 `max_completion_tokens`。这些参数取决于所选模型，不保证每家供应商都支持。

### 接 Magpie

AI 网关项目为 [yetone/magpie](https://github.com/yetone/magpie)。`Blinue/Magpie` 是另一个窗口缩放项目。

Magpie 默认本地地址按其文档为 `http://127.0.0.1:3425`；以你本机实际端口为准：

- OpenAI 或 Responses：`http://127.0.0.1:3425/v1`
- Anthropic：`http://127.0.0.1:3425/v1`
- Gemini：`http://127.0.0.1:3425/v1beta`
- 本机网关 API Key 可填 `magpie-miku-desk`；远程网关使用它分配的真实密钥。
- 模型 ID 使用 Magpie 返回的完整标识，不预设某款模型。

## MCP

「扩展 → MCP 服务 → 配置」。既支持本应用的数组格式，也支持常见 `{"mcpServers":{"名称":{...}}}` 格式。勾选方式为把条目的 `enabled` 改成 `true`，点击应用后保存设置。导入常见配置格式时，未禁用的条目会成为启用状态。

```json
[
  {
    "id":"my-tools", "name":"本机工具", "enabled":true,
    "transport":"stdio", "command":"python",
    "args":["D:\\MyTools\\server.py"], "env":{}
  },
  {
    "id":"remote", "name":"HTTP 工具", "enabled":false,
    "transport":"http", "url":"http://127.0.0.1:8000/mcp",
    "headers":{"Authorization":"Bearer YOUR_TOKEN"}
  }
]
```

每次任务启动时连接启用的服务，自动发现工具并把参数 schema 提供给模型；结束时关闭连接。使用旧 SSE 服务时填 `"transport":"sse"`。`cwd` 和 `timeoutMs` 可选。只支持直接配置请求头鉴权，没有实现浏览器 OAuth 登录。MCP tools 的文本结果和结构化结果可用；图片、音频不会传入模型。本版没有资源浏览器或 MCP prompts 菜单。

## Skills

在「扩展 → Skills → 添加目录」选择某个包含 `SKILL.md` 的技能目录，或包含多个一级技能子目录的文件夹。保存后生效。

程序先把技能名称、说明、ID 和目录加入索引；完整说明、模板和参考文件通过 `skill_read` / `skill_files` 按需读取，避免把全部内容塞入上下文。

技能里的脚本不会仅因为存在就被运行。执行脚本需要你启用「允许 Miku 直接运行本地程序」，或让已启用的子代理执行。源码包附带 `examples/skills/desk-notes/`，可直接添加测试。

## 子代理

本版提供统一的 CLI / HTTP 适配器以及 `delegate_agent`、`delegate_parallel` 工具。一次并行最多 4 项。**不存在能直接控制所有软件的通用 Agent 协议**：有非交互 CLI、可调用 HTTP 或 MCP 接口的 Agent 才能接入；纯图形界面 Agent 需要额外自动化适配器。

点击「扫描已安装的 Agent」会在 PATH 中查找 Hermes、DSH、Codex、Claude、Gemini、OpenCode、Aider、Goose、Pi、Qoder、Magpie。发现某个命令不等于它可以直接承担子任务；例如 Magpie 主要是模型网关。加入后核对参数，再启用。

Hermes / DSH 示例在 `examples/agents.json`，界面「填入示例」也可得到：

```json
[
  {"id":"hermes","name":"Hermes","enabled":true,"type":"cli",
   "command":"hermes","args":["-z"],"input":"stdin","timeoutMs":300000},
  {"id":"dsh","name":"DeepSeek Harness","enabled":true,"type":"cli",
   "command":"dsh","args":["--profile","headless"],"input":"stdin","timeoutMs":300000}
]
```

以上根据当前官方文档配置；你已安装的旧版本可能不同。先用 `hermes --help` / `dsh --help` 核对。Hermes 需要预先登录并选好模型；DSH 的 headless profile 也需有可用模型配置。这些 Agent 使用自己的供应商，Miku 的供应商设置不会覆盖它们。

通用 CLI 配置：

```json
{"id":"custom","name":"自定义 Agent","enabled":true,"type":"cli",
 "command":"D:\\Agents\\agent.exe","args":["run","--prompt","{prompt}"],
 "input":"args","cwd":"D:\\Projects\\demo","env":{},"timeoutMs":300000}
```

- 默认将任务写入 stdin；若 args 中包含 `{prompt}`，则以单个参数替换，不再写 stdin。参数形式受 Windows 命令行长度限制，长任务优先使用 stdin。
- `{workspace}` 可用于参数替换。默认 cwd 是桌宠工作目录，也可为每个 Agent 设置独立目录。
- 启用之后，Miku 可直接调用；子代理保留自己的批准规则，桌宠不会替它自动回答权限对话。需要交互终端才能运行的 Agent 应使用它提供的 headless / one-shot 模式。
- 停止任务会取消 HTTP 等待，并尝试终止本机 CLI 进程树。已经提交给远程服务的任务是否取消，由该服务决定。
- 每次委派为一次独立调用，不复用子代理会话；需要相关上下文时由主 Agent 放进 Prompt。

HTTP 适配器发送 `POST {"prompt":"任务","cwd":"目录"}`，可用 `headers` 和 `extraBody` 扩展，读取 JSON 返回。它不是任意 Agent API 的自动转换器；不同接口可先包一层自己的桥接服务。并行执行时应避免同时修改同一文件。

## Hooks

事件：`beforeTask`、`afterTask`、`beforeTool`、`afterTool`、`onError`。脚本从 stdin 读一个 JSON 对象，`event` 为事件名，附带该阶段的 `prompt`、`name`、`args`、`result` 或 `error`。

```json
[{"id":"log","event":"afterTask","enabled":true,"command":"node",
  "args":["D:\\MikuDesk\\examples\\hook-log.mjs"],"timeoutMs":15000,"blocking":false}]
```

非零退出码且 `blocking: true` 会让当前阶段报错；beforeTool 阶段会阻止该工具。afterTool / afterTask 已发生的操作不会因此撤销。Hook stdout 不是模型指令，不自动拼进系统提示词。示例脚本只记录事件名称和时间。

## 数据、权限与当前范围

- 配置及最近对话保存在 Windows 当前用户的 `%APPDATA%\\MikuDesk`，通过 Electron safeStorage / Windows DPAPI 加密。外部 Agent 的配置仍由它们自己管理。
- 「导出配置」删除 API Key、请求头和环境变量值；若你自己把密钥写在 URL、参数或额外 JSON 中，导出前需自行移除。
- 内置文件工具限制在你选择的工作目录，拒绝常见路径穿越和指向目录外的符号链接。这不是对外部程序的操作系统沙箱；启用的命令、MCP、Hooks 和子代理具有当前用户权限。不会自动取得管理员权限。
- Renderer 开启隔离、禁用 Node 和网络页面导航。模型回复按纯文本显示，不当作 HTML 执行。
- 默认保留最近 10 轮对话，工具结果最多 16000 字符，单次任务最多 16 轮模型调用，均有上限。被截断的工具内容、子代理输出应按需再查；本版没有自动摘要记忆。
- 本版使用非流式响应；请求过程中显示状态和工具日志，完整回复到达后展示。没有语音、系统开机启动、插件市场安装器、浏览器操作或桌面操作工具的内置实现，可通过扩展接入。
- 整个桌面悬浮显示需要原生运行；普通浏览器页不能替代它。

## 实现结构

| 文件 | 用途 |
| --- | --- |
| src/main.mjs | 原生窗口、托盘、系统空闲检测、IPC |
| src/preload.cjs | 向隔离界面提供有限的方法 |
| src/ui/ | 圆框、聊天、供应商和扩展设置 |
| src/core/providers.mjs | 五种协议请求与响应转换 |
| src/core/agent.mjs | 对话上下文、工具循环、停止和结果回传 |
| src/core/extensions.mjs | MCP、Skill、Hook、子代理和文件工具 |
| src/core/process.mjs | 进程启动、输出限制和取消 |
| src/core/state.mjs | 动作状态优先级 |
| src/core/store.mjs | 配置校验和加密持久化 |
| test/ | 协议、MCP、文件和委派集成测试 |

## 验证范围

自动化核心测试使用本地模拟 API，不消耗真实供应商额度。覆盖四种聊天协议的实际 HTTP 往返、System One 请求、思考签名保留、工具结果关联、路径隔离、Skill 发现、MCP stdio 初始化与调用、Hooks、CLI / HTTP 委派、并行任务、停止进程、真实文件写入和加密存储流程。

0.1.2 共通过 32 项自动化测试。新增 Electron 界面验证使用 1,200 个模拟模型，检查鼠标滚轮滚至末尾并选中、长 ID 搜索、键盘选择、440px 最小窗口布局、不同凭据的列表缓存隔离、402 预算池耗尽提示与原始回复、测试结果持续显示、聊天错误、无自动重试，以及修改模型后测试状态失效。

在 Electron 无头运行环境中，另外完成了界面联调：所有设置页可打开、视频能解码播放、动作预览切换、保存并加密配置、从输入框发起任务、模拟模型调用工具写入真实文件、显示完成回复、驳回切换疑惑。无头测试不覆盖 Windows 桌面窗口管理器的实际表现。

Windows 包由 Linux 环境交叉打包；未在你的 Windows、真实 API 或已安装的 Hermes / DSH 上做过端到端验证。首次联调如有错误，保留面板的错误原文以便定位。Windows 特有的窗口交互、DPAPI 和 `.cmd` 子代理应在本机最终验收。

## 参考接口文档

- [Magpie 集成说明](https://usemagpie.ai/docs/integrate)
- [OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Anthropic 工具定义](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)
- [Gemini Function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [System One Inference API](https://systemonemodels.ai/docs/inference)
- [MCP 官方 SDK](https://modelcontextprotocol.io/docs/sdk)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage/)
- [Hermes CLI](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)
- [DSH headless](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/headless/README.md)

本项目未复制 Magpie 源代码。代码和文档采用 MIT 许可证。此公开源码不含角色视频与图标；自行添加的素材遵循各自许可，不由本项目的 MIT 许可证授权。工程依赖的许可证见各依赖目录和 Windows 包附带的许可证文件。
