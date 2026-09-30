// @vitest-environment node
import { expect, it } from "vitest";
import config from "../vite.config";

const resolve = (mode: string, command: "serve" | "build" = "serve", isPreview = false) => {
  if (typeof config !== "function") throw new Error("Expected configurable Vite host");
  return config({ command, mode, isPreview });
};

it.each([["ptt-local", "local"], ["ptt-live", "ptt"]])("selects %s with matching client configuration", async (mode, protocol) => {
  const result = await resolve(mode);
  expect(result.define?.["import.meta.env.VITE_PTT_PUSH_FORMAT"]).toBe(JSON.stringify(protocol));
  expect(result.define?.["import.meta.env.VITE_PTT_CONNECTION_LABEL"]).toContain(protocol === "local" ? "本機 PTT" : "正式 PTT");
  expect(result.server?.port).toBe(5183);
});

it("never produces a local production build or preview", async () => {
  expect(() => resolve("ptt-local", "build")).toThrow("development-only");
  expect(() => resolve("ptt-local", "serve", true)).toThrow("development-only");
  const built = await resolve("production", "build");
  expect(built.define?.["import.meta.env.VITE_PTT_PUSH_FORMAT"]).toBe('"ptt"');
});
