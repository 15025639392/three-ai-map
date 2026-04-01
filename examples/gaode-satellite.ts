import "../src/styles.css";
import { GlobeEngine, RasterLayer, TerrainTileLayer } from "../src";
import { runGaodeSatellite } from "./tile-sources-gaode-baidu";

interface SurfaceTilePlanSnapshot {
  targetZoom: number;
  interactionPhase: "idle" | "interacting";
  nodes: Array<{
    coordinate: {
      z: number;
      x: number;
      y: number;
    };
  }>;
}

interface TerrainTileDebugEntry {
  mesh: unknown;
  displayState: "parentFallback" | "readyLeaf";
}

interface RasterTileDebugEntry {
  mesh: unknown;
  requestedImageryTileKeys: string[];
}

interface SmokeSnapshot {
  interactionPhase: "idle" | "interacting";
  sharedTargetZoom: number;
  sharedLeafZooms: number[];
  terrainDisplayZooms: number[];
  terrainParentFallbackCount: number;
  terrainReadyLeafCount: number;
  rasterHostZooms: number[];
  rasterRequestedZooms: number[];
}

interface SmokeOptions {
  enabled: boolean;
  targetZoom: number;
}

const DEFAULT_TARGET_ZOOM = 18;
const BASELINE_SMOKE_ZOOM = 8;
const INTERACTION_IDLE_WAIT_MS = 320;
const MAX_SMOKE_WAIT_MS = 20_000;
const SMOKE_POLL_INTERVAL_MS = 50;

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.flex = "none";
}

function waitForVirtualTime(delayMs = 0): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function tileKeysToZooms(tileKeys: string[]): number[] {
  return uniqueSortedNumbers(tileKeys
    .map((tileKey) => Number.parseInt(tileKey.split("/")[0] ?? "", 10))
    .filter((zoom) => Number.isFinite(zoom)));
}

