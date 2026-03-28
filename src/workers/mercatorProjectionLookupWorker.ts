export {};

interface ProjectionRowLookupWorkerRequest {
  id: number;
  outputHeight: number;
  mercatorHeight: number;
}

interface ProjectionRowLookupWorkerResponse {
  id: number;
  buffer: ArrayBuffer;
}

function mercatorYFromLatitude(latitude: number, height: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const radians = (clamped * Math.PI) / 180;
  return (
    (0.5 - Math.log((1 + Math.sin(radians)) / (1 - Math.sin(radians))) / (4 * Math.PI)) * height
  );
}

const workerContext = self as unknown as {
  onmessage: (event: MessageEvent<ProjectionRowLookupWorkerRequest>) => void;
  postMessage: (message: ProjectionRowLookupWorkerResponse, transfer: Transferable[]) => void;
};

workerContext.onmessage = (event: MessageEvent<ProjectionRowLookupWorkerRequest>) => {
  const { id, outputHeight, mercatorHeight } = event.data;
  const lookup = new Float32Array(outputHeight);

  for (let row = 0; row < outputHeight; row += 1) {
    const latitude = 90 - ((row + 0.5) / outputHeight) * 180;
    lookup[row] = mercatorYFromLatitude(latitude, mercatorHeight);
  }

  const response: ProjectionRowLookupWorkerResponse = {
    id,
    buffer: lookup.buffer
  };

  workerContext.postMessage(response, [response.buffer]);
};
