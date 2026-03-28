export {};

interface TerrariumDecodeWorkerRequest {
  id: number;
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

const workerContext = self as unknown as {
  onmessage: (event: MessageEvent<TerrariumDecodeWorkerRequest>) => void;
  postMessage: (message: TerrariumDecodeWorkerResponse, transfer: Transferable[]) => void;
};

workerContext.onmessage = (event: MessageEvent<TerrariumDecodeWorkerRequest>) => {
  const { id, width, height, buffer } = event.data;
  const pixels = new Uint8ClampedArray(buffer);
  const heights = new Float32Array(width * height);

  for (let index = 0; index < heights.length; index += 1) {
    const offset = index * 4;
    heights[index] = decodeTerrariumHeight(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
  }

  const response: TerrariumDecodeWorkerResponse = {
    id,
    buffer: heights.buffer
  };

  workerContext.postMessage(response, [response.buffer]);
};
