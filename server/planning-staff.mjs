import { parseOcrTsvLines, parseOcrTsvWords, resolveOcrBoatName } from "./planning-image.mjs";

const ROLE_WORDS = {
  skipper: /^(?:DRIVER|SKIPPER|SKIPPERS|SL)$/i,
  host: /^(?:HOST|HOSTS|GUIDE|GUIDES)$/i,
  runner: /^(?:RUNNER|RUNNERS)$/i,
  ops: /^(?:OPS|OPERATION|OPERATIONS)$/i,
  kade: /^(?:KADE|DOCK|DOCKS|QUAY)$/i,
};

export function parseStaffingPlanning(text, tsv, knownBoats) {
  const items = [];
  const staff = [];
  const textLines = String(text || "").split(/\r?\n/).map(cleanText).filter(Boolean);
  const ocrLines = tsv ? parseOcrTsvLines(tsv).map((line) => line.text) : [];
  const lines = [...new Set([...textLines, ...ocrLines])];

  parseShiftCards(lines, knownBoats, items);
  parseTaggedCrewBlocks(lines, knownBoats, items);
  parseTaggedLocationStaffBlocks(lines, knownBoats, staff);
  parseLabeledLines(lines, knownBoats, items, staff);
  if (tsv) parseStaffingTable(tsv, knownBoats, items, staff);

  return { items: deduplicate(reconcileCrewNames(items), (item) => [item.boat, item.role, item.person].join("|")),
    staff: deduplicate(staff, (item) => [item.role, item.person].join("|")) };
}

function reconcileCrewNames(items) {
  const timed = items.filter((item) => item.startTime && item.endTime);
  const untimed = items.filter((item) => !item.startTime && !item.endTime);
  const matchedUntimed = new Set();
  for (const shift of timed) {
    const candidates = untimed.filter((item) => item.boat === shift.boat && nameSimilarity(item.person, shift.person) >= 0.68);
    const match = candidates.sort((left, right) => nameSimilarity(right.person, shift.person) - nameSimilarity(left.person, shift.person))[0];
    if (!match) continue;
    shift.person = match.person;
    matchedUntimed.add(match);
  }
  return [...timed, ...untimed.filter((item) => !matchedUntimed.has(item))];
}

function nameSimilarity(left, right) {
  const a = cleanText(left).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const b = cleanText(right).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!a || !b || a[0] !== b[0]) return 0;
  const rows = Array.from({ length: a.length + 1 }, (_, index) => [index]);
  rows[0] = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return 1 - rows[a.length][b.length] / Math.max(a.length, b.length);
}

function parseTaggedLocationStaffBlocks(lines, knownBoats, staff) {
  let role = null;
  for (const line of lines) {
    const heading = roleForHeader(line);
    if (heading && ["ops", "kade", "runner"].includes(heading)) {
      role = heading;
      continue;
    }
    if (roleForHeader(line) || resolveOcrBoatName(line, knownBoats)) {
      role = null;
      continue;
    }
    if (!role || !/^\s*[@＠]/.test(line)) continue;
    const person = cleanPersonName(line, knownBoats);
    if (person) staff.push({ role, person });
  }
}

function parseShiftCards(lines, knownBoats, items) {
  const boat = lines.map((line) => resolveOcrBoatName(line, knownBoats)).find(Boolean);
  if (!boat) return;
  const taggedPeople = lines.flatMap((line) => {
    const match = line.match(/^\s*[@＠]\s*(.+)$/);
    const person = cleanPersonName(match?.[1], knownBoats, boat);
    return person ? [person] : [];
  });
  const headerPattern = /\b(SL\d*|SP\d*|SOLO|CCH\d*|H(?:OST)?|H\s*EX[\dITL]*|HEX[\dITL]*)\b\s*[|Il:\]]?\s*([0-2]?\d[:.]\d{2})\s*[-–|]?\s*([0-2]?\d[:.]\d{2})/i;
  const cardCount = lines.filter((line) => headerPattern.test(line)).length;
  let cardIndex = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(headerPattern);
    if (!match) continue;
    const sameLineName = lines[index].slice((match.index || 0) + match[0].length).replace(/^[|Il: -]+/, "").trim();
    const nextLine = lines.slice(index + 1).find((line) => !headerPattern.test(line)
      && !resolveOcrBoatName(line, knownBoats) && !/^\s*[@＠]/.test(line));
    const person = (taggedPeople.length >= cardCount ? taggedPeople[cardIndex] : null)
      || cleanPersonName(sameLineName || nextLine, knownBoats, boat);
    if (!person) continue;
    const code = match[1].replace(/\s/g, "").toUpperCase();
    items.push({
      boat,
      eventType: "shift",
      role: code === "SOLO" ? "solo" : /^(?:SL|SP)/.test(code) ? "skipper" : "host",
      startTime: normalizeTime(match[2]),
      endTime: normalizeTime(match[3]),
      person,
    });
    cardIndex += 1;
  }
}

