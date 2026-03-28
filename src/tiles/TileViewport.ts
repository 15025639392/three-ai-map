import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { cartesianToCartographic } from "../geo/projection";
import { normalizeLongitude } from "../geo/ellipsoid";
import { intersectRayWithSphere } from "../geo/raycast";

export interface TileCoordinate {
  z: number;
  x: number;
  y: number;
}

export interface TileViewportSampleBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface TargetZoomOptions {
  camera: PerspectiveCamera;
  viewportWidth: number;
  viewportHeight: number;
  radius: number;
  tileSize: number;
  minZoom: number;
  maxZoom: number;
}

interface VisibleTileOptions {
  camera: PerspectiveCamera;
  viewportWidth: number;
  viewportHeight: number;
  radius: number;
  zoom: number;
  sampleColumns?: number;
  sampleRows?: number;
  sampleBounds?: TileViewportSampleBounds;
  paddingTiles?: number;
}

const SAMPLE_POINTER = new Vector2();
const SAMPLE_RAYCASTER = new Raycaster();
const CENTER_POINT = new Vector3();

function lngToTileX(lng: number, zoom: number): number {
  return ((normalizeLongitude(lng) + 180) / 360) * 2 ** zoom;
}

function latToTileY(lat: number, zoom: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const radians = (clamped * Math.PI) / 180;
  return (
    (0.5 - Math.log((1 + Math.sin(radians)) / (1 - Math.sin(radians))) / (4 * Math.PI)) * 2 ** zoom
  );
}

function shortestLongitudeDelta(left: number, right: number): number {
  const delta = normalizeLongitude(right - left);
  return Math.abs(delta === 180 ? -180 : delta);
}

function sampleCartographic(
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
  radius: number,
  screenX: number,
  screenY: number
) {
  SAMPLE_POINTER.x = (screenX / viewportWidth) * 2 - 1;
  SAMPLE_POINTER.y = -(screenY / viewportHeight) * 2 + 1;
  SAMPLE_RAYCASTER.setFromCamera(SAMPLE_POINTER, camera);

  const hit = intersectRayWithSphere(
    {
      x: SAMPLE_RAYCASTER.ray.origin.x,
      y: SAMPLE_RAYCASTER.ray.origin.y,
      z: SAMPLE_RAYCASTER.ray.origin.z
    },
    {
      x: SAMPLE_RAYCASTER.ray.direction.x,
      y: SAMPLE_RAYCASTER.ray.direction.y,
      z: SAMPLE_RAYCASTER.ray.direction.z
    },
    radius
  );

  return hit ? cartesianToCartographic(hit, radius) : null;
}

export function computeTargetZoom({
  camera,
  viewportWidth,
  viewportHeight,
  radius,
  tileSize,
  minZoom,
  maxZoom
}: TargetZoomOptions): number {
  const left = sampleCartographic(camera, viewportWidth, viewportHeight, radius, 0, viewportHeight * 0.5);
  const right = sampleCartographic(
    camera,
    viewportWidth,
    viewportHeight,
    radius,
    viewportWidth,
    viewportHeight * 0.5
  );

  if (left && right) {
    const visibleDegrees = Math.max(1, shortestLongitudeDelta(left.lng, right.lng));
    const zoom = Math.log2((viewportWidth * 360) / (tileSize * visibleDegrees));
    return Math.max(minZoom, Math.min(maxZoom, Math.round(zoom)));
  }

  const distance = camera.position.length();
  const altitude = Math.max(0.05, distance - radius);
  // Scale factor chosen so that a camera at altitude ≈ radius sees ~4 tiles across
  // the equator (tuned for visually pleasant tile density at medium range).
  const zoom = Math.log2((radius / altitude) * 4);
  return Math.max(minZoom, Math.min(maxZoom, Math.round(zoom)));
}

export function computeVisibleTileCoordinates({
  camera,
  viewportWidth,
  viewportHeight,
  radius,
  zoom,
  sampleColumns = 6,
  sampleRows = 4,
  sampleBounds,
  paddingTiles
}: VisibleTileOptions): TileCoordinate[] {
  const worldTileCount = 2 ** zoom;
  CENTER_POINT.copy(camera.position).normalize().multiplyScalar(radius);
  const centerCartographic = cartesianToCartographic(
    {
      x: CENTER_POINT.x,
      y: CENTER_POINT.y,
      z: CENTER_POINT.z
    },
    radius
  );
  const centerTileX = lngToTileX(centerCartographic.lng, zoom);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const bounds = sampleBounds ?? { left: 0, right: 1, top: 0, bottom: 1 };
  const left = Math.max(0, Math.min(1, bounds.left));
  const right = Math.max(0, Math.min(1, bounds.right));
  const top = Math.max(0, Math.min(1, bounds.top));
  const bottom = Math.max(0, Math.min(1, bounds.bottom));
  const safeLeft = Math.min(left, right);
  const safeRight = Math.max(left, right);
  const safeTop = Math.min(top, bottom);
  const safeBottom = Math.max(top, bottom);
  const spanX = safeRight - safeLeft;
  const spanY = safeBottom - safeTop;

  for (let row = 0; row < sampleRows; row += 1) {
    const rowT = sampleRows <= 1 ? 0.5 : row / (sampleRows - 1);
    const sampleY = (safeTop + rowT * spanY) * viewportHeight;

    for (let column = 0; column < sampleColumns; column += 1) {
      const columnT = sampleColumns <= 1 ? 0.5 : column / (sampleColumns - 1);
      const sampleX = (safeLeft + columnT * spanX) * viewportWidth;
      const hit = sampleCartographic(
        camera,
        viewportWidth,
        viewportHeight,
        radius,
        sampleX,
        sampleY
      );

      if (!hit) {
        continue;
      }

      let tileX = lngToTileX(hit.lng, zoom);

      while (tileX - centerTileX > worldTileCount * 0.5) {
        tileX -= worldTileCount;
      }

      while (centerTileX - tileX > worldTileCount * 0.5) {
        tileX += worldTileCount;
      }

      const tileY = latToTileY(hit.lat, zoom);
      minX = Math.min(minX, tileX);
      maxX = Math.max(maxX, tileX);
      minY = Math.min(minY, tileY);
      maxY = Math.max(maxY, tileY);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    const centerX = Math.floor(centerTileX);
    const centerY = Math.floor(latToTileY(centerCartographic.lat, zoom));
    return [{ z: zoom, x: ((centerX % worldTileCount) + worldTileCount) % worldTileCount, y: centerY }];
  }

  const padding = Math.max(0, Math.floor(paddingTiles ?? 1));
  const coordinates: TileCoordinate[] = [];

  for (let tileY = Math.max(0, Math.floor(minY) - padding); tileY <= Math.min(worldTileCount - 1, Math.floor(maxY) + padding); tileY += 1) {
    for (let tileX = Math.floor(minX) - padding; tileX <= Math.floor(maxX) + padding; tileX += 1) {
      coordinates.push({
        z: zoom,
        x: ((tileX % worldTileCount) + worldTileCount) % worldTileCount,
        y: tileY
      });
    }
  }

  return coordinates;
}
