const {
  GlobeEngineMock,
  addLayerMock,
  addSourceMock,
  TerrainTileLayerMock,
  RasterTileSourceMock,
  RasterLayerMock,
} = vi.hoisted(() => {
  const addLayerMock = vi.fn();
  const addSourceMock = vi.fn();
  const GlobeEngineMock = vi.fn().mockImplementation(() => ({
    addLayer: addLayerMock,
    addSource: addSourceMock,
    setView: vi.fn(),
    on: vi.fn(),
  }));
  const TerrainTileLayerMock = vi.fn().mockImplementation((id: string, options?: Record<string, unknown>) => ({
    id,
    options,
    ready: () => Promise.resolve(),
  }));
  const RasterTileSourceMock = vi.fn().mockImplementation((id: string, options?: Record<string, unknown>) => ({
    id,
    options,
  }));
  const RasterLayerMock = vi.fn().mockImplementation((options: { id: string; source: string; [key: string]: unknown }) => ({
    id: options.id,
    options,
  }));

  return {
    GlobeEngineMock,
    addLayerMock,
    addSourceMock,
    TerrainTileLayerMock,
    RasterTileSourceMock,
    RasterLayerMock,
  };
});

vi.mock("../../src/engine/GlobeEngine", () => ({ GlobeEngine: GlobeEngineMock }));
vi.mock("../../src/layers/TerrainTileLayer", () => ({ TerrainTileLayer: TerrainTileLayerMock }));
vi.mock("../../src/sources/RasterTileSource", () => ({ RasterTileSource: RasterTileSourceMock }));
vi.mock("../../src/layers/RasterLayer", () => ({ RasterLayer: RasterLayerMock }));

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
    addSourceMock.mockClear();
    TerrainTileLayerMock.mockClear();
    RasterTileSourceMock.mockClear();
    RasterLayerMock.mockClear();
  });

  it("runGaodeSatellite creates engine with satellite tiles", () => {
    const container = document.createElement("div");
    const output = document.createElement("div");
    runGaodeSatellite(container, output);

    expect(GlobeEngineMock).toHaveBeenCalledTimes(1);
    expect(GlobeEngineMock).toHaveBeenCalledWith(
      expect.objectContaining({ mirrorDisplayX: true })
    );
    expect(TerrainTileLayerMock).toHaveBeenCalledTimes(1);
    expect(RasterTileSourceMock).toHaveBeenCalledWith(
      "gaode-satellite",
      expect.objectContaining({
        tiles: [GAODE_URLS.satellite],
      }),
    );
    expect(addSourceMock).toHaveBeenCalledWith(
      "gaode-satellite",
      expect.objectContaining({ id: "gaode-satellite" })
    );
    expect(RasterLayerMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "gaode-satellite", source: "gaode-satellite" })
    );
    expect(addLayerMock).toHaveBeenCalledTimes(2);
  });

  it("runGaodeSatelliteLabels creates two layers (satellite + labels)", () => {
    const container = document.createElement("div");
    runGaodeSatelliteLabels(container);

    expect(TerrainTileLayerMock).toHaveBeenCalledTimes(1);
    expect(RasterTileSourceMock).toHaveBeenCalledTimes(2);
    expect(RasterTileSourceMock).toHaveBeenNthCalledWith(
      1,
      "gaode-satellite-base",
      expect.objectContaining({ tiles: [GAODE_URLS.satellite] }),
    );
    expect(RasterTileSourceMock).toHaveBeenNthCalledWith(
      2,
      "gaode-satellite-labels",
      expect.objectContaining({ tiles: [GAODE_URLS.labels] }),
    );
    expect(addLayerMock).toHaveBeenCalledTimes(3);
  });

  it("runGaodeRoad creates engine with road tiles", () => {
    const container = document.createElement("div");
    runGaodeRoad(container);

    expect(RasterTileSourceMock).toHaveBeenCalledWith(
      "gaode-road",
      expect.objectContaining({ tiles: [GAODE_URLS.road] }),
    );
  });

  it("Gaode examples use coordTransform for GCJ-02 alignment", () => {
    const container = document.createElement("div");
    runGaodeSatellite(container);

    expect(TerrainTileLayerMock).toHaveBeenCalledWith(
      "terrain",
      expect.objectContaining({
        coordTransform: expect.any(Function),
      }),
    );
  });
});

describe("Baidu examples", () => {
  beforeEach(() => {
    addLayerMock.mockClear();
    addSourceMock.mockClear();
    TerrainTileLayerMock.mockClear();
    RasterTileSourceMock.mockClear();
    RasterLayerMock.mockClear();
  });

  it("runBaiduSatellite creates engine with satellite tiles", () => {
    const container = document.createElement("div");
    runBaiduSatellite(container);

    expect(RasterTileSourceMock).toHaveBeenCalledWith(
      "baidu-satellite",
      expect.objectContaining({ tiles: [BAIDU_URLS.satellite] }),
    );
    expect(addLayerMock).toHaveBeenCalledTimes(2);
  });

  it("runBaiduRoad creates engine with road tiles", () => {
    const container = document.createElement("div");
    runBaiduRoad(container);

    expect(RasterTileSourceMock).toHaveBeenCalledWith(
      "baidu-road",
      expect.objectContaining({ tiles: [BAIDU_URLS.road] }),
    );
  });

  it("Baidu examples use coordTransform for BD-09 alignment", () => {
    const container = document.createElement("div");
    runBaiduSatellite(container);

    expect(TerrainTileLayerMock).toHaveBeenCalledWith(
      "terrain",
      expect.objectContaining({
        coordTransform: expect.any(Function),
      }),
    );
  });
});
