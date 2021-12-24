import { useRef } from "react";

export default function usePrevious<T>(value: T): T | undefined {
  const prev = useRef<T | undefined>(undefined);

  const old = prev.current;
  prev.current = value;
  return old;
}
