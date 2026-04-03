import { describe, expect, it } from "vitest";
import { GlobeEngine } from "../../../src/engine/GlobeEngine";

describe("DebugOverlay", () => {
  it("should not attach debug overlay by default", () => {
    const container = document.createElement("div");
    const engine = new GlobeEngine({ container });

    expect(container.querySelector("[data-role='debug-overlay']")).toBeNull();

    engine.dispose();
  });

  it("should attach and update debug overlay when enabled", () => {
    const container = document.createElement("div");
    const engine = new GlobeEngine({ container, showDebugOverlay: true });

    engine.render();

    const overlay = container.querySelector<HTMLElement>("[data-role='debug-overlay']");
    expect(overlay).toBeTruthy();
    expect(overlay?.dataset.visible).toBe("true");
    expect(overlay?.querySelector("[data-metric='fps']")?.textContent).toMatch(/[0-9]/);
    expect(overlay?.querySelector("[data-metric='visibleTiles']")?.textContent).toMatch(/[0-9]/);
    expect(overlay?.querySelector("[data-metric='errorCount']")?.textContent).toBe("0");

    engine.dispose();
    expect(container.querySelector("[data-role='debug-overlay']")).toBeNull();
  });
});