function normalizeTime(value) {
  const [hour, minute] = String(value).replace(".", ":").split(":");
  return `${hour.padStart(2, "0")}:${minute}`;
}

function parseTaggedCrewBlocks(lines, knownBoats, items) {
  let currentBoat = null;
  let taggedPersonIndex = 0;
  for (const line of lines) {
    const boat = resolveOcrBoatName(line, knownBoats);
    if (boat) {
      currentBoat = boat;
      taggedPersonIndex = 0;
      continue;
    }
    if (!currentBoat) continue;
    const tagged = line.match(/^\s*[@＠]\s*(.+)$/);
    if (!tagged) continue;
    const person = cleanPersonName(tagged[1], knownBoats, currentBoat);
    if (person) {
      items.push({
        boat: currentBoat,
        eventType: "shift",
        role: taggedPersonIndex === 0 ? "skipper" : "host",
        person,
      });
    }
    // A WhatsApp privacy/LID mention may only be available as a numeric id.
    // It still occupies its driver/host position even though no name can be stored.
    taggedPersonIndex += 1;
  }
}

function parseLabeledLines(lines, knownBoats, items, staff) {
  let currentBoat = null;
  let sectionRole = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headingRole = roleForHeader(line);
    if (headingRole && /^(?:DRIVERS?|SKIPPERS?|HOSTS?|GUIDES?)$/i.test(line)) {
      sectionRole = headingRole;
      continue;
    }
    for (const role of ["runner", "ops", "kade"]) {
      const label = role === "runner" ? "RUNNERS?" : role === "ops" ? "OPS|OPERATIONS?" : "KADE|DOCKS?|QUAY";
      const after = line.match(new RegExp(`^(?:${label})\\s*[:|\\-]?\\s+(.+)$`, "i"));
      const before = line.match(new RegExp(`^(.+?)\\s*[-|:]\\s*(?:${label})$`, "i"));
      const standalone = new RegExp(`^(?:${label})$`, "i").test(line) ? lines[index + 1] : null;
      const person = cleanPersonName(after?.[1] || before?.[1] || standalone, knownBoats);
      if (person) staff.push({ role, person });
    }

    const boat = resolveOcrBoatName(line, knownBoats);
    if (boat) currentBoat = boat;
    if (boat && sectionRole && ["skipper", "host"].includes(sectionRole)) {
      const sameLine = removeBoatLabel(line, boat, knownBoats);
      const person = cleanPersonName(sameLine, knownBoats, boat);
      if (person) items.push({ boat, eventType: "shift", role: sectionRole, person });
    }
    if (!boat && currentBoat) {
      let foundLabeledRole = false;
      for (const [role, pattern] of [["skipper", "DRIVERS?|SKIPPERS?|SL"], ["host", "HOSTS?|GUIDES?"]]) {
        const labeled = line.match(new RegExp(`^(?:${pattern})\\s*[:|\\-]?\\s*(.*)$`, "i"));
        if (!labeled) continue;
        foundLabeledRole = true;
        const person = cleanPersonName(labeled[1] || lines[index + 1], knownBoats, currentBoat);
        if (person) items.push({ boat: currentBoat, eventType: "shift", role, person });
      }
      if (!foundLabeledRole && sectionRole && ["skipper", "host"].includes(sectionRole) && !roleForHeader(line)) {
        const person = cleanPersonName(line, knownBoats, currentBoat);
        if (person) items.push({ boat: currentBoat, eventType: "shift", role: sectionRole, person });
        sectionRole = null;
      }
    }
    if (!boat) continue;
    for (const [role, pattern] of [["skipper", "DRIVER|SKIPPER|SL"], ["host", "HOST|GUIDE"]]) {
      const match = line.match(new RegExp(`(?:${pattern})\\s*[:|\\-]?\\s+(.+?)(?=\\s+(?:DRIVER|SKIPPER|SL|HOST|GUIDE)\\b|$)`, "i"));
      const person = cleanPersonName(match?.[1], knownBoats);
      if (person) items.push({ boat, eventType: "shift", role, person });
    }
  }
}

