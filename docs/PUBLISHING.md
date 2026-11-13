# 发布到自己的 GitHub

此目录已整理为可以公开上传的源码：包含 MIT 许可证、忽略规则、依赖锁文件、使用说明和测试；不含私人配置、聊天记录、角色视频、图标、依赖目录或 Windows 可执行程序。

## 方法一：使用网页上传

1. 解压 `MikuDesk-GitHub-v0.1.2.zip`，打开里面的 `miku-desk` 文件夹。应能直接看到 `README.md`、`LICENSE`、`package.json`、`src` 等。
2. 登录自己的 GitHub，打开 [创建仓库页面](https://github.com/new?name=miku-desk&visibility=public)。
3. 按以下内容填写：

   | 字段 | 内容 |
   | --- | --- |
   | Owner | 你的 GitHub 账号 |
   | Repository name | `miku-desk`，如重名可换名字 |
   | Description | `圆形视频桌宠与可扩展的桌面 Agent，支持自定义 API、MCP、Skills、Hooks 和子代理。` |
   | Visibility | `Public` |
   | Add README | 不勾选，本项目已有 |
   | Add .gitignore | 不选择，本项目已有 |
   | Choose a license | 不选择，本项目已有 MIT LICENSE |

4. 点击 `Create repository`。
5. 在空仓库页面点击 `uploading an existing file`；如果仓库已有文件，使用 `Add file → Upload files`。
6. 将 `miku-desk` **文件夹里面的所有文件和子文件夹**拖入上传区域。上传解压后的内容，不是 ZIP，也不是最外层的 `miku-desk` 文件夹。
7. 等待所有文件就绪，填写提交说明 `Initial release v0.1.2`，使用页面的提交按钮完成上传。
8. 回到仓库首页，应直接显示 README，且根目录可以看到 `src/`、`test/`、`assets/README.md`、`package.json`、`LICENSE`、`.gitignore` 和 `.gitattributes`。如果所有内容被套在额外的 `miku-desk/` 子目录中，需要移到仓库根目录。

此源码包少于 100 个文件，单个文件小于 25 MiB，适用于 GitHub 网页上传。网页上传不执行本地 `.gitignore` 过滤，所以请上传此整理好的源码目录，不要从正在运行的开发目录整包拖入。

## 方法二：使用 Git 命令

安装 Git 并完成 GitHub 登录后，在 `package.json` 所在目录打开 PowerShell。先按方法一创建一个空的公开仓库，然后执行：

```powershell
git init -b main
git add .
git commit -m "Initial release v0.1.2"
git remote add origin https://github.com/YOUR_USERNAME/miku-desk.git
git push -u origin main
```

将 `YOUR_USERNAME` 换成你的 GitHub 用户名。如果仓库名不同，也相应修改 URL。登录应在 Git / GitHub 的登录流程中完成，不要把 Token 写入项目文件或发到公开 Issue。

如果提交时提示没有设置作者身份，可只给当前项目设置，再重新提交：

```powershell
git config user.name "你的 GitHub 昵称"
git config user.email "你的 GitHub 公开邮箱或 noreply 邮箱"
```

## 后续更新与安装包

后续网页上传同路径文件即可提交新版本；使用 Git 时按正常 add / commit / push 流程更新。

运行源码和构建安装包前，按 [素材说明](../assets/README.md) 添加本地文件。公开分发安装包时，为构建选择可公开分发的素材，并附上素材及第三方依赖的许可说明。

Windows 完整程序适合放在仓库的 Releases 附件中。GitHub 源码目录保留源文件即可，不要把 `node_modules/`、`dist/` 或已有的完整 Windows ZIP 提交进去。

## 官方参考

- [创建新仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)
- [上传文件](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository?platform=windows)
- [添加本地项目到 GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github?platform=windows)
- [MIT 许可证](https://choosealicense.com/licenses/mit/)
