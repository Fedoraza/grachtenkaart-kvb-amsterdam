import assert from "node:assert/strict";
import test from "node:test";
import { parseLanePlanningItems, parseTimelinePlanningItems, resolveOcrBoatName } from "./planning-image.mjs";

const boats = ["FLAGSHIP", "LUCKY STRIPPER", "PIERRE CUYPERS", "RUSSIAN STAR", "VIBE"];

test("resolves schedule abbreviations and truncated OCR boat names", () => {
  assert.equal(resolveOcrBoatName("LS", boats), "LUCKY STRIPPER");
  assert.equal(resolveOcrBoatName("Russian S", boats), "RUSSIAN STAR");
  assert.equal(resolveOcrBoatName("RussianSv", boats), "RUSSIAN STAR");
  assert.equal(resolveOcrBoatName("FS", boats), "FLAGSHIP");
  assert.equal(resolveOcrBoatName("Unlimited", boats), null);
  const laneBoats = ["JAN VAN DER HEIJDEN", "FREEWILLY", "DIRCK VAN OS", "MEIKE"];
  assert.equal(resolveOcrBoatName("JvdH20min", laneBoats), "JAN VAN DER HEIJDEN");
  assert.equal(resolveOcrBoatName("vdH 20min", laneBoats), "JAN VAN DER HEIJDEN");
  assert.equal(resolveOcrBoatName("FW", laneBoats), "FREEWILLY");
  assert.equal(resolveOcrBoatName("Bara", [...laneBoats, "BARRACUDA"]), "BARRACUDA");
  assert.equal(resolveOcrBoatName("DvO20mir", laneBoats), "DIRCK VAN OS");
  assert.equal(resolveOcrBoatName("Meike10min", laneBoats), "MEIKE");
  assert.equal(resolveOcrBoatName("Royal", [...laneBoats, "ROYALTY"]), "ROYALTY");
  assert.equal(resolveOcrBoatName("Barto", [...laneBoats, "BARTOLOTTI"]), "BARTOLOTTI");
  assert.equal(resolveOcrBoatName("Atlan", [...laneBoats, "ATLANTIS"]), "ATLANTIS");
  assert.equal(resolveOcrBoatName("Man", [...laneBoats, "MANHATTAN", "MANON"]), null);
});

test("resolves operational aliases across the active fleet", () => {
  const fleet = ["AGATHA", "AMELIE ZAHRA", "APSARA", "ATLANTIS", "BARRACUDA", "BARTOLOTTI", "CREUSEN-1",
    "DIRCK VAN OS", "DUTCHMAN", "FAYEN", "FLAGSHIP", "FREEWILLY", "GREEN MARINE", "GRIFFIOEN", "HARRY SLINGER",
    "HERMAN BROOD", "JAN VAN DER HEIJDEN", "LUCKY STRIPPER", "MAJESTIC", "MANHATTAN", "MONNE DE MIRANDA",
    "OLD QUEEN", "PIERRE CUYPERS", "ROYALTY", "RUSSIAN STAR", "SALOONSLOEP", "SLOEPVRIENDEN", "STELLA MARIS",
    "THEO KOK", "TIJD ZAL HET LEREN", "ZONNE BOOT"];
  for (const [alias, boat] of [["Lucky S", "LUCKY STRIPPER"], ["free w", "FREEWILLY"], ["herman b", "HERMAN BROOD"],
    ["DM", "DUTCHMAN"], ["OQ", "OLD QUEEN"], ["MDM", "MONNE DE MIRANDA"], ["Stella M", "STELLA MARIS"],
    ["TZHL", "TIJD ZAL HET LEREN"], ["Zonne B", "ZONNE BOOT"]]) {
    assert.equal(resolveOcrBoatName(alias, fleet), boat, alias);
  }
  assert.equal(resolveOcrBoatName("Cookie Tours", fleet), "HERMAN BROOD");
});

