import { parseOcrTsvLines, parseOcrTsvWords, resolveOcrBoatName } from "./planning-image.mjs";

const ROLE_WORDS = {
  skipper: /^(?:DRIVER|SKIPPER|SKIPPERS|SL)$/i,
  host: /^(?:HOST|HOSTS|GUIDE|GUIDES)$/i,
  runner: /^(?:RUNNER|RUNNERS)$/i,
  ops: /^(?:OPS|OPERATION|OPERATIONS)$/i,
  kade: /^(?:KADE|DOCK|DOCKS|QUAY)$/i,
};

export function parseStaffingPlanning(text, tsv, knownBoats, contextText = "") {
  const items = [];
  const staff = [];
  const textLines = String(text || "").split(/\r?\n/).map(cleanText).filter(Boolean);
  const ocrLines = tsv ? parseOcrTsvLines(tsv).map((line) => line.text) : [];
  // Repeated names are meaningful on full-day rosters: the same person can
  // have several consecutive cards. Only deduplicate parsed assignments, not
  // the source lines, or a later card steals the next person's name.
  const lines = [...textLines, ...ocrLines];

  // The card itself is authoritative for its boat. Context captions are only
  // a fallback; otherwise a nearby caption can attach FLAGSHIP crew to the
  // preceding EVELINE message when WhatsApp history arrives in a batch.
  const contextBoat = String(contextText || "").split(/\r?\n/).map((line) => resolveOcrBoatName(line, knownBoats)).find(Boolean) || null;
  const boatsWithShiftCards = parseShiftCards([...ocrLines, ...textLines], knownBoats, items, textLines, ocrLines, contextBoat);
  if (tsv) parseFragmentedHostCards(tsv, knownBoats, items, boatsWithShiftCards);
  if (!boatsWithShiftCards.size) parseTaggedCrewBlocks(lines, knownBoats, items, boatsWithShiftCards);
  parseTaggedLocationStaffBlocks(lines, knownBoats, staff);
  parseLabeledLines(lines, knownBoats, items, staff);
  if (tsv) parseStaffingTable(tsv, knownBoats, items, staff);

  return { items: deduplicate(reconcileCrewNames(items), (item) => [item.boat, item.role, item.person, item.startTime, item.endTime].join("|")),
    staff: deduplicate(staff.filter((item) => isPlausibleLocationStaffName(item.person)), (item) => [item.role, item.person].join("|")) };
}

export function detectLocationStaffRole(text, tsv = "") {
  const source = String(text || "");
  const lines = source.split(/\r?\n/).map(cleanText).filter(Boolean);
  const firstLine = lines[0] || "";
  if (/^(?:OPS|OPERATIONS?)$/i.test(firstLine)) return "ops";
  if (/^(?:KADE|DOCKS?|QUAY)$/i.test(firstLine)) return "kade";

  const combined = `${source}\n${tsv ? parseOcrTsvLines(tsv).map((line) => line.text).join("\n") : ""}`;
  if (looksLikeInstructionPoster(combined)) return null;
  const opsCards = parseLocationRosterCards(combined, "ops").length;
  const kadeCards = parseLocationRosterCards(combined, "kade").length;
  if (opsCards || kadeCards) return opsCards >= kadeCards ? "ops" : "kade";

  const normalized = combined.toUpperCase().replace(/[|Il1]/g, "I");
  const hasOpsShiftCode = /\bO\s*I?\s*[DTA]\s*I?\b[^\d]{0,18}\d{1,2}[:.]?\d{2}\s*[-–|]\s*\d{1,2}[:.]?\d{2}/.test(normalized);
  const hasKadeShiftCode = /\bFSK[AD]?\b[^\d]{0,18}\d{1,2}[:.]?\d{2}\s*[-–|]\s*\d{1,2}[:.]?\d{2}/.test(normalized);
  if (hasOpsShiftCode && !hasKadeShiftCode) return "ops";
  if (hasKadeShiftCode && !hasOpsShiftCode) return "kade";
  return null;
}

export function matchCrewFingerprint(detected, existing) {
  const source = detected.filter((item) => item.startTime && item.endTime && ["skipper", "host"].includes(item.role));
  if (source.length < 3) return null;
  const byBoat = new Map();
  for (const item of existing.filter((row) => row.boatName && row.startTime && row.endTime)) {
    if (!byBoat.has(item.boatName)) byBoat.set(item.boatName, []);
    byBoat.get(item.boatName).push(item);
  }
  const scores = [...byBoat].map(([boat, rows]) => {
    const remaining = [...rows];
    let score = 0;
    for (const item of source) {
      const index = remaining.findIndex((candidate) => candidate.role === item.role
        && candidate.startTime === item.startTime && candidate.endTime === item.endTime);
      if (index >= 0) { score += 1; remaining.splice(index, 1); }
    }
    return { boat, score };
  }).sort((left, right) => right.score - left.score);
  return scores[0]?.score >= 3 && scores[0].score >= (scores[1]?.score || 0) + 2 ? scores[0].boat : null;
}

