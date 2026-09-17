import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";

async function canListen(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => {
      probe.close(() => resolve(true));
    });
  });
}

async function findPort(start) {
  for (let offset = 0; offset < 50; offset++) {
    const port = start + offset;
    if (await canListen(port)) return port;
  }
  throw new Error(`No available local port found from ${start}.`);
}

const requestedPort = Number(process.env.E2E_PORT ?? 3000);
const port = await findPort(Number.isFinite(requestedPort) ? requestedPort : 3000);
const baseUrl = `http://localhost:${port}`;
const e2eEnv = {
  ...process.env,
  APP_BASE_URL: baseUrl,
  PLAYWRIGHT_BASE_URL: baseUrl,
  RESEND_API_KEY: "",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASS: "",
};
delete e2eEnv.NO_COLOR;
const serverArgs = [
  "node_modules/next/dist/bin/next",
  "dev",
  "--hostname",
  "127.0.0.1",
  "--port",
  String(port),
];
const testArgs = ["node_modules/@playwright/test/cli.js", "test"];

function spawnNode(args, options = {}) {
  return spawn(process.execPath, args, {
    stdio: "inherit",
    windowsHide: true,
    env: e2eEnv,
    ...options,
  });
}

function stopProcessTree(child) {
  if (child.exitCode !== null || !child.pid) return;
  try {
    child.kill();
  } catch {
    /* Process may have exited between the status check and kill request. */
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 5_000,
    });
  } else if (child.exitCode === null) {
    spawnSync("kill", ["-TERM", String(child.pid)], {
      stdio: "ignore",
      timeout: 5_000,
    });
  }
  child.unref();
}

async function isReady() {
  try {
    const response = await fetch(baseUrl);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(server, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (server.exitCode !== null) {
      throw new Error(`Next dev server exited with code ${server.exitCode}.`);
    }
    if (await isReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${baseUrl}.`);
}

async function warmRoutes() {
  await fetch(`${baseUrl}/cv`).catch(() => {});
  const form = new FormData();
  form.append("file", new Blob(["warmup"]), "warmup.txt");
  await fetch(`${baseUrl}/api/cv/analyze`, {
    method: "POST",
    body: form,
  }).catch(() => {});
}

function runTests() {
  return new Promise((resolve) => {
    let resolved = false;
    let terminalCode = null;
    let summaryTimer = null;
    let outputBuffer = "";
    const finish = (code) => {
      if (resolved) return;
      resolved = true;
      if (summaryTimer) clearTimeout(summaryTimer);
      resolve(code);
    };
    const testProcess = spawnNode(testArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const watchOutput = (chunk, stream) => {
      const text = chunk.toString();
      stream.write(text);
      outputBuffer = (outputBuffer + text).slice(-4_000);
      if (/(^|\n)\s*\d+\s+failed\b/m.test(outputBuffer)) terminalCode = 1;
      if (/(^|\n)\s*\d+\s+passed\s+\(/m.test(outputBuffer)) terminalCode = 0;
      if (terminalCode !== null && !summaryTimer) {
        summaryTimer = setTimeout(() => {
          stopProcessTree(testProcess);
          finish(terminalCode);
        }, 2_000);
      }
    };
    testProcess.stdout.on("data", (chunk) => watchOutput(chunk, process.stdout));
    testProcess.stderr.on("data", (chunk) => watchOutput(chunk, process.stderr));
    testProcess.on("exit", (code, signal) => {
      finish(code ?? terminalCode ?? (signal ? 1 : 0));
    });
    testProcess.on("error", (error) => {
      console.error(error.message);
      finish(1);
    });
  });
}

function stopServer(server) {
  stopProcessTree(server);
}

const server = spawnNode(serverArgs);

try {
  await waitForServer(server);
  await warmRoutes();
  process.exitCode = await runTests();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  stopServer(server);
}

process.exit(process.exitCode ?? 0);
