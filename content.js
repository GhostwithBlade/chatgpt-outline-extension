(() => {
  "use strict";

  const ROOT_ID = "cgpt-outline-root";
  const EXTENSION_VERSION = "0.1.19";
  const UPDATE_DELAY_MS = 450;
  const SCROLL_UPDATE_DELAY_MS = 120;
  const PERIODIC_UPDATE_MS = 650;
  const JUMP_DURATION_MS = 260;
  const ACTIVE_LOCK_MS = 900;
  const OUTLINE_CARD_CLOSE_DELAY_MS = 180;
  const MIN_JUMP_TOP_OFFSET = 88;
  const JUMP_TOP_GAP = 36;
  const MAX_ITEMS = 80;
  const NATIVE_OUTLINE_STYLE_ID = "cgpt-native-outline-blocker-style";
  const NATIVE_OUTLINE_HIDDEN_ATTR = "data-cgpt-native-outline-hidden";
  const NATIVE_OUTLINE_BLOCK_DELAY_MS = 120;
  const USER_PROMPT_OUTLINE_MIN_MATCHES = 2;
  const USER_PROMPT_SNIPPET_MIN_LENGTH = 6;
  const USER_PROMPT_SNIPPET_MAX_LENGTH = 48;
  const ASSISTANT_HEADING_OUTLINE_MIN_MATCHES = 2;
  const ASSISTANT_HEADING_SNIPPET_MIN_LENGTH = 4;
  const ASSISTANT_HEADING_SNIPPET_MAX_LENGTH = 64;
  const RIGHT_SIDE_PANEL_MAX_WIDTH = 560;
  const RIGHT_SIDE_PANEL_MIN_HEIGHT = 56;
  const RIGHT_SIDE_PANEL_EDGE_GAP = 48;
  const RIGHT_SIDE_PANEL_COLUMN_GAP = 12;
  const NATIVE_PROMPT_RAIL_MIN_BUTTONS = 2;
  const NATIVE_OUTLINE_TERMS = [
    "outline",
    "conversation outline",
    "thread outline",
    "table of contents",
    "toc",
    "大纲",
    "目录"
  ];

  const state = {
    items: [],
    activeId: null,
    mutationTimer: null,
    nativeOutlineTimer: null,
    scrollTimer: null,
    periodicTimer: null,
    cardCloseTimer: null,
    scrollContainers: new Set(),
    mutationObserver: null,
    intersectionObserver: null,
    scrollAnimationFrame: null,
    outlineSignature: null,
    activeLockedUntil: 0
  };

  init();

  function init() {
    const existingRoot = document.getElementById(ROOT_ID);
    if (existingRoot) {
      existingRoot.remove();
    }

    injectNativeOutlineBlockerStyle();
    hideNativeChatGptOutline();
    injectOutline();
    updateOutline();
    observePageChanges();
    observeScrollChanges();
    observePeriodicChanges();
  }

  function injectOutline() {
    const root = document.createElement("aside");
    root.id = ROOT_ID;
    root.className = "cgpt-outline";
    root.dataset.cgptOutlineVersion = EXTENSION_VERSION;
    root.setAttribute("aria-label", "Assistant response outline");
    root.innerHTML = `
      <div class="cgpt-outline__rail" aria-hidden="false"></div>
      <div class="cgpt-outline__bridge" aria-hidden="true"></div>
      <nav class="cgpt-outline__card" aria-label="Assistant headings"></nav>
    `;

    document.documentElement.appendChild(root);

    root.addEventListener("click", handleOutlineClick);
    bindOutlineHover(root);
  }

  function bindOutlineHover(root) {
    const interactiveElements = root.querySelectorAll(".cgpt-outline__rail, .cgpt-outline__bridge, .cgpt-outline__card");

    interactiveElements.forEach((element) => {
      element.addEventListener("mouseenter", openOutlineCard);
      element.addEventListener("mouseleave", scheduleOutlineCardClose);
    });

    root.addEventListener("focusin", openOutlineCard);
    root.addEventListener("focusout", scheduleOutlineCardClose);
  }

  function openOutlineCard() {
    clearTimeout(state.cardCloseTimer);
    document.getElementById(ROOT_ID)?.classList.add("is-open");
  }

  function scheduleOutlineCardClose() {
    clearTimeout(state.cardCloseTimer);
    state.cardCloseTimer = setTimeout(() => {
      document.getElementById(ROOT_ID)?.classList.remove("is-open");
    }, OUTLINE_CARD_CLOSE_DELAY_MS);
  }

  function observePageChanges() {
    const observeTarget = document.body;

    state.mutationObserver = new MutationObserver((mutations) => {
      const root = document.getElementById(ROOT_ID);
      const changedOutsideOutline = mutations.some((mutation) => {
        return !root || !root.contains(mutation.target);
      });

      if (changedOutsideOutline) {
        scheduleNativeOutlineBlocker();
        scheduleUpdate();
      }
    });

    state.mutationObserver.observe(observeTarget, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function observeScrollChanges() {
    refreshScrollContainers();

    window.addEventListener("scroll", scheduleScrollUpdate, {
      capture: true,
      passive: true
    });
    document.addEventListener("scroll", scheduleScrollUpdate, {
      capture: true,
      passive: true
    });
  }

  function observePeriodicChanges() {
    clearInterval(state.periodicTimer);
    state.periodicTimer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      updateOutline();
    }, PERIODIC_UPDATE_MS);
  }

  function injectNativeOutlineBlockerStyle() {
    const existingStyle = document.getElementById(NATIVE_OUTLINE_STYLE_ID);
    if (existingStyle) {
      existingStyle.remove();
    }

    const style = document.createElement("style");
    style.id = NATIVE_OUTLINE_STYLE_ID;
    style.dataset.cgptOutlineVersion = EXTENSION_VERSION;
    style.textContent = `
      [${NATIVE_OUTLINE_HIDDEN_ATTR}="true"],
      body [data-testid="conversation-outline"],
      body [data-testid="thread-outline"],
      body [data-testid="conversation-toc"],
      body [data-testid="table-of-contents"] {
        display: none !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function hideNativeChatGptOutline() {
    restoreProtectedLeftSidebar();

    const candidates = findNativeOutlineCandidates();

    candidates.forEach((element) => {
      const target = getNativeOutlineHideTarget(element);
      if (!target) return;

      target.setAttribute(NATIVE_OUTLINE_HIDDEN_ATTR, "true");
      target.style.setProperty("display", "none", "important");
    });
  }

  function scheduleNativeOutlineBlocker() {
    clearTimeout(state.nativeOutlineTimer);
    state.nativeOutlineTimer = setTimeout(hideNativeChatGptOutline, NATIVE_OUTLINE_BLOCK_DELAY_MS);
  }

  function findNativeOutlineCandidates() {
    const exactSelectorCandidates = Array.from(document.querySelectorAll([
      '[data-testid*="outline" i]',
      '[data-testid*="toc" i]',
      '[data-testid*="table-of-contents" i]',
      '[aria-label*="outline" i]',
      '[aria-label*="table of contents" i]',
      '[aria-label*="大纲"]',
      '[aria-label*="目录"]'
    ].join(",")));

    const containerCandidates = Array.from(document.querySelectorAll([
      "aside",
      "nav",
      '[role="navigation"]',
      '[role="complementary"]'
    ].join(","))).filter(isNativeOutlineLikeContainer);

    const conversationOutlineCandidates = Array.from(document.body.querySelectorAll([
      "aside",
      "nav",
      '[role="navigation"]',
      '[role="complementary"]',
      "[data-testid]",
      "[aria-label]",
      "div"
    ].join(","))).filter(isNativeConversationOutlineLikeContainer);
    const promptRailCandidates = Array.from(document.body.querySelectorAll([
      "aside",
      "nav",
      '[role="navigation"]',
      '[role="complementary"]',
      "div"
    ].join(","))).filter(isNativePromptRailContainer);

    return uniqueOuterElements(exactSelectorCandidates.concat(containerCandidates, conversationOutlineCandidates, promptRailCandidates))
      .filter((element) => {
        return !isInsideExtension(element) &&
          !isInsideMessage(element) &&
          !hasProtectedLeftSidebarAncestor(element);
      });
  }

  function getNativeOutlineHideTarget(element) {
    if (!element || isInsideExtension(element) || isInsideMessage(element) || hasProtectedLeftSidebarAncestor(element)) return null;

    if (isNativePromptRailContainer(element)) return element;
    if (isNativeOutlineLikeContainer(element)) return element;

    const sidePanel = findSidePanelAncestor(element);
    if (sidePanel) return sidePanel;
    if (isNativeConversationOutlineLikeContainer(element)) return element;

    let current = element.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
      if (isInsideExtension(current) || isInsideMessage(current)) return null;
      if (isNativeOutlineLikeContainer(current)) return current;
      current = current.parentElement;
    }

    return hasNativeOutlineSignal(element) ? element : null;
  }

  function findSidePanelAncestor(element) {
    const candidateHasNativeSignal = hasNativeOutlineSignal(element);
    let current = element.parentElement;

    while (current && current !== document.body && current !== document.documentElement) {
      if (isInsideExtension(current) || isInsideMessage(current)) return null;
      if (isProtectedLeftSidebar(current)) return null;
      if (isSidePanelContainer(current, { allowPositionalMatch: candidateHasNativeSignal })) return current;
      current = current.parentElement;
    }

    return null;
  }

  function isNativeOutlineLikeContainer(element) {
    if (!element || isInsideExtension(element) || isInsideMessage(element)) return false;
    if (isProtectedLeftSidebar(element)) return false;
    if (!hasNativeOutlineSignal(element) && !hasConversationOutlineSignal(element)) return false;

    const tag = element.tagName.toLowerCase();
    const role = (element.getAttribute("role") || "").toLowerCase();
    const isSemanticNav = tag === "aside" ||
      tag === "nav" ||
      role === "navigation" ||
      role === "complementary";

    return isSemanticNav ||
      isFixedOrStickySidePanel(element, { side: "right" }) ||
      isRightSideLayoutPanel(element);
  }

  function isSidePanelContainer(element, options = {}) {
    if (isProtectedLeftSidebar(element)) return false;

    const tag = element.tagName.toLowerCase();
    const role = (element.getAttribute("role") || "").toLowerCase();
    const isSemanticNav = tag === "aside" ||
      tag === "nav" ||
      role === "navigation" ||
      role === "complementary";

    const hasOutlineSignal = hasNativeOutlineSignal(element) || hasConversationOutlineSignal(element);

    return (isSemanticNav && hasOutlineSignal) ||
      (options.allowPositionalMatch && isFixedOrStickySidePanel(element, { side: "right" })) ||
      (hasOutlineSignal && (isFixedOrStickySidePanel(element, { side: "right" }) || isRightSideLayoutPanel(element)));
  }

  function isNativeConversationOutlineLikeContainer(element) {
    if (!element || isInsideExtension(element) || isInsideMessage(element)) return false;
    if (!isVisible(element)) return false;
    if (hasProtectedLeftSidebarAncestor(element)) return false;
    if (!isFixedOrStickySidePanel(element, { side: "right" }) && !isRightSideLayoutPanel(element)) return false;
    return hasConversationOutlineSignal(element);
  }

  function isNativePromptRailContainer(element) {
    if (!element || isInsideExtension(element) || isInsideMessage(element)) return false;
    if (!isVisible(element)) return false;
    if (isProtectedLeftSidebar(element) || hasProtectedLeftSidebarAncestor(element)) return false;
    if (!isFixedOrStickySidePanel(element, { side: "right" })) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width < 24 || rect.width > 120) return false;
    if (rect.height < 24 || rect.height > Math.min(window.innerHeight, 520)) return false;

    const buttons = Array.from(element.querySelectorAll("button[aria-label], button[title]"))
      .filter(isNativePromptRailButton);

    if (buttons.length < NATIVE_PROMPT_RAIL_MIN_BUTTONS) return false;

    const text = normalizeText(element.innerText || element.textContent || "");
    return text.length === 0;
  }

  function isNativePromptRailButton(button) {
    if (!button || isInsideExtension(button) || !isVisible(button)) return false;

    const label = normalizeText([
      button.getAttribute("aria-label"),
      button.getAttribute("title")
    ].filter(Boolean).join(" "));
    if (!/^(prompt|提示)\s*\d+$/i.test(label)) return false;

    const rect = button.getBoundingClientRect();
    const isSmallHorizontalBar = rect.width >= 8 &&
      rect.width <= 64 &&
      rect.height > 0 &&
      rect.height <= 12 &&
      rect.width > rect.height;

    return isSmallHorizontalBar;
  }

  function restoreProtectedLeftSidebar() {
    document.querySelectorAll(`[${NATIVE_OUTLINE_HIDDEN_ATTR}="true"]`).forEach((element) => {
      if (!isProtectedLeftSidebar(element)) return;

      element.removeAttribute(NATIVE_OUTLINE_HIDDEN_ATTR);
      if (element.style.getPropertyValue("display") === "none") {
        element.style.removeProperty("display");
      }
    });
  }

  function hasProtectedLeftSidebarAncestor(element) {
    return Boolean(element.closest?.("aside, nav, [role='navigation'], [role='complementary']") &&
      findProtectedLeftSidebarAncestor(element));
  }

  function findProtectedLeftSidebarAncestor(element) {
    let current = element;

    while (current && current !== document.body && current !== document.documentElement) {
      if (isProtectedLeftSidebar(current)) return current;
      current = current.parentElement;
    }

    return null;
  }

  function isProtectedLeftSidebar(element) {
    if (!element || isInsideExtension(element) || isInsideMessage(element)) return false;

    const tag = element.tagName.toLowerCase();
    const role = (element.getAttribute("role") || "").toLowerCase();
    const isSemanticSidebar = tag === "aside" ||
      tag === "nav" ||
      role === "navigation" ||
      role === "complementary";

    if (!isSemanticSidebar) return false;

    const descriptor = normalizeText([
      element.getAttribute("aria-label"),
      element.getAttribute("data-testid"),
      element.getAttribute("id"),
      element.className
    ].filter(Boolean).join(" ")).toLowerCase();

    if (/(sidebar|side-bar|history|left)/.test(descriptor)) return true;
    if (element.querySelector?.('a[href^="/c/"], a[href="/"], a[href^="/g/"], [data-testid*="history" i], [data-testid*="conversation" i]')) return true;

    const alignment = getFixedOrStickySidePanelAlignment(element);
    if (alignment !== "left") return false;

    const rect = element.getBoundingClientRect();
    return rect.width >= 160 && rect.height >= Math.min(window.innerHeight * 0.5, 420);
  }

  function hasNativeOutlineSignal(element) {
    const metadataSignal = normalizeText([
      element.getAttribute("aria-label"),
      element.getAttribute("data-testid"),
      element.getAttribute("id")
    ].filter(Boolean).join(" ")).toLowerCase();
    const classSignal = normalizeText(
      Array.from(element.classList || [])
        .filter((className) => /(^|[-_:])(outline|toc|table-of-contents)([-_:]|$)/i.test(className))
        .filter((className) => !/(^|[-_:])outline-none($|[-_:])/i.test(className))
        .join(" ")
    ).toLowerCase();
    const textSignal = normalizeText([
      element.innerText,
      element.textContent
    ].filter(Boolean).join(" ")).toLowerCase();

    return NATIVE_OUTLINE_TERMS.some((term) => {
      return metadataSignal.includes(term) ||
        classSignal.includes(term) ||
        (term !== "outline" && textSignal.includes(term));
    });
  }

  function hasConversationOutlineSignal(element) {
    return hasUserPromptOutlineSignal(element) || hasAssistantHeadingOutlineSignal(element);
  }

  function hasUserPromptOutlineSignal(element) {
    return getUserPromptMatchCount(element) >= USER_PROMPT_OUTLINE_MIN_MATCHES;
  }

  function hasAssistantHeadingOutlineSignal(element) {
    return getAssistantHeadingMatchCount(element) >= ASSISTANT_HEADING_OUTLINE_MIN_MATCHES;
  }

  function getUserPromptMatchCount(element) {
    return getSnippetMatchCount(element, getUserPromptSnippets(), USER_PROMPT_OUTLINE_MIN_MATCHES);
  }

  function getAssistantHeadingMatchCount(element) {
    return getSnippetMatchCount(element, getAssistantHeadingSnippets(), ASSISTANT_HEADING_OUTLINE_MIN_MATCHES);
  }

  function getSnippetMatchCount(element, snippetGroups, maxMatches) {
    if (!snippetGroups.length) return 0;

    const text = normalizeForPromptMatch(element.innerText || element.textContent || "");
    if (!text) return 0;

    let matches = 0;
    for (const snippets of snippetGroups) {
      if (!snippets.some((snippet) => snippet && text.includes(snippet))) continue;
      matches += 1;
      if (matches >= maxMatches) return matches;
    }

    return matches;
  }

  function getUserPromptSnippets() {
    const main = document.querySelector("main") || document.body;
    const seen = new Set();

    return Array.from(main.querySelectorAll('[data-message-author-role="user"]'))
      .map((element) => {
        return normalizeText(element.innerText || element.textContent || "");
      })
      .filter((text) => text.length >= USER_PROMPT_SNIPPET_MIN_LENGTH)
      .map((text) => {
        const normalized = normalizeForPromptMatch(text);
        return [
          normalized.slice(0, USER_PROMPT_SNIPPET_MAX_LENGTH),
          normalized.slice(0, 32),
          normalized.slice(0, 20),
          normalized.slice(0, 12)
        ].map(normalizeForPromptMatch).filter((snippet) => {
          return snippet.length >= USER_PROMPT_SNIPPET_MIN_LENGTH;
        });
      })
      .filter((snippets) => {
        if (!snippets.length) return false;
        const key = snippets[0];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function getAssistantHeadingSnippets() {
    const main = document.querySelector("main") || document.body;
    const seen = new Set();

    return Array.from(main.querySelectorAll('[data-message-author-role="assistant"] h1, [data-message-author-role="assistant"] h2, [data-message-author-role="assistant"] h3'))
      .map((element) => stripMarkdownPrefix(element.innerText || element.textContent || ""))
      .map(normalizeText)
      .filter((text) => text.length >= ASSISTANT_HEADING_SNIPPET_MIN_LENGTH)
      .map((text) => {
        const normalized = normalizeForPromptMatch(text);
        return [
          normalized.slice(0, ASSISTANT_HEADING_SNIPPET_MAX_LENGTH),
          normalized.slice(0, 44),
          normalized.slice(0, 28),
          normalized.slice(0, 16)
        ].map(normalizeForPromptMatch).filter((snippet) => {
          return snippet.length >= ASSISTANT_HEADING_SNIPPET_MIN_LENGTH;
        });
      })
      .filter((snippets) => {
        if (!snippets.length) return false;
        const key = snippets[0];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function normalizeForPromptMatch(text) {
    return normalizeText(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isFixedOrStickySidePanel(element, options = {}) {
    const alignment = getFixedOrStickySidePanelAlignment(element);
    if (!alignment) return false;
    if (options.side) return alignment === options.side;
    return true;
  }

  function getFixedOrStickySidePanelAlignment(element) {
    const style = window.getComputedStyle(element);
    if (style.position !== "fixed" && style.position !== "sticky") return null;

    const rect = element.getBoundingClientRect();
    const isPanelSized = rect.width >= 24 &&
      rect.width <= 420 &&
      rect.height >= 24 &&
      rect.height <= window.innerHeight;

    if (!isPanelSized) return null;
    if (rect.right >= window.innerWidth - 360) return "right";
    if (rect.left <= 360) return "left";
    return null;
  }

  function isRightSideLayoutPanel(element) {
    if (!element || isInsideExtension(element) || isInsideMessage(element)) return false;
    if (!isVisible(element)) return false;
    if (isProtectedLeftSidebar(element) || hasProtectedLeftSidebarAncestor(element)) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const maxPanelHeight = Math.max(window.innerHeight * 1.35, 900);
    const isPanelSized = rect.width >= 24 &&
      rect.width <= RIGHT_SIDE_PANEL_MAX_WIDTH &&
      rect.height >= RIGHT_SIDE_PANEL_MIN_HEIGHT &&
      rect.height <= maxPanelHeight;
    const isNearRightEdge = rect.right >= window.innerWidth - RIGHT_SIDE_PANEL_EDGE_GAP;
    const isOutsideMainReadingColumn = rect.left >= Math.max(window.innerWidth * 0.58, 520);
    const isRightOfConversationColumn = isRightOfMainConversationColumn(rect);
    const isUsableDisplay = style.display !== "inline" && style.display !== "contents";

    return isPanelSized &&
      (isNearRightEdge || isOutsideMainReadingColumn || isRightOfConversationColumn) &&
      isUsableDisplay;
  }

  function isRightOfMainConversationColumn(rect) {
    const mainColumnRight = getMainConversationColumnRightEdge();
    if (!mainColumnRight) return false;

    return rect.left >= mainColumnRight - RIGHT_SIDE_PANEL_COLUMN_GAP &&
      rect.left >= window.innerWidth * 0.42;
  }

  function getMainConversationColumnRightEdge() {
    const main = document.querySelector("main") || document.body;
    const maxContentWidth = Math.min(window.innerWidth * 0.82, 980);
    const minContentWidth = Math.min(window.innerWidth * 0.32, 360);
    const rightEdges = Array.from(main.querySelectorAll([
      '[data-message-author-role="assistant"] .markdown',
      '[data-message-author-role="assistant"] [data-testid="markdown"]',
      '[data-message-author-role="assistant"] .prose',
      '[data-message-author-role="user"]',
      '[data-message-author-role="assistant"]'
    ].join(","))).map((element) => {
      return element.getBoundingClientRect();
    }).filter((candidateRect) => {
      return candidateRect.width >= minContentWidth &&
        candidateRect.width <= maxContentWidth &&
        candidateRect.height >= 24 &&
        candidateRect.left < window.innerWidth * 0.62;
    }).map((candidateRect) => {
      return candidateRect.right;
    }).sort((a, b) => a - b);

    if (!rightEdges.length) return null;
    return rightEdges[Math.floor(rightEdges.length / 2)];
  }

  function isInsideExtension(element) {
    return element.id === ROOT_ID || Boolean(element.closest?.(`#${ROOT_ID}`));
  }

  function isInsideMessage(element) {
    return Boolean(element.closest?.("[data-message-author-role]"));
  }

  function scheduleUpdate() {
    clearTimeout(state.mutationTimer);
    state.mutationTimer = setTimeout(updateOutline, UPDATE_DELAY_MS);
  }

  function scheduleScrollUpdate() {
    clearTimeout(state.scrollTimer);
    state.scrollTimer = setTimeout(updateOutline, SCROLL_UPDATE_DELAY_MS);
  }

  function updateOutline() {
    hideNativeChatGptOutline();
    refreshScrollContainers();

    const nextItems = buildOutline();
    const nextSignature = getOutlineSignature(nextItems);
    const outlineChanged = nextSignature !== state.outlineSignature;
    const targetsChanged = !haveSameOutlineTargets(state.items, nextItems);

    state.items = nextItems;
    state.outlineSignature = nextSignature;

    if (!state.items.some((item) => item.id === state.activeId)) {
      state.activeId = null;
      state.activeLockedUntil = 0;
    }

    if (!isActiveLocked()) {
      state.activeId = getActiveIdByPosition() || state.activeId;
    }

    if (outlineChanged) {
      renderOutline();
    } else {
      syncActiveElements();
    }

    if (outlineChanged || targetsChanged) {
      observeHeadings();
    } else if (!isActiveLocked()) {
      updateActiveByPosition();
    }
  }

  function getOutlineSignature(items) {
    return items.map((item) => {
      return `${item.id}\u0000${item.level}\u0000${item.title}`;
    }).join("\u0001");
  }

  function haveSameOutlineTargets(previousItems, nextItems) {
    if (previousItems.length !== nextItems.length) return false;

    return previousItems.every((item, index) => {
      const nextItem = nextItems[index];
      return item.id === nextItem.id &&
        item.element === nextItem.element;
    });
  }

  function refreshScrollContainers() {
    const nextContainers = new Set();

    Array.from(document.body?.querySelectorAll("*") || []).forEach((element) => {
      if (isScrollableElement(element)) {
        nextContainers.add(element);
      }
    });

    state.scrollContainers.forEach((element) => {
      if (nextContainers.has(element) && element.isConnected) return;
      element.removeEventListener("scroll", scheduleScrollUpdate, true);
      state.scrollContainers.delete(element);
    });

    nextContainers.forEach((element) => {
      if (state.scrollContainers.has(element)) return;
      element.addEventListener("scroll", scheduleScrollUpdate, {
        capture: true,
        passive: true
      });
      state.scrollContainers.add(element);
    });
  }

  function isScrollableElement(element) {
    if (!element || element === document.body || element === document.documentElement) return false;
    if (isInsideExtension(element)) return false;

    const style = window.getComputedStyle(element);
    if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false;

    return element.scrollHeight > element.clientHeight + 5;
  }

  function buildOutline() {
    const roots = findAssistantContentRoots();
    const headingElements = [];

    roots.forEach((root) => {
      const candidates = getHeadingCandidates(root);

      candidates.forEach((element) => {
        if (!isUsableCandidate(element)) return;
        headingElements.push(element);
      });
    });

    const countsByHeading = new Map();
    const items = uniqueElementsByIdentity(headingElements)
      .sort(compareDocumentOrder)
      .map((element) => {
        const heading = classifyHeading(element);
        if (!heading) return null;

        const headingKey = `${heading.level}-${heading.title}`;
        const occurrence = countsByHeading.get(headingKey) || 0;
        countsByHeading.set(headingKey, occurrence + 1);

        const id = getStableOutlineKey(heading, occurrence);
        element.dataset.cgptOutlineId = id;

        return {
          id,
          title: heading.title,
          level: heading.level,
          element
        };
      })
      .filter(Boolean);

    return items.slice(0, MAX_ITEMS);
  }

  function getStableOutlineKey(heading, occurrence) {
    return `cgpt-outline-h-${hashString(`${heading.level}-${heading.title}`)}-${occurrence}`;
  }

  function findAssistantContentRoots() {
    const main = document.querySelector("main") || document.body;
    const assistantNodes = Array.from(
      main.querySelectorAll('[data-message-author-role="assistant"]')
    ).filter((element) => {
      return !element.closest(`#${ROOT_ID}`) && !element.closest('[data-message-author-role="user"]');
    });

    const primaryRoots = assistantNodes
      .flatMap((element) => {
        const markdownRoots = Array.from(
          element.querySelectorAll(".markdown, [data-testid='markdown'], .prose")
        );
        return markdownRoots.length ? markdownRoots : [element];
      })
      .filter(hasOutlineCandidates);

    if (primaryRoots.length) return uniqueOuterElements(primaryRoots);

    const fallbackRoots = Array.from(
      main.querySelectorAll(".markdown, [data-testid='markdown'], .prose, [class*='markdown']")
    ).filter((element) => {
      if (element.closest(`#${ROOT_ID}`)) return false;
      if (element.closest('[data-message-author-role="user"]')) return false;
      return hasOutlineCandidates(element);
    });

    return uniqueOuterElements(fallbackRoots);
  }

  function hasOutlineCandidates(root) {
    if (!isVisible(root)) return false;
    return Boolean(root.querySelector("h1,h2,h3"));
  }

  function getHeadingCandidates(root) {
    const headingSelector = getPrimaryHeadingSelector(root);

    return Array.from(root.querySelectorAll(headingSelector)).filter((element) => {
      return !element.closest('[data-message-author-role="user"]');
    });
  }

  function getPrimaryHeadingSelector(root) {
    if (root.querySelector("h1")) return "h1";
    if (root.querySelector("h2")) return "h2";
    return "h3";
  }

  function isUsableCandidate(element) {
    if (!isVisible(element)) return false;
    if (element.closest(`#${ROOT_ID}`)) return false;
    if (element.closest("pre, code, table, blockquote")) return false;
    if (element.closest('[data-message-author-role="user"]')) return false;
    return true;
  }

  function classifyHeading(element) {
    const tag = element.tagName.toLowerCase();
    const text = normalizeText(element.innerText || element.textContent || "");
    if (!text || text.length < 2) return null;

    if (tag === "h1" || tag === "h2" || tag === "h3") {
      return {
        level: 1,
        title: truncate(stripMarkdownPrefix(text), 88)
      };
    }

    return null;
  }

  function renderOutline() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    root.classList.toggle("is-empty", state.items.length === 0);

    const rail = root.querySelector(".cgpt-outline__rail");
    const card = root.querySelector(".cgpt-outline__card");
    if (!rail || !card) return;

    if (!state.items.length) {
      rail.innerHTML = "";
      card.innerHTML = "";
      return;
    }

    rail.innerHTML = state.items.map((item) => {
      return `
        <button
          class="cgpt-outline__bar cgpt-outline__bar--level-${barLevel(item.level)} ${state.activeId === item.id ? "is-active" : ""}"
          type="button"
          data-outline-id="${escapeAttr(item.id)}"
          aria-label="${escapeAttr(item.title)}"
          title="${escapeAttr(item.title)}"
        ></button>
      `;
    }).join("");

    card.innerHTML = state.items.map((item) => {
      return `
        <button
          class="cgpt-outline__item cgpt-outline__item--level-${item.level} ${state.activeId === item.id ? "is-active" : ""}"
          type="button"
          data-outline-id="${escapeAttr(item.id)}"
          title="${escapeAttr(item.title)}"
        >
          ${escapeHtml(item.title)}
        </button>
      `;
    }).join("");

    syncActiveElements();
  }

  function handleOutlineClick(event) {
    const target = event.currentTarget?.matches?.("[data-outline-id]")
      ? event.currentTarget
      : event.target.closest("[data-outline-id]");
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();

    const item = resolveOutlineItem(target);
    if (!item?.element?.isConnected) return;

    setActive(item.id, { lock: true, scrollCard: true });
    scrollToElement(item.element, item.id);
  }

  function resolveOutlineItem(target) {
    const outlineId = target.dataset.outlineId;
    const title = normalizeText(target.getAttribute("title") || target.innerText || target.textContent || "");
    let item = findItemById(outlineId);
    if (item?.element?.isConnected) return item;

    updateOutline();
    item = findItemById(outlineId);
    if (item?.element?.isConnected) return item;

    return state.items.find((candidate) => {
      return candidate.element?.isConnected && normalizeText(candidate.title) === title;
    }) || null;
  }

  function observeHeadings() {
    if (state.intersectionObserver) {
      state.intersectionObserver.disconnect();
    }

    if (!state.items.length) {
      state.activeId = null;
      state.activeLockedUntil = 0;
      return;
    }

    if (!isActiveLocked()) {
      updateActiveByPosition();
    }
  }

  function onHeadingIntersections(entries) {
    if (isActiveLocked()) return;

    const visibleEntry = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

    if (visibleEntry) {
      const item = state.items.find((candidate) => candidate.element === visibleEntry.target);
      if (item) {
        setActive(item.id);
        return;
      }
    }

    updateActiveByPosition();
  }

  function updateActiveByPosition() {
    if (!state.items.length) return;
    if (isActiveLocked()) return;

    const activeId = getActiveIdByPosition();
    if (activeId) setActive(activeId, { scrollCard: false });
  }

  function getActiveIdByPosition() {
    if (!state.items.length) return null;

    const anchor = Math.max(96, window.innerHeight * 0.22);
    let current = null;
    let firstVisibleAfterAnchor = null;

    state.items.forEach((item) => {
      if (!item.element?.isConnected) return;
      const rect = item.element.getBoundingClientRect();
      if (!Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) return;

      if (rect.top <= anchor) {
        current = item;
        return;
      }

      if (!firstVisibleAfterAnchor && rect.top <= window.innerHeight && rect.bottom >= 0) {
        firstVisibleAfterAnchor = item;
      }
    });

    return current?.id || firstVisibleAfterAnchor?.id || null;
  }

  function setActive(id, options = {}) {
    if (options.lock) {
      state.activeLockedUntil = window.performance.now() + ACTIVE_LOCK_MS;
    }

    if (state.activeId === id) {
      syncActiveElements({ scrollCard: options.scrollCard === true });
      return;
    }

    state.activeId = id;
    syncActiveElements({ scrollCard: options.scrollCard === true });
  }

  function syncActiveElements(options = {}) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    root.querySelectorAll(".is-active").forEach((element) => {
      element.classList.remove("is-active");
    });

    if (!state.activeId) return;

    root.querySelectorAll(`[data-outline-id="${cssEscape(state.activeId)}"]`).forEach((element) => {
      element.classList.add("is-active");
    });

    const activeItem = root.querySelector(`.cgpt-outline__item[data-outline-id="${cssEscape(state.activeId)}"]`);
    if (activeItem && options.scrollCard) {
      activeItem.scrollIntoView({
        block: "nearest"
      });
    }
  }

  function isActiveLocked() {
    if (!state.activeId) return false;
    if (window.performance.now() >= state.activeLockedUntil) return false;

    const activeItem = findItemById(state.activeId);
    return Boolean(activeItem?.element?.isConnected);
  }

  function findItemById(id) {
    return state.items.find((item) => item.id === id);
  }

  function scrollToElement(element, activeId) {
    if (state.scrollAnimationFrame) {
      window.cancelAnimationFrame(state.scrollAnimationFrame);
    }

    const scroller = findScrollContainer(element);
    const isWindowScroller = scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body;
    const startY = isWindowScroller ? window.scrollY || window.pageYOffset : scroller.scrollTop;
    const elementRect = element.getBoundingClientRect();
    const scrollerRect = isWindowScroller
      ? { top: 0 }
      : scroller.getBoundingClientRect();
    const targetY = startY + elementRect.top - scrollerRect.top - getJumpTopOffset();
    const distance = targetY - startY;
    const startTime = window.performance.now();

    function step(now) {
      const progress = Math.min((now - startTime) / JUMP_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextY = startY + distance * eased;

      if (isWindowScroller) {
        window.scrollTo(0, nextY);
      } else {
        scroller.scrollTop = nextY;
      }

      if (progress < 1) {
        state.scrollAnimationFrame = window.requestAnimationFrame(step);
      } else {
        state.scrollAnimationFrame = null;
        if (activeId && state.activeId === activeId) {
          state.activeLockedUntil = 0;
          updateActiveByPosition();
        }
      }
    }

    state.scrollAnimationFrame = window.requestAnimationFrame(step);
  }

  function findScrollContainer(element) {
    let current = element.parentElement;

    while (current && current !== document.body && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY);

      if (canScrollY && current.scrollHeight > current.clientHeight + 1) {
        return current;
      }

      current = current.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function getJumpTopOffset() {
    const topObstructionBottom = Array.from(document.body.querySelectorAll("*")).reduce((maxBottom, element) => {
      if (element.id === ROOT_ID) return maxBottom;
      if (element.closest(`#${ROOT_ID}`)) return maxBottom;

      const style = window.getComputedStyle(element);
      if (style.position !== "fixed" && style.position !== "sticky") return maxBottom;

      const rect = element.getBoundingClientRect();
      const isTopBar = rect.top <= 8 &&
        rect.bottom > 0 &&
        rect.height >= 24 &&
        rect.height <= 180 &&
        rect.width >= window.innerWidth * 0.45;

      return isTopBar ? Math.max(maxBottom, rect.bottom) : maxBottom;
    }, 0);

    return Math.max(MIN_JUMP_TOP_OFFSET, Math.ceil(topObstructionBottom + JUMP_TOP_GAP));
  }

  function ensureTargetId(element, preferredId) {
    if (!element.dataset.cgptOutlineId) {
      element.dataset.cgptOutlineId = makeUniqueId(preferredId);
    }
    return element.dataset.cgptOutlineId;
  }

  function makeUniqueId(base) {
    const safeBase = base.replace(/[^a-zA-Z0-9_-]/g, "-");
    let id = safeBase;
    let i = 1;

    while (document.querySelector(`[data-cgpt-outline-id="${cssEscape(id)}"]`)) {
      i += 1;
      id = `${safeBase}-${i}`;
    }

    return id;
  }

  function uniqueElementsByIdentity(elements) {
    const seen = new Set();

    return elements.filter((element) => {
      if (seen.has(element)) return false;
      seen.add(element);
      return true;
    });
  }

  function compareDocumentOrder(a, b) {
    const position = a.compareDocumentPosition(b);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }

  function uniqueOuterElements(elements) {
    const unique = [];

    elements.forEach((element) => {
      if (unique.some((existing) => existing === element || existing.contains(element))) return;
      for (let i = unique.length - 1; i >= 0; i -= 1) {
        if (element.contains(unique[i])) unique.splice(i, 1);
      }
      unique.push(element);
    });

    return unique.sort(compareDocumentOrder);
  }

  function barLevel(level) {
    if (level <= 1) return 1;
    if (level === 2) return 2;
    return 3;
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden";
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  function truncate(text, maxLength) {
    const normalized = normalizeText(text);
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1)}…`;
  }

  function stripMarkdownPrefix(text) {
    return normalizeText(text).replace(/^#{1,6}\s*/, "");
  }

  function hashString(value) {
    let hash = 5381;
    const text = String(value);

    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    }

    return (hash >>> 0).toString(36);
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("\n", " ");
  }
})();
