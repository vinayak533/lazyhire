import { openSync } from "node:fs";
import { spawn } from "node:child_process";

const out = openSync("dev-server.out.log", "a");
const err = openSync("dev-server.err.log", "a");

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1"],
  {
    cwd: process.cwd(),
    stdio: ["pipe", out, err],
    windowsHide: true,
  },
);

const keepAlive = setInterval(() => {}, 30_000);

function stop() {
  clearInterval(keepAlive);
  if (server.exitCode === null) server.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

server.on("exit", (code, signal) => {
  clearInterval(keepAlive);
  process.exitCode = code ?? (signal ? 1 : 0);
});
