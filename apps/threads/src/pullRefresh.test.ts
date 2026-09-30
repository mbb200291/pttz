/* @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { attachPullRefresh } from "./pullRefresh";

let cleanup: (() => void) | undefined;
let root: HTMLElement;
let indicator: HTMLElement;
let enabled = true;
let refresh = vi.fn<() => Promise<void>>();
function touch(type: string, x: number, y: number, target: HTMLElement = root, count = 1, cancelable = true) {
  const event = new Event(type, { bubbles: true, cancelable });
  Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : Array.from({ length: count }, (_, identifier) => ({ identifier, clientX: x, clientY: y })) });
  target.dispatchEvent(event);
  return event;
}
function pull() { touch("touchstart", 50, 50); touch("touchmove", 50, 150); touch("touchend", 50, 150); }
beforeEach(() => {
  enabled = true;
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  root = document.createElement("main");
  indicator = document.createElement("div");
  root.append(indicator);
  document.body.append(root);
  refresh = vi.fn(async () => {});
  cleanup = attachPullRefresh(root, indicator, () => refresh(), () => enabled);
});
afterEach(() => { cleanup?.(); document.body.replaceChildren(); vi.restoreAllMocks(); });

it("arms a resisted top pull at 72 physical pixels and refreshes on release", async () => {
  touch("touchstart", 50, 50);
  expect(touch("touchmove", 50, 90).defaultPrevented).toBe(true);
  expect(indicator.dataset.state).toBe("pulling");
  expect(parseFloat(indicator.style.getPropertyValue("--pull-distance"))).toBeLessThan(40);
  touch("touchmove", 50, 122);
  expect(indicator.dataset.state).toBe("armed");
  expect(refresh).not.toHaveBeenCalled();
  touch("touchend", 50, 122);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(indicator.dataset.state).toBe("refreshing");
  await vi.waitFor(() => expect(indicator.dataset.state).toBe("idle"));
});

it("ignores short, canceled, horizontal, upward, multi-touch and mid-page gestures", () => {
  for (const scenario of ["short", "cancel", "horizontal", "upward", "multi", "midpage"]) {
    Object.defineProperty(window, "scrollY", { configurable: true, value: scenario === "midpage" ? 10 : 0 });
    touch("touchstart", 50, 100);
    if (scenario === "horizontal") touch("touchmove", 120, 110);
    if (scenario === "upward") touch("touchmove", 50, 80);
    if (scenario === "multi") touch("touchmove", 50, 200, root, 2);
    touch("touchmove", 50, scenario === "short" ? 130 : 200);
    touch(scenario === "cancel" ? "touchcancel" : "touchend", 50, 200);
  }
  expect(refresh).not.toHaveBeenCalled();
});

it("leaves controls, media and discussion scroll gestures alone", () => {
  for (const html of ['<button><span>Read</span></button>', '<a href="#">Link</a>', '<input>', '<video></video>', '<div class="discussion"><p>Reply</p></div>']) {
    const container = document.createElement("div");
    container.innerHTML = html; root.append(container);
    const target = container.querySelector<HTMLElement>("span,p") ?? container.firstElementChild as HTMLElement;
    touch("touchstart", 50, 50, target);
    expect(touch("touchmove", 50, 150, target).defaultPrevented).toBe(false);
    touch("touchend", 50, 150, target);
  }
  expect(refresh).not.toHaveBeenCalled();
});

it("does not claim non-cancelable moves or disabled gestures", () => {
  touch("touchstart", 50, 50);
  touch("touchmove", 50, 150, root, 1, false);
  touch("touchend", 50, 150);
  enabled = false; pull();
  enabled = true; touch("touchstart", 50, 50); touch("touchmove", 50, 150); enabled = false; touch("touchend", 50, 150);
  expect(refresh).not.toHaveBeenCalled();
});

it("blocks duplicate pulls while loading and resets after rejection", async () => {
  let reject!: (reason: Error) => void;
  refresh.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  pull(); pull();
  expect(refresh).toHaveBeenCalledTimes(1);
  reject(new Error("offline"));
  await vi.waitFor(() => expect(indicator.dataset.state).toBe("idle"));
  refresh.mockResolvedValue(); pull();
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("suppresses the click following a claimed pull but preserves taps", () => {
  touch("touchstart", 50, 50); touch("touchend", 50, 50);
  const tap = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }); root.dispatchEvent(tap);
  expect(tap.defaultPrevented).toBe(false);
  pull();
  const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }); root.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
});

it("cleans up listeners and owned indicator styles", () => {
  touch("touchstart", 50, 50); touch("touchmove", 50, 150);
  cleanup?.(); cleanup = undefined;
  expect(indicator.style.getPropertyValue("--pull-distance")).toBe("");
  expect(indicator.dataset.state).toBeUndefined();
  pull(); expect(refresh).not.toHaveBeenCalled();
});
