export type ElevationEncoding = "terrarium" | "mapbox";

function decodeTerrariumHeight(red: number, green: number, blue: number): number {
  return red * 256 + green + blue / 256 - 32768;
}

function decodeMapboxHeight(red: number, green: number, blue: number): number {
  // Mapbox Terrain-RGB: -10000 + (R*256^2 + G*256 + B) * 0.1
  return -10000 + (red * 256 * 256 + green * 256 + blue) * 0.1;
}

export function decodeElevationPixels(
  encoding: ElevationEncoding,
  width: number,
  height: number,
  pixels: Uint8ClampedArray
): Float32Array {
  const heights = new Float32Array(width * height);

  for (let index = 0; index < heights.length; index += 1) {
    const offset = index * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];

    heights[index] = encoding === "mapbox"
      ? decodeMapboxHeight(r, g, b)
      : decodeTerrariumHeight(r, g, b);
  }

  return heights;
}

export function decodeTerrariumPixels(width: number, height: number, pixels: Uint8ClampedArray): Float32Array {
  return decodeElevationPixels("terrarium", width, height, pixels);
}

