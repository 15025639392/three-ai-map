import { Euler, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { normalizeLongitude } from "../geo/ellipsoid";
import { cartesianToCartographic } from "../geo/projection";

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

export class CameraController {
  private readonly camera: PerspectiveCamera;
  private readonly element: HTMLElement;
  private readonly globeRadius: number;
  private readonly minAltitude: number;
  private readonly maxAltitude: number;
  private readonly onChange?: () => void;
  private readonly zoomSpeed = 0.001;
  private isDragging = false;
  private altitude: number;
  private readonly orbitQuaternion = new Quaternion();
  private readonly dragVector = new Vector3();

  constructor({
    camera,
    element,
    globeRadius,
    minAltitude = globeRadius * 0.2,
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

    this.update();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setView(view: CameraView): void {
    this.altitude = this.clampAltitude(view.altitude);
    ORBIT_EULER.set(
      0,
      (-normalizeLongitude(view.lng) * Math.PI) / 180,
      (view.lat * Math.PI) / 180
    );
    this.orbitQuaternion.setFromEuler(ORBIT_EULER);
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
    const orbitDistance = this.globeRadius + this.altitude;
    const cartesian = BASE_POSITION.clone()
      .multiplyScalar(orbitDistance)
      .applyQuaternion(this.orbitQuaternion);
    const up = BASE_UP.clone().applyQuaternion(this.orbitQuaternion);

    this.camera.position.set(cartesian.x, cartesian.y, cartesian.z);
    this.camera.up.copy(up);
    this.camera.lookAt(LOOK_AT_TARGET);
  }

  dispose(): void {
    this.element.removeEventListener("mousedown", this.handlePointerDown);
    window.removeEventListener("mousemove", this.handlePointerMove);
    window.removeEventListener("mouseup", this.handlePointerUp);
    this.element.removeEventListener("wheel", this.handleWheel);
  }

  private clampAltitude(altitude: number): number {
    return Math.max(this.minAltitude, Math.min(this.maxAltitude, altitude));
  }

  private handlePointerDown = (event: MouseEvent): void => {
    this.isDragging = true;
    this.dragVector.copy(this.projectPointerToArcball(event.clientX, event.clientY));
  };

  private handlePointerMove = (event: MouseEvent): void => {
    if (!this.isDragging) {
      return;
    }

    ARC_BALL_CURRENT.copy(this.projectPointerToArcball(event.clientX, event.clientY));

    if (ARC_BALL_CURRENT.angleTo(this.dragVector) === 0) {
      return;
    }

    DRAG_ROTATION.setFromUnitVectors(ARC_BALL_CURRENT, this.dragVector);
    this.orbitQuaternion.multiply(DRAG_ROTATION);
    this.dragVector.copy(ARC_BALL_CURRENT);
    this.onChange?.();
  };

  private handlePointerUp = (): void => {
    this.isDragging = false;
  };

  private handleWheel = (event: WheelEvent): void => {
    const nextAltitude = this.altitude + event.deltaY * this.zoomSpeed;
    this.altitude = this.clampAltitude(nextAltitude);
    this.onChange?.();
  };

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
}