export function parseLocationRosterCards(text, role) {
  if (!['ops', 'kade'].includes(role)) return [];
  const lines = String(text || '').split(/\r?\n/).map(cleanText).filter(Boolean)
    .filter((line) => !/^[@＠]/.test(line) && !/^(?:OPS|KADE)$/i.test(line.replace(/[^A-Z]/gi, '')));
  const header = role === 'kade'
    ? /\bFSK[AD]?\b[^\d]*([0-2]?\d[:.]?[0-5]\d)\s*[-–|]\s*([0-2]?\d[:.]?[0-5]\d)/i
    : /\bO[|ILT1]*[DTA]?[|ILT1]*\b[^\d]*([0-2]?\d[:.]?[0-5]\d)\s*[-–|]\s*([0-2]?\d[:.]?[0-5]\d)/i;
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(header);
    if (!match) continue;
    const candidates = [];
    for (let cursor = index + 1; cursor < lines.length && cursor <= index + 4; cursor += 1) {
      if (header.test(lines[cursor]) || /\b\d{1,2}:?\d{2}\s*[-–]\s*\d{1,2}:?\d{2}\b/.test(lines[cursor])) break;
      const candidate = lines[cursor].replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ]+|[^A-Za-zÀ-ÖØ-öø-ÿ'’ -]+$/g, '').trim();
      if (!candidate || candidate.length < 3 || /[=_]{2,}|\b(?:FSK|OPS|KADE)\b/i.test(candidate)) continue;
      if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’ -]+$/.test(candidate)) continue;
      candidates.push(candidate);
      if (candidate.split(/\s+/).length >= 2 && !/^(?:van|der|de|den|ten|ter)$/i.test(candidate)) break;
    }
    if (!candidates.length) continue;
    let person = candidates[0];
    if (person.split(/\s+/).length === 1 && candidates[1]) person = `${person} ${candidates[1]}`;
    person = person.replace(/\bY(?=Weijden\b)/i, '');
    person = person.split(/\s+/).map((word) => /^(?:van|der|de|den|ten|ter)$/i.test(word) ? word.toLowerCase() : word.replace(/^./, (letter) => letter.toUpperCase())).join(' ');
    if (!isPlausibleLocationStaffName(person)) continue;
    result.push({ role, person, startTime: normalizeTime(match[1]), endTime: normalizeTime(match[2]) });
  }
  return deduplicate(result, (item) => [item.role, item.person, item.startTime, item.endTime].join('|'));
}

function parseFragmentedHostCards(tsv, knownBoats, items, boatsWithShiftCards) {
  const rows = groupVisualRows(parseOcrTsvWords(tsv));
  const boat = [...boatsWithShiftCards][0];
  if (!boat) return;
  for (let index = 0; index < rows.length - 1; index += 1) {
    const header = rows[index].words.map((word) => word.text).join(" ").toUpperCase().replace(/[^A-Z0-9:]/g, "");
    if (!/^(?:HIT|H1T|HLT|HT|H1|HI)(?:T?\d{3,4}|T?\d{1,2}:\d{2})?$/.test(header)) continue;
    const next = rows[index + 1];
    if (next.centerY - rows[index].centerY > 30) continue;
    const person = cleanPersonName(next.words.map((word) => word.text).join(" "), knownBoats, boat);
    if (!person || items.some((item) => item.boat === boat && item.role === "host" && nameSimilarity(item.person, person) >= 0.55)) continue;
    items.push({ boat, eventType: "shift", role: "host", person, notes: "Times unreadable on crew card" });
  }
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
  const result = [...timed, ...untimed.filter((item) => !matchedUntimed.has(item))];
  const consolidated = [];
  for (const item of result) {
    const duplicateIndex = consolidated.findIndex((candidate) => candidate.boat === item.boat && candidate.role === item.role
      && candidate.startTime === item.startTime && candidate.endTime === item.endTime
      && (item.role === "skipper" || nameSimilarity(candidate.person, item.person) >= 0.55
        || nameSuffixMatch(candidate.person, item.person) || sameLastName(candidate.person, item.person)));
    if (duplicateIndex < 0) consolidated.push(item);
    else if (personNameQuality(item.person) > personNameQuality(consolidated[duplicateIndex].person)) consolidated[duplicateIndex] = item;
  }
  return consolidated;
}