function removeBoatLabel(line, boat, knownBoats) {
  const words = cleanText(line).split(/\s+/);
  for (let length = 1; length <= Math.min(3, words.length); length += 1) {
    if (resolveOcrBoatName(words.slice(0, length).join(" "), knownBoats) === boat) {
      return words.slice(length).join(" ").replace(/^[-:|]+\s*/, "").trim();
    }
  }
  return cleanText(line).replace(new RegExp(`^${escapeRegExp(boat)}\\s*[-:|]?\\s*`, "i"), "").trim();
}

function parseStaffingTable(tsv, knownBoats, items, staff) {
  const rows = groupVisualRows(parseOcrTsvWords(tsv));
  const headers = findRoleHeaders(rows);
  if (!headers.size) return;

  for (const row of rows) {
    if ([...row.words].some((word) => roleForHeader(word.text))) continue;
    const rowText = row.words.map((word) => word.text).join(" ");
    const boat = resolveOcrBoatName(rowText, knownBoats);
    const values = valuesByHeader(row.words, headers);

    if (boat) {
      for (const role of ["skipper", "host"]) {
        const person = cleanPersonName(values.get(role), knownBoats, boat);
        if (person) items.push({ boat, eventType: "shift", role, person });
      }
    } else {
      for (const role of ["runner", "ops", "kade"]) {
        const person = cleanPersonName(values.get(role), knownBoats);
        if (person) staff.push({ role, person });
      }
    }
  }
}

function groupVisualRows(words) {
  const rows = [];
  for (const word of [...words].sort((a, b) => a.centerY - b.centerY || a.x - b.x)) {
    let row = rows.find((candidate) => Math.abs(candidate.centerY - word.centerY) <= Math.max(10, word.height * 0.7));
    if (!row) {
      row = { centerY: word.centerY, words: [] };
      rows.push(row);
    }
    row.words.push(word);
    row.centerY = row.words.reduce((total, candidate) => total + candidate.centerY, 0) / row.words.length;
  }
  for (const row of rows) row.words.sort((a, b) => a.x - b.x);
  return rows;
}

function findRoleHeaders(rows) {
  const result = new Map();
  for (const row of rows) {
    for (const word of row.words) {
      const role = roleForHeader(word.text);
      if (role && !result.has(role)) result.set(role, word.centerX);
    }
  }
  return result;
}

function roleForHeader(text) {
  return Object.entries(ROLE_WORDS).find(([, pattern]) => pattern.test(cleanText(text)))?.[0] || null;
}

function valuesByHeader(words, headers) {
  const values = new Map();
  const positions = [...headers].sort((left, right) => left[1] - right[1]);
  for (const [role, x] of positions) {
    const leftIndex = positions.findIndex(([candidate]) => candidate === role);
    const left = leftIndex === 0 ? x - 120 : (positions[leftIndex - 1][1] + x) / 2;
    const right = leftIndex === positions.length - 1 ? x + 180 : (x + positions[leftIndex + 1][1]) / 2;
    const value = words.filter((word) => word.centerX >= left && word.centerX < right).map((word) => word.text).join(" ");
    if (value) values.set(role, value);
  }
  return values;
}

function cleanPersonName(value, knownBoats, boat = null) {
  if (!value) return null;
  let name = cleanText(value)
    .replace(/^[@＠]+\s*/, "")
    .replace(/\b(?:DRIVER|SKIPPER|SL|HOST|GUIDE|RUNNER|OPS|OPERATIONS?)\b/gi, " ")
    .replace(/\b\d{1,2}[:.]\d{2}\b/g, " ")
    .replace(/\s+/g, " ").trim();
  for (const candidate of [boat, ...knownBoats].filter(Boolean).sort((a, b) => b.length - a.length)) {
    name = name.replace(new RegExp(`\\b${escapeRegExp(candidate)}\\b`, "ig"), " ").replace(/\s+/g, " ").trim();
  }
  if (!name || /^(?:-|N\/A|NONE|BREAK)$/i.test(name) || name.length < 2 || name.length > 80) return null;
  if (/^\d{6,}$/.test(name.replace(/\D/g, "")) && !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(name)) return null;
  return name;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deduplicate(items, keyFor) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFor(item).toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
