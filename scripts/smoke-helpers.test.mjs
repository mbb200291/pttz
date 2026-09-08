import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  collectInstalledDependencyClosure,
  collectModuleSpecifiers,
  collectMarkdownModuleSpecifiers,
  selectNpmCommand,
  selectTscCommand,
} from "./smoke-helpers.mjs";

const fixture = () => mkdtempSync(join(tmpdir(), "pttzzz-smoke-helper-"));
const addPackage = (root, path, manifest) => {
  const directory = join(root, path);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
};

test("includes resolved optional dependencies and records missing platform optionals", () => {
  const root = fixture();
  try {
    addPackage(root, "node_modules/entry", {
      name: "entry",
      version: "1.0.0",
      optionalDependencies: { present: "1.0.0", missing: "1.0.0" },
    });
    addPackage(root, "node_modules/present", { name: "present", version: "1.0.0" });

    const result = collectInstalledDependencyClosure(["entry"], root);

    assert.deepEqual([...result.packages.keys()], ["entry", "present"]);
    assert.deepEqual(result.skippedOptional, ["missing"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects the same package name when dependency paths resolve to different identities", () => {
  const root = fixture();
  try {
    addPackage(root, "node_modules/a", {
      name: "a", version: "1.0.0", dependencies: { shared: "1.0.0" },
    });
    addPackage(root, "node_modules/b", {
      name: "b", version: "1.0.0", dependencies: { shared: "2.0.0" },
    });
    addPackage(root, "node_modules/a/node_modules/shared", { name: "shared", version: "1.0.0" });
    addPackage(root, "node_modules/b/node_modules/shared", { name: "shared", version: "2.0.0" });

    assert.throws(
      () => collectInstalledDependencyClosure(["a", "b"], root),
      /shared.*1\.0\.0.*2\.0\.0/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uses Node with npm's JavaScript CLI on Windows", () => {
  const root = fixture();
  try {
    const cli = join(root, "npm-cli.js");
    writeFileSync(cli, "");

    assert.deepEqual(selectNpmCommand({
      platform: "win32",
      execPath: "C:/node/node.exe",
      npmExecPath: cli,
    }), {
      executable: "C:/node/node.exe",
      prefixArgs: [cli],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects Windows npm execution without an existing JavaScript CLI", () => {
  assert.throws(
    () => selectNpmCommand({
      platform: "win32",
      execPath: "C:/node/node.exe",
      npmExecPath: "C:/node/npm.cmd",
    }),
    /Windows.*npm.*JavaScript CLI/u,
  );
});

test("uses Node with the local TypeScript CLI", () => {
  const root = fixture();
  try {
    const cli = join(root, "node_modules/typescript/bin/tsc");
    mkdirSync(join(root, "node_modules/typescript/bin"), { recursive: true });
    writeFileSync(cli, "");

    assert.deepEqual(selectTscCommand(root, "C:/node/node.exe"), {
      executable: "C:/node/node.exe",
      prefixArgs: [cli],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("collects static public root imports", () => {
  assert.deepEqual(
    collectModuleSpecifiers(`import type { CoreEvent } from "@pttzzz/core";\nexport { createBrowserClient } from "@pttzzz/browser";`),
    ["@pttzzz/core", "@pttzzz/browser"],
  );
});

test("collects side-effect and dynamic package imports", () => {
  assert.deepEqual(
    collectModuleSpecifiers(`import "@pttzzz/browser/testing";\nconst value = import("@pttzzz/core/internal");`),
    ["@pttzzz/browser/testing", "@pttzzz/core/internal"],
  );
});

test("does not treat comments or ordinary prose as imports", () => {
  assert.deepEqual(
    collectModuleSpecifiers(`// import "@pttzzz/browser/testing"\nUse @pttzzz/core/internal only as a name in this paragraph.`),
    [],
  );
});

test("collects import-equals and dynamic imports with options", () => {
  assert.deepEqual(
    collectModuleSpecifiers(`
      import core = require("@pttzzz/core");
      const browser = import("@pttzzz/browser/testing", { with: { type: "json" } });
      const reserved = import(\`@pttzzz/core/internal\`);
    `),
    ["@pttzzz/core", "@pttzzz/browser/testing", "@pttzzz/core/internal"],
  );
});

test("does not treat ordinary strings, templates, or comments as imports", () => {
  assert.deepEqual(
    collectModuleSpecifiers(`
      const prose = 'import("@pttzzz/core/internal")';
      const template = \`import "@pttzzz/browser/testing"\`;
      /* export * from "@pttzzz/core/internal" */
    `),
    [],
  );
});

test("collects only imports inside typed Markdown fences", () => {
  assert.deepEqual(
    collectMarkdownModuleSpecifiers(`
      Describing @pttzzz/core/internal here is allowed.
      \`import("@pttzzz/browser/testing")\`

      \`\`\`ts
      import { PttzzzClient } from "@pttzzz/core";
      \`\`\`

      \`\`\`text
      import "@pttzzz/browser/testing";
      \`\`\`

      \`\`\`javascript
      export * from "@pttzzz/browser/internal";
      \`\`\`
    `),
    ["@pttzzz/core", "@pttzzz/browser/internal"],
  );
});
