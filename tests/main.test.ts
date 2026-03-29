import * as main from "../src/main";

describe("index page", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="app"></div>`;
  });

  it("renders the demos list with all demo cards", () => {
    main.render();

    const app = document.querySelector<HTMLDivElement>("#app");
    expect(app).not.toBeNull();
    expect(app?.textContent).toContain("Demos");
    expect(app?.textContent).toContain("Basic Globe");
    expect(app?.textContent).toContain("Basic Globe Performance Regression");
    expect(app?.textContent).toContain("Basic Globe Load Profile Regression");
    expect(app?.textContent).toContain("Basic Globe Load Ladder Regression");
    expect(app?.textContent).toContain("Basic Globe Load Recovery Regression");
    expect(app?.textContent).toContain("Basic Globe Load Recovery Stress Regression");
    expect(app?.textContent).toContain("Basic Globe Load Recovery Endurance Regression");
    expect(app?.textContent).toContain("Basic Globe Load Recovery Drift Regression");
    expect(app?.textContent).toContain("Oblique Photogrammetry Regression");
    expect(app?.textContent).toContain("Gaode Satellite");
    expect(app?.textContent).toContain("Baidu Satellite");
    expect(app?.textContent).toContain("Surface Tile Regression");
    expect(app?.textContent).toContain("Surface Tile Resize Regression");
    expect(app?.textContent).toContain("Surface Tile Zoom Regression");
    expect(app?.textContent).toContain("Surface Tile Recovery Stages Regression");
    expect(app?.textContent).toContain("Surface Tile Coord Transform Regression");
    expect(app?.textContent).toContain("Surface Tile Lifecycle Regression");
    expect(app?.textContent).toContain("Surface Tile Lifecycle Stress Regression");
    expect(app?.textContent).toContain("Vector Tile Regression");
    expect(app?.textContent).toContain("Projection Regression");
    expect(app?.textContent).toContain("Terrarium Decode Regression");
    expect(app?.textContent).toContain("Vector Pick Regression");
    expect(app?.textContent).toContain("Vector Geometry Pick Regression");
    expect(app?.textContent).toContain("Vector Multi Tile Pick Regression");
    expect(app?.textContent).toContain("Vector Overlap Pick Regression");
    expect(app?.textContent).toContain("Vector Layer ZIndex Pick Regression");

    const links = app?.querySelectorAll<HTMLAnchorElement>(".demo-card");
    expect(links?.length).toBeGreaterThanOrEqual(28);
  });

  it("each demo card links to its own page", () => {
    main.render();

    const app = document.querySelector<HTMLDivElement>("#app");
    const cards = app?.querySelectorAll<HTMLAnchorElement>(".demo-card");

    expect(cards).toBeDefined();
    expect(cards!.length).toBe(28);

    const hrefs = Array.from(cards!).map((c) => c.href);
    expect(hrefs.some((h) => h.includes("basic-globe"))).toBe(true);
    expect(hrefs.some((h) => h.includes("basic-globe-performance-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("basic-globe-load-profile-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("basic-globe-load-ladder-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("basic-globe-load-recovery-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("basic-globe-load-recovery-stress-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("basic-globe-load-recovery-endurance-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("basic-globe-load-recovery-drift-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("oblique-photogrammetry-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("gaode-satellite"))).toBe(true);
    expect(hrefs.some((h) => h.includes("baidu-satellite"))).toBe(true);
    expect(hrefs.some((h) => h.includes("surface-tile-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("surface-tile-resize-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("surface-tile-zoom-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("surface-tile-recovery-stages-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("surface-tile-coord-transform-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("surface-tile-lifecycle-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("surface-tile-lifecycle-stress-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("vector-tile-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("projection-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("terrarium-decode-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("vector-pick-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("vector-geometry-pick-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("vector-multi-tile-pick-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("vector-overlap-pick-regression"))).toBe(true);
    expect(hrefs.some((h) => h.includes("vector-layer-zindex-pick-regression"))).toBe(true);
  });
});
