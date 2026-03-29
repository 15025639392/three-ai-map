import { Euler, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { normalizeLongitude } from "../geo/ellipsoid";
import { cartesianToCartographic } from "../geo/projection";
import { intersectRayWithSphere } from "../geo/raycast";

interface CameraView {
  lng: number;
  lat: number;
  altitude: number;
}

interface CameraControllerOptions {
  camera: PerspectiveCamera;
  element: HTMLElement;
  globeRadius: number;
  minAltitude?: number;
  maxAltitude?: number;
  mirrorDisplayX?: boolean;
  onChange?: () => void;
}

const LOOK_AT_TARGET = new Vector3(0, 0, 0);
const BASE_POSITION = new Vector3(1, 0, 0);
const BASE_UP = new Vector3(0, 1, 0);
const BASE_RIGHT = new Vector3(0, 0, -1);
const ORBIT_EULER = new Euler(0, 0, 0, "YXZ");
const DRAG_ROTATION = new Quaternion();
const ARC_BALL_VECTOR = new Vector3();
const ARC_BALL_CURRENT = new Vector3();
const GLOBE_DRAG_VECTOR = new Vector3();
const POINTER_RAY_TARGET = new Vector3();
const POINTER_RAY_DIRECTION = new Vector3();
const ROTATION_AXIS = new Vector3();
const TILT_ROTATION = new Quaternion();
const TILT_LOOK_DIRECTION = new Vector3();
const TILT_LOOK_TARGET = new Vector3();

const DEFAULT_FRAME_TIME = 1000 / 60;
const ROTATION_DAMPING = 0.006;
const ZOOM_DAMPING = 0.01;
const MIN_ROTATION_SPEED = 0.00001;
const MIN_ZOOM_SPEED = 0.00001;
const MIN_NEAR_PLANE = 0.0000002;
const MAX_NEAR_PLANE = 0.1;
const NEAR_PLANE_ALTITUDE_FACTOR = 0.5;
const MIN_TILT_RADIANS = 0;
const MAX_TILT_RADIANS = (75 * Math.PI) / 180;
const POINTER_TILT_SPEED = 0.004;
const TOUCH_TILT_SPEED = 0.004;
const TOUCH_ZOOM_INERTIA_GAIN = 0.25;
const PAN_BLEND_START_ALTITUDE_FACTOR = 0.75;
const PAN_BLEND_END_ALTITUDE_FACTOR = 4.5;
const ROTATION_VELOCITY_SMOOTHING_WINDOW = 96;
const MAX_ROTATION_VELOCITY_SAMPLES = 6;

type PointerDragMode = "orbit" | "tilt";
export type InteractionDebugStateKind = "pan" | "zoom" | "rotate" | "tilt" | "fallback";

export interface InteractionDebugState {
  visible: boolean;
  kind: InteractionDebugStateKind;
  clientX: number;
  clientY: number;
  blendFactor: number;
}

interface RotationVelocitySample {
  time: number;
  duration: number;
  usesGlobeAnchor: boolean;
  velocity: Vector3;
}

export class CameraController {
  private readonly camera: PerspectiveCamera;
  private readonly element: HTMLElement;
  private readonly globeRadius: number;
  private readonly minAltitude: number;
  private readonly maxAltitude: number;
  private readonly mirrorDisplayX: boolean;
  private readonly onChange?: () => void;
  private readonly zoomSpeed = 0.0004054651081081644;
  private readonly touchOptions: AddEventListenerOptions = { passive: false };
  private isDragging = false;
  private altitude: number;
  private tiltRadians = 0;
  private pointerDragMode: PointerDragMode = "orbit";
  private readonly orbitQuaternion = new Quaternion();
  private readonly dragVector = new Vector3();
  private readonly dragOrbitVector = new Vector3();
  private readonly rotationVelocity = new Vector3();
  private readonly rotationVelocitySamples: RotationVelocitySample[] = [];
  private dragUsesGlobeAnchor = false;
  private inertiaUsesGlobeAnchor = false;
  private zoomVelocity = 0;
  private readonly zoomAnchorVector = new Vector3();
  private zoomAnchorClientX = 0;
  private zoomAnchorClientY = 0;
  private hasZoomAnchor = false;
  private readonly interactionDebugState: InteractionDebugState = {
    visible: false,
    kind: "fallback",
    clientX: 0,
    clientY: 0,
    blendFactor: 0
  };
  private animationFrameId: number | null = null;
  private previousAnimationTime: number | null = null;
  private lastPointerTime: number | null = null;
  private lastPointerClientY: number | null = null;
  private lastWheelTime: number | null = null;
  private isTouchTilting = false;
  private lastTouchCenterY: number | null = null;
  private lastTouchDistance: number | null = null;
  private lastTouchTime: number | null = null;

  constructor({
    camera,
    element,
    globeRadius,
    minAltitude = globeRadius * 0.000001,
    maxAltitude = globeRadius * 20,
    mirrorDisplayX = false,
    onChange
  }: CameraControllerOptions) {
    this.camera = camera;
    this.element = element;
    this.globeRadius = globeRadius;
    this.minAltitude = minAltitude;
    this.maxAltitude = maxAltitude;
    this.mirrorDisplayX = mirrorDisplayX;
    this.onChange = onChange;
    this.altitude = globeRadius * 2;

    this.element.addEventListener("mousedown", this.handlePointerDown);
    window.addEventListener("mousemove", this.handlePointerMove);
    window.addEventListener("mouseup", this.handlePointerUp);
    this.element.addEventListener("wheel", this.handleWheel, { passive: false });
    this.element.addEventListener("touchstart", this.handleTouchStart, this.touchOptions);
    this.element.addEventListener("touchmove", this.handleTouchMove, this.touchOptions);
    this.element.addEventListener("touchend", this.handleTouchEnd, this.touchOptions);
    this.element.addEventListener("touchcancel", this.handleTouchEnd, this.touchOptions);

    this.update();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setView(view: CameraView): void {
    this.altitude = this.clampAltitude(view.altitude);
    this.tiltRadians = MIN_TILT_RADIANS;
    ORBIT_EULER.set(
      0,
      (-normalizeLongitude(view.lng) * Math.PI) / 180,
      (view.lat * Math.PI) / 180
    );
    this.orbitQuaternion.setFromEuler(ORBIT_EULER);
    this.clearRotationVelocitySamples();
    this.inertiaUsesGlobeAnchor = false;
    this.zoomVelocity = 0;
    this.clearZoomAnchor();
    this.stopInertiaLoop();
    this.onChange?.();
  }

  getView(): CameraView {
    const position = BASE_POSITION.clone()
      .multiplyScalar(this.globeRadius + this.altitude)
      .applyQuaternion(this.orbitQuaternion);
    const cartographic = cartesianToCartographic(
      {
        x: position.x,
        y: position.y,
        z: position.z
      },
      this.globeRadius
    );

    return {
      lng: cartographic.lng,
      lat: cartographic.lat,
      altitude: this.altitude
    };
  }

  getInteractionDebugState(): InteractionDebugState {
    return { ...this.interactionDebugState };
  }

  update(): void {
    this.updateCameraNearPlane();

    const orbitDistance = this.globeRadius + this.altitude;
    const cartesian = BASE_POSITION.clone()
      .multiplyScalar(orbitDistance)
      .applyQuaternion(this.orbitQuaternion);
    const up = BASE_UP.clone().applyQuaternion(this.orbitQuaternion);

    this.camera.position.set(cartesian.x, cartesian.y, cartesian.z);
    this.camera.up.copy(up);

    if (this.tiltRadians <= MIN_TILT_RADIANS + Number.EPSILON) {
      this.camera.lookAt(LOOK_AT_TARGET);
      return;
    }

    TILT_LOOK_DIRECTION
      .copy(BASE_POSITION)
      .multiplyScalar(-1)
      .applyQuaternion(this.orbitQuaternion);
    ROTATION_AXIS.copy(BASE_RIGHT).applyQuaternion(this.orbitQuaternion).normalize();
    TILT_ROTATION.setFromAxisAngle(ROTATION_AXIS, this.tiltRadians);
    TILT_LOOK_DIRECTION.applyQuaternion(TILT_ROTATION).normalize();
    TILT_LOOK_TARGET.copy(this.camera.position).addScaledVector(TILT_LOOK_DIRECTION, orbitDistance);
    this.camera.lookAt(TILT_LOOK_TARGET);
  }

  dispose(): void {
    this.element.removeEventListener("mousedown", this.handlePointerDown);
    window.removeEventListener("mousemove", this.handlePointerMove);
    window.removeEventListener("mouseup", this.handlePointerUp);
    this.element.removeEventListener("wheel", this.handleWheel);
    this.element.removeEventListener("touchstart", this.handleTouchStart, this.touchOptions);
    this.element.removeEventListener("touchmove", this.handleTouchMove, this.touchOptions);
    this.element.removeEventListener("touchend", this.handleTouchEnd, this.touchOptions);
    this.element.removeEventListener("touchcancel", this.handleTouchEnd, this.touchOptions);
    this.stopInertiaLoop();
  }

  private clampAltitude(altitude: number): number {
    return Math.max(this.minAltitude, Math.min(this.maxAltitude, altitude));
  }

  private clampTilt(tiltRadians: number): number {
    return Math.max(MIN_TILT_RADIANS, Math.min(MAX_TILT_RADIANS, tiltRadians));
  }

  private applyTiltDelta(deltaY: number, speed: number): boolean {
    if (deltaY === 0) {
      return false;
    }

    const nextTilt = this.clampTilt(this.tiltRadians - deltaY * speed);

    if (Math.abs(nextTilt - this.tiltRadians) <= Number.EPSILON) {
      return false;
    }

    this.tiltRadians = nextTilt;
    return true;
  }

  private updateCameraNearPlane(): void {
    const nextNear = Math.max(
      MIN_NEAR_PLANE,
      Math.min(MAX_NEAR_PLANE, this.altitude * NEAR_PLANE_ALTITUDE_FACTOR)
    );

    if (Math.abs(this.camera.near - nextNear) <= Number.EPSILON) {
      return;
    }

    this.camera.near = nextNear;
    this.camera.updateProjectionMatrix();
  }

  private handlePointerDown = (event: MouseEvent): void => {
    this.isDragging = true;
    this.pointerDragMode = event.ctrlKey ? "tilt" : "orbit";
    this.clearRotationVelocitySamples();
    this.zoomVelocity = 0;
    this.clearZoomAnchor();
    this.lastPointerTime = this.getEventTime(event.timeStamp);
    this.lastPointerClientY = event.clientY;
    this.stopInertiaLoopIfIdle();

    if (this.pointerDragMode === "tilt") {
      this.dragUsesGlobeAnchor = false;
      this.inertiaUsesGlobeAnchor = false;
      return;
    }

    const globeAnchor = this.projectPointerToGlobe(event.clientX, event.clientY);
    this.dragOrbitVector.copy(this.projectPointerToArcball(event.clientX, event.clientY));

    if (globeAnchor) {
      this.dragUsesGlobeAnchor = true;
      this.inertiaUsesGlobeAnchor = this.getPanBlendFactor() < 0.5;
      this.dragVector.copy(globeAnchor);
      this.setInteractionDebugState("pan", event.clientX, event.clientY, this.getPanBlendFactor());
      return;
    }

    this.dragUsesGlobeAnchor = false;
    this.inertiaUsesGlobeAnchor = false;
    this.setInteractionDebugState("fallback", event.clientX, event.clientY, 1);
  };

  private handlePointerMove = (event: MouseEvent): void => {
    if (!this.isDragging) {
      return;
    }

    if (this.pointerDragMode === "tilt") {
      const previousY = this.lastPointerClientY;
      this.lastPointerClientY = event.clientY;

      if (previousY === null) {
        return;
      }

      if (this.applyTiltDelta(event.clientY - previousY, POINTER_TILT_SPEED)) {
        this.onChange?.();
      }

      return;
    }

    const panBlendFactor = this.getPanBlendFactor();
    const previousOrientation = this.orbitQuaternion.clone();
    const currentArcball = this.projectPointerToArcball(event.clientX, event.clientY);
    const orbitRotation = new Quaternion();
    orbitRotation.setFromUnitVectors(currentArcball, this.dragOrbitVector);

    const orbitOrientation = previousOrientation.clone().multiply(orbitRotation);
    let nextOrientation = orbitOrientation;
    let canUseGlobeAnchor = false;

    if (this.dragUsesGlobeAnchor) {
      const currentGlobeAnchor = this.projectPointerToGlobe(event.clientX, event.clientY);

      if (currentGlobeAnchor) {
        DRAG_ROTATION.setFromUnitVectors(currentGlobeAnchor, this.dragVector);
        const anchorOrientation = previousOrientation.clone().premultiply(DRAG_ROTATION);
        nextOrientation = anchorOrientation.slerp(orbitOrientation, panBlendFactor);
        canUseGlobeAnchor = true;
        this.setInteractionDebugState("pan", event.clientX, event.clientY, panBlendFactor);
      } else {
        nextOrientation = orbitOrientation;
        this.setInteractionDebugState("fallback", event.clientX, event.clientY, 1);
      }
    } else {
      this.setInteractionDebugState("fallback", event.clientX, event.clientY, 1);
    }

    if (nextOrientation.angleTo(previousOrientation) <= Number.EPSILON) {
      this.dragOrbitVector.copy(currentArcball);

      if (this.dragUsesGlobeAnchor) {
        const stableGlobeAnchor = this.projectPointerToGlobe(event.clientX, event.clientY);

        if (stableGlobeAnchor) {
          this.dragVector.copy(stableGlobeAnchor);
        }
      }

      this.clearRotationVelocitySamples();
      this.inertiaUsesGlobeAnchor = false;

      return;
    }

    const useGlobeAnchorInertia = canUseGlobeAnchor && panBlendFactor < 0.5;

    if (useGlobeAnchorInertia) {
      DRAG_ROTATION.copy(nextOrientation).multiply(previousOrientation.clone().invert());
    } else {
      DRAG_ROTATION.copy(previousOrientation).invert().multiply(nextOrientation);
    }

    const sampleTime = this.getEventTime(event.timeStamp);
    this.orbitQuaternion.copy(nextOrientation);
    this.inertiaUsesGlobeAnchor = useGlobeAnchorInertia;
    this.updateRotationVelocity(
      DRAG_ROTATION,
      this.getDeltaTime(this.lastPointerTime, event.timeStamp),
      sampleTime,
      useGlobeAnchorInertia
    );
    this.lastPointerTime = sampleTime;
    this.dragOrbitVector.copy(currentArcball);

    if (this.dragUsesGlobeAnchor) {
      const nextGlobeAnchor = this.projectPointerToGlobe(event.clientX, event.clientY);

      if (nextGlobeAnchor) {
        this.dragVector.copy(nextGlobeAnchor);
      }
    }

    this.onChange?.();
  };

  private handlePointerUp = (): void => {
    this.isDragging = false;
    const shouldApplyInertia = this.pointerDragMode === "orbit";
    this.pointerDragMode = "orbit";
    this.dragUsesGlobeAnchor = false;
    this.lastPointerClientY = null;
    this.lastPointerTime = null;
    this.clearInteractionDebugState();

    if (shouldApplyInertia) {
      this.startInertiaLoop();
    }
  };

  private handleWheel = (event: WheelEvent): void => {
    const deltaLogAltitude = this.normalizeWheelDelta(event) * this.zoomSpeed;
    const previousAltitude = this.altitude;
    this.captureZoomAnchor(event.clientX, event.clientY);
    const nextAltitude = this.clampAltitude(this.altitude * Math.exp(deltaLogAltitude));
    const appliedLogDelta = nextAltitude > 0 && previousAltitude > 0
      ? Math.log(nextAltitude / previousAltitude)
      : 0;

    this.altitude = nextAltitude;
    const anchorChanged = this.applyZoomAnchor();
    const deltaTime = this.getDeltaTime(this.lastWheelTime, event.timeStamp);
    const sampleVelocity = appliedLogDelta / deltaTime;

    this.updateZoomVelocity(sampleVelocity);

    this.lastWheelTime = this.getEventTime(event.timeStamp);
    if (Math.abs(appliedLogDelta) <= Number.EPSILON) {
      this.zoomVelocity = 0;
      this.clearZoomAnchor();
    }

    this.startInertiaLoop();
    if (nextAltitude !== previousAltitude || anchorChanged) {
      this.onChange?.();
    }
    event.preventDefault();
  };

  private handleTouchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 2) {
      this.isTouchTilting = false;
      this.lastTouchCenterY = null;
      this.lastTouchDistance = null;
      this.lastTouchTime = null;
      return;
    }

    const touchCenter = this.getTouchCenter(event.touches);
    this.isTouchTilting = true;
    this.lastTouchCenterY = touchCenter.y;
    this.lastTouchDistance = this.getTouchDistance(event.touches);
    this.lastTouchTime = this.getEventTime(event.timeStamp);
    this.clearRotationVelocitySamples();
    this.inertiaUsesGlobeAnchor = false;
    this.zoomVelocity = 0;
    this.captureZoomAnchor(touchCenter.x, touchCenter.y);
    this.stopInertiaLoopIfIdle();
    event.preventDefault();
  };

  private handleTouchMove = (event: TouchEvent): void => {
    if (!this.isTouchTilting || event.touches.length !== 2) {
      return;
    }

    const previousCenterY = this.lastTouchCenterY;
    const previousDistance = this.lastTouchDistance;
    const previousTouchTime = this.lastTouchTime;
    const touchCenter = this.getTouchCenter(event.touches);
    const centerY = touchCenter.y;
    const distance = this.getTouchDistance(event.touches);
    this.lastTouchCenterY = centerY;
    this.lastTouchDistance = distance;
    this.lastTouchTime = this.getEventTime(event.timeStamp);

    if (previousCenterY === null) {
      return;
    }

    let changed = false;

    if (previousDistance !== null && previousDistance > 0 && distance > 0) {
      this.updateZoomAnchorClient(touchCenter.x, touchCenter.y);
      const previousAltitude = this.altitude;
      const nextAltitude = this.clampAltitude(this.altitude * (previousDistance / distance));
      const appliedLogDelta = nextAltitude > 0 && previousAltitude > 0
        ? Math.log(nextAltitude / previousAltitude)
        : 0;

      this.altitude = nextAltitude;
      const anchorChanged = this.applyZoomAnchor();
      const deltaTime = this.getDeltaTime(previousTouchTime, event.timeStamp);

      if (Math.abs(appliedLogDelta) > Number.EPSILON) {
        this.updateZoomVelocity((appliedLogDelta / deltaTime) * TOUCH_ZOOM_INERTIA_GAIN);
      } else {
        this.zoomVelocity = 0;
      }

      changed = nextAltitude !== previousAltitude || anchorChanged;
    } else {
      this.zoomVelocity = 0;
    }

    if (this.applyTiltDelta(centerY - previousCenterY, TOUCH_TILT_SPEED)) {
      changed = true;
    }

    if (changed) {
      this.onChange?.();
    }

    event.preventDefault();
  };

  private handleTouchEnd = (event: TouchEvent): void => {
    if (event.touches.length === 2) {
      const touchCenter = this.getTouchCenter(event.touches);
      this.lastTouchCenterY = touchCenter.y;
      this.lastTouchDistance = this.getTouchDistance(event.touches);
      this.lastTouchTime = this.getEventTime(event.timeStamp);
      this.isTouchTilting = true;
      this.updateZoomAnchorClient(touchCenter.x, touchCenter.y);
      return;
    }

    this.isTouchTilting = false;
    this.lastTouchCenterY = null;

    this.lastTouchDistance = null;
    this.lastTouchTime = null;

    if (Math.abs(this.zoomVelocity) > MIN_ZOOM_SPEED) {
      this.startInertiaLoop();
      return;
    }

    this.zoomVelocity = 0;
    this.clearZoomAnchor();
  };

  private startInertiaLoop(): void {
    if (!this.hasInertia() || this.animationFrameId !== null) {
      return;
    }

    this.previousAnimationTime = null;
    this.animationFrameId = window.requestAnimationFrame(this.handleInertiaFrame);
  }

  private stopInertiaLoop(): void {
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.previousAnimationTime = null;
  }

  private stopInertiaLoopIfIdle(): void {
    if (!this.hasInertia()) {
      this.stopInertiaLoop();
    }
  }

  private handleInertiaFrame = (time: number): void => {
    this.animationFrameId = null;
    const deltaTime =
      this.previousAnimationTime === null
        ? DEFAULT_FRAME_TIME
        : Math.max(1, time - this.previousAnimationTime);
    this.previousAnimationTime = time;

    const changed = this.applyInertia(deltaTime);

    if (changed) {
      this.onChange?.();
    }

    if (this.hasInertia()) {
      this.animationFrameId = window.requestAnimationFrame(this.handleInertiaFrame);
      return;
    }

    this.previousAnimationTime = null;
  };

  private applyInertia(deltaTime: number): boolean {
    let changed = false;

    const rotationSpeed = this.rotationVelocity.length();

    if (rotationSpeed > MIN_ROTATION_SPEED) {
      ROTATION_AXIS.copy(this.rotationVelocity).normalize();
      DRAG_ROTATION.setFromAxisAngle(ROTATION_AXIS, rotationSpeed * deltaTime);

      if (this.inertiaUsesGlobeAnchor) {
        this.orbitQuaternion.premultiply(DRAG_ROTATION);
      } else {
        this.orbitQuaternion.multiply(DRAG_ROTATION);
      }

      this.rotationVelocity.multiplyScalar(Math.exp(-ROTATION_DAMPING * deltaTime));

      if (this.rotationVelocity.length() <= MIN_ROTATION_SPEED) {
        this.rotationVelocity.set(0, 0, 0);
        this.inertiaUsesGlobeAnchor = false;
      }

      changed = true;
    } else {
      this.rotationVelocity.set(0, 0, 0);
      this.inertiaUsesGlobeAnchor = false;
    }

    if (Math.abs(this.zoomVelocity) > MIN_ZOOM_SPEED) {
      const previousAltitude = this.altitude;
      const nextAltitude = this.clampAltitude(this.altitude * Math.exp(this.zoomVelocity * deltaTime));
      changed = changed || nextAltitude !== this.altitude;
      this.altitude = nextAltitude;
      if (nextAltitude !== previousAltitude) {
        changed = this.applyZoomAnchor() || changed;
      }
      this.zoomVelocity *= Math.exp(-ZOOM_DAMPING * deltaTime);

      if (
        this.altitude === this.minAltitude ||
        this.altitude === this.maxAltitude ||
        Math.abs(this.zoomVelocity) <= MIN_ZOOM_SPEED
      ) {
        this.zoomVelocity = 0;
        this.clearZoomAnchor();
      }
    } else {
      this.zoomVelocity = 0;
      this.clearZoomAnchor();
    }

    return changed;
  }

  private updateRotationVelocity(
    rotationDelta: Quaternion,
    deltaTime: number,
    sampleTime: number,
    usesGlobeAnchor: boolean
  ): void {
    const normalizedW = Math.max(-1, Math.min(1, rotationDelta.w));
    const angle = 2 * Math.acos(normalizedW);

    if (angle <= 0) {
      this.clearRotationVelocitySamples();
      return;
    }

    const sinHalfAngle = Math.sqrt(1 - normalizedW * normalizedW);

    if (sinHalfAngle <= 0.000001) {
      ROTATION_AXIS.set(1, 0, 0);
    } else {
      ROTATION_AXIS.set(
        rotationDelta.x / sinHalfAngle,
        rotationDelta.y / sinHalfAngle,
        rotationDelta.z / sinHalfAngle
      );
    }

    const lastSample = this.rotationVelocitySamples[this.rotationVelocitySamples.length - 1];

    if (lastSample && lastSample.usesGlobeAnchor !== usesGlobeAnchor) {
      this.rotationVelocitySamples.length = 0;
    }

    this.rotationVelocitySamples.push({
      time: sampleTime,
      duration: deltaTime,
      usesGlobeAnchor,
      velocity: ROTATION_AXIS.clone().multiplyScalar(angle / deltaTime)
    });

    while (this.rotationVelocitySamples.length > MAX_ROTATION_VELOCITY_SAMPLES) {
      this.rotationVelocitySamples.shift();
    }

    while (
      this.rotationVelocitySamples.length > 0 &&
      sampleTime - this.rotationVelocitySamples[0].time > ROTATION_VELOCITY_SMOOTHING_WINDOW
    ) {
      this.rotationVelocitySamples.shift();
    }

    this.rotationVelocity.set(0, 0, 0);
    let totalDuration = 0;

    for (const sample of this.rotationVelocitySamples) {
      totalDuration += sample.duration;
      this.rotationVelocity.addScaledVector(sample.velocity, sample.duration);
    }

    if (totalDuration <= 0) {
      this.clearRotationVelocitySamples();
      return;
    }

    this.rotationVelocity.multiplyScalar(1 / totalDuration);
  }

  private clearRotationVelocitySamples(): void {
    this.rotationVelocitySamples.length = 0;
    this.rotationVelocity.set(0, 0, 0);
  }

  private hasInertia(): boolean {
    return this.rotationVelocity.length() > MIN_ROTATION_SPEED || Math.abs(this.zoomVelocity) > MIN_ZOOM_SPEED;
  }

  private getDeltaTime(previousTime: number | null, timeStamp: number): number {
    const currentTime = this.getEventTime(timeStamp);

    if (previousTime === null) {
      return DEFAULT_FRAME_TIME;
    }

    return Math.max(1, currentTime - previousTime);
  }

  private getEventTime(timeStamp: number): number {
    return timeStamp > 0 ? timeStamp : performance.now();
  }

  private normalizeWheelDelta(event: WheelEvent): number {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return event.deltaY * 16;
    }

    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      const rect = this.element.getBoundingClientRect();
      return event.deltaY * (rect.height || this.element.clientHeight || 1);
    }

    return event.deltaY;
  }

  private getTouchCenterY(touches: TouchList): number {
    return (touches[0].clientY + touches[1].clientY) * 0.5;
  }

  private getTouchCenter(touches: TouchList): { x: number; y: number } {
    return {
      x: (touches[0].clientX + touches[1].clientX) * 0.5,
      y: this.getTouchCenterY(touches)
    };
  }

  private getTouchDistance(touches: TouchList): number {
    return Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
  }

  private updateZoomVelocity(sampleVelocity: number): void {
    if (Math.sign(sampleVelocity) === Math.sign(this.zoomVelocity)) {
      this.zoomVelocity += sampleVelocity;
      return;
    }

    this.zoomVelocity = sampleVelocity;
  }

  private captureZoomAnchor(clientX: number, clientY: number): void {
    const directAnchor = this.projectPointerToGlobe(clientX, clientY);

    if (directAnchor) {
      this.zoomAnchorVector.copy(directAnchor);
      this.zoomAnchorClientX = clientX;
      this.zoomAnchorClientY = clientY;
      this.hasZoomAnchor = true;
      this.setInteractionDebugState("zoom", clientX, clientY);
      return;
    }

    const rect = this.element.getBoundingClientRect();
    const centerClientX = rect.left + (rect.width || this.element.clientWidth || 1) * 0.5;
    const centerClientY = rect.top + (rect.height || this.element.clientHeight || 1) * 0.5;
    const centerAnchor = this.projectPointerToGlobe(centerClientX, centerClientY);

    if (centerAnchor) {
      this.zoomAnchorVector.copy(centerAnchor);
      this.zoomAnchorClientX = centerClientX;
      this.zoomAnchorClientY = centerClientY;
      this.hasZoomAnchor = true;
      this.setInteractionDebugState("fallback", centerClientX, centerClientY);
      return;
    }

    this.clearZoomAnchor();
  }

  private applyZoomAnchor(): boolean {
    if (!this.hasZoomAnchor) {
      return false;
    }

    const currentAnchor = this.projectPointerToGlobe(this.zoomAnchorClientX, this.zoomAnchorClientY);

    if (!currentAnchor || currentAnchor.angleTo(this.zoomAnchorVector) <= Number.EPSILON) {
      return false;
    }

    DRAG_ROTATION.setFromUnitVectors(currentAnchor, this.zoomAnchorVector);
    this.orbitQuaternion.premultiply(DRAG_ROTATION);
    return true;
  }

  private updateZoomAnchorClient(clientX: number, clientY: number): void {
    if (!this.hasZoomAnchor) {
      this.captureZoomAnchor(clientX, clientY);
      return;
    }

    this.zoomAnchorClientX = clientX;
    this.zoomAnchorClientY = clientY;
    this.setInteractionDebugState("zoom", clientX, clientY);
  }

  private clearZoomAnchor(): void {
    this.hasZoomAnchor = false;
    this.zoomAnchorClientX = 0;
    this.zoomAnchorClientY = 0;
    this.clearInteractionDebugState();
  }

  private setInteractionDebugState(
    kind: InteractionDebugStateKind,
    clientX: number,
    clientY: number,
    blendFactor = 0
  ): void {
    this.interactionDebugState.visible = true;
    this.interactionDebugState.kind = kind;
    this.interactionDebugState.clientX = clientX;
    this.interactionDebugState.clientY = clientY;
    this.interactionDebugState.blendFactor = blendFactor;
  }

  private clearInteractionDebugState(): void {
    this.interactionDebugState.visible = false;
    this.interactionDebugState.kind = "fallback";
    this.interactionDebugState.clientX = 0;
    this.interactionDebugState.clientY = 0;
    this.interactionDebugState.blendFactor = 0;
  }

  private getPanBlendFactor(): number {
    return smoothstep(
      this.globeRadius * PAN_BLEND_START_ALTITUDE_FACTOR,
      this.globeRadius * PAN_BLEND_END_ALTITUDE_FACTOR,
      this.altitude
    );
  }

  private projectPointerToArcball(clientX: number, clientY: number): Vector3 {
    const rect = this.element.getBoundingClientRect();
    const width = rect.width || this.element.clientWidth || 1;
    const height = rect.height || this.element.clientHeight || 1;
    const radius = Math.max(1, Math.min(width, height) * 0.5);
    const localX = this.resolveLocalPointerX(clientX, rect.left, width);
    const x = (localX - width * 0.5) / radius;
    const y = (height * 0.5 - (clientY - rect.top)) / radius;
    const lengthSquared = x * x + y * y;
    const z = lengthSquared > 1 ? 0 : Math.sqrt(1 - lengthSquared);

    ARC_BALL_VECTOR
      .copy(BASE_RIGHT)
      .multiplyScalar(x)
      .addScaledVector(BASE_UP, y)
      .addScaledVector(BASE_POSITION, z);

    if (lengthSquared > 1) {
      ARC_BALL_VECTOR.normalize();
    }

    return ARC_BALL_VECTOR.normalize();
  }

  private projectPointerToGlobe(clientX: number, clientY: number): Vector3 | null {
    const rect = this.element.getBoundingClientRect();
    const width = rect.width || this.element.clientWidth || 1;
    const height = rect.height || this.element.clientHeight || 1;
    const localX = this.resolveLocalPointerX(clientX, rect.left, width);
    const x = (localX / width) * 2 - 1;
    const y = -((clientY - rect.top) / height) * 2 + 1;

    this.update();
    this.camera.updateMatrixWorld(true);
    this.camera.updateProjectionMatrix();

    POINTER_RAY_TARGET.set(x, y, 0.5).unproject(this.camera);
    POINTER_RAY_DIRECTION.copy(POINTER_RAY_TARGET).sub(this.camera.position).normalize();

    const hit = intersectRayWithSphere(
      {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z
      },
      {
        x: POINTER_RAY_DIRECTION.x,
        y: POINTER_RAY_DIRECTION.y,
        z: POINTER_RAY_DIRECTION.z
      },
      this.globeRadius
    );

    if (!hit) {
      return null;
    }

    return GLOBE_DRAG_VECTOR.set(hit.x, hit.y, hit.z).normalize();
  }

  private resolveLocalPointerX(clientX: number, rectLeft: number, width: number): number {
    const localX = clientX - rectLeft;
    return this.mirrorDisplayX ? width - localX : localX;
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) {
    return value >= edge1 ? 1 : 0;
  }

  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
