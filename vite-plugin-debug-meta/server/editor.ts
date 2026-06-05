import { spawn } from "child_process";
import path from "path";
import { VITE_KNOWN_EDITORS } from "../types";

export function openInEditor(file: string, editor: string, rootDir: string): boolean {
  const editorBasename = path
    .basename(editor)
    .replace(/\.(exe|cmd|bat)$/i, "")
    .toLowerCase();

  if (editorBasename === "antigravity" || !VITE_KNOWN_EDITORS.has(editorBasename)) {
    const absolutePath = path.resolve(rootDir, file);
    // Spawn unknown editor (assuming VS Code-like CLI behavior) with -g flag
    const child = spawn(editor, ["-g", absolutePath], {
      stdio: "inherit",
      shell: true,
    });
    child.on("error", (err: any) => {
      console.error(`[debug-meta-plugin] Failed to launch editor "${editor}":`, err);
    });
    return true;
  }
  return false;
}
