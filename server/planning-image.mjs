const BOAT_ALIASES = new Map([
  ["AZ", "AMELIE ZAHRA"],
  ["FS", "FLAGSHIP"],
  ["LS", "LUCKY STRIPPER"],
  ["PC", "PIERRE CUYPERS"],
  ["JVDH", "JAN VAN DER HEIJDEN"],
  ["VDH", "JAN VAN DER HEIJDEN"],
  ["FW", "FREEWILLY"],
  ["DVO", "DIRCK VAN OS"],
  ["BARRA", "BARRACUDA"],
  ["BARA", "BARRACUDA"],
  ["RS", "RUSSIAN STAR"],
  ["RUSSIAN S", "RUSSIAN STAR"],
]);

const NON_BOAT_LABELS = new Set([
  "BREAK",
  "COMING FROM",
  "DM",
  "OUT TO",
  "PRIVATE",
  "UNLIMITED",
  "UNLIMITED DRINKS",
]);

export function parseTimelinePlanningItems(tsv, knownBoats) {
  const lines = parseOcrTsvLines(tsv);
  if (!lines.length) return [];
  const words = parseOcrTsvWords(tsv);
  const semanticLines = [...lines, ...words];
  const boatOccurrences = extractBoatOccurrences(words, knownBoats);
  if (!boatOccurrences.length) return [];

  const timeLines = normalizeTimelineTimeLines(semanticLines.map((line) => ({ ...line, time: extractPlanningTime(line.text) })).filter((line) => line.time)
    .sort((left, right) => left.centerY - right.centerY || left.centerX - right.centerX));
  const result = [];

  // A boat name inside a timeline block represents the cruise itself. This also
  // lets product labels such as UNLIMITED remain attributes instead of boats.
  for (const occurrence of boatOccurrences) {
    const times = nearbyTimes(occurrence, timeLines);
    const previous = [...times].reverse().find((line) => line.centerY <= occurrence.centerY);
    const next = times.find((line) => line.centerY > occurrence.centerY + 8);
    if (!previous?.time) continue;

    const descriptors = semanticLines.filter((line) => line !== occurrence
      && Math.abs(line.centerX - occurrence.centerX) <= 170
      && Math.abs(line.centerY - occurrence.centerY) <= 120);
    const isPrivate = descriptors.some((line) => /\bPRIVATE\b/i.test(line.text));
    const unlimited = descriptors.some((line) => /\bUNLIMIT(?:ED|EO)\b/i.test(line.text));
    result.push({
      boat: occurrence.boat,
      eventType: isPrivate ? "private" : "tour",
      startTime: previous.time,
      endTime: next?.time || null,
      notes: unlimited ? "Unlimited drinks" : null,
    });
  }

  for (const line of semanticLines) {
    const occurrence = nearestBoatOccurrence(line, boatOccurrences);
    if (!occurrence) continue;
    const times = nearbyTimes(occurrence, timeLines);
    const sameLineTime = timeLines.find((candidate) => candidate.text === line.text
      && candidate.centerX === line.centerX && candidate.centerY === line.centerY)?.time || extractPlanningTime(line.text);
    const previous = [...times].reverse().find((timeLine) => timeLine.centerY <= line.centerY);
    const next = times.find((timeLine) => timeLine.centerY > line.centerY + 8);

    if (/\bBREAK\b/i.test(line.text)) {
      result.push({
        boat: occurrence.boat,
        eventType: "break",
        startTime: sameLineTime || previous?.time || null,
        endTime: next?.time || null,
      });
    }
    if (/^(?:GO\s+TO|OUT\s+TO|NAAR)\b/i.test(line.text)) {
      const destination = semanticLines.find((candidate) => candidate.centerY > line.centerY
        && candidate.centerY - line.centerY < 170
        && Math.abs(candidate.centerX - line.centerX) < 160
        && !extractPlanningTime(candidate.text)
        && !resolveOcrBoatName(candidate.text, knownBoats));
      result.push({
        boat: occurrence.boat,
        eventType: "movement",
        startTime: previous?.time || null,
        endTime: next?.time || null,
        to: destination?.text || null,
      });
    }
  }

  return deduplicateItems(normalizePlanningDurations(result));
}

