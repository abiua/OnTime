# 插件能力与文件恢复

## 接口与授权

| 接口 | 声明与运行约束 |
| --- | --- |
| `api.clipboard.readText()` / `writeText(text)` | `clipboardRead` / `clipboardWrite`，最多 20 万字符 |
| `api.storage.get(key)` / `set(key,value)` / `remove(key)` | `storage`，单项 JSON 64KB、单插件 128KB。试运行的数据仅在当次运行可见 |
| `api.files.pickFile()` / `pickFolder()` / `list(directory)` / `readText(path)` | `filesRead`，每次运行选择一次范围。列表最多 500 个直接子项，文本文件最多 1MB |
| `api.files.open(path)` / `reveal(path)` | `filesRead`，限本次选择范围。可打开文件夹、常见文档和媒体，也可定位其他文件 |
| `api.files.writeText(path,text)` / `renameBatch(directory,renames)` | `filesWrite`，路径来自本次选定范围。文本写入每次最多 10 个文件，每个最多 1MB。写入和改名分开执行 |
| `api.request({url,method,body,headers})` | 声明精确 HTTPS 域名。POST 额外声明 `networkWrite`，文本请求体最多 64KB。GET 与 POST 合计每次最多 8 次，返回文本，响应上限 512KB |
| `api.windows.list()` / `focus(id)` | `windows`，只接受本次列表返回的窗口标识。切换受 Windows 前台窗口规则影响 |
| `api.remind({title,message,channels})` | 各渠道分别声明 `notifications`、`sound`、`popup`，每次运行最多一条即时提醒 |

预览时确认插件申请的能力。安装后在「设置 → 插件管理 → 管理能力授权」调整已声明的能力，撤销即时生效。网络域名与浏览器范围沿用既有的独立确认。访问文件由宿主打开选择窗口，再校验真实路径，阻止越界和链接跳转，并保护宿主配置、密钥和程序文件。

脚本成功后才提交已暂存的剪贴板写入、插件数据、提醒、窗口和文件修改。POST 在脚本运行期间向目标服务发送，服务端效果由目标服务决定。组合操作按顺序提交，出现错误时报告已完成的操作。文件选择期间暂停脚本计算时限，整个交互受五分钟上限约束。

## 文件预览与恢复

文本修改预览列出目标路径、创建或覆盖，以及每个文件最多 1200 字的内容预览。接受后重新检查目录与内容，以临时文件写入新内容。覆盖前在原目录保留原文件，记录和校验信息保存在 `userData/plugin-file-journal`。恢复再次核对内容，发现用户后来编辑过的文件时保留现状和备份。

文本写入从「设置 → 常规 → 插件文件修改与恢复」撤销。批量改名复用重命名执行器，在「重命名 → 执行与恢复记录」撤销。
