import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readJson = (path: string) => JSON.parse(
  readFileSync(new URL(path, import.meta.url), "utf8"),
) as Record<string, unknown>;

describe("three-layer version compatibility", () => {
  it("declares one compatible 0.3 rule line across the proposal, core, and web example", () => {
    const whitepaper = readFileSync(
      new URL("../../../docs/whitepaper/pttzzz-core.md", import.meta.url),
      "utf8",
    );
    const fixtures = readJson("../../../docs/fixtures/thread-events/manifest.json");
    const core = readJson("../package.json");
    const browser = readJson("../../browser/package.json");
    const web = readJson("../../../apps/web/package.json");

    expect(whitepaper).toContain("> 規則版本：0.4.0");
    expect(fixtures).toMatchObject({ specVersion: "0.4.0" });
    expect(core).toMatchObject({ version: "0.3.0", pttzzz: { rules: "0.4.x" } });
    expect(browser).toMatchObject({
      version: "0.3.0",
      pttzzz: { core: "^0.3.0", rules: "0.4.x" },
    });
    expect(web).toMatchObject({
      version: "0.3.0",
      pttzzz: { browser: "^0.3.0", core: "^0.3.0", rules: "0.4.x" },
    });
  });
});
