import { boatPhoto } from './boat-photos.mjs'
import websiteEvidence from './operator-website-evidence.json' with { type: 'json' }
import register from './operator-register.json' with { type: 'json' }
export const OPERATOR_REGISTER_SOURCE = { url: register.sourceUrl, updatedAt: register.sourceUpdatedAt, reviewedAt: register.reviewedAt }
export const VESSEL_OPERATORS = [
  { id: 'flagship', name: 'Flagship Amsterdam', website: 'https://flagshipamsterdam.com/', color: '#fb923c', pattern: /^FLAGSHIP(?:AMSTERDAM|\d|$)/ },
  { id: 'lovers', name: 'LOVERS / Lovely Cruises', website: 'https://www.lovers.nl/', color: '#f87171', pattern: /^(?:LOVERS(?:CANALCRUISES|\d|$)|LOVELY(?:CRUISES|\d))/ },
  { id: 'smidtje', name: 'Smidtje', website: 'https://smidtje.nl/', color: '#c084fc', pattern: /^(?:TSMIDTJE|SMIDTJE)(?:\d|$)/ },
  { id: 'stromma', name: 'Stromma', website: 'https://www.stromma.com/en-nl/amsterdam/', color: '#f472b6', pattern: /^STROMMA(?:\d|$)/ },
  { id: 'p-kooij', name: 'Rederij P. Kooij', website: 'https://www.rederijkooij.nl/', color: '#facc15', pattern: /^(?:REDERIJ)?PKOOIJ(?:\d|$)/ },
  { id: 'blue-boat', name: 'Blue Boat Company', website: 'https://www.blueboat.nl/', color: '#38bdf8', pattern: /^BLUEBOAT(?:COMPANY|\d|$)/ },
  { id: 'plas', name: 'Rederij Plas', website: 'https://www.rederijplas.nl/', color: '#4ade80', pattern: /^(?:REDERIJ(?:EE)?PLAS|PLAS\d)/ },
  { id: 'pure-boats', name: 'Pure Boats', website: 'https://pureboats.com/', color: '#2dd4bf', pattern: /^PUREBOATS(?:\d|$)/ },
  { id: 'de-nederlanden', name: 'Rederij de Nederlanden', website: 'https://denederlanden.com/', color: '#fda4af', pattern: /^(?:REDERIJ)?DENEDERLANDEN(?:\d|$)/ },
  { id: 'those-dam-boat-guys', name: 'Those Dam Boat Guys', website: 'https://www.thosedamboatguys.com/', color: '#e879f9', pattern: /^THOSEDAMBOATGUYS(?:\d|$)/ },
  { id: 'kinboat', name: 'KINboat', website: 'https://kinboat.com/', color: '#a3e635', pattern: /^(?:KINBOATS?\d*|KIN12|BOOT2GO17)$/ },
]
// Existing curated MMSI identities; explicit administrator assignments always win.
export const VERIFIED_OPERATOR_MMSIS = {
  '244311331': 'lovers', // Spartacus: user-confirmed Lovely; AIS identity and builder case
  '244086784': 'lovers', // Apollo: user-confirmed Lovely name, matching 10 x 4 m AIS candidate; other Apollos stay separate
  '244002621': 'flagship', // Jobien: explicitly confirmed by application owner, 2026-10-31
  '244830842': 'flagship', // Elisabeth: existing official fleet photo source
  '244780373': 'flagship', // Monne de Miranda
  '244154960': 'flagship', // Pax; do not infer other vessels called Pax
  '244740843': 'flagship', // Tijd zal het leren
  '244180555': 'flagship', // Jan van der Heijden: Flagship campaign case
  '244820184': 'flagship', // Jean Schmitz: Arka customer reference
  '244126390': 'flagship', // Official Roos identity; a different Roos remains unassigned
}
export const operatorById = (id) => VESSEL_OPERATORS.find((operator) => operator.id === id) || null
export const normalizeVesselName = (name) => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export const registeredOperatorNames = (id) => register.entries.filter((entry) => entry.operatorId === id).map((entry) => entry.name)
export function operatorFleetEntries(id) {
  const entries = register.entries.filter((entry) => entry.operatorId === id).map((entry) => ({ ...entry, sourceUrl: register.sourceUrl }))
  for (const evidence of websiteEvidence.filter((entry) => entry.operatorId === id)) {
    const existing = entries.find((entry) => normalizeVesselName(entry.name) === normalizeVesselName(evidence.name))
    if (existing) Object.assign(existing, evidence)
    else entries.push({ ...evidence })
  }
  if (id === 'flagship') entries.push({ name: 'Jobien', operatorId: id, sourceUrl: '/over-boottracker', sourceType: 'owner-confirmed' })
  return entries
}
export const operatorFleetNames = (id) => operatorFleetEntries(id).map((entry) => entry.name)
const ambiguous = new Set(register.ambiguousNames)
const candidatesByName = new Map()
for (const entry of [...register.entries, ...websiteEvidence]) {
  for (const alias of [entry.name, ...(entry.aliases || [])]) {
    const name = normalizeVesselName(alias)
    if (!candidatesByName.has(name)) candidatesByName.set(name, new Set())
    candidatesByName.get(name).add(entry.operatorId)
  }
}
const names = new Map([...candidatesByName].filter(([name, operators]) => !ambiguous.has(name) && operators.size === 1).map(([name, operators]) => [name, [...operators][0]]))
export function inferVesselOperator(vessel, assignments = {}, duplicateNames = new Set()) {
  const mmsi = String(vessel?.mmsi || '')
  if (!/^\d{9}$/.test(mmsi)) return null
  // A saved null deliberately suppresses automatic detection.
  if (Object.hasOwn(assignments, mmsi)) {
    const operator = operatorById(assignments[mmsi])
    return operator ? { id: operator.id, method: 'manual' } : null
  }
  if (VERIFIED_OPERATOR_MMSIS[mmsi]) return { id: VERIFIED_OPERATOR_MMSIS[mmsi], method: 'verified-mmsi' }
  const latitude = Number(vessel.latitude), longitude = Number(vessel.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 52.28 || latitude > 52.45 || longitude < 4.72 || longitude > 5.10) return null
  const name = normalizeVesselName(vessel.name)
  if (!name) return null
  const matches = VESSEL_OPERATORS.filter((operator) => operator.pattern.test(name))
  if (matches.length === 1) return { id: matches[0].id, method: 'brand-name' }
  if (!duplicateNames.has(name) && names.has(name)) return { id: names.get(name), method: 'register-name' }
  return null
}
export function sortOperatorsByBoatCount(operators) {
  return [...operators].sort((a, b) => Number(b.boatCount ?? b.boats?.length ?? b.mmsis?.length ?? operatorFleetEntries(b.operatorId || b.id).length) - Number(a.boatCount ?? a.boats?.length ?? a.mmsis?.length ?? operatorFleetEntries(a.operatorId || a.id).length) || a.name.localeCompare(b.name, 'nl'))
}
export function groupVesselsByOperator(vessels = [], assignments = {}) {
  const byMmsi = new Map(vessels.filter((vessel) => /^\d{9}$/.test(String(vessel.mmsi || ''))).map((vessel) => [String(vessel.mmsi), vessel]))
  const nameCounts = new Map()
  for (const vessel of byMmsi.values()) { const name = normalizeVesselName(vessel.name); nameCounts.set(name, (nameCounts.get(name) || 0) + 1) }
  const duplicates = new Set([...nameCounts].filter(([, count]) => count > 1).map(([name]) => name))
  const groups = VESSEL_OPERATORS.map(({ pattern, ...operator }) => ({ ...operator, mmsis: [], vessels: [] }))
  for (const vessel of byMmsi.values()) {
    const match = inferVesselOperator(vessel, assignments, duplicates)
    if (!match) continue
    const group = groups.find((candidate) => candidate.id === match.id)
    group.mmsis.push(String(vessel.mmsi)); group.vessels.push({ ...vessel, operatorId: match.id, operatorMethod: match.method })
  }
  // Preserve explicit memberships even while a vessel has no current AIS fix.
  for (const [mmsi, operatorId] of Object.entries(assignments)) {
    const group = groups.find((candidate) => candidate.id === operatorId)
    if (/^\d{9}$/.test(mmsi) && group && !group.mmsis.includes(mmsi)) group.mmsis.push(mmsi)
  }
  for (const group of groups) group.mmsis.sort()
  return sortOperatorsByBoatCount(groups)
}

