import "../src/styles.css";
import { GlobeEngine, haversineDistance } from "../src";
import { Vector3 } from "three";

interface ScreenPoint {
  clientX: number;
  clientY: number;
}

interface GestureMetrics {
  beforeAltitude: number;
  afterPinchAltitude: number;
  afterInertiaAltitude: number;
  afterPinchAnchorErrorMeters: number;
  afterInertiaAnchorErrorMeters: number;
  afterPinchAnchorVisible: boolean;
  afterPinchAnchorKind: string;
  afterInertiaAnchorVisible: boolean;
  afterInertiaAnchorKind: string;
  nativeTouchAction: string;
  tiltDegreesBefore: number;
  tiltDegreesAfter: number;
}

interface AnchorOverlaySnapshot {
  visible: boolean;
  kind: string;
}

function setStageSize(stage: HTMLElement, width: number, height: number): void {
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
}

function toFixedNumber(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function createSyntheticTouchEvent(
  type: "touchstart" | "touchmove" | "touchend",
  touches: Array<ScreenPoint>,
  timeStamp: number
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: touches });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  return event;
}

function waitForVirtualTime(delayMs = 0): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function getTiltDegrees(engine: GlobeEngine): number {
  const inwardDirection = engine.sceneSystem.camera.position.clone().normalize().multiplyScalar(-1);
  const lookDirection = new Vector3();
  engine.sceneSystem.camera.getWorldDirection(lookDirection);
  return toFixedNumber((inwardDirection.angleTo(lookDirection) * 180) / Math.PI, 3);
}

function pickGlobeCartographic(engine: GlobeEngine, screenPoint: ScreenPoint): { lng: number; lat: number } {
  const pickResult = engine.pick(screenPoint.clientX, screenPoint.clientY);
  if (!pickResult || pickResult.type !== "globe") {
    throw new Error(`Expected globe pick at ${screenPoint.clientX},${screenPoint.clientY}`);
  }

  return {
    lng: pickResult.cartographic.lng,
    lat: pickResult.cartographic.lat
  };
}

function findAnchorPoint(engine: GlobeEngine, canvas: HTMLCanvasElement): ScreenPoint {
  const rect = canvas.getBoundingClientRect();
  const candidates = [
    { x: rect.left + rect.width * 0.50, y: rect.top + rect.height * 0.50 },
    { x: rect.left + rect.width * 0.52, y: rect.top + rect.height * 0.48 },
    { x: rect.left + rect.width * 0.48, y: rect.top + rect.height * 0.52 },
    { x: rect.left + rect.width * 0.54, y: rect.top + rect.height * 0.50 }
  ];

  for (const candidate of candidates) {
    const pickResult = engine.pick(candidate.x, candidate.y);
    if (pickResult?.type === "globe") {
      return {
        clientX: candidate.x,
        clientY: candidate.y
      };
    }
  }

  throw new Error("Failed to find an off-center globe anchor for pinch regression");
}

function readInteractionAnchorOverlay(container: HTMLElement): AnchorOverlaySnapshot {
  const overlay = container.querySelector<HTMLElement>("[data-role='interaction-anchor']");

  return {
    visible: overlay ? !overlay.hidden : false,
    kind: overlay?.dataset.kind ?? "missing"
  };
}