// Parses spreadsheet-style planning screenshots where every boat has a fixed
// vertical lane. Explicit colored/outlined blocks contain preparation,
// movement, or break text; the empty space between consecutive break blocks is
// the boat's tour. Keeping every lookup inside one lane prevents times from a
// neighbouring boat being attached to the wrong event.
export function parseLanePlanningItems(tsv, knownBoats) {
  const words = parseOcrTsvWords(tsv);
  const occurrences = words.flatMap((word) => {
    const boat = resolveOcrBoatName(word.text, knownBoats);
    return boat ? [{ ...word, boat }] : [];
  });
  const lanes = buildBoatLanes(occurrences);
  if (lanes.length < 2) return [];

  const times = repairLaneTimes(words.flatMap(extractWordTimes).map((time) => ({ ...time, lane: nearestLane(time.x, lanes) })), lanes);
  const explicit = [];
  for (const occurrence of occurrences) {
    const lane = lanes.find((candidate) => candidate.boat === occurrence.boat);
    if (!lane) continue;
    const nearbyText = words.filter((word) => nearestLane(word.x, lanes) === lane
      && Math.abs(word.centerY - occurrence.centerY) <= 34).map((word) => word.text).join(" ");
    const bounds = eventBounds(occurrence.centerY, lane, times);
    if (!bounds.startTime || !bounds.endTime) continue;
    const isPreparation = /E\s*[-.]?\s*HARB(?:OR|OUR)/i.test(nearbyText);
    const duration = timeToMinutes(bounds.endTime) - timeToMinutes(bounds.startTime);
    const isBreak = /\bBREAK\b/i.test(nearbyText) || (duration > 0 && duration <= 45);
    if (!isPreparation && !isBreak) continue;
    const breakBounds = !isPreparation && isBreak ? normalizeBreakBounds(bounds, nearbyText) : bounds;
    explicit.push({
      boat: occurrence.boat,
      eventType: isPreparation ? "preparation" : "break",
      startTime: breakBounds.startTime,
      endTime: breakBounds.endTime,
      ...(isBreak && breakBounds.explicitDuration ? { notes: `${breakBounds.explicitDuration} min break` } : {}),
      ...(isPreparation ? { from: "E-Harbour", notes: "Prepare boat at E-Harbour" } : {}),
    });
  }

  // E-Harbour is enough to identify a preparation block once the horizontal
  // lane is known. This recovers preparations when OCR drops the boat label.
  for (const word of words.filter((candidate) => /HARB(?:OR|OUR)/i.test(candidate.text))) {
    const lane = nearestLane(word.x, lanes);
    if (!lane) continue;
    const bounds = eventBounds(word.centerY, lane, times);
    if (!bounds.startTime || !bounds.endTime) continue;
    explicit.push({
      boat: lane.boat,
      eventType: "preparation",
      startTime: bounds.startTime,
      endTime: bounds.endTime,
      from: "E-Harbour",
      notes: "Prepare boat at E-Harbour",
    });
  }

  // A boat label is occasionally dropped by OCR, but BREAK itself is very
  // reliable and its horizontal position still identifies the boat lane.
  for (const word of words.filter((candidate) => /^BREAK$/i.test(normalizeOcrKey(candidate.text)))) {
    const lane = nearestLane(word.x, lanes);
    if (!lane) continue;
    const detectedBounds = eventBounds(word.centerY, lane, times);
    if (!detectedBounds.startTime && !detectedBounds.endTime) continue;
    const bounds = {
      startTime: detectedBounds.startTime || addPlanningMinutes(detectedBounds.endTime, -20),
      endTime: detectedBounds.endTime || addPlanningMinutes(detectedBounds.startTime, 20),
    };
    const nearbyText = words.filter((candidate) => nearestLane(candidate.x, lanes) === lane
      && Math.abs(candidate.centerY - word.centerY) <= 38).map((candidate) => candidate.text).join(" ");
    const breakBounds = normalizeBreakBounds(bounds, nearbyText);
    explicit.push({
      boat: lane.boat,
      eventType: "break",
      startTime: breakBounds.startTime,
      endTime: breakBounds.endTime,
      ...(breakBounds.explicitDuration ? { notes: `${breakBounds.explicitDuration} min break` } : {}),
    });
  }

  const destinations = words.flatMap(extractWordDestinations);
  for (const word of words) {
    const normalized = normalizeOcrKey(word.text);
    const isCombinedGoTo = /^(?:GO|G0)\s*TO$/.test(normalized);
    const isToAfterGo = normalized === "TO" && words.some((candidate) => candidate !== word
      && Math.abs(candidate.centerY - word.centerY) <= 12
      && candidate.centerX < word.centerX
      && word.centerX - candidate.centerX <= 85
      && /(?:GO|G0)$/.test(normalizeOcrKey(candidate.text)));
    if (!isCombinedGoTo && !isToAfterGo) continue;
    const lane = nearestLane(word.x, lanes);
    if (!lane) continue;
    const bounds = eventBounds(word.centerY, lane, times, 125);
    if (!bounds.startTime || !bounds.endTime) continue;
    const destination = destinations.find((candidate) => nearestLane(candidate.x, lanes) === lane
      && candidate.centerY >= word.centerY - 8 && candidate.centerY - word.centerY <= 42
      && /^(?:I?AF|CS|RIJKS)$/i.test(candidate.text));
    explicit.push({
      boat: lane.boat,
      eventType: "movement",
      startTime: bounds.startTime,
      endTime: bounds.endTime,
      from: "E-Harbour",
      to: normalizeDestination(destination?.text),
    });
  }

  return inferLaneTours(normalizeLaneBreakCadence(deduplicateItems(explicit)));
}