test("recognizes multiple boats and keeps unlimited drinks as a cruise attribute", () => {
  const tsv = makeTsv([
    [100, 10, "18:20"], [100, 40, "Vibe"], [110, 60, "UNLIMITED"], [100, 100, "19:15"],
    [400, 10, "18:40"], [400, 40, "LS"], [400, 65, "Break"], [400, 100, "19:00"],
    [700, 10, "19:20"], [700, 40, "Russian S"], [700, 65, "OUT to"], [700, 80, "E-Harbor"], [700, 100, "19:40"],
  ]);
  const items = parseTimelinePlanningItems(tsv, boats);

  assert.ok(items.some((item) => item.boat === "VIBE" && item.eventType === "tour"
    && item.startTime === "18:20" && item.notes === "Unlimited drinks"));
  assert.ok(items.some((item) => item.boat === "LUCKY STRIPPER" && item.eventType === "tour"));
  assert.ok(items.some((item) => item.boat === "LUCKY STRIPPER" && item.eventType === "break"));
  assert.ok(items.some((item) => item.boat === "RUSSIAN STAR" && item.eventType === "movement"));
  assert.equal(items.some((item) => item.boat.toUpperCase().includes("UNLIMITED")), false);
});

test("does not assign distant timeline rows to the only recognized boat", () => {
  const tsv = makeTsv([
    [100, 10, "18:20"], [100, 40, "Vibe"], [100, 100, "19:15"],
    [800, 500, "Break"], [800, 550, "20:00"],
  ]);
  const items = parseTimelinePlanningItems(tsv, boats);

  assert.equal(items.filter((item) => item.eventType === "break").length, 0);
});

test("repairs dropped leading digits and applies the standard one-hour tour", () => {
  const tsv = makeTsv([
    [100, 10, "19:40"], [100, 40, "Vibe"], [100, 100, "2:00"],
  ]);
  const items = parseTimelinePlanningItems(tsv, boats);
  assert.ok(items.some((item) => item.boat === "VIBE" && item.startTime === "19:40" && item.endTime === "20:40"));
});

test("rejects an hour-long OCR break and keeps the following tour at one hour", () => {
  const tsv = makePositionedTsv([
    [35, 5, 33, "11:00"], [3, 24, 80, "Apsara Break"], [35, 63, 33, "12:00"],
    [35, 160, 33, "13:00"], [3, 179, 80, "Apsara Break"], [35, 218, 33, "13:30"],
    [105, 5, 33, "10:00"], [74, 24, 18, "PC"], [105, 63, 33, "10:20"],
  ]);
  const items = parseLanePlanningItems(tsv, ["APSARA", "PIERRE CUYPERS"])
    .filter((item) => item.boat === "APSARA");

  assert.ok(items.some((item) => item.eventType === "break" && item.startTime === "11:00" && item.endTime === "11:20"));
  assert.ok(items.some((item) => item.eventType === "tour" && item.startTime === "11:20" && item.endTime === "12:20"));
});

test("reconstructs preparation, movement, breaks, and tours within each boat lane", () => {
  const tsv = makePositionedTsv([
    [35, 5, 33, "09:45"], [3, 24, 45, "Apsara"], [3, 43, 55, "E-Harbor"], [35, 63, 33, "10:00"],
    [3, 82, 34, "Goto"], [3, 101, 15, "AF"], [35, 140, 33, "11:00"],
    [3, 160, 45, "Apsara"], [3, 179, 34, "Break"], [35, 218, 33, "11:30"],
    [35, 315, 33, "12:30"], [3, 334, 45, "Apsara"], [3, 353, 34, "Break"], [35, 392, 33, "13:00"],
    [105, 5, 33, "08:45"], [74, 24, 18, "PC"], [74, 43, 55, "E-Harbor"], [105, 63, 33, "09:00"],
  ]);
  const items = parseLanePlanningItems(tsv, ["APSARA", "PIERRE CUYPERS"])
    .filter((item) => item.boat === "APSARA");

  assert.deepEqual(items.map(({ eventType, startTime, endTime, to }) => ({ eventType, startTime, endTime, to })), [
    { eventType: "preparation", startTime: "09:45", endTime: "10:00", to: undefined },
    { eventType: "movement", startTime: "10:00", endTime: "11:00", to: "Anne Frank" },
    { eventType: "break", startTime: "11:00", endTime: "11:30", to: undefined },
    { eventType: "tour", startTime: "11:30", endTime: "12:30", to: undefined },
    { eventType: "break", startTime: "12:30", endTime: "13:00", to: undefined },
  ]);
});

