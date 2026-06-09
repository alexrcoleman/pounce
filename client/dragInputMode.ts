export type DragInputModePreference = "auto" | "touch" | "mouse";
export type ResolvedDragInputMode = "touch" | "mouse" | "hybrid";

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

export function getDragInputCapabilitiesFromActivity(
  event: Event
): DragInputCapabilities {
  const capabilities = getDragInputCapabilities();
  if (event.type === "mousedown") {
    return {
      ...capabilities,
      hasFinePointer: true,
      hasHover: true,
    };
  }
  if (event.type === "touchstart") {
    return {
      ...capabilities,
      hasTouch: true,
    };
  }
  if (!("pointerType" in event)) {
    return capabilities;
  }

  const pointerType = event.pointerType;
  if (pointerType === "mouse") {
    return {
      ...capabilities,
      hasFinePointer: true,
      hasHover: true,
    };
  }
  if (pointerType === "touch") {
    return {
      ...capabilities,
      hasTouch: true,
    };
  }
  return capabilities;
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
  if (
    capabilities.hasTouch &&
    (capabilities.hasFinePointer || capabilities.hasHover)
  ) {
    return "hybrid";
  }
  return capabilities.hasTouch ? "touch" : "mouse";
}

export function subscribeToDragInputCapabilityChanges(
  onChange: (capabilities: DragInputCapabilities) => void
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleMediaQueryChange = () => onChange(getDragInputCapabilities());
  const handleActivity = (event: Event) =>
    onChange(getDragInputCapabilitiesFromActivity(event));

  const mediaQueries =
    typeof window.matchMedia === "function"
      ? DRAG_INPUT_CAPABILITY_QUERIES.map((query) => window.matchMedia(query))
      : [];

  mediaQueries.forEach((mediaQuery) => {
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleMediaQueryChange);
      return;
    }
    mediaQuery.addListener(handleMediaQueryChange);
  });

  const activityEvents: (keyof WindowEventMap)[] = [
    "focus",
    "mousedown",
    "pointerdown",
    "touchstart",
  ];
  activityEvents.forEach((eventName) => {
    window.addEventListener(eventName, handleActivity, { passive: true });
  });
  document.addEventListener("visibilitychange", handleMediaQueryChange);

  return () => {
    mediaQueries.forEach((mediaQuery) => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleMediaQueryChange);
        return;
      }
      mediaQuery.removeListener(handleMediaQueryChange);
    });
    activityEvents.forEach((eventName) => {
      window.removeEventListener(eventName, handleActivity);
    });
    document.removeEventListener("visibilitychange", handleMediaQueryChange);
  };
}

function matchesMedia(query: string): boolean {
  return (
    typeof window.matchMedia === "function" && window.matchMedia(query).matches
  );
}
