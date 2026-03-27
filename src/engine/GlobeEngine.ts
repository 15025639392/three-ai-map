import { Raycaster, Vector2 } from "three";
import { CameraController } from "../core/CameraController";
import { SceneSystem } from "../core/SceneSystem";
import { cartesianToCartographic } from "../geo/projection";
import { intersectRayWithSphere } from "../geo/raycast";
import {
  createDefaultRenderer,
  EngineView,
  GlobeEngineOptions,
  RendererAdapter
} from "./EngineOptions";
import { AtmosphereMesh } from "../globe/AtmosphereMesh";
import { GlobeMesh } from "../globe/GlobeMesh";
import { Starfield } from "../globe/Starfield";
import {
  Layer,
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

interface GlobeEngineEvents {
  click: {
    originalEvent: MouseEvent;
    pickResult: PickResult | null;
  };
}

export class GlobeEngine {
  readonly container: HTMLElement;
  readonly radius: number;
  readonly sceneSystem: SceneSystem;
  readonly globe: GlobeMesh;
  readonly atmosphere: AtmosphereMesh;
  readonly starfield: Starfield;

  private readonly rendererSystem: RendererAdapter;
  private readonly cameraController: CameraController;
  private readonly layerManager: LayerManager;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly events = new EventEmitter<GlobeEngineEvents>();
  private markerLayer: MarkerLayer | null = null;
  private polylineLayer: PolylineLayer | null = null;
  private polygonLayer: PolygonLayer | null = null;

  constructor({
    container,
    radius = 1,
    background = "#03060d",
    terrainStrength = radius * 0.06,
    camera,
    rendererFactory = createDefaultRenderer
  }: GlobeEngineOptions) {
    this.container = container;
    this.radius = radius;
    this.sceneSystem = new SceneSystem({
      fieldOfView: camera?.fov,
      near: camera?.near,
      far: camera?.far
    });
    this.rendererSystem = rendererFactory({
      container,
      clearColor: background
    });
    this.globe = new GlobeMesh({ radius, terrainStrength });
    this.atmosphere = new AtmosphereMesh(radius);
    this.starfield = new Starfield(1200, radius * 18);
    this.sceneSystem.scene.add(this.globe.mesh);
    this.sceneSystem.scene.add(this.atmosphere.mesh);
    this.sceneSystem.scene.add(this.starfield.points);
    this.layerManager = new LayerManager({
      scene: this.sceneSystem.scene,
      camera: this.sceneSystem.camera,
      globe: this.globe,
      radius,
      rendererElement: this.rendererSystem.renderer.domElement,
      requestRender: this.requestRender
    });

    this.cameraController = new CameraController({
      camera: this.sceneSystem.camera,
      element: this.rendererSystem.renderer.domElement,
      globeRadius: radius,
      onChange: this.handleCameraChange
    });

    this.resize();
    this.setView({ lng: 0, lat: 20, altitude: radius * 2.2 });
    window.addEventListener("resize", this.handleResize);
    this.rendererSystem.renderer.domElement.addEventListener("click", this.handleClick);
    this.render();
  }

  setView(view: EngineView): void {
    this.cameraController.setView(view);
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
    this.layerManager.update(0);
    this.cameraController.update();
    this.sceneSystem.camera.updateMatrixWorld(true);
    this.rendererSystem.render(this.sceneSystem.scene, this.sceneSystem.camera);
  }

  addLayer(layer: Layer): void {
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

    this.layerManager.remove(layerId);
    this.render();
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
    this.layerManager.clear();
    this.cameraController.dispose();
    this.atmosphere.dispose();
    this.starfield.dispose();
    this.globe.dispose();
    this.rendererSystem.dispose();
    this.rendererSystem.renderer.domElement.remove();
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

  private handleCameraChange = (): void => {
    this.render();
  };

  private requestRender = (): void => {
    this.render();
  };
}
