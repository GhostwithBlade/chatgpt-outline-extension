const OUTLINE_MODE_STORAGE_KEY = "outlineMode";
const OUTLINE_MODE_ASSISTANT = "assistant";
const OUTLINE_MODE_USER = "user";
const DEFAULT_OUTLINE_MODE = OUTLINE_MODE_ASSISTANT;

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-outline-mode") return;

  toggleOutlineMode();
});

async function toggleOutlineMode() {
  const currentMode = await getStoredOutlineMode();
  const nextMode = currentMode === OUTLINE_MODE_ASSISTANT
    ? OUTLINE_MODE_USER
    : OUTLINE_MODE_ASSISTANT;

  await chrome.storage.local.set({ [OUTLINE_MODE_STORAGE_KEY]: nextMode });

  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!activeTab?.id) return;

  chrome.tabs.sendMessage(activeTab.id, {
    type: "cgpt-outline-set-mode",
    mode: nextMode
  }).catch(() => {});
}

async function getStoredOutlineMode() {
  const result = await chrome.storage.local.get({
    [OUTLINE_MODE_STORAGE_KEY]: DEFAULT_OUTLINE_MODE
  });

  return result[OUTLINE_MODE_STORAGE_KEY] === OUTLINE_MODE_USER
    ? OUTLINE_MODE_USER
    : OUTLINE_MODE_ASSISTANT;
}
