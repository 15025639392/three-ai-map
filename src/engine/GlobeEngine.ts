import { Group, Raycaster, Vector2 } from "three";
import { CameraController } from "../core/CameraController";
import { InteractionAnchorOverlay } from "../core/InteractionAnchorOverlay";
import { SceneSystem } from "../core/SceneSystem";
import { DebugOverlay } from "../diagnostics/DebugOverlay";
import { type DebugState } from "../diagnostics/DebugState";
import { PerformanceMonitor, type PerformanceReport } from "../diagnostics/PerformanceMonitor";
import { cartesianToCartographic } from "../geo/projection";
import { intersectRayWithSphere } from "../geo/raycast";
import {
  createDefaultRenderer,
  EngineView,
  GlobeEngineRecoveryRule,
  GlobeEngineOptions,
  RecoveryPolicyStats,
  RendererAdapter
} from "./EngineOptions";
import { AtmosphereMesh } from "../globe/AtmosphereMesh";
import { GlobeMesh } from "../scene/GlobeMesh";
import { Starfield } from "../globe/Starfield";
import {
  Layer,
  LayerErrorPayload,
  LayerRecoveryOverrides,
  LayerRecoveryQuery,
  MarkerDefinition,
  PickResult,
  PolygonDefinition,
  PolylineDefinition
} from "../layers/Layer";
import { LayerManager } from "../layers/LayerManager";
import { MarkerLayer } from "../layers/MarkerLayer";
import { PolygonLayer } from "../layers/PolygonLayer";
import { PolylineLayer } from "../layers/PolylineLayer";
import { EventEmitter } from "../utils/EventEmitter";
import { Source } from "../sources/Source";
import { SourceManager } from "../sources/SourceManager";
import { RasterTileSource } from "../sources/RasterTileSource";
import { RasterLayer } from "../layers/RasterLayer";
import { TerrainTileLayer } from "../layers/TerrainTileLayer";
import { SurfaceSystem } from "../surface/SurfaceSystem";

export interface GlobeEngineEvents {
  click: {
    originalEvent: MouseEvent;
    pickResult: PickResult | null;
  };
  error: LayerErrorPayload;
}

interface RecoveryStageStats extends RecoveryPolicyStats {
  queryCount: number;
  hitCount: number;
  ruleHitCount: number;
}

interface WaitForSourceOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

const DEFAULT_AUTO_IMAGERY_SOURCE_ID = "raster";
const DEFAULT_WAIT_FOR_SOURCE_TIMEOUT_MS = 2_000;
const DEFAULT_WAIT_FOR_SOURCE_POLL_INTERVAL_MS = 16;

export class GlobeEngine {
  readonly container: HTMLElement;
  readonly radius: number;
  readonly sceneSystem: SceneSystem;
  readonly globe: GlobeMesh;
  readonly atmosphere: AtmosphereMesh;
  readonly starfield: Starfield;
  readonly performanceMonitor: PerformanceMonitor;

  private readonly rendererSystem: RendererAdapter;
  private readonly cameraController: CameraController;
  private readonly overlayLayerManager: LayerManager;
  private readonly surfaceSystem: SurfaceSystem;
  private readonly layerRegistry = new Map<string, Layer>();
  private readonly surfaceRoot = new Group();
  private readonly overlayRoot = new Group();
  private readonly sourceManager: SourceManager;
  private readonly interactionAnchorOverlay: InteractionAnchorOverlay | null;
  private readonly debugOverlay: DebugOverlay | null;
  private readonly showBaseGlobe: boolean;
  private readonly recoveryPolicyDefaults: LayerRecoveryOverrides;
  private readonly recoveryPolicyRules: GlobeEngineRecoveryRule[];
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly events = new EventEmitter<GlobeEngineEvents>();
  private readonly autoImageryLayerIds = new Map<string, string>();
  private markerLayer: MarkerLayer | null = null;
  private polylineLayer: PolylineLayer | null = null;
  private polygonLayer: PolygonLayer | null = null;
  private pendingRenderFrameId: number | null = null;
  private suppressInteractionPhaseForProgrammaticView = false;
  private renderCount = 0;
  private errorCount = 0;
  private recoveryPolicyQueryCount = 0;
  private recoveryPolicyHitCount = 0;
  private recoveryPolicyRuleHitCount = 0;
  private readonly recoveryPolicyStageStats = new Map<string, RecoveryStageStats>();
  private lastRenderTimestamp: number | null = null;