function sameLastName(left, right) {
  const surname = (value) => cleanText(value).toUpperCase().split(/\s+/).at(-1)?.replace(/[^A-Z]/g, "") || "";
  const a = surname(left), b = surname(right);
  return a.length >= 4 && a === b;
}

function personNameQuality(value) {
  const words = cleanText(value).split(/\s+/).filter(Boolean);
  return words.length * 20 + words.reduce((total, word) => total + word.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "").length, 0);
}

function nameSuffixMatch(left, right) {
  const a = cleanText(left).toUpperCase().replace(/[^A-Z]/g, "");
  const b = cleanText(right).toUpperCase().replace(/[^A-Z]/g, "");
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 6 && longer.endsWith(shorter);
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
    if (!role) continue;
    if (looksLikeInstructionPoster(line) || /\b\d{1,2}:?\d{2}\s*[-–]\s*\d{1,2}:?\d{2}\b/.test(line)) {
      role = null;
      continue;
    }
    const person = cleanPersonName(line, knownBoats);
    if (person) staff.push({ role, person });
  }
}

function parseShiftCards(lines, knownBoats, items, contextLines = lines, ocrLines = [], contextBoat = null) {
  const boat = resolveAuthoritativeCardBoat(lines, contextLines, ocrLines, knownBoats, contextBoat);
  if (!boat) return new Set();
  const taggedPeople = lines.flatMap((line) => {
    const match = line.match(/^\s*[@＠]\s*(.+)$/);
    const person = cleanPersonName(match?.[1], knownBoats, boat);
    return person ? [person] : [];
  });
  const headerPattern = /\b(SL\d*|S51\d*|S[1IT]\d*|5[1ILT]\d*|SP\d*|SD\d*|SOLO|CCH\d*|U|1(?=\s*[|\]])|P\s*HO\d*|I?H\s*[-–]?\s*T\d*|H(?:OST)?|H\s*EX[\dITL]*|HEX[\dITL]*)\b\s*[|Il:\]]?\s*([0-2]?\d[:.]?[0-5]\d)\s*[-–|]?\s*([0-2]?\d[:.]?[0-5]\d)/i;
  const cardCount = lines.filter((line) => headerPattern.test(line)).length;
  let cardIndex = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(headerPattern);
    if (!match) continue;
    const sameLineName = lines[index].slice((match.index || 0) + match[0].length).replace(/^[|:\] -]+/, "").trim();
    const nextLine = lines.slice(index + 1).find((line) => !headerPattern.test(line)
      && !resolveOcrBoatName(line, knownBoats) && !/^\s*[@＠]/.test(line)
      && isUsableCardName(cleanPersonName(line, knownBoats, boat)));
    const rawImagePerson = cleanPersonName(sameLineName || nextLine, knownBoats, boat);
    const imagePerson = isUsableCardName(rawImagePerson) ? rawImagePerson : null;
    const matchingTag = imagePerson ? taggedPeople.find((candidate) => nameSimilarity(candidate, imagePerson) >= 0.4) : null;
    const person = matchingTag || imagePerson
      || (taggedPeople.length >= cardCount ? taggedPeople[cardIndex] : null);
    if (!person) continue;
    const code = normalizeShiftCode(match[1]);
    items.push({
      boat,
      eventType: "shift",
      role: code === "SOLO" ? "host" : /^(?:SL|SP|SD)/.test(code) ? "skipper" : "host",
      startTime: normalizeTime(match[2]),
      endTime: normalizeTime(match[3]),
      person,
    });
    cardIndex += 1;
  }
  return cardCount || lines.some((line) => /^(?:HIT|H1T|HLT|HT)\b/i.test(cleanText(line))) ? new Set([boat]) : new Set();
}

function resolveAuthoritativeCardBoat(lines, contextLines, ocrLines, knownBoats, contextBoat) {
  // Boat comes from the accompanying WhatsApp caption. Text such as
  // "FLAGSHIP 10:15-22:20" inside a crew image can be a duty, not a boat.
  if (contextBoat) return contextBoat;
  const normalizedBoats = new Map(knownBoats.map((boat) => [normalizeCardKey(boat), boat]));
  // Only fall back to a full standalone image label when no caption resolves.
  for (const line of ocrLines) {
    const exact = normalizedBoats.get(normalizeCardKey(line));
    if (exact) return exact;
  }
  // Context captions are conventionally the first line and may use a trusted
  // explicit alias such as AZ or DvO. Do not search arbitrary OCR lines.
  return contextLines.map((line) => resolveOcrBoatName(line, knownBoats)).find(Boolean) || null;
}

