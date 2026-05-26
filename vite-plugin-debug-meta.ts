/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment */
import * as parser from "@babel/parser";
import traverseLib from "@babel/traverse";
import generateLib from "@babel/generator";
import type { Plugin } from "vite";
import path from "path";

const traverse = (traverseLib as any).default || traverseLib;
const generate = (generateLib as any).default || generateLib;

export type KnownEditor =
  | "code"
  | "code-insiders"
  | "webstorm"
  | "rider"
  | "phpstorm"
  | "pycharm"
  | "idea"
  | "clion"
  | "rubymine"
  | "goland"
  | "subl"
  | "sublime_text"
  | "atom"
  | "cursor"
  | "vscodium"
  | "zed"
  | "notepad++"
  | "vim"
  | "gvim"
  | "emacs";

export interface DebugMetaPluginOptions {
  editor?: KnownEditor | (string & {});
}

export function debugMetaPlugin(options?: DebugMetaPluginOptions): Plugin {
  if (options?.editor) {
    process.env.LAUNCH_EDITOR = options.editor;
  }
  const clickHandlerScript = /* javascript */`
(function installDebugClick() {
  var currentInspectState = false;
  var currentHoveredEl = null;
  var badge = null;

  function getOrCreateBadge() {
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
      badge.style.fontFamily = "-apple-system, BlinkMacSystemFont, \\"Segoe UI\\", Roboto, sans-serif";
      badge.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
      badge.style.display = "none";
      if (document.body) {
        document.body.appendChild(badge);
      }
    }
    return badge;
  }

  function updateBadgePosition() {
    var b = getOrCreateBadge();
    if (!b) return;

    if (!currentInspectState || !currentHoveredEl) {
      b.style.display = "none";
      return;
    }

    var rect = currentHoveredEl.getBoundingClientRect();
    var width = Math.round(rect.width);
    var height = Math.round(rect.height);
    
    var compName = currentHoveredEl.getAttribute("data-debug-component") || "";
    var sizeText = width + " × " + height;
    b.textContent = compName ? compName + " | " + sizeText : sizeText;

    var badgeTop = rect.top - 24;
    if (badgeTop < 0) {
      badgeTop = rect.top + 4;
    }
    var badgeLeft = rect.left;
    if (badgeLeft < 0) {
      badgeLeft = 4;
    }
    b.style.top = badgeTop + "px";
    b.style.left = badgeLeft + "px";
    b.style.display = "block";
  }

  function updateInspectMode(e) {
    var isInspect = !!(e && e.ctrlKey && e.shiftKey);
    if (isInspect !== currentInspectState) {
      currentInspectState = isInspect;
      if (isInspect) {
        document.documentElement.classList.add("debug-inspect-mode");
      } else {
        document.documentElement.classList.remove("debug-inspect-mode");
        currentHoveredEl = null;
        updateBadgePosition();
      }
    }
  }

  function handleMouseMove(e) {
    if (!currentInspectState) return;
    var target = e.target;
    var el = target && target.closest && target.closest("[data-debug-file]");
    if (el !== currentHoveredEl) {
      currentHoveredEl = el;
    }
    updateBadgePosition();
  }

  window.addEventListener("keydown", updateInspectMode, true);
  window.addEventListener("keyup", updateInspectMode, true);
  window.addEventListener("mousemove", function(e) {
    updateInspectMode(e);
    handleMouseMove(e);
  }, true);
  window.addEventListener("scroll", function() {
    if (currentInspectState && currentHoveredEl) {
      updateBadgePosition();
    }
  }, { capture: true, passive: true });
  window.addEventListener("blur", function() {
    if (currentInspectState) {
      currentInspectState = false;
      document.documentElement.classList.remove("debug-inspect-mode");
      currentHoveredEl = null;
      updateBadgePosition();
    }
  }, true);

  document.addEventListener("click", function(e) {
    if (!e.ctrlKey || !e.shiftKey || e.button !== 0) return;

    var target = e.target;
    
    // Извлекаем стек компонентов с помощью React Fiber
    var fiber = null;
    var currentEl = target;
    while (currentEl && !fiber) {
      var keys = Object.keys(currentEl);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf("__reactFiber$") === 0 || keys[i].indexOf("__reactInternalInstance$") === 0) {
          fiber = currentEl[keys[i]];
          break;
        }
      }
      if (!fiber) {
        currentEl = currentEl.parentElement;
      }
    }

    var trace = [];
    var curr = fiber;
    while (curr) {
      if (curr._debugSource) {
        var src = curr._debugSource;
        var fName = src.fileName || "";
        fName = fName.replace(/\\\\/g, "/");
        if (fName.indexOf("node_modules") === -1) {
          var srcIndex = fName.indexOf("/src/");
          var relativePath = srcIndex !== -1 ? fName.slice(srcIndex + 1) : fName;
          var fileName = fName.split("/").pop() || fName;

          var compName = "Unknown";
          if (curr.type) {
            compName = curr.type.displayName || curr.type.name || (typeof curr.type === "string" ? curr.type : "Unknown");
          }
          trace.push({
            file: fileName,
            relativePath: relativePath,
            line: src.lineNumber,
            component: compName
          });
        }
      }
      curr = curr.return;
    }

    // Значения по умолчанию из атрибутов DOM
    var el = null;
    var x = e.clientX;
    var y = e.clientY;
    var candidates = document.querySelectorAll("[data-debug-file]");
    var smallestArea = Infinity;

    for (var i = 0; i < candidates.length; i++) {
      var cand = candidates[i];
      var rect = cand.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        var area = rect.width * rect.height;
        if (area > 0 && area < smallestArea) {
          smallestArea = area;
          el = cand;
        }
      }
    }

    if (!el) {
      el = target && target.closest && target.closest("[data-debug-file]");
    }

    var file = el ? el.getAttribute("data-debug-file") : null;
    var component = el ? el.getAttribute("data-debug-component") : null;

    var fileToCopy = file;
    var componentToLog = component;

    if (trace.length > 0) {
      var bestEntry = trace[0];
      // Идем вверх по дереву, чтобы найти первое использование в другом файле (например, переход от общего компонента к использующей его странице или виджету)
      for (var i = 1; i < trace.length; i++) {
        if (trace[i].relativePath !== trace[0].relativePath) {
          bestEntry = trace[i];
          break;
        }
      }
      fileToCopy = bestEntry.relativePath + "#" + bestEntry.line;
      componentToLog = bestEntry.component;
    }

    console.group("Debug click");
    if (trace.length > 0) {
      console.log("Component Stack:");
      trace.forEach(function(item, idx) {
        console.log(
          (idx === 0 ? "👉 " : "   ") + "<" + item.component + "> inside " + item.relativePath + ":" + item.line
        );
      });
    } else {
      console.log("file:", file);
      console.log("component:", component);
    }
    console.log("element:", target);
    console.groupEnd();

    if (fileToCopy) {
      navigator.clipboard.writeText(fileToCopy)
        .then(function () {
          var toast = document.createElement("div");
          toast.textContent = "Ok";
          toast.style.position = "fixed";
          toast.style.left = e.clientX + "px";
          toast.style.top = e.clientY + "px";
          toast.style.transform = "translate(-50%, -50%) scale(0.8)";
          toast.style.opacity = "0";
          toast.style.backgroundColor = "#10B981";
          toast.style.color = "#ffffff";
          toast.style.padding = "3px 10px";
          toast.style.borderRadius = "4px";
          toast.style.fontSize = "11px";
          toast.style.fontWeight = "600";
          toast.style.fontFamily = "-apple-system, BlinkMacSystemFont, \\"Segoe UI\\", Roboto, sans-serif";
          toast.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
          toast.style.pointerEvents = "none";
          toast.style.zIndex = "999999";
          toast.style.transition = "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)";
          
          document.body.appendChild(toast);
        
          toast.offsetHeight;
          
          toast.style.opacity = "1";
          toast.style.transform = "translate(-50%, -50%) translateY(-15px) scale(1.05)";
          
          setTimeout(function () {
            toast.style.opacity = "0";
            toast.style.transform = "translate(-50%, -50%) translateY(-60px) scale(0.95)";
            toast.style.transition = "all 0.4s ease-in";
            setTimeout(function () {
              toast.remove();
            }, 200);
          }, 400);
        })
        .catch(function () { console.warn("Clipboard write failed"); });

      var fileToOpen = fileToCopy.replace("#", ":") + ":1";
      fetch("/__open-in-editor?file=" + encodeURIComponent(fileToOpen))
        .catch(function () { console.warn("Open in editor failed"); });
    }

    e.preventDefault();
    e.stopPropagation();
  }, true);
})();
`.trim();

  return {
    name: "debug-meta-plugin",
    apply: "serve",
    enforce: "pre",

    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "text/javascript" },
          children: clickHandlerScript,
          injectTo: "head",
        },
        {
          tag: "style",
          children: `
            .debug-inspect-mode [disabled],
            .debug-inspect-mode :disabled,
            .debug-inspect-mode .disabled {
              pointer-events: none !important;
            }
            .debug-inspect-mode [data-debug-file]:hover:not(:has([data-debug-file]:hover)) {
              outline: 2px solid #10B981 !important;
              outline-offset: -2px !important;
              cursor: crosshair !important;
            }
          `.trim(),
          injectTo: "head",
        }
      ];
    },

    // Добавляем к каждому JSX-элементу атрибуты data-debug-file#line и data-debug-component
    transform(code: string, id: string) {
      if (!/\.(tsx|jsx)$/.test(id) || id.includes("node_modules")) return null;

      const normalizedId = id.replace(/\\/g, "/");
      const relativePath = path.relative(process.cwd(), normalizedId).replace(/\\/g, "/");
      const file = normalizedId.split("/").pop() || normalizedId;
      const componentName = file.replace(/\.(tsx|jsx)$/, "");

      try {
        const ast = parser.parse(code, {
          sourceType: "module",
          plugins: ["typescript", "jsx", "decorators-legacy"],
        });

        traverse(ast, {
          JSXOpeningElement(path: any) {
            const nameNode = path.node.name;
            const isFragment =
              (nameNode.type === "JSXIdentifier" && nameNode.name === "Fragment") ||
              (nameNode.type === "JSXMemberExpression" &&
                nameNode.object.type === "JSXIdentifier" &&
                nameNode.object.name === "React" &&
                nameNode.property.type === "JSXIdentifier" &&
                nameNode.property.name === "Fragment");

            if (isFragment) return;

            const line = path.node.loc ? path.node.loc.start.line : 1;
            const debugFile = `${relativePath}#${line}`;

            const hasAttr = path.node.attributes.some(
              (attr: any) => attr.type === "JSXAttribute" && attr.name.name === "data-debug-file"
            );
            if (hasAttr) return;

            const debugFileAttr = {
              type: "JSXAttribute" as const,
              name: { type: "JSXIdentifier" as const, name: "data-debug-file" },
              value: {
                type: "JSXExpressionContainer" as const,
                expression: { type: "StringLiteral" as const, value: debugFile }
              }
            };
            const debugComponentAttr = {
              type: "JSXAttribute" as const,
              name: { type: "JSXIdentifier" as const, name: "data-debug-component" },
              value: {
                type: "JSXExpressionContainer" as const,
                expression: { type: "StringLiteral" as const, value: componentName }
              }
            };

            const spreadIndex = path.node.attributes.findIndex(
              (attr: any) => attr.type === "JSXSpreadAttribute"
            );

            if (spreadIndex !== -1) {
              path.node.attributes.splice(spreadIndex, 0, debugFileAttr, debugComponentAttr);
            } else {
              path.node.attributes.push(debugFileAttr, debugComponentAttr);
            }
          }
        });

        const result = generate(ast, { sourceMaps: true, sourceFileName: id }, code);
        return {
          code: result.code,
          map: result.map,
        };
      } catch (err) {
        console.error(`[debug-meta-plugin] Failed to parse ${id}:`, err);
        return null;
      }
    },
  };
}

export default debugMetaPlugin;
