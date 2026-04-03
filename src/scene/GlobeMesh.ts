import { Mesh, MeshBasicMaterial, SphereGeometry } from "three";

export { GlobeMesh } from "../globe/GlobeMesh";

export function createGlobeMesh(radius = 1): Mesh {
  return new Mesh(
    new SphereGeometry(radius, 64, 48),
    new MeshBasicMaterial({ color: "#1b2330" })
  );
}
