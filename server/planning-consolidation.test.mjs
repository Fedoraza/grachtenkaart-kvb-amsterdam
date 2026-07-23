import assert from "node:assert/strict";
import test from "node:test";
import { consolidateDayPlanning } from "./planning-consolidation.mjs";

test("joins split boat images using skipper span and standard break cadence", () => {
  const base = { boat_id: 1, boat_name: "EVE", group_location: "Anne Frank", received_at: 1 };
  const rows = [
    { ...base, id: 1, event_type: "shift", role: "skipper", person_name: "Isabel", start_time: "12:00", end_time: "17:45" },
    { ...base, id: 2, event_type: "shift", role: "skipper", person_name: "Floris", start_time: "17:30", end_time: "00:00" },
    ...["13:20", "14:40", "16:00", "16:40", "18:00"].map((start, index) => ({ ...base, id: 10 + index, event_type: "break", start_time: start, end_time: clockPlus(start, 20) })),
  ];
  const result = consolidateDayPlanning(rows);
  assert.ok(result.some((item) => item.event_type === "break" && item.start_time === "22:40" && item.end_time === "23:00"));
  assert.ok(result.some((item) => item.event_type === "movement" && item.start_time === "23:00" && item.end_time === "00:00" && item.to_location === "E-Harbour"));
  assert.equal(result.some((item) => item.event_type === "break" && item.start_time === "16:40"), false);
});

test("creates a complete harbour-to-harbour day when crew exists without a schedule image", () => {
  const rows = [{ boat_id: 2, boat_name: "IRIS", group_location: "Homomonument", id: 1,
    event_type: "shift", role: "skipper", person_name: "Andre", start_time: "08:00", end_time: "16:00" },
  { boat_id: 2, boat_name: "IRIS", group_location: "Homomonument", id: 2,
    event_type: "shift", role: "skipper", person_name: "Davian", start_time: "15:45", end_time: "23:45" }];
  const result = consolidateDayPlanning(rows);
  assert.ok(result.some((item) => item.event_type === "preparation" && item.start_time === "08:00" && item.from_location === "E-Harbour"));
  assert.ok(result.some((item) => item.event_type === "movement" && item.end_time === "23:45" && item.to_location === "E-Harbour"));
  assert.ok(result.filter((item) => item.event_type === "break").every((item) => clockPlus(item.start_time, 20) === item.end_time));
});

test("adds missing harbour edges without replacing visible schedule rows", () => {
  const base = { boat_id: 3, boat_name: "ATLANTIS", group_location: "Anne Frank", received_at: 1 };
  const result = consolidateDayPlanning([
    { ...base, id: 1, event_type: "break", start_time: "10:00", end_time: "10:20" },
    { ...base, id: 2, event_type: "tour", start_time: "10:20", end_time: "11:20" },
  ]);
  assert.ok(result.some((item) => item.event_type === "preparation" && item.from_location === "E-Harbour"));
  assert.ok(result.some((item) => item.event_type === "movement" && item.to_location === "E-Harbour"));
  assert.ok(result.some((item) => item.id === 1 && item.start_time === "10:00"));
});

function clockPlus(value, amount) {
  const [hour, minute] = value.split(":").map(Number);
  const total = (hour * 60 + minute + amount) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