function buildBoatLanes(occurrences) {
  const byBoat = new Map();
  for (const occurrence of occurrences) {
    if (!byBoat.has(occurrence.boat)) byBoat.set(occurrence.boat, []);
    byBoat.get(occurrence.boat).push(occurrence.x);
  }
  return [...byBoat].map(([boat, positions]) => ({ boat, leftX: median(positions) }))
    .sort((left, right) => left.leftX - right.leftX);
}

function nearestLane(x, lanes) {
  return lanes.reduce((best, lane) => !best || Math.abs(lane.leftX - x) < Math.abs(best.leftX - x) ? lane : best, null);
}

function extractWordTimes(word) {
  const result = [];
  const source = String(word.text || "");
  const matches = [...source.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)];
  for (const match of matches) {
    const offset = match.index / Math.max(1, source.length);
    const length = match[0].length / Math.max(1, source.length);
    result.push({
      time: `${match[1].padStart(2, "0")}:${match[2]}`,
      x: word.x + word.width * offset,
      centerX: word.x + word.width * (offset + length / 2),
      centerY: word.centerY,
    });
  }
  if (!matches.length && /^\d{3,4}[\]\)]?$/.test(source)) {
    const digits = source.replace(/\D/g, "").padStart(4, "0");
    const hour = Number(digits.slice(0, 2));
    const minute = Number(digits.slice(2));
    if (hour <= 23 && minute <= 59) result.push({ time: `${digits.slice(0, 2)}:${digits.slice(2)}`, x: word.x, centerX: word.centerX, centerY: word.centerY });
  }
  return result;
}

function extractWordDestinations(word) {
  const source = String(word.text || "");
  return [...source.matchAll(/(?:I?AF|CS|RIJKS)\b/gi)].map((match) => ({
    text: match[0],
    x: word.x + word.width * ((match.index || 0) / Math.max(1, source.length)),
    centerY: word.centerY,
  }));
}

function eventBounds(anchorY, lane, times, maxDistance = 95) {
  const laneTimes = times.filter((time) => time.lane === lane);
  const laneBefore = laneTimes.filter((time) => time.centerY < anchorY && anchorY - time.centerY <= maxDistance)
    .sort((left, right) => right.centerY - left.centerY)[0];
  const laneAfter = laneTimes.filter((time) => time.centerY > anchorY && time.centerY - anchorY <= maxDistance)
    .sort((left, right) => left.centerY - right.centerY)[0];
  return { startTime: laneBefore?.time || null, endTime: laneAfter?.time || null };
}

