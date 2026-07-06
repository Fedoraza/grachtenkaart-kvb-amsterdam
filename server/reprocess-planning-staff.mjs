import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { analyzePlanningImage } from "./planning-upload.mjs";

const database = new DatabaseSync(process.env.DATABASE_PATH || join(process.cwd(), "data", "ais.sqlite"));
database.exec("PRAGMA foreign_keys = ON");
const boats = database.prepare("SELECT id, name FROM fleet_boats WHERE active = 1").all();
const boatByName = new Map(boats.map((boat) => [normalize(boat.name), boat]));
const imports = database.prepare(`
  SELECT * FROM planning_imports
  WHERE image_type = 'whatsapp-read-only' AND source_image_path IS NOT NULL
  ORDER BY id
`).all();
let itemCount = 0;
let staffCount = 0;

for (const planningImport of imports) {
  if (!existsSync(planningImport.source_image_path)) continue;
  const extension = extname(planningImport.source_image_path).toLowerCase();
  const mime = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  const image = readFileSync(planningImport.source_image_path).toString("base64");
  let analysis;
  try {
    analysis = await analyzePlanningImage(`data:${mime};base64,${image}`, boats.map((boat) => boat.name), planningImport.source_text || "");
  } catch (error) {
    console.error(`Skipped import ${planningImport.id}: ${error.message}`);
    continue;
  }
  const crew = analysis.items.filter((item) => item.eventType === "shift"
    && ["skipper", "host", "solo"].includes(item.role)
    && credibleName(item.person));
  const locationStaff = analysis.staff.filter((item) => ["runner", "ops", "kade"].includes(item.role)
    && credibleName(item.person));

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("DELETE FROM planning_items WHERE import_id = ? AND event_type = 'shift'").run(planningImport.id);
    database.prepare("DELETE FROM planning_staff WHERE import_id = ?").run(planningImport.id);
    const insertCrew = database.prepare(`
      INSERT INTO planning_items
      (import_id, boat_id, boat_name, service_date, start_time, end_time, person_name, role,
       event_type, from_location, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'shift', ?, ?, ?)
    `);
    for (const item of crew) {
      const boat = boatByName.get(normalize(item.boat));
      if (!boat) continue;
      insertCrew.run(planningImport.id, boat.id, boat.name, planningImport.service_date,
        item.startTime || null, item.endTime || null, item.person, item.role,
        planningImport.location, item.notes || null, Date.now());
      itemCount += 1;
    }
    const insertStaff = database.prepare(`
      INSERT INTO planning_staff
      (import_id, service_date, person_name, role, location, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of locationStaff) {
      insertStaff.run(planningImport.id, planningImport.service_date, item.person, item.role,
        planningImport.location, item.notes || null, Date.now());
      staffCount += 1;
    }
    const count = database.prepare(`
      SELECT (SELECT COUNT(*) FROM planning_items WHERE import_id = ?)
           + (SELECT COUNT(*) FROM planning_staff WHERE import_id = ?) AS count
    `).get(planningImport.id, planningImport.id).count;
    database.prepare("UPDATE planning_imports SET item_count = ? WHERE id = ?").run(count, planningImport.id);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

database.close();
console.log(`Reprocessed ${imports.length} images: ${itemCount} boat crew and ${staffCount} location staff rows.`);

function credibleName(value) {
  const text = String(value || "").trim();
  const words = text.split(/\s+/).filter(Boolean);
  return text.length >= 4 && text.length <= 80 && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(text) && !/^@?\d+$/.test(text)
    && words.every((word) => word.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "").length >= 2);
}

function normalize(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}
