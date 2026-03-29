export {};

interface TerrariumDecodeWorkerRequest {
  id: number;
  encoding: "terrarium" | "mapbox";
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

interface TerrariumDecodeWorkerResponse {
  id: number;
  buffer: ArrayBuffer;
}

function decodeTerrariumHeight(red: number, green: number, blue: number): number {
  return red * 256 + green + blue / 256 - 32768;
}

function decodeMapboxHeight(red: number, green: number, blue: number): number {
  return -10000 + (red * 256 * 256 + green * 256 + blue) * 0.1;
}

const workerContext = self as unknown as {
  onmessage: (event: MessageEvent<TerrariumDecodeWorkerRequest>) => void;
  postMessage: (message: TerrariumDecodeWorkerResponse, transfer: Transferable[]) => void;
};

workerContext.onmessage = (event: MessageEvent<TerrariumDecodeWorkerRequest>) => {
  const { id, encoding, width, height, buffer } = event.data;
  const pixels = new Uint8ClampedArray(buffer);
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

  const response: TerrariumDecodeWorkerResponse = {
    id,
    buffer: heights.buffer
  };

  workerContext.postMessage(response, [response.buffer]);
};
