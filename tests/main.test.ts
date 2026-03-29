import * as main from "../src/main";

describe("index page", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="app"></div>`;
  });

  it("renders the demos list with all demo cards", () => {
    main.render();

    const app = document.querySelector<HTMLDivElement>("#app");
    expect(app).not.toBeNull();
    expect(app?.textContent).toContain("演示");
    expect(app?.textContent).toContain("基础地球");
    expect(app?.textContent).toContain("基础地球性能回归");
    expect(app?.textContent).toContain("基础地球加载剖析回归");
    expect(app?.textContent).toContain("基础地球加载阶梯回归");
    expect(app?.textContent).toContain("基础地球加载恢复回归");
    expect(app?.textContent).toContain("基础地球加载恢复压力回归");
    expect(app?.textContent).toContain("基础地球加载恢复耐久回归");
    expect(app?.textContent).toContain("基础地球加载恢复漂移回归");
    expect(app?.textContent).toContain("倾斜摄影回归");
    expect(app?.textContent).toContain("高德卫星");
    expect(app?.textContent).toContain("高德卫星 + 标注");
    expect(app?.textContent).toContain("百度卫星");
    expect(app?.textContent).toContain("百度道路");
    expect(app?.textContent).toContain("地形瓦片回归");
    expect(app?.textContent).toContain("地形瓦片尺寸回归");
    expect(app?.textContent).toContain("地形瓦片缩放回归");
    expect(app?.textContent).toContain("地形瓦片恢复阶段回归");
    expect(app?.textContent).toContain("地形瓦片坐标变换回归");
    expect(app?.textContent).toContain("地形瓦片生命周期回归");
    expect(app?.textContent).toContain("地形瓦片生命周期压力回归");
    expect(app?.textContent).toContain("矢量瓦片回归");
    expect(app?.textContent).toContain("投影回归");
    expect(app?.textContent).toContain("Terrarium 解码回归");
    expect(app?.textContent).toContain("矢量拾取回归");
    expect(app?.textContent).toContain("矢量几何拾取回归");
    expect(app?.textContent).toContain("矢量多瓦片拾取回归");
    expect(app?.textContent).toContain("矢量重叠拾取回归");
    expect(app?.textContent).toContain("矢量层级 ZIndex 拾取回归");

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
