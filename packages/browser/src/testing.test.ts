import { describe, expect, it } from "vitest";
import * as browser from "./index.js";
import * as testing from "./testing.js";

describe("browser testing entrypoint", () => {
  it("exports only the supported fake helpers", () => {
    expect(Object.keys(testing).sort()).toEqual([
      "FAKE_PTT_STORE_KEY",
      "createFakeBrowserGateway",
      "getFakePttCurrentUser",
      "isFakePttMode",
    ]);
    expect(browser).not.toHaveProperty("createFakePttAdapter");
    expect(browser).not.toHaveProperty("FakePttAdapter");
  });
});
