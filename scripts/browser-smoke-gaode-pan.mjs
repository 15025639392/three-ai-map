import { spawn, spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = resolve(rootDir, "dist");
const resultsDir = resolve(rootDir, "test-results");
const screenshotPath = resolve(resultsDir, "gaode-satellite-drag-smoke.png");
const domDumpPath = resolve(resultsDir, "gaode-satellite-drag-smoke.html");
const pageName = "gaode-satellite.html";
const DEFAULT_VIRTUAL_TIME_BUDGET_MS = 60000;
const targetZoom = Number.parseInt(process.env.GAODE_PAN_TARGET_ZOOM ?? "18", 10);

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

function parseZoomList(raw) {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
}

function sameZooms(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function maxZoom(list) {
  if (list.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return list[list.length - 1] ?? Number.NEGATIVE_INFINITY;
}

function hasParentZoom(list, target) {
  return list.some((zoom) => zoom < target);
}

function assertFrontier(list, target, label) {
  if (list.length === 0) {
    throw new Error(`Expected ${label} to be non-empty`);
  }

  if (maxZoom(list) !== target) {
    throw new Error(`Expected max(${label})=${target}, got [${list.join(",")}]`);
  }

  if (list.some((zoom) => zoom > target)) {
    throw new Error(`Expected ${label} <= ${target}, got [${list.join(",")}]`);
  }
}

function assertDom(dom) {
  const phase = getAttr(dom, "phase");
  const requestedTargetZoom = Number(getAttr(dom, "requested-target-zoom") ?? "NaN");
  const terrainPlannerMaxZoom = Number(getAttr(dom, "terrain-planner-max-zoom") ?? "NaN");
  const rasterSourceMaxZoom = Number(getAttr(dom, "raster-source-max-zoom") ?? "NaN");
  const interactingSharedTargetZoom = Number(getAttr(dom, "interacting-shared-target-zoom") ?? "NaN");
  const idleSharedTargetZoom = Number(getAttr(dom, "idle-shared-target-zoom") ?? "NaN");
  const interactingTerrainParentFallbackCount = Number(
    getAttr(dom, "interacting-terrain-parent-fallback-count") ?? "NaN"
  );
  const idleTerrainParentFallbackCount = Number(
    getAttr(dom, "idle-terrain-parent-fallback-count") ?? "NaN"
  );
  const interactingSharedLeafZooms = parseZoomList(getAttr(dom, "interacting-shared-leaf-zooms"));
  const idleSharedLeafZooms = parseZoomList(getAttr(dom, "idle-shared-leaf-zooms"));
  const interactingTerrainDisplayZooms = parseZoomList(getAttr(dom, "interacting-terrain-display-zooms"));
  const idleTerrainDisplayZooms = parseZoomList(getAttr(dom, "idle-terrain-display-zooms"));
  const interactingRasterHostZooms = parseZoomList(getAttr(dom, "interacting-raster-host-zooms"));
  const idleRasterHostZooms = parseZoomList(getAttr(dom, "idle-raster-host-zooms"));
  const interactingRasterRequestedZooms = parseZoomList(getAttr(dom, "interacting-raster-requested-zooms"));
  const idleRasterRequestedZooms = parseZoomList(getAttr(dom, "idle-raster-requested-zooms"));
  const allExpected = getAttr(dom, "all-expected");

  if (phase !== "after-idle") {
    throw new Error(`Expected phase=after-idle, got ${phase ?? "missing"}`);
  }

  if (!Number.isFinite(requestedTargetZoom) || requestedTargetZoom !== targetZoom) {
    throw new Error(
      `Expected requestedTargetZoom=${targetZoom}, got ${requestedTargetZoom}`
    );
  }

  if (!Number.isFinite(terrainPlannerMaxZoom)) {
    throw new Error("Expected finite terrain planner max zoom");
  }
  if (!Number.isFinite(rasterSourceMaxZoom)) {
    throw new Error("Expected finite raster source max zoom");
  }

  const expectedSharedTargetZoom = Math.min(requestedTargetZoom, terrainPlannerMaxZoom);
  const expectedRasterTargetZoom = Math.min(requestedTargetZoom, rasterSourceMaxZoom);

  if (interactingSharedTargetZoom !== expectedSharedTargetZoom) {
    throw new Error(
      `Expected interacting shared target zoom ${expectedSharedTargetZoom}, got ${interactingSharedTargetZoom}`
    );
  }

  if (idleSharedTargetZoom !== expectedSharedTargetZoom) {
    throw new Error(
      `Expected idle shared target zoom ${expectedSharedTargetZoom}, got ${idleSharedTargetZoom}`
    );
  }

  assertFrontier(interactingSharedLeafZooms, expectedSharedTargetZoom, "interacting shared leaf zooms");
  assertFrontier(idleSharedLeafZooms, expectedSharedTargetZoom, "idle shared leaf zooms");

  if (!Number.isFinite(interactingTerrainParentFallbackCount) || interactingTerrainParentFallbackCount < 0) {
    throw new Error(
      `Expected interacting terrain parent fallback count >= 0, got ${interactingTerrainParentFallbackCount}`
    );
  }

  if (!Number.isFinite(idleTerrainParentFallbackCount) || idleTerrainParentFallbackCount !== 0) {
    throw new Error(
      `Expected idle terrain parent fallback count = 0, got ${idleTerrainParentFallbackCount}`
    );
  }

  assertFrontier(interactingTerrainDisplayZooms, expectedSharedTargetZoom, "interacting terrain display zooms");

  if (!hasParentZoom(interactingTerrainDisplayZooms, expectedSharedTargetZoom)) {
    throw new Error(
      `Expected interacting terrain display zooms to include a parent fallback below ${expectedSharedTargetZoom}, got [${interactingTerrainDisplayZooms.join(",")}]`
    );
  }

  if (!sameZooms(idleTerrainDisplayZooms, idleSharedLeafZooms)) {
    throw new Error(
      `Expected idle terrain display zooms [${idleSharedLeafZooms.join(",")}] to match idle shared leaf zooms, got [${idleTerrainDisplayZooms.join(",")}]`
    );
  }

  if (!sameZooms(interactingRasterHostZooms, interactingTerrainDisplayZooms)) {
    throw new Error(
      `Expected interacting raster host zooms [${interactingTerrainDisplayZooms.join(",")}] to match terrain display zooms, got [${interactingRasterHostZooms.join(",")}]`
    );
  }

  if (!sameZooms(idleRasterHostZooms, idleTerrainDisplayZooms)) {
    throw new Error(
      `Expected idle raster host zooms [${idleTerrainDisplayZooms.join(",")}] to match terrain display zooms, got [${idleRasterHostZooms.join(",")}]`
    );
  }

  if (!interactingRasterRequestedZooms.includes(expectedRasterTargetZoom)) {
    throw new Error(
      `Expected interacting raster requested zooms to include ${expectedRasterTargetZoom}, got [${interactingRasterRequestedZooms.join(",")}]`
    );
  }

  if (!interactingRasterRequestedZooms.some((zoom) => zoom < expectedRasterTargetZoom)) {
    throw new Error(
      `Expected interacting raster requested zooms to include a parent fallback below ${expectedRasterTargetZoom}, got [${interactingRasterRequestedZooms.join(",")}]`
    );
  }

  if (!idleRasterRequestedZooms.includes(expectedRasterTargetZoom)) {
    throw new Error(
      `Expected idle raster requested zooms to include ${expectedRasterTargetZoom}, got [${idleRasterRequestedZooms.join(",")}]`
    );
  }

  if (allExpected !== "true") {
    throw new Error(`Expected data-all-expected=true, got ${allExpected ?? "missing"}`);
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

    const url = `http://127.0.0.1:${address.port}/${pageName}?smoke=pan&targetZoom=${targetZoom}`;
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

    const { stdout: dom } = await runChrome(
      chromePath,
      [...runArgs, `--screenshot=${screenshotPath}`, "--dump-dom", url]
    );

    await writeFile(domDumpPath, dom, "utf8");
    assertDom(dom);

    console.log(`Screenshot: ${screenshotPath}`);
    console.log(`DOM dump: ${domDumpPath}`);
    console.log("gaode pan browser smoke: PASS");
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
