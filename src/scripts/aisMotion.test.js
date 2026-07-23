import assert from "node:assert/strict";
import test from "node:test";
import { interpolateCoordinate, reconnectDelay } from "./aisMotion.js";

test("AIS marker interpolation ends exactly at the real report without extrapolation", () => {
  assert.deepEqual(interpolateCoordinate([52.37, 4.9], [52.38, 4.91], 1), [52.38, 4.91]);
  assert.deepEqual(interpolateCoordinate([52.37, 4.9], [52.38, 4.91], 2), [52.38, 4.91]);
});

test("local WebSocket reconnect delay backs off and is capped", () => {
  assert.equal(reconnectDelay(0), 1000);
  assert.equal(reconnectDelay(3), 8000);
  assert.equal(reconnectDelay(20), 30000);
});
