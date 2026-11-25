import path from "node:path";
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    // 中英双语：Lingui 宏在编译时原生转换，.po 翻译文件导入时即时编译（见 CLAUDE.md「多语言」）
    lingui({ macroTransform: true }),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
