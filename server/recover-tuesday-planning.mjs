import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const database = new DatabaseSync(process.env.DATABASE_PATH || join(process.cwd(), "data", "ais.sqlite"));
database.exec("PRAGMA foreign_keys = ON");
const serviceDate = "2026-07-07";
const boats = new Map(database.prepare("SELECT name, id FROM fleet_boats").all().map((boat) => [boat.name, boat.id]));

database.exec("BEGIN IMMEDIATE");
try {
  replaceCrew(91, "BARRACUDA", "Rijksmuseum", [
    ["10:15", "16:00", "Lucas Gallo", "skipper"],
    ["11:45", "16:00", "Celia Garzón", "host"],
    ["15:45", "23:30", "Radboud Groh", "skipper"],
    ["15:45", "23:30", "Julia Impey", "host"],
  ]);
  replaceCrew(93, "NOMAG", "Rijksmuseum", [
    ["13:15", "00:00", "Reinier Brouwer", "skipper"],
    ["14:45", "00:00", "Arnoud Dros", "host"],
  ]);
  replaceCrew(100, "EVE", "Anne Frank", [
    ["12:00", "17:45", "Isabel Bakker", "skipper"],
    ["13:15", "17:45", "Maja Frankiewicz", "host"],
    ["17:30", "00:00", "Floris Boer", "skipper"],
    ["17:30", "00:00", "Agathe Rossot", "host"],
  ]);
  replaceCrew(103, "DIRCK VAN OS", "Anne Frank", [
    ["09:30", "17:45", "Ruben Blokhuis", "skipper"],
    ["10:45", "17:45", "Isis Sriskanthan", "host"],
    ["17:30", "01:15", "Ed van Schaik", "skipper"],
    ["17:30", "01:15", "Antonín Tesař", "host"],
  ]);
  replaceCrew(103, "ATLANTIS", "Anne Frank", [
    ["08:30", "16:30", "Benno Kroenmeijer", "skipper"],
    ["09:45", "16:30", "Jesse Barea", "host"],
    ["16:15", "00:15", "Wouter Klaassen", "skipper"],
    ["16:15", "00:15", "Nora Leurink", "host"],
  ]);

  const externalId = "recovered:2026-07-07:homo:iris:two-parts";
  let planningImport = database.prepare("SELECT id FROM planning_imports WHERE external_message_id = ?").get(externalId);
  if (!planningImport) {
    const result = database.prepare(`
      INSERT INTO planning_imports
      (external_message_id, chat_id, chat_title, sender, received_at, service_date, location,
       source_text, image_type, status, item_count, created_at)
      VALUES (?, 'recovered:homo', 'HOMO 07-07', 'local recovery', ?, ?, 'Homomonument',
       'Recovered IRIS morning and evening source images', 'recovered-source-images', 'imported', 0, ?)
    `).run(externalId, Date.now(), serviceDate, Date.now());
    planningImport = { id: Number(result.lastInsertRowid) };
  }
  database.prepare("DELETE FROM planning_items WHERE import_id = ?").run(planningImport.id);
  database.prepare("DELETE FROM planning_items WHERE service_date = ? AND boat_name = 'ATLANTIS' AND event_type <> 'shift'").run(serviceDate);
  const irisEvents = [
    ["09:00", "09:15", "preparation", "E-Harbour", null],
    ["09:15", "10:15", "movement", "E-Harbour", "Homomonument"],
    ["10:15", "10:40", "break"],
    ["10:40", "11:40", "tour"], ["11:40", "12:00", "break"],
    ["12:00", "13:00", "tour"], ["13:00", "13:20", "break"],
    ["13:20", "14:20", "tour"], ["14:20", "14:40", "break"],
    ["14:40", "15:40", "tour"], ["15:40", "16:00", "break"],
    ["16:00", "17:00", "tour"], ["17:00", "17:20", "break"],
    ["17:20", "18:20", "tour"], ["18:20", "18:40", "break"],
    ["18:40", "19:40", "tour"], ["19:40", "20:00", "break"],
    ["20:00", "21:00", "tour"], ["21:00", "21:20", "break"],
    ["21:20", "22:20", "tour"], ["22:20", "23:45", "movement", "Homomonument", "E-Harbour"],
  ];
  const insertEvent = database.prepare(`
    INSERT INTO planning_items
    (import_id, boat_id, boat_name, service_date, start_time, end_time, event_type,
     from_location, to_location, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Exact from source image parts', ?)
  `);
  const bartoEvents = [
    ["17:15", "17:40", "preparation", "E-Harbour", null],
    ["17:40", "18:40", "movement", "E-Harbour", "Homomonument"],
    ["18:40", "19:00", "break"], ["19:00", "20:00", "tour"],
    ["20:00", "20:20", "break"], ["20:20", "21:20", "tour"],
    ["21:20", "21:40", "break"], ["21:40", "22:40", "tour"],
    ["22:40", "00:00", "movement", "Homomonument", "E-Harbour"],
  ];
  const atlantisEvents = [
    ["08:45", "09:00", "preparation", "E-Harbour", null],
    ["09:00", "10:00", "movement", "E-Harbour", "Anne Frank"],
    ["10:00", "10:30", "break"], ["10:30", "11:30", "tour", "Anne Frank"],
    ["11:30", "12:00", "break"], ["12:00", "13:00", "tour", "Anne Frank"],
    ["13:00", "13:20", "break"], ["13:20", "14:20", "tour", "Anne Frank"],
    ["14:20", "14:40", "break"], ["14:40", "15:40", "tour", "Anne Frank"],
    ["15:40", "16:00", "break"], ["16:00", "17:00", "tour", "Anne Frank"],
    ["17:00", "17:20", "break"], ["17:20", "18:20", "tour", "Anne Frank"],
    ["18:20", "18:40", "break"], ["18:40", "19:40", "tour", "Anne Frank"],
    ["19:40", "20:00", "break"], ["20:00", "21:00", "tour", "Anne Frank"],
    ["21:00", "21:20", "break"], ["21:20", "22:30", "tour", "Anne Frank"],
    ["22:30", "23:00", "break"], ["23:00", "00:00", "tour", "Anne Frank"],
    ["00:00", "01:15", "movement", "Anne Frank", "E-Harbour"],
  ];
  for (const [boatName, events] of [["IRIS", irisEvents], ["BARTOLOTTI", bartoEvents], ["ATLANTIS", atlantisEvents]]) {
    for (const [start, end, type, from = type === "tour" ? "Homomonument" : null, to = null] of events) {
      insertEvent.run(planningImport.id, boats.get(boatName), boatName, serviceDate, start, end, type, from, to, Date.now());
    }
  }
  database.prepare("UPDATE planning_imports SET item_count = ? WHERE id = ?").run(irisEvents.length + bartoEvents.length + atlantisEvents.length, planningImport.id);
  database.exec("COMMIT");
  console.log("Recovered Tuesday schedules and exact crew cards, including ATLANTIS.");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
} finally {
  database.close();
}

function replaceCrew(importId, boatName, location, crew) {
  database.prepare("DELETE FROM planning_items WHERE import_id = ? AND boat_name = ? AND event_type = 'shift'").run(importId, boatName);
  const insert = database.prepare(`
    INSERT INTO planning_items
    (import_id, boat_id, boat_name, service_date, start_time, end_time, person_name, role,
     event_type, from_location, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'shift', ?, 'Exact from crew card image', ?)
  `);
  for (const [start, end, person, role] of crew) insert.run(importId, boats.get(boatName), boatName, serviceDate, start, end, person, role, location, Date.now());
  database.prepare(`UPDATE planning_imports SET item_count =
    (SELECT COUNT(*) FROM planning_items WHERE import_id = ?) + (SELECT COUNT(*) FROM planning_staff WHERE import_id = ?)
    WHERE id = ?`).run(importId, importId, importId);
}
