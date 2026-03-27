import { PerspectiveCamera, Scene } from "three";
import { GlobeMesh } from "../../src/globe/GlobeMesh";
import { PolygonLayer } from "../../src/layers/PolygonLayer";
import { PolylineLayer } from "../../src/layers/PolylineLayer";

describe("overlay layers", () => {
  it("creates one line object per polyline feature", () => {
    const scene = new Scene();
    const layer = new PolylineLayer("routes");

    layer.addPolyline({
      id: "route-1",
      coordinates: [
        { lng: 0, lat: 0, altitude: 0.02 },
        { lng: 10, lat: 5, altitude: 0.02 },
        { lng: 20, lat: 10, altitude: 0.02 }
      ],
      color: "#ffffff"
    });
    layer.onAdd({
      scene,
      camera: new PerspectiveCamera(),
      globe: new GlobeMesh({ radius: 1 }),
      radius: 1
    });

    expect(scene.children).toHaveLength(1);
    expect(scene.children[0].children).toHaveLength(1);
  });

  it("creates one mesh object per polygon feature", () => {
    const scene = new Scene();
    const layer = new PolygonLayer("regions");

    layer.addPolygon({
      id: "region-1",
      coordinates: [
        { lng: 0, lat: 0, altitude: 0.01 },
        { lng: 10, lat: 0, altitude: 0.01 },
        { lng: 10, lat: 10, altitude: 0.01 },
        { lng: 0, lat: 10, altitude: 0.01 }
      ],
      fillColor: "#44ff88"
    });
    layer.onAdd({
      scene,
      camera: new PerspectiveCamera(),
      globe: new GlobeMesh({ radius: 1 }),
      radius: 1
    });

    expect(scene.children).toHaveLength(1);
    expect(scene.children[0].children).toHaveLength(1);
  });
});