function repairLaneTimes(times, lanes) {
  for (const lane of lanes) {
    const laneTimes = times.filter((time) => time.lane === lane).sort((left, right) => left.centerY - right.centerY);
    for (let index = 0; index < laneTimes.length; index += 1) {
      const current = laneTimes[index];
      if (timeToMinutes(current.time) >= 7 * 60) continue;
      const minute = Number(current.time.slice(3));
      const previous = [...laneTimes.slice(0, index)].reverse().find((time) => timeToMinutes(time.time) >= 7 * 60);
      const next = laneTimes.slice(index + 1).find((time) => timeToMinutes(time.time) >= 7 * 60);
      const lower = previous ? timeToMinutes(previous.time) : 7 * 60;
      const upper = next ? timeToMinutes(next.time) : 23 * 60 + 59;
      const candidates = Array.from({ length: 17 }, (_, offset) => (offset + 7) * 60 + minute)
        .filter((value) => value >= lower && value <= upper);
      if (!candidates.length) continue;
      const target = previous && next
        ? lower + (upper - lower) * ((current.centerY - previous.centerY) / Math.max(1, next.centerY - previous.centerY))
        : previous ? lower : upper;
      const repaired = candidates.sort((left, right) => Math.abs(left - target) - Math.abs(right - target))[0];
      current.time = `${String(Math.floor(repaired / 60)).padStart(2, "0")}:${String(repaired % 60).padStart(2, "0")}`;
    }
  }
  return times;
}

function inferLaneTours(explicitItems) {
  const result = [...explicitItems];
  const byBoat = new Map();
  for (const item of explicitItems) {
    if (!byBoat.has(item.boat)) byBoat.set(item.boat, []);
    byBoat.get(item.boat).push(item);
  }
  for (const [boat, items] of byBoat) {
    items.sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));
    for (let index = 0; index < items.length - 1; index += 1) {
      const current = items[index];
      const next = items[index + 1];
      const gap = timeToMinutes(next.startTime) - timeToMinutes(current.endTime);
      if (gap < 60 || current.eventType !== "break") continue;
      const duration = gap === 70 ? 70 : 60;
      result.push({
        boat,
        eventType: "tour",
        startTime: current.endTime,
        endTime: addPlanningMinutes(current.endTime, duration),
        notes: duration === 70 ? "70 min sailing" : null,
      });
    }
  }
  return result.sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime)
    || left.boat.localeCompare(right.boat));
}

function normalizeLaneBreakCadence(explicitItems) {
  const result = explicitItems.map((item) => ({ ...item }));
  const byBoat = new Map();
  for (const item of result) {
    if (!byBoat.has(item.boat)) byBoat.set(item.boat, []);
    byBoat.get(item.boat).push(item);
  }
  for (const items of byBoat.values()) {
    items.sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));
    let previousBreak = null;
    for (const item of items) {
      if (item.eventType !== "break") {
        previousBreak = null;
        continue;
      }
      if (previousBreak) {
        const gap = timeToMinutes(item.startTime) - timeToMinutes(previousBreak.endTime);
        if (gap >= 15 && gap <= 120 && ![60, 70].includes(gap)) {
          const duration = Math.max(10, timeToMinutes(item.endTime) - timeToMinutes(item.startTime));
          item.startTime = addPlanningMinutes(previousBreak.endTime, 60);
          item.endTime = addPlanningMinutes(item.startTime, duration);
        }
      }
      previousBreak = item;
    }

    const breaks = items.filter((item) => item.eventType === "break")
      .sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));
    for (let index = 0; index < breaks.length - 1; index += 1) {
      const current = breaks[index];
      const next = breaks[index + 1];
      const duration = timeToMinutes(current.endTime) - timeToMinutes(current.startTime);
      const cycle = 60 + duration;
      const distance = timeToMinutes(next.startTime) - timeToMinutes(current.startTime);
      if (![2 * cycle, 3 * cycle].includes(distance)) continue;
      for (let offset = cycle; offset < distance; offset += cycle) {
        const startTime = addPlanningMinutes(current.startTime, offset);
        result.push({ boat: current.boat, eventType: "break", startTime, endTime: addPlanningMinutes(startTime, duration) });
      }
    }
  }
  return result;
}

