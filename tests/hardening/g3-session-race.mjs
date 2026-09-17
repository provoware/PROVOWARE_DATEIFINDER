import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve("src/main.ts"), "utf8");

function handlerStart(eventName) {
  const patterns = [
    `${eventName}(payload) {`,
    `${eventName}: (payload) => {`,
  ];
  for (const pattern of patterns) {
    const index = source.indexOf(pattern);
    if (index !== -1) return index;
  }
  assert.fail(`missing ${eventName} handler`);
}

function handlerBody(eventName, nextName) {
  const start = handlerStart(eventName);
  const end = handlerStart(nextName);
  assert.ok(end > start, `missing ${nextName} handler after ${eventName}`);
  return source.slice(start, end);
}

function assertStaleGuard(body, name) {
  assert.match(
    body,
    /if\s*\(payload\.sessionId\s*!==\s*state\.activeSessionId\)\s*return;/,
    `${name} must reject stale session events before mutating active state`,
  );
}

test("G3: every asynchronous search event rejects a stale session before state mutation", () => {
  const batch = handlerBody("onBatch", "onProgress");
  const progress = handlerBody("onProgress", "onFinished");
  const finished = handlerBody("onFinished", "onCancelled");
  const cancelledStart = handlerStart("onCancelled");
  const cancelled = source.slice(cancelledStart);

  assertStaleGuard(batch, "batch");
  assertStaleGuard(progress, "progress");
  assertStaleGuard(finished, "finished");
  assertStaleGuard(cancelled, "cancelled");
});

test("G3: restart cancels the previous active session before assigning a new session id", () => {
  const runStart = source.indexOf("async function runSearch(): Promise<void> {");
  assert.notEqual(runStart, -1, "missing runSearch");
  const runEnd = source.indexOf("async function", runStart + 1);
  const runSearch = source.slice(runStart, runEnd === -1 ? undefined : runEnd);

  const cancel = runSearch.indexOf("await cancelSearch(state.activeSessionId)");
  const create = runSearch.indexOf("const sessionId = crypto.randomUUID()");
  const activate = runSearch.indexOf("state.activeSessionId = sessionId");
  const start = runSearch.indexOf("await startSearch({");

  assert.ok(cancel >= 0, "restart must cancel previous active session");
  assert.ok(create > cancel, "new session id must be created after cancel request");
  assert.ok(activate > create, "new session must become active after its id exists");
  assert.ok(start > activate, "new session must be active before asynchronous start_search can emit events");
});

test("G3: stale terminal events cannot clear the replacement session", () => {
  const finished = handlerBody("onFinished", "onCancelled");
  const cancelledStart = handlerStart("onCancelled");
  const cancelled = source.slice(cancelledStart);

  for (const [name, body] of [["finished", finished], ["cancelled", cancelled]]) {
    const guard = body.search(/if\s*\(payload\.sessionId\s*!==\s*state\.activeSessionId\)\s*return;/);
    const clear = body.indexOf("state.activeSessionId = null");
    assert.ok(guard >= 0, `${name} stale guard missing`);
    assert.ok(clear > guard, `${name} may clear activeSessionId before stale-session rejection`);
  }
});
