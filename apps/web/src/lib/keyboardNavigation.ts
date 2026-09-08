import type { KeyboardEvent } from "react";

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
