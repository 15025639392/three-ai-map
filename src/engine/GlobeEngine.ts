import { Raycaster, Vector2 } from "three";
import { CameraController } from "../core/CameraController";
import { InteractionAnchorOverlay } from "../core/InteractionAnchorOverlay";
import { PerformanceMonitor, PerformanceReport } from "../core/PerformanceMonitor";
import { SceneSystem } from "../core/SceneSystem";
import { cartesianToCartographic } from "../geo/projection";
import { intersectRayWithSphere } from "../geo/raycast";
import {
  createDefaultRenderer,
  EngineView,
  GlobeEngineRecoveryRule,
  GlobeEngineOptions,
  RendererAdapter
} from "./EngineOptions";
import { AtmosphereMesh } from "../globe/AtmosphereMesh";
import { GlobeMesh } from "../globe/GlobeMesh";
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
import { TerrainTileLayer } from "../layers/TerrainTileLayer";
import {
  planSurfaceTileNodes,
  type SurfaceTileInteractionPhase,
  type SurfaceTilePlan
} from "../tiles/SurfaceTilePlanner";

export interface GlobeEngineEvents {
  click: {
    originalEvent: MouseEvent;
    pickResult: PickResult | null;
  };
  error: LayerErrorPayload;
}

interface RecoveryStageStats {
  queryCount: number;
  hitCount: number;
  ruleHitCount: number;
}

