import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("uses public package entry points without existing UI internals or write commands", () => {
  const directory = fileURLToPath(new URL(".", import.meta.url));
  for (const file of readdirSync(directory).filter(file=>file.endsWith(".ts") && !file.endsWith(".test.ts"))) {
    const source=readFileSync(directory+file,"utf8");
    expect(source).not.toMatch(/@pttzzz\/(?:core|browser)\/internal|apps\/web\/src/);
    expect(source).not.toMatch(/client\.(?:createArticle|editArticle|deleteArticle|replyToArticle|replyToReply|voteReply|voteArticle|withdrawReply)\(/);
  }
});
