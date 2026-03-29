import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3
} from "three";
import { cartographicToCartesian } from "../geo/projection";
import {
  Layer,
  LayerContext,
  ObliquePhotogrammetryNodePickResult,
  PickResult
} from "./Layer";
import {
  convert3DTilesToObliquePhotogrammetryTileset,
  ThreeDTilesTileset
} from "./ObliquePhotogrammetry3DTiles";

export interface ObliquePhotogrammetryNode {
  id?: string;
  center: {
    lng: number;
    lat: number;
    altitude?: number;
  };
  geometricError: number;
  halfSize?: number;
  color?: string;
  properties?: Record<string, unknown>;
  children?: ObliquePhotogrammetryNode[];
}

export interface ObliquePhotogrammetryTileset {
  root: ObliquePhotogrammetryNode;
}

export interface ObliquePhotogrammetryLayerOptions {
  tileset?: ObliquePhotogrammetryTileset;
  tileset3DTiles?: ThreeDTilesTileset;
  tilesetUrl?: string;
  tileset3DTilesUrl?: string;
  loadTileset?: (signal?: AbortSignal) => Promise<ObliquePhotogrammetryTileset>;
  loadTileset3DTiles?: (signal?: AbortSignal) => Promise<ThreeDTilesTileset>;
  maxScreenSpaceError?: number;
  defaultNodeHalfSize?: number;
  threeDTilesMetersToAltitudeScale?: number;
}

export interface ObliquePhotogrammetryDebugStats {
  nodeTotalCount: number;
  visibleNodeCount: number;
  maxVisibleDepth: number;
  updateCount: number;
  selectionChangeCount: number;
  cameraAltitude: number;
}

interface NormalizedObliquePhotogrammetryNode {
  id: string;
  center: {
    lng: number;
    lat: number;
    altitude: number;
  };
  geometricError: number;
  halfSize: number;
  color: string;
  depth: number;
  properties?: Record<string, unknown>;
  children: NormalizedObliquePhotogrammetryNode[];
}

function normalizeObliqueNode(
  node: ObliquePhotogrammetryNode,
  depth: number,
  path: string,
  fallbackHalfSize: number
): NormalizedObliquePhotogrammetryNode {
  const geometricError = Number.isFinite(node.geometricError) && node.geometricError > 0
    ? node.geometricError
    : 1;
  const halfSize = Number.isFinite(node.halfSize) && (node.halfSize ?? 0) > 0
    ? (node.halfSize as number)
    : fallbackHalfSize / (depth + 1);
  const color = node.color ?? "#8dd7ff";
  const normalizedNode: NormalizedObliquePhotogrammetryNode = {
    id: node.id ?? `node-${path}`,
    center: {
      lng: node.center.lng,
      lat: node.center.lat,
      altitude: node.center.altitude ?? 0
    },
    geometricError,
    halfSize,
    color,
    depth,
    properties: node.properties,
    children: []
  };

  normalizedNode.children = (node.children ?? []).map((child, childIndex) =>
    normalizeObliqueNode(
      child,
      depth + 1,
      `${path}-${childIndex + 1}`,
      fallbackHalfSize
    )
  );

  return normalizedNode;
}

function countNodes(node: NormalizedObliquePhotogrammetryNode): number {
  return 1 + node.children.reduce((accumulator, child) => accumulator + countNodes(child), 0);
}