const SURFACE_TILE_PLAN_TILE_SIZE = 256;
const SURFACE_TILE_PLAN_MIN_ZOOM = 1;
const SURFACE_TILE_PLAN_MAX_ZOOM = 18;
const INTERACTION_IDLE_DELAY_MS = 180;

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
  private readonly mirrorDisplayX: boolean;
  private readonly layerManager: LayerManager;
  private readonly sourceManager: SourceManager;
  private readonly interactionAnchorOverlay: InteractionAnchorOverlay | null;
  private terrainHost: TerrainTileLayer | null = null;
  private readonly showBaseGlobe: boolean;
  private readonly recoveryPolicyDefaults: LayerRecoveryOverrides;
  private readonly recoveryPolicyRules: GlobeEngineRecoveryRule[];
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly events = new EventEmitter<GlobeEngineEvents>();
  private markerLayer: MarkerLayer | null = null;
  private polylineLayer: PolylineLayer | null = null;
  private polygonLayer: PolygonLayer | null = null;
  private pendingRenderFrameId: number | null = null;
  private interactionIdleTimeoutId: number | null = null;
  private suppressInteractionPhaseForProgrammaticView = false;
  private renderCount = 0;
  private errorCount = 0;
  private recoveryPolicyQueryCount = 0;
  private recoveryPolicyHitCount = 0;
  private recoveryPolicyRuleHitCount = 0;
  private readonly recoveryPolicyStageStats = new Map<string, RecoveryStageStats>();
  private lastRenderTimestamp: number | null = null;
  private surfaceTileInteractionPhase: SurfaceTileInteractionPhase = "idle";
  private currentSurfaceTilePlan: SurfaceTilePlan | null = null;

  constructor({
    container,
    radius = 1,
    background = "#03060d",
    showBaseGlobe = true,
    showInteractionAnchor = false,
    mirrorDisplayX = true,
    camera,
    recoveryPolicy,
    rendererFactory = createDefaultRenderer
  }: GlobeEngineOptions) {
    this.container = container;
    this.radius = radius;
    this.showBaseGlobe = showBaseGlobe;
    this.mirrorDisplayX = mirrorDisplayX;
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
    if (this.mirrorDisplayX) {
      this.rendererSystem.renderer.domElement.style.transform = "scaleX(-1)";
      this.rendererSystem.renderer.domElement.style.transformOrigin = "50% 50%";
    }
    this.recoveryPolicyDefaults = { ...(recoveryPolicy?.defaults ?? {}) };
    this.recoveryPolicyRules = [...(recoveryPolicy?.rules ?? [])];
    this.globe = new GlobeMesh({ radius });
    this.atmosphere = new AtmosphereMesh(radius);
    this.starfield = new Starfield(1200, radius * 18);
    this.performanceMonitor = new PerformanceMonitor();
    if (showBaseGlobe) {
      this.sceneSystem.scene.add(this.globe.mesh);
    }
    this.sceneSystem.scene.add(this.atmosphere.mesh);
    this.sceneSystem.scene.add(this.starfield.points);
    this.sourceManager = new SourceManager({
      requestRender: this.requestRender,
      resolveRecovery: this.resolveLayerRecovery
    });
    this.layerManager = new LayerManager({
      scene: this.sceneSystem.scene,
      camera: this.sceneSystem.camera,
      globe: this.globe,
      radius,
      rendererElement: this.rendererSystem.renderer.domElement,
      requestRender: this.requestRender,
      reportError: this.handleLayerError,
      resolveRecovery: this.resolveLayerRecovery,
      getSource: (id: string) => this.sourceManager.get(id),
      getTerrainHost: () => this.terrainHost,
      getSurfaceTilePlan: () => this.getSurfaceTilePlan()
    });

    this.cameraController = new CameraController({
      camera: this.sceneSystem.camera,
      element: this.rendererSystem.renderer.domElement,
      globeRadius: radius,
      mirrorDisplayX: this.mirrorDisplayX,
      onChange: this.handleCameraChange
    });
    this.interactionAnchorOverlay = showInteractionAnchor
      ? new InteractionAnchorOverlay(this.container)
      : null;

    this.resize();
    this.setView({ lng: 0, lat: 20, altitude: radius * 2.2 });
    this.surfaceTileInteractionPhase = "idle";
    this.clearInteractionIdleTimeout();
    window.addEventListener("resize", this.handleResize);
    this.rendererSystem.renderer.domElement.addEventListener("click", this.handleClick);
    this.rendererSystem.renderer.domElement.addEventListener("contextmenu", this.handleContextMenu);
    this.render();
  }

  setView(view: EngineView): void {
    this.suppressInteractionPhaseForProgrammaticView = true;

    try {
      this.cameraController.setView(view);
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
    this.currentSurfaceTilePlan = this.buildSurfaceTilePlan();
    this.layerManager.update(0);
    this.rendererSystem.render(this.sceneSystem.scene, this.sceneSystem.camera);
    this.renderCount += 1;
    this.performanceMonitor.update(deltaTime);
    this.performanceMonitor.trackMetric("renderCount", this.renderCount);
    this.performanceMonitor.trackMetric("errorCount", this.errorCount);
    this.performanceMonitor.trackMetric("layerCount", this.layerManager.getOrderedLayerIds().length);
    this.performanceMonitor.trackMetric("sceneObjectCount", this.sceneSystem.scene.children.length);
    this.performanceMonitor.trackMetric("cameraAltitude", this.getView().altitude);
  }

  addLayer(layer: Layer): void {
    if (layer instanceof TerrainTileLayer) {
      if (this.terrainHost && this.terrainHost !== layer) {
        throw new Error("Only one TerrainTileLayer can be added to GlobeEngine at a time");
      }

      this.terrainHost = layer;
      this.applyBaseGlobeTerrainInset();
    }
    this.layerManager.add(layer);
    this.render();
  }

  removeLayer(layerId: string): void {
    if (this.markerLayer?.id === layerId) {
      this.markerLayer = null;
    }
    if (this.polylineLayer?.id === layerId) {
      this.polylineLayer = null;
    }
    if (this.polygonLayer?.id === layerId) {
      this.polygonLayer = null;
    }

    const existing = this.layerManager.get(layerId);
    if (existing && existing === this.terrainHost) {
      this.terrainHost = null;
      this.applyBaseGlobeTerrainInset();
    }

    this.layerManager.remove(layerId);
    this.render();
  }

  addSource(id: string, source: Source): void {
    this.sourceManager.add(id, source);
  }

  removeSource(id: string): void {
    this.sourceManager.remove(id);
  }

  getSource(id: string): Source | undefined {
    return this.sourceManager.get(id);
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
    const localX = screenX - rect.left;
    const mappedX = this.mirrorDisplayX ? width - localX : localX;

    this.pointer.x = (mappedX / width) * 2 - 1;
    this.pointer.y = -((screenY - rect.top) / height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.sceneSystem.camera);

    const layerHit = this.layerManager.pick(this.raycaster);

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
    this.clearInteractionIdleTimeout();
    this.sourceManager.clear();
    this.layerManager.clear();
    this.terrainHost = null;
    this.applyBaseGlobeTerrainInset();
    this.cameraController.dispose();
    this.interactionAnchorOverlay?.destroy();
    this.atmosphere.dispose();
    this.starfield.dispose();
    this.globe.dispose();
    this.rendererSystem.dispose();
    this.rendererSystem.renderer.domElement.remove();
  }

  getPerformanceReport(): PerformanceReport {
    return this.performanceMonitor.getReport();
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
    if (this.suppressInteractionPhaseForProgrammaticView) {
      this.surfaceTileInteractionPhase = "idle";
      this.clearInteractionIdleTimeout();
      this.render();
      return;
    }

    this.surfaceTileInteractionPhase = "interacting";
    this.scheduleInteractionIdleReset();
    this.render();
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

  private requestRender = (): void => {
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

  private buildSurfaceTilePlan(): SurfaceTilePlan {
    const plannerConfig = this.terrainHost?.getSurfaceTilePlannerConfig?.();
    const viewportWidth =
      this.rendererSystem.renderer.domElement.clientWidth ||
      this.rendererSystem.renderer.domElement.width ||
      1;
    const viewportHeight =
      this.rendererSystem.renderer.domElement.clientHeight ||
      this.rendererSystem.renderer.domElement.height ||
      1;

    return planSurfaceTileNodes({
      camera: this.sceneSystem.camera,
      viewportWidth,
      viewportHeight,
      radius: this.radius,
      tileSize: plannerConfig?.tileSize ?? SURFACE_TILE_PLAN_TILE_SIZE,
      minZoom: plannerConfig?.minZoom ?? SURFACE_TILE_PLAN_MIN_ZOOM,
      maxZoom: plannerConfig?.maxZoom ?? SURFACE_TILE_PLAN_MAX_ZOOM,
      interactionPhase: this.surfaceTileInteractionPhase
    });
  }

  private getSurfaceTilePlan(): SurfaceTilePlan {
    if (!this.currentSurfaceTilePlan) {
      this.sceneSystem.camera.updateMatrixWorld(true);
      this.currentSurfaceTilePlan = this.buildSurfaceTilePlan();
    }

    return this.currentSurfaceTilePlan;
  }

  private scheduleInteractionIdleReset(): void {
    this.clearInteractionIdleTimeout();
    this.interactionIdleTimeoutId = window.setTimeout(() => {
      this.interactionIdleTimeoutId = null;

      if (this.surfaceTileInteractionPhase === "idle") {
        return;
      }

      this.surfaceTileInteractionPhase = "idle";
      this.render();
    }, INTERACTION_IDLE_DELAY_MS);
  }

  private clearInteractionIdleTimeout(): void {
    if (this.interactionIdleTimeoutId === null) {
      return;
    }

    window.clearTimeout(this.interactionIdleTimeoutId);
    this.interactionIdleTimeoutId = null;
  }

  private applyBaseGlobeTerrainInset(): void {
    if (!this.showBaseGlobe) {
      return;
    }

    // Terrain tiles are chord-based meshes; without an inset, the base globe sphere can
    // occlude them via depth testing (especially at low zoom / coarse meshSegments).
    const scale = this.terrainHost ? 0.998 : 1.0;
    this.globe.mesh.scale.setScalar(scale);
    this.globe.mesh.updateMatrixWorld(true);
  }
}