function normalizeCardKey(value) {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function isUsableCardName(value) {
  const letters = String(value || "").replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  return letters.length >= 3 && !/^[A-Z]{1,2}$/i.test(letters);
}

function normalizeShiftCode(value) {
  return String(value || "").replace(/\s/g, "").toUpperCase()
    .replace(/[-–]/g, "")
    .replace(/^PHO/, "H")
    .replace(/^I?HT/, "H")
    .replace(/^5(?=[1ILT])/, "S")
    .replace(/^S51/, "SL")
    .replace(/^S[1IT]/, "SL");
}

function normalizeTime(value) {
  const source = String(value).replace(".", ":");
  const [hour, minute] = source.includes(":") ? source.split(":") : [source.slice(0, -2), source.slice(-2)];
  return `${hour.padStart(2, "0")}:${minute}`;
}

function parseTaggedCrewBlocks(lines, knownBoats, items, boatsWithShiftCards = new Set()) {
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
    if (boatsWithShiftCards.has(currentBoat)) continue;
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
    const headers = row.words.map((word) => ({ word, role: roleForHeader(word.text) })).filter((entry) => entry.role);
    if (!headers.length) continue;
    // A role word in prose ("ask OPS for another one") is not a table header.
    // Accept either a genuine multi-column header row, or a short standalone
    // one-column heading such as "OPS" / "KADE".
    const compactRow = row.words.map((word) => cleanText(word.text)).filter(Boolean);
    const headerRow = headers.length >= 2 || (headers.length === 1 && compactRow.length <= 2
      && compactRow.every((word) => roleForHeader(word) || /^[|:\-]+$/.test(word)));
    if (!headerRow) continue;
    for (const { word, role } of headers) if (!result.has(role)) result.set(role, word.centerX);
  }
  return result;
}

function isPlausibleLocationStaffName(value) {
  const text = cleanText(value);
  const words = text.split(/\s+/).filter(Boolean);
  if (!text || words.length > 5 || /[.!?;:]$/.test(text)) return false;
  const normalized = ` ${text.toUpperCase().replace(/[^A-ZÀ-ÖØ-Ý]+/g, " ").trim()} `;
  if (/\b(?:PROCESS|DEVICE|DEVICES|APP|USING|MORNING|EVENING|CLEANING|CHARGED|FUNCTIONING|EMPLOYEE|EMPLOYEES|HARBOUR|HARBOR|BOAT|BOX|SHIFT|PAYMENT|IPHONE|KLEARLY|TOMORROW)\b/.test(normalized)) return false;
  if (words.some((word) => /^(?:THE|TO|FOR|WITH|YOU|YOUR|BACK|NEXT|DAY|AND|OR|IN|ON|AT|BE|CAN|WILL|TAKE|GIVE|LEAVE|CHECK|ASK)$/i.test(word))) return false;
  return words.every((word) => word.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'’-]/g, "").replace(/['’-]/g, "").length >= 2);
}

export function looksLikeInstructionPoster(value) {
  const normalized = ` ${String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} `;
  if (!normalized.trim()) return false;
  const instructionHits = [
    /\bKLEARLY\b/, /\bPAYMENT\s+DEVICES?\b/, /\bCLEANING\s+BOX\b/, /\bDEVICES?\s+CHARGED\b/,
    /\bCHARGED\s+AND\s+FUNCTIONING\b/, /\bEMPLOYEES?\s+CAN\s+CHARGE\b/, /\bNEXT\s+DAY\b/,
    /\bBACK\s+TO\s+THE\s+HARBOU?R\b/, /\bUSING\s+THE\s+KLEARLY\s+APP\b/, /\bPROCESS\b/,
    /\bMAPS?\s*&?\s*VHF\b/, /\bBRACELET\b/, /\bREBOOK\b/, /\bVIATOR\b/,
  ].filter((pattern) => pattern.test(normalized)).length;
  return instructionHits >= 2;
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
    .replace(/^=\s*(?=[A-Za-zÀ-ÖØ-öø-ÿ])/, "Is")
    .replace(/^[@＠]+\s*/, "")
    .replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ]+/, "")
    .replace(/\b(?:DRIVER|SKIPPER|SL|HOST|GUIDE|RUNNER|OPS|OPERATIONS?)\b/gi, " ")
    .replace(/\b\d{1,2}[:.]\d{2}\b/g, " ")
    .replace(/\s+/g, " ").trim();
  for (const candidate of [boat, ...knownBoats].filter(Boolean).sort((a, b) => b.length - a.length)) {
    name = name.replace(new RegExp(`\\b${escapeRegExp(candidate)}\\b`, "ig"), " ").replace(/\s+/g, " ").trim();
  }
  name = name.split(/\s+/).filter((word, index, words) => index === 0 || word.toUpperCase() !== words[index - 1].toUpperCase()).join(" ");
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