  constructor({
    container,
    radius = 1,
    background = "#03060d",
    showBaseGlobe = true,
    showInteractionAnchor = false,
    showDebugOverlay = false,
    camera,
    recoveryPolicy,
    rendererFactory = createDefaultRenderer
  }: GlobeEngineOptions) {
    if (!container) {
      throw new Error("container is required");
    }

    this.container = container;
    this.radius = radius;
    this.showBaseGlobe = showBaseGlobe;
    this.sceneSystem = new SceneSystem({
      fieldOfView: camera?.fov,
      near: camera?.near,
      far: camera?.far
    });
    this.rendererSystem = rendererFactory({
      container,
      clearColor: background
    });
    this.rendererSystem.renderer.domElement.style.touchAction = "none";
    this.rendererSystem.renderer.domElement.style.userSelect = "none";
    this.rendererSystem.renderer.domElement.style.webkitUserSelect = "none";
    this.rendererSystem.renderer.domElement.style.setProperty(
      "-webkit-tap-highlight-color",
      "transparent"
    );
    this.recoveryPolicyDefaults = { ...(recoveryPolicy?.defaults ?? {}) };
    this.recoveryPolicyRules = [...(recoveryPolicy?.rules ?? [])];
    this.globe = new GlobeMesh({ radius });
    this.atmosphere = new AtmosphereMesh(radius);
    this.starfield = new Starfield(1200, radius * 18);
    this.performanceMonitor = new PerformanceMonitor();
    this.surfaceRoot.name = "surface-pass-root";
    this.overlayRoot.name = "overlay-pass-root";
    this.sceneSystem.scene.add(this.starfield.points);
    if (showBaseGlobe) {
      this.sceneSystem.scene.add(this.globe.mesh);
    }
    this.sceneSystem.scene.add(this.atmosphere.mesh);
    this.sceneSystem.scene.add(this.surfaceRoot);
    this.sceneSystem.scene.add(this.overlayRoot);
    this.sourceManager = new SourceManager({
      requestRender: this.requestRender,
      resolveRecovery: this.resolveLayerRecovery
    });
    this.overlayLayerManager = new LayerManager({
      scene: this.overlayRoot,
      camera: this.sceneSystem.camera,
      radius,
      rendererElement: this.rendererSystem.renderer.domElement,
      requestRender: this.requestRender,
      reportError: this.handleLayerError,
      resolveRecovery: this.resolveLayerRecovery,
      getSource: (id: string) => this.sourceManager.get(id)
    });
    this.surfaceSystem = new SurfaceSystem({
      scene: this.surfaceRoot,
      camera: this.sceneSystem.camera,
      radius,
      rendererElement: this.rendererSystem.renderer.domElement,
      getRenderer: () => this.rendererSystem.getWebGLRenderer?.() ?? null,
      requestRender: this.requestRender,
      reportError: this.handleLayerError,
      resolveRecovery: this.resolveLayerRecovery,
      getSource: (id: string) => this.sourceManager.get(id)
    });

    this.cameraController = new CameraController({
      camera: this.sceneSystem.camera,
      element: this.rendererSystem.renderer.domElement,
      globeRadius: radius,
      onChange: this.handleCameraChange
    });
    this.interactionAnchorOverlay = showInteractionAnchor
      ? new InteractionAnchorOverlay(this.container)
      : null;
    this.debugOverlay = showDebugOverlay ? new DebugOverlay(this.container) : null;

    this.resize();
    this.setView({ lng: 0, lat: 20, altitude: radius * 2.2 });
    window.addEventListener("resize", this.handleResize);
    this.rendererSystem.renderer.domElement.addEventListener("click", this.handleClick);
    this.rendererSystem.renderer.domElement.addEventListener("contextmenu", this.handleContextMenu);
    this.render();
  }

