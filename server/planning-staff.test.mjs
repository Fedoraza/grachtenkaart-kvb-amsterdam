import assert from "node:assert/strict";
import test from "node:test";
import { parseStaffingPlanning } from "./planning-staff.mjs";

const boats = ["LUCKY STRIPPER", "RUSSIAN STAR", "VIBE"];

test("extracts driver and host assignments from an OCR table", () => {
  const tsv = makeTsv([
    [50, 10, "Boat"], [300, 10, "Driver"], [600, 10, "Host"],
    [50, 50, "VIBE"], [280, 50, "Alice"], [340, 50, "Smith"], [580, 50, "Bob"], [630, 50, "Jones"],
    [50, 90, "LS"], [280, 90, "Carol"], [340, 90, "Green"], [580, 90, "Dan"], [620, 90, "Brown"],
  ]);
  const result = parseStaffingPlanning("", tsv, boats);

  assert.ok(result.items.some((item) => item.boat === "VIBE" && item.role === "skipper" && item.person === "Alice Smith"));
  assert.ok(result.items.some((item) => item.boat === "VIBE" && item.role === "host" && item.person === "Bob Jones"));
  assert.ok(result.items.some((item) => item.boat === "LUCKY STRIPPER" && item.role === "skipper" && item.person === "Carol Green"));
});

test("extracts runner and ops without inventing boat assignments", () => {
  const result = parseStaffingPlanning("Runner: Jane Doe\nOPS - Mark Stone", "", boats);
  assert.deepEqual(result.staff, [
    { role: "runner", person: "Jane Doe" },
    { role: "ops", person: "Mark Stone" },
  ]);
  assert.deepEqual(result.items, []);
});

test("extracts OPS and Kade as location staff", () => {
  const result = parseStaffingPlanning("OPS: Mark Stone\nKade - Jane Doe", "", boats);
  assert.deepEqual(result.staff, [
    { role: "ops", person: "Mark Stone" },
    { role: "kade", person: "Jane Doe" },
  ]);
});

test("extracts multiple tagged OPS and Kade members from a chat message", () => {
  const result = parseStaffingPlanning("OPS\n@ Mark Stone\n@ Jane Doe\nKade\n@ Bob Jones", "", boats);
  assert.ok(result.staff.some((item) => item.role === "ops" && item.person === "Mark Stone"));
  assert.ok(result.staff.some((item) => item.role === "ops" && item.person === "Jane Doe"));
  assert.ok(result.staff.some((item) => item.role === "kade" && item.person === "Bob Jones"));
});

test("ignores numeric mention ids when matching timed crew cards", () => {
  const result = parseStaffingPlanning("VIBE\n@ 211261052698727\n@ sil sluiters\nSL 09:45-17:00\nSummer Jones\nH 11:15-17:00\nJulia Impey", "", boats);
  assert.ok(result.items.some((item) => item.role === "skipper" && item.person === "Summer Jones"));
  assert.ok(result.items.some((item) => item.role === "host" && item.person === "Julia Impey"));
  assert.equal(result.items.some((item) => /^\d+$/.test(item.person)), false);
});

test("numeric WhatsApp mentions still occupy their crew position", () => {
  const result = parseStaffingPlanning("VIBE\n@ 211261052698727\n@ Bob Jones\n@ Carol Green", "", boats);
  assert.deepEqual(result.items, [
    { boat: "VIBE", eventType: "shift", role: "host", person: "Bob Jones" },
    { boat: "VIBE", eventType: "shift", role: "host", person: "Carol Green" },
  ]);
});

test("extracts vertical driver and host blocks associated with the current boat", () => {
  const result = parseStaffingPlanning("VIBE\nDriver\nAlice Smith\nHost: Bob Jones\nLS\nDriver: Carol Green\nHost\nDan Brown", "", boats);
  assert.ok(result.items.some((item) => item.boat === "VIBE" && item.role === "skipper" && item.person === "Alice Smith"));
  assert.ok(result.items.some((item) => item.boat === "VIBE" && item.role === "host" && item.person === "Bob Jones"));
  assert.ok(result.items.some((item) => item.boat === "LUCKY STRIPPER" && item.role === "skipper" && item.person === "Carol Green"));
  assert.ok(result.items.some((item) => item.boat === "LUCKY STRIPPER" && item.role === "host" && item.person === "Dan Brown"));
});

test("uses the first tagged person as driver and following tags as hosts", () => {
  const result = parseStaffingPlanning("[VIBE]\n@ Alice Smith\n@ Bob Jones\n@ Carol Green\nLS\n@ Dan Brown\n@ Eva Stone", "", boats);

  assert.deepEqual(result.items, [
    { boat: "VIBE", eventType: "shift", role: "skipper", person: "Alice Smith" },
    { boat: "VIBE", eventType: "shift", role: "host", person: "Bob Jones" },
    { boat: "VIBE", eventType: "shift", role: "host", person: "Carol Green" },
    { boat: "LUCKY STRIPPER", eventType: "shift", role: "skipper", person: "Dan Brown" },
    { boat: "LUCKY STRIPPER", eventType: "shift", role: "host", person: "Eva Stone" },
  ]);
});

test("combines tagged message context with timed SL and HEX shift cards", () => {
  const result = parseStaffingPlanning("VIBE\n@ Frits van den Assem\n@ Olha Kovalenko\nSL | 13:15 - 00:00\nFrits van den Assem\nHEX1 | 14:45 - 00:00\nOlha Kovalenko", "", boats);

  assert.deepEqual(result.items, [
    { boat: "VIBE", eventType: "shift", role: "skipper", startTime: "13:15", endTime: "00:00", person: "Frits van den Assem" },
    { boat: "VIBE", eventType: "shift", role: "host", startTime: "14:45", endTime: "00:00", person: "Olha Kovalenko" },
  ]);
});

test("handles OCR variants from compact SL and HEX1 shift cards", () => {
  const result = parseStaffingPlanning("VIBE\n@ Frits van den Assem\n@ Olha Kovalenko\nSL] 13:15 00:00\nFrits van den Asem\nHEXT | 14:45 - 00:00\nOa Kove", "", boats);

  assert.deepEqual(result.items, [
    { boat: "VIBE", eventType: "shift", role: "skipper", startTime: "13:15", endTime: "00:00", person: "Frits van den Assem" },
    { boat: "VIBE", eventType: "shift", role: "host", startTime: "14:45", endTime: "00:00", person: "Olha Kovalenko" },
  ]);
});

test("replaces an OCR crew-name variant with its tagged WhatsApp name", () => {
  const result = parseStaffingPlanning("VIBE\n@ sil sluiters\nSL 16:45-00:45\nSi Suters", "", boats);
  assert.deepEqual(result.items, [
    { boat: "VIBE", eventType: "shift", role: "skipper", startTime: "16:45", endTime: "00:45", person: "sil sluiters" },
  ]);
});

test("does not merge different first names that share a surname", () => {
  const result = parseStaffingPlanning("VIBE\n@ Tim Sanders\nSL 09:30-19:00\nTim Sanders\nH 10:45-13:45\nErma Sanders", "", boats);
  assert.ok(result.items.some((item) => item.role === "host" && item.person === "Erma Sanders"));
});

function makeTsv(words) {
  const header = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  const rows = words.map(([x, y, text], index) => `5\t1\t1\t1\t${Math.floor(y / 40) + 1}\t${index + 1}\t${x}\t${y}\t${Math.max(35, text.length * 9)}\t14\t95\t${text}`);
  return [header, ...rows].join("\n");
}
