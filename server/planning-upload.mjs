import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import { parseLanePlanningItems, parseOcrTsvLines, parseTimelinePlanningItems, resolveOcrBoatName } from "./planning-image.mjs";
import { detectLocationStaffRole, parseLocationRosterCards, parseStaffingPlanning } from "./planning-staff.mjs";

const imageDirectory = process.env.PLANNING_IMAGE_DIRECTORY || join(process.cwd(), "data", "planning-images");
const supportedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

let workerPromise;
let recognitionQueue = Promise.resolve();

export async function analyzePlanningImage(dataUrl, knownBoats, contextText = "") {
  const { buffer, mimeType, extension } = decodeImage(dataUrl);
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) throw validationError("The uploaded file is not a readable image");
  if (metadata.width * metadata.height > 40_000_000) throw validationError("The image dimensions are too large");

  const resizeOptions = {
    width: metadata.width < 500 ? Math.min(1800, metadata.width * 6)
      : metadata.width < 900 ? Math.min(1800, metadata.width * 3) : 2200,
    height: 2200,
    fit: "inside",
    withoutEnlargement: false,
  };
  const prepared = await sharp(buffer)
    .rotate()
    .resize(resizeOptions)
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1 })
    .png()
    .toBuffer();
  const recognitionResults = [await enqueueRecognition(prepared)];
  // Crew cards use coloured rows and very small type. A high-contrast pass is
  // materially better for SL/H codes and compact HHMM ranges, while the normal
  // pass remains better for names. Pick the pass with the strongest planning
  // signal rather than trusting one OCR rendering unconditionally.
  const firstPassText = String(recognitionResults[0]?.data?.text || "");
  const looksLikeCrewRoster = /\b(?:S[1L]|SP1|SD|I?H[- ]?T|PHO|HEX?\d*)\b[\s|:-]*\d{1,2}:?\d{2}/i.test(firstPassText);
  if (metadata.width < 700 && (metadata.width > metadata.height || looksLikeCrewRoster)) {
    const highContrast = await sharp(buffer).rotate()
      .resize({ width: Math.min(1800, metadata.width * 8), fit: "inside", withoutEnlargement: false })
      .grayscale().normalize().threshold(175).png().toBuffer();
    recognitionResults.push(await enqueueRecognition(highContrast));
  }
  const requestedLocationRole = detectLocationStaffRole(contextText) || detectLocationStaffRole(firstPassText, recognitionResults[0]?.data?.tsv || "");
  if (requestedLocationRole && metadata.width < 900) {
    // OPS/Kade cards are tiny, wide roster images. Reading the entire card as
    // one block preserves names split across coloured rows much better than
    // sparse-text OCR, which previously produced fragments such as "Var Zijp".
    const rosterPass = await sharp(buffer).rotate()
      .resize({ width: Math.min(1920, metadata.width * 8), fit: "inside", withoutEnlargement: false })
      .grayscale().normalize().threshold(190).png().toBuffer();
    recognitionResults.push(await enqueueRecognition(rosterPass, PSM.SINGLE_BLOCK));
  }
  // OPS cards benefit from a thresholded single-block pass; Kade cards have
  // thinner type where the normalized first pass preserves names better.
  const result = requestedLocationRole === "ops" ? recognitionResults.at(-1)
    : requestedLocationRole === "kade" ? recognitionResults[0]
      : recognitionResults.sort((left, right) => ocrPlanningScore(right.data) - ocrPlanningScore(left.data))[0];
  const ocrText = String(result.data.text || "").trim();
  const tsv = result.data.tsv || "";
  if (!ocrText) throw validationError("No readable text was found in this image");
  const text = [String(contextText || "").trim(), ocrText].filter(Boolean).join("\n");

  // Pass only genuine message context here. OCR text is already represented by
  // TSV; feeding it twice made fragments such as "Rs ier" act like a boat
  // caption and created crew/schedules for boats that were never planned.
  const staffingInput = [ocrText, String(contextText || "").trim()].filter(Boolean).join("\n");
  const staffing = looksLikeCrewRoster
    ? parseStaffingPlanning(staffingInput, "", knownBoats, contextText)
    : parseStaffingPlanning(staffingInput, tsv, knownBoats, contextText);
  const locationRosterRole = requestedLocationRole || detectLocationStaffRole(ocrText, tsv);
  let recognizedStaff = staffing.staff;
  if (locationRosterRole) {
    const locationCards = parseLocationRosterCards(ocrText, locationRosterRole);
    const placeholder = "LOCATION STAFF";
    const roster = parseStaffingPlanning(ocrText, "", [...knownBoats, placeholder], placeholder).items
      .filter((item) => item.eventType === "shift" && item.person)
      .map((item) => ({ role: locationRosterRole, person: item.person, startTime: item.startTime, endTime: item.endTime,
        notes: item.startTime && item.endTime ? `${item.startTime}-${item.endTime}` : null }));
    const recognizedRoster = locationCards.length ? locationCards : roster;
    if (recognizedRoster.length) recognizedStaff = [...staffing.staff.filter((item) => item.role !== locationRosterRole), ...recognizedRoster];
  }
  const laneItems = parseLanePlanningItems(tsv, knownBoats);
  const timeline = laneItems.length ? laneItems : parseTimelinePlanningItems(tsv, knownBoats);
  const simpleRows = extractSimpleScheduleRows(tsv, knownBoats, [...timeline, ...staffing.items]);
  const items = deduplicate([...timeline, ...staffing.items, ...simpleRows]);
  const hash = createHash("sha256").update(buffer).digest("hex");
  mkdirSync(imageDirectory, { recursive: true });
  const imagePath = join(imageDirectory, `${hash}.${extension}`);
  if (!existsSync(imagePath)) writeFileSync(imagePath, buffer);

  return {
    imageHash: hash,
    imagePath,
    mimeType,
    text,
    tsv,
    suggestedDate: findDate(text),
    items,
    staff: deduplicate(recognizedStaff),
    summary: describeResult(items, recognizedStaff, text),
  };
}

