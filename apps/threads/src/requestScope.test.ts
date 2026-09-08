import { expect, it } from "vitest";
import { RequestScope } from "./requestScope";
it("ignores a late result after leaving and reopening the same article", () => {
  const scope = new RequestScope();
  const first = scope.next();
  scope.invalidate();
  const second = scope.next();
  expect(first()).toBe(false);
  expect(second()).toBe(true);
});
it("invalidates data on disconnect and a new login, even for the same account", () => {
  const scope = new RequestScope();
  const previousSession = scope.next();
  scope.invalidate();
  const newSession = scope.next();
  expect(previousSession()).toBe(false);
  expect(newSession()).toBe(true);
});
