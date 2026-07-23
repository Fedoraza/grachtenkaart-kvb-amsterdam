import test from "node:test";
import assert from "node:assert/strict";
import { deriveTourPerformance } from "./tour-performance.mjs";

const start = Date.parse("2026-07-07T10:00:00Z");
const end = start + 60 * 60_000;

test("marks a tour on time from its first real moving AIS report", () => {
  const result = deriveTourPerformance({ scheduledStart: start, scheduledEnd: end, now: end, points: [
    { receivedAt: start - 60_000, speed: 0 },
    { receivedAt: start + 3 * 60_000, speed: 1.2 },
    { receivedAt: end + 2 * 60_000, speed: 0.2 },
  ] });
  assert.equal(result.status, "completed-on-time");
  assert.equal(result.delayMinutes, 3);
  assert.equal(result.actualEnd, end + 2 * 60_000);
});

test("marks a late active tour and never invents an end", () => {
  const result = deriveTourPerformance({ scheduledStart: start, scheduledEnd: end, now: end, points: [
    { receivedAt: start + 9 * 60_000, speed: 2.1 },
  ] });
  assert.equal(result.status, "active-late");
  assert.equal(result.delayMinutes, 9);
  assert.equal(result.actualEnd, null);
});

test("reports missing AIS after the planned tour window", () => {
  const result = deriveTourPerformance({ scheduledStart: start, scheduledEnd: end, now: end + 31 * 60_000, points: [] });
  assert.equal(result.status, "no-ais");
});

test("does not assign movement from a previous round to this tour", () => {
  const result = deriveTourPerformance({ scheduledStart: start, scheduledEnd: end, now: start, points: [
    { receivedAt: start - 10 * 60_000, speed: 2.4 },
  ] });
  assert.equal(result.status, "waiting-ais");
  assert.equal(result.actualStart, null);
});

test("uses a location pin to measure departure, return and total round duration", () => {
  const locationPin = { latitude: 52.375226, longitude: 4.883823 };
  const result = deriveTourPerformance({ scheduledStart: start, scheduledEnd: end, now: end + 10 * 60_000, locationPin, points: [
    { receivedAt: start - 60_000, latitude: 52.375226, longitude: 4.883823, speed: 0.2 },
    { receivedAt: start + 2 * 60_000, latitude: 52.3765, longitude: 4.883823, speed: 3 },
    { receivedAt: end + 4 * 60_000, latitude: 52.375226, longitude: 4.883823, speed: 1 },
  ] });
  assert.equal(result.trackingMethod, "location-pin");
  assert.equal(result.status, "completed-on-time");
  // The boundary was crossed between the two reports, so the tracker uses an
  // interpolated crossing time instead of the later outside report.
  assert.equal(result.delayMinutes, 1);
  assert.equal(result.returnDelayMinutes, 4);
  assert.equal(result.roundDurationMinutes, 63);
});

test("marks a round late based on return at the pin, not its departure", () => {
  const locationPin = { latitude: 52.375226, longitude: 4.883823 };
  const result = deriveTourPerformance({ scheduledStart: start, scheduledEnd: end, now: end + 20 * 60_000, locationPin, points: [
    { receivedAt: start, latitude: 52.375226, longitude: 4.883823 },
    { receivedAt: start + 60_000, latitude: 52.3765, longitude: 4.883823 },
    { receivedAt: end + 12 * 60_000, latitude: 52.375226, longitude: 4.883823 },
  ] });
  assert.equal(result.status, "completed-late");
  assert.equal(result.returnDelayMinutes, 12);
});
