const {
  GlobeEngineMock,
  addLayerMock,
  SurfaceTileLayerMock,
} = vi.hoisted(() => {
  const addLayerMock = vi.fn();
  const GlobeEngineMock = vi.fn().mockImplementation(() => ({
    addLayer: addLayerMock,
    setView: vi.fn(),
    on: vi.fn(),
  }));
  const SurfaceTileLayerMock = vi.fn().mockImplementation((_id: string, opts?: Record<string, unknown>) => ({
    id: _id,
    options: opts,
    ready: () => Promise.resolve(),
  }));

  return { GlobeEngineMock, addLayerMock, SurfaceTileLayerMock };
});

vi.mock("../../src/engine/GlobeEngine", () => ({ GlobeEngine: GlobeEngineMock }));
vi.mock("../../src/layers/SurfaceTileLayer", () => ({ SurfaceTileLayer: SurfaceTileLayerMock }));

import {
  GAODE_URLS,
  BAIDU_URLS,
  OSM_URL,
  runGaodeSatellite,
  runGaodeSatelliteLabels,
  runGaodeRoad,
  runBaiduSatellite,
  runBaiduRoad,
} from "../../examples/tile-sources-gaode-baidu";

describe("tile source URLs", () => {
  it("Gaode URLs contain expected style parameters", () => {
    expect(GAODE_URLS.road).toContain("style=8");
    expect(GAODE_URLS.satellite).toContain("style=6");
    expect(GAODE_URLS.labels).toContain("style=8");
    expect(GAODE_URLS.road).toContain("webrd");
    expect(GAODE_URLS.satellite).toContain("webst");
  });

  it("Baidu URLs contain expected style parameters", () => {
    expect(BAIDU_URLS.satellite).toContain("type=sate");
    expect(BAIDU_URLS.road).toContain("styles=pl");
    expect(BAIDU_URLS.labels).toContain("styles=sl");
  });

  it("OSM URL uses standard XYZ template", () => {
    expect(OSM_URL).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  });

  it("all URLs contain {z}, {x}, {y} placeholders", () => {
    const all = [GAODE_URLS.road, GAODE_URLS.satellite, GAODE_URLS.labels,
                 BAIDU_URLS.satellite, BAIDU_URLS.road, BAIDU_URLS.labels, OSM_URL];
    for (const url of all) {
      expect(url).toContain("{z}");
      expect(url).toContain("{x}");
      expect(url).toContain("{y}");
    }
  });
});

describe("Gaode examples", () => {
  beforeEach(() => {
    addLayerMock.mockClear();
    SurfaceTileLayerMock.mockClear();
  });

  it("runGaodeSatellite creates engine with satellite tiles", () => {
    const container = document.createElement("div");
    const output = document.createElement("div");
    runGaodeSatellite(container, output);

    expect(GlobeEngineMock).toHaveBeenCalledTimes(1);
    expect(SurfaceTileLayerMock).toHaveBeenCalledTimes(1);
    expect(SurfaceTileLayerMock).toHaveBeenCalledWith(
      "gaode-satellite",
      expect.objectContaining({
        imageryTemplateUrl: GAODE_URLS.satellite,
        maxZoom: 18,
      }),
    );
    expect(addLayerMock).toHaveBeenCalledTimes(1);
  });

  it("runGaodeSatelliteLabels creates two layers (satellite + labels)", () => {
    const container = document.createElement("div");
    runGaodeSatelliteLabels(container);

    expect(SurfaceTileLayerMock).toHaveBeenCalledTimes(2);
    expect(SurfaceTileLayerMock).toHaveBeenNthCalledWith(
      1,
      "gaode-satellite-base",
      expect.objectContaining({ imageryTemplateUrl: GAODE_URLS.satellite }),
    );
    expect(SurfaceTileLayerMock).toHaveBeenNthCalledWith(
      2,
      "gaode-satellite-labels",
      expect.objectContaining({ imageryTemplateUrl: GAODE_URLS.labels }),
    );
    expect(addLayerMock).toHaveBeenCalledTimes(2);
  });

  it("runGaodeRoad creates engine with road tiles", () => {
    const container = document.createElement("div");
    runGaodeRoad(container);

    expect(SurfaceTileLayerMock).toHaveBeenCalledTimes(1);
    expect(SurfaceTileLayerMock).toHaveBeenCalledWith(
      "gaode-road",
      expect.objectContaining({ imageryTemplateUrl: GAODE_URLS.road }),
    );
  });

  it("Gaode examples use coordTransform for GCJ-02 alignment", () => {
    const container = document.createElement("div");
    runGaodeSatellite(container);

    expect(SurfaceTileLayerMock).toHaveBeenCalledWith(
      "gaode-satellite",
      expect.objectContaining({
        coordTransform: expect.any(Function),
      }),
    );
  });
});

describe("Baidu examples", () => {
  beforeEach(() => {
    addLayerMock.mockClear();
    SurfaceTileLayerMock.mockClear();
  });

  it("runBaiduSatellite creates engine with satellite tiles", () => {
    const container = document.createElement("div");
    runBaiduSatellite(container);

    expect(SurfaceTileLayerMock).toHaveBeenCalledTimes(1);
    expect(SurfaceTileLayerMock).toHaveBeenCalledWith(
      "baidu-satellite",
      expect.objectContaining({ imageryTemplateUrl: BAIDU_URLS.satellite }),
    );
    expect(addLayerMock).toHaveBeenCalledTimes(1);
  });

  it("runBaiduRoad creates engine with road tiles", () => {
    const container = document.createElement("div");
    runBaiduRoad(container);

    expect(SurfaceTileLayerMock).toHaveBeenCalledTimes(1);
    expect(SurfaceTileLayerMock).toHaveBeenCalledWith(
      "baidu-road",
      expect.objectContaining({ imageryTemplateUrl: BAIDU_URLS.road }),
    );
  });

  it("Baidu examples use coordTransform for BD-09 alignment", () => {
    const container = document.createElement("div");
    runBaiduSatellite(container);

    expect(SurfaceTileLayerMock).toHaveBeenCalledWith(
      "baidu-satellite",
      expect.objectContaining({
        coordTransform: expect.any(Function),
      }),
    );
  });
});
