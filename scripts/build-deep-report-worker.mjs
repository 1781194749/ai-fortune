import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(rootDir, "dist-workers");

const workerAliasPlugin = {
  name: "worker-alias",
  setup(builder) {
    builder.onResolve({ filter: /^@\// }, (args) => {
      const basePath = path.join(rootDir, "src", args.path.slice(2));
      const resolvedPath =
        [
          `${basePath}.ts`,
          `${basePath}.tsx`,
          `${basePath}.mjs`,
          `${basePath}.js`,
          path.join(basePath, "index.ts"),
          path.join(basePath, "index.tsx"),
          path.join(basePath, "index.mjs"),
          path.join(basePath, "index.js"),
          basePath,
        ]
          .find((candidate) => existsSync(candidate)) ?? basePath;

      return { path: resolvedPath };
    });
    builder.onResolve({ filter: /^server-only$/ }, () => ({
      path: "server-only",
      namespace: "server-only-stub",
    }));
    builder.onLoad({ filter: /.*/, namespace: "server-only-stub" }, () => ({
      contents: "",
      loader: "js",
    }));
  },
};

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [path.join(rootDir, "src/workers/deep-report-worker.ts")],
  outfile: path.join(outdir, "deep-report-worker.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  plugins: [workerAliasPlugin],
  external: ["pg-native"],
  logLevel: "info",
});
