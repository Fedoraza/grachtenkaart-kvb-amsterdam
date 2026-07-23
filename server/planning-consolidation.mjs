export function consolidateDayPlanning(items) {
  const groups = new Map();
  for (const item of items) {
    const key = `${item.group_location || item.from_location || ""}\0${item.boat_id || item.boat_name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()].flatMap((rows) => ensureHarbourBoundaries(consolidateBoatDay(rows)))
    .sort((left, right) => displayTimeValue(left.start_time) - displayTimeValue(right.start_time) || String(left.boat_name).localeCompare(String(right.boat_name)));
}

function ensureHarbourBoundaries(rows) {
  const structural = rows.filter((item) => item.event_type !== "shift" && interval(item));
  if (!structural.length) return rows;
  const anchor = Math.min(...structural.map((item) => interval(item).start));
  const base = structural[0];
  const result = [...rows];
  const hasDeparture = structural.some((item) => item.event_type === "preparation" && /HARB/i.test(item.from_location || ""));
  if (!hasDeparture) {
    result.push({ ...inferred(base, 900, "preparation", anchor - 75, anchor - 60, "Harbour departure inferred from first schedule row"), from_location: "E-Harbour" });
    result.push({ ...inferred(base, 901, "movement", anchor - 60, anchor, "Sail to scheduled location · inferred from first schedule row"),
      from_location: "E-Harbour", to_location: base.group_location || base.from_location });
  }
  const hasReturn = structural.some((item) => item.event_type === "movement" && /HARB/i.test(item.to_location || ""));
  if (!hasReturn) {
    const finalEnd = Math.max(...structural.map((item) => intervalAfter(item, anchor).end));
    result.push({ ...inferred(base, 902, "movement", finalEnd, finalEnd + 60, "Return to E-Harbour inferred after final visible row"),
      from_location: base.group_location || base.from_location, to_location: "E-Harbour" });
  }
  return result;
}

function consolidateBoatDay(rows) {
  const breaks = rows.filter((item) => item.event_type === "break" && interval(item));
  const skippers = rows.filter((item) => item.role === "skipper" && interval(item));
  const structural = rows.filter((item) => item.event_type !== "shift");
  if (!structural.length && skippers.length) return inferScheduleFromCrew(rows, skippers);
  if (structural.some((item) => /Exact from source image/i.test(item.notes || ""))) return rows;
  if (breaks.length < 3 || !skippers.length || rows.some((item) => item.event_type === "private")) return rows;

  const breakDurations = breaks.map((item) => interval(item).end - interval(item).start).filter((duration) => duration >= 10 && duration <= 40);
  const breakMinutes = mostCommon(breakDurations.map((duration) => duration <= 25 ? 20 : 30));
  if (!breakMinutes) return rows;
  const anchor = Math.min(...breaks.map((item) => interval(item).start));
  const operationEnd = Math.max(...skippers.map((item) => intervalAfter(item, anchor).end));
  if (operationEnd - anchor < 3 * 60 || operationEnd - anchor > 18 * 60) return rows;

  const cycle = 60 + breakMinutes;
  const lastBreakStart = operationEnd - 60 - breakMinutes;
  const base = breaks.sort((left, right) => Number(right.received_at || 0) - Number(left.received_at || 0))[0];
  const rebuilt = rows.filter((item) => {
    const value = intervalAfter(item, anchor);
    return !value || !["break", "tour"].includes(item.event_type) || value.start < anchor || value.start >= operationEnd;
  });

  let sequence = 0;
  for (let start = anchor; start <= lastBreakStart + 2; start += cycle) {
    const breakEnd = start + breakMinutes;
    rebuilt.push(inferred(base, sequence++, "break", start, breakEnd, `${breakMinutes} min break · joined image parts`));
    const tourEnd = breakEnd + 60;
    if (tourEnd < operationEnd) rebuilt.push(inferred(base, sequence++, "tour", breakEnd, tourEnd, "60 min tour · joined image parts"));
  }

  const finalEventEnd = Math.max(...rebuilt.filter((item) => ["break", "tour"].includes(item.event_type))
    .map((item) => intervalAfter(item, anchor)?.end || anchor));
  const hasReturn = rows.some((item) => item.event_type === "movement" && /HARB/i.test(item.to_location || "")
    && intervalAfter(item, anchor)?.end <= operationEnd + 30);
  if (!hasReturn && operationEnd - finalEventEnd >= 10) {
    rebuilt.push({ ...inferred(base, sequence++, "movement", finalEventEnd, operationEnd, "Return to E-Harbour · joined image parts"),
      from_location: base.group_location || base.from_location, to_location: "E-Harbour" });
  }
  return rebuilt;
}

function inferScheduleFromCrew(rows, skippers) {
  const start = Math.min(...skippers.map((item) => interval(item).start));
  const end = Math.max(...skippers.map((item) => intervalAfter(item, start).end));
  if (end - start < 3 * 60 || end - start > 18 * 60) return rows;
  const base = skippers[0];
  const location = base.group_location || base.from_location || null;
  const generated = [
    { ...inferred(base, 0, "preparation", start, start + 15, "Inferred from crew shift"), from_location: "E-Harbour" },
    { ...inferred(base, 1, "movement", start + 15, start + 75, "Sail to scheduled location · inferred from crew shift"), from_location: "E-Harbour", to_location: location },
  ];
  let sequence = 2;
  const returnStart = end - 60;
  for (let breakStart = start + 75; breakStart + 20 <= returnStart; breakStart += 80) {
    generated.push(inferred(base, sequence++, "break", breakStart, breakStart + 20, "20 min break · inferred from crew shift"));
    if (breakStart + 80 <= returnStart) generated.push(inferred(base, sequence++, "tour", breakStart + 20, breakStart + 80, "60 min tour · inferred from crew shift"));
  }
  const last = generated.filter((item) => ["break", "tour"].includes(item.event_type)).at(-1);
  const finalStart = last ? intervalAfter(last, start).end : start + 75;
  if (returnStart - finalStart >= 50) generated.push(inferred(base, sequence++, "tour", finalStart, returnStart, "Tour · inferred from crew shift"));
  generated.push({ ...inferred(base, sequence, "movement", returnStart, end, "Return to E-Harbour · inferred from crew shift"),
    from_location: location, to_location: "E-Harbour" });
  return [...rows, ...generated];
}

function inferred(base, sequence, eventType, start, end, notes) {
  return { ...base, id: `joined:${base.boat_name}:${start}:${eventType}:${sequence}`, event_type: eventType,
    start_time: clock(start), end_time: clock(end), person_name: null, role: null, notes };
}

function interval(item) {
  if (!item.start_time || !item.end_time) return null;
  const start = timeValue(item.start_time);
  let end = timeValue(item.end_time);
  if (end <= start) end += 24 * 60;
  return { start, end };
}

function intervalAfter(item, anchor) {
  const value = interval(item);
  if (!value) return null;
  while (value.start < anchor - 4 * 60) { value.start += 24 * 60; value.end += 24 * 60; }
  return value;
}

function timeValue(value) {
  if (!value) return Infinity;
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
}

function displayTimeValue(value) {
  const minutes = timeValue(value);
  return minutes < 4 * 60 ? minutes + 24 * 60 : minutes;
}

function clock(minutes) {
  const value = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function mostCommon(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] || null;
}
