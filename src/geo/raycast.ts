import { Cartesian3Like } from "./cartographic";

function dot(a: Cartesian3Like, b: Cartesian3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function subtract(a: Cartesian3Like, b: Cartesian3Like): Cartesian3Like {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z
  };
}

function scale(vector: Cartesian3Like, scalar: number): Cartesian3Like {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    z: vector.z * scalar
  };
}

function add(a: Cartesian3Like, b: Cartesian3Like): Cartesian3Like {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z
  };
}

function length(vector: Cartesian3Like): number {
  return Math.sqrt(dot(vector, vector));
}

function normalize(vector: Cartesian3Like): Cartesian3Like {
  const magnitude = length(vector);

  if (magnitude === 0) {
    throw new Error("Cannot normalize a zero-length vector");
  }

  return scale(vector, 1 / magnitude);
}

export function intersectRayWithSphere(
  origin: Cartesian3Like,
  direction: Cartesian3Like,
  radius: number
): Cartesian3Like | null {
  const normalizedDirection = normalize(direction);
  const a = dot(normalizedDirection, normalizedDirection);
  const b = 2 * dot(origin, normalizedDirection);
  const c = dot(origin, origin) - radius * radius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    return null;
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const near = (-b - sqrtDiscriminant) / (2 * a);
  const far = (-b + sqrtDiscriminant) / (2 * a);
  const distance = near >= 0 ? near : far >= 0 ? far : null;

  if (distance === null) {
    return null;
  }

  return add(origin, scale(normalizedDirection, distance));
}

export function rayDirectionFromPoints(
  origin: Cartesian3Like,
  target: Cartesian3Like
): Cartesian3Like {
  return normalize(subtract(target, origin));
}
