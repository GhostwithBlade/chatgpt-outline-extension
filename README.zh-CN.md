# ChatGPT Outline

一个轻量的 Chrome Manifest V3 扩展，用来在 ChatGPT 对话页右侧显示类似 Notion 的助手回复大纲。

## 功能

- 在 `chatgpt.com` 和 `chat.openai.com` 页面注入右侧大纲栏。
- 只读取当前页面 DOM，不请求后端服务。
- 只从助手 / GPT 回复中提取标题。
- 按当前回复里最高层级的渲染标题生成大纲：优先 `h1`，没有时用 `h2`，再没有时用 `h3`。
- 不把用户消息加入大纲。
- 默认只显示短灰色标记条，减少页面干扰。
- 鼠标悬停时展开为标题列表卡片。
- 支持点击大纲项跳转到对应回复位置。
- 会高亮当前阅读位置。
- ChatGPT 流式输出时会自动更新。
- 会隐藏 ChatGPT 官方生成的对话大纲 / 用户追问导航，避免和本扩展的大纲重复显示。

## 不做什么

- 没有后端服务。
- 不调用 AI API。
- 不需要账号系统。
- 不批量导出聊天记录。
- 不上传任何对话内容。
- 不把用户消息作为大纲节点。
- 暂不提供手动展开 / 折叠按钮。

## 本地安装

1. 打开 Chrome。
2. 进入 `chrome://extensions`。
3. 打开右上角的 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择本项目文件夹：`chatgpt-outline-extension`。
6. 打开或刷新一个 ChatGPT 对话页面。

如果已经安装过旧版本，修改代码后需要在 `chrome://extensions` 里点击该扩展的重新加载按钮，然后刷新 ChatGPT 页面。

## 文件说明

- `manifest.json`：Chrome 扩展配置。
- `content.js`：页面注入逻辑、标题提取、滚动定位、官方大纲屏蔽逻辑。
- `content.css`：右侧大纲栏样式。
- `icons/`：扩展图标。
- `chatgpt-outline-v0.1.18.zip`：打包后的扩展文件。

## 已知限制

ChatGPT 的页面 DOM 可能变化。如果大纲失效，优先检查 `content.js` 里的选择器和识别逻辑，尤其是：

- `findAssistantContentRoots()`
- `classifyHeading()`
- `getHeadingCandidates()`
- `findNativeOutlineCandidates()`

官方大纲屏蔽逻辑使用了保守的 DOM 特征判断：显式的大纲 / 目录标签、固定或粘性侧边面板，以及普通布局中贴近右侧或位于主对话阅读列右侧、且包含用户追问片段或助手标题片段的窄侧栏。脚本还会接管旧版本注入的同名大纲节点，避免多个本地开发版同时安装时旧内容脚本抢先执行。如果 ChatGPT 再次调整实现，可能需要继续更新这部分规则。

## 后续计划

- 添加大纲搜索。
- 添加设置弹窗。
- 支持将当前大纲导出为 Markdown。
- 增加更稳定的 ChatGPT DOM 适配层。
