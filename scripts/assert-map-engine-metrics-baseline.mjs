import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const resultsDir = resolve(rootDir, "test-results");
const baselineDiffPath = resolve(resultsDir, "map-engine-metrics-baseline-diff.json");
const rasterDomPath = resolve(resultsDir, "raster-layer-ellipsoid-host-smoke.html");
const surfaceDomPath = resolve(resultsDir, "surface-tile-zoom-regression-smoke.html");

function getAttr(dom, name) {
  const match = dom.match(new RegExp(`data-${name}="([^"]+)"`));
  return match?.[1] ?? null;
}

function toNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric metric ${label}: ${value ?? "missing"}`);
  }
  return parsed;
}

async function readRequiredFile(path) {
  await access(path);
  return readFile(path, "utf8");
}

function evaluateRasterHost(dom) {
  const phase = getAttr(dom, "phase");
  const rasterMeshCount = toNumber(getAttr(dom, "raster-mesh-count"), "raster-mesh-count");
  const requestedImageryCount = toNumber(
    getAttr(dom, "requested-imagery-count"),
    "requested-imagery-count"
  );
  const requestedImageryMaxZoom = toNumber(
    getAttr(dom, "requested-imagery-max-zoom"),
    "requested-imagery-max-zoom"
  );
  const expectedImageryTargetZoom = toNumber(
    getAttr(dom, "expected-imagery-target-zoom"),
    "expected-imagery-target-zoom"
  );

  return {
    phase,
    rasterMeshCount,
    requestedImageryCount,
    requestedImageryMaxZoom,
    expectedImageryTargetZoom,
    assertions: {
      phase: phase === "after-ellipsoid-imagery",
      rasterMeshCount: rasterMeshCount > 0,
      requestedImageryCount: requestedImageryCount > 0,
      maxZoomCoverage: requestedImageryMaxZoom >= expectedImageryTargetZoom
    }
  };
}

function evaluateSurfaceZoom(dom) {
  const phase = getAttr(dom, "phase");
  const fillEdgeCount = toNumber(getAttr(dom, "fill-edge-count"), "fill-edge-count");
  const fillCornerCount = toNumber(getAttr(dom, "fill-corner-count"), "fill-corner-count");
  const maxNeighborLodDelta = toNumber(
    getAttr(dom, "max-neighbor-lod-delta"),
    "max-neighbor-lod-delta"
  );
  const crackDetectedCount = toNumber(
    getAttr(dom, "crack-detected-count"),
    "crack-detected-count"
  );

  return {
    phase,
    fillEdgeCount,
    fillCornerCount,
    maxNeighborLodDelta,
    crackDetectedCount,
    assertions: {
      phase: phase === "after-zoom",
      fillEdgeCount: fillEdgeCount > 0,
      fillCornerCount: fillCornerCount > 0,
      maxNeighborLodDelta: maxNeighborLodDelta >= 1,
      crackDetectedCount: crackDetectedCount >= 1
    }
  };
}

async function main() {
  await mkdir(resultsDir, { recursive: true });

  const [rasterDom, surfaceDom] = await Promise.all([
    readRequiredFile(rasterDomPath),
    readRequiredFile(surfaceDomPath)
  ]);

  const raster = evaluateRasterHost(rasterDom);
  const surface = evaluateSurfaceZoom(surfaceDom);
  const assertions = {
    ...Object.fromEntries(
      Object.entries(raster.assertions).map(([key, value]) => [`raster.${key}`, value])
    ),
    ...Object.fromEntries(
      Object.entries(surface.assertions).map(([key, value]) => [`surface.${key}`, value])
    )
  };
  const failed = Object.entries(assertions).filter(([, value]) => !value).map(([key]) => key);
  const report = {
    generatedAt: new Date().toISOString(),
    raster,
    surface,
    assertions,
    failed
  };

  await writeFile(baselineDiffPath, JSON.stringify(report, null, 2), "utf8");

  if (failed.length > 0) {
    throw new Error(`Metrics baseline failed: ${failed.join(", ")}`);
  }

  console.log(`Baseline report: ${baselineDiffPath}`);
  console.log("metrics baseline: PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
