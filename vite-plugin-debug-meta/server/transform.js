import * as parser from "@babel/parser";
import traverseLib from "@babel/traverse";
import generateLib from "@babel/generator";
import path from "path";

const traverse = traverseLib.default || traverseLib;
const generate = generateLib.default || generateLib;

export function transformCode(code, id) {
  if (!/\.(tsx|jsx)$/.test(id) || id.includes("node_modules")) return null;

  const normalizedId = id.replace(/\\/g, "/");
  const relativePath = path.relative(process.cwd(), normalizedId).replace(/\\/g, "/");
  const file = normalizedId.split("/").pop() ?? normalizedId;
  const componentName = file.replace(/\.(tsx|jsx)$/, "");

  try {
    const ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx", "decorators-legacy"],
    });

    traverse(ast, {
      JSXOpeningElement(p) {
        const nameNode = p.node.name;
        const isFragment =
          (nameNode.type === "JSXIdentifier" && nameNode.name === "Fragment") ||
          (nameNode.type === "JSXMemberExpression" &&
            nameNode.object.type === "JSXIdentifier" &&
            nameNode.object.name === "React" &&
            nameNode.property.type === "JSXIdentifier" &&
            nameNode.property.name === "Fragment");

        if (isFragment) return;

        const line = p.node.loc ? p.node.loc.start.line : 1;
        const debugFile = `${relativePath}#${line}`;

        const hasAttr = p.node.attributes.some(
          (attr) => attr.type === "JSXAttribute" && attr.name.name === "data-debug-file"
        );
        if (hasAttr) return;

        // Find the enclosing functional component
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

        function getTagName(node) {
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
          type: "JSXAttribute",
          name: { type: "JSXIdentifier", name: "data-debug-file" },
          value: {
            type: "JSXExpressionContainer",
            expression: { type: "StringLiteral", value: debugFile },
          },
        };
        const debugComponentAttr = {
          type: "JSXAttribute",
          name: { type: "JSXIdentifier", name: "data-debug-component" },
          value: {
            type: "JSXExpressionContainer",
            expression: { type: "StringLiteral", value: displayComponentName },
          },
        };

        const addedAttributes = [debugFileAttr, debugComponentAttr];
        const spreadIndex = p.node.attributes.findIndex((attr) => attr.type === "JSXSpreadAttribute");

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
