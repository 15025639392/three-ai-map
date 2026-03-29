const {
  GlobeEngineMock,
  addLayerMock,
  addSourceMock,
  removeLayerMock,
  setViewMock,
  getViewMock,
  onMock,
  addMarkerMock,
  addPolylineMock,
  addPolygonMock,
  TerrainTileLayerMock,
  RasterTileSourceMock,
  RasterLayerMock
} = vi.hoisted(() => {
  const addLayerMock = vi.fn();
  const addSourceMock = vi.fn();
  const removeLayerMock = vi.fn();
  const setViewMock = vi.fn();
  const getViewMock = vi.fn().mockReturnValue({ lng: 0, lat: 0, altitude: 2 });
  const onMock = vi.fn();
  const addMarkerMock = vi.fn();
  const addPolylineMock = vi.fn();
  const addPolygonMock = vi.fn();
  const GlobeEngineMock = vi.fn().mockImplementation(() => ({
    addLayer: addLayerMock,
    addSource: addSourceMock,
    removeLayer: removeLayerMock,
    setView: setViewMock,
    getView: getViewMock,
    on: onMock,
    addMarker: addMarkerMock,
    addPolyline: addPolylineMock,
    addPolygon: addPolygonMock,
    getPerformanceReport: () => ({ averageFPS: 60, frameDrops: 0, metrics: new Map() }),
  }));
  const TerrainTileLayerMock = vi.fn().mockImplementation((id: string, options?: Record<string, unknown>) => ({
    id,
    options,
    ready: () => Promise.resolve()
  }));
  const RasterTileSourceMock = vi.fn().mockImplementation((id: string, options?: Record<string, unknown>) => ({
    id,
    options
  }));
  const RasterLayerMock = vi.fn().mockImplementation((options: { id: string }) => ({
    id: options.id,
    options
  }));

  return {
    GlobeEngineMock,
    addLayerMock,
    addSourceMock,
    removeLayerMock,
    setViewMock,
    getViewMock,
    onMock,
    addMarkerMock,
    addPolylineMock,
    addPolygonMock,
    TerrainTileLayerMock,
    RasterTileSourceMock,
    RasterLayerMock
  };
});

vi.mock("../../src/engine/GlobeEngine", () => ({
  GlobeEngine: GlobeEngineMock
}));

vi.mock("../../src/layers/TerrainTileLayer", () => ({
  TerrainTileLayer: TerrainTileLayerMock
}));

vi.mock("../../src/sources/RasterTileSource", () => ({
  RasterTileSource: RasterTileSourceMock
}));

vi.mock("../../src/layers/RasterLayer", () => ({
  RasterLayer: RasterLayerMock
}));

import { runBasicGlobe } from "../../examples/basic-globe";

describe("runBasicGlobe", () => {
  let getContextSpy: { mockRestore(): void };

  beforeEach(() => {
    addLayerMock.mockClear();
    addSourceMock.mockClear();
    removeLayerMock.mockClear();
    setViewMock.mockClear();
    getViewMock.mockClear();
    onMock.mockClear();
    addMarkerMock.mockClear();
    addPolylineMock.mockClear();
    addPolygonMock.mockClear();
    TerrainTileLayerMock.mockClear();
    RasterTileSourceMock.mockClear();
    RasterLayerMock.mockClear();
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => ({
        createLinearGradient: () => ({
          addColorStop: vi.fn()
        }),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        ellipse: vi.fn(),
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1
      }) as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    getContextSpy.mockRestore();
  });

  it("wires terrain + raster source/layer", () => {
    const container = document.createElement("div");
    const output = document.createElement("div");

    runBasicGlobe(container, output);

    expect(TerrainTileLayerMock).toHaveBeenCalledTimes(1);
    expect(TerrainTileLayerMock).toHaveBeenCalledWith(
      "terrain",
      expect.objectContaining({
        terrain: expect.objectContaining({
          tileSize: 128,
          maxZoom: 11,
        }),
        zoomExaggerationBoost: 6,
        textureUvInsetPixels: 1,
        skirtDepthMeters: 1400
      })
    );
    expect(RasterTileSourceMock).toHaveBeenCalledTimes(1);
    expect(RasterTileSourceMock).toHaveBeenCalledWith(
      "osm",
      expect.objectContaining({
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 128
      })
    );
    expect(addSourceMock).toHaveBeenCalledTimes(1);
    expect(RasterLayerMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "osm", source: "osm" })
    );
    expect(addLayerMock).toHaveBeenCalledTimes(2);
  });
});