  setView(view: EngineView): void {
    this.suppressInteractionPhaseForProgrammaticView = true;
    this.cancelScheduledRender();

    try {
      this.cameraController.setView(view);
      this.requestRender();
    } finally {
      this.suppressInteractionPhaseForProgrammaticView = false;
    }
  }

  getView(): EngineView {
    return this.cameraController.getView();
  }

  resize(): void {
    const width = this.container.clientWidth || this.container.getBoundingClientRect().width || 1;
    const height =
      this.container.clientHeight || this.container.getBoundingClientRect().height || 1;
    const aspect = width / height;

    this.sceneSystem.setAspect(aspect);
    this.cameraController.setAspect(aspect);
    this.rendererSystem.setSize(width, height);
    this.render();
  }

  render(): void {
    const now = performance.now();
    const deltaTime = this.lastRenderTimestamp === null
      ? 1000 / 60
      : Math.max(0.0001, now - this.lastRenderTimestamp);
    this.lastRenderTimestamp = now;
    this.cameraController.update();
    this.interactionAnchorOverlay?.update(this.cameraController.getInteractionDebugState());
    this.sceneSystem.camera.updateMatrixWorld(true);
    this.surfaceSystem.update(deltaTime);
    this.overlayLayerManager.update(deltaTime);
    this.applyBaseGlobeTerrainInset();
    this.rendererSystem.render(this.sceneSystem.scene, this.sceneSystem.camera);
    this.renderCount += 1;
    this.performanceMonitor.update(deltaTime);
    this.performanceMonitor.trackMetric("renderCount", this.renderCount);
    this.performanceMonitor.trackMetric("errorCount", this.errorCount);
    this.performanceMonitor.trackMetric("layerCount", this.layerRegistry.size);
    this.performanceMonitor.trackMetric("sceneObjectCount", this.sceneSystem.scene.children.length);
    this.performanceMonitor.trackMetric("cameraAltitude", this.getView().altitude);
    this.debugOverlay?.update(this.getDebugState());
  }

  addLayer(layer: Layer): void {
    if (this.layerRegistry.has(layer.id)) {
      throw new Error(`Layer "${layer.id}" already exists`);
    }

    if (this.isSurfaceLayer(layer)) {
      this.surfaceSystem.add(layer);
      this.applyBaseGlobeTerrainInset();
    } else {
      this.overlayLayerManager.add(layer);
    }

    this.layerRegistry.set(layer.id, layer);
    this.render();
  }

  removeLayer(layerId: string): void {
    const existing = this.layerRegistry.get(layerId);

    if (!existing) {
      return;
    }

    if (this.markerLayer?.id === layerId) {
      this.markerLayer = null;
    }
    if (this.polylineLayer?.id === layerId) {
      this.polylineLayer = null;
    }
    if (this.polygonLayer?.id === layerId) {
      this.polygonLayer = null;
    }

    if (this.isSurfaceLayer(existing)) {
      this.surfaceSystem.remove(layerId);
      this.applyBaseGlobeTerrainInset();
    } else {
      this.overlayLayerManager.remove(layerId);
    }

    this.layerRegistry.delete(layerId);
    this.render();
  }

  getLayer(layerId: string): Layer | undefined {
    return this.layerRegistry.get(layerId);
  }

  addSource(id: string, source: Source): void {
    const shouldAutoAttachImagery = source instanceof RasterTileSource
      && source.id === DEFAULT_AUTO_IMAGERY_SOURCE_ID
      && source.id !== id;

    if (shouldAutoAttachImagery) {
      source.id = id;
    }

    this.sourceManager.add(id, source);

    if (shouldAutoAttachImagery) {
      const autoLayerId = `__auto-imagery:${id}`;
      this.autoImageryLayerIds.set(id, autoLayerId);
      this.addLayer(new RasterLayer({ id: autoLayerId, source: id }));
      return;
    }

    this.requestRender();
  }

  removeSource(id: string): void {
    const autoLayerId = this.autoImageryLayerIds.get(id);

    if (autoLayerId) {
      this.removeLayer(autoLayerId);
      this.autoImageryLayerIds.delete(id);
    }

    this.sourceManager.remove(id);
  }

  getSource(id: string): Source | undefined {
    return this.sourceManager.get(id);
  }

