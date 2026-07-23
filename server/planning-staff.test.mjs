import assert from "node:assert/strict";
import test from "node:test";
import { detectLocationStaffRole, matchCrewFingerprint, parseLocationRosterCards, parseStaffingPlanning } from "./planning-staff.mjs";

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

test("does not treat OPS or Kade words inside instruction prose as staff table headers", () => {
  const tsv = makeTsv([
    [10, 10, "If"], [45, 10, "the"], [80, 10, "device"], [140, 10, "fails"], [190, 10, "ask"], [230, 10, "OPS"], [275, 10, "for"], [310, 10, "another"],
    [10, 45, "Take"], [60, 45, "it"], [85, 45, "back"], [130, 45, "to"], [155, 45, "the"], [190, 45, "Kade"],
    [10, 80, "Morning"], [120, 80, "charged"], [220, 80, "devices"],
  ]);
  assert.deepEqual(parseStaffingPlanning("", tsv, boats).staff, []);
});

test("still reads genuine standalone OPS and Kade table columns", () => {
  const tsv = makeTsv([
    [100, 10, "OPS"], [350, 10, "Kade"],
    [80, 50, "Mark"], [135, 50, "Stone"], [330, 50, "Jane"], [385, 50, "Doe"],
  ]);
  const result = parseStaffingPlanning("", tsv, boats);
  assert.ok(result.staff.some((item) => item.role === "ops" && item.person === "Mark Stone"));
  assert.ok(result.staff.some((item) => item.role === "kade" && item.person === "Jane Doe"));
});

test("reads FSKD and FSKA Kade duty cards with their own times", () => {
  assert.deepEqual(parseLocationRosterCards("FSKD | 09:45 - 16:00\nCatharina Beekveldt\nFSKA | 15:30 - 23:00\nNorman Klomp", "kade"), [
    { role: "kade", person: "Catharina Beekveldt", startTime: "09:45", endTime: "16:00" },
    { role: "kade", person: "Norman Klomp", startTime: "15:30", endTime: "23:00" },
  ]);
});

test("reads OPS duty cards without absorbing instruction text", () => {
  assert.deepEqual(parseLocationRosterCards("O|D| | 08:00 - 15:00\nRoselinde\nvan der Vliet\nO|T | 13:00 - 18:00\nLisa van Zijp", "ops"), [
    { role: "ops", person: "Roselinde van der Vliet", startTime: "08:00", endTime: "15:00" },
    { role: "ops", person: "Lisa van Zijp", startTime: "13:00", endTime: "18:00" },
  ]);
});

test("extracts multiple tagged OPS and Kade members from a chat message", () => {
  const result = parseStaffingPlanning("OPS\n@ Mark Stone\n@ Jane Doe\nKade\n@ Bob Jones", "", boats);
  assert.ok(result.staff.some((item) => item.role === "ops" && item.person === "Mark Stone"));
  assert.ok(result.staff.some((item) => item.role === "ops" && item.person === "Jane Doe"));
  assert.ok(result.staff.some((item) => item.role === "kade" && item.person === "Bob Jones"));
});

test("extracts untagged OPS and Kade member blocks from chat text", () => {
  const result = parseStaffingPlanning("OPS\nMark Stone\nJane Doe\nKade\nBob Jones", "", boats);
  assert.ok(result.staff.some((item) => item.role === "ops" && item.person === "Mark Stone"));
  assert.ok(result.staff.some((item) => item.role === "ops" && item.person === "Jane Doe"));
  assert.ok(result.staff.some((item) => item.role === "kade" && item.person === "Bob Jones"));
});

test("detects location staff roster cards even when the caption is missing", () => {
  assert.equal(detectLocationStaffRole("O|D| | 08:00 - 15:00\nRoselinde van der Vliet"), "ops");
  assert.equal(detectLocationStaffRole("FSKA | 15:30 - 23:00\nNorman Klomp"), "kade");
});

