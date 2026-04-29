import { spawn } from "node:child_process";

const children = [
  spawn("bun", ["run", "src/server.ts"], { stdio: "inherit" }),
  spawn("bun", ["x", "vite", "--host", "127.0.0.1"], { stdio: "inherit" }),
];

let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

for (const child of children) {
  child.on("exit", (code, signal) => {
    shutdown("SIGTERM");
    if (code !== null) process.exit(code);
    if (signal) process.exit(0);
  });
}
