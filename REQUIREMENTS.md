# OnTime 0.9.0 依赖

| 用途 | 需要准备 | 说明 |
| --- | --- | --- |
| 安装并运行 | Windows 10 或 11，x64 | 安装包内置 Electron。普通用户无需安装 Node.js、npm 或 Python。 |
| 全盘文件搜索 | Everything 完整版及 ES 命令行工具 | 从 [voidtools](https://www.voidtools.com/downloads/) 分别下载。ES 需支持 JSON 输出。在「设置 → Everything」选择程序，等待首次索引完成后重新检测。 |
| AI 翻译、生成插件、生成改名方案 | 支持 Responses、Chat Completions 或 Anthropic Messages 的模型服务 | 在应用内填写自己的服务地址、模型 ID 和 API Key。搜索应用、搜索文件和已安装的纯本地插件无需模型。 |
| 从源码运行与测试 | Windows x64、Node.js 22.12.0 或更高版本、npm | 使用 `npm ci` 安装锁定的依赖，再运行 `npm run runtime:install` 下载 Electron。 |
| 桌面运行时 | Electron 45.2.3 | 版本由 `package.json` 和 `package-lock.json` 锁定。 |
| 构建时下载 | @electron/get 5.1.0 | 获取指定版本和架构的官方运行时压缩包。通过 `ONTIME_ELECTRON_ZIP` 提供本地压缩包可离线完成此步骤。 |
| 桌面交互测试 | @playwright/test 1.58.2 | 项目直接驱动 Electron，无需另装 Playwright 浏览器。单元测试使用 Node.js 自带的测试运行器。 |
| 构建 Windows 安装包 | 上述开发环境、Windows PowerShell、`tar.exe`、`makecab.exe`、Windows Installer | 构建脚本用 tar 解压 Electron，用 makecab 压缩待安装文件，再通过 Windows Installer 生成 MSI。 |

首次安装开发依赖需要访问 npm 软件源，获取 Electron 运行时需要访问 GitHub Releases 或使用已有缓存。发布版只分发 OnTime 和 Electron。Everything、ES 及模型服务由每位用户自行配置。

在源码根目录运行 `node -p "process.version + ' ' + process.arch"` 可检查 Node.js 版本和架构，构建 Windows 安装包时架构应显示 `x64`。运行 `npm ci` 后，用 `npm ls --depth=0` 可核对三个直接开发依赖的实际版本。完整的间接依赖及下载校验值见 [package-lock.json](package-lock.json)。
