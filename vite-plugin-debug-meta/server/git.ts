import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import type { ServerResponse } from "http";

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, _stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

interface BlameInfo {
  hash: string;
  author: string;
  time: number;
  summary: string;
}

function parseBlamePorcelain(output: string): Record<number, BlameInfo> {
  const lines = output.split(/\r?\n/);
  const commits = new Map<string, { author: string; time: number; summary: string }>();
  const blameLines: Record<number, BlameInfo> = {};

  let currentHash = "";
  let currentLineNum = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("\t")) {
      if (currentHash && currentLineNum !== -1) {
        const commitInfo = commits.get(currentHash) || { author: "Unknown", time: 0, summary: "Unknown" };
        blameLines[currentLineNum] = {
          hash: currentHash.slice(0, 8),
          ...commitInfo,
        };
      }
      continue;
    }

    const match = /^([0-9a-f]{40,64})\s+\d+\s+(\d+)/.exec(line);
    if (match) {
      currentHash = match[1];
      currentLineNum = parseInt(match[2], 10);
      if (!commits.has(currentHash)) {
        commits.set(currentHash, { author: "Unknown", time: 0, summary: "Unknown" });
      }
      continue;
    }

    const spaceIdx = line.indexOf(" ");
    if (spaceIdx !== -1) {
      const key = line.slice(0, spaceIdx);
      const value = line.slice(spaceIdx + 1);
      const info = commits.get(currentHash);
      if (info) {
        if (key === "author") {
          info.author = value;
        } else if (key === "author-time") {
          info.time = parseInt(value, 10);
        } else if (key === "summary") {
          info.summary = value;
        }
      }
    }
  }

  return blameLines;
}

export function handleGetGitInfo(
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
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);

  if (!fs.existsSync(absolutePath)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "File not found" }));
    return;
  }

  const fileDir = path.dirname(absolutePath);
  const baseName = path.basename(absolutePath);

  fs.readFile(absolutePath, "utf-8", async (err, data) => {
    if (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `Failed to read file: ${err.message}` }));
      return;
    }

    const lines = data.split(/\r?\n/);
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

    const finalTargetLines = [...targetLines];
    targetLines.forEach((ln) => {
      const compName = lineCompMap.get(ln);
      if (compName) {
        const baseCompName = compName.split(" ")[0].split("(")[0];
        const escapedCompName = baseCompName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
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
          }
        }
      }
    });

    const ranges: { start: number; end: number }[] = [];
    const sortedTargets = [...finalTargetLines].sort((a, b) => a - b);
    for (const t of sortedTargets) {
      const start = Math.max(1, t - 2);
      const end = Math.min(lines.length, t + 2);
      if (ranges.length === 0) {
        ranges.push({ start, end });
      } else {
        const last = ranges[ranges.length - 1];
        if (start <= last.end + 1) {
          last.end = Math.max(last.end, end);
        } else {
          ranges.push({ start, end });
        }
      }
    }

    try {
      let branch = "";
      try {
        branch = (await runGit(["branch", "--show-current"], fileDir)).trim();
      } catch (e) {
        try {
          branch = (await runGit(["rev-parse", "--abbrev-ref", "HEAD"], fileDir)).trim();
        } catch (e2) {
          branch = "unknown";
        }
      }

      let lastCommit = { author: "Not Committed Yet", date: "now", hash: "0000000", subject: "Local changes" };
      try {
        const logOutput = (await runGit(["log", "-1", "--format=%an|%ad|%h|%s", "--date=relative", "--", baseName], fileDir)).trim();
        if (logOutput) {
          const [author, date, hash, subject] = logOutput.split("|");
          lastCommit = { author, date, hash, subject };
        }
      } catch (e) {
        // File may be untracked or Git history not found
      }

      let blameOutput = "";
      const blameArgs = ["blame", "--porcelain"];
      ranges.forEach((r) => {
        blameArgs.push("-L", `${r.start},${r.end}`);
      });
      blameArgs.push("--", baseName);

      try {
        blameOutput = await runGit(blameArgs, fileDir);
      } catch (e) {
        // File is probably untracked, blame will fail
      }

      const blameMap = blameOutput ? parseBlamePorcelain(blameOutput) : {};

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          branch,
          lastCommit,
          blame: blameMap,
        })
      );
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: `Git command failed: ${err.message}`,
        })
      );
    }
  });
}
