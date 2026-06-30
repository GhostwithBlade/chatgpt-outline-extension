# ChatGPT Outline

> 给长篇 ChatGPT 回复加一个类似 Notion 的右侧大纲栏，轻量、安静、只在需要时展开。

![ChatGPT Outline 预览](assets/preview.svg)

ChatGPT Outline 适合经常让 ChatGPT 写方案、做调研、解释代码、整理长文档的人。它默认把助手回复里的标题提取成右侧大纲，也可以从扩展图标切换为用户提问大纲；平时只显示一列短灰色标记，鼠标悬停时展开为标题卡片，点击任意条目即可跳回对应段落或提问。

## 亮点

- **专为长回答设计**：阅读调研报告、产品方案、技术拆解、学习笔记时不用反复滚动找位置。
- **默认不打扰**：平时只是右侧一列轻量标记条，不遮挡 ChatGPT 主内容。
- **悬停展开**：鼠标移到右侧标记条时，展示类似 Notion 的标题列表卡片。
- **点击跳转**：点击任意大纲项，直接滚动到对应助手回复位置。
- **助手 / 用户模式**：通过工具栏弹窗或 `Alt+Shift+O` 在助手标题大纲和用户提问大纲之间切换。
- **阅读位置高亮**：当前所在章节会自动高亮，方便知道自己读到哪里。
- **流式输出友好**：ChatGPT 还在生成内容时，大纲也会自动更新。
- **减少重复导航**：会隐藏 ChatGPT 官方生成的右侧对话大纲 / 用户追问导航，避免两个大纲同时出现。

## 隐私说明

这个扩展刻意保持简单，本地运行，不碰你的对话数据传输。

- 没有后端服务。
- 不调用 AI API。
- 不需要账号系统。
- 不上传任何对话内容。
- 不批量导出聊天记录。
- 只读取当前 ChatGPT 页面 DOM。
- 默认从助手 / GPT 回复中提取标题；选择用户模式时，只在本地读取当前页用户提问生成大纲。

## 工作方式

扩展会在 `chatgpt.com` 和 `chat.openai.com` 的对话页里扫描消息。助手模式读取页面已经渲染出来的助手标题，并按当前回复里最高层级的标题生成大纲：优先 `h1`，没有时用 `h2`，再没有时用 `h3`。用户模式会把用户消息整理成提问摘要。当前模式保存在 Chrome 本地存储里，可以通过扩展弹窗或 `Alt+Shift+O` 切换。

## 本地安装

1. 打开 Chrome，进入 `chrome://extensions`。
2. 打开右上角的 **开发者模式**。
3. 点击 **加载已解压的扩展程序**。
4. 选择本项目文件夹：`chatgpt-outline-extension`。
5. 打开或刷新一个 ChatGPT 对话页面。

如果已经安装过旧版本，修改代码后需要在 `chrome://extensions` 里点击该扩展的重新加载按钮，然后刷新 ChatGPT 页面。

<details>
<summary>文件说明</summary>

- `manifest.json`：Chrome Manifest V3 扩展配置。
- `content.js`：页面注入、模式切换、标题 / 用户提问提取、滚动定位、阅读位置计算、官方大纲屏蔽逻辑。
- `content.css`：右侧大纲栏和悬停卡片样式。
- `background.js`：快捷键切换逻辑。
- `popup.html`、`popup.css`、`popup.js`：工具栏弹窗模式开关。
- `icons/`：扩展图标。
- `assets/preview.svg`：README 预览图。
- [最新版本下载](https://github.com/GhostwithBlade/chatgpt-outline-extension/releases/latest)：当前打包后的扩展文件。

</details>

<details>
<summary>已知限制</summary>

ChatGPT 的页面 DOM 可能变化。如果大纲失效，优先检查 `content.js` 里的选择器和识别逻辑，尤其是：

- `findAssistantContentRoots()`
- `classifyHeading()`
- `getHeadingCandidates()`
- `findNativeOutlineCandidates()`

官方大纲屏蔽逻辑使用保守的 DOM 特征判断：显式的大纲 / 目录标签、固定或粘性的右侧面板、普通布局中贴近右侧或位于主对话阅读列右侧的窄侧栏，以及 ChatGPT 官方由多个 `Prompt N` 小按钮组成的右侧固定导航 rail。如果 ChatGPT 再次调整实现，可能需要继续更新这部分规则。

</details>

## 后续计划

- 添加大纲搜索。
- 支持将当前大纲导出为 Markdown。
- 增加更稳定的 ChatGPT DOM 适配层。