  getDebugState(): DebugState {
    const metrics = this.performanceMonitor.getMetrics();

    return {
      fps: metrics.fps,
      frameTimeMs: metrics.frameTimeMs,
      activeImageryTiles: this.surfaceSystem.getVisibleImageryTileCount(),
      activeTerrainTiles: this.surfaceSystem.getActiveTerrainTileCount(),
      visibleTiles: this.surfaceSystem.getVisibleTileCount(),
      imageryRequestCount: this.surfaceSystem.getImageryRequestCount(),
      imageryHostSwapCount: this.surfaceSystem.getImageryHostSwapCount(),
      imageryAncestorFallbackCount: this.surfaceSystem.getImageryAncestorFallbackCount(),
      terrainRequestCount: this.surfaceSystem.getTerrainRequestCount(),
      terrainDecodeFallbackCount: this.surfaceSystem.getTerrainDecodeFallbackCount(),
      errorCount: this.errorCount,
      recoveryPolicyQueryCount: this.recoveryPolicyQueryCount,
      recoveryPolicyHitCount: this.recoveryPolicyHitCount,
      recoveryPolicyRuleHitCount: this.recoveryPolicyRuleHitCount
    };
  }

  async waitForSource(
    id: string,
    options: WaitForSourceOptions = {}
  ): Promise<void> {
    const source = this.getSource(id);

    if (!(source instanceof RasterTileSource)) {
      return;
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_FOR_SOURCE_TIMEOUT_MS;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_WAIT_FOR_SOURCE_POLL_INTERVAL_MS;
    const startedAt = performance.now();

    while (performance.now() - startedAt <= timeoutMs) {
      this.render();

      if (
        this.surfaceSystem.getVisibleImageryTileCount(id) > 0
        && this.surfaceSystem.getVisibleTileCount() > 0
        && this.surfaceSystem.getImageryRequestCount(id) > 0
      ) {
        return;
      }

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, pollIntervalMs);
      });
    }

    throw new Error(`Timed out waiting for source "${id}"`);
  }

  addMarker(marker: MarkerDefinition): void {
    if (!this.markerLayer) {
      this.markerLayer = new MarkerLayer("markers");
      this.addLayer(this.markerLayer);
    }

    this.markerLayer.addMarker(marker);
    this.render();
  }

  addPolyline(polyline: PolylineDefinition): void {
    if (!this.polylineLayer) {
      this.polylineLayer = new PolylineLayer("polylines");
      this.addLayer(this.polylineLayer);
    }

    this.polylineLayer.addPolyline(polyline);
    this.render();
  }

  addPolygon(polygon: PolygonDefinition): void {
    if (!this.polygonLayer) {
      this.polygonLayer = new PolygonLayer("polygons");
      this.addLayer(this.polygonLayer);
    }

    this.polygonLayer.addPolygon(polygon);
    this.render();
  }

  on<TKey extends keyof GlobeEngineEvents>(
    eventName: TKey,
    handler: (payload: GlobeEngineEvents[TKey]) => void
  ): () => void {
    return this.events.on(eventName, handler);
  }

  off<TKey extends keyof GlobeEngineEvents>(
    eventName: TKey,
    handler: (payload: GlobeEngineEvents[TKey]) => void
  ): void {
    this.events.off(eventName, handler);
  }

  pick(screenX: number, screenY: number): PickResult | null {
    const rect = this.rendererSystem.renderer.domElement.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    this.pointer.x = ((screenX - rect.left) / width) * 2 - 1;
    this.pointer.y = -((screenY - rect.top) / height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.sceneSystem.camera);

    const layerHit = this.overlayLayerManager.pick(this.raycaster);

    if (layerHit) {
      return layerHit;
    }

    const globeHit = intersectRayWithSphere(
      {
        x: this.raycaster.ray.origin.x,
        y: this.raycaster.ray.origin.y,
        z: this.raycaster.ray.origin.z
      },
      {
        x: this.raycaster.ray.direction.x,
        y: this.raycaster.ray.direction.y,
        z: this.raycaster.ray.direction.z
      },
      this.radius
    );

    if (!globeHit) {
      return null;
    }

    return {
      type: "globe",
      point: globeHit,
      cartographic: cartesianToCartographic(globeHit, this.radius)
    };
  }

  destroy(): void {
    window.removeEventListener("resize", this.handleResize);
    this.rendererSystem.renderer.domElement.removeEventListener("click", this.handleClick);
    this.rendererSystem.renderer.domElement.removeEventListener("contextmenu", this.handleContextMenu);
    this.cancelScheduledRender();
    this.surfaceSystem.clear();
    this.overlayLayerManager.clear();
    this.layerRegistry.clear();
    this.sourceManager.clear();
    this.applyBaseGlobeTerrainInset();
    this.cameraController.dispose();
    this.interactionAnchorOverlay?.destroy();
    this.debugOverlay?.destroy();
    this.atmosphere.dispose();
    this.starfield.dispose();
    this.globe.dispose();
    this.rendererSystem.dispose();
    this.rendererSystem.renderer.domElement.remove();
  }

  dispose(): void {
    this.destroy();
  }

  getPerformanceReport(): PerformanceReport {
    return this.performanceMonitor.getReport();
  }

  getRecoveryPolicyStats(stage: string): RecoveryPolicyStats {
    const stats = this.recoveryPolicyStageStats.get(stage);

    if (!stats) {
      return {
        queryCount: 0,
        hitCount: 0,
        ruleHitCount: 0
      };
    }

    return {
      queryCount: stats.queryCount,
      hitCount: stats.hitCount,
      ruleHitCount: stats.ruleHitCount
    };
  }

  resetPerformanceReport(): void {
    this.performanceMonitor.reset();
    this.renderCount = 0;
    this.errorCount = 0;
    this.recoveryPolicyQueryCount = 0;
    this.recoveryPolicyHitCount = 0;
    this.recoveryPolicyRuleHitCount = 0;
    this.recoveryPolicyStageStats.clear();
    this.lastRenderTimestamp = null;
  }

  private handleResize = (): void => {
    this.resize();
  };

  private handleClick = (event: MouseEvent): void => {
    const pickResult = this.pick(event.clientX, event.clientY);
    this.events.emit("click", {
      originalEvent: event,
      pickResult
    });
  };

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private handleCameraChange = (): void => {
    this.surfaceSystem.notifyCameraChanged(this.suppressInteractionPhaseForProgrammaticView);
    this.requestRender();
  };

  private handleLayerError = (payload: LayerErrorPayload): void => {
    this.errorCount += 1;
    this.performanceMonitor.trackMetric("errorCount", this.errorCount);
    this.events.emit("error", payload);
  };

  private resolveLayerRecovery = (query: LayerRecoveryQuery): LayerRecoveryOverrides | undefined => {
    const resolved: LayerRecoveryOverrides = {};
    let matchedAny = false;
    let matchedRuleCount = 0;
    const stageStats = this.getRecoveryStageStats(query.stage);
    this.recoveryPolicyQueryCount += 1;
    stageStats.queryCount += 1;
    const applyOverrides = (overrides?: LayerRecoveryOverrides): void => {
      if (!overrides) {
        return;
      }

      if (overrides.imageryRetryAttempts !== undefined) {
        resolved.imageryRetryAttempts = overrides.imageryRetryAttempts;
        matchedAny = true;
      }
      if (overrides.imageryRetryDelayMs !== undefined) {
        resolved.imageryRetryDelayMs = overrides.imageryRetryDelayMs;
        matchedAny = true;
      }
      if (overrides.imageryFallbackColor !== undefined) {
        resolved.imageryFallbackColor = overrides.imageryFallbackColor;
        matchedAny = true;
      }
      if (overrides.elevationRetryAttempts !== undefined) {
        resolved.elevationRetryAttempts = overrides.elevationRetryAttempts;
        matchedAny = true;
      }
      if (overrides.elevationRetryDelayMs !== undefined) {
        resolved.elevationRetryDelayMs = overrides.elevationRetryDelayMs;
        matchedAny = true;
      }
      if (overrides.vectorParseRetryAttempts !== undefined) {
        resolved.vectorParseRetryAttempts = overrides.vectorParseRetryAttempts;
        matchedAny = true;
      }
      if (overrides.vectorParseRetryDelayMs !== undefined) {
        resolved.vectorParseRetryDelayMs = overrides.vectorParseRetryDelayMs;
        matchedAny = true;
      }
      if (overrides.vectorParseFallbackToEmpty !== undefined) {
        resolved.vectorParseFallbackToEmpty = overrides.vectorParseFallbackToEmpty;
        matchedAny = true;
      }
    };

    applyOverrides(this.recoveryPolicyDefaults);

    for (const rule of this.recoveryPolicyRules) {
      if (!this.matchesRecoveryRule(rule, query)) {
        continue;
      }

      matchedRuleCount += 1;
      applyOverrides(rule.overrides);
    }

    if (matchedAny) {
      this.recoveryPolicyHitCount += 1;
      stageStats.hitCount += 1;
    }

    if (matchedRuleCount > 0) {
      this.recoveryPolicyRuleHitCount += matchedRuleCount;
      stageStats.ruleHitCount += matchedRuleCount;
    }

    this.performanceMonitor.trackMetric("recoveryPolicyQueryCount", this.recoveryPolicyQueryCount);
    this.performanceMonitor.trackMetric("recoveryPolicyHitCount", this.recoveryPolicyHitCount);
    this.performanceMonitor.trackMetric("recoveryPolicyRuleHitCount", this.recoveryPolicyRuleHitCount);
    this.performanceMonitor.trackMetric(
      `recoveryPolicyQueryCount:${query.stage}`,
      stageStats.queryCount
    );
    this.performanceMonitor.trackMetric(
      `recoveryPolicyHitCount:${query.stage}`,
      stageStats.hitCount
    );
    this.performanceMonitor.trackMetric(
      `recoveryPolicyRuleHitCount:${query.stage}`,
      stageStats.ruleHitCount
    );

    return matchedAny ? resolved : undefined;
  };

  private getRecoveryStageStats(stage: string): RecoveryStageStats {
    const existing = this.recoveryPolicyStageStats.get(stage);

    if (existing) {
      return existing;
    }

    const created: RecoveryStageStats = {
      queryCount: 0,
      hitCount: 0,
      ruleHitCount: 0
    };
    this.recoveryPolicyStageStats.set(stage, created);
    return created;
  }

  private matchesRecoveryRule(rule: GlobeEngineRecoveryRule, query: LayerRecoveryQuery): boolean {
    if (rule.layerId && rule.layerId !== query.layerId) {
      return false;
    }

    if (rule.stage && rule.stage !== query.stage) {
      return false;
    }

    if (rule.category && rule.category !== query.category) {
      return false;
    }

    if (rule.severity && rule.severity !== query.severity) {
      return false;
    }

    return true;
  }

  requestRender = (): void => {
    if (this.pendingRenderFrameId !== null) {
      return;
    }

    this.pendingRenderFrameId = window.requestAnimationFrame(() => {
      this.pendingRenderFrameId = null;
      this.render();
    });
  };

  private cancelScheduledRender(): void {
    if (this.pendingRenderFrameId === null) {
      return;
    }

    window.cancelAnimationFrame(this.pendingRenderFrameId);
    this.pendingRenderFrameId = null;
  }

  private applyBaseGlobeTerrainInset(): void {
    if (!this.showBaseGlobe) {
      return;
    }

    // Once imagery coverage is established, keep base globe hidden to avoid
    // fallback flashes between globe base color and raster imagery.
    this.globe.mesh.visible = !this.surfaceSystem.hasEstablishedImageryCoverage();

    // For raster-only surface hosting, keep base globe slightly inset to avoid z-fighting.
    const scale = this.surfaceSystem.hasVisibleSurfaceLayers() ? 0.998 : 1.0;
    this.globe.mesh.scale.setScalar(scale);
    this.globe.mesh.updateMatrixWorld(true);
  }

  private getOrderedLayerIds(): string[] {
    return [
      ...this.surfaceSystem.getOrderedLayerIds(),
      ...this.overlayLayerManager.getOrderedLayerIds()
    ];
  }

  private isSurfaceLayer(layer: Layer): layer is TerrainTileLayer | RasterLayer {
    return layer instanceof TerrainTileLayer || layer instanceof RasterLayer;
  }
}
