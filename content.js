(() => {
  "use strict";

  const ROOT_ID = "cgpt-outline-root";
  const UPDATE_DELAY_MS = 450;
  const JUMP_DURATION_MS = 260;
  const MIN_JUMP_TOP_OFFSET = 88;
  const JUMP_TOP_GAP = 36;
  const MAX_ITEMS = 80;
  const NATIVE_OUTLINE_STYLE_ID = "cgpt-native-outline-blocker-style";
  const NATIVE_OUTLINE_HIDDEN_ATTR = "data-cgpt-native-outline-hidden";
  const NATIVE_OUTLINE_BLOCK_DELAY_MS = 120;
  const USER_PROMPT_OUTLINE_MIN_MATCHES = 2;
  const USER_PROMPT_SNIPPET_MIN_LENGTH = 6;
  const USER_PROMPT_SNIPPET_MAX_LENGTH = 48;
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
    mutationObserver: null,
    intersectionObserver: null,
    scrollAnimationFrame: null
  };

  init();

  function init() {
    if (document.getElementById(ROOT_ID)) return;

    injectNativeOutlineBlockerStyle();
    hideNativeChatGptOutline();
    injectOutline();
    updateOutline();
    observePageChanges();
  }

  function injectOutline() {
    const root = document.createElement("aside");
    root.id = ROOT_ID;
    root.className = "cgpt-outline";
    root.setAttribute("aria-label", "Assistant response outline");
    root.innerHTML = `
      <div class="cgpt-outline__rail" aria-hidden="false"></div>
      <nav class="cgpt-outline__card" aria-label="Assistant headings"></nav>
    `;

    document.documentElement.appendChild(root);

    root.addEventListener("click", (event) => {
      const target = event.target.closest("[data-outline-id]");
      if (!target) return;

      const item = findItemById(target.dataset.outlineId);
      if (!item?.element?.isConnected) return;

      scrollToElement(item.element);
      setActive(item.id);
    });
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

  function injectNativeOutlineBlockerStyle() {
    if (document.getElementById(NATIVE_OUTLINE_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = NATIVE_OUTLINE_STYLE_ID;
    style.textContent = `
      [${NATIVE_OUTLINE_HIDDEN_ATTR}="true"],
      body [data-testid="conversation-outline"],
      body [data-testid="thread-outline"],
      body [data-testid="conversation-toc"],
      body [data-testid="table-of-contents"],
      body [aria-label="Outline" i]:not(#${ROOT_ID}),
      body [aria-label="Conversation outline" i],
      body [aria-label="Thread outline" i],
      body [aria-label="Table of contents" i],
      body [aria-label="大纲"],
      body [aria-label="目录"] {
        display: none !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function hideNativeChatGptOutline() {
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

    const promptOutlineCandidates = Array.from(document.body.querySelectorAll([
      "aside",
      "nav",
      '[role="navigation"]',
      '[role="complementary"]',
      "[data-testid]",
      "[aria-label]",
      "div"
    ].join(","))).filter(isNativeUserPromptOutlineLikeContainer);

    return uniqueOuterElements(exactSelectorCandidates.concat(containerCandidates, promptOutlineCandidates))
      .filter((element) => !isInsideExtension(element) && !isInsideMessage(element));
  }

  function getNativeOutlineHideTarget(element) {
    if (!element || isInsideExtension(element) || isInsideMessage(element)) return null;

    if (isNativeOutlineLikeContainer(element)) return element;

    const sidePanel = findSidePanelAncestor(element);
    if (sidePanel) return sidePanel;

    let current = element.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
      if (isInsideExtension(current) || isInsideMessage(current)) return null;
      if (isNativeOutlineLikeContainer(current)) return current;
      current = current.parentElement;
    }

    return hasNativeOutlineSignal(element) ? element : null;
  }

  function findSidePanelAncestor(element) {
    let current = element.parentElement;

    while (current && current !== document.body && current !== document.documentElement) {
      if (isInsideExtension(current) || isInsideMessage(current)) return null;
      if (isSidePanelContainer(current)) return current;
      current = current.parentElement;
    }

    return null;
  }

  function isNativeOutlineLikeContainer(element) {
    if (!element || isInsideExtension(element) || isInsideMessage(element)) return false;
    if (!hasNativeOutlineSignal(element) && !hasUserPromptOutlineSignal(element)) return false;

    const tag = element.tagName.toLowerCase();
    const role = (element.getAttribute("role") || "").toLowerCase();
    const isSemanticNav = tag === "aside" ||
      tag === "nav" ||
      role === "navigation" ||
      role === "complementary";

    return isSemanticNav || isFixedOrStickySidePanel(element);
  }

  function isSidePanelContainer(element) {
    const tag = element.tagName.toLowerCase();
    const role = (element.getAttribute("role") || "").toLowerCase();
    const isSemanticNav = tag === "aside" ||
      tag === "nav" ||
      role === "navigation" ||
      role === "complementary";

    return (isSemanticNav && (hasNativeOutlineSignal(element) || hasUserPromptOutlineSignal(element))) ||
      isFixedOrStickySidePanel(element);
  }

  function isNativeUserPromptOutlineLikeContainer(element) {
    if (!element || isInsideExtension(element) || isInsideMessage(element)) return false;
    if (!isVisible(element)) return false;
    if (!isFixedOrStickySidePanel(element)) return false;
    return getUserPromptMatchCount(element) > 0;
  }

  function hasNativeOutlineSignal(element) {
    const signal = normalizeText([
      element.getAttribute("aria-label"),
      element.getAttribute("data-testid"),
      element.getAttribute("id"),
      element.className,
      element.innerText,
      element.textContent
    ].filter(Boolean).join(" ")).toLowerCase();

    return NATIVE_OUTLINE_TERMS.some((term) => signal.includes(term));
  }

  function hasUserPromptOutlineSignal(element) {
    return getUserPromptMatchCount(element) >= USER_PROMPT_OUTLINE_MIN_MATCHES;
  }

  function getUserPromptMatchCount(element) {
    const userSnippets = getUserPromptSnippets();
    if (!userSnippets.length) return 0;

    const text = normalizeForPromptMatch(element.innerText || element.textContent || "");
    if (!text) return 0;

    let matches = 0;
    for (const snippets of userSnippets) {
      if (!snippets.some((snippet) => snippet && text.includes(snippet))) continue;
      matches += 1;
      if (matches >= USER_PROMPT_OUTLINE_MIN_MATCHES) return matches;
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

  function normalizeForPromptMatch(text) {
    return normalizeText(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isFixedOrStickySidePanel(element) {
    const style = window.getComputedStyle(element);
    if (style.position !== "fixed" && style.position !== "sticky") return false;

    const rect = element.getBoundingClientRect();
    const isSideAligned = rect.right >= window.innerWidth - 360 || rect.left <= 360;
    const isPanelSized = rect.width >= 24 &&
      rect.width <= 420 &&
      rect.height >= 24 &&
      rect.height <= window.innerHeight;

    return isSideAligned && isPanelSized;
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

  function updateOutline() {
    state.items = buildOutline();
    renderOutline();
    observeHeadings();
  }

  function buildOutline() {
    const roots = findAssistantContentRoots();
    const items = [];
    const seen = new Set();

    roots.forEach((root, rootIndex) => {
      const candidates = getHeadingCandidates(root);

      candidates.forEach((element, elementIndex) => {
        if (!isUsableCandidate(element)) return;

        const heading = classifyHeading(element);
        if (!heading) return;

        const key = `${heading.level}-${heading.title}`;
        if (seen.has(key)) return;
        seen.add(key);

        const id = ensureTargetId(element, `cgpt-outline-h-${rootIndex}-${elementIndex}`);
        items.push({
          id,
          title: heading.title,
          level: heading.level,
          element
        });
      });
    });

    return items.slice(0, MAX_ITEMS);
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
  }

  function observeHeadings() {
    if (state.intersectionObserver) {
      state.intersectionObserver.disconnect();
    }

    if (!state.items.length) {
      state.activeId = null;
      return;
    }

    state.intersectionObserver = new IntersectionObserver(onHeadingIntersections, {
      root: null,
      rootMargin: "-18% 0px -68% 0px",
      threshold: [0, 1]
    });

    state.items.forEach((item) => {
      if (item.element?.isConnected) {
        state.intersectionObserver.observe(item.element);
      }
    });

    updateActiveByPosition();
  }

  function onHeadingIntersections(entries) {
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

    const anchor = Math.max(96, window.innerHeight * 0.22);
    let current = state.items[0];

    state.items.forEach((item) => {
      if (!item.element?.isConnected) return;
      const rect = item.element.getBoundingClientRect();
      if (rect.top <= anchor) current = item;
    });

    setActive(current.id);
  }

  function setActive(id) {
    if (state.activeId === id) return;

    state.activeId = id;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    root.querySelectorAll(".is-active").forEach((element) => {
      element.classList.remove("is-active");
    });

    root.querySelectorAll(`[data-outline-id="${cssEscape(id)}"]`).forEach((element) => {
      element.classList.add("is-active");
    });

    const activeItem = root.querySelector(`.cgpt-outline__item[data-outline-id="${cssEscape(id)}"]`);
    if (activeItem) {
      activeItem.scrollIntoView({
        block: "nearest"
      });
    }
  }

  function findItemById(id) {
    return state.items.find((item) => item.id === id);
  }

  function scrollToElement(element) {
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

  function uniqueOuterElements(elements) {
    const unique = [];

    elements.forEach((element) => {
      if (unique.some((existing) => existing === element || existing.contains(element))) return;
      for (let i = unique.length - 1; i >= 0; i -= 1) {
        if (element.contains(unique[i])) unique.splice(i, 1);
      }
      unique.push(element);
    });

    return unique.sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
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
