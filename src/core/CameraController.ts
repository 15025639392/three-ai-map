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

type PointerDragMode = "orbit" | "tilt";

export class CameraController {
  private readonly camera: PerspectiveCamera;
  private readonly element: HTMLElement;
  private readonly globeRadius: number;
  private readonly minAltitude: number;
  private readonly maxAltitude: number;
  private readonly onChange?: () => void;
  private readonly zoomSpeed = 0.0005;
  private readonly touchOptions: AddEventListenerOptions = { passive: false };
  private isDragging = false;
  private altitude: number;
  private tiltRadians = 0;
  private pointerDragMode: PointerDragMode = "orbit";
  private readonly orbitQuaternion = new Quaternion();
  private readonly dragVector = new Vector3();
  private readonly rotationVelocity = new Vector3();
  private dragUsesGlobeAnchor = false;
  private inertiaUsesGlobeAnchor = false;
  private zoomVelocity = 0;
  private animationFrameId: number | null = null;
  private previousAnimationTime: number | null = null;
  private lastPointerTime: number | null = null;
  private lastPointerClientY: number | null = null;
  private lastWheelTime: number | null = null;
  private isTouchTilting = false;
  private lastTouchCenterY: number | null = null;

  constructor({
    camera,
    element,
    globeRadius,
    minAltitude = globeRadius * 0.000001,
    maxAltitude = globeRadius * 20,
    onChange
  }: CameraControllerOptions) {
    this.camera = camera;
    this.element = element;
    this.globeRadius = globeRadius;
    this.minAltitude = minAltitude;
    this.maxAltitude = maxAltitude;
    this.onChange = onChange;
    this.altitude = globeRadius * 2;

    this.element.addEventListener("mousedown", this.handlePointerDown);
    window.addEventListener("mousemove", this.handlePointerMove);
    window.addEventListener("mouseup", this.handlePointerUp);
    this.element.addEventListener("wheel", this.handleWheel, { passive: true });
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
    this.rotationVelocity.set(0, 0, 0);
    this.inertiaUsesGlobeAnchor = false;
    this.zoomVelocity = 0;
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
    this.rotationVelocity.set(0, 0, 0);
    this.lastPointerTime = this.getEventTime(event.timeStamp);
    this.lastPointerClientY = event.clientY;
    this.stopInertiaLoopIfIdle();

    if (this.pointerDragMode === "tilt") {
      this.dragUsesGlobeAnchor = false;
      this.inertiaUsesGlobeAnchor = false;
      return;
    }

    const globeAnchor = this.projectPointerToGlobe(event.clientX, event.clientY);

    if (globeAnchor) {
      this.dragUsesGlobeAnchor = true;
      this.inertiaUsesGlobeAnchor = true;
      this.dragVector.copy(globeAnchor);
      return;
    }

    this.dragUsesGlobeAnchor = false;
    this.inertiaUsesGlobeAnchor = false;
    this.dragVector.copy(this.projectPointerToArcball(event.clientX, event.clientY));
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

    if (this.dragUsesGlobeAnchor) {
      const currentGlobeAnchor = this.projectPointerToGlobe(event.clientX, event.clientY);

      if (!currentGlobeAnchor) {
        return;
      }

      ARC_BALL_CURRENT.copy(currentGlobeAnchor);
    } else {
      ARC_BALL_CURRENT.copy(this.projectPointerToArcball(event.clientX, event.clientY));
    }

    if (ARC_BALL_CURRENT.angleTo(this.dragVector) === 0) {
      return;
    }

    DRAG_ROTATION.setFromUnitVectors(ARC_BALL_CURRENT, this.dragVector);

    if (this.dragUsesGlobeAnchor) {
      this.orbitQuaternion.premultiply(DRAG_ROTATION);
    } else {
      this.orbitQuaternion.multiply(DRAG_ROTATION);
    }

    this.updateRotationVelocity(DRAG_ROTATION, this.getDeltaTime(this.lastPointerTime, event.timeStamp));
    this.lastPointerTime = this.getEventTime(event.timeStamp);

    if (!this.dragUsesGlobeAnchor) {
      this.dragVector.copy(ARC_BALL_CURRENT);
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

    if (shouldApplyInertia) {
      this.startInertiaLoop();
    }
  };

  private handleWheel = (event: WheelEvent): void => {
    const zoomScale = Math.max(this.altitude, this.globeRadius * 0.00001);
    const deltaAltitude = event.deltaY * this.zoomSpeed * zoomScale;
    const nextAltitude = this.clampAltitude(this.altitude + deltaAltitude);
    const altitudeDelta = nextAltitude - this.altitude;
    this.altitude = nextAltitude;
    const deltaTime = this.getDeltaTime(this.lastWheelTime, event.timeStamp);
    const sampleVelocity = altitudeDelta / deltaTime;

    if (Math.sign(sampleVelocity) === Math.sign(this.zoomVelocity)) {
      this.zoomVelocity += sampleVelocity;
    } else {
      this.zoomVelocity = sampleVelocity;
    }

    this.lastWheelTime = this.getEventTime(event.timeStamp);
    this.startInertiaLoop();
    this.onChange?.();
  };

  private handleTouchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 2) {
      this.isTouchTilting = false;
      this.lastTouchCenterY = null;
      return;
    }

