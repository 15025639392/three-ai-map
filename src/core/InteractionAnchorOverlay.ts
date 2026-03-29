import type { InteractionDebugState, InteractionDebugStateKind } from "./CameraController";

const ANCHOR_COLORS: Record<InteractionDebugStateKind, string> = {
  pan: "#54f7ff",
  zoom: "#6aa7ff",
  rotate: "#d38bff",
  tilt: "#9af77a",
  fallback: "#f8c25d"
};

export class InteractionAnchorOverlay {
  readonly element: HTMLDivElement;

  private readonly container: HTMLElement;
  private readonly previousContainerPosition: string;
  private readonly containerPositionWasStatic: boolean;

  constructor(container: HTMLElement) {
    this.container = container;
    this.previousContainerPosition = container.style.position;
    this.containerPositionWasStatic = window.getComputedStyle(container).position === "static";

    if (this.containerPositionWasStatic) {
      this.container.style.position = "relative";
    }

    this.element = document.createElement("div");
    this.element.dataset.role = "interaction-anchor";
    this.element.hidden = true;
    this.element.setAttribute("aria-hidden", "true");
    this.element.style.position = "absolute";
    this.element.style.left = "0";
    this.element.style.top = "0";
    this.element.style.width = "28px";
    this.element.style.height = "28px";
    this.element.style.pointerEvents = "none";
    this.element.style.opacity = "0";
    this.element.style.zIndex = "4";
    this.element.style.color = ANCHOR_COLORS.fallback;
    this.element.style.transition = "opacity 120ms ease";
    this.element.style.willChange = "transform, opacity";

    const ring = document.createElement("div");
    ring.dataset.part = "ring";
    ring.style.position = "absolute";
    ring.style.inset = "0";
    ring.style.border = "2px solid currentColor";
    ring.style.borderRadius = "999px";
    ring.style.background = "rgba(255, 255, 255, 0.06)";
    ring.style.boxShadow = "0 0 0 1px rgba(3, 6, 13, 0.7) inset";

    const horizontalLine = document.createElement("div");
    horizontalLine.dataset.part = "horizontal";
    horizontalLine.style.position = "absolute";
    horizontalLine.style.left = "5px";
    horizontalLine.style.top = "13px";
    horizontalLine.style.width = "18px";
    horizontalLine.style.height = "2px";
    horizontalLine.style.borderRadius = "999px";
    horizontalLine.style.background = "currentColor";
    horizontalLine.style.boxShadow = "0 0 0 1px rgba(3, 6, 13, 0.35)";

    const verticalLine = document.createElement("div");
    verticalLine.dataset.part = "vertical";
    verticalLine.style.position = "absolute";
    verticalLine.style.left = "13px";
    verticalLine.style.top = "5px";
    verticalLine.style.width = "2px";
    verticalLine.style.height = "18px";
    verticalLine.style.borderRadius = "999px";
    verticalLine.style.background = "currentColor";
    verticalLine.style.boxShadow = "0 0 0 1px rgba(3, 6, 13, 0.35)";

    this.element.append(ring, horizontalLine, verticalLine);
    this.container.appendChild(this.element);
  }

  update(state: InteractionDebugState): void {
    if (!state.visible) {
      this.element.hidden = true;
      this.element.style.opacity = "0";
      return;
    }

    const rect = this.container.getBoundingClientRect();
    const x = state.clientX - rect.left;
    const y = state.clientY - rect.top;

    this.element.hidden = false;
    this.element.dataset.kind = state.kind;
    this.element.dataset.blendFactor = state.blendFactor.toFixed(3);
    this.element.style.color = ANCHOR_COLORS[state.kind];
    this.element.style.opacity = "1";
    this.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }

  destroy(): void {
    this.element.remove();

    if (this.containerPositionWasStatic) {
      this.container.style.position = this.previousContainerPosition;
    }
  }
}
