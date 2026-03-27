import { AmbientLight, DirectionalLight, PerspectiveCamera, Scene } from "three";

interface SceneSystemOptions {
  fieldOfView?: number;
  near?: number;
  far?: number;
}

export class SceneSystem {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;

  constructor({ fieldOfView = 45, near = 0.1, far = 5000 }: SceneSystemOptions = {}) {
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(fieldOfView, 1, near, far);

    const ambient = new AmbientLight("#ffffff", 0.6);
    const directional = new DirectionalLight("#ffffff", 1.6);
    directional.position.set(8, 6, 8);

    this.scene.add(ambient);
    this.scene.add(directional);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
