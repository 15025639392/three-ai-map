import { spawn, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = resolve(rootDir, "dist");
const resultsDir = resolve(rootDir, "test-results");
const screenshotPath = resolve(resultsDir, "camera-pinch-regression-smoke.png");
const domDumpPath = resolve(resultsDir, "camera-pinch-regression-smoke.html");
const pageName = "camera-pinch-regression.html";
const DEFAULT_VIRTUAL_TIME_BUDGET_MS = 12000;

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
  const beforeAltitude = Number(getAttr(dom, "before-altitude") ?? "NaN");
  const afterPinchAltitude = Number(getAttr(dom, "after-pinch-altitude") ?? "NaN");
  const afterInertiaAltitude = Number(getAttr(dom, "after-inertia-altitude") ?? "NaN");
  const afterPinchAnchorError = Number(getAttr(dom, "after-pinch-anchor-error-meters") ?? "NaN");
  const afterInertiaAnchorError = Number(getAttr(dom, "after-inertia-anchor-error-meters") ?? "NaN");
  const afterPinchAnchorVisible = getAttr(dom, "after-pinch-anchor-visible");
  const afterPinchAnchorKind = getAttr(dom, "after-pinch-anchor-kind");
  const nativeTouchAction = getAttr(dom, "native-touch-action");

  if (phase !== "after-inertia") {
    throw new Error(`Expected phase=after-inertia, got ${phase ?? "missing"}`);
  }

  if (!Number.isFinite(beforeAltitude) || !Number.isFinite(afterPinchAltitude) || !Number.isFinite(afterInertiaAltitude)) {
    throw new Error("Expected finite altitude metrics in camera interaction regression DOM");
  }

  if (!(afterPinchAltitude < beforeAltitude)) {
    throw new Error(
      `Expected pinch altitude to decrease (${afterPinchAltitude} < ${beforeAltitude})`
    );
  }

  if (!(afterInertiaAltitude < afterPinchAltitude)) {
    throw new Error(
      `Expected inertia altitude to continue decreasing (${afterInertiaAltitude} < ${afterPinchAltitude})`
    );
  }

  if (!Number.isFinite(afterPinchAnchorError) || afterPinchAnchorError > 0.01) {
    throw new Error(
      `Expected pinch anchor error <= 0.01m, got ${afterPinchAnchorError}`
    );
  }

  if (!Number.isFinite(afterInertiaAnchorError) || afterInertiaAnchorError > 0.01) {
    throw new Error(
      `Expected inertia anchor error <= 0.01m, got ${afterInertiaAnchorError}`
    );
  }

  if (afterPinchAnchorVisible !== "true") {
    throw new Error(
      `Expected after-pinch anchor overlay to be visible, got ${afterPinchAnchorVisible ?? "missing"}`
    );
  }

  if (afterPinchAnchorKind !== "zoom") {
    throw new Error(
      `Expected after-pinch anchor kind to be zoom, got ${afterPinchAnchorKind ?? "missing"}`
    );
  }

  if (nativeTouchAction !== "none") {
    throw new Error(
      `Expected canvas touch-action to be none, got ${nativeTouchAction ?? "missing"}`
    );
  }

  if (!dom.includes('data-role="interaction-anchor"')) {
    throw new Error("Expected interaction anchor overlay DOM to exist");
  }
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

function runChrome(chromePath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(chromePath, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`Chrome exited with code ${code}\n${stderr}`));
    });
  });
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

async function main() {
  await access(distDir);
  await mkdir(resultsDir, { recursive: true });

  const chromePath = await findChromePath();
  const server = createStaticServer(distDir);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve static server port");
    }

    const url = `http://127.0.0.1:${address.port}/${pageName}`;
    const runArgs = [
      "--headless=new",
      "--disable-gpu",
      "--use-angle=swiftshader",
      "--hide-scrollbars",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      "--run-all-compositor-stages-before-draw",
      "--window-size=1280,900",
      `--virtual-time-budget=${DEFAULT_VIRTUAL_TIME_BUDGET_MS}`
    ];

    await runChrome(chromePath, [...runArgs, `--screenshot=${screenshotPath}`, url]);
    const { stdout: dom } = await runChrome(chromePath, [...runArgs, "--dump-dom", url]);

    await writeFile(domDumpPath, dom, "utf8");
    assertDom(dom);

    console.log(`Screenshot: ${screenshotPath}`);
    console.log(`DOM dump: ${domDumpPath}`);
    console.log("camera interaction browser smoke: PASS");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    }));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
