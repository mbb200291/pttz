import { describe, expect, it } from "vitest";
import { PttzzzClient } from "@pttzzz/core";
import { createBrowserClient } from "./createBrowserClient.js";

describe("browser client aggregation options", () => {
  it("forwards validation to core and accepts the web three-minute profile", async () => {
    expect(() => createBrowserClient({ aggregation: { nonconsecutiveGapMinutes: -1 } })).toThrow(RangeError);
    const client = createBrowserClient({ aggregation: { nonconsecutiveGapMinutes: 3 } });
    expect(client).toBeInstanceOf(PttzzzClient);
    await client.disconnect();
  });
});
