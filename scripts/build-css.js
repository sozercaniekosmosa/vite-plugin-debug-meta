const fs = require("fs");
const path = require("path");

const cssPath = path.resolve(__dirname, "../vite-plugin-debug-meta/client/style.css");
const tsPath = path.resolve(__dirname, "../vite-plugin-debug-meta/client/style.ts");

try {
  const cssContent = fs.readFileSync(cssPath, "utf8");

  // Escape backslashes and backticks for safety in template literals
  const escapedCss = cssContent
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");

  const tsContent = `// This file is auto-generated from style.css. Do not edit directly.
export const clientStyles = \`${escapedCss}\`;
`;

  fs.writeFileSync(tsPath, tsContent, "utf8");
  console.log("Successfully generated client/style.ts from client/style.css");
} catch (err) {
  console.error("Failed to generate style.ts:", err);
  process.exit(1);
}
