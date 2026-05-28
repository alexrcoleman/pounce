import { useCallback, useEffect, useState } from "react";

export default function useStoredNumber(
  storageKey: string,
  defaultValue: number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY
) {
  const [value, setValue] = useState(() =>
    normalizeStoredNumber(defaultValue, defaultValue, min, max)
  );

  useEffect(() => {
    const storedValue = window.localStorage.getItem(storageKey);
    if (storedValue == null) {
      return;
    }

    setValue(normalizeStoredNumber(Number(storedValue), defaultValue, min, max));
  }, [defaultValue, max, min, storageKey]);

  const updateValue = useCallback(
    (nextValue: number) => {
      const normalizedValue = normalizeStoredNumber(
        nextValue,
        defaultValue,
        min,
        max
      );
      setValue(normalizedValue);
      window.localStorage.setItem(storageKey, String(normalizedValue));
    },
    [defaultValue, max, min, storageKey]
  );

  return [value, updateValue] as const;
}

function normalizeStoredNumber(
  value: number,
  fallback: number,
  min: number,
  max: number
): number {
  const numericValue = Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, numericValue));
}
