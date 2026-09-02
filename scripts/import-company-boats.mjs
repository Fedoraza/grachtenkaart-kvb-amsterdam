import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const boats = [
  ["LUCKY STRIPPER", "244005982"],
  ["OLD QUEEN", "244780563"],
  ["ROOS", "244070458"],
  ["THEO KOK", "244850451"],
  ["NOMAG", "244850891"],
  ["VIBE", "244130608"],
  ["EVELINE", "244717092"],
  ["ELISABETH", "244830842"],
  ["FLAGSHIP", "244078764"],
  ["JAN VAN DER HEIJDEN", "244180555"],
  ["RUSSIAN STAR", "244150198"],
  ["PIERRE CUYPERS", "244013586"],
  ["FREEWILLY", "244057574"],
  ["SOFIA", "244070371"],
  ["APSARA", "244090957"],
  ["IRIS", "244820333"],
  ["MEIKE", "244385527"],
  ["PAX", "244154960"],
  ["TIJD ZAL HET LEREN", "244740843"],
  ["WOLK", "244780372"],
  ["BARRACUDA", "244780138"],
  ["AMELIE ZAHRA", "244032287"],
  ["ATLANTIS", "244014141"],
  ["SLOEPVRIENDEN", "244820708"],
  ["SALOONSLOEP", "244236663"],
  ["ZONNE BOOT", "244780034"],
  ["MONNE DE MIRANDA", "244780373"],
  ["DIRCK VAN OS", "244001659"],
  ["GRIFFIOEN", "244070982"],
  ["TITANIC", "244022178"],
  ["STELLA MARIS", "244850452"],
  ["EVE", "244727948"],
  ["FAYEN", "244034442"],
  ["BARTOLOTTI", "244199316"],
  ["SIMON", "244013317"],
  ["MANHATTAN", "244780137"],
  ["GREEN MARINE", "244070951"],
  ["AGATHA", "244130609"],
  ["FLEUR", "244820613"],
  ["DUTCHMAN", "244130638"],
  ["HERMAN BROOD", "244870589"],
  ["JOHANNA", "244740846"],
  ["ROSE", "244615958"],
  ["VORDING", "244130871"],
  ["HARRY SLINGER", "244860579"],
  ["ROYALTY", "244003523"],
  ["MAJESTIC", "244993131"],
  ["CREUSEN-1", "244140377"],
  ["JOBIEN", "244002621"],
];

const databasePath = join(process.cwd(), "data", "ais.sqlite");

if (!existsSync(databasePath)) {
  throw new Error("Fleet database does not exist. Start the app once with `npm run dev`.");
}

const database = new DatabaseSync(databasePath);
const now = Date.now();
const upsert = database.prepare(`
  INSERT INTO fleet_boats (name, mmsi, active, created_at, updated_at)
  VALUES (?, ?, 1, ?, ?)
  ON CONFLICT(mmsi) DO UPDATE SET
    name = excluded.name,
    active = 1,
    updated_at = excluded.updated_at
`);

database.exec("BEGIN");

try {
  for (const [name, mmsi] of boats) {
    upsert.run(name, mmsi, now, now);
  }
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
}

const imported = database.prepare(`
  SELECT name, mmsi
  FROM fleet_boats
  WHERE mmsi IN (${boats.map(() => "?").join(", ")})
  ORDER BY name
`).all(...boats.map(([, mmsi]) => mmsi));

console.log(`Imported ${imported.length} company boats.`);
for (const boat of imported) console.log(`${boat.name} — ${boat.mmsi}`);
