import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("@pttzzz/browser package boundary", () => {
  it("does not expose the legacy terminal driver", async () => {
    const browser = await import("./index.js");

    expect(browser).not.toHaveProperty("PttAdapter");
    expect(browser).not.toHaveProperty("TerminalDriver");
    expect(browser).not.toHaveProperty("createPttAdapter");
    expect(browser).not.toHaveProperty("createTerminalDriver");
    expect(browser).not.toHaveProperty("BrowserPttGateway");
    expect(browser).not.toHaveProperty("send");
    expect(packageJson.exports).not.toHaveProperty("./internal");
  });

  it("creates the high-level core client", async () => {
    const browser = await import("./index.js");
    const core = await import("@pttzzz/core");

    expect(browser.createBrowserClient()).toBeInstanceOf(core.PttzzzClient);
  });
});
