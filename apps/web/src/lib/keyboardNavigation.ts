import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export type NavigationKeyEvent = ReactKeyboardEvent<HTMLElement> | globalThis.KeyboardEvent;
const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
const editingTarget = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], dialog, video, audio';

export function hasOpenNavigationDialog(): boolean {
  return Boolean(document.querySelector('[role="dialog"]:not([hidden]), dialog[open]'));
}

function navigationScope(event: NavigationKeyEvent, scope?: HTMLElement): HTMLElement | null {
  return scope ?? (event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
}

function blocked(event: NavigationKeyEvent, root: HTMLElement, ctrlKey = false): boolean {
  const composing = "nativeEvent" in event ? event.nativeEvent.isComposing : event.isComposing;
  if (event.defaultPrevented || composing || event.altKey || event.metaKey || event.shiftKey || event.ctrlKey !== ctrlKey) return true;
  const target = event.target;
  if (!(target instanceof HTMLElement) || (!root.contains(target) && target !== document.body && target !== document.documentElement)) return true;
  if (target.closest(editingTarget)) return true;
  if (hasOpenNavigationDialog()) return true;
  return window.getSelection()?.isCollapsed === false;
}

function availableItems(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-navigation-item]:not(:disabled):not([aria-disabled="true"])'))
    .filter((item) => !item.closest('[hidden], [inert], [aria-hidden="true"]'));
}

function startSelection(event: NavigationKeyEvent, root: HTMLElement): void {
  if (event.repeat || !arrows.includes(event.key)) return;
  const first = availableItems(root)[0];
  if (first) { event.preventDefault(); first.focus(); }
}

/** Guards command shortcuts without interfering with editing or native controls. */
export function canUseShortcut(event: NavigationKeyEvent, ctrlKey = false, scope?: HTMLElement): boolean {
  const root = navigationScope(event, scope);
  return Boolean(root && !event.repeat && !blocked(event, root, ctrlKey));
}

/** Home cards use spatial selection; Enter keeps the native button activation. */
export function navigateBoardGrid(event: NavigationKeyEvent, scope?: HTMLElement): void {
  const root = navigationScope(event, scope);
  if (!root || !canUseShortcut(event, false, root) || !arrows.includes(event.key)) return;
  const target = event.target as HTMLElement;
  const item = target.closest<HTMLElement>("[data-navigation-item]");
  if (!item) { startSelection(event, root); return; }
  if (!root.contains(item) || item.matches(':disabled, [aria-disabled="true"]')) return;
  const action = target.closest('button, a, [role="button"]');
  if (action && action !== item) return;
  const items = availableItems(root);
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

export function navigateList(event: NavigationKeyEvent, onBack?: () => void, scope?: HTMLElement): void {
  const root = navigationScope(event, scope);
  if (!root || blocked(event, root)) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const item = target.closest<HTMLElement>("[data-navigation-item]");
  if (!item) { startSelection(event, root); return; }
  if (!root.contains(item) || item.matches(':disabled, [aria-disabled="true"]')) return;
  const action = target.closest('button, a, [role="button"]');
  if (action && action !== item) return;
  if (event.key === "ArrowLeft" && onBack) {
    event.preventDefault();
    if (!event.repeat) onBack();
  } else if (event.key === "ArrowRight" || ((event.key === "Enter" || event.key === " ") && item.tagName !== "BUTTON")) {
    event.preventDefault();
    if (!event.repeat) item.click();
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    const items = availableItems(root);
    const index = items.indexOf(item);
    const next = items[index + (event.key === "ArrowDown" ? 1 : -1)];
    event.preventDefault();
    next?.focus();
  }
}
