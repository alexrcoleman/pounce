export type DragInputModePreference = "auto" | "touch" | "mouse";
export type ResolvedDragInputMode = "touch" | "mouse";

export type DragInputCapabilities = {
  hasFinePointer: boolean;
  hasHover: boolean;
  hasTouch: boolean;
};

const DRAG_INPUT_CAPABILITY_QUERIES = [
  "(any-pointer: fine)",
  "(pointer: fine)",
  "(any-hover: hover)",
  "(hover: hover)",
  "(any-pointer: coarse)",
  "(pointer: coarse)",
];

export function getDragInputCapabilities(): DragInputCapabilities {
  if (typeof window === "undefined") {
    return {
      hasFinePointer: false,
      hasHover: false,
      hasTouch: false,
    };
  }

  const hasFinePointer =
    matchesMedia("(any-pointer: fine)") || matchesMedia("(pointer: fine)");
  const hasHover =
    matchesMedia("(any-hover: hover)") || matchesMedia("(hover: hover)");
  const hasTouch =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    matchesMedia("(any-pointer: coarse)") ||
    matchesMedia("(pointer: coarse)");

  return {
    hasFinePointer,
    hasHover,
    hasTouch,
  };
}

export function areDragInputCapabilitiesEqual(
  a: DragInputCapabilities,
  b: DragInputCapabilities
): boolean {
  return (
    a.hasFinePointer === b.hasFinePointer &&
    a.hasHover === b.hasHover &&
    a.hasTouch === b.hasTouch
  );
}

export function isTouchLayoutPreferred(
  preference: DragInputModePreference,
  capabilities: DragInputCapabilities
): boolean {
  if (preference === "mouse") {
    return false;
  }
  if (preference === "touch") {
    return true;
  }
  return capabilities.hasTouch;
}

export function normalizeDragInputModePreference(
  value: unknown,
  fallback: DragInputModePreference = "auto"
): DragInputModePreference {
  return value === "auto" || value === "touch" || value === "mouse"
    ? value
    : fallback;
}

export function resolveDragInputMode(
  preference: DragInputModePreference,
  capabilities: DragInputCapabilities
): ResolvedDragInputMode {
  if (preference === "mouse") {
    return "mouse";
  }
  if (preference === "touch") {
    return "touch";
  }
  return capabilities.hasTouch ? "touch" : "mouse";
}

export function subscribeToDragInputCapabilityChanges(
  onChange: (capabilities: DragInputCapabilities) => void
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const refreshCapabilities = () => onChange(getDragInputCapabilities());

  const mediaQueries =
    typeof window.matchMedia === "function"
      ? DRAG_INPUT_CAPABILITY_QUERIES.map((query) => window.matchMedia(query))
      : [];

  mediaQueries.forEach((mediaQuery) => {
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", refreshCapabilities);
      return;
    }
    mediaQuery.addListener(refreshCapabilities);
  });

  window.addEventListener("focus", refreshCapabilities);
  document.addEventListener("visibilitychange", refreshCapabilities);

  return () => {
    mediaQueries.forEach((mediaQuery) => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", refreshCapabilities);
        return;
      }
      mediaQuery.removeListener(refreshCapabilities);
    });
    window.removeEventListener("focus", refreshCapabilities);
    document.removeEventListener("visibilitychange", refreshCapabilities);
  };
}

function matchesMedia(query: string): boolean {
  return (
    typeof window.matchMedia === "function" && window.matchMedia(query).matches
  );
}
