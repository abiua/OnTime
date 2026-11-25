<img src="src/icons/ontime-mark.svg" width="52" alt="OnTime">

# OnTime

OnTime 是一个 Windows 桌面启动器。按 **Alt + Space** 唤出输入框，就能打开应用、搜索本机文件或翻译剪贴板里的文字。反复做的操作可以保存成插件。例如，让 OnTime 生成一个「去掉空行并删除重复行」的插件，用样例试跑，之后每次粘贴文字就能复用。

**Windows x64 · 0.9.0 · AGPL-3.0-only**

[下载 Windows x64 安装包](https://github.com/abiua/OnTime/releases/download/v0.9.0/OnTime-0.9.0-windows-x64.msi) · [查看版本与校验文件](https://github.com/abiua/OnTime/releases/tag/v0.9.0) · [从源码构建安装包](#从源码构建安装包)

## 安装

1. 打开 [GitHub Releases](https://github.com/abiua/OnTime/releases)，在版本的 **Assets** 中下载 `OnTime-0.9.0-windows-x64.msi`。同名的 `.sha256` 文件用于校验下载。
2. 双击 MSI，完成后从 Windows 开始菜单打开 **OnTime**。安装包内含 Electron，普通用户无需安装 Node.js 或 Python。当前版本未做代码签名。
3. 按 **Alt + Space** 唤出输入框，输入一个已安装应用的名称，选中匹配项后按 **Enter**。按 **Esc** 隐藏，再次唤出可接着输入。需要登录时自动启动，可在「设置 → 常规」开启。

在下载目录打开 PowerShell，可用以下命令计算安装包的 SHA-256，与发布页提供的校验文件比较。

```powershell
Get-FileHash .\OnTime-0.9.0-windows-x64.msi -Algorithm SHA256
```

更新前从托盘退出 OnTime，再运行新版 MSI。卸载入口在 Windows「设置 → 应用 → 已安装的应用」。模型配置、插件和恢复记录保存在当前 Windows 用户的应用数据目录，卸载会保留这些数据。

## 第一次使用

| 想做什么 | 操作 | 需要配置 |
| --- | --- | --- |
| 启动应用 | 输入桌面或开始菜单中的应用名，选择快捷方式 | 开箱可用 |
| 查找文件 | 输入文件名，可筛选文档、图片或文件夹，打开结果、定位文件或复制路径 | Everything 和 ES |
| 翻译文字 | 输入或粘贴原文，打开「翻译」，选择目标语言后按 **Ctrl + Enter** | 模型服务 |
| 批量改名 | 打开「批量重命名」，选择目录并描述命名规则，核对原名与新名后接受执行 | 生成方案需要模型服务 |
| 制作常用插件 | 打开「生成插件」，描述用途，核对权限，使用样例试运行后安装 | 生成需要模型服务。运行依插件所用能力而定 |

**启用文件搜索。** 从 [voidtools 下载页](https://www.voidtools.com/downloads/) 安装 Everything 完整版，再下载并解压 **ES 命令行工具**。启动 Everything 并等待首次索引完成。在「设置 → Everything」选择 `Everything.exe` 和 `es.exe`，点击「重新检测」。文件搜索读取本机索引。即使索引尚未就绪，仍可搜索桌面和开始菜单中的应用快捷方式。

**启用 AI。** 在「设置 → 模型服务」选择预设或自定义服务，填写基础地址、模型 ID 和自己的 API Key，点击「保存并启用」，再点「测试已保存配置」。支持 OpenAI Responses、Chat Completions 和 Anthropic Messages。网络端点使用 HTTPS，本机服务也可用 HTTP。基础地址示例为 `https://api.example.com/v1`，接口路径由应用补全。

**试用一个插件。** 输入「做一个倒计时，可以选择分钟数，到时用系统通知提醒我」，打开「生成插件」，检查提醒权限，先用短时间试运行。安装后可从插件栏再次启动。在「设置 → 插件管理」可以停用、撤销能力授权或卸载。倒计时依赖 OnTime 在后台运行。

## 数据与权限

- 翻译会将原文发给当前启用的模型服务。生成改名方案会发送文件名和命名要求，执行改名在本机完成。连接测试和模型调用可能产生服务商费用。
- 模型密钥通过 Electron `safeStorage` 加密，保存在当前用户的应用数据目录。安装包不预置服务商账号、API Key、插件使用记录或 Everything 索引。
- 插件可申请剪贴板、选定文件、网络域名、窗口切换及提醒等权限。先核对预览中的授权范围。文本写入可在「设置 → 常规」查看修改与恢复记录，批量改名在对应工具的「执行与恢复记录」中撤销。

## 从源码运行

准备 **64 位 Windows、x64 Node.js 22.12.0 或更高版本、npm**。在 PowerShell 中运行以下命令，检出与安装包对应的源码版本。如果已经从发布页下载并解压了 **Source code (zip)**，在包含 `package.json` 的目录直接从 `npm ci` 开始。

```powershell
git clone --branch v0.9.0 --depth 1 https://github.com/abiua/OnTime.git
cd OnTime
npm ci
npm run runtime:install
npm start
```

`npm ci` 按锁文件安装开发依赖。`runtime:install` 获取 Electron 桌面运行时。项目使用 JavaScript、HTML 和 CSS，源码可直接启动。依赖版本、可选组件和用途见 [REQUIREMENTS.md](REQUIREMENTS.md)。

## 从源码构建安装包

完成上面的依赖安装后，从托盘退出正在调试的 OnTime，或在同一源码目录另开一个 PowerShell 窗口，再运行以下命令。只需要构建 MSI 时，可以跳过 `npm start`。

```powershell
npm run check
npm test
npm run build:win
```

构建脚本获取并校验锁定版本的 Electron Windows x64 压缩包，只将运行所需的 OnTime 文件、图标、说明和许可证加入安装包。产物在 `dist/` 中，包括 MSI 和 SHA-256 文件。可以把它们一起发给使用者。

离线构建时，先准备好 npm 依赖和官方 `electron-v45.2.3-win32-x64.zip`，再将环境变量 `ONTIME_ELECTRON_ZIP` 指向该文件。构建脚本同样会校验压缩包。

## 源码导航

| 位置 | 内容 |
| --- | --- |
| [src/main.cjs](src/main.cjs) / [src/preload.cjs](src/preload.cjs) | 桌面窗口、全局快捷键、系统服务及页面与主进程之间的接口 |
| [src/renderer.js](src/renderer.js) / [src/index.html](src/index.html) | 启动器、设置、翻译与插件交互 |
| [tests/](tests/) / [scripts/](scripts/) | 单元测试、Electron 交互测试、安装包构建脚本 |
| [插件接口说明](docs/PLUGIN_API.md) | 插件接口、权限模型、文件修改和恢复机制 |

OnTime 使用 [GNU AGPL v3](LICENSE)。Windows 文件搜索实现改编自 Tinker，来源和上游版本见 [第三方说明](THIRD_PARTY_NOTICES.md)。
