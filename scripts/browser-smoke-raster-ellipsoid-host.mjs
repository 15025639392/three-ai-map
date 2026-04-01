import { spawn, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = resolve(rootDir, "dist");
const resultsDir = resolve(rootDir, "test-results");
const screenshotPath = resolve(resultsDir, "raster-layer-ellipsoid-host-smoke.png");
const domDumpPath = resolve(resultsDir, "raster-layer-ellipsoid-host-smoke.html");
const pageName = "raster-layer-ellipsoid-host-regression.html";
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
  const rasterMeshCount = Number(getAttr(dom, "raster-mesh-count") ?? "NaN");
  const requestedImageryCount = Number(getAttr(dom, "requested-imagery-count") ?? "NaN");
  const requestedImageryMaxZoom = Number(getAttr(dom, "requested-imagery-max-zoom") ?? "NaN");
  const expectedImageryTargetZoom = Number(getAttr(dom, "expected-imagery-target-zoom") ?? "NaN");

  if (phase !== "after-ellipsoid-imagery") {
    throw new Error(`Expected phase=after-ellipsoid-imagery, got ${phase ?? "missing"}`);
  }

  if (!Number.isFinite(rasterMeshCount) || rasterMeshCount <= 0) {
    throw new Error(`Expected raster mesh count > 0 without terrain host, got ${rasterMeshCount}`);
  }

  if (!Number.isFinite(requestedImageryCount) || requestedImageryCount <= 0) {
    throw new Error(`Expected requested imagery count > 0, got ${requestedImageryCount}`);
  }

  if (!Number.isFinite(expectedImageryTargetZoom)) {
    throw new Error("Expected finite imagery target zoom");
  }

  if (!Number.isFinite(requestedImageryMaxZoom) || requestedImageryMaxZoom < expectedImageryTargetZoom) {
    throw new Error(
      `Expected requested imagery max zoom >= target (${requestedImageryMaxZoom} < ${expectedImageryTargetZoom})`
    );
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
    console.log("raster ellipsoid host browser smoke: PASS");
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
