/* eslint-disable @typescript-eslint/no-explicit-any */
import * as parser from "@babel/parser";
import traverseLib from "@babel/traverse";
import generateLib from "@babel/generator";
import path from "path";

const traverse = (traverseLib as any).default || traverseLib;
const generate = (generateLib as any).default || generateLib;

export function transformCode(
  code: string,
  id: string
): { code: string; map: any } | null {
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

    let hasInstrumented = false;

    traverse(ast, {
      Program: {
        exit(p: any) {
          if (hasInstrumented) {
            const importNode = parser.parse(`import * as _ReactDebugMeta from "react";`, {
              sourceType: "module",
            }).program.body[0];
            p.unshiftContainer("body", importNode);
          }
        },
      },

      JSXOpeningElement(p: any) {
        const nameNode = p.node.name;
        const isFragment =
          (nameNode.type === "JSXIdentifier" && nameNode.name === "Fragment") ||
          (nameNode.type === "JSXMemberExpression" &&
            nameNode.object.type === "JSXIdentifier" &&
            nameNode.object.name === "React" &&
            nameNode.property.type === "JSXIdentifier" &&
            nameNode.property.name === "Fragment");

        if (isFragment) return;

        // Find the enclosing functional component
        let enclosingFuncPath: any = null;
        let scanPath = p.parentPath;
        while (scanPath) {
          if (scanPath.isClassDeclaration() || scanPath.isClassExpression() || scanPath.isClassMethod()) {
            break;
          }
          if (
            scanPath.isFunctionDeclaration() ||
            scanPath.isArrowFunctionExpression() ||
            scanPath.isFunctionExpression()
          ) {
            let name = "";
            if (scanPath.isFunctionDeclaration() && scanPath.node.id) {
              name = scanPath.node.id.name;
            } else {
              let parent = scanPath.parentPath;
              if (parent && parent.isVariableDeclarator() && parent.node.id.type === "Identifier") {
                name = parent.node.id.name;
              } else if (parent && parent.isExportDefaultDeclaration()) {
                name = componentName;
              }
            }

            if (name && (/^[A-Z]/.test(name) || name === componentName)) {
              enclosingFuncPath = scanPath;
              break;
            }
          }
          if (scanPath.isProgram()) {
            break;
          }
          scanPath = scanPath.parentPath;
        }

        if (enclosingFuncPath && !enclosingFuncPath.node._instrumented) {
          enclosingFuncPath.node._instrumented = true;
          let resolvedName = "";
          if (enclosingFuncPath.isFunctionDeclaration() && enclosingFuncPath.node.id) {
            resolvedName = enclosingFuncPath.node.id.name;
          } else {
            let parent = enclosingFuncPath.parentPath;
            if (parent && parent.isVariableDeclarator() && parent.node.id.type === "Identifier") {
              resolvedName = parent.node.id.name;
            }
          }
          if (!resolvedName) {
            resolvedName = componentName;
          }

          if (enclosingFuncPath.node.body.type !== "BlockStatement") {
            const bodyExpr = enclosingFuncPath.node.body;
            enclosingFuncPath.get("body").replaceWith({
              type: "BlockStatement" as const,
              body: [
                {
                  type: "ReturnStatement" as const,
                  argument: bodyExpr,
                },
              ],
            });
          }

          const hookCallNode = parser.parse(
            `const _debugInstanceId = _ReactDebugMeta.useId();\n` +
            `globalThis.__traceRender && globalThis.__traceRender(_ReactDebugMeta, "${resolvedName}", "${relativePath}", _debugInstanceId);`,
            { sourceType: "module" }
          ).program.body;

          enclosingFuncPath.get("body").unshiftContainer("body", hookCallNode);
          hasInstrumented = true;
        }

        const line = p.node.loc ? p.node.loc.start.line : 1;
        const debugFile = `${relativePath}#${line}`;

        const hasAttr = p.node.attributes.some(
          (attr: any) => attr.type === "JSXAttribute" && attr.name.name === "data-debug-file",
        );
        if (hasAttr) return;

        // Find the actual component name from the AST
        let detectedComponentName = "";
        let currentPath = p;
        while (currentPath) {
          let name = "";
          if (currentPath.isFunctionDeclaration() && currentPath.node.id) {
            name = currentPath.node.id.name;
          } else if (currentPath.isClassDeclaration() && currentPath.node.id) {
            name = currentPath.node.id.name;
          } else if (currentPath.isVariableDeclarator()) {
            if (currentPath.node.id && currentPath.node.id.type === "Identifier") {
              name = currentPath.node.id.name;
            }
          }

          if (name) {
            if (/^[A-Z]/.test(name)) {
              detectedComponentName = name;
              break;
            }
            if (!detectedComponentName) {
              detectedComponentName = name;
            }
          }

          if (currentPath.isProgram()) {
            break;
          }
          currentPath = currentPath.parentPath;
        }

        if (!detectedComponentName) {
          detectedComponentName = componentName;
        }

        function getTagName(node: any): string {
          if (node.type === "JSXIdentifier") {
            return node.name;
          }
          if (node.type === "JSXMemberExpression") {
            return `${getTagName(node.object)}.${node.property.name}`;
          }
          if (node.type === "JSXNamespacedName") {
            return `${node.namespace.name}:${node.name.name}`;
          }
          return "Unknown";
        }

        const tagName = getTagName(nameNode);
        const displayComponentName =
          detectedComponentName === tagName ? detectedComponentName : `${detectedComponentName} (${tagName})`;

        const debugFileAttr = {
          type: "JSXAttribute" as const,
          name: { type: "JSXIdentifier" as const, name: "data-debug-file" },
          value: {
            type: "JSXExpressionContainer" as const,
            expression: { type: "StringLiteral" as const, value: debugFile },
          },
        };
        const debugComponentAttr = {
          type: "JSXAttribute" as const,
          name: { type: "JSXIdentifier" as const, name: "data-debug-component" },
          value: {
            type: "JSXExpressionContainer" as const,
            expression: { type: "StringLiteral" as const, value: displayComponentName },
          },
        };

        const addedAttributes = [debugFileAttr, debugComponentAttr];

        if (enclosingFuncPath) {
          addedAttributes.push({
            type: "JSXAttribute" as const,
            name: { type: "JSXIdentifier" as const, name: "data-debug-id" },
            value: {
              type: "JSXExpressionContainer" as const,
              expression: { type: "Identifier" as const, name: "_debugInstanceId" },
            },
          });
        }

        const spreadIndex = p.node.attributes.findIndex((attr: any) => attr.type === "JSXSpreadAttribute");

        if (spreadIndex !== -1) {
          p.node.attributes.splice(spreadIndex, 0, ...addedAttributes);
        } else {
          p.node.attributes.push(...addedAttributes);
        }
      },
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
}