function disposeMeshTree(group: Group): void {
  for (const child of group.children) {
    const mesh = child as Mesh<BoxGeometry, MeshBasicMaterial>;
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

  group.clear();
}

export class ObliquePhotogrammetryLayer extends Layer {
  private readonly group = new Group();
  private readonly defaultNodeHalfSize: number;
  private readonly maxScreenSpaceError: number;
  private readonly loadTilesetFn: ((signal?: AbortSignal) => Promise<ObliquePhotogrammetryTileset>) | null;
  private context: LayerContext | null = null;
  private rootNode: NormalizedObliquePhotogrammetryNode | null = null;
  private selectedNodes: NormalizedObliquePhotogrammetryNode[] = [];
  private selectedSignature = "";
  private tilesetLoadAbortController: AbortController | null = null;
  private tilesetReadyPromise: Promise<void> = Promise.resolve();
  private debugStats: ObliquePhotogrammetryDebugStats = {
    nodeTotalCount: 0,
    visibleNodeCount: 0,
    maxVisibleDepth: 0,
    updateCount: 0,
    selectionChangeCount: 0,
    cameraAltitude: 0
  };

  constructor(id: string, options: ObliquePhotogrammetryLayerOptions = {}) {
    super(id);
    this.group.name = id;
    this.defaultNodeHalfSize = Math.max(0.005, options.defaultNodeHalfSize ?? 0.08);
    this.maxScreenSpaceError = Math.max(0.1, options.maxScreenSpaceError ?? 1.8);
    const convertFrom3DTiles = (tileset3DTiles: ThreeDTilesTileset): ObliquePhotogrammetryTileset =>
      convert3DTilesToObliquePhotogrammetryTileset(tileset3DTiles, {
        defaultNodeHalfSize: this.defaultNodeHalfSize,
        metersToAltitudeScale: options.threeDTilesMetersToAltitudeScale
      });

    if (options.tileset) {
      this.setTileset(options.tileset);
      this.loadTilesetFn = null;
    } else if (options.tileset3DTiles) {
      this.setTileset(convertFrom3DTiles(options.tileset3DTiles));
      this.loadTilesetFn = null;
    } else if (options.loadTileset) {
      this.loadTilesetFn = options.loadTileset;
    } else if (options.loadTileset3DTiles) {
      this.loadTilesetFn = async (signal?: AbortSignal): Promise<ObliquePhotogrammetryTileset> =>
        convertFrom3DTiles(await options.loadTileset3DTiles!(signal));
    } else if (options.tilesetUrl) {
      const url = options.tilesetUrl;
      this.loadTilesetFn = async (signal?: AbortSignal): Promise<ObliquePhotogrammetryTileset> => {
        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw new Error(`Failed to load oblique tileset: ${response.status}`);
        }
        const payload = await response.json();
        return payload as ObliquePhotogrammetryTileset;
      };
    } else if (options.tileset3DTilesUrl) {
      const url = options.tileset3DTilesUrl;
      this.loadTilesetFn = async (signal?: AbortSignal): Promise<ObliquePhotogrammetryTileset> => {
        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw new Error(`Failed to load oblique 3D Tiles tileset: ${response.status}`);
        }
        const payload = await response.json();
        return convertFrom3DTiles(payload as ThreeDTilesTileset);
      };
    } else {
      this.loadTilesetFn = null;
    }
  }

  onAdd(context: LayerContext): void {
    this.context = context;
    context.scene.add(this.group);
    this.tilesetReadyPromise = this.ensureTilesetLoaded();
    this.recalculateSelectionAndRender();
  }

  onRemove(context: LayerContext): void {
    context.scene.remove(this.group);
    this.tilesetLoadAbortController?.abort();
    this.tilesetLoadAbortController = null;
    disposeMeshTree(this.group);
    this.selectedNodes = [];
    this.selectedSignature = "";
    this.context = null;
  }

  update(_deltaTime: number, _context: LayerContext): void {
    this.debugStats.updateCount += 1;
    this.recalculateSelectionAndRender();
  }

  dispose(): void {
    this.tilesetLoadAbortController?.abort();
    this.tilesetLoadAbortController = null;
    disposeMeshTree(this.group);
    this.rootNode = null;
    this.selectedNodes = [];
    this.selectedSignature = "";
    this.context = null;
  }

  pick(raycaster: Raycaster, _context: LayerContext): PickResult | null {
    const intersections = raycaster.intersectObjects(this.group.children, false);
    if (intersections.length === 0) {
      return null;
    }

    const hit = intersections[0];
    const node = hit.object.userData.obliqueNode as
      | {
          id: string;
          depth: number;
          geometricError: number;
          properties?: Record<string, unknown>;
        }
      | undefined;

    if (!node) {
      return null;
    }

    const result: ObliquePhotogrammetryNodePickResult = {
      type: "oblique-photogrammetry-node",
      layerId: this.id,
      point: {
        x: hit.point.x,
        y: hit.point.y,
        z: hit.point.z
      },
      node
    };

    return result;
  }

  setTileset(tileset: ObliquePhotogrammetryTileset): void {
    this.rootNode = normalizeObliqueNode(tileset.root, 0, "1", this.defaultNodeHalfSize);
    this.debugStats.nodeTotalCount = countNodes(this.rootNode);
    this.selectedSignature = "";
    this.recalculateSelectionAndRender();
  }

  async ready(): Promise<void> {
    await this.tilesetReadyPromise;
  }

  getDebugStats(): ObliquePhotogrammetryDebugStats {
    return { ...this.debugStats };
  }

  getSelectedNodeIds(): string[] {
    return this.selectedNodes.map((node) => node.id);
  }

  private async ensureTilesetLoaded(): Promise<void> {
    if (this.rootNode || !this.loadTilesetFn) {
      return;
    }

    const abortController = new AbortController();
    this.tilesetLoadAbortController = abortController;

    try {
      const tileset = await this.loadTilesetFn(abortController.signal);
      if (abortController.signal.aborted) {
        return;
      }
      this.setTileset(tileset);
      this.context?.requestRender?.();
    } catch (error) {
      this.emitLayerError(this.context, {
        stage: "tileset-load",
        category: "data",
        severity: "error",
        error,
        recoverable: false
      });
      throw error;
    } finally {
      if (this.tilesetLoadAbortController === abortController) {
        this.tilesetLoadAbortController = null;
      }
    }
  }

  private recalculateSelectionAndRender(): void {
    if (!this.context || !this.rootNode) {
      return;
    }

    const cameraAltitude = Math.max(0.001, this.context.camera.position.length() - this.context.radius);
    this.debugStats.cameraAltitude = Number(cameraAltitude.toFixed(4));

    const cameraDirection = this.context.camera.position.clone().normalize();
    const selectedNodes: NormalizedObliquePhotogrammetryNode[] = [];
    let maxVisibleDepth = 0;

    const visitNode = (node: NormalizedObliquePhotogrammetryNode): void => {
      if (!this.isNodeFrontFacing(node, cameraDirection)) {
        return;
      }

      const screenSpaceError = node.geometricError / cameraAltitude;
      const shouldRefine =
        node.children.length > 0 && screenSpaceError > this.maxScreenSpaceError;

      if (shouldRefine) {
        for (const child of node.children) {
          visitNode(child);
        }
        return;
      }

      selectedNodes.push(node);
      maxVisibleDepth = Math.max(maxVisibleDepth, node.depth);
    };

    visitNode(this.rootNode);
    if (selectedNodes.length === 0) {
      selectedNodes.push(this.rootNode);
      maxVisibleDepth = this.rootNode.depth;
    }

    const selectionSignature = selectedNodes.map((node) => node.id).sort().join("|");
    const selectionChanged = selectionSignature !== this.selectedSignature;
    this.selectedNodes = selectedNodes;
    this.selectedSignature = selectionSignature;
    this.debugStats.visibleNodeCount = selectedNodes.length;
    this.debugStats.maxVisibleDepth = maxVisibleDepth;

    if (selectionChanged) {
      this.debugStats.selectionChangeCount += 1;
      this.renderSelectedNodes();
      this.context.requestRender?.();
    }
  }

  private isNodeFrontFacing(
    node: NormalizedObliquePhotogrammetryNode,
    cameraDirection: Vector3
  ): boolean {
    const centerPoint = cartographicToCartesian(
      {
        lng: node.center.lng,
        lat: node.center.lat,
        height: node.center.altitude
      },
      this.context?.radius ?? 1
    );
    const surfaceNormal = new Vector3(centerPoint.x, centerPoint.y, centerPoint.z).normalize();
    return surfaceNormal.dot(cameraDirection) > 0;
  }

  private renderSelectedNodes(): void {
    disposeMeshTree(this.group);

    for (const node of this.selectedNodes) {
      const size = Math.max(0.004, node.halfSize * 2);
      const geometry = new BoxGeometry(size, size, size);
      const material = new MeshBasicMaterial({
        color: new Color(node.color),
        transparent: true,
        opacity: 0.82
      });
      const mesh = new Mesh(geometry, material);
      const point = cartographicToCartesian(
        {
          lng: node.center.lng,
          lat: node.center.lat,
          height: node.center.altitude
        },
        this.context?.radius ?? 1
      );
      mesh.position.set(point.x, point.y, point.z);
      mesh.lookAt(0, 0, 0);
      mesh.userData.obliqueNode = {
        id: node.id,
        depth: node.depth,
        geometricError: node.geometricError,
        properties: node.properties
      };
      this.group.add(mesh);
    }
  }
}
