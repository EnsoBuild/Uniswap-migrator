import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
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
        "react",
        "react-dom",
        "wagmi",
        "viem",
        "@tanstack/react-query",
      ], // Mark React as a peer dependency
      output: {
        globals: {
          react: "React",
        },
      },
    },
  },
});
