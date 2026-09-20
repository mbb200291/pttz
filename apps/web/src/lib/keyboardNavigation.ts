import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export type NavigationKeyEvent = ReactKeyboardEvent<HTMLElement> | globalThis.KeyboardEvent;
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

/** Escape leaves search without clearing its text or submitting a filter. */
export function leaveSearchInput(event: NavigationKeyEvent, root: HTMLElement | null): void {
  const composing = "nativeEvent" in event ? event.nativeEvent.isComposing : event.isComposing;
  if (!root || event.key !== "Escape" || composing || event.defaultPrevented || event.repeat ||
    event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || hasOpenNavigationDialog()) return;
  event.preventDefault();
  event.stopPropagation();
  root.focus({ preventScroll: true });
}

/** Guards command shortcuts without interfering with editing or native controls. */
export function canUseShortcut(event: NavigationKeyEvent, ctrlKey = false, scope?: HTMLElement): boolean {
  const root = navigationScope(event, scope);
  return Boolean(root && !event.repeat && !blocked(event, root, ctrlKey));
}
