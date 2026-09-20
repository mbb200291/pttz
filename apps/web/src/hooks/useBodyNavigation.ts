import { useEffect, type RefObject } from "react";

/** Only handles unfocused-page events; descendant keys belong to the scoped React handler. */
export function useBodyNavigation(root: RefObject<HTMLElement | null>, onKey: (event: KeyboardEvent, scope: HTMLElement) => void): void {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (root.current && (event.target === document.body || event.target === document.documentElement)) onKey(event, root.current);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [root, onKey]);
}
