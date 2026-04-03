import type { EngineView } from "../engine/EngineOptions";

export type CameraViewUpdate = Partial<EngineView> & Pick<EngineView, "lng" | "lat">;

const DEFAULT_VIEW: Required<EngineView> = {
  lng: 0,
  lat: 0,
  altitude: 20000000,
  heading: 0,
  pitch: -90,
  roll: 0
};

export class CameraController {
  private view: Required<EngineView> = { ...DEFAULT_VIEW };

  setView(view: CameraViewUpdate): void {
    this.view = {
      ...this.view,
      ...view,
      altitude: view.altitude ?? this.view.altitude,
      heading: view.heading ?? this.view.heading,
      pitch: view.pitch ?? this.view.pitch,
      roll: view.roll ?? this.view.roll
    };
  }

  getView(): EngineView {
    return { ...this.view };
  }
}
