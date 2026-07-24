import { installDebugClick } from "./client/client.js";
import { clientStyles } from "./client/style.js";
import { openInEditor } from "./server/editor.js";
import { transformCode } from "./server/transform.js";
import { CONFIG } from "./client/constants.js";

export function debugMetaPlugin(options) {
  if (options?.editor) {
    process.env.LAUNCH_EDITOR = options.editor;
  }
  const clickHandlerScript = `
    const DEBUG_CONFIG = ${JSON.stringify(CONFIG)};
    (${installDebugClick.toString()})();
  `;

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

        let url;
        try {
          const fullUrl = req.url.startsWith("http") ? req.url : `http://localhost${req.url}`;
          url = new URL(fullUrl);
        } catch (err) {
          next();
          return;
        }

        if (url.pathname === "/__open-in-editor") {
          const file = url.searchParams.get("file");
          const editor = options?.editor ?? process.env.LAUNCH_EDITOR ?? "code";

          if (file && editor) {
            const handled = openInEditor(file, editor, server.config.root);
            if (handled) {
              res.statusCode = 200;
              res.end();
              return;
            }
          }
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

    transform(code, id) {
      return transformCode(code, id);
    },
  };
}

export default debugMetaPlugin;
