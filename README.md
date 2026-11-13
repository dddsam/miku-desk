# Miku Desk

圆形视频桌宠，也是可连接自定义模型和本地工具的桌面 Agent。面向 **Windows 10 / 11 x64**，使用 Electron 和 JavaScript。

当前版本：**0.1.2** · 代码许可证：[MIT](LICENSE)

## 能做什么

- 圆形悬浮桌宠，可拖动、置顶、调整尺寸；点击打开聊天和设置。
- 按待机、开心工作、生气工作、疑惑、完成任务切换本地视频。
- 支持 OpenAI 兼容、OpenAI Responses、Anthropic 兼容、Gemini 兼容和 System One 辅助决策接口。
- 自定义 API Base URL、模型、请求参数和性格提示词；模型列表支持搜索、滚轮和键盘选择。
- 通过 MCP、Skills、Hooks、CLI / HTTP 子代理扩展能力。
- 支持本地工作目录文件工具、停止任务、历史记录和加密配置。

本项目需要你自行提供模型服务。MCP 和子代理使用各自的运行环境与权限；并非每个图形界面 Agent 都能直接作为子代理接入。

## 从源码运行

1. 安装 Node.js 24。
2. 克隆或下载源码。
3. 按 [素材说明](assets/README.md) 在 `assets/` 中放入五段动作视频和一个图标。
4. 在项目根目录执行：

```powershell
npm ci
npm start
```

Windows 也可双击 `Start-Windows.cmd`。运行前会检查素材是否齐全，并列出缺少的文件。

第一次打开后，点击圆框，在「模型」中填写供应商、接口类型、Base URL 和完整模型 ID；测试连接，选择对话供应商，再保存设置。API Key 可以通过环境变量提供。

## 测试与构建

```powershell
npm test
npm run check:assets
npm run pack:win
```

- `npm test` 使用模拟 API 和临时工作目录，无需真实供应商密钥或视频素材。
- Windows 构建输出位于 `dist/MikuDesk-win32-x64/`。发布可执行程序时，应打包整个目录。
- `npm start` 和 `npm run pack:win` 需要先准备素材。

0.1.2 已通过 32 项自动化测试，以及在 Electron 无头环境中的模型列表和错误提示验证。Windows 原生窗口行为、用户实际供应商和外部 Agent 仍需在目标电脑上验证。

## 文档

- [完整使用手册：模型、动作、MCP、Skills、Hooks、子代理](docs/USAGE.md)
- [视频与图标配置](assets/README.md)
- [发布到自己的 GitHub](docs/PUBLISHING.md)
- [参与贡献](CONTRIBUTING.md)
- [版本记录](CHANGELOG.md)

## 开源范围

代码和文档采用 [MIT 许可证](LICENSE)。这个仓库不包含角色视频、图标、用户密钥、聊天记录、个人配置、依赖目录或打包后的程序。素材需要自行提供，且不受本项目的 MIT 许可证授权；依赖遵循各自的许可证，见 [第三方说明](THIRD_PARTY_NOTICES.md)。

本项目是独立桌宠程序，不代表角色权利方，也不隶属于模型供应商。
