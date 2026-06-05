export const KNOWN_EDITORS_LIST = [
  "antigravity",
  "code",
  "code-insiders",
  "codium",
  "vscodium",
  "cursor",
  "trae",
  "zed",
  "webstorm",
  "phpstorm",
  "idea",
  "rider",
  "clion",
  "pycharm",
  "rubymine",
  "goland",
  "subl",
  "sublime_text",
  "atom",
  "notepad++",
  "vim",
  "gvim",
  "emacs",
  "brackets",
  "wstorm",
  "charm",
  "mvim",
  "joe",
  "emacsclient",
  "rmate",
  "mate",
  "mine",
  "appcode",
  "clion64",
  "idea64",
  "phpstorm64",
  "pycharm64",
  "rubymine64",
  "webstorm64",
  "goland64",
  "rider64",
] as const;

export type KnownEditor = (typeof KNOWN_EDITORS_LIST)[number];

export const VITE_KNOWN_EDITORS = new Set<string>(KNOWN_EDITORS_LIST);

export interface DebugMetaPluginOptions {
  editor?: KnownEditor | (string & {});
}