test("keeps right-aligned times inside five abbreviated boat columns", () => {
  const laneBoats = ["JAN VAN DER HEIJDEN", "EVE", "FREEWILLY", "MEIKE", "DIRCK VAN OS"];
  const jvdhLane = laneSequence(2, 30, "crew", "09:15", "03:40", "10:40", "11:00", "vdH20mir");
  const freeWillyLane = laneSequence(130, 158, "FW", "11:15", "11:30", "12:30", "12:50", "FW20min");
  freeWillyLane[2][3] = "Harbor."
  freeWillyLane[5] = [130, 101, 42, "cell|AF"];
  const tsv = makePositionedTsv([
    ...jvdhLane,
    ...laneSequence(66, 94, "Eve", "08:15", "08:40", "09:40", "10:00", "Eve20min"),
    ...freeWillyLane,
    ...laneSequence(194, 222, "Meike", "10:00", "10:20", "11:20", "11:40", "Meike20min"),
    ...laneSequence(258, 286, "DvO", "09:00", "09:20", "10:20", "10:40", "DvO20min"),
  ]);
  const items = parseLanePlanningItems(tsv, laneBoats);

  for (const [boat, start, prepEnd, movementEnd, breakEnd] of [
    ["JAN VAN DER HEIJDEN", "09:15", "09:40", "10:40", "11:00"],
    ["EVE", "08:15", "08:40", "09:40", "10:00"],
    ["FREEWILLY", "11:15", "11:30", "12:30", "12:50"],
    ["MEIKE", "10:00", "10:20", "11:20", "11:40"],
    ["DIRCK VAN OS", "09:00", "09:20", "10:20", "10:40"],
  ]) {
    const schedule = items.filter((item) => item.boat === boat);
    assert.ok(schedule.some((item) => item.eventType === "preparation" && item.startTime === start && item.endTime === prepEnd));
    assert.ok(schedule.some((item) => item.eventType === "movement" && item.startTime === prepEnd && item.endTime === movementEnd && item.to === "Anne Frank"), `${boat}: ${JSON.stringify(schedule)}`);
    assert.ok(schedule.some((item) => item.eventType === "break" && item.startTime === movementEnd && item.endTime === breakEnd));
  }
});

test("recovers a standard break when OCR reads only its start time", () => {
  const tsv = makePositionedTsv([
    [27, 5, 33, "16:00"], [3, 24, 45, "Bara"], [3, 43, 34, "Break"],
    [83, 5, 33, "16:00"], [59, 24, 45, "Nomag"],
  ]);
  const items = parseLanePlanningItems(tsv, ["BARRACUDA", "NOMAG"]);
  assert.ok(items.some((item) => item.eventType === "break" && item.startTime === "16:00" && item.endTime === "16:20"));
});

test("parses a schedule containing only one recognized fleet boat lane", () => {
  const tsv = makePositionedTsv([
    [35, 5, 33, "09:00"], [3, 24, 24, "Iris"], [3, 43, 55, "E-Harbor"], [35, 63, 33, "09:15"],
    [3, 82, 34, "Go to"], [3, 101, 35, "HOMO"], [35, 140, 33, "10:15"],
    [3, 160, 24, "Iris"], [3, 179, 34, "Break"], [35, 218, 33, "10:40"],
  ]);
  const items = parseLanePlanningItems(tsv, ["IRIS"]);
  assert.ok(items.some((item) => item.eventType === "preparation" && item.startTime === "09:00"));
  assert.ok(items.some((item) => item.eventType === "break" && item.startTime === "10:15" && item.endTime === "10:40"));
});

function makeTsv(lines) {
  const header = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  const rows = lines.map(([x, y, text], index) => `5\t1\t1\t1\t${index + 1}\t1\t${x}\t${y}\t80\t12\t95\t${text}`);
  return [header, ...rows].join("\n");
}

function makePositionedTsv(words) {
  const header = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
  const rows = words.map(([x, y, width, text], index) => `5\t1\t1\t1\t${index + 1}\t1\t${x}\t${y}\t${width}\t12\t95\t${text}`);
  return [header, ...rows].join("\n");
}

function laneSequence(left, timeLeft, boat, start, prepEnd, movementEnd, breakEnd, breakLabel) {
  return [
    [timeLeft, 5, 32, start], [left, 24, Math.max(18, boat.length * 7), boat], [left, 43, 55, "E-Harbor"], [timeLeft, 63, 32, prepEnd],
    [left, 82, 34, "Go to"], [left, 101, 15, "AF"], [timeLeft, 140, 32, movementEnd],
    [left, 160, Math.max(34, breakLabel.length * 7), breakLabel], [timeLeft, 199, 32, breakEnd],
  ];
}
