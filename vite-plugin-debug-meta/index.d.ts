import type { Plugin } from "vite";

export interface DebugMetaPluginOptions {
  editor?: string;
}

export function debugMetaPlugin(options?: DebugMetaPluginOptions): Plugin;
export default debugMetaPlugin;
