import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";

export default defineConfig(({ mode }) => ({
  plugins: [
    mode === "development" ? react() : undefined,
    dts(), // generates *.d.ts beside the JS
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    lib: {
      entry: "./src/index.tsx", // Entry point for your component
      name: "UniswapMigrator", // Global name for UMD builds
      fileName: (format) => `uniswap-migrator.${format}.js`, // Output file naming
    },
    rollupOptions: {
      external: [
        /^react($|\/)/,
        /^react-dom($|\/)/, // removes legacy react-dom/server
        "react",
        "react-dom",
        "wagmi",
        "viem",
        "@tanstack/react-query",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "ReactJsxRuntime",
        },
      },
    },
    sourcemap: true,
    target: "es2018",
  },
  esbuild: {
    jsxImportSource: "react",
  },
}));
