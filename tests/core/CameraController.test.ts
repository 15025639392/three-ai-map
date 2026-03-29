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

function createTimedWheelEvent(
  deltaY: number,
  timeStamp: number,
  options: WheelEventInit = {}
): WheelEvent {
  const event = new WheelEvent("wheel", { deltaY, ...options });
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

  it("zooms around the pinch center and preserves the globe anchor on mobile", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1,
      minAltitude: 0.2
    });
    const anchorPoint = cartographicToCartesian(
      {
        lng: 120,
        lat: 20,
        height: 0
      },
      1
    );

    controller.setView({ lng: 110, lat: 18, altitude: 0.8 });
    controller.update();

    const anchorPixels = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );

    element.dispatchEvent(
      createTimedTouchEvent(
        "touchstart",
        [
          { clientX: anchorPixels.x - 24, clientY: anchorPixels.y },
          { clientX: anchorPixels.x + 24, clientY: anchorPixels.y }
        ],
        100
      )
    );
    element.dispatchEvent(
      createTimedTouchEvent(
        "touchmove",
        [
          { clientX: anchorPixels.x - 60, clientY: anchorPixels.y },
          { clientX: anchorPixels.x + 60, clientY: anchorPixels.y }
        ],
        116
      )
    );
    controller.update();

    const afterPixels = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );

    expect(controller.getView().altitude).toBeLessThan(0.8);
    expect(afterPixels.x).toBeCloseTo(anchorPixels.x, 0);
    expect(afterPixels.y).toBeCloseTo(anchorPixels.y, 0);
  });

  it("keeps the pinch anchor stable during touch zoom inertia", () => {
    const animationFrame = installAnimationFrameMock();
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1,
      minAltitude: 0.2
    });
    const anchorPoint = cartographicToCartesian(
      {
        lng: 120,
        lat: 20,
        height: 0
      },
      1
    );

    controller.setView({ lng: 110, lat: 18, altitude: 0.8 });
    controller.update();

    const anchorPixels = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );

    element.dispatchEvent(
      createTimedTouchEvent(
        "touchstart",
        [
          { clientX: anchorPixels.x - 24, clientY: anchorPixels.y },
          { clientX: anchorPixels.x + 24, clientY: anchorPixels.y }
        ],
        100
      )
    );
    element.dispatchEvent(
      createTimedTouchEvent(
        "touchmove",
        [
          { clientX: anchorPixels.x - 60, clientY: anchorPixels.y },
          { clientX: anchorPixels.x + 60, clientY: anchorPixels.y }
        ],
        116
      )
    );
    controller.update();

    const altitudeAfterPinch = controller.getView().altitude;
    element.dispatchEvent(createTimedTouchEvent("touchend", [], 120));

    animationFrame.runFrame(136);
    controller.update();

    const afterPixels = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );

    expect(controller.getView().altitude).toBeLessThan(altitudeAfterPinch);
    expect(afterPixels.x).toBeCloseTo(anchorPixels.x, 0);
    expect(afterPixels.y).toBeCloseTo(anchorPixels.y, 0);

    animationFrame.restore();
  });

  it("exposes the active wheel zoom anchor as interaction debug state", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1,
      minAltitude: 0.2
    });
    const anchorPoint = cartographicToCartesian(
      {
        lng: 120,
        lat: 20,
        height: 0
      },
      1
    );

    controller.setView({ lng: 110, lat: 18, altitude: 0.8 });
    controller.update();

    const anchorPixels = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );

    element.dispatchEvent(createTimedWheelEvent(-800, 100, {
      clientX: anchorPixels.x,
      clientY: anchorPixels.y
    }));

    const debugState = controller.getInteractionDebugState();

    expect(debugState.visible).toBe(true);
    expect(debugState.kind).toBe("zoom");
    expect(debugState.clientX).toBeCloseTo(anchorPixels.x, 10);
    expect(debugState.clientY).toBeCloseTo(anchorPixels.y, 10);
    expect(debugState.blendFactor).toBe(0);
  });

  it("exposes the active pinch center as interaction debug state", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1,
      minAltitude: 0.2
    });
    const anchorPoint = cartographicToCartesian(
      {
        lng: 120,
        lat: 20,
        height: 0
      },
      1
    );

    controller.setView({ lng: 110, lat: 18, altitude: 0.8 });
    controller.update();

    const anchorPixels = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );
    element.dispatchEvent(
      createTimedTouchEvent(
        "touchstart",
        [
          { clientX: anchorPixels.x - 24, clientY: anchorPixels.y },
          { clientX: anchorPixels.x + 24, clientY: anchorPixels.y }
        ],
        100
      )
    );
    element.dispatchEvent(
      createTimedTouchEvent(
        "touchmove",
        [
          { clientX: anchorPixels.x - 60, clientY: anchorPixels.y },
          { clientX: anchorPixels.x + 60, clientY: anchorPixels.y }
        ],
        116
      )
    );

    const debugState = controller.getInteractionDebugState();

    expect(debugState.visible).toBe(true);
    expect(debugState.kind).toBe("zoom");
    expect(debugState.clientX).toBeCloseTo(anchorPixels.x, 10);
    expect(debugState.clientY).toBeCloseTo(anchorPixels.y, 10);
    expect(debugState.blendFactor).toBe(0);
  });

  it("keeps pinch inertia gentle enough to avoid snapping to min altitude after one medium gesture", () => {
    const animationFrame = installAnimationFrameMock();
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1,
      minAltitude: 0.2
    });

    controller.setView({ lng: 110, lat: 18, altitude: 0.8 });
    controller.update();

    element.dispatchEvent(
      createTimedTouchEvent(
        "touchstart",
        [
          { clientX: 176, clientY: 200 },
          { clientX: 224, clientY: 200 }
        ],
        100
      )
    );
    element.dispatchEvent(
      createTimedTouchEvent(
        "touchmove",
        [
          { clientX: 140, clientY: 200 },
          { clientX: 260, clientY: 200 }
        ],
        116
      )
    );
    controller.update();
    element.dispatchEvent(createTimedTouchEvent("touchend", [], 120));

    animationFrame.runFrame(136);
    controller.update();

    expect(controller.getView().altitude).toBeGreaterThan(0.2);

    animationFrame.restore();
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

  it("smooths drag velocity across a brief reverse jitter before release", () => {
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

    const trackedPoint = getFrontSurfacePoint(camera);

    element.dispatchEvent(createTimedMouseEvent("mousedown", 200, 200, 100));
    window.dispatchEvent(createTimedMouseEvent("mousemove", 260, 140, 132));
    controller.update();
    window.dispatchEvent(createTimedMouseEvent("mousemove", 250, 150, 148));
    controller.update();

    const releasedPixels = projectPointToPixels(camera, trackedPoint, 400, 400);
    window.dispatchEvent(createTimedMouseEvent("mouseup", 250, 150, 152));

    animationFrame.runFrame(168);
    controller.update();

    const afterInertiaPixels = projectPointToPixels(camera, trackedPoint, 400, 400);

    expect(afterInertiaPixels.x).toBeGreaterThan(releasedPixels.x);
    expect(afterInertiaPixels.y).toBeLessThan(releasedPixels.y);

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

  it("keeps the zoom anchor under the wheel pointer", () => {
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1,
      minAltitude: 0.2
    });
    const anchorPoint = cartographicToCartesian(
      {
        lng: 120,
        lat: 20,
        height: 0
      },
      1
    );

    controller.setView({ lng: 110, lat: 18, altitude: 0.8 });
    controller.update();

    const anchorPixels = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );

    element.dispatchEvent(createTimedWheelEvent(-800, 100, {
      clientX: anchorPixels.x,
      clientY: anchorPixels.y
    }));
    controller.update();

    const afterPixels = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );

    expect(controller.getView().altitude).toBeLessThan(0.8);
    expect(afterPixels.x).toBeCloseTo(anchorPixels.x, 0);
    expect(afterPixels.y).toBeCloseTo(anchorPixels.y, 0);
  });

  it("keeps the zoom anchor stable during zoom inertia", () => {
    const animationFrame = installAnimationFrameMock();
    const element = createViewportElement();
    const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const controller = new CameraController({
      camera,
      element,
      globeRadius: 1,
      minAltitude: 0.2
    });
    const anchorPoint = cartographicToCartesian(
      {
        lng: 120,
        lat: 20,
        height: 0
      },
      1
    );

    controller.setView({ lng: 110, lat: 18, altitude: 0.8 });
    controller.update();

    const anchorPixels = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );
    element.dispatchEvent(createTimedWheelEvent(-800, 100, {
      clientX: anchorPixels.x,
      clientY: anchorPixels.y
    }));
    const altitudeAfterWheel = controller.getView().altitude;

    animationFrame.runFrame(116);
    controller.update();

    const afterPixels = projectPointToPixels(
      camera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );

    expect(controller.getView().altitude).toBeLessThan(altitudeAfterWheel);
    expect(afterPixels.x).toBeCloseTo(anchorPixels.x, 0);
    expect(afterPixels.y).toBeCloseTo(anchorPixels.y, 0);

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

  it("exposes a much stronger pan anchor blend at low altitude than at high altitude", () => {
    const anchorPoint = cartographicToCartesian(
      {
        lng: 120,
        lat: 20,
        height: 0
      },
      1
    );

    const lowElement = createViewportElement();
    const lowCamera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const lowController = new CameraController({
      camera: lowCamera,
      element: lowElement,
      globeRadius: 1
    });

    lowController.setView({ lng: 110, lat: 18, altitude: 0.3 });
    lowController.update();

    const lowAnchorPixels = projectPointToPixels(
      lowCamera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );

    lowElement.dispatchEvent(createTimedMouseEvent("mousedown", lowAnchorPixels.x, lowAnchorPixels.y, 100));
    window.dispatchEvent(createTimedMouseEvent("mousemove", lowAnchorPixels.x + 24, lowAnchorPixels.y - 18, 116));

    const lowState = lowController.getInteractionDebugState();

    window.dispatchEvent(createTimedMouseEvent("mouseup", lowAnchorPixels.x + 24, lowAnchorPixels.y - 18, 120));
    lowController.dispose();

    const highElement = createViewportElement();
    const highCamera = new PerspectiveCamera(45, 1, 0.1, 1000);
    const highController = new CameraController({
      camera: highCamera,
      element: highElement,
      globeRadius: 1
    });

    highController.setView({ lng: 110, lat: 18, altitude: 4 });
    highController.update();

    const highAnchorPixels = projectPointToPixels(
      highCamera,
      new Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z),
      400,
      400
    );

    highElement.dispatchEvent(createTimedMouseEvent("mousedown", highAnchorPixels.x, highAnchorPixels.y, 200));
    window.dispatchEvent(createTimedMouseEvent("mousemove", highAnchorPixels.x + 24, highAnchorPixels.y - 18, 216));

    const highState = highController.getInteractionDebugState();

    window.dispatchEvent(createTimedMouseEvent("mouseup", highAnchorPixels.x + 24, highAnchorPixels.y - 18, 220));
    highController.dispose();

    expect(lowState.visible).toBe(true);
    expect(lowState.kind).toBe("pan");
    expect(lowState.blendFactor).toBeLessThan(0.2);
    expect(highState.visible).toBe(true);
    expect(highState.kind).toBe("pan");
    expect(highState.blendFactor).toBeGreaterThan(0.8);
  });

  it("does not keep the original globe anchor perfectly pinned at high altitude", () => {
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

    controller.setView({ lng: 110, lat: 18, altitude: 4 });
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
    const anchorPointerDistance = Math.hypot(
      draggedAnchorPixels.x - nextPointer.x,
      draggedAnchorPixels.y - nextPointer.y
    );

    expect(anchorPointerDistance).toBeGreaterThan(4);
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
