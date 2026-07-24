/* global window, document, Element, fetch, console, DEBUG_CONFIG */
export function installDebugClick() {
  let isInspectMode = false;
  let currentHoveredEl = null;
  let lastHoveredEl = null;
  let originalTitle = null;
  let badge = null;
  let outlineEl = null;

  let fiberStack = [];
  let fiberIndex = 0;
  let hasScrolled = false;

  function getOrCreateBadge() {
    if (badge) return badge;
    badge = document.getElementById("debug-inspect-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "debug-inspect-badge";
      badge.style.position = "fixed";
      badge.style.pointerEvents = "none";
      badge.style.zIndex = DEBUG_CONFIG.badgeZIndex;
      badge.style.backgroundColor = DEBUG_CONFIG.badgeBgColor;
      badge.style.color = DEBUG_CONFIG.badgeTextColor;
      badge.style.padding = DEBUG_CONFIG.badgePadding;
      badge.style.borderRadius = DEBUG_CONFIG.badgeBorderRadius;
      badge.style.fontSize = DEBUG_CONFIG.badgeFontSize;
      badge.style.fontWeight = DEBUG_CONFIG.badgeFontWeight;
      badge.style.fontFamily = DEBUG_CONFIG.badgeFontFamily;
      badge.style.boxShadow = DEBUG_CONFIG.badgeBoxShadow;
      badge.style.display = "none";
      if (document.body) {
        document.body.appendChild(badge);
      }
    }
    return badge;
  }

  function getOrCreateOutline() {
    if (outlineEl) return outlineEl;
    outlineEl = document.getElementById("debug-inspect-outline");
    if (!outlineEl) {
      outlineEl = document.createElement("div");
      outlineEl.id = "debug-inspect-outline";
      outlineEl.style.position = "fixed";
      outlineEl.style.pointerEvents = "none";
      outlineEl.style.zIndex = DEBUG_CONFIG.outlineZIndex;
      outlineEl.style.transition = DEBUG_CONFIG.outlineTransition;
      outlineEl.style.display = "none";
      if (document.body) {
        document.body.appendChild(outlineEl);
      }
    }
    return outlineEl;
  }

  function restoreLastHoveredElTitle() {
    if (lastHoveredEl) {
      if (originalTitle !== null) {
        lastHoveredEl.setAttribute("title", originalTitle);
      } else {
        lastHoveredEl.removeAttribute("title");
      }
      lastHoveredEl = null;
      originalTitle = null;
    }
  }

  function getReactFiber(el) {
    if (!el) return null;
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    return el[key];
  }

  function buildFiberStack(el) {
    const stack = [];
    if (el) {
      const baseFile = el.getAttribute("data-debug-file");
      const baseComp = el.getAttribute("data-debug-component") || "";
      if (baseFile) stack.push({ file: baseFile, comp: baseComp, domNode: el });

      let currentDOMNode = el;
      let fiber = getReactFiber(el);
      while (fiber) {
        if (fiber.stateNode instanceof Element) {
          currentDOMNode = fiber.stateNode;
        }
        if (fiber.memoizedProps && fiber.memoizedProps["data-debug-file"]) {
          const file = fiber.memoizedProps["data-debug-file"];
          if (file.includes("node_modules") || file.includes("chunk-")) {
            fiber = fiber.return;
            continue;
          }
          const comp = fiber.memoizedProps["data-debug-component"] || "";
          if (!stack.some((x) => x.file === file)) {
            stack.push({ file, comp, domNode: currentDOMNode });
          }
        }
        fiber = fiber.return;
      }
    }
    return stack;
  }

  function updateBadgePosition() {
    const b = getOrCreateBadge();
    if (!b) return;

    if (!isInspectMode || !currentHoveredEl || fiberStack.length === 0) {
      b.style.display = "none";
      if (outlineEl) outlineEl.style.display = "none";
      return;
    }

    const rect = currentHoveredEl.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    // function getBaseComponentName(c) {
    //   if (!c) return "";
    //   return c.split(" (")[0];
    // }

    function getTagNameOnly(c) {
      if (!c) return "el";
      const match = c.match(/\(([^)]+)\)/);
      return match ? match[1] : c;
    }

    const currentItem = fiberStack[fiberIndex];
    const sizeText = `${width} × ${height}`;
    // const currentFile = currentItem.file.split("/").pop().split("#")[0] || "";
    // const baseCompName = getBaseComponentName(currentItem.comp);

    let html = `<div>${sizeText} | ${currentItem.comp ? ` ${currentItem.comp}` : ""}</div>`;

    if (hasScrolled && fiberStack.length > 1) {
      const breadcrumbs = fiberStack
        .map((s, i) => {
          const name = getTagNameOnly(s.comp);
          return i === fiberIndex
            ? `<span style="color: ${DEBUG_CONFIG.activeBreadcrumbColor}; background: ${DEBUG_CONFIG.activeBreadcrumbBg}; padding: ${DEBUG_CONFIG.breadcrumbPadding}; border-radius: ${DEBUG_CONFIG.breadcrumbBorderRadius}; font-size: ${DEBUG_CONFIG.activeBreadcrumbFontSize}; font-weight: ${DEBUG_CONFIG.breadcrumbFontWeight}; display: inline-block; border: ${DEBUG_CONFIG.activeBreadcrumbBorder}; line-height: ${DEBUG_CONFIG.breadcrumbLineHeight};">${name}</span>`
            : `<span style="color: ${DEBUG_CONFIG.inactiveBreadcrumbColor}; padding: ${DEBUG_CONFIG.breadcrumbPadding}; border-radius: ${DEBUG_CONFIG.breadcrumbBorderRadius}; font-size: ${DEBUG_CONFIG.inactiveBreadcrumbFontSize}; font-weight: ${DEBUG_CONFIG.breadcrumbFontWeight}; opacity: ${DEBUG_CONFIG.inactiveBreadcrumbOpacity}; display: inline-block; border: ${DEBUG_CONFIG.inactiveBreadcrumbBorder}; line-height: ${DEBUG_CONFIG.breadcrumbLineHeight};">${name}</span>`;
        })
        .reverse()
        .join(
          ` <span style="color: ${DEBUG_CONFIG.separatorColor}; opacity: ${DEBUG_CONFIG.separatorOpacity}; margin: ${DEBUG_CONFIG.separatorMargin};">&gt;</span> `,
        );

      html = `
        <div style="line-height: ${DEBUG_CONFIG.breadcrumbsLineHeight}; padding-bottom: ${DEBUG_CONFIG.breadcrumbsPaddingBottom}; margin-bottom: ${DEBUG_CONFIG.breadcrumbsMarginBottom}; border-bottom: ${DEBUG_CONFIG.breadcrumbsBorderBottom}; max-width: ${DEBUG_CONFIG.breadcrumbsMaxWidth}; overflow-wrap: break-word;">
          ${breadcrumbs}
        </div>
        ${html}
      `;
    }

    b.innerHTML = html;

    if (currentHoveredEl) {
      currentHoveredEl.setAttribute("title", currentItem.file);
    }

    b.style.display = "block";
    const badgeHeight = b.offsetHeight || DEBUG_CONFIG.badgeHeightFallback;
    const badgeWidth = b.offsetWidth || DEBUG_CONFIG.badgeWidthFallback;

    let badgeTop = rect.top - badgeHeight - DEBUG_CONFIG.badgeTopGap;
    if (badgeTop < 0) {
      badgeTop = rect.bottom + DEBUG_CONFIG.badgeTopGap;
    }
    let badgeLeft = rect.left;
    if (badgeLeft + badgeWidth > window.innerWidth) {
      badgeLeft = window.innerWidth - badgeWidth - DEBUG_CONFIG.badgeScreenMargin;
    }
    if (badgeLeft < 0) badgeLeft = DEBUG_CONFIG.badgeMinLeft;

    b.style.top = `${badgeTop}px`;
    b.style.left = `${badgeLeft}px`;

    updateOutlinePosition();
  }

  function updateOutlinePosition() {
    const o = getOrCreateOutline();
    if (!o) return;

    const currentItem = fiberStack[fiberIndex];
    if (!isInspectMode || !currentItem || !currentItem.domNode || !hasScrolled) {
      o.style.display = "none";
      return;
    }

    const rect = currentItem.domNode.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      o.style.display = "none";
      return;
    }

    o.style.left = `${rect.left}px`;
    o.style.top = `${rect.top}px`;
    o.style.width = `${rect.width}px`;
    o.style.height = `${rect.height}px`;
    o.style.border = DEBUG_CONFIG.activeOutlineStyle || "2px dashed rgba(59, 130, 246, 0.9)";
    o.style.display = "block";
  }

  function updateInspectMode(e) {
    const isInspect = !!(e && e.ctrlKey && e.shiftKey);
    if (isInspect !== isInspectMode) {
      isInspectMode = isInspect;
      if (isInspect) {
        document.documentElement.classList.add("debug-inspect-mode");
      } else {
        document.documentElement.classList.remove("debug-inspect-mode");
        restoreLastHoveredElTitle();
        currentHoveredEl = null;
        if (outlineEl) outlineEl.style.display = "none";
        fiberStack = [];
        fiberIndex = 0;
        hasScrolled = false;
        updateBadgePosition();
      }
    }
  }

  function handleMouseMove(e) {
    if (!isInspectMode) return;
    const target = e.target;
    const el = target && target.closest && target.closest("[data-debug-file]");

    if (el !== currentHoveredEl) {
      restoreLastHoveredElTitle();
      currentHoveredEl = el;
      if (el) {
        originalTitle = el.getAttribute("title");
        lastHoveredEl = el;

        fiberStack = buildFiberStack(el);
        fiberIndex = 0;
        hasScrolled = false;
      } else {
        fiberStack = [];
        fiberIndex = 0;
      }
    }
    updateBadgePosition();
  }

  window.addEventListener("keydown", updateInspectMode, true);
  window.addEventListener("keyup", updateInspectMode, true);
  window.addEventListener(
    "mousemove",
    (e) => {
      updateInspectMode(e);
      handleMouseMove(e);
    },
    true,
  );

  window.addEventListener(
    "wheel",
    (e) => {
      if (!isInspectMode || fiberStack.length <= 1) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.deltaY < 0) {
        fiberIndex = Math.min(fiberStack.length - 1, fiberIndex + 1);
      } else {
        fiberIndex = Math.max(0, fiberIndex - 1);
      }
      hasScrolled = true;
      updateBadgePosition();
    },
    { capture: true, passive: false },
  );

  window.addEventListener(
    "scroll",
    () => {
      if (isInspectMode && currentHoveredEl) {
        updateBadgePosition();
      }
    },
    { capture: true, passive: true },
  );

  window.addEventListener(
    "blur",
    () => {
      if (isInspectMode) {
        isInspectMode = false;
        document.documentElement.classList.remove("debug-inspect-mode");
        restoreLastHoveredElTitle();
        currentHoveredEl = null;
        if (outlineEl) outlineEl.style.display = "none";
        fiberStack = [];
        fiberIndex = 0;
        updateBadgePosition();
      }
    },
    true,
  );

  window.addEventListener(
    "click",
    (e) => {
      if (e.ctrlKey && e.shiftKey) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();

        if (currentHoveredEl && fiberStack.length > 0) {
          const debugFile = fiberStack[fiberIndex].file;
          if (debugFile) {
            const [filePath, lineStr] = debugFile.split("#");
            const lineNo = lineStr ? lineStr.split(",")[0].split(":")[0] : "1";
            const fileToOpen = `${filePath}:${lineNo}:1`;

            fetch(`/__open-in-editor?file=${encodeURIComponent(fileToOpen)}`).catch(() => {
              console.warn("Open in editor failed");
            });

            if (badge) badge.style.display = "none";
            if (outlineEl) outlineEl.style.display = "none";
            document.documentElement.classList.remove("debug-inspect-mode");
            isInspectMode = false;
            currentHoveredEl = null;
          }
        }
      }
    },
    true,
  );
}
