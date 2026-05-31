let hasHydrated = false;

export function markClientHydrated() {
  hasHydrated = true;
}

export function canUseClientInitialValue() {
  return hasHydrated && typeof window !== "undefined";
}
