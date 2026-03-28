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
    expect(app?.textContent).toContain("Gaode Satellite");
    expect(app?.textContent).toContain("Baidu Satellite");

    const links = app?.querySelectorAll<HTMLAnchorElement>(".demo-card");
    expect(links?.length).toBeGreaterThanOrEqual(5);
  });

  it("each demo card links to its own page", () => {
    main.render();

    const app = document.querySelector<HTMLDivElement>("#app");
    const cards = app?.querySelectorAll<HTMLAnchorElement>(".demo-card");

    expect(cards).toBeDefined();
    expect(cards!.length).toBe(5);

    const hrefs = Array.from(cards!).map((c) => c.href);
    expect(hrefs.some((h) => h.includes("basic-globe"))).toBe(true);
    expect(hrefs.some((h) => h.includes("gaode-satellite"))).toBe(true);
    expect(hrefs.some((h) => h.includes("baidu-satellite"))).toBe(true);
  });
});