export function buildOperatorDirectories(boats = [], groups = [], overrides = {}) {
  const assignments = Object.fromEntries(groups.flatMap((group) => group.mmsis.map((mmsi) => [mmsi, group.id])))
  const directories = VESSEL_OPERATORS.map((operator) => ({ ...operator, boats: [] }))
  const unassigned = { id: 'unassigned', name: 'Nog niet gekoppeld', boats: [] }
  const seen = new Set()
  for (const boat of boats) {
    const operatorId = Object.hasOwn(overrides, String(boat.mmsi)) ? overrides[String(boat.mmsi)] : assignments[String(boat.mmsi)] || (operatorById(boat.operator_id) ? boat.operator_id : null) || inferVesselOperator({ ...boat.ais, name: boat.name, mmsi: boat.mmsi, latitude: 52.37, longitude: 4.9 })?.id
    const directory = directories.find((item) => item.id === operatorId) || unassigned
    const key = boat.mmsi ? `mmsi:${boat.mmsi}` : `name:${directory.id}:${normalizeVesselName(boat.name)}`
    if (seen.has(key)) continue
    seen.add(key)
    directory.boats.push({ ...boat, operator_id: directory.id === 'unassigned' ? null : directory.id, directoryOnly: false })
  }
  for (const directory of directories) {
    const group = groups.find((item) => item.id === directory.id)
    const candidates = [...(group?.vessels || []).map((vessel) => ({ name: vessel.name || vessel.mmsi, mmsi: vessel.mmsi, ais: vessel })), ...operatorFleetEntries(directory.id)]
    for (const boat of candidates) {
      if (directory.boats.some((item) => boat.mmsi ? String(item.mmsi) === String(boat.mmsi) : [boat.name, ...(boat.aliases || [])].some((alias) => normalizeVesselName(item.name) === normalizeVesselName(alias)))) continue
      directory.boats.push({ ...boat, operator_id: directory.id, id: `directory:${directory.id}:${boat.mmsi || normalizeVesselName(boat.name)}`, directoryOnly: true })
    }
    directory.boats.sort((a, b) => String(a.name).localeCompare(String(b.name), 'nl'))
  }
  for (const directory of directories) {
    const counts = new Map()
    for (const boat of directory.boats) { const name = normalizeVesselName(boat.name); counts.set(name, (counts.get(name) || 0) + 1) }
    directory.boats = directory.boats.map((boat) => ({ ...boat, ...boatPhoto(boat, directory.id, { ambiguousName: counts.get(normalizeVesselName(boat.name)) > 1 }) }))
  }
  return [...sortOperatorsByBoatCount(directories), ...(unassigned.boats.length ? [unassigned] : [])]
}
