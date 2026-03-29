import type {
  ObliquePhotogrammetryNode,
  ObliquePhotogrammetryTileset
} from "./ObliquePhotogrammetryLayer";

export interface ThreeDTilesBoundingVolume {
  region?: number[];
}

export interface ThreeDTilesContent {
  uri?: string;
  url?: string;
}

export interface ThreeDTilesNode {
  id?: string;
  geometricError?: number;
  refine?: string;
  boundingVolume?: ThreeDTilesBoundingVolume;
  content?: ThreeDTilesContent;
  children?: ThreeDTilesNode[];
  extras?: Record<string, unknown>;
}

export interface ThreeDTilesTileset {
  asset?: {
    version?: string;
    tilesetVersion?: string;
  };
  geometricError?: number;
  root: ThreeDTilesNode;
  extras?: Record<string, unknown>;
}

export interface ThreeDTilesToObliqueOptions {
  defaultNodeHalfSize?: number;
  metersToAltitudeScale?: number;
  idPrefix?: string;
}

interface ConvertedNodeGeometry {
  center: {
    lng: number;
    lat: number;
    altitude: number;
  };
  halfSize: number;
  color?: string;
}

const COLOR_PALETTE = [
  "#5fd0ff",
  "#6ee7b7",
  "#f59e0b",
  "#c084fc",
  "#f87171",
  "#60a5fa"
];

const DEG_PER_RADIAN = 180 / Math.PI;
const TWO_PI = Math.PI * 2;

function toFinitePositive(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return fallback;
}

function normalizeLongitudeRadians(value: number): number {
  let normalized = value;
  while (normalized <= -Math.PI) {
    normalized += TWO_PI;
  }
  while (normalized > Math.PI) {
    normalized -= TWO_PI;
  }
  return normalized;
}

function deterministicColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  const colorIndex = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[colorIndex];
}

function convertBoundingRegion(
  region: number[],
  metersToAltitudeScale: number,
  defaultHalfSize: number
): ConvertedNodeGeometry {
  if (!Array.isArray(region) || region.length !== 6 || region.some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid 3D Tiles region boundingVolume: expected 6 finite numbers");
  }

  const west = region[0];
  const south = region[1];
  const east = region[2];
  const north = region[3];
  const minHeightMeters = region[4];
  const maxHeightMeters = region[5];

  const longitudeSpan = east >= west ? east - west : east + TWO_PI - west;
  const latitudeSpan = Math.abs(north - south);
  const centerLongitudeRadians = normalizeLongitudeRadians(west + longitudeSpan / 2);
  const centerLatitudeRadians = (south + north) / 2;
  const centerAltitude = ((minHeightMeters + maxHeightMeters) / 2) * metersToAltitudeScale;
  const halfSize = Math.max(
    defaultHalfSize,
    Number((Math.max(longitudeSpan, latitudeSpan) / 2).toFixed(6))
  );

  return {
    center: {
      lng: Number((centerLongitudeRadians * DEG_PER_RADIAN).toFixed(6)),
      lat: Number((centerLatitudeRadians * DEG_PER_RADIAN).toFixed(6)),
      altitude: Number(centerAltitude.toFixed(6))
    },
    halfSize
  };
}

function convertObliqueCenterExtras(
  extras: Record<string, unknown> | undefined,
  defaultHalfSize: number
): ConvertedNodeGeometry | null {
  const candidate = extras?.obliqueCenter;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const center = candidate as Record<string, unknown>;
  const lng = center.lng;
  const lat = center.lat;
  if (typeof lng !== "number" || !Number.isFinite(lng) || typeof lat !== "number" || !Number.isFinite(lat)) {
    throw new Error("Invalid obliqueCenter extras: lng/lat must be finite numbers");
  }

  const altitude = typeof center.altitude === "number" && Number.isFinite(center.altitude)
    ? center.altitude
    : 0;
  const halfSize = toFinitePositive(center.halfSize, defaultHalfSize);
  const color = typeof center.color === "string" ? center.color : undefined;

  return {
    center: {
      lng,
      lat,
      altitude
    },
    halfSize,
    color
  };
}

function convertNode(
  node: ThreeDTilesNode,
  path: string,
  parentGeometricError: number,
  state: Required<ThreeDTilesToObliqueOptions>
): ObliquePhotogrammetryNode {
  const id = node.id ?? `${state.idPrefix}-${path}`;
  const geometricError = toFinitePositive(node.geometricError, Math.max(parentGeometricError * 0.5, 0.001));
  const convertedFromRegion = node.boundingVolume?.region
    ? convertBoundingRegion(
        node.boundingVolume.region,
        state.metersToAltitudeScale,
        state.defaultNodeHalfSize
      )
    : null;
  const convertedFromExtras = convertedFromRegion
    ? null
    : convertObliqueCenterExtras(node.extras, state.defaultNodeHalfSize);
  const convertedGeometry = convertedFromRegion ?? convertedFromExtras;

  if (!convertedGeometry) {
    throw new Error(
      `3D Tiles node "${id}" must provide boundingVolume.region or extras.obliqueCenter for oblique conversion`
    );
  }

  const properties: Record<string, unknown> = {};
  if (node.refine) {
    properties.refine = node.refine;
  }
  const contentUri = node.content?.uri ?? node.content?.url;
  if (contentUri) {
    properties.contentUri = contentUri;
  }
  if (node.boundingVolume?.region) {
    properties.boundingVolumeType = "region";
  } else {
    properties.boundingVolumeType = "extras.obliqueCenter";
  }

  const children = (node.children ?? []).map((child, index) =>
    convertNode(child, `${path}-${index + 1}`, geometricError, state)
  );

  return {
    id,
    center: convertedGeometry.center,
    geometricError,
    halfSize: convertedGeometry.halfSize,
    color: convertedGeometry.color ?? deterministicColor(id),
    properties: Object.keys(properties).length > 0 ? properties : undefined,
    children
  };
}

export function convert3DTilesToObliquePhotogrammetryTileset(
  tileset: ThreeDTilesTileset,
  options: ThreeDTilesToObliqueOptions = {}
): ObliquePhotogrammetryTileset {
  if (!tileset || typeof tileset !== "object" || !tileset.root) {
    throw new Error("Invalid 3D Tiles tileset: missing root node");
  }

  const state: Required<ThreeDTilesToObliqueOptions> = {
    defaultNodeHalfSize: toFinitePositive(options.defaultNodeHalfSize, 0.08),
    metersToAltitudeScale: toFinitePositive(options.metersToAltitudeScale, 1 / 6378137),
    idPrefix: options.idPrefix ?? "3dtiles-node"
  };
  const rootGeometricError = toFinitePositive(tileset.geometricError, 1);

  return {
    root: convertNode(tileset.root, "1", rootGeometricError, state)
  };
}
