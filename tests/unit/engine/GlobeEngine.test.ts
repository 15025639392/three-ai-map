import { describe, expect, it } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";

describe("GlobeEngine", () => {
  it("should initialize and dispose cleanly", () => {
    const container = document.createElement("div");
    const engine = new GlobeEngine({ container });

    expect(engine).toBeDefined();
    engine.dispose();
  });
});
