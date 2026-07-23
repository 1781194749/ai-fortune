import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const standaloneNextRoot = path.join(standaloneRoot, ".next");

await mkdir(standaloneNextRoot, { recursive: true });
await Promise.all([
  cp(path.join(projectRoot, "public"), path.join(standaloneRoot, "public"), {
    recursive: true,
    force: true,
  }),
  cp(path.join(projectRoot, ".next", "static"), path.join(standaloneNextRoot, "static"), {
    recursive: true,
    force: true,
  }),
]);

console.log("Standalone runtime assets copied.");