function sameZooms(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function coversZooms(covering: number[], required: number[]): boolean {
  return required.every((zoom) => covering.includes(zoom));
}

function maxZoom(zooms: number[]): number {
  if (zooms.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return zooms[zooms.length - 1] ?? Number.NEGATIVE_INFINITY;
}

function hasParentZoom(zooms: number[], targetZoom: number): boolean {
  return zooms.some((zoom) => zoom < targetZoom);
}

function hasExpectedFrontier(zooms: number[], targetZoom: number): boolean {
  return zooms.length > 0 && maxZoom(zooms) === targetZoom && zooms.every((zoom) => zoom <= targetZoom);
}

function formatZooms(zooms: number[]): string {
  return zooms.join(",");
}

function resolveSmokeOptions(): SmokeOptions {
  if (typeof window === "undefined") {
    return {
      enabled: false,
      targetZoom: DEFAULT_TARGET_ZOOM
    };
  }

  const params = new URLSearchParams(window.location.search);
  const enabled = params.get("smoke") === "pan";
  const requestedZoom = Number.parseInt(params.get("targetZoom") ?? "", 10);

  return {
    enabled,
    targetZoom: Number.isFinite(requestedZoom) ? requestedZoom : DEFAULT_TARGET_ZOOM
  };
}

function altitudeForTargetZoom(radius: number, targetZoom: number): number {
  const computedAltitude = (radius * 4) / (2 ** targetZoom);
  const minAltitude = radius * 0.000001;

  return Math.max(minAltitude, computedAltitude);
}

function getSourceManager(engine: GlobeEngine): {
  get(sourceId: string): unknown;
} {
  const sourceManager = Reflect.get(engine as object, "sourceManager");

  if (!sourceManager || typeof sourceManager !== "object") {
    throw new Error("Missing GlobeEngine source manager");
  }

  return sourceManager as {
    get(sourceId: string): unknown;
  };
}

function getSurfaceTilePlan(engine: GlobeEngine): SurfaceTilePlanSnapshot {
  const getter = Reflect.get(engine as object, "getSurfaceTilePlan");

  if (typeof getter !== "function") {
    throw new Error("Missing GlobeEngine surface tile plan getter");
  }

  return (getter as () => SurfaceTilePlanSnapshot).call(engine);
}

function forceInteractingPhase(engine: GlobeEngine): void {
  Reflect.set(engine as object, "surfaceTileInteractionPhase", "interacting");
  const scheduleIdleReset = Reflect.get(engine as object, "scheduleInteractionIdleReset");

  if (typeof scheduleIdleReset === "function") {
    (scheduleIdleReset as () => void).call(engine);
  }
}

function applySmokeLoadDelay(engine: GlobeEngine, detailZoom: number, delayMs = 220): void {
  const patchSourceScheduler = (source: unknown): void => {
    if (!source || typeof source !== "object") {
      return;
    }

    const scheduler = Reflect.get(source, "scheduler");

    if (!scheduler || typeof scheduler !== "object") {
      return;
    }

    const originalLoad = Reflect.get(scheduler, "loadTile");

    if (typeof originalLoad !== "function") {
      return;
    }

    Reflect.set(
      scheduler,
      "loadTile",
      async (coordinate: { z: number }, signal?: AbortSignal) => {
        if (coordinate.z >= detailZoom) {
          await waitForVirtualTime(delayMs);
        }

        return (originalLoad as (
          coordinate: { z: number },
          signal?: AbortSignal
        ) => Promise<unknown>).call(scheduler, coordinate, signal);
      }
    );
  };

  const sourceManager = getSourceManager(engine);
  const terrainSource = sourceManager.get("gaode-satellite-terrain");
  patchSourceScheduler(terrainSource);

  const rasterSource = sourceManager.get("gaode-satellite");
  patchSourceScheduler(rasterSource);
}

function getTerrainLayer(engine: GlobeEngine): TerrainTileLayer {
  const terrain = engine.getLayer("terrain");

  if (!(terrain instanceof TerrainTileLayer)) {
    throw new Error("Missing terrain layer for gaode smoke");
  }

  return terrain;
}

function getRasterLayer(engine: GlobeEngine): RasterLayer {
  const raster = engine.getLayer("gaode-satellite");

  if (!(raster instanceof RasterLayer)) {
    throw new Error("Missing raster layer for gaode smoke");
  }

  return raster;
}

function getRasterSourceMaxZoom(engine: GlobeEngine, sourceId: string): number {
  const source = getSourceManager(engine).get(sourceId);

  if (!source || typeof source !== "object") {
    throw new Error(`Missing raster source: ${sourceId}`);
  }

  const maxZoom = Reflect.get(source, "maxZoom");

  if (typeof maxZoom !== "number" || !Number.isFinite(maxZoom)) {
    throw new Error(`Invalid raster source maxZoom: ${sourceId}`);
  }

  return maxZoom;
}

function getTerrainEntries(terrain: TerrainTileLayer): Map<string, TerrainTileDebugEntry> {
  const entries = Reflect.get(terrain as object, "activeTiles");

  if (!(entries instanceof Map)) {
    throw new Error("Missing terrain active tile entries");
  }

  return entries as Map<string, TerrainTileDebugEntry>;
}

function getRasterEntries(raster: RasterLayer): Map<string, RasterTileDebugEntry> {
  const entries = Reflect.get(raster as object, "activeTiles");

  if (!(entries instanceof Map)) {
    throw new Error("Missing raster active tile entries");
  }

  return entries as Map<string, RasterTileDebugEntry>;
}

function readSmokeSnapshot(engine: GlobeEngine): SmokeSnapshot {
  const plan = getSurfaceTilePlan(engine);
  const terrain = getTerrainLayer(engine);
  const raster = getRasterLayer(engine);
  const terrainDisplayKeys = terrain.getActiveTileKeys();
  const terrainEntries = getTerrainEntries(terrain);
  const rasterEntries = getRasterEntries(raster);
  let terrainParentFallbackCount = 0;
  let terrainReadyLeafCount = 0;

  for (const key of terrainDisplayKeys) {
    const displayState = terrainEntries.get(key)?.displayState;

    if (displayState === "parentFallback") {
      terrainParentFallbackCount += 1;
      continue;
    }

    if (displayState === "readyLeaf") {
      terrainReadyLeafCount += 1;
    }
  }

  const rasterHostKeys = [...rasterEntries.keys()];
  const rasterRequestedKeys = [...rasterEntries.values()]
    .flatMap((entry) => entry.requestedImageryTileKeys);

  return {
    interactionPhase: plan.interactionPhase,
    sharedTargetZoom: plan.targetZoom,
    sharedLeafZooms: uniqueSortedNumbers(plan.nodes.map((node) => node.coordinate.z)),
    terrainDisplayZooms: tileKeysToZooms(terrainDisplayKeys),
    terrainParentFallbackCount,
    terrainReadyLeafCount,
    rasterHostZooms: tileKeysToZooms(rasterHostKeys),
    rasterRequestedZooms: tileKeysToZooms(rasterRequestedKeys)
  };
}

function writeSnapshot(stage: HTMLElement, prefix: string, snapshot: SmokeSnapshot): void {
  stage.dataset[`${prefix}SharedTargetZoom`] = `${snapshot.sharedTargetZoom}`;
  stage.dataset[`${prefix}InteractionPhase`] = snapshot.interactionPhase;
  stage.dataset[`${prefix}SharedLeafZooms`] = formatZooms(snapshot.sharedLeafZooms);
  stage.dataset[`${prefix}TerrainDisplayZooms`] = formatZooms(snapshot.terrainDisplayZooms);
  stage.dataset[`${prefix}TerrainParentFallbackCount`] = `${snapshot.terrainParentFallbackCount}`;
  stage.dataset[`${prefix}TerrainReadyLeafCount`] = `${snapshot.terrainReadyLeafCount}`;
  stage.dataset[`${prefix}RasterHostZooms`] = formatZooms(snapshot.rasterHostZooms);
  stage.dataset[`${prefix}RasterRequestedZooms`] = formatZooms(snapshot.rasterRequestedZooms);
}

async function waitForSnapshot(
  engine: GlobeEngine,
  predicate: (snapshot: SmokeSnapshot) => boolean,
  timeoutMs = MAX_SMOKE_WAIT_MS,
  onSample?: (snapshot: SmokeSnapshot) => void
): Promise<SmokeSnapshot> {
  const start = Date.now();

  while (true) {
    engine.render();
    const snapshot = readSmokeSnapshot(engine);
    onSample?.(snapshot);

    if (predicate(snapshot)) {
      return snapshot;
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for gaode smoke snapshot");
    }

    await waitForVirtualTime(SMOKE_POLL_INTERVAL_MS);
  }
}

async function runDragPanSmoke(
  engine: GlobeEngine,
  stage: HTMLElement,
  status: HTMLElement,
  targetZoom: number
): Promise<void> {
  const terrain = getTerrainLayer(engine);
  const rasterSourceMaxZoom = getRasterSourceMaxZoom(engine, "gaode-satellite");
  const terrainPlannerMaxZoom = terrain.getSurfaceTilePlannerConfig().maxZoom;
  const expectedSharedTargetZoom = Math.min(targetZoom, terrainPlannerMaxZoom);
  const expectedRasterTargetZoom = Math.min(targetZoom, rasterSourceMaxZoom);

  stage.dataset.phase = "seeking-initial";
  stage.dataset.requestedTargetZoom = `${targetZoom}`;
  stage.dataset.terrainPlannerMaxZoom = `${terrainPlannerMaxZoom}`;
  stage.dataset.rasterSourceMaxZoom = `${rasterSourceMaxZoom}`;
  status.textContent = `启动中:gaode-pan-smoke:initial:z${targetZoom}`;

  engine.setView({
    lng: 104.07,
    lat: 35.44,
    altitude: altitudeForTargetZoom(engine.radius, BASELINE_SMOKE_ZOOM)
  });

  await waitForSnapshot(
    engine,
    (snapshot) =>
      snapshot.sharedTargetZoom < expectedSharedTargetZoom &&
      snapshot.terrainDisplayZooms.length > 0 &&
      snapshot.rasterHostZooms.length > 0 &&
      snapshot.terrainDisplayZooms.some((zoom) => zoom < expectedSharedTargetZoom),
    MAX_SMOKE_WAIT_MS,
    (snapshot) => {
      writeSnapshot(stage, "current", snapshot);
    }
  );

  applySmokeLoadDelay(engine, expectedRasterTargetZoom);

  engine.setView({
    lng: 104.07,
    lat: 35.44,
    altitude: altitudeForTargetZoom(engine.radius, targetZoom)
  });
  forceInteractingPhase(engine);
  engine.render();

  stage.dataset.phase = "seeking-interacting";
  status.textContent = `启动中:gaode-pan-smoke:interacting:z${targetZoom}`;

  const interactingSnapshot = await waitForSnapshot(
    engine,
    (snapshot) =>
      snapshot.interactionPhase === "interacting" &&
      snapshot.sharedTargetZoom === expectedSharedTargetZoom &&
      hasExpectedFrontier(snapshot.sharedLeafZooms, expectedSharedTargetZoom) &&
      hasExpectedFrontier(snapshot.terrainDisplayZooms, expectedSharedTargetZoom) &&
      hasParentZoom(snapshot.terrainDisplayZooms, expectedSharedTargetZoom) &&
      coversZooms(snapshot.rasterHostZooms, snapshot.terrainDisplayZooms) &&
      snapshot.rasterRequestedZooms.includes(expectedRasterTargetZoom) &&
      hasParentZoom(snapshot.rasterRequestedZooms, expectedRasterTargetZoom),
    MAX_SMOKE_WAIT_MS,
    (snapshot) => {
      writeSnapshot(stage, "current", snapshot);
    }
  );
  writeSnapshot(stage, "interacting", interactingSnapshot);

  stage.dataset.phase = "seeking-idle";
  status.textContent = `启动中:gaode-pan-smoke:idle:z${targetZoom}`;

  await waitForVirtualTime(INTERACTION_IDLE_WAIT_MS);

  const idleSnapshot = await waitForSnapshot(
    engine,
    (snapshot) =>
      snapshot.interactionPhase === "idle" &&
      snapshot.sharedTargetZoom === expectedSharedTargetZoom &&
      hasExpectedFrontier(snapshot.sharedLeafZooms, expectedSharedTargetZoom) &&
      snapshot.terrainParentFallbackCount === 0 &&
      sameZooms(snapshot.terrainDisplayZooms, snapshot.sharedLeafZooms) &&
      coversZooms(snapshot.rasterHostZooms, snapshot.terrainDisplayZooms) &&
      snapshot.rasterRequestedZooms.includes(expectedRasterTargetZoom),
    MAX_SMOKE_WAIT_MS,
    (snapshot) => {
      writeSnapshot(stage, "current", snapshot);
    }
  );
  writeSnapshot(stage, "idle", idleSnapshot);

  const allExpected =
    interactingSnapshot.sharedTargetZoom === expectedSharedTargetZoom &&
    hasExpectedFrontier(interactingSnapshot.sharedLeafZooms, expectedSharedTargetZoom) &&
    hasExpectedFrontier(interactingSnapshot.terrainDisplayZooms, expectedSharedTargetZoom) &&
    hasParentZoom(interactingSnapshot.terrainDisplayZooms, expectedSharedTargetZoom) &&
    coversZooms(interactingSnapshot.rasterHostZooms, interactingSnapshot.terrainDisplayZooms) &&
    interactingSnapshot.rasterRequestedZooms.includes(expectedRasterTargetZoom) &&
    hasParentZoom(interactingSnapshot.rasterRequestedZooms, expectedRasterTargetZoom) &&
    idleSnapshot.sharedTargetZoom === expectedSharedTargetZoom &&
    hasExpectedFrontier(idleSnapshot.sharedLeafZooms, expectedSharedTargetZoom) &&
    idleSnapshot.terrainParentFallbackCount === 0 &&
    sameZooms(idleSnapshot.terrainDisplayZooms, idleSnapshot.sharedLeafZooms) &&
    coversZooms(idleSnapshot.rasterHostZooms, idleSnapshot.terrainDisplayZooms) &&
    idleSnapshot.rasterRequestedZooms.includes(expectedRasterTargetZoom);

  stage.dataset.phase = "after-idle";
  stage.dataset.allExpected = `${allExpected}`;
  status.textContent =
    `after-idle:${formatZooms(interactingSnapshot.terrainDisplayZooms)}->` +
    `${formatZooms(idleSnapshot.terrainDisplayZooms)}|` +
    `${formatZooms(interactingSnapshot.rasterRequestedZooms)}->${formatZooms(idleSnapshot.rasterRequestedZooms)}`;

  (
    window as Window & {
      __gaodePanSmoke?: {
        engine: GlobeEngine;
        interactingSnapshot: SmokeSnapshot;
        idleSnapshot: SmokeSnapshot;
      };
    }
  ).__gaodePanSmoke = {
    engine,
    interactingSnapshot,
    idleSnapshot
  };
}

export function bootstrap(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("Missing #app container");

  app.innerHTML = `
    <main class="demo-shell">
      <a class="back-link" href="/">返回演示列表</a>
      <div class="demo-viewport" id="globe-stage"></div>
      <div class="demo-status" id="status-output">正在加载高德卫星...</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  const smokeOptions = resolveSmokeOptions();

  if (stage && status) {
    if (smokeOptions.enabled) {
      setStageSize(stage, 960, 540);
    }

    const engine = runGaodeSatellite(stage, status);

    if (smokeOptions.enabled) {
      void runDragPanSmoke(engine, stage, status, smokeOptions.targetZoom)
        .catch((error) => {
          stage.dataset.phase = "error";
          stage.dataset.allExpected = "false";
          status.textContent = error instanceof Error ? `error:${error.message}` : "error:unknown";
        });
    }
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