function normalizeBreakBounds(bounds, nearbyText) {
  const explicit = String(nearbyText || "").match(/\b(10|15|20|25|30|40|45)\s*(?:MIN|MIR|MN)\b/i);
  const explicitDuration = explicit ? Number(explicit[1]) : null;
  const detectedDuration = timeToMinutes(bounds.endTime) - timeToMinutes(bounds.startTime);
  if (explicitDuration) return { ...bounds, endTime: addPlanningMinutes(bounds.startTime, explicitDuration), explicitDuration };
  if ([20, 30].includes(detectedDuration)) return bounds;
  return { ...bounds, endTime: addPlanningMinutes(bounds.startTime, 20) };
}

function normalizePlanningDurations(items) {
  return items.map((item) => {
    if (item.eventType !== "tour" || !item.startTime) return item;
    const explicit = String(item.notes || "").match(/\b(\d{2,3})\s*MIN\b/i);
    const duration = explicit ? Number(explicit[1]) : 60;
    return { ...item, endTime: addPlanningMinutes(item.startTime, duration) };
  });
}

function addPlanningMinutes(value, duration) {
  const total = (timeToMinutes(value) + duration) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function normalizeDestination(value) {
  const key = normalizeOcrKey(value).replace(/^I(?=AF$)/, "");
  return key === "AF" ? "Anne Frank" : key || null;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function extractBoatOccurrences(words, knownBoats) {
  const occurrences = [];
  const wordsByLine = new Map();
  for (const word of words) {
    if (!wordsByLine.has(word.lineKey)) wordsByLine.set(word.lineKey, []);
    wordsByLine.get(word.lineKey).push(word);
  }
  for (const rowWords of wordsByLine.values()) {
    rowWords.sort((left, right) => left.x - right.x);
    const fullLine = rowWords.map((word) => word.text).join(" ");
    if (/\bREPLAC(?:E|ES|ED|ING)\b/i.test(fullLine)) continue;
    for (let start = 0; start < rowWords.length; start += 1) {
      for (let length = 1; length <= Math.min(3, rowWords.length - start); length += 1) {
        const selected = rowWords.slice(start, start + length);
        const boat = resolveOcrBoatName(selected.map((word) => word.text).join(" "), knownBoats);
        if (!boat) continue;
        const left = Math.min(...selected.map((word) => word.x));
        const right = Math.max(...selected.map((word) => word.x + word.width));
        const top = Math.min(...selected.map((word) => word.y));
        const bottom = Math.max(...selected.map((word) => word.y + word.height));
        if (!occurrences.some((item) => item.boat === boat && Math.abs(item.centerX - (left + right) / 2) < 35
          && Math.abs(item.centerY - (top + bottom) / 2) < 20)) {
          occurrences.push({ boat, text: selected.map((word) => word.text).join(" "), centerX: (left + right) / 2, centerY: (top + bottom) / 2 });
        }
        break;
      }
    }
  }
  return occurrences;
}

export function resolveOcrBoatName(text, knownBoats) {
  const key = normalizeOcrKey(text);
  if (!key || NON_BOAT_LABELS.has(key) || /\bREPLAC(?:E|ES|ED|ING)\b/.test(key)) return null;

  const boatsByKey = new Map(knownBoats.map((name) => [normalizeOcrKey(name), name]));
  const compactKey = key.replaceAll(" ", "");
  const alias = [...BOAT_ALIASES].find(([aliasKey]) => {
    const compactAlias = aliasKey.replaceAll(" ", "");
    return key === aliasKey || key.startsWith(`${aliasKey} `)
      || new RegExp(`^${compactAlias}(?:\\d{1,3}(?:MIN|MI|MIR|MN))?$`).test(compactKey);
  });
  const aliasTarget = alias?.[1];
  if (aliasTarget && boatsByKey.has(aliasTarget)) return boatsByKey.get(aliasTarget);

  for (const [boatKey, name] of boatsByKey) {
    const compactBoat = boatKey.replaceAll(" ", "");
    if (key === boatKey || key.startsWith(`${boatKey} `)
      || new RegExp(`^${compactBoat}(?:\\d{1,3}(?:MIN|MI|MIR|MN))$`).test(compactKey)) return name;
  }

  // OCR commonly truncates the final word ("Russian S") or confuses its last
  // few characters ("RussianSv"). Only apply this to substantial labels so
  // short schedule codes cannot accidentally become boat names.
  const compact = compactKey;
  if (compact.length < 6 || key.split(" ").length > 3) return null;
  let best = null;
  for (const [boatKey, name] of boatsByKey) {
    const boatCompact = boatKey.replaceAll(" ", "");
    const common = commonPrefixLength(compact, boatCompact);
    if (common < 7) continue;
    const score = common / Math.max(compact.length, boatCompact.length);
    if (!best || score > best.score) best = { name, score };
  }
  return best?.score >= 0.55 ? best.name : null;
}

export function parseOcrTsvLines(tsv) {
  const grouped = new Map();
  for (const word of parseOcrTsvWords(tsv)) {
    if (!grouped.has(word.lineKey)) grouped.set(word.lineKey, []);
    grouped.get(word.lineKey).push(word);
  }
  return [...grouped.values()].map((words) => {
    words.sort((a, b) => a.x - b.x);
    const left = Math.min(...words.map((word) => word.x));
    const top = Math.min(...words.map((word) => word.y));
    const right = Math.max(...words.map((word) => word.x + word.width));
    const bottom = Math.max(...words.map((word) => word.y + word.height));
    return { text: words.map((word) => word.text).join(" "), centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
  }).sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
}

export function parseOcrTsvWords(tsv) {
  const words = [];
  for (const row of String(tsv).split(/\r?\n/).slice(1)) {
    const columns = row.split("\t");
    if (columns.length < 12 || columns[0] !== "5" || !columns[11]?.trim()) continue;
    const x = Number(columns[6]);
    const y = Number(columns[7]);
    const width = Number(columns[8]);
    const height = Number(columns[9]);
    words.push({
      text: columns[11].trim(), x, y, width, height,
      centerX: x + width / 2,
      centerY: y + height / 2,
      lineKey: `${columns[1]}:${columns[2]}:${columns[3]}:${columns[4]}`,
    });
  }
  return words;
}

function normalizeOcrKey(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function commonPrefixLength(left, right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}

function nearbyTimes(occurrence, timeLines) {
  return timeLines.filter((line) => Math.abs(line.centerX - occurrence.centerX) <= 190);
}

function nearestBoatOccurrence(line, occurrences) {
  let best = null;
  for (const occurrence of occurrences) {
    const xDistance = Math.abs(occurrence.centerX - line.centerX);
    const yDistance = Math.abs(occurrence.centerY - line.centerY);
    if (xDistance > 210 || yDistance > 260) continue;
    const score = xDistance * 2 + yDistance;
    if (!best || score < best.score) best = { ...occurrence, score };
  }
  return best;
}

function extractPlanningTime(text) {
  const match = String(text).match(/\b([0-2]?\d)[:.]([0-5]\d)\b/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function normalizeTimelineTimeLines(lines) {
  const normalized = [];
  for (const line of lines) {
    let time = line.time;
    const [hour, minute] = time.split(":").map(Number);
    const previous = [...normalized].reverse().find((candidate) => candidate.centerY < line.centerY
      && Math.abs(candidate.centerX - line.centerX) <= 190);
    if (previous && hour >= 1 && hour <= 3) {
      const previousMinutes = timeToMinutes(previous.time);
      const candidates = [hour + 18, hour + 20].filter((candidate) => candidate <= 23)
        .map((candidate) => ({ value: `${String(candidate).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, minutes: candidate * 60 + minute }))
        .filter((candidate) => candidate.minutes >= previousMinutes && candidate.minutes - previousMinutes <= 180)
        .sort((left, right) => left.minutes - right.minutes);
      if (candidates.length && previousMinutes >= 15 * 60) time = candidates[0].value;
    }
    normalized.push({ ...line, time });
  }
  return normalized;
}

function timeToMinutes(value) {
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
}

function deduplicateItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = [item.boat, item.eventType, item.startTime, item.endTime, item.to, item.notes].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
