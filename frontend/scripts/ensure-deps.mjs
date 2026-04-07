import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const requiredPaths = [
  "node_modules/react",
  "node_modules/react-dom",
  "node_modules/react-markdown",
  "node_modules/remark-gfm",
  "node_modules/.bin/tsc",
  "node_modules/.bin/vite",
];

const hasMissingDependency = requiredPaths.some((path) => !existsSync(path));

if (hasMissingDependency) {
  console.log("Installing frontend dependencies before build...");
  const command = existsSync("package-lock.json") ? "ci" : "install";
  const result = spawnSync("npm", [command], { stdio: "inherit" });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
