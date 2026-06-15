# ChatGPT Outline

A minimal Chrome Manifest V3 extension that adds a Notion-style assistant response outline to ChatGPT pages.

## What it does

- Injects a light right-side outline rail on `chatgpt.com` and `chat.openai.com`.
- Uses the current page DOM only.
- Reads only assistant / GPT output messages.
- Extracts only the top rendered heading level from assistant messages: `h1` first, then `h2`, then `h3` when higher levels are absent.
- Keeps user messages out of the outline.
- Shows only short gray bars by default.
- Expands to a Notion-style title card on hover.
- Supports click-to-scroll navigation.
- Highlights the current reading position.
- Updates automatically while ChatGPT streams new content.

## What it does not do

- No backend.
- No AI API call.
- No account system.
- No bulk export of chat history.
- No upload of conversation content.
- No user-message outline nodes.
- No manual expand / collapse button.

## Install locally

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this folder: `chatgpt-outline-extension`.
6. Open or refresh a ChatGPT conversation page.

## Known limitations

ChatGPT's DOM may change. If the outline stops working, update the selectors in `content.js`, especially:

- `findAssistantContentRoots()`
- `classifyHeading()`
- `getHeadingCandidates()`

## Next improvements

- Add outline search.
- Add a settings popup.
- Add export current outline as Markdown.
- Add a safer selector adapter for future ChatGPT DOM changes.
