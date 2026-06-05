import fs from "fs";
import path from "path";
import type { ServerResponse } from "http";

export function handleGetSourceCode(
  url: URL,
  rootDir: string,
  res: ServerResponse
): void {
  const fileParam = url.searchParams.get("file");
  if (!fileParam) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing file parameter" }));
    return;
  }

  const [filePath, lineStr] = fileParam.split("#");
  const lineTypeMap = new Map<number, string>();
  const lineCompMap = new Map<number, string>();
  const targetLines: number[] = [];

  if (lineStr) {
    lineStr.split(",").forEach((part) => {
      const [lnStr, type, name] = part.split(":");
      const ln = parseInt(lnStr, 10);
      if (!isNaN(ln)) {
        targetLines.push(ln);
        lineTypeMap.set(ln, type || "ancestor");
        if (name) {
          lineCompMap.set(ln, name);
        }
      }
    });
  } else {
    targetLines.push(1);
    lineTypeMap.set(1, "ancestor");
  }

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);

  fs.readFile(absolutePath, "utf-8", (err, data) => {
    if (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `Failed to read file: ${err.message}` }));
      return;
    }

    const lines = data.split(/\r?\n/);

    // Scan for component declarations to include them as declaration lines
    const finalTargetLines = [...targetLines];
    const finalLineTypeMap = new Map(lineTypeMap);
    const finalLineCompMap = new Map(lineCompMap);

    targetLines.forEach((ln) => {
      const compName = lineCompMap.get(ln);
      if (compName) {
        const baseName = compName.split(" ")[0].split("(")[0];
        const escapedCompName = baseName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        const declRegExp = new RegExp(`\\b(const|let|var|function|class)\\s+${escapedCompName}\\b`);
        let foundLineIdx = -1;
        for (let idx = 0; idx < lines.length; idx++) {
          if (declRegExp.test(lines[idx])) {
            foundLineIdx = idx;
            break;
          }
        }
        if (foundLineIdx !== -1) {
          const declLine = foundLineIdx + 1;
          if (declLine !== ln) {
            if (!finalTargetLines.includes(declLine)) {
              finalTargetLines.push(declLine);
            }
            finalLineTypeMap.set(declLine, "declaration");
            finalLineCompMap.set(declLine, compName);
          }
        }
      }
    });

    // Generate ranges using finalTargetLines
    const ranges: { start: number; end: number }[] = [];
    const sortedTargets = [...finalTargetLines].sort((a, b) => a - b);
    for (const t of sortedTargets) {
      const isDecl = finalLineTypeMap.get(t) === "declaration";
      const start = isDecl ? t : Math.max(1, t - 2);
      const end = Math.min(lines.length, t + 2);
      if (ranges.length === 0) {
        ranges.push({ start, end });
      } else {
        const last = ranges[ranges.length - 1];
        if (start <= last.end + 1) {
          // adjacent or overlapping
          last.end = Math.max(last.end, end);
        } else {
          ranges.push({ start, end });
        }
      }
    }

    const codeLines = [];
    for (let r = 0; r < ranges.length; r++) {
      const range = ranges[r];
      if (r > 0) {
        codeLines.push({
          line: "...",
          content: "...",
          isTarget: false,
          targetType: null,
          componentName: null,
        });
      }
      for (let i = range.start; i <= range.end; i++) {
        const lineContent = lines[i - 1];
        const isTarget = finalTargetLines.includes(i);
        if (!isTarget && (lineContent === undefined || lineContent.trim() === "")) {
          continue;
        }
        codeLines.push({
          line: i,
          content: lineContent,
          isTarget,
          targetType: isTarget ? finalLineTypeMap.get(i) || "ancestor" : null,
          componentName: isTarget ? finalLineCompMap.get(i) || null : null,
        });
      }
    }

    const firstRange = ranges[0] || { start: 1, end: 1 };
    const lastRange = ranges[ranges.length - 1] || { start: 1, end: 1 };

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        filePath,
        targetLine: finalTargetLines[0] || 1,
        startLine: firstRange.start,
        endLine: lastRange.end,
        hasMoreBefore: firstRange.start > 1,
        hasMoreAfter: lastRange.end < lines.length,
        lines: codeLines,
      }),
    );
  });
}
