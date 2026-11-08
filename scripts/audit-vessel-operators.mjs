import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { VESSEL_OPERATORS, groupVesselsByOperator, operatorFleetEntries, normalizeVesselName } from '../shared/vessel-operators.mjs'
const databasePath = resolve(process.argv[2] || 'data/ais.sqlite')
const outputDirectory = resolve(process.argv[3] || 'docs/audits/vessel-operators')
const database = new DatabaseSync(databasePath, { readOnly: true })
const vessels = database.prepare('SELECT mmsi, data FROM vessels').all().flatMap((row) => {
  try { return [{ ...JSON.parse(row.data), mmsi: String(row.mmsi) }] } catch { return [] }
})
const hasAssignments = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vessel_operator_assignments'").get()
const assignments = hasAssignments ? Object.fromEntries(database.prepare('SELECT mmsi, operator_id FROM vessel_operator_assignments').all().map((row) => [row.mmsi, row.operator_id])) : {}
database.close()
const groups = groupVesselsByOperator(vessels, assignments)
const matches = new Map(groups.flatMap((group) => group.vessels.map((vessel) => [vessel.mmsi, { operatorId: group.id, method: vessel.operatorMethod }])))
const byName = new Map()
for (const vessel of vessels) {
  const name = normalizeVesselName(vessel.name)
  if (!name) continue
  if (!byName.has(name)) byName.set(name, [])
  byName.get(name).push(vessel)
}
const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
const csv = (rows) => rows.map((row) => row.map(escape).join(',')).join('\n') + '\n'
mkdirSync(outputDirectory, { recursive: true })
const report = [['operator_id', 'boat_name', 'source_url', 'aliases', 'observed_mmsis', 'identity_status']]
for (const operator of VESSEL_OPERATORS) for (const entry of operatorFleetEntries(operator.id)) {
  const observed = [...new Map([entry.name, ...(entry.aliases || [])].flatMap((name) => byName.get(normalizeVesselName(name)) || []).map((vessel) => [vessel.mmsi, vessel])).values()]
  report.push([operator.id, entry.name, entry.sourceUrl, (entry.aliases || []).join(' | '), observed.map((vessel) => vessel.mmsi).join(' | '), observed.length > 1 ? 'multiple MMSIs: verify separately' : observed.length ? 'name candidate; inspect classification' : 'no matching AIS name in snapshot'])
}
writeFileSync(resolve(outputDirectory, 'fleet-source-comparison.csv'), csv(report))
writeFileSync(resolve(outputDirectory, 'all-ais-classifications.csv'), csv([['mmsi', 'name', 'operator_id', 'method', 'position_received_at', 'same_name_mmsis'], ...vessels.map((vessel) => [vessel.mmsi, vessel.name, matches.get(vessel.mmsi)?.operatorId, matches.get(vessel.mmsi)?.method, vessel.sourceReceivedAt || vessel.receivedAt, (byName.get(normalizeVesselName(vessel.name)) || []).map((other) => other.mmsi).join(' | ')])]))
const summary = { generatedAt: new Date().toISOString(), vesselsScanned: vessels.length, catalogEntriesCompared: report.length - 1, duplicateNames: [...byName].filter(([, rows]) => rows.length > 1).length, operators: groups.map((group) => ({ id: group.id, catalogEntries: operatorFleetEntries(group.id).length, classifiedMmsis: group.mmsis.length })), notes: ['AIS name matches are candidates, not ownership proof.', 'Boot2go affiliation and Jobien identity were confirmed by the application owner.', 'Not every operator website publishes individual boat names; absence is not a deletion instruction.', 'This report reads the local AIS snapshot; it does not certify complete live fleet coverage.'] }
writeFileSync(resolve(outputDirectory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
