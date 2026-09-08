// @vitest-environment node
import { describe, expect, it } from "vitest";
import manifestSource from "../../package.json?raw";
import tsconfigSource from "../../tsconfig.app.json?raw";
import viteConfigSource from "../../vite.config.ts?raw";

const sources = import.meta.glob("../**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

describe("reference app package boundary", () => {
  it("uses only public package entry points", () => {
    const forbidden = [
      ["packages", "core", "src"].join("/"),
      ["packages", "browser", "src"].join("/"),
      ["@pttzzz", "core", "internal"].join("/"),
      ["@pttzzz", "core", "src"].join("/"),
      ["@pttzzz", "browser", "src"].join("/"),
    ];
    const violations = Object.entries(sources).flatMap(([path, source]) =>
      forbidden.some((value) => source.includes(value)) ? [path] : []
    );
    expect(violations).toEqual([]);
  });

  it("does not expose deep package entry points through app aliases", () => {
    const forbidden = [
      ["@pttzzz", "core", "internal"].join("/"),
      ["packages", "core", "src", "internal"].join("/"),
      ["packages", "browser", "src", "internal"].join("/"),
    ];
    expect([tsconfigSource, viteConfigSource].filter((source) =>
      forbidden.some((value) => source.includes(value))
    )).toEqual([]);
  });

  it("is a private reference app workspace", () => {
    expect(JSON.parse(manifestSource)).toMatchObject({
      name: "@pttzzz/web-example",
      private: true,
    });
  });
});
