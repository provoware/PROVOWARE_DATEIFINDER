import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));

for (const name of ["playwright.config.ts", "playwright.hardening.config.ts"]) {
  test(`${name} rejects focused tests`, () => {
    const source = ts.createSourceFile(
      name, readFileSync(resolve(root, name), "utf8"),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
    );
    const exported = source.statements.find(ts.isExportAssignment);
    assert.ok(exported && ts.isCallExpression(exported.expression), "defineConfig export missing");
    const config = exported.expression.arguments[0];
    assert.ok(config && ts.isObjectLiteralExpression(config), "config object missing");
    const flags = config.properties.filter((prop) =>
      ts.isPropertyAssignment(prop) && prop.name.getText(source) === "forbidOnly"
    );
    assert.equal(flags.length, 1, "forbidOnly must be set exactly once");
    assert.equal(flags[0].initializer.kind, ts.SyntaxKind.TrueKeyword, "forbidOnly must be true");
  });
}
