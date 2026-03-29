import { TileCoordinate } from "./TileViewport";

export type TileSource = HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;

function createAbortError(signal: AbortSignal | undefined, fallbackMessage: string): Error {
  const reason = signal?.reason;

  if (reason instanceof Error) {
    return reason;
  }

  const message = typeof reason === "string" ? reason : fallbackMessage;

  if (typeof DOMException === "function") {
    return new DOMException(message, "AbortError");
  }

  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function loadImageDirectly(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError(signal, `Image load aborted: ${url}`));
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;

      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    };
    const abortHandler = () => {
      cleanup();
      image.src = "";
      reject(createAbortError(signal, `Image load aborted: ${url}`));
    };

    image.crossOrigin = "anonymous";
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load image: ${url}`));
    };

    signal?.addEventListener("abort", abortHandler, { once: true });
    image.src = url;
  });
}

async function loadImageWithCORS(url: string, signal?: AbortSignal): Promise<TileSource> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Failed to load tile ${url}`);
  }

  const blob = await response.blob();

  if (typeof createImageBitmap === "function") {
    const imageBitmap = await createImageBitmap(blob);

    if (signal?.aborted) {
      imageBitmap.close();
      throw createAbortError(signal, `Image decode aborted: ${url}`);
    }

    return imageBitmap;
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;

      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    };
    const abortHandler = () => {
      cleanup();
      URL.revokeObjectURL(objectUrl);
      image.src = "";
      reject(createAbortError(signal, `Image load aborted: ${url}`));
    };

    image.crossOrigin = "anonymous";
    image.onload = () => {
      cleanup();
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load image: ${objectUrl}`));
    };

    signal?.addEventListener("abort", abortHandler, { once: true });
    image.src = objectUrl;
  });
}

export async function defaultTileLoader(
  coordinate: TileCoordinate,
  templateUrl: string,
  signal?: AbortSignal
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
  return loadImageDirectly(url, signal);
}

/**
 * Load a tile via fetch + blob for cases that require reading pixel data
 * (e.g. elevation Terrarium decoding).  The server **must** return CORS
 * headers (Access-Control-Allow-Origin).
 */
export async function corsTileLoader(
  coordinate: TileCoordinate,
  templateUrl: string,
  signal?: AbortSignal
): Promise<TileSource> {
  const url = templateUrl
    .replace("{z}", `${coordinate.z}`)
    .replace("{x}", `${coordinate.x}`)
    .replace("{y}", `${coordinate.y}`);

  return loadImageWithCORS(url, signal);
}
