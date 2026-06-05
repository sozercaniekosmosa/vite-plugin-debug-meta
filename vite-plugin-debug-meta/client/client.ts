/// <reference lib="dom" />
/* eslint-disable @typescript-eslint/no-explicit-any */
export function installDebugClick() {
  (window as any).__renderVisualizerEnabled = localStorage.getItem("debug-render-visualizer") === "true";

  (globalThis as any).__traceRender = function (React: any, _componentName: string, _filePath: string, instanceId: string) {
    try {
      const lastTimeRef = React.useRef(0);
      const heatRef = React.useRef(0);

      React.useEffect(() => {
        // Initialize global stats store
        (window as any).__debugRenderStats = (window as any).__debugRenderStats || {};

        const now = performance.now();
        const elapsed = now - lastTimeRef.current;
        lastTimeRef.current = now;

        let heat = heatRef.current;
        if (elapsed > 0) {
          heat = Math.max(0, heat - elapsed / 1500);
        }
        heat = Math.min(1.0, heat + 0.35);
        heatRef.current = heat;

        const hue = Math.round(120 - heat * 120);

        // Update stats
        const stats = (window as any).__debugRenderStats[_componentName] || { count: 0, heat: 0, hue: 120 };
        stats.count++;
        stats.heat = heat;
        stats.hue = hue;
        (window as any).__debugRenderStats[_componentName] = stats;

        if (!(window as any).__renderVisualizerEnabled) {
          return;
        }

        if (instanceId) {
          const domNodes = document.querySelectorAll(`[data-debug-id="${instanceId}"]`);
          domNodes.forEach((el: any) => {
            if (el && el.classList) {
              el.classList.remove("debug-render-flash");
              el.offsetHeight; // trigger reflow
              el.style.setProperty("--flash-color", `hsla(${hue}, 100%, 50%, 0.85)`);
              el.classList.add("debug-render-flash");

              if ((el as any)._debugFlashTimeout) {
                clearTimeout((el as any)._debugFlashTimeout);
              }
              (el as any)._debugFlashTimeout = setTimeout(() => {
                el.classList.remove("debug-render-flash");
                delete (el as any)._debugFlashTimeout;
              }, 800);
            }
          });
        }
      });
    } catch (err) {
      // Ignore hook errors
    }
  };

  function getStatsHTML(componentString: string, hideNumber = false): string {
    const parts = componentString.split(" > ");
    return parts
      .map((name) => {
        const cleanName = name.split(" ")[0].split("(")[0].trim();
        const stats = (window as any).__debugRenderStats?.[cleanName];
        if (stats && stats.count > 0) {
          let rating = "Нормально";
          if (stats.count > 10) {
            rating = "Критично (Много рендеров!)";
          } else if (stats.count > 5) {
            rating = "Подозрительно (Не очень)";
          } else if (stats.count > 2) {
            rating = "Умеренно";
          } else {
            rating = "Отлично";
          }
          const displayText = hideNumber ? "⚡" : `⚡ ${stats.count}`;
          const titleAttr = hideNumber ? "" : ` title="${rating} — Рендеров: ${stats.count}"`;
          return `<span class="debug-render-stat-badge" style="--badge-hue: ${stats.hue} !important;"${titleAttr}>${displayText}</span>`;
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }

  let currentInspectState = false;
  let currentHoveredEl: HTMLElement | null = null;
  let lastHoveredEl: HTMLElement | null = null;
  let originalTitle: string | null = null;
  let badge: HTMLElement | null = null;
  let activeMenu: HTMLElement | null = null;
  let gitTooltip: HTMLElement | null = null;

  function formatRelativeTime(timestampSec: any): string {
    if (!timestampSec) return "не коммитилось";
    const ms = parseInt(timestampSec, 10) * 1000;
    if (isNaN(ms) || ms <= 0) return "не коммитилось";
    const diff = Date.now() - ms;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (seconds < 60) return "только что";
    if (minutes === 1) return "1 минуту назад";
    if (minutes < 60) {
      if (minutes % 10 === 1 && minutes !== 11) return `${minutes} минуту назад`;
      if ([2,3,4].includes(minutes % 10) && ![12,13,14].includes(minutes)) return `${minutes} минуты назад`;
      return `${minutes} минут назад`;
    }
    if (hours === 1) return "1 час назад";
    if (hours < 24) {
      if (hours % 10 === 1 && hours !== 11) return `${hours} час назад`;
      if ([2,3,4].includes(hours % 10) && ![12,13,14].includes(hours)) return `${hours} часа назад`;
      return `${hours} часов назад`;
    }
    if (days === 1) return "вчера";
    if (days < 30) {
      if (days % 10 === 1 && days !== 11) return `${days} день назад`;
      if ([2,3,4].includes(days % 10) && ![12,13,14].includes(days)) return `${days} дня назад`;
      return `${days} дней назад`;
    }
    if (months === 1) return "1 месяц назад";
    if (months < 12) {
      if (months % 10 === 1 && months !== 11) return `${months} месяц назад`;
      if ([2,3,4].includes(months % 10) && ![12,13,14].includes(months)) return `${months} месяца назад`;
      return `${months} месяцев назад`;
    }
    if (years === 1) return "1 год назад";
    if (years % 10 === 1 && years !== 11) return `${years} год назад`;
    if ([2,3,4].includes(years % 10) && ![12,13,14].includes(years)) return `${years} года назад`;
    return `${years} лет назад`;
  }

  function getOrCreateGitTooltip(): HTMLElement {
    if (gitTooltip) return gitTooltip;
    gitTooltip = document.getElementById("debug-git-tooltip");
    if (!gitTooltip) {
      gitTooltip = document.createElement("div");
      gitTooltip.id = "debug-git-tooltip";
      gitTooltip.style.position = "fixed";
      gitTooltip.style.zIndex = "999999999";
      gitTooltip.style.pointerEvents = "none";
      gitTooltip.style.display = "none";
      document.body.appendChild(gitTooltip);
    }
    return gitTooltip;
  }

  function getOrCreateBadge(): HTMLElement | null {
    if (badge) return badge;
    badge = document.getElementById("debug-inspect-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "debug-inspect-badge";
      badge.style.position = "fixed";
      badge.style.pointerEvents = "none";
      badge.style.zIndex = "9999999";
      badge.style.backgroundColor = "#10B981";
      badge.style.color = "#ffffff";
      badge.style.padding = "3px 6px";
      badge.style.borderRadius = "4px";
      badge.style.fontSize = "11px";
      badge.style.fontWeight = "600";
      badge.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      badge.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
      badge.style.display = "none";
      if (document.body) {
        document.body.appendChild(badge);
      }
    }
    return badge;
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

  function updateBadgePosition() {
    const b = getOrCreateBadge();
    if (!b) return;

    if (!currentInspectState || !currentHoveredEl) {
      b.style.display = "none";
      return;
    }

    const rect = currentHoveredEl.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    const compName = currentHoveredEl.getAttribute("data-debug-component") || "";
    const sizeText = `${width} × ${height}`;
    b.textContent = compName ? `${compName} | ${sizeText}` : sizeText;

    let badgeTop = rect.top - 24;
    if (badgeTop < 0) {
      badgeTop = rect.top + 4;
    }
    let badgeLeft = rect.left;
    if (badgeLeft < 0) {
      badgeLeft = 4;
    }
    b.style.top = `${badgeTop}px`;
    b.style.left = `${badgeLeft}px`;
    b.style.display = "block";
  }

  function updateInspectMode(e: KeyboardEvent | MouseEvent) {
    const isInspect = !!(e && e.ctrlKey && e.shiftKey);
    if (isInspect !== currentInspectState) {
      currentInspectState = isInspect;
      if (isInspect) {
        document.documentElement.classList.add("debug-inspect-mode");
      } else {
        document.documentElement.classList.remove("debug-inspect-mode");
        restoreLastHoveredElTitle();
        currentHoveredEl = null;
        updateBadgePosition();
      }
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!currentInspectState) return;
    const target = e.target as HTMLElement | null;
    const el = target && target.closest && (target.closest("[data-debug-file]") as HTMLElement | null);
    if (el !== currentHoveredEl) {
      restoreLastHoveredElTitle();
      currentHoveredEl = el;
      if (el) {
        originalTitle = el.getAttribute("title");
        const file = el.getAttribute("data-debug-file");
        if (file) {
          el.setAttribute("title", file);
        }
        lastHoveredEl = el;
      }
    }
    updateBadgePosition();
  }

  function closeContextMenu(immediate = false) {
    const tooltip = document.getElementById("debug-git-tooltip");
    if (tooltip) {
      tooltip.classList.remove("active");
      tooltip.style.display = "none";
    }
    if (activeMenu) {
      const menuToClose = activeMenu;
      if (immediate) {
        menuToClose.remove();
        if (activeMenu === menuToClose) activeMenu = null;
      } else {
        menuToClose.classList.remove("active");
        setTimeout(() => {
          menuToClose.remove();
        }, 150);
        if (activeMenu === menuToClose) activeMenu = null;
      }
    }
  }

  function navigateToGroup(item: any, clientX: number, clientY: number, customLineNo?: number) {
    const fullPath = item.file.split("#")[0];
    const lineNosStr = item.file.split("#")[1] || "1";

    let lineNo: number | string;
    if (customLineNo !== undefined) {
      lineNo = customLineNo;
    } else {
      const parts = lineNosStr.split(",");
      let targetPart = parts[0];
      const preferredTypes = ["implementation", "usage", "mixed", "ancestor"];
      for (const prefType of preferredTypes) {
        const found = [...parts].reverse().find((part: any) => part.split(":")[1] === prefType);
        if (found) {
          targetPart = found;
          break;
        }
      }
      lineNo = targetPart.split(":")[0];
    }
    const fileName = fullPath.split("/").pop();

    const fileToCopy = `${fullPath}#${lineNo}`;
    navigator.clipboard
      .writeText(fileToCopy)
      .then(() => {
        const toast = document.createElement("div");
        toast.className = "debug-toast";
        toast.textContent = `Скопировано: ${fileName}:${lineNo}`;
        toast.style.left = `${clientX}px`;
        toast.style.top = `${clientY}px`;

        document.body.appendChild(toast);
        toast.offsetHeight; // force reflow
        toast.style.opacity = "1";
        toast.style.transform = "translate(-50%, -50%) translateY(-20px) scale(1.05)";

        setTimeout(() => {
          toast.style.opacity = "0";
          toast.style.transform = "translate(-50%, -50%) translateY(-60px) scale(0.95)";
          setTimeout(() => {
            toast.remove();
          }, 200);
        }, 800);
      })
      .catch(() => {
        console.warn("Clipboard write failed");
      });

    const fileToOpen = `${fullPath}:${lineNo}:1`;
    fetch(`/__open-in-editor?file=${encodeURIComponent(fileToOpen)}`).catch(() => {
      console.warn("Open in editor failed");
    });
  }

  function resolveGroupedList(e: MouseEvent) {
    const target = e.target as HTMLElement | null;

    // 1. Find the smallest element with data-debug-file under cursor
    let el: HTMLElement | null = null;
    const x = e.clientX;
    const y = e.clientY;
    const candidates = document.querySelectorAll("[data-debug-file]");
    let smallestArea = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i] as HTMLElement;
      const rect = cand.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const area = rect.width * rect.height;
        if (area > 0 && area < smallestArea) {
          smallestArea = area;
          el = cand;
        }
      }
    }

    if (!el) {
      el = target && target.closest && (target.closest("[data-debug-file]") as HTMLElement | null);
    }

    if (!el) {
      return null;
    }

    const file = el.getAttribute("data-debug-file");
    const component = el.getAttribute("data-debug-component");
    const currentFilePath = file ? file.split("#")[0] : "";

    // 2. Build DOM trace
    const domTrace: Array<{ file: string; component: string; type: string }> = [];
    let scanEl: HTMLElement | null = el;

    if (file) {
      domTrace.push({
        file: file,
        component: component || "Element",
        type: "implementation",
      });
    }

    let firstExternalFound = false;
    scanEl = el.parentElement;
    while (scanEl) {
      const parentFile = scanEl.getAttribute ? scanEl.getAttribute("data-debug-file") : null;
      if (parentFile) {
        const parentComp = scanEl.getAttribute("data-debug-component") || "Element";
        const parentFilePath = parentFile.split("#")[0];

        let type = "ancestor";
        if (!firstExternalFound && parentFilePath !== currentFilePath) {
          type = "usage";
          firstExternalFound = true;
        }

        domTrace.push({
          file: parentFile,
          component: parentComp,
          type: type,
        });
      }
      scanEl = scanEl.parentElement;
    }

    // 3. Extract React Fiber trace
    let fiber: any = null;
    let currentEl: HTMLElement | null = target;
    while (currentEl && !fiber) {
      const keys = Object.keys(currentEl);
      for (let i = 0; i < keys.length; i++) {
        if (keys[i].indexOf("__reactFiber$") === 0 || keys[i].indexOf("__reactInternalInstance$") === 0) {
          fiber = (currentEl as any)[keys[i]];
          break;
        }
      }
      if (!fiber) {
        currentEl = currentEl.parentElement;
      }
    }

    const fiberTrace: Array<{ file: string; component: string; type: string }> = [];
    let curr = fiber;
    let firstFiberExternalFound = false;
    while (curr) {
      if (curr.type && typeof curr.type === "string") {
        curr = curr.return;
        continue;
      }
      if (curr._debugSource) {
        const src = curr._debugSource;
        let fName = src.fileName || "";
        fName = fName.replace(/\\/g, "/");
        if (fName.indexOf("node_modules") === -1) {
          const srcIndex = fName.indexOf("/src/");
          const relativePath = srcIndex !== -1 ? fName.slice(srcIndex + 1) : fName;

          let compName = "Unknown";
          if (curr.type) {
            compName = curr.type.displayName || curr.type.name || "Unknown";
          }

          const itemFile = `${relativePath}#${src.lineNumber}`;
          const isTarget = fiberTrace.length === 0;
          let type = "ancestor";
          if (isTarget) {
            type = "implementation";
          } else {
            const baseTargetFile = fiberTrace[0].file.split("#")[0];
            if (!firstFiberExternalFound && itemFile.split("#")[0] !== baseTargetFile) {
              type = "usage";
              firstFiberExternalFound = true;
            }
          }

          fiberTrace.push({
            file: itemFile,
            component: compName,
            type: type,
          });
        }
      }
      curr = curr.return;
    }

    // Deduplicate and combine traces
    const mergedList: Array<{ file: string; component: string; type: string; label: string }> = [];
    const seen = new Set<string>();

    function addToList(item: { file: string; component: string; type: string }) {
      if (!item || !item.file) return;
      const key = item.file.replace(/\\/g, "/").trim().toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      let label = "Компонент";
      if (item.type === "implementation") {
        label = "Реализация";
      } else if (item.type === "usage") {
        label = "Использование";
      } else if (item.type === "ancestor") {
        label = "Ветка";
      }

      mergedList.push({
        file: item.file,
        component: item.component,
        type: item.type,
        label: label,
      });
    }

    if (domTrace.length > 0) {
      addToList(domTrace[0]);
    }
    fiberTrace.forEach(addToList);
    domTrace.forEach(addToList);

    if (mergedList.length === 0) return null;

    // Reverse the list to go from root down to the leaf node (target clicked element)
    mergedList.reverse();

    // Group all items by file path
    const groupedList: Array<{
      file: string;
      component: string;
      type: string;
      label: string;
      types: Set<string>;
      components: Array<{ name: string; type: string; line: number }>;
    }> = [];
    const fileGroups = new Map<string, number>();

    mergedList.forEach((item) => {
      const parts = item.file.split("#");
      const filePath = parts[0];
      const line = parseInt(parts[1], 10) || 1;
      const normalizedPath = filePath.replace(/\\/g, "/").trim().toLowerCase();

      if (fileGroups.has(normalizedPath)) {
        const targetIndex = fileGroups.get(normalizedPath)!;
        const group = groupedList[targetIndex];

        const isDuplicate = group.components.some((c) => c.name === item.component && c.line === line);
        if (!isDuplicate) {
          group.components.push({ name: item.component, type: item.type, line });
        }
        group.types.add(item.type);
      } else {
        groupedList.push({
          file: filePath,
          component: item.component,
          type: item.type,
          label: item.label,
          types: new Set([item.type]),
          components: [{ name: item.component, type: item.type, line }],
        });
        fileGroups.set(normalizedPath, groupedList.length - 1);
      }
    });

    // Resolve final properties, file formats, and display component names for each group
    groupedList.forEach((group, index) => {
      const hasImpl = group.types.has("implementation");
      const hasUsage = group.types.has("usage");

      if (hasImpl && hasUsage) {
        group.type = "mixed";
        group.label = "Смешанный";
      } else if (hasImpl) {
        group.type = "implementation";
        group.label = "Реализация";
      } else if (hasUsage) {
        group.type = "usage";
        group.label = "Использование";
      } else {
        group.type = "ancestor";
        group.label = index === 0 ? "Корень" : "Ветка";
      }

      // Determine the display name (component)
      if (group.type === "mixed" || group.type === "implementation" || group.type === "usage") {
        const targetComps = group.components.filter((c) => c.type === "implementation" || c.type === "usage");
        const uniqueNames: string[] = [];
        targetComps.forEach((c) => {
          if (!uniqueNames.includes(c.name)) uniqueNames.push(c.name);
        });
        group.component = uniqueNames[0] || "Unknown";
      } else {
        // Ancestor-only branches: show the full sequence
        const uniqueNames: string[] = [];
        group.components.forEach((c) => {
          if (!uniqueNames.includes(c.name)) uniqueNames.push(c.name);
        });
        group.component = uniqueNames[0] || "Unknown";
      }

      // Format file to include lines, types, and component names for code query, e.g. path#line1:type1:name1,line2:type2:name2
      const lineParts = group.components.map((c) => `${c.line}:${c.type}:${c.name}`);
      group.file = `${group.file}#${lineParts.join(",")}`;
    });

    return groupedList;
  }

  function highlightSyntax(content: string): string {
    const syntaxRegex =
      /([/]{2}.*)|(\/\*[\s\S]*?\*\/)|(&quot;.*?&quot;)|(&#039;.*?&#039;)|(`.*?`)|(&lt;\/?[a-zA-Z0-9_\-]+)|(\b(?:const|let|var|function|return|import|export|from|default|class|extends|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|typeof|instanceof|async|await|yield|true|false|null|undefined|void|as|type|interface|public|private|protected|readonly)\b)|(\b\d+\b)|(\b[a-zA-Z0-9_\-]+(?=\s*=))|(\b[a-zA-Z0-9_]+(?=\s*\(\s*))|(&gt;)/g;

    return content.replace(syntaxRegex, (match, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11) => {
      if (g1 || g2) return `<span class="hl-comment">${match}</span>`;
      if (g3 || g4 || g5) return `<span class="hl-string">${match}</span>`;
      if (g6) return `<span class="hl-tag">${match}</span>`;
      if (g7) return `<span class="hl-keyword">${match}</span>`;
      if (g8) return `<span class="hl-number">${match}</span>`;
      if (g9) return `<span class="hl-attr">${match}</span>`;
      if (g10) return `<span class="hl-fn">${match}</span>`;
      if (g11) return `<span class="hl-tag">${match}</span>`;
      return match;
    });
  }

  function animateMenuResize(oldWidth: number, oldLeft: number, oldTop: number, codePanel?: HTMLElement) {
    if (!activeMenu) return;
    const menu = activeMenu;

    menu.style.setProperty("transition", "none", "important");
    if (codePanel) {
      codePanel.style.setProperty("transition", "none", "important");
    }

    menu.style.setProperty("width", `${oldWidth}px`, "important");
    menu.style.left = `${oldLeft}px`;
    menu.style.top = `${oldTop}px`;
    (menu as any).offsetHeight; // force reflow

    menu.style.setProperty("width", "max-content", "important");
    const targetWidth = menu.getBoundingClientRect().width;
    const targetHeight = menu.getBoundingClientRect().height;

    menu.style.setProperty("width", `${oldWidth}px`, "important");
    if (codePanel) {
      codePanel.style.removeProperty("transition");
    }
    (menu as any).offsetHeight; // force reflow

    let targetLeft = oldLeft;
    if (targetLeft + targetWidth > window.innerWidth) {
      targetLeft = window.innerWidth - targetWidth - 12;
    }
    if (targetLeft < 12) targetLeft = 12;

    let targetTop = oldTop;
    if (targetTop + targetHeight > window.innerHeight) {
      targetTop = window.innerHeight - targetHeight - 12;
    }
    if (targetTop < 12) targetTop = 12;

    const transitionVal =
      "width 0.3s cubic-bezier(0.16, 1, 0.3, 1), left 0.3s cubic-bezier(0.16, 1, 0.3, 1), top 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)";
    menu.style.setProperty("transition", transitionVal, "important");

    menu.style.setProperty("width", `${targetWidth}px`, "important");
    menu.style.left = `${targetLeft}px`;
    menu.style.top = `${targetTop}px`;

    setTimeout(() => {
      if (menu.getBoundingClientRect().width === targetWidth) {
        menu.style.setProperty("width", "max-content", "important");
        const defaultTransition =
          "opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)";
        menu.style.setProperty("transition", defaultTransition, "important");
      }
    }, 300);
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
    "scroll",
    () => {
      if (currentInspectState && currentHoveredEl) {
        updateBadgePosition();
      }
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    "blur",
    () => {
      if (currentInspectState) {
        currentInspectState = false;
        document.documentElement.classList.remove("debug-inspect-mode");
        restoreLastHoveredElTitle();
        currentHoveredEl = null;
        updateBadgePosition();
      }
    },
    true,
  );

  window.addEventListener(
    "click",
    (e: MouseEvent) => {
      if (e.ctrlKey && e.shiftKey) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        closeContextMenu(true);

        const groupedList = resolveGroupedList(e);
        if (groupedList && groupedList.length > 0) {
          let targetItem = groupedList.find((item) => item.type === "usage" || item.type === "mixed");
          if (!targetItem) {
            targetItem = groupedList.find((item) => item.type === "implementation") || groupedList[groupedList.length - 1];
          }
          if (targetItem) {
            navigateToGroup(targetItem, e.clientX, e.clientY);
          }
        }
      } else if (activeMenu && !activeMenu.contains(e.target as Node)) {
        closeContextMenu();
      }
    },
    true,
  );

  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "Control" && activeMenu) {
        activeMenu.classList.add("semi-transparent");
      }
      if (e.key === "Escape") {
        closeContextMenu();
      }
    },
    true,
  );

  window.addEventListener(
    "keyup",
    (e: KeyboardEvent) => {
      if (e.key === "Control" && activeMenu) {
        activeMenu.classList.remove("semi-transparent");
      }
    },
    true,
  );

  window.addEventListener(
    "contextmenu",
    (e: MouseEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();

      closeContextMenu(true);

      const groupedList = resolveGroupedList(e);
      if (!groupedList || groupedList.length === 0) return;

      const menu = document.createElement("div");
      menu.id = "debug-inspect-menu";
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;

      const header = document.createElement("div");
      header.className = "debug-menu-header";
      header.innerHTML = `
      <span>Кликните для перехода к коду</span>
      <div style="display: flex; align-items: center; gap: 4px;">
        <button class="debug-visualizer-toggle" aria-label="Toggle render visualizer"></button>
        <button class="debug-theme-toggle" aria-label="Toggle theme"></button>
      </div>
    `;
      menu.appendChild(header);

      const visualizerToggle = header.querySelector(".debug-visualizer-toggle") as HTMLButtonElement | null;
      if (visualizerToggle) {
        const updateVisualizerIcon = (enabled: boolean) => {
          if (enabled) {
            visualizerToggle.classList.add("active");
            visualizerToggle.setAttribute("title", "Отключить визуализатор рендеров");
          } else {
            visualizerToggle.classList.remove("active");
            visualizerToggle.setAttribute("title", "Включить визуализатор рендеров");
          }
          visualizerToggle.innerHTML = `
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
            </svg>
          `;
        };

        updateVisualizerIcon((window as any).__renderVisualizerEnabled);

        visualizerToggle.addEventListener("click", (toggleEvent) => {
          toggleEvent.stopPropagation();
          const nextState = !(window as any).__renderVisualizerEnabled;
          (window as any).__renderVisualizerEnabled = nextState;
          localStorage.setItem("debug-render-visualizer", String(nextState));
          updateVisualizerIcon(nextState);
        });
      }

      const themeToggle = header.querySelector(".debug-theme-toggle") as HTMLButtonElement | null;
      if (themeToggle) {
        const updateToggleIcon = (theme: string) => {
          if (theme === "light") {
            themeToggle.innerHTML = `
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          `;
            themeToggle.setAttribute("title", "Темная тема");
          } else {
            themeToggle.innerHTML = `
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="18.36" x2="5.64" y2="16.93"></line>
              <line x1="18.36" y1="4.22" x2="19.78" y2="5.64"></line>
            </svg>
          `;
            themeToggle.setAttribute("title", "Светлая тема");
          }
        };

        let currentTheme = localStorage.getItem("debug-meta-theme") || "dark";
        updateToggleIcon(currentTheme);
        if (currentTheme === "light") {
          menu.classList.add("theme-light");
        }

        themeToggle.addEventListener("click", (toggleEvent) => {
          toggleEvent.stopPropagation();
          const activeTheme = menu.classList.contains("theme-light") ? "dark" : "light";
          if (activeTheme === "light") {
            menu.classList.add("theme-light");
          } else {
            menu.classList.remove("theme-light");
          }
          localStorage.setItem("debug-meta-theme", activeTheme);
          updateToggleIcon(activeTheme);

          const tooltip = document.getElementById("debug-git-tooltip");
          if (tooltip) {
            if (activeTheme === "light") {
              tooltip.classList.add("theme-light");
            } else {
              tooltip.classList.remove("theme-light");
            }
          }
        });
      }

      const listContainer = document.createElement("div");
      listContainer.className = "debug-menu-list";

      groupedList.forEach((item) => {
        const container = document.createElement("div");
        container.className = "debug-menu-item-container";
        if (item.type === "implementation") {
          container.classList.add("impl-leaf");
        } else if (item.type === "mixed") {
          container.classList.add("mixed-leaf");
        }

        const badgeClass =
          item.type === "implementation"
            ? "impl"
            : item.type === "usage"
              ? "usage"
              : item.type === "mixed"
                ? "mixed"
                : "ancestor";

        const fullPath = item.file.split("#")[0];
        const lineNosStr = item.file.split("#")[1] || "1";
        const fileName = fullPath.split("/").pop();
        const cleanLineNos = lineNosStr
          .split(",")
          .map((part) => part.split(":")[0])
          .join(", ");

        container.innerHTML = `
        <div class="debug-menu-item-main">
          <button class="debug-menu-item-toggle-code" title="Показать окружающий код">
            <svg class="chevron-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
          <button class="debug-menu-item-click-target" title="${fullPath}:${cleanLineNos}">
            <div class="debug-menu-item-title">
              <div class="debug-menu-item-meta-wrap">
                <span class="debug-menu-item-name ${badgeClass}">${item.component}</span>
                <span class="debug-menu-item-git-meta"></span>
              </div>
              <span class="debug-menu-item-badge ${badgeClass}">${item.label}</span>
            </div>
          </button>
        </div>
        <div class="debug-menu-item-code-panel"></div>
      `;

        // Asynchronously fetch last commit info for the menu item
        fetch(`/__get-git-info?file=${encodeURIComponent(fullPath)}`)
          .then((r) => {
            if (!r.ok) throw new Error();
            return r.json();
          })
          .then((gitData) => {
            if (gitData && gitData.lastCommit && !gitData.error) {
              const gitMetaEl = container.querySelector(".debug-menu-item-git-meta");
              if (gitMetaEl) {
                const author = gitData.lastCommit.author || "Unknown";
                const date = gitData.lastCommit.date || "now";
                const hash = gitData.lastCommit.hash || "0000000";
                const subject = gitData.lastCommit.subject || "";
                gitMetaEl.innerHTML = `
                  <svg class="debug-git-icon" viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.7; flex-shrink: 0; display: inline-block; vertical-align: middle; margin-right: 2px;">
                    <circle cx="18" cy="18" r="3"></circle>
                    <circle cx="6" cy="6" r="3"></circle>
                    <circle cx="6" cy="18" r="3"></circle>
                    <line x1="6" y1="9" x2="6" y2="15"></line>
                    <line x1="9" y1="18" x2="15" y2="18"></line>
                  </svg>
                  <span class="git-author">${author}</span>, 
                  <span class="git-date">${date}</span>
                `;
                gitMetaEl.setAttribute("title", `Ветка: ${gitData.branch || "unknown"}\nКоммит: ${hash}\n${subject}`);
                gitMetaEl.classList.add("loaded");
              }
            }
          })
          .catch(() => {});

        const clickTarget = container.querySelector(".debug-menu-item-click-target") as HTMLElement | null;
        const toggleBtn = container.querySelector(".debug-menu-item-toggle-code") as HTMLElement | null;
        const codePanel = container.querySelector(".debug-menu-item-code-panel") as HTMLElement | null;

        if (clickTarget) {
          clickTarget.addEventListener("click", (clickEvent: MouseEvent) => {
            clickEvent.stopPropagation();
            closeContextMenu(true);
            navigateToGroup(item, clickEvent.clientX, clickEvent.clientY);
          });
        }

        if (toggleBtn && codePanel) {
          codePanel.addEventListener("click", (clickEvent: MouseEvent) => {
            const targetLineEl = (clickEvent.target as HTMLElement).closest(".debug-code-line");
            if (!targetLineEl) return;
            if (!targetLineEl.classList.contains("target")) return;

            const lineNoText = targetLineEl.querySelector(".debug-code-ln")?.textContent;
            const lineNo = parseInt(lineNoText || "", 10);
            if (isNaN(lineNo)) return;

            clickEvent.stopPropagation();
            closeContextMenu(true);
            navigateToGroup(item, clickEvent.clientX, clickEvent.clientY, lineNo);
          });

          toggleBtn.addEventListener("click", (clickEvent) => {
            clickEvent.stopPropagation();

            const oldWidth = menu.getBoundingClientRect().width;
            const oldLeft = parseFloat(menu.style.left) || menu.getBoundingClientRect().left;
            const oldTop = parseFloat(menu.style.top) || menu.getBoundingClientRect().top;

            const isOpen = codePanel.classList.contains("open");
            if (isOpen) {
              codePanel.classList.remove("open");
              toggleBtn.classList.remove("open");
              codePanel.style.setProperty("max-height", "0px", "important");
              animateMenuResize(oldWidth, oldLeft, oldTop, codePanel);
            } else {
              if (!codePanel.getAttribute("data-loaded")) {
                codePanel.innerHTML = `
                <div class="debug-code-filepath" title="${fullPath}:${cleanLineNos}">${fileName}:${cleanLineNos}</div>
                <div class="debug-code-loading">Загрузка кода...</div>
              `;
                codePanel.classList.add("open");
                toggleBtn.classList.add("open");
                codePanel.style.setProperty("max-height", codePanel.scrollHeight + "px", "important");
                animateMenuResize(oldWidth, oldLeft, oldTop, codePanel);

                const codePromise = fetch(`/__get-source-code?file=${encodeURIComponent(item.file)}`)
                  .then((res) => {
                    if (!res.ok) throw new Error("HTTP error " + res.status);
                    return res.json();
                  });

                const gitPromise = fetch(`/__get-git-info?file=${encodeURIComponent(item.file)}`)
                  .then((res) => {
                    if (!res.ok) throw new Error("HTTP error " + res.status);
                    return res.json();
                  })
                  .catch(() => null);

                Promise.all([codePromise, gitPromise])
                  .then(([data, gitData]) => {
                    if (data.error) {
                      const postOldWidth = menu.getBoundingClientRect().width;
                      const postOldLeft = parseFloat(menu.style.left) || menu.getBoundingClientRect().left;
                      const postOldTop = parseFloat(menu.style.top) || menu.getBoundingClientRect().top;
                      codePanel.innerHTML = `
                      <div class="debug-code-filepath" title="${fullPath}:${cleanLineNos}">${fileName}:${cleanLineNos}</div>
                      <div class="debug-code-error">${data.error}</div>
                    `;
                      if (codePanel.classList.contains("open")) {
                        codePanel.style.setProperty("max-height", codePanel.scrollHeight + "px", "important");
                      } else {
                        codePanel.style.setProperty("max-height", "0px", "important");
                      }
                      animateMenuResize(postOldWidth, postOldLeft, postOldTop, codePanel);
                      return;
                    }
                    codePanel.setAttribute("data-loaded", "true");

                    const postOldWidth = menu.getBoundingClientRect().width;
                    const postOldLeft = parseFloat(menu.style.left) || menu.getBoundingClientRect().left;
                    const postOldTop = parseFloat(menu.style.top) || menu.getBoundingClientRect().top;

                    let gitInfoHtml = "";
                    if (gitData && !gitData.error && gitData.lastCommit) {
                      const branchText = gitData.branch ? `[${gitData.branch}] ` : "";
                      const author = gitData.lastCommit.author || "Unknown";
                      const date = gitData.lastCommit.date || "now";
                      const subject = gitData.lastCommit.subject || "";
                      gitInfoHtml = `
                        <span class="debug-code-git-info" title="Ветка: ${gitData.branch || "unknown"}\nАвтор: ${author}\nДата: ${date}\nКоммит: ${subject}">
                          <svg class="debug-git-icon" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 3px; opacity: 0.8;">
                            <circle cx="18" cy="18" r="3"></circle>
                            <circle cx="6" cy="6" r="3"></circle>
                            <circle cx="6" cy="18" r="3"></circle>
                            <line x1="6" y1="9" x2="6" y2="15"></line>
                            <line x1="9" y1="18" x2="15" y2="18"></line>
                          </svg>
                          <span class="git-branch">${branchText}</span>
                          <span class="git-author">${author}</span> • 
                          <span class="git-date">${date}</span> • 
                          <span class="git-subject">${subject}</span>
                        </span>
                      `;
                    }

                    let minTime = Infinity;
                    let maxTime = -Infinity;
                    if (gitData && gitData.blame) {
                      Object.values(gitData.blame).forEach((info: any) => {
                        if (info && info.time) {
                          if (info.time < minTime) minTime = info.time;
                          if (info.time > maxTime) maxTime = info.time;
                        }
                      });
                    }

                    let html = `
                    <div class="debug-code-filepath" title="${fullPath}:${cleanLineNos}">${fileName}:${cleanLineNos}${gitInfoHtml}</div>
                    <div class="debug-code-container">
                  `;
                    if (data.hasMoreBefore) {
                      html += `
                      <div class="debug-code-line ellipsis-line">
                        <span class="debug-code-ln">...</span>
                        <span class="debug-code-content" style="color: #6B7280;">...</span>
                      </div>
                    `;
                    }
                    data.lines.forEach((ln: any) => {
                      const isEllipsis = ln.line === "...";

                      let targetClassSuffix = "";
                      if (ln.isTarget) {
                        if (ln.targetType === "implementation") {
                          targetClassSuffix = " target impl";
                        } else if (ln.targetType === "usage") {
                          targetClassSuffix = " target usage";
                        } else if (ln.targetType === "declaration") {
                          targetClassSuffix = " target decl";
                        } else {
                          targetClassSuffix = " target ancestor";
                        }
                      }

                      let bgStyle = "";
                      let blameDataAttr = "";
                      let heatClassSuffix = "";

                      if (!isEllipsis && gitData && gitData.blame && gitData.blame[ln.line]) {
                        const bInfo = gitData.blame[ln.line];
                        const escapedSummary = (bInfo.summary || "").replace(/"/g, "&quot;");
                        blameDataAttr = ` data-blame-hash="${bInfo.hash}" data-blame-author="${bInfo.author}" data-blame-time="${bInfo.time}" data-blame-summary="${escapedSummary}"`;
                        heatClassSuffix = " git-heatmap";

                        if (bInfo.time && maxTime > minTime) {
                          const score = (bInfo.time - minTime) / (maxTime - minTime || 1);
                          const hue = Math.round(210 - score * 195);
                          const saturation = Math.round(20 + score * 40);
                          bgStyle = ` style="--line-heat-hue: ${hue}; --line-heat-sat: ${saturation}%; --line-heat-score: ${score};"`;
                        } else if (bInfo.hash === "0000000") {
                          bgStyle = ` style="--line-heat-hue: 140; --line-heat-sat: 60%; --line-heat-score: 1;"`;
                        } else {
                          bgStyle = ` style="--line-heat-hue: 200; --line-heat-sat: 30%; --line-heat-score: 0.5;"`;
                        }
                      }

                      const escapedContent = isEllipsis
                        ? "..."
                        : ln.content
                            .replace(/&/g, "&amp;")
                            .replace(/</g, "&lt;")
                            .replace(/>/g, "&gt;")
                            .replace(/"/g, "&quot;")
                            .replace(/'/g, "&#039;");
                      const highlighted = isEllipsis ? "..." : highlightSyntax(escapedContent);
                      const contentStyle = isEllipsis ? ' style="color: #6B7280;"' : "";

                      let lineStatsHtml = "";
                      if (!isEllipsis && ln.componentName) {
                        const cleanName = ln.componentName.split(" ")[0].split("(")[0].trim();
                        const stats = (window as any).__debugRenderStats?.[cleanName];
                        if (stats && stats.count > 0) {
                          let rating = "Нормально";
                          if (stats.count > 10) {
                            rating = "Критично (Много рендеров!)";
                          } else if (stats.count > 5) {
                            rating = "Подозрительно (Не очень)";
                          } else if (stats.count > 2) {
                            rating = "Умеренно";
                          } else {
                            rating = "Отлично";
                          }
                          lineStatsHtml = `<span class="debug-render-stat-badge" style="--badge-hue: ${stats.hue} !important;" title="${rating} — Рендеров: ${stats.count}">⚡ ${stats.count}</span>`;
                        }
                      }

                      html += `
                      <div class="debug-code-line${targetClassSuffix}${heatClassSuffix}${isEllipsis ? " ellipsis-line" : ""}"${bgStyle}${blameDataAttr}>
                        <span class="debug-code-ln">${ln.line}</span>
                        <span class="debug-code-content"${contentStyle}>${highlighted}${lineStatsHtml}</span>
                      </div>
                    `;
                    });
                    if (data.hasMoreAfter) {
                      html += `
                      <div class="debug-code-line ellipsis-line">
                        <span class="debug-code-ln">...</span>
                        <span class="debug-code-content" style="color: #6B7280;">...</span>
                      </div>
                    `;
                    }
                    html += `</div>`;
                    codePanel.innerHTML = html;
                    if (codePanel.classList.contains("open")) {
                      codePanel.style.setProperty("max-height", codePanel.scrollHeight + "px", "important");
                    } else {
                      codePanel.style.setProperty("max-height", "0px", "important");
                    }
                    animateMenuResize(postOldWidth, postOldLeft, postOldTop, codePanel);
                  })
                  .catch((err) => {
                    const postOldWidth = menu.getBoundingClientRect().width;
                    const postOldLeft = parseFloat(menu.style.left) || menu.getBoundingClientRect().left;
                    const postOldTop = parseFloat(menu.style.top) || menu.getBoundingClientRect().top;
                    codePanel.innerHTML = `
                    <div class="debug-code-filepath" title="${fullPath}:${cleanLineNos}">${fileName}:${cleanLineNos}</div>
                    <div class="debug-code-error">Не удалось загрузить код: ${err.message}</div>
                  `;
                    if (codePanel.classList.contains("open")) {
                      codePanel.style.setProperty("max-height", codePanel.scrollHeight + "px", "important");
                    } else {
                      codePanel.style.setProperty("max-height", "0px", "important");
                    }
                    animateMenuResize(postOldWidth, postOldLeft, postOldTop, codePanel);
                  });
              } else {
                codePanel.classList.add("open");
                toggleBtn.classList.add("open");
                codePanel.style.setProperty("max-height", codePanel.scrollHeight + "px", "important");
                animateMenuResize(oldWidth, oldLeft, oldTop, codePanel);
              }
            }
          });
        }

        listContainer.appendChild(container);
      });

      menu.appendChild(listContainer);
      document.body.appendChild(menu);
      activeMenu = menu;

      (menu as any).offsetHeight; // force reflow
      const menuRect = menu.getBoundingClientRect();
      let left = e.clientX;
      let top = e.clientY;

      if (left + menuRect.width > window.innerWidth) {
        left = window.innerWidth - menuRect.width - 12;
      }
      if (top + menuRect.height > window.innerHeight) {
        top = window.innerHeight - menuRect.height - 12;
      }
      if (left < 12) left = 12;
      if (top < 12) top = 12;

      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.classList.add("active");
    },
    true,
  );

  window.addEventListener(
    "mouseover",
    (e) => {
      const targetLine = (e.target as HTMLElement).closest(".debug-code-line");
      if (!targetLine) {
        const tooltip = document.getElementById("debug-git-tooltip");
        if (tooltip) {
          tooltip.classList.remove("active");
          tooltip.style.display = "none";
        }
        return;
      }

      const hash = targetLine.getAttribute("data-blame-hash");
      if (!hash) {
        const tooltip = document.getElementById("debug-git-tooltip");
        if (tooltip) {
          tooltip.classList.remove("active");
          tooltip.style.display = "none";
        }
        return;
      }

      const author = targetLine.getAttribute("data-blame-author") || "Unknown";
      const timeStr = targetLine.getAttribute("data-blame-time");
      const summary = targetLine.getAttribute("data-blame-summary") || "";
      const relativeTime = formatRelativeTime(timeStr ? parseInt(timeStr, 10) : 0);

      const tooltip = getOrCreateGitTooltip();
      const currentTheme = localStorage.getItem("debug-meta-theme") || "dark";
      if (currentTheme === "light") {
        tooltip.classList.add("theme-light");
      } else {
        tooltip.classList.remove("theme-light");
      }
      tooltip.innerHTML = `
        <div class="tooltip-header">
          <span class="tooltip-author">${author}</span>
          <span class="tooltip-hash">${hash}</span>
        </div>
        <div class="tooltip-time">${relativeTime}</div>
        <div class="tooltip-summary">${summary}</div>
      `;
      tooltip.style.display = "block";

      const lineRect = targetLine.getBoundingClientRect();
      const tooltipHeight = tooltip.offsetHeight || 50;
      const tooltipWidth = tooltip.offsetWidth || 220;

      let top = lineRect.top - tooltipHeight - 8;
      let left = lineRect.left + 40;

      if (top < 8) {
        top = lineRect.bottom + 8;
      }
      if (left + tooltipWidth > window.innerWidth - 8) {
        left = window.innerWidth - tooltipWidth - 8;
      }
      if (left < 8) {
        left = 8;
      }

      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
      
      tooltip.offsetHeight; // force reflow
      tooltip.classList.add("active");
    },
    true
  );

  window.addEventListener(
    "mouseout",
    (e) => {
      const targetLine = (e.target as HTMLElement).closest(".debug-code-line");
      if (targetLine) {
        const tooltip = document.getElementById("debug-git-tooltip");
        if (tooltip) {
          tooltip.classList.remove("active");
          tooltip.style.display = "none";
        }
      }
    },
    true
  );
}
