import { PerspectiveCamera, Vector3 } from "three";
import { CameraController } from "../../src/core/CameraController";
import { cartographicToCartesian } from "../../src/geo/projection";

function projectPoint(camera: PerspectiveCamera, point: Vector3): Vector3 {
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return point.clone().project(camera);
}

function projectPointToPixels(
  camera: PerspectiveCamera,
  point: Vector3,
  width: number,
  height: number
): { x: number; y: number } {
  const projected = projectPoint(camera, point);
  return {
    x: (projected.x * 0.5 + 0.5) * width,
    y: (-projected.y * 0.5 + 0.5) * height
  };
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

function createTimedMouseEvent(
  type: "mousedown" | "mousemove" | "mouseup",
  clientX: number,
  clientY: number,
  timeStamp: number,
  options: MouseEventInit = {}
): MouseEvent {
  const event = new MouseEvent(type, { clientX, clientY, ...options });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  return event;
}

function createTimedWheelEvent(deltaY: number, timeStamp: number): WheelEvent {
  const event = new WheelEvent("wheel", { deltaY });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  return event;
}

function createTimedTouchEvent(
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  touches: Array<{ clientX: number; clientY: number }>,
  timeStamp: number
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: touches });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  return event;
}

function getTiltRadians(camera: PerspectiveCamera): number {
  const inwardDirection = camera.position.clone().normalize().multiplyScalar(-1);
  const lookDirection = new Vector3();
  camera.getWorldDirection(lookDirection);
  return inwardDirection.angleTo(lookDirection);
}