test("does not classify instruction posters as OPS or Kade rosters", () => {
  const text = "OPS Day operations OPS for Wednesday 8 July\nEvening Morning back to the harbour\nbe in the cleaning boat during charged and functioning cleaning box devices employees can charge using the Klearly app";
  assert.equal(detectLocationStaffRole(text), null);
  assert.deepEqual(parseStaffingPlanning(text, "", boats).staff, []);
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

test("prefers the name printed on a shift card over a WhatsApp tag", () => {
  const result = parseStaffingPlanning("VIBE\n@ Different Person\nSL | 13:15 - 00:00\nFrits van den Assem", "", boats);
  assert.deepEqual(result.items, [
    { boat: "VIBE", eventType: "shift", role: "skipper", startTime: "13:15", endTime: "00:00", person: "Frits van den Assem" },
  ]);
});

test("recognizes S1 and 51 OCR variants as skipper cards and cleans names", () => {
  const result = parseStaffingPlanning("VIBE\nS1 | 08:00 - 16:00\n=abel Bakker\n51 | 15:45 - 23:45\nSummer Arkenbout Arkenbout", "", boats);
  assert.deepEqual(result.items, [
    { boat: "VIBE", eventType: "shift", role: "skipper", startTime: "08:00", endTime: "16:00", person: "Isabel Bakker" },
    { boat: "VIBE", eventType: "shift", role: "skipper", startTime: "15:45", endTime: "23:45", person: "Summer Arkenbout" },
  ]);
});

test("recognizes compact shift times without colons", () => {
  const parsed = parseStaffingPlanning("EVE\n@Isabel B\nSL 1200-1745\nIssel B", "", ["EVE"]);
  assert.ok(parsed.items.some((item) => item.boat === "EVE" && item.role === "skipper"
    && item.startTime === "12:00" && item.endTime === "17:45" && item.person === "Isabel B"));
});

test("keeps a host when OCR fragments the card header and loses its times", () => {
  const tsv = makeTsv([[10, 10, "EVE"], [10, 40, "HIT"], [65, 40, "T1745"], [10, 58, "Maja Frankiewicz"]]);
  const parsed = parseStaffingPlanning("", tsv, ["EVE"]);
  assert.ok(parsed.items.some((item) => item.boat === "EVE" && item.role === "host" && item.person === "Maja Frankiewicz"));
});

test("falls back to the matching tag position when a card name is OCR garbage", () => {
  const parsed = parseStaffingPlanning("EVE\n@Isabel Bakker\n@Maja Frankiewicz", "", ["EVE"]);
  const withCard = parseStaffingPlanning("EVE\n@Isabel Bakker\n@Maja Frankiewicz\nSL 12:00-17:45\nIsabel Bakker\nH 13:15-17:45\nA=", "", ["EVE"]);
  assert.ok(parsed.items.length >= 2);
  assert.ok(withCard.items.some((item) => item.role === "host" && item.person === "Maja Frankiewicz"));
});

test("does not invent a boat from an OCR fragment on a crew card without caption", () => {
  const parsed = parseStaffingPlanning("", makeTsv([[10, 10, "RS ier"], [10, 35, "SL 11:45-17:30"], [10, 55, "Rob Mieras"]]), ["RUSSIAN STAR"]);
  assert.deepEqual(parsed.items, []);
});

test("treats SOLO crew as a host, not a driver", () => {
  const parsed = parseStaffingPlanning("VIBE\nSOLO 10:00-18:00\nRobin Host", "", ["VIBE"]);
  assert.ok(parsed.items.some((item) => item.person === "Robin" && item.role === "host"));
  assert.equal(parsed.items.some((item) => item.role === "solo" || item.role === "skipper"), false);
});

test("recognizes role codes used on tall full crew rosters", () => {
  const parsed = parseStaffingPlanning("FLAGSHIP\nS1 08:00-16:00\nAlbert Bakker\nU 08:00-16:00\nSello Romkens\nIH-T 09:45-16:00\nSalim Baktiyarov\nSD 09:45-16:00\nJesse De Vries\nPHo 17:30-20:30\nGreta Riccardi\nSP1 17:30-20:30\nTommy Al", "", ["FLAGSHIP"]);
  assert.deepEqual(parsed.items.map((item) => [item.person, item.role]), [
    ["Albert Bakker", "skipper"], ["Sello Romkens", "host"], ["Salim Baktiyarov", "host"],
    ["Jesse De Vries", "skipper"], ["Greta Riccardi", "host"], ["Tommy Al", "skipper"],
  ]);
});

test("keeps repeated crew names available for consecutive roster cards", () => {
  const parsed = parseStaffingPlanning("FLAGSHIP\nH 17:30-20:30\nGreta Riccardi\nH 20:30-22:30\nGreta Riccardi\nS1 20:30-23:45\nTommy Al", "", ["FLAGSHIP"]);
  assert.ok(parsed.items.some((item) => item.person === "Greta Riccardi" && item.startTime === "17:30"));
  assert.ok(parsed.items.some((item) => item.person === "Greta Riccardi" && item.startTime === "20:30"));
});

test("uses the WhatsApp boat caption over a duty name inside the crew image", () => {
  const parsed = parseStaffingPlanning("FLAGSHIP 10:15-22:20\nS1 08:00-16:00\nAlbert Bakker", "", ["EVELINE", "FLAGSHIP"], "EVELINE\n@Albert");
  assert.ok(parsed.items.some((item) => item.boat === "EVELINE" && item.person === "Albert Bakker"));
  assert.equal(parsed.items.some((item) => item.boat === "FLAGSHIP"), false);
});

test("matches a captionless crew card only to one unique same-day boat fingerprint", () => {
  const detected = [
    { role: "skipper", startTime: "11:45", endTime: "17:30" },
    { role: "skipper", startTime: "17:15", endTime: "00:30" },
    { role: "host", startTime: "18:00", endTime: "00:30" },
  ];
  const existing = detected.map((item) => ({ ...item, boatName: "HERMAN BROOD" }))
    .concat(detected.slice(0, 1).map((item) => ({ ...item, boatName: "OTHER" })));
  assert.equal(matchCrewFingerprint(detected, existing), "HERMAN BROOD");
  assert.equal(matchCrewFingerprint(detected, [...existing, ...detected.map((item) => ({ ...item, boatName: "TIE" }))]), null);
});

test("skips OCR separator garbage between a crew header and person name", () => {
  const parsed = parseStaffingPlanning("HERMAN BROOD\nCCH1 12:30-18:00\n|\nLevie Beumer", "", ["HERMAN BROOD"]);
  assert.ok(parsed.items.some((item) => item.role === "host" && item.person === "Levie Beumer"));
});

test("keeps one best image name for a duplicated skipper shift", () => {
  const result = parseStaffingPlanning("VIBE\nS1 | 08:00 - 16:00\nnar van sensi\n51 | 08:00 - 16:00\nAndre van Schaik", "", boats);
  assert.deepEqual(result.items, [
    { boat: "VIBE", eventType: "shift", role: "skipper", startTime: "08:00", endTime: "16:00", person: "Andre van Schaik" },
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
