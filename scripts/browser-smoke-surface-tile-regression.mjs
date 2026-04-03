import { spawn, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = resolve(rootDir, "dist");
const resultsDir = resolve(rootDir, "test-results");
const screenshotPath = resolve(resultsDir, "surface-tile-zoom-regression-smoke.png");
const domDumpPath = resolve(resultsDir, "surface-tile-zoom-regression-smoke.html");
const pageName = "surface-tile-zoom-regression.html";
const TOTAL_TIMEOUT_MS = 45000;
const STEP_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};

function getAttr(dom, name) {
  const match = dom.match(new RegExp(`data-${name}="([^"]+)"`));
  return match?.[1] ?? null;
}

function assertDom(dom) {
  const phase = getAttr(dom, "phase");
  const fillEdgeCount = Number.parseInt(getAttr(dom, "fill-edge-count") ?? "", 10);
  const maxNeighborLodDelta = Number.parseInt(getAttr(dom, "max-neighbor-lod-delta") ?? "", 10);
  const crackDetectedCount = Number.parseInt(getAttr(dom, "crack-detected-count") ?? "", 10);

  if (phase !== "after-zoom") {
    throw new Error(`Expected phase=after-zoom, got ${phase ?? "missing"}`);
  }

  if (!Number.isFinite(fillEdgeCount) || fillEdgeCount <= 0) {
    throw new Error(`Expected data-fill-edge-count > 0, got ${getAttr(dom, "fill-edge-count") ?? "missing"}`);
  }

  if (!Number.isFinite(maxNeighborLodDelta) || maxNeighborLodDelta < 1) {
    throw new Error(`Expected data-max-neighbor-lod-delta >= 1, got ${getAttr(dom, "max-neighbor-lod-delta") ?? "missing"}`);
  }

  if (!Number.isFinite(crackDetectedCount) || crackDetectedCount < 1) {
    throw new Error(`Expected data-crack-detected-count >= 1, got ${getAttr(dom, "crack-detected-count") ?? "missing"}`);
  }
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

async function findChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.startsWith("/")) {
      try {
        await access(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    const result = spawnSync("which", [candidate], { encoding: "utf8" });
    if (result.status === 0) {
      return result.stdout.trim();
    }
  }

  throw new Error("Unable to find a Chrome/Chromium executable");
}

function createStaticServer(rootDirPath) {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
    const filePath = resolve(rootDirPath, `.${pathname}`);

    if (!filePath.startsWith(rootDirPath)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const stream = createReadStream(filePath);
    stream.on("error", () => {
      response.writeHead(404);
      response.end("Not Found");
    });
    response.setHeader("Content-Type", MIME_TYPES[extname(filePath)] ?? "application/octet-stream");
    stream.pipe(response);
  });

  return server;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(STEP_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

function parseDevToolsUrl(stderr) {
  const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
  return match?.[1] ?? null;
}

async function connectCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await withTimeout(
    new Promise((resolve, reject) => {
      socket.addEventListener("open", () => resolve(undefined), { once: true });
      socket.addEventListener("error", (event) => reject(event.error ?? new Error("CDP websocket open failed")), { once: true });
    }),
    STEP_TIMEOUT_MS,
    "CDP websocket open timed out"
  );

  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (typeof payload?.id !== "number") {
      return;
    }
    const task = pending.get(payload.id);
    if (!task) {
      return;
    }
    pending.delete(payload.id);
    if (payload.error) {
      task.reject(new Error(payload.error.message ?? "CDP command failed"));
      return;
    }
    task.resolve(payload.result);
  });

  const send = (method, params = {}) => {
    id += 1;
    const commandId = id;
    return withTimeout(
      new Promise((resolve, reject) => {
        pending.set(commandId, { resolve, reject });
        socket.send(JSON.stringify({ id: commandId, method, params }));
      }),
      STEP_TIMEOUT_MS,
      `CDP command timeout: ${method}`
    );
  };

  const close = async () => {
    socket.close();
    await withTimeout(
      new Promise((resolve) => {
        if (socket.readyState === WebSocket.CLOSED) {
          resolve(undefined);
          return;
        }
        socket.addEventListener("close", () => resolve(undefined), { once: true });
      }),
      1000,
      "CDP websocket close timed out"
    ).catch(() => undefined);
  };

  return { send, close };
}

async function killProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await withTimeout(
    new Promise((resolve) => child.once("close", () => resolve(undefined))),
    2000,
    "Chrome SIGTERM close timed out"
  ).catch(() => undefined);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await withTimeout(
      new Promise((resolve) => child.once("close", () => resolve(undefined))),
      2000,
      "Chrome SIGKILL close timed out"
    ).catch(() => undefined);
  }
}

