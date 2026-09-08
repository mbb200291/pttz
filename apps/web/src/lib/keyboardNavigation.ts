import type { KeyboardEvent } from "react";

/** Guards command shortcuts without interfering with editing or native controls. */
export function canUseShortcut(event: KeyboardEvent<HTMLElement>, ctrlKey = false): boolean {
  if (event.defaultPrevented || event.repeat || event.nativeEvent.isComposing || event.altKey || event.metaKey || event.shiftKey || event.ctrlKey !== ctrlKey) return false;
  const target = event.target;
  if (!(target instanceof HTMLElement) || !event.currentTarget.contains(target)) return false;
  if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], dialog, video, audio')) return false;
  if (event.currentTarget.querySelector('[role="dialog"], dialog[open]')) return false;
  return window.getSelection()?.isCollapsed !== false;
}

/** Home cards use spatial selection; Enter keeps the native button activation. */
export function navigateBoardGrid(event: KeyboardEvent<HTMLElement>): void {
  if (!canUseShortcut(event) || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
  const target = event.target as HTMLElement;
  const item = target.closest<HTMLElement>("[data-navigation-item]");
  if (!item || item.matches(':disabled, [aria-disabled="true"]')) return;
  const action = target.closest('button, a, [role="button"]');
  if (action && action !== item) return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-navigation-item]:not(:disabled):not([aria-disabled="true"])'));
  const origin = item.getBoundingClientRect();
  const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
  const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
  let next: HTMLElement | undefined;
  if (origin.width === 0 && origin.height === 0) {
    // Layout-free environments still have deterministic linear navigation.
    next = items[items.indexOf(item) + (forward ? 1 : -1)];
  } else {
    const candidates = items.filter((candidate) => candidate !== item).map((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const primary = horizontal
        ? forward ? rect.left - origin.right : origin.left - rect.right
        : forward ? rect.top - origin.bottom : origin.top - rect.bottom;
      const secondary = horizontal
        ? Math.abs((rect.top + rect.bottom - origin.top - origin.bottom) / 2)
        : Math.abs((rect.left + rect.right - origin.left - origin.right) / 2);
      const sameRow = rect.top < origin.bottom && rect.bottom > origin.top;
      return { candidate, primary, secondary, sameRow };
    }).filter(({ primary, sameRow }) => primary >= 0 && (!horizontal || sameRow));
    candidates.sort((a, b) => (a.primary + a.secondary * 2) - (b.primary + b.secondary * 2));
    next = candidates[0]?.candidate;
  }
  event.preventDefault();
  next?.focus();
}

export function navigateList(event: KeyboardEvent<HTMLElement>, onBack?: () => void): void {
  if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], dialog, video, audio')) return;
  if (window.getSelection()?.isCollapsed === false) return;
  const item = target.closest<HTMLElement>("[data-navigation-item]");
  if (!item || !event.currentTarget.contains(item) || item.matches(':disabled, [aria-disabled="true"]')) return;
  const action = target.closest('button, a, [role="button"]');
  if (action && action !== item) return;
  if (event.key === "ArrowLeft" && onBack) {
    event.preventDefault();
    if (!event.repeat) onBack();
  } else if (event.key === "ArrowRight" || ((event.key === "Enter" || event.key === " ") && item.tagName !== "BUTTON")) {
    event.preventDefault();
    if (!event.repeat) item.click();
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-navigation-item]:not(:disabled):not([aria-disabled="true"])'));
    const index = items.indexOf(item);
    const next = items[index + (event.key === "ArrowDown" ? 1 : -1)];
    event.preventDefault();
    next?.focus();
  }
}
