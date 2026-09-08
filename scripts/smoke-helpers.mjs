import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";

function resolveInstalledDependency(name, from) {
  for (let directory = from; directory !== dirname(directory); directory = dirname(directory)) {
    const candidate = join(directory, "node_modules", ...name.split("/"));
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
  }
  return null;
}

export function selectNpmCommand({
  platform = process.platform,
  execPath = process.execPath,
  npmExecPath = process.env.npm_execpath,
} = {}) {
  if (npmExecPath && /\.(?:c?js)$/iu.test(npmExecPath) && existsSync(npmExecPath)) {
    return { executable: execPath, prefixArgs: [npmExecPath] };
  }
  if (platform === "win32") {
    throw new Error("Windows package smoke requires npm_execpath to reference an existing npm JavaScript CLI");
  }
  return { executable: "npm", prefixArgs: [] };
}

export function selectTscCommand(root, execPath = process.execPath) {
  const cli = join(root, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(cli)) throw new Error(`TypeScript CLI missing: ${cli}`);
  return { executable: execPath, prefixArgs: [cli] };
}

export function collectModuleSpecifiers(source) {
  const sourceFile = ts.createSourceFile(
    "consumer.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const specifiers = [];
  const literalValue = (node) => (
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null
  );
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const value = literalValue(node.moduleSpecifier);
      if (value !== null) specifiers.push(value);
    } else if (ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression) {
      const value = literalValue(node.moduleReference.expression);
      if (value !== null) specifiers.push(value);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const value = node.arguments[0] ? literalValue(node.arguments[0]) : null;
      if (value !== null) specifiers.push(value);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

export function collectMarkdownModuleSpecifiers(markdown) {
  const specifiers = [];
  const fences = /^[ \t]*```(?:ts|tsx|js|jsx|mjs|cjs|javascript|typescript)[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gimu;
  for (const match of markdown.matchAll(fences)) {
    specifiers.push(...collectModuleSpecifiers(match[1]));
  }
  return specifiers;
}

export function collectInstalledDependencyClosure(entries, root) {
  const packages = new Map();
  const skippedOptional = [];

  const visit = (name, from, optional = false) => {
    const directory = resolveInstalledDependency(name, from);
    if (!directory) {
      if (optional) {
        skippedOptional.push(name);
        return;
      }
      throw new Error(`installed dependency missing: ${name}`);
    }
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
    const identity = `${directory} (${manifest.version ?? "unknown"})`;
    const existing = packages.get(name);
    if (existing) {
      if (existing.identity !== identity) {
        throw new Error(`dependency identity conflict for ${name}: ${existing.identity} != ${identity}`);
      }
      return;
    }
    packages.set(name, { directory, identity, manifest });
    const optionalDependencies = manifest.optionalDependencies ?? {};
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (dependency in optionalDependencies) continue;
      visit(dependency, directory);
    }
    for (const dependency of Object.keys(optionalDependencies)) {
      visit(dependency, directory, true);
    }
  };

  for (const entry of entries) visit(entry, root);
  return { packages, skippedOptional };
}