function installAnimationFrameMock() {
  let nextFrameId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const requestSpy = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      callbacks.set(frameId, callback);
      return frameId;
    });
  const cancelSpy = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation((frameId: number) => {
      callbacks.delete(frameId);
    });

  return {
    runFrame(time: number) {
      const pendingCallbacks = [...callbacks.values()];
      callbacks.clear();
      pendingCallbacks.forEach((callback) => callback(time));
    },
    restore() {
      requestSpy.mockRestore();
      cancelSpy.mockRestore();
    }
  };
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

  it("keeps mirrored display motion aligned with drag direction", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1,
      mirrorDisplayX: true
    });

    controller.setView({ lng: 0, lat: 0, altitude: 2 });
    controller.update();

    const trackedPoint = getFrontSurfacePoint(camera);
    const before = projectPointToPixels(camera, trackedPoint, 400, 400);

    element.dispatchEvent(new MouseEvent("mousedown", { clientX: 200, clientY: 200 }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 260, clientY: 140 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
    controller.update();

    const after = projectPointToPixels(camera, trackedPoint, 400, 400);

    expect(400 - after.x).toBeGreaterThan(400 - before.x);
    expect(after.y).toBeLessThan(before.y);
  });

  it("tilts camera when control-dragging upward on desktop", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1
    });

    controller.setView({ lng: 0, lat: 20, altitude: 2 });
    controller.update();
    const beforeTilt = getTiltRadians(camera);
    const beforeView = controller.getView();

    element.dispatchEvent(createTimedMouseEvent("mousedown", 200, 240, 100, { ctrlKey: true }));
    window.dispatchEvent(createTimedMouseEvent("mousemove", 200, 160, 116, { ctrlKey: true }));
    window.dispatchEvent(createTimedMouseEvent("mouseup", 200, 160, 120));
    controller.update();

    const afterTilt = getTiltRadians(camera);
    const afterView = controller.getView();

    expect(afterTilt).toBeGreaterThan(beforeTilt + 0.05);
    expect(afterView.lng).toBeCloseTo(beforeView.lng, 4);
    expect(afterView.lat).toBeCloseTo(beforeView.lat, 4);
    expect(afterView.altitude).toBeCloseTo(beforeView.altitude, 4);
  });

  it("tilts camera when two-finger touch moves upward on mobile", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1
    });

    controller.setView({ lng: 0, lat: 20, altitude: 2 });
    controller.update();
    const beforeTilt = getTiltRadians(camera);

    element.dispatchEvent(
      createTimedTouchEvent(
        "touchstart",
        [
          { clientX: 160, clientY: 240 },
          { clientX: 240, clientY: 240 }
        ],
        100
      )
    );
    element.dispatchEvent(
      createTimedTouchEvent(
        "touchmove",
        [
          { clientX: 160, clientY: 170 },
          { clientX: 240, clientY: 170 }
        ],
        116
      )
    );
    element.dispatchEvent(createTimedTouchEvent("touchend", [], 120));
    controller.update();

    const afterTilt = getTiltRadians(camera);
    expect(afterTilt).toBeGreaterThan(beforeTilt + 0.05);
  });

  it("resets tilt when setView is called", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1
    });

    controller.setView({ lng: 0, lat: 20, altitude: 2 });
    controller.update();

    element.dispatchEvent(createTimedMouseEvent("mousedown", 200, 240, 100, { ctrlKey: true }));
    window.dispatchEvent(createTimedMouseEvent("mousemove", 200, 160, 116, { ctrlKey: true }));
    window.dispatchEvent(createTimedMouseEvent("mouseup", 200, 160, 120));
    controller.update();

    expect(getTiltRadians(camera)).toBeGreaterThan(0.05);

    controller.setView({ lng: 10, lat: 30, altitude: 2.2 });
    controller.update();

    expect(getTiltRadians(camera)).toBeLessThan(0.001);
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

  it("keeps rotating briefly after release based on drag velocity", () => {
    const animationFrame = installAnimationFrameMock();
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1
    });

    controller.setView({ lng: 0, lat: 0, altitude: 2 });
    controller.update();

    element.dispatchEvent(createTimedMouseEvent("mousedown", 200, 200, 100));
    window.dispatchEvent(createTimedMouseEvent("mousemove", 260, 140, 116));
    controller.update();

    const releasedPosition = camera.position.clone();
    window.dispatchEvent(createTimedMouseEvent("mouseup", 260, 140, 120));

    animationFrame.runFrame(136);
    controller.update();

    expect(camera.position.distanceTo(releasedPosition)).toBeGreaterThan(0.001);

    animationFrame.restore();
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

  it("allows default ultra-close altitude for high zoom scale and updates near plane accordingly", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1
    });

    controller.setView({ lng: 0, lat: 0, altitude: 0.000000001 });
    controller.update();

    expect(controller.getView().altitude).toBeCloseTo(0.000001, 9);
    expect(camera.near).toBeLessThan(0.000001);
  });

  it("keeps zooming briefly after wheel input based on zoom velocity", () => {
    const animationFrame = installAnimationFrameMock();
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1,
      minAltitude: 0.2
    });

    controller.setView({ lng: 0, lat: 0, altitude: 2 });

    element.dispatchEvent(createTimedWheelEvent(1000, 100));
    const altitudeAfterWheel = controller.getView().altitude;

    animationFrame.runFrame(116);

    expect(controller.getView().altitude).toBeGreaterThan(altitudeAfterWheel);

    animationFrame.restore();
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

  it("keeps the original globe anchor under the pointer at high zoom", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1
    });
    const anchorPoint = cartographicToCartesian(
      {
        lng: 120,
        lat: 20,
        height: 0
      },
      1
    );

    controller.setView({ lng: 110, lat: 18, altitude: 0.3 });
    controller.update();

    const anchorPixels = projectPointToPixels(camera, new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z), 400, 400);
    const nextPointer = {
      x: anchorPixels.x + 24,
      y: anchorPixels.y - 18
    };

    element.dispatchEvent(
      new MouseEvent("mousedown", {
        clientX: anchorPixels.x,
        clientY: anchorPixels.y
      })
    );
    window.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: nextPointer.x,
        clientY: nextPointer.y
      })
    );
    window.dispatchEvent(new MouseEvent("mouseup"));
    controller.update();

    const draggedAnchorPixels = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );

    expect(draggedAnchorPixels.x).toBeCloseTo(nextPointer.x, 0);
    expect(draggedAnchorPixels.y).toBeCloseTo(nextPointer.y, 0);
  });

  it("keeps inertia moving in the same direction after a high-zoom globe-anchor drag", () => {
    const animationFrame = installAnimationFrameMock();
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1
    });
    const anchorPoint = cartographicToCartesian(
      {
        lng: 120,
        lat: 20,
        height: 0
      },
      1
    );

    controller.setView({ lng: 110, lat: 18, altitude: 0.3 });
    controller.update();

    const before = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );
    const nextPointer = {
      x: before.x + 24,
      y: before.y - 18
    };

    element.dispatchEvent(createTimedMouseEvent("mousedown", before.x, before.y, 100));
    window.dispatchEvent(createTimedMouseEvent("mousemove", nextPointer.x, nextPointer.y, 116));
    controller.update();

    const afterDrag = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );
    window.dispatchEvent(createTimedMouseEvent("mouseup", nextPointer.x, nextPointer.y, 120));
    animationFrame.runFrame(136);
    controller.update();

    const afterInertia = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );

    expect(afterInertia.x - afterDrag.x).toBeGreaterThanOrEqual(0);
    expect(afterDrag.y - afterInertia.y).toBeGreaterThanOrEqual(0);

    animationFrame.restore();
  });
});
