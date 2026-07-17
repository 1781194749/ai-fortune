#!/usr/bin/env node

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build } from "esbuild";

const root = process.cwd();
const outdir = path.join(root, ".tmp", "prompt-quality");
const outfile = path.join(outdir, "runner.mjs");

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [path.join(root, "scripts/prompt-quality-runner.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: "inline",
  packages: "external",
  external: [
    "@prisma/client",
  ],
  plugins: [
    {
      name: "server-only-empty-module",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^server-only$/ }, () => ({
          path: "server-only",
          namespace: "server-only-empty",
        }));
        buildApi.onLoad({ filter: /.*/, namespace: "server-only-empty" }, () => ({
          contents: "export {};",
          loader: "js",
        }));
      },
    },
  ],
});

const runner = await import(`file://${outfile}?t=${Date.now()}`);
const result = await runner.runPromptQualityChecks();
await rm(outdir, { recursive: true, force: true });

if (!result.ok) {
  console.error("Prompt quality checks failed:");
  for (const check of result.failed) {
    console.error(`- ${check.id}: ${check.detail}`);
  }
  process.exit(1);
}

console.log(
  `Prompt quality checks passed (${result.checkCount} checks, ${result.sampleCount} curated, ${result.generatedCaseCount} generated, semantic=${result.semanticMode}, gate=${result.goNoGo}).`,
);
if (result.reviewOutput) {
  console.log(`Human review artifact: ${result.reviewOutput}`);
}
console.log(`Human review fields: ${result.humanReviewFields.join(", ")}`);
