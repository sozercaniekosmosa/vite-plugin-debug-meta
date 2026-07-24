import { spawn } from "child_process";
import path from "path";
import { VITE_KNOWN_EDITORS } from "../types.js";

export function openInEditor(file, editor, rootDir) {
  const editorBasename = path
    .basename(editor)
    .replace(/\.(exe|cmd|bat)$/i, "")
    .toLowerCase();

  const isAntigravity = editorBasename === "antigravity" || editorBasename === "antigravity-ide";

  if (isAntigravity || !VITE_KNOWN_EDITORS.has(editorBasename)) {
    const absolutePath = path.resolve(rootDir, file);
    const launchCommand = isAntigravity ? "antigravity-ide" : editor;
    // Spawn unknown editor (assuming VS Code-like CLI behavior) with -g flag
    const child = spawn(launchCommand, ["-g", absolutePath], {
      stdio: "inherit",
      shell: true,
    });
    child.on("error", (err) => {
      console.error(`[debug-meta-plugin] Failed to launch editor "${launchCommand}":`, err);
    });
    return true;
  }
  return false;
}
