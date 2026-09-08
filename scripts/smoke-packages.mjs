import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  collectInstalledDependencyClosure,
  collectMarkdownModuleSpecifiers,
  collectModuleSpecifiers,
  selectNpmCommand,
  selectTscCommand,
} from "./smoke-helpers.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "pttzzz-pack-"));
const output = join(temporary, "tarballs");
const consumer = join(temporary, "consumer");
const cache = join(temporary, "npm-cache");
const npm = selectNpmCommand();
mkdirSync(output);
mkdirSync(consumer);

const run = (command, args, cwd = root) => execFileSync(command, args, {
  cwd,
  encoding: "utf8",
  env: { ...process.env, npm_config_cache: cache },
  stdio: ["ignore", "pipe", "pipe"],
});
const runCli = ({ executable, prefixArgs }, args, cwd = root) => (
  run(executable, [...prefixArgs, ...args], cwd)
);
const readTree = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? readTree(path) : [readFileSync(path, "utf8")];
});
const filesIn = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? filesIn(path) : [path];
});

try {
  const pack = (workspace) => {
    const result = JSON.parse(runCli(npm, [
      "pack", "-w", workspace, "--json", "--pack-destination", output,
    ]));
    return { file: join(output, result[0].filename), files: result[0].files };
  };
  const core = pack("@pttzzz/core");
  const browser = pack("@pttzzz/browser");

  const closure = collectInstalledDependencyClosure(["ptt-client"], root);
  const packedDependencies = new Map();
  for (const [name, { directory }] of closure.packages) {
    const result = JSON.parse(runCli(npm, [
      "pack", directory, "--ignore-scripts", "--json", "--pack-destination", output,
    ]));
    packedDependencies.set(name, join(output, result[0].filename));
  }
  if (closure.skippedOptional.length > 0) {
    console.log(`skipped unavailable optional dependencies: ${closure.skippedOptional.join(", ")}`);
  }

  for (const artifact of [core, browser]) {
    const names = artifact.files.map(({ path }) => path);
    if (names.some((name) => !["LICENSE", "README.md", "package.json"].includes(name) && !name.startsWith("dist/"))) {
      throw new Error(`unexpected tarball path: ${names.join(", ")}`);
    }
    if (names.some((name) => /(^|\/)(src|.*\.map|.*\.tsbuildinfo|.*credentials.*|.*debug.*|.*backup.*)(\/|$)/iu.test(name))) {
      throw new Error(`suspicious tarball file path: ${names.join(", ")}`);
    }
    if (!["LICENSE", "README.md", "package.json"].every((name) => names.includes(name))) {
      throw new Error("tarball must contain only documented package artifacts");
    }
  }

  const localDependencies = Object.fromEntries(
    [...packedDependencies].map(([name, path]) => [name, `file:${path}`]),
  );
  writeFileSync(join(consumer, "package.json"), JSON.stringify({
    name: "pttzzz-pack-consumer",
    private: true,
    type: "module",
    dependencies: {
      "@pttzzz/core": `file:${core.file}`,
      "@pttzzz/browser": `file:${browser.file}`,
      ...localDependencies,
    },
    overrides: Object.fromEntries(
      Object.keys(localDependencies).map((name) => [name, `$${name}`]),
    ),
  }));
  runCli(npm, [
    "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund",
    "--no-package-lock",
  ], consumer);

  const check = `
    import * as core from "@pttzzz/core";
    import * as browser from "@pttzzz/browser";
    import * as testing from "@pttzzz/browser/testing";
    import * as reserved from "@pttzzz/core/internal";
    if (typeof core.PttzzzClient !== "function") throw new Error("core client missing");
    if (typeof browser.createBrowserClient !== "function") throw new Error("browser factory missing");
    if (typeof testing.createFakeBrowserGateway !== "function") throw new Error("testing export missing");
    if (typeof reserved.parsePushLine !== "function") throw new Error("reserved core integration export missing");
    for (const name of ["TerminalDriver", "FakeTerminalDriver", "createPttTerminalDriver", "queryBoardsFromBot"]) {
      if (name in browser) throw new Error("internal driver exported: " + name);
    }
    for (const path of [
      "@pttzzz/core/client",
      "@pttzzz/core/parser",
      "@pttzzz/browser/gateway",
      "@pttzzz/browser/internal/terminalDriver",
      "@pttzzz/browser/internal/fakeTerminalDriver",
    ]) {
      try { await import(path); throw new Error("deep import unexpectedly succeeded: " + path); }
      catch (error) { if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error; }
    }
  `;
  run(process.execPath, ["--input-type=module", "--eval", check], consumer);

  const typecheck = join(consumer, "consumer.ts");
  writeFileSync(typecheck, `
    import { PttzzzClient, type Article } from "@pttzzz/core";
    import { createBrowserClient } from "@pttzzz/browser";
    import { createFakeBrowserGateway } from "@pttzzz/browser/testing";
    void PttzzzClient; void createBrowserClient; void createFakeBrowserGateway;
    const article: Article | undefined = undefined; void article;
  `);
  const tsc = selectTscCommand(root);
  runCli(tsc, [
    "--noEmit", "--strict", "--skipLibCheck", "--module", "NodeNext",
    "--moduleResolution", "NodeNext", "--target", "ES2020", typecheck,
  ], consumer);

  const coreManifest = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8"));
  const browserManifest = JSON.parse(readFileSync(join(root, "packages/browser/package.json"), "utf8"));
  const exampleSource = join(root, "docs/examples/minimal-browser/main.ts");
  const exampleState = join(root, "docs/examples/minimal-browser/state.ts");
  const exampleHtml = join(root, "docs/examples/minimal-browser/index.html");
  const exampleManifest = join(root, "docs/examples/minimal-browser/package.json");
  const exampleTsconfig = join(root, "docs/examples/minimal-browser/tsconfig.json");
  const exampleViteConfig = join(root, "docs/examples/minimal-browser/vite.config.ts");
  const exampleDirectory = join(consumer, "example");
  mkdirSync(exampleDirectory);
  copyFileSync(exampleSource, join(exampleDirectory, "main.ts"));
  copyFileSync(exampleState, join(exampleDirectory, "state.ts"));
  copyFileSync(exampleHtml, join(exampleDirectory, "index.html"));
  copyFileSync(exampleManifest, join(exampleDirectory, "package.json"));
  copyFileSync(exampleTsconfig, join(exampleDirectory, "tsconfig.json"));
  copyFileSync(exampleViteConfig, join(exampleDirectory, "vite.config.ts"));
  runCli(tsc, ["--noEmit", "-p", exampleTsconfig]);
  runCli(tsc, [
    "--strict", "--skipLibCheck", "--module", "NodeNext", "--moduleResolution", "NodeNext",
    "--target", "ES2020", "--lib", "ES2020,DOM", "--outDir", join(exampleDirectory, "dist"),
    join(exampleDirectory, "main.ts"), join(exampleDirectory, "state.ts"),
  ], consumer);

  const stateCheck = `
    import { ArticleViewState } from ${JSON.stringify(pathToFileURL(join(exampleDirectory, "dist/state.js")).href)};
    const state = new ArticleViewState();
    state.changeSession("alice");
    state.begin("article-key");
    if (!state.accept("article-key", 10)) throw new Error("initial revision rejected");
    const switchedWrite = state.captureWrite("article-key", "reply:1");
    state.begin("other-article-key");
    if (state.shouldReloadAfterWrite(switchedWrite)) throw new Error("switched article write reloaded stale target");
    state.begin("article-key");
    const disconnectedWrite = state.captureWrite("article-key", "reply:1");
    state.resetSession();
    if (state.shouldReloadAfterWrite(disconnectedWrite)) throw new Error("disconnected write reloaded stale target");
    if (!state.changeSession(null)) throw new Error("logout did not reset the session epoch");
    if (!state.changeSession("alice")) throw new Error("reconnect did not reset the session epoch");
    state.begin("article-key");
    if (!state.accept("article-key", 1)) throw new Error("new session revision rejected");
  `;
  run(process.execPath, ["--input-type=module", "--eval", stateCheck], consumer);

  symlinkSync(
    join(root, "node_modules/vite-plugin-node-polyfills"),
    join(consumer, "node_modules/vite-plugin-node-polyfills"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const { build: bundle } = await import("vite");
  const bundled = await bundle({
    root: exampleDirectory,
    configFile: exampleViteConfig,
    logLevel: "silent",
    build: {
      write: false,
      lib: { entry: join(exampleDirectory, "main.ts"), formats: ["iife"], name: "PttzzzExample" },
    },
  });
  const bundleOutputs = Array.isArray(bundled) ? bundled.flatMap(({ output }) => output) : bundled.output;
  const bundleCode = bundleOutputs.find((entry) => entry.type === "chunk")?.code;
  if (!bundleCode) throw new Error("minimal browser example did not produce an executable bundle");
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(readFileSync(exampleHtml, "utf8"), {
    runScripts: "outside-only",
    url: "http://localhost/",
  });
  dom.window.eval(bundleCode);
  if (dom.window.document.querySelector("#status")?.textContent !== "尚未連線") {
    throw new Error("minimal browser status wiring did not execute");
  }
  if (!dom.window.document.querySelector("#login") || !dom.window.document.querySelector("#load-articles")) {
    throw new Error("minimal browser selectors were not wired");
  }
  dom.window.document.querySelector("#reply")?.dispatchEvent(new dom.window.Event("submit", {
    bubbles: true,
    cancelable: true,
  }));
  if (dom.window.document.querySelector("#status")?.textContent !== "請先選擇文章與回覆") {
    throw new Error("minimal browser reply handler did not reject an empty target");
  }
  dom.window.close();

  const documentation = [join(root, "docs/api"), join(root, "docs/examples")]
    .flatMap((directory) => readTree(directory)).join("\n");
  if (/TODO|TBD|待確認/u.test(documentation)) {
    throw new Error("public integration documentation contains unresolved markers");
  }
  const documentedImports = [join(root, "docs/api"), join(root, "docs/examples")]
    .flatMap((directory) => filesIn(directory))
    .flatMap((path) => {
      const source = readFileSync(path, "utf8");
      if (/\.md$/iu.test(path)) return collectMarkdownModuleSpecifiers(source);
      return /\.[cm]?[jt]sx?$/iu.test(path) ? collectModuleSpecifiers(source) : [];
    });
  if (documentedImports.some((specifier) =>
    specifier.startsWith("@pttzzz/core/") || specifier.startsWith("@pttzzz/browser/")
  )) {
    throw new Error(`public documentation demonstrates a deep package import: ${documentedImports.join(", ")}`);
  }
  const minimalCodeFiles = filesIn(join(root, "docs/examples/minimal-browser"))
    .filter((path) => /\.[cm]?[jt]sx?$/iu.test(path));
  const exampleText = minimalCodeFiles.map((path) => readFileSync(path, "utf8")).join("\n");
  const exampleHtmlText = readFileSync(exampleHtml, "utf8");
  const examplePackage = JSON.parse(readFileSync(exampleManifest, "utf8"));
  if (examplePackage.dependencies?.["@pttzzz/core"] !== coreManifest.version ||
      examplePackage.dependencies?.["@pttzzz/browser"] !== browserManifest.version ||
      !examplePackage.dependencies?.buffer) {
    throw new Error("minimal browser host dependencies do not match packed packages");
  }
  const viteConfigText = readFileSync(exampleViteConfig, "utf8");
  if (!["/ptt-ws", "wss://ws.ptt.cc/bbs", "https://term.ptt.cc"].every((value) =>
    viteConfigText.includes(value)
  ) || !viteConfigText.includes("Buffer: true")) {
    throw new Error("minimal browser host config is missing Buffer or the PTT WebSocket Origin proxy");
  }
  const packageImports = collectModuleSpecifiers(exampleText)
    .filter((specifier) => specifier.startsWith("@pttzzz/"));
  if (packageImports.some((specifier) => !["@pttzzz/core", "@pttzzz/browser"].includes(specifier))) {
    throw new Error(`minimal browser example uses a non-public UI import: ${packageImports.join(", ")}`);
  }
  if (!packageImports.includes("@pttzzz/core") || !packageImports.includes("@pttzzz/browser") ||
      /packages\/(?:core|browser)\/src|sourceFloors|floorNumber|terminalDriver/u.test(exampleText)) {
    throw new Error("minimal browser example crosses the public UI boundary");
  }
  if (!/<script\s+type="module"\s+src="\.\/main\.ts"><\/script>/u.test(exampleHtmlText)) {
    throw new Error("minimal browser example does not execute its checked TypeScript entry");
  }

  if (["react", "zustand", "ptt-client"].some((name) => name in (coreManifest.dependencies ?? {}))) {
    throw new Error("core has a UI or transport dependency");
  }
  if ([core, browser].some(({ files }) => files.some(({ path }) => /(?:react|zustand)/iu.test(path)))) {
    throw new Error("UI runtime leaked into package tarball");
  }
  if (!("ptt-client" in (browserManifest.dependencies ?? {}))) {
    throw new Error("browser transport dependency missing");
  }

  const installedCore = join(consumer, "node_modules/@pttzzz/core");
  const installedBrowser = join(consumer, "node_modules/@pttzzz/browser");
  const coreOutput = readTree(join(installedCore, "dist")).join("\n");
  if (/\b(?:window|document|WebSocket)\b/u.test(coreOutput) || /(?:ptt-client|react|zustand)/u.test(coreOutput)) {
    throw new Error("core output contains browser, UI, or transport coupling");
  }
  const packedText = [...readTree(installedCore), ...readTree(installedBrowser)].join("\n");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}/u.test(packedText)) {
    throw new Error("package contains a high-confidence secret pattern");
  }

  console.log("package smoke passed");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
