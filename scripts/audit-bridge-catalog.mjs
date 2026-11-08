import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { combineBridgeSources } from '../server/bridge-catalog.mjs'
import { distanceToBridge } from '../server/bridge-enrichment.mjs'

const [input,output,...flags]=process.argv.slice(2)
if(!input||!output)throw Error('Usage: node scripts/audit-bridge-catalog.mjs source-directory output-directory [--write-cache]')
const read=name=>JSON.parse(readFileSync(join(input,name+'.json'),'utf8'))
const source={municipal:read('municipal'),fixed:read('fixed'),bridges:read('brug'),openings:read('opening')}
const catalog=combineBridgeSources(source.municipal,source.fixed,{bridges:source.bridges.features,openings:source.openings.features})
const municipal=catalog.features.filter(f=>!String(f.properties.number).startsWith('FIS-'))
const nearMunicipal=catalog.features.filter(f=>String(f.properties.number).startsWith('FIS-')).flatMap(f=>{
  const nearby=municipal.map(m=>({number:m.properties.number,name:m.properties.name,distanceMeters:distanceToBridge(m.geometry,f.geometry.coordinates)})).filter(m=>m.distanceMeters<=15).sort((a,b)=>a.distanceMeters-b.distanceMeters)
  return nearby.length?[{fisId:f.properties.fisBridgeId,name:f.properties.name,nearby:nearby.map(n=>({...n,distanceMeters:Math.round(n.distanceMeters*10)/10}))}]:[]
})
const rows=catalog.features.map(({properties:p,geometry})=>({number:p.number,name:p.name,source:p.source,geometry:geometry?.type||'missing',fisIds:(p.fisBridgeIds||[]).join(';'),openings:p.fisOpenings?.length||0,heightMeters:p.clearanceNap!=null&&p.winterWaterLevelNap!=null?p.clearanceNap-p.winterWaterLevelNap:p.fisClearanceMeters??null,widthMeters:p.passageWidth??p.fisPassageWidthMeters??null,sourceUrl:p.fisBridgeSourceUrl||p.sourceUrl}))
const summary={date:'2026-11-07',bounds:[4.65,52.20,5.15,52.50],...catalog.sourceCoverage,totalBridges:catalog.features.length,withHeight:rows.filter(r=>r.heightMeters>0).length,withWidth:rows.filter(r=>r.widthMeters>0).length,missingGeometry:rows.filter(r=>r.geometry==='missing'),nearbyDistinctIdentities:nearMunicipal,sourceHashes:Object.fromEntries(['municipal','fixed','brug','opening'].map(n=>[n,createHash('sha256').update(readFileSync(join(input,n+'.json'))).digest('hex')]))}
mkdirSync(output,{recursive:true})
writeFileSync(join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n')
writeFileSync(join(output,'rws-coverage.json'),JSON.stringify(catalog.audit,null,2)+'\n')
const columns=Object.keys(rows[0]);const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"'
writeFileSync(join(output,'bridges.csv'),[columns,...rows.map(r=>columns.map(k=>r[k]))].map(r=>r.map(csv).join(',')).join('\n')+'\n')
if(flags.includes('--write-cache')) {
  const {audit,...cache}=catalog
  writeFileSync('data/amsterdam-bridges-v6.json.tmp',JSON.stringify(cache))
  renameSync('data/amsterdam-bridges-v6.json.tmp','data/amsterdam-bridges-v6.json')
}
console.log(JSON.stringify({totalBridges:summary.totalBridges,fisRepresented:summary.fisRepresented,fisAdded:summary.fisAdded,fisMatched:summary.fisMatched,nearbyDistinctIdentities:nearMunicipal.length,withHeight:summary.withHeight,withWidth:summary.withWidth,missingGeometry:summary.missingGeometry.length}))