    this.isTouchTilting = true;
    this.lastTouchCenterY = this.getTouchCenterY(event.touches);
    this.rotationVelocity.set(0, 0, 0);
    this.inertiaUsesGlobeAnchor = false;
    this.stopInertiaLoopIfIdle();
    event.preventDefault();
  };

  private handleTouchMove = (event: TouchEvent): void => {
    if (!this.isTouchTilting || event.touches.length !== 2) {
      return;
    }

    const previousCenterY = this.lastTouchCenterY;
    const centerY = this.getTouchCenterY(event.touches);
    this.lastTouchCenterY = centerY;

    if (previousCenterY === null) {
      return;
    }

    if (this.applyTiltDelta(centerY - previousCenterY, TOUCH_TILT_SPEED)) {
      this.onChange?.();
    }

    event.preventDefault();
  };

  private handleTouchEnd = (event: TouchEvent): void => {
    if (event.touches.length === 2) {
      this.lastTouchCenterY = this.getTouchCenterY(event.touches);
      this.isTouchTilting = true;
      return;
    }

    this.isTouchTilting = false;
    this.lastTouchCenterY = null;
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
      const nextAltitude = this.clampAltitude(this.altitude + this.zoomVelocity * deltaTime);
      changed = changed || nextAltitude !== this.altitude;
      this.altitude = nextAltitude;
      this.zoomVelocity *= Math.exp(-ZOOM_DAMPING * deltaTime);

      if (
        this.altitude === this.minAltitude ||
        this.altitude === this.maxAltitude ||
        Math.abs(this.zoomVelocity) <= MIN_ZOOM_SPEED
      ) {
        this.zoomVelocity = 0;
      }
    } else {
      this.zoomVelocity = 0;
    }

    return changed;
  }

  private updateRotationVelocity(rotationDelta: Quaternion, deltaTime: number): void {
    const normalizedW = Math.max(-1, Math.min(1, rotationDelta.w));
    const angle = 2 * Math.acos(normalizedW);

    if (angle <= 0) {
      this.rotationVelocity.set(0, 0, 0);
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

    this.rotationVelocity.copy(ROTATION_AXIS).multiplyScalar(angle / deltaTime);
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

  private getTouchCenterY(touches: TouchList): number {
    return (touches[0].clientY + touches[1].clientY) * 0.5;
  }

  private projectPointerToArcball(clientX: number, clientY: number): Vector3 {
    const rect = this.element.getBoundingClientRect();
    const width = rect.width || this.element.clientWidth || 1;
    const height = rect.height || this.element.clientHeight || 1;
    const radius = Math.max(1, Math.min(width, height) * 0.5);
    const x = (clientX - rect.left - width * 0.5) / radius;
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
    const x = ((clientX - rect.left) / width) * 2 - 1;
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
}
