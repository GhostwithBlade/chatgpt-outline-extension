const OUTLINE_MODE_STORAGE_KEY = "outlineMode";
const OUTLINE_MODE_ASSISTANT = "assistant";
const OUTLINE_MODE_USER = "user";
const DEFAULT_OUTLINE_MODE = OUTLINE_MODE_ASSISTANT;

const root = document.querySelector(".popup");
const buttons = Array.from(document.querySelectorAll("[data-mode]"));
const statusElement = document.getElementById("status");

let activeTab = null;
let isCompatibleTab = false;

init();

async function init() {
  activeTab = await getActiveTab();
  const mode = await getStoredOutlineMode();
  renderMode(mode);
  await detectCompatibleTab();

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      setOutlineMode(button.dataset.mode);
    });
  });
}

async function setOutlineMode(mode) {
  const nextMode = normalizeOutlineMode(mode);
  renderMode(nextMode);
  await chrome.storage.local.set({ [OUTLINE_MODE_STORAGE_KEY]: nextMode });

  if (!isCompatibleTab) {
    setStatus("已保存为全局默认模式");
    return;
  }

  try {
    await chrome.tabs.sendMessage(activeTab.id, {
      type: "cgpt-outline-set-mode",
      mode: nextMode
    });
    setStatus("当前对话页已更新");
  } catch (_error) {
    setStatus("刷新 ChatGPT 页面后生效");
  }
}

async function getStoredOutlineMode() {
  const result = await chrome.storage.local.get({
    [OUTLINE_MODE_STORAGE_KEY]: DEFAULT_OUTLINE_MODE
  });

  return normalizeOutlineMode(result[OUTLINE_MODE_STORAGE_KEY]);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab || null;
}

async function detectCompatibleTab() {
  if (!activeTab?.id) {
    setCompatibleTab(false);
    return;
  }

  try {
    await chrome.tabs.sendMessage(activeTab.id, {
      type: "cgpt-outline-get-mode"
    });
    setCompatibleTab(true);
  } catch (_error) {
    setCompatibleTab(false);
  }
}

function renderMode(mode) {
  const normalizedMode = normalizeOutlineMode(mode);

  buttons.forEach((button) => {
    const isActive = button.dataset.mode === normalizedMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function normalizeOutlineMode(mode) {
  return mode === OUTLINE_MODE_USER ? OUTLINE_MODE_USER : OUTLINE_MODE_ASSISTANT;
}

function setStatus(text) {
  statusElement.textContent = text;
}

function setCompatibleTab(isCompatible) {
  isCompatibleTab = isCompatible;
  root.classList.toggle("is-compatible", isCompatibleTab);
  setStatus(isCompatibleTab ? "当前对话页立即生效" : "仅在 ChatGPT 对话页生效");
}
