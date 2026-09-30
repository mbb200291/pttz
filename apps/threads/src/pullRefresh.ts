const THRESHOLD = 72; // Physical finger travel; the indicator moves at half speed.
const EXCLUDED = 'button,a,input,textarea,select,summary,video,audio,iframe,[role="button"],[contenteditable="true"],.discussion,.reply-tree,[data-no-pull-refresh]';

/** Attach to the page's feed shell. The page should use overscroll-behavior-y: contain. */
export function attachPullRefresh(
  element: HTMLElement,
  indicator: HTMLElement,
  refresh: () => Promise<void>,
  enabled: () => boolean,
): () => void {
  let gesture: { id: number; x: number; y: number; distance: number; claimed: boolean } | undefined;
  let pending = false;
  let disposed = false;
  let suppressClickUntil = 0;
  const initialText = indicator.textContent;
  const initialState = indicator.getAttribute("data-state");
  const initialDistance = indicator.style.getPropertyValue("--pull-distance");
  const initialPriority = indicator.style.getPropertyPriority("--pull-distance");

  function render(state: "idle" | "pulling" | "armed" | "refreshing", distance = 0) {
    indicator.dataset.state = state;
    indicator.style.setProperty("--pull-distance", `${distance}px`);
    indicator.textContent = state === "refreshing" ? "正在載入新文章…" : state === "armed" ? "放開以載入新文章" : "下拉載入新文章";
  }
  function reset() {
    if (gesture?.claimed) suppressClickUntil = Date.now() + 500;
    gesture = undefined;
    if (!pending) render("idle");
  }
  function start(event: TouchEvent) {
    reset();
    // A new intentional touch must not lose its click because of an earlier pull.
    suppressClickUntil = 0;
    if (pending || !enabled() || window.scrollY > 0 || event.touches.length !== 1) return;
    if (event.target instanceof Element && event.target.closest(EXCLUDED)) return;
    const touch = event.touches[0];
    gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, distance: 0, claimed: false };
  }
  function move(event: TouchEvent) {
    if (!gesture) return;
    if (!enabled() || window.scrollY > 0 || event.touches.length !== 1 || !event.cancelable) { reset(); return; }
    const touch = event.touches[0];
    if (touch.identifier !== gesture.id) { reset(); return; }
    const dx = Math.abs(touch.clientX - gesture.x);
    const dy = touch.clientY - gesture.y;
    if (dy < -6 || dx > Math.max(8, dy)) { reset(); return; }
    if (dy <= 8 && !gesture.claimed) return;
    if (dy <= 0) { reset(); return; }
    gesture.claimed = true;
    gesture.distance = dy;
    event.preventDefault();
    render(dy >= THRESHOLD ? "armed" : "pulling", Math.min(80, dy * 0.5));
  }
  async function finish() {
    const shouldRefresh = gesture?.claimed && gesture.distance >= THRESHOLD && !pending && enabled();
    reset();
    if (!shouldRefresh) return;
    pending = true;
    render("refreshing", 44);
    try {
      await refresh();
    } catch {
      // The caller owns the feed's error presentation; always release the gesture lock.
    } finally {
      pending = false;
      if (!disposed) render("idle");
    }
  }
  function click(event: MouseEvent) {
    if (event.detail > 0 && Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickUntil = 0;
    }
  }
  render("idle");
  element.addEventListener("touchstart", start, { passive: true });
  element.addEventListener("touchmove", move, { passive: false });
  element.addEventListener("touchend", finish);
  element.addEventListener("touchcancel", reset);
  element.addEventListener("click", click, true);
  return () => {
    disposed = true;
    gesture = undefined;
    element.removeEventListener("touchstart", start);
    element.removeEventListener("touchmove", move);
    element.removeEventListener("touchend", finish);
    element.removeEventListener("touchcancel", reset);
    element.removeEventListener("click", click, true);
    indicator.textContent = initialText;
    if (initialState === null) indicator.removeAttribute("data-state");
    else indicator.setAttribute("data-state", initialState);
    if (initialDistance) indicator.style.setProperty("--pull-distance", initialDistance, initialPriority);
    else indicator.style.removeProperty("--pull-distance");
  };
}