async function runSequence(
  engine: GlobeEngine,
  canvas: HTMLCanvasElement,
  output: HTMLElement,
  container: HTMLElement
): Promise<GestureMetrics> {
  engine.render();
  await waitForVirtualTime(0);

  const anchorPoint = findAnchorPoint(engine, canvas);
  const beforeAnchor = pickGlobeCartographic(engine, anchorPoint);
  const beforeAltitude = toFixedNumber(engine.getView().altitude, 6);
  const tiltDegreesBefore = getTiltDegrees(engine);

  canvas.dispatchEvent(
    createSyntheticTouchEvent(
      "touchstart",
      [
        { clientX: anchorPoint.clientX - 24, clientY: anchorPoint.clientY },
        { clientX: anchorPoint.clientX + 24, clientY: anchorPoint.clientY }
      ],
      100
    )
  );
  canvas.dispatchEvent(
    createSyntheticTouchEvent(
      "touchmove",
      [
        { clientX: anchorPoint.clientX - 60, clientY: anchorPoint.clientY },
        { clientX: anchorPoint.clientX + 60, clientY: anchorPoint.clientY }
      ],
      116
    )
  );

  await waitForVirtualTime(0);

  const afterPinchAltitude = toFixedNumber(engine.getView().altitude, 6);
  const afterPinchAnchor = pickGlobeCartographic(engine, anchorPoint);
  const afterPinchAnchorErrorMeters = toFixedNumber(
    haversineDistance(beforeAnchor, afterPinchAnchor),
    3
  );
  const afterPinchAnchorOverlay = readInteractionAnchorOverlay(container);

  canvas.dispatchEvent(createSyntheticTouchEvent("touchend", [], 120));

  const internalController = (
    engine as unknown as {
      cameraController: {
        handleInertiaFrame: (time: number) => void;
      };
    }
  ).cameraController;

  [136, 152, 168, 184, 200, 216].forEach((time) => internalController.handleInertiaFrame(time));
  engine.render();
  await waitForVirtualTime(0);

  const afterInertiaAltitude = toFixedNumber(engine.getView().altitude, 6);
  const afterInertiaAnchor = pickGlobeCartographic(engine, anchorPoint);
  const afterInertiaAnchorErrorMeters = toFixedNumber(
    haversineDistance(beforeAnchor, afterInertiaAnchor),
    3
  );
  const afterInertiaAnchorOverlay = readInteractionAnchorOverlay(container);
  const tiltDegreesAfter = getTiltDegrees(engine);

  container.dataset.phase = "after-inertia";
  container.dataset.beforeAltitude = `${beforeAltitude}`;
  container.dataset.afterPinchAltitude = `${afterPinchAltitude}`;
  container.dataset.afterInertiaAltitude = `${afterInertiaAltitude}`;
  container.dataset.afterPinchAnchorErrorMeters = `${afterPinchAnchorErrorMeters}`;
  container.dataset.afterInertiaAnchorErrorMeters = `${afterInertiaAnchorErrorMeters}`;
  container.dataset.afterPinchAnchorVisible = `${afterPinchAnchorOverlay.visible}`;
  container.dataset.afterPinchAnchorKind = afterPinchAnchorOverlay.kind;
  container.dataset.afterInertiaAnchorVisible = `${afterInertiaAnchorOverlay.visible}`;
  container.dataset.afterInertiaAnchorKind = afterInertiaAnchorOverlay.kind;
  container.dataset.nativeTouchAction = canvas.style.touchAction;
  container.dataset.tiltDegreesBefore = `${tiltDegreesBefore}`;
  container.dataset.tiltDegreesAfter = `${tiltDegreesAfter}`;

  const metrics = {
    beforeAltitude,
    afterPinchAltitude,
    afterInertiaAltitude,
    afterPinchAnchorErrorMeters,
    afterInertiaAnchorErrorMeters,
    afterPinchAnchorVisible: afterPinchAnchorOverlay.visible,
    afterPinchAnchorKind: afterPinchAnchorOverlay.kind,
    afterInertiaAnchorVisible: afterInertiaAnchorOverlay.visible,
    afterInertiaAnchorKind: afterInertiaAnchorOverlay.kind,
    nativeTouchAction: canvas.style.touchAction,
    tiltDegreesBefore,
    tiltDegreesAfter
  };

  output.textContent =
    `after-inertia:${afterPinchAnchorErrorMeters}/${afterInertiaAnchorErrorMeters}/` +
    `${afterPinchAltitude}/${afterInertiaAltitude}/${canvas.style.touchAction}`;

  return metrics;
}

export function runCameraPinchRegression(container: HTMLElement, output: HTMLElement): GlobeEngine {
  setStageSize(container, 960, 540);

  const engine = new GlobeEngine({
    container,
    radius: 1,
    showInteractionAnchor: true,
    background: "#03101b"
  });

  container.dataset.phase = "booting";
  output.textContent = "启动中:camera-pinch-regression";
  engine.setView({ lng: 110, lat: 18, altitude: 0.8 });

  const canvas = container.querySelector<HTMLCanvasElement>("canvas");
  if (!canvas) {
    throw new Error("Missing regression canvas");
  }

  void runSequence(engine, canvas, output, container)
    .then((metrics) => {
      (
        window as Window & {
          __cameraPinchRegression?: {
            engine: GlobeEngine;
            metrics: GestureMetrics;
          };
        }
      ).__cameraPinchRegression = {
        engine,
        metrics
      };
    })
    .catch((error) => {
      container.dataset.phase = "error";
      output.textContent = error instanceof Error ? `error:${error.message}` : "error:unknown";
    });

  return engine;
}

export function bootstrap(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("Missing #app container");
  }

  app.innerHTML = `
    <main class="demo-shell">
      <a class="back-link" href="/">返回演示列表</a>
      <div class="demo-viewport" id="globe-stage" style="flex:none;"></div>
      <div class="demo-status" id="status-output">启动中:camera-pinch-regression</div>
    </main>
  `;

  const stage = app.querySelector<HTMLElement>("#globe-stage");
  const status = app.querySelector<HTMLElement>("#status-output");
  if (stage && status) {
    runCameraPinchRegression(stage, status);
  }
}

if (typeof document !== "undefined" && document.querySelector("#app")) {
  bootstrap();
}
