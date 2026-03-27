import { FrameLoop } from "../../src/core/FrameLoop";

describe("FrameLoop", () => {
  it("notifies subscribers with a positive delta time", () => {
    const loop = new FrameLoop();
    const subscriber = vi.fn();

    loop.subscribe(subscriber);
    loop.tick(16.7);

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith(16.7);
  });
});
