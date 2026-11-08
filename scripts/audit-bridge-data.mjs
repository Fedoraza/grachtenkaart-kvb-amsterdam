import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { enrichMissingBridgeClearances } from '../server/bridge-enrichment.mjs'

// Run against complete source snapshots, never against a partial API page.
export function auditBridgeData(municipal, openings, bridges) {
  for (const source of [municipal, openings, bridges]) {
    if (!Array.isArray(source.features) || source.numberMatched > source.features.length) {
      throw new Error('Incomplete bridge source')
    }
  }
  const features = structuredClone(municipal.features)
  for (const feature of features) {
    for (const key of Object.keys(feature.properties)) {
      if (key.startsWith('fis')) delete feature.properties[key]
    }
  }
  enrichMissingBridgeClearances(features, openings.features, bridges.features)
  const rows = features.map(({ properties: p }) => {
    const municipalHeight = p.clearanceNap != null && p.winterWaterLevelNap != null
      ? Number(p.clearanceNap) - Number(p.winterWaterLevelNap) : null
    const height = municipalHeight > 0 ? municipalHeight : p.fisClearanceMeters ?? null
    const width = p.passageWidth > 0 ? p.passageWidth : p.fisPassageWidthMeters ?? null
    return {
      number: p.number, name: p.name, type: p.bridgeType,
      heightMeters: height, widthMeters: width,
      heightSource: municipalHeight > 0 ? 'Gemeente Amsterdam (winterpeil)' : p.fisSourceUrl,
      widthSource: p.passageWidth > 0 ? 'Gemeente Amsterdam' : p.fisWidthSourceUrl,
      status: height && width ? 'Hoogte en breedte beschikbaar'
        : height ? 'Breedte ontbreekt' : width ? 'Hoogte ontbreekt' : 'Hoogte en breedte ontbreken',
    }
  })
  const counts = (items) => ({
    total: items.length,
    withHeight: items.filter((row) => row.heightMeters > 0).length,
    withWidth: items.filter((row) => row.widthMeters > 0).length,
    complete: items.filter((row) => row.heightMeters > 0 && row.widthMeters > 0).length,
  })
  return { rows, summary: { all: counts(rows), movable: counts(rows.filter((row) => /beweeg/i.test(row.type))) } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [municipalPath, openingsPath, bridgesPath, outputPath] = process.argv.slice(2)
  if (!outputPath) throw new Error('Usage: node scripts/audit-bridge-data.mjs municipal.json openings.json bridges.json output.csv')
  const { rows, summary } = auditBridgeData(...[municipalPath, openingsPath, bridgesPath].map((path) => JSON.parse(readFileSync(path, 'utf8'))))
  const columns = Object.keys(rows[0] || {})
  const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  writeFileSync(outputPath, [columns, ...rows.map((row) => columns.map((column) => row[column]))].map((row) => row.map(csv).join(',')).join('\n') + '\n')
  console.log(JSON.stringify(summary, null, 2))
}