function ocrPlanningScore(data) {
  const text = String(data?.text || "");
  const times = text.match(/\b(?:[0-2]?\d[:.]?[0-5]\d)\b/g)?.length || 0;
  const roles = text.match(/\b(?:SL|S1|51|SOLO|HEX?\d*|HOST|FSK[AD]?|O[|ILT1]*[DTA]?)\b/gi)?.length || 0;
  const names = text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/g)?.length || 0;
  return times * 8 + roles * 6 + names;
}

function decodeImage(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) throw validationError("image must be a base64 data URL");
  const mimeType = match[1].toLowerCase();
  const extension = supportedTypes.get(mimeType);
  if (!extension) throw validationError("Only JPEG, PNG, and WebP images are supported");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length) throw validationError("The uploaded image is empty");
  if (buffer.length > 12 * 1024 * 1024) throw validationError("The image must be 12 MB or smaller");
  return { buffer, mimeType, extension };
}

function enqueueRecognition(image, pageSegMode = PSM.SPARSE_TEXT) {
  const recognition = recognitionQueue.then(async () => {
    const worker = await getWorker();
    await worker.setParameters({ tessedit_pageseg_mode: pageSegMode, preserve_interword_spaces: "1" });
    return worker.recognize(image, {}, { tsv: true });
  });
  recognitionQueue = recognition.catch(() => {});
  return recognition;
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, { logger: () => {} }).then(async (worker) => {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
      return worker;
    });
  }
  return workerPromise;
}

function findDate(text) {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const european = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  return european ? `${european[3]}-${european[2].padStart(2, "0")}-${european[1].padStart(2, "0")}` : null;
}

function deduplicate(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = [item.boat, item.eventType, item.role, item.person, item.startTime, item.endTime, item.from, item.to, item.notes]
      .map((value) => String(value || "").toUpperCase()).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractSimpleScheduleRows(tsv, knownBoats, existingItems) {
  const lines = parseOcrTsvLines(tsv);
  const timeLines = lines.flatMap((line) => [...line.text.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)]
    .map((match) => ({ ...line, time: `${match[1].padStart(2, "0")}:${match[2]}` })));
  const existingBoats = new Set(existingItems.map((item) => item.boat));
  const result = [];
  for (const line of lines) {
    const boat = resolveOcrBoatName(line.text, knownBoats);
    if (!boat || existingBoats.has(boat)) continue;
    const nearby = timeLines.filter((candidate) => Math.abs(candidate.centerX - line.centerX) <= 260
      && Math.abs(candidate.centerY - line.centerY) <= 300)
      .sort((left, right) => left.centerY - right.centerY);
    const sameLine = nearby.filter((candidate) => candidate.centerY === line.centerY);
    const before = [...nearby].reverse().find((candidate) => candidate.centerY < line.centerY);
    const after = nearby.filter((candidate) => candidate.centerY > line.centerY);
    const start = sameLine[0] || before || after[0];
    const end = sameLine[1] || (start === before ? after[0] : after.find((candidate) => candidate !== start));
    if (!start) continue;
    result.push({ boat, eventType: "tour", startTime: start.time, endTime: end?.time || null });
  }
  return result;
}

function describeResult(items, staff, text) {
  const boats = [...new Set(items.map((item) => item.boat).filter(Boolean))];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!items.length && !staff.length) {
    return `I found ${lines.length} line${lines.length === 1 ? "" : "s"} of text, but no schedule rows matched a boat in the fleet.`;
  }
  const parts = [`I found ${items.length} boat schedule row${items.length === 1 ? "" : "s"}`];
  if (boats.length) parts.push(`for ${boats.join(", ")}`);
  if (staff.length) parts.push(`and ${staff.length} location staff assignment${staff.length === 1 ? "" : "s"}`);
  return `${parts.join(" ")}. Review the recognized values before importing.`;
}

function validationError(message) {
  const error = new Error(message);
  error.name = "PlanningValidationError";
  return error;
}
