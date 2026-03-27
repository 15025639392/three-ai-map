import { decodeTerrariumPixels } from "../../src/tiles/TerrariumDecoder";

describe("TerrariumDecoder", () => {
  it("decodes terrarium rgb pixels into elevation meters", () => {
    const pixels = new Uint8ClampedArray([
      128, 0, 0, 255,
      128, 128, 0, 255,
      129, 0, 0, 255,
      130, 0, 0, 255
    ]);
    const heights = decodeTerrariumPixels(2, 2, pixels);

    expect(heights).toEqual(new Float32Array([0, 128, 256, 512]));
  });
});
