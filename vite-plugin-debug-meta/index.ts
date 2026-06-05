import type { Plugin } from "vite";
import { installDebugClick } from "./client/client";
import { clientStyles } from "./client/style";
import { openInEditor } from "./server/editor";
import { handleGetSourceCode } from "./server/source-code";
import { handleGetGitInfo } from "./server/git";
import { transformCode } from "./server/transform";
import type { DebugMetaPluginOptions } from "./types";

export type { DebugMetaPluginOptions, KnownEditor } from "./types";

export function debugMetaPlugin(options?: DebugMetaPluginOptions): Plugin {
  if (options?.editor) {
    process.env.LAUNCH_EDITOR = options.editor;
  }
  const clickHandlerScript = `(${installDebugClick.toString()})();`;

  return {
    name: "debug-meta-plugin",
    apply: "serve",
    enforce: "pre",

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        let url: URL;
        try {
          const fullUrl = req.url.startsWith("http") ? req.url : `http://localhost${req.url}`;
          url = new URL(fullUrl);
        } catch (err) {
          next();
          return;
        }

        if (url.pathname === "/__open-in-editor") {
          const file = url.searchParams.get("file");
          const editor = options?.editor || process.env.LAUNCH_EDITOR;

          if (file && editor) {
            const handled = openInEditor(file, editor, server.config.root);
            if (handled) {
              res.statusCode = 200;
              res.end();
              return;
            }
          }
        }

        if (url.pathname === "/__get-source-code") {
          handleGetSourceCode(url, server.config.root, res);
          return;
        }

        if (url.pathname === "/__get-git-info") {
          handleGetGitInfo(url, server.config.root, res);
          return;
        }

        next();
      });
    },

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
          children: clientStyles.trim(),
          injectTo: "head",
        },
      ];
    },

    transform(code: string, id: string) {
      return transformCode(code, id);
    },
  };
}

export default debugMetaPlugin;