async function main() {
  await access(distDir);
  await mkdir(resultsDir, { recursive: true });

  const chromePath = await findChromePath();
  const server = createStaticServer(distDir);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  let chrome = null;
  let cdp = null;
  let stage = "init";
  let lastMetrics = "none";
  let profileDir = null;

  const totalTimeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Chrome execution timed out after ${TOTAL_TIMEOUT_MS}ms (stage=${stage}, lastMetrics=${lastMetrics})`)), TOTAL_TIMEOUT_MS);
  });

  const runPromise = (async () => {
    stage = "resolve-server";
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve static server port");
    }

    const targetUrl = `http://127.0.0.1:${address.port}/${pageName}?smoke=1`;
    profileDir = await mkdtemp(resolve(tmpdir(), "surface-smoke-"));
    stage = "spawn-chrome";
    chrome = spawn(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--use-angle=swiftshader",
      "--hide-scrollbars",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      "--window-size=1280,900",
      `--user-data-dir=${profileDir}`,
      "about:blank"
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    let devToolsUrl = null;
    chrome.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      devToolsUrl = devToolsUrl ?? parseDevToolsUrl(stderr);
    });

    stage = "wait-devtools";
    while (!devToolsUrl) {
      if (chrome.exitCode !== null) {
        throw new Error(`Chrome exited early with code ${chrome.exitCode}\n${stderr}`);
      }
      await sleep(POLL_INTERVAL_MS);
    }

    const debugPort = Number.parseInt(new URL(devToolsUrl).port, 10);
    let pageWsUrl = null;
    stage = "wait-page-target";
    while (!pageWsUrl) {
      const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
      const pageTarget = targets.find(
        (target) => target.type === "page"
      );
      pageWsUrl = pageTarget?.webSocketDebuggerUrl ?? null;
      if (!pageWsUrl) {
        await sleep(POLL_INTERVAL_MS);
      }
    }

    stage = "connect-cdp";
    cdp = await connectCdp(pageWsUrl);
    stage = "enable-cdp";
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    stage = "navigate-page";
    await cdp.send("Page.navigate", { url: targetUrl });

    let ready = false;
    stage = "wait-metrics";
    while (!ready) {
      const evaluated = await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const host = document.querySelector("#globe-stage") ?? document.body;
          const d = host?.dataset ?? {};
          const phase = d.phase ?? null;
          const fillEdgeCount = Number.parseInt(d.fillEdgeCount ?? "", 10);
          const maxNeighborLodDelta = Number.parseInt(d.maxNeighborLodDelta ?? "", 10);
          const crackDetectedCount = Number.parseInt(d.crackDetectedCount ?? "", 10);
          const href = window.location.href;
          const readyState = document.readyState;
          return { phase, fillEdgeCount, maxNeighborLodDelta, crackDetectedCount, href, readyState };
        })()`,
        returnByValue: true
      });
      const value = evaluated?.result?.value ?? null;
      lastMetrics = JSON.stringify(value);
      ready = Boolean(
        value &&
        value.phase === "after-zoom" &&
        Number.isFinite(value.fillEdgeCount) &&
        value.fillEdgeCount > 0 &&
        Number.isFinite(value.maxNeighborLodDelta) &&
        value.maxNeighborLodDelta >= 1 &&
        Number.isFinite(value.crackDetectedCount) &&
        value.crackDetectedCount >= 1
      );

      if (!ready) {
        await sleep(POLL_INTERVAL_MS);
      }
    }

    stage = "capture-dom";
    const domResult = await cdp.send("Runtime.evaluate", {
      expression: "document.documentElement.outerHTML",
      returnByValue: true
    });
    const dom = String(domResult?.result?.value ?? "");
    await writeFile(domDumpPath, dom, "utf8");
    assertDom(dom);

    stage = "capture-screenshot";
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
    if (typeof screenshot?.data === "string" && screenshot.data.length > 0) {
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      console.log(`Screenshot: ${screenshotPath}`);
    }
    console.log(`DOM dump: ${domDumpPath}`);
    console.log("surface tiles browser smoke: PASS");
    stage = "done";
  })();

  try {
    await Promise.race([runPromise, totalTimeoutPromise]);
  } finally {
    await cdp?.close().catch(() => undefined);
    await killProcess(chrome);
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
    }
    await withTimeout(
      new Promise((resolve, reject) => server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      })),
      2000,
      "Static server close timed out"
    ).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
