const {
  GlobeEngineMock,
  addLayerMock,
  removeLayerMock,
  setViewMock,
  onMock,
  addMarkerMock,
  addPolylineMock,
  addPolygonMock,
  SurfaceTileLayerMock,
  ImageryLayerMock,
  TiledImageryLayerMock,
  ElevationLayerMock
} = vi.hoisted(() => {
  const addLayerMock = vi.fn();
  const removeLayerMock = vi.fn();
  const setViewMock = vi.fn();
  const onMock = vi.fn();
  const addMarkerMock = vi.fn();
  const addPolylineMock = vi.fn();
  const addPolygonMock = vi.fn();
  const GlobeEngineMock = vi.fn().mockImplementation(() => ({
    addLayer: addLayerMock,
    removeLayer: removeLayerMock,
    setView: setViewMock,
    on: onMock,
    addMarker: addMarkerMock,
    addPolyline: addPolylineMock,
    addPolygon: addPolygonMock
  }));
  const SurfaceTileLayerMock = vi.fn().mockImplementation((id: string) => ({
    id,
    ready: () => Promise.resolve()
  }));
  const ImageryLayerMock = vi.fn().mockImplementation((id: string) => ({
    id,
    ready: () => Promise.resolve()
  }));
  const TiledImageryLayerMock = vi.fn().mockImplementation((id: string) => ({
    id,
    ready: () => Promise.resolve()
  }));
  const ElevationLayerMock = vi.fn().mockImplementation((id: string) => ({
    id,
    ready: () => Promise.resolve()
  }));

  return {
    GlobeEngineMock,
    addLayerMock,
    removeLayerMock,
    setViewMock,
    onMock,
    addMarkerMock,
    addPolylineMock,
    addPolygonMock,
    SurfaceTileLayerMock,
    ImageryLayerMock,
    TiledImageryLayerMock,
    ElevationLayerMock
  };
});

vi.mock("../../src/engine/GlobeEngine", () => ({
  GlobeEngine: GlobeEngineMock
}));

vi.mock("../../src/layers/SurfaceTileLayer", () => ({
  SurfaceTileLayer: SurfaceTileLayerMock
}));

vi.mock("../../src/layers/ImageryLayer", () => ({
  ImageryLayer: ImageryLayerMock
}));

vi.mock("../../src/layers/TiledImageryLayer", () => ({
  TiledImageryLayer: TiledImageryLayerMock
}));

vi.mock("../../src/layers/ElevationLayer", () => ({
  ElevationLayer: ElevationLayerMock
}));

import { runBasicGlobe } from "../../examples/basic-globe";

describe("runBasicGlobe", () => {
  let getContextSpy: { mockRestore(): void };

  beforeEach(() => {
    addLayerMock.mockClear();
    removeLayerMock.mockClear();
    setViewMock.mockClear();
    onMock.mockClear();
    addMarkerMock.mockClear();
    addPolylineMock.mockClear();
    addPolygonMock.mockClear();
    SurfaceTileLayerMock.mockClear();
    ImageryLayerMock.mockClear();
    TiledImageryLayerMock.mockClear();
    ElevationLayerMock.mockClear();
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

  it("loads phase-5 surface tiles on top of remote imagery base layer", () => {
    const container = document.createElement("div");
    const output = document.createElement("div");

    runBasicGlobe(container, output);

    expect(ImageryLayerMock).not.toHaveBeenCalled();
    expect(SurfaceTileLayerMock).toHaveBeenCalledTimes(1);
    expect(SurfaceTileLayerMock).toHaveBeenCalledWith(
      "surface-tiles",
      expect.objectContaining({
        tileSize: 128,
        maxZoom: 11,
        zoomExaggerationBoost: 6,
        textureUvInsetPixels: 1,
        skirtDepthMeters: 1400
      })
    );
    expect(TiledImageryLayerMock).toHaveBeenCalledTimes(1);
    expect(ElevationLayerMock).toHaveBeenCalledTimes(1);
    expect(addLayerMock).toHaveBeenCalledTimes(3);
  });
});
