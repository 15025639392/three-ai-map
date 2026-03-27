import { PerspectiveCamera, Vector3 } from "three";
import { CameraController } from "../../src/core/CameraController";

function projectPoint(camera: PerspectiveCamera, point: Vector3): Vector3 {
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return point.clone().project(camera);
}

function getFrontSurfacePoint(camera: PerspectiveCamera): Vector3 {
  return camera.position.clone().normalize();
}

function createViewportElement(): HTMLDivElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", { value: 400, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: 400, configurable: true });
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 400,
      height: 400,
      right: 400,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }) as DOMRect;
  return element;
}

describe("CameraController", () => {
  it("positions the camera from lng lat altitude", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1
    });

    controller.setView({ lng: 0, lat: 0, altitude: 2 });
    controller.update();

    expect(camera.position.x).toBeCloseTo(3);
    expect(camera.position.y).toBeCloseTo(0);
    expect(camera.position.z).toBeCloseTo(0);
  });

  it("keeps globe motion aligned with drag direction", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1
    });

    controller.setView({ lng: 0, lat: 0, altitude: 2 });
    controller.update();

    const trackedPoint = getFrontSurfacePoint(camera);
    const before = projectPoint(camera, trackedPoint);

    element.dispatchEvent(new MouseEvent("mousedown", { clientX: 200, clientY: 200 }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 260, clientY: 140 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
    controller.update();

    const after = projectPoint(camera, trackedPoint);

    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);
  });

  it("does not keep rotating when the pointer position stops changing", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1
    });

    controller.setView({ lng: 0, lat: 0, altitude: 2 });
    controller.update();

    element.dispatchEvent(new MouseEvent("mousedown", { clientX: 200, clientY: 200 }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 260, clientY: 140 }));
    controller.update();

    const stablePosition = camera.position.clone();
    const stableUp = camera.up.clone();

    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 260, clientY: 140 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
    controller.update();

    expect(camera.position.distanceTo(stablePosition)).toBeLessThan(1e-6);
    expect(camera.up.distanceTo(stableUp)).toBeLessThan(1e-6);
  });

  it("zooms out on wheel-down and zooms in on wheel-up", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1,
      minAltitude: 0.2
    });

    controller.setView({ lng: 0, lat: 0, altitude: 2 });

    element.dispatchEvent(new WheelEvent("wheel", { deltaY: 1000 }));
    controller.update();

    expect(controller.getView().altitude).toBeCloseTo(3);

    controller.setView({ lng: 0, lat: 0, altitude: 2 });
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: 100000 }));
    controller.update();

    expect(controller.getView().altitude).toBeCloseTo(20);

    controller.setView({ lng: 0, lat: 0, altitude: 2 });
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: -100000 }));
    controller.update();

    expect(controller.getView().altitude).toBeCloseTo(0.2);
  });

  it("keeps orbit rotation continuous after crossing the north pole", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1
    });

    controller.setView({ lng: 0, lat: 80, altitude: 2 });

    element.dispatchEvent(new MouseEvent("mousedown", { clientX: 200, clientY: 200 }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 320 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
    controller.update();

    const firstView = controller.getView();
    const firstPosition = camera.position.clone();

    expect(Number.isFinite(firstView.lng)).toBe(true);
    expect(Number.isFinite(firstView.lat)).toBe(true);
    expect(camera.position.length()).toBeCloseTo(3);
    expect(camera.up.length()).toBeCloseTo(1);

    element.dispatchEvent(new MouseEvent("mousedown", { clientX: 200, clientY: 320 }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 360 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
    controller.update();

    expect(camera.position.distanceTo(firstPosition)).toBeGreaterThan(0.05);
  });

  it("keeps globe motion aligned with drag direction when upside down", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1
    });

    controller.setView({ lng: 0, lat: 100, altitude: 2 });
    controller.update();

    const trackedPoint = getFrontSurfacePoint(camera);
    const before = projectPoint(camera, trackedPoint);

    element.dispatchEvent(new MouseEvent("mousedown", { clientX: 200, clientY: 200 }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 260, clientY: 140 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
    controller.update();

    const after = projectPoint(camera, trackedPoint);

    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);
  });
});
