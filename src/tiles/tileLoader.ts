import { TileCoordinate } from "./TileViewport";

export type TileSource = HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;

function loadImageDirectly(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}

async function loadImageWithCORS(url: string): Promise<TileSource> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load tile ${url}`);
  }

  const blob = await response.blob();

  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load image: ${objectUrl}`));
    };
    image.src = objectUrl;
  });
}

export async function defaultTileLoader(
  coordinate: TileCoordinate,
  templateUrl: string
): Promise<TileSource> {
  const url = templateUrl
    .replace("{z}", `${coordinate.z}`)
    .replace("{x}", `${coordinate.x}`)
    .replace("{y}", `${coordinate.y}`);

  // Try direct Image loading first (avoids CORS for servers that don't send
  // Access-Control-Allow-Origin headers, e.g. Gaode, Baidu).  If the server
  // does support CORS, Image still loads fine; we only fall back to fetch()
  // when we *need* pixel access (elevation decoding) and the image requires
  // CORS headers for canvas reading.
  return loadImageDirectly(url);
}

/**
 * Load a tile via fetch + blob for cases that require reading pixel data
 * (e.g. elevation Terrarium decoding).  The server **must** return CORS
 * headers (Access-Control-Allow-Origin).
 */
export async function corsTileLoader(
  coordinate: TileCoordinate,
  templateUrl: string
): Promise<TileSource> {
  const url = templateUrl
    .replace("{z}", `${coordinate.z}`)
    .replace("{x}", `${coordinate.x}`)
    .replace("{y}", `${coordinate.y}`);

  return loadImageWithCORS(url);
}
