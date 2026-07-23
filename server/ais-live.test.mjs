import assert from "node:assert/strict";
import test from "node:test";
import { feedState, mergeAisState, shouldAcceptPosition, sourceLatencyMs, staleAfterMs, validAisCoordinates } from "./ais-live.mjs";

test("validates AIS coordinates and rejects duplicate or older reports", () => {
  assert.equal(validAisCoordinates(52.37, 4.9), true);
  assert.equal(validAisCoordinates(0, 0), false);
  const previous = { sourceReceivedAt: "2026-07-06T12:00:05Z" };
  assert.equal(shouldAcceptPosition(previous, { latitude: 52.37, longitude: 4.9, sourceReceivedAt: "2026-07-06T12:00:04Z" }), false);
  assert.equal(shouldAcceptPosition(previous, { latitude: 52.38, longitude: 4.91, sourceReceivedAt: "2026-07-06T12:00:06Z" }), true);
});

test("calculates source latency and moving/stationary stale thresholds", () => {
  assert.equal(sourceLatencyMs("2026-07-06T12:00:00Z", Date.parse("2026-07-06T12:00:03Z")), 3000);
  assert.equal(staleAfterMs({ speed: 2 }, 45_000, 180_000), 45_000);
  assert.equal(staleAfterMs({ speed: 0 }, 45_000, 180_000), 180_000);
});

test("reports live, degraded, reconnecting and offline feed states", () => {
  assert.equal(feedState({ configured: false, open: false, messageAgeMs: 0, watchdogMs: 120_000 }).status, "offline");
  assert.equal(feedState({ configured: true, open: false, messageAgeMs: 0, watchdogMs: 120_000 }).status, "reconnecting");
  assert.equal(feedState({ configured: true, open: true, messageAgeMs: 70_000, watchdogMs: 120_000 }).status, "degraded");
  assert.equal(feedState({ configured: true, open: true, messageAgeMs: 5_000, watchdogMs: 120_000 }).status, "live");
});

test("static AIS fields do not erase the latest dynamic position", () => {
  const position = { mmsi: "244123456", latitude: 52.37, longitude: 4.9, sourceReceivedAt: "2026-07-06T12:00:00Z" };
  const merged = mergeAisState(position, { type: "vessel-static", name: "TEST", latitude: null, sourceReceivedAt: null });
  assert.equal(merged.name, "TEST");
  assert.equal(merged.latitude, 52.37);
  assert.equal(merged.sourceReceivedAt, position.sourceReceivedAt);
});
