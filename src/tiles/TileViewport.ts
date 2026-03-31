import { PerspectiveCamera, Raycaster, Vector2 } from "three";
import { cartesianToCartographic } from "../geo/projection";
import { normalizeLongitude } from "../geo/ellipsoid";
import { intersectRayWithSphere } from "../geo/raycast";

export interface TileCoordinate {
  z: number;
  x: number;
  y: number;
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

const SAMPLE_POINTER = new Vector2();
const SAMPLE_RAYCASTER = new Raycaster();
const MIN_VISIBLE_DEGREES = 1e-6;

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
    const visibleDegrees = Math.max(MIN_VISIBLE_DEGREES, shortestLongitudeDelta(left.lng, right.lng));
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
