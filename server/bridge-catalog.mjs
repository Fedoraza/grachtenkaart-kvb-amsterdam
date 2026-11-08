import { enrichMissingBridgeClearances, distanceToBridge, loadFisBridgeData } from './bridge-enrichment.mjs'

export const BRIDGE_CATALOG_VERSION = 6
export const MUNICIPAL_BRIDGE_BASE = 'https://api.data.amsterdam.nl/v1/civieleconstructies/v1'
export const FIS_BRIDGE_BASE = 'https://geo.rijkswaterstaat.nl/services/ogc/gdr/fis_vnds/ogc/features/v1/collections'
const finite = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null
const positive = v => finite(v) > 0 ? Number(v) : null
const nameKey = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\(brug\s*\d+\)/g,'').replace(/\b(?:vaste?|beweegbare?)\s+/g,'').replace(/brug/g,'').replace(/[^a-z0-9]/g,'')
const municipalNumber = s => /^BRU0*(\d+)$/i.exec(s||'')?.[1]
const fisNumber = s => /\bbrug\s*0*(\d+)\b/i.exec(s||'')?.[1]
const point = f => f.geometry?.type === 'Point' && f.geometry.coordinates?.length >= 2 && f.geometry.coordinates.every(Number.isFinite)
const openingDto = f => ({ id:f.properties.id, name:f.properties.name, type:f.properties.type,
  coordinates:f.geometry.coordinates, heightMeters:positive(f.properties.clearanceheightclosed)<50?positive(f.properties.clearanceheightclosed):null,
  widthMeters:positive(f.properties.width), sourceUrl:`${FIS_BRIDGE_BASE}/opening/items/${encodeURIComponent(f.id)}?f=json` })

export function combineBridgeSources(municipal, fixed, fis, now=Date.now()) {
  for(const source of [municipal,fixed,{features:fis.bridges},{features:fis.openings}]) if(!Array.isArray(source.features)||Number(source.numberMatched)>source.features.length) throw Error('Incomplete bridge source')
  const fixedByNumber=new Map(fixed.features.filter(f=>f.properties?.objectnummer).map(f=>[f.properties.objectnummer,f]))
  const features=[];const numbers=new Map();const geometries=new Map()
  const normalize=(f,details=f)=>({type:'Feature',id:f.id,geometry:f.geometry,properties:{
    name:details.properties?.objectnaam||f.properties?.objectnaam||details.properties?.openbareruimte||'Naam onbekend',number:f.properties?.objectnummer||null,
    clearanceNap:finite(details.properties?.doorvaarthoogte),clearanceAt4mNap:finite(details.properties?.brughoogteBij4M),passageWidth:positive(details.properties?.doorvaartbreedte),winterWaterLevelNap:finite(details.properties?.waterpeilwinter),
    bridgeType:details.properties?.typebrug||f.properties?.type||f.properties?.nenTypeBeheerobject||null,route:details.properties?.hoofdvaarroute||details.properties?.waterobject||null,updatedAt:details.properties?.lastupdate||null,
    source:'Gemeente Amsterdam',sourceUrl:`${MUNICIPAL_BRIDGE_BASE}/${String(f.id||'').startsWith('brug_vast.')?'brug_vast':'brug'}?_format=geojson`,
  }})
  let municipalDuplicates=0
  for(const f of [...municipal.features,...fixed.features]) {
    const number=f.properties?.objectnummer
    const geometry=JSON.stringify(f.geometry)
    const duplicate=number?numbers.get(number):geometries.get(geometry)
    if(duplicate){municipalDuplicates++;continue}
    const normalized=normalize(f,fixedByNumber.get(number)||f)
    features.push(normalized)
    if(number)numbers.set(number,normalized)
    if(f.geometry)geometries.set(geometry,normalized)
  }
  const municipalCount=features.length
  const coverage=[]
  const seenFis=new Set()
  const excluded=[]
  for(const bridge of fis.bridges) {
    const p=bridge.properties||{}
    if(p.condition!=='CONSTRUCTED'||!point(bridge)){excluded.push({id:p.id,name:p.name,reason:p.condition!=='CONSTRUCTED'?'not-constructed':'invalid-geometry'});continue}
    if(seenFis.has(p.id))throw Error(`Duplicate FIS bridge identity ${p.id}`)
    seenFis.add(p.id)
    const nr=fisNumber(p.name)
    const nearby=features.slice(0,municipalCount).filter(f=>distanceToBridge(f.geometry,bridge.geometry.coordinates)<=80)
    const numbered=nr?nearby.filter(f=>municipalNumber(f.properties.number)===nr):[]
    const named=nearby.filter(f=>(!nr || !municipalNumber(f.properties.number) || municipalNumber(f.properties.number)===nr)&&nameKey(f.properties.name).length>=4&&[nameKey(f.properties.name),nameKey(f.properties.name)+nameKey(p.city)].includes(nameKey(p.name))&&distanceToBridge(f.geometry,bridge.geometry.coordinates)<=40)
    const candidates=numbered.length?numbered:named
    let target=candidates.length===1?candidates[0]:null
    // Never merge by proximity alone: adjacent rail and road bridges are distinct.
    const match=target?'matched':candidates.length>1?'ambiguous-added':'added'
    if(!target){target={type:'Feature',id:`rws-bridge-${p.id}`,geometry:bridge.geometry,properties:{name:p.name||'Naam onbekend',number:`FIS-${p.id}`,bridgeType:p.canopen==='Yes'?'Beweegbare brug':p.canopen==='No'?'Vaste brug':'Type onbekend',source:'Rijkswaterstaat FIS'}};features.push(target)}
    const openings=fis.openings.filter(o=>o.properties?.parentid===p.id&&(!o.properties.parentgeotype||o.properties.parentgeotype==='bridge')&&o.properties.condition==='CONSTRUCTED'&&point(o))
    const sourceUrl=`${FIS_BRIDGE_BASE}/brug/items/${encodeURIComponent(bridge.id)}?f=json`
    const previous=target.properties
    Object.assign(previous,{fisBridgeId:previous.fisBridgeId||p.id,fisBridgeIds:[...(previous.fisBridgeIds||[]),p.id],fisBridgeName:previous.fisBridgeName||p.name,fisBridgeSourceUrl:previous.fisBridgeSourceUrl||sourceUrl,
      fisBridges:[...(previous.fisBridges||[]),{id:p.id,name:p.name,sourceUrl}],fisOpenings:[...(previous.fisOpenings||[]),...openings.map(openingDto)],fisReferenceLevel:previous.fisReferenceLevel||p.referencelevel||null,fisCanOpen:previous.fisCanOpen||p.canopen||null,fisPhone:previous.fisPhone||p.phonenumber||null,fisOperatingTimesId:previous.fisOperatingTimesId||p.operatingtimesid||null})
    coverage.push({fisId:p.id,fisName:p.name,number:target.properties.number,name:target.properties.name,status:match,openingCount:openings.length})
  }
  const enriched=enrichMissingBridgeClearances(features,fis.openings,fis.bridges)
  return {type:'FeatureCollection',catalogVersion:BRIDGE_CATALOG_VERSION,source:'Gemeente Amsterdam Civiele Constructies + Rijkswaterstaat FIS',fetchedAt:now,fisEnrichedCount:enriched,
    sourceCoverage:{municipalRecords:municipal.features.length,fixedRecords:fixed.features.length,municipalBridgeCount:municipalCount,municipalDuplicateRecords:municipalDuplicates,fisRecords:fis.bridges.length,fisOpeningRecords:fis.openings.length,fisRepresented:coverage.length,fisAdded:coverage.filter(r=>r.status!=='matched').length,fisMatched:coverage.filter(r=>r.status==='matched').length,ambiguous:coverage.filter(r=>r.status==='ambiguous-added'),excluded},features,audit:coverage}
}

export async function loadBridgeCatalog(fetcher=fetch) {
  const [municipal,fixed,fis]=await Promise.all([
    loadMunicipal('brug',fetcher),loadMunicipal('brug_vast',fetcher),loadFisBridgeData(fetcher),
  ])
  return combineBridgeSources(municipal,fixed,fis)
}
async function loadMunicipal(table,fetcher) {
  const { readGeoJsonPages } = await import('./bridge-source-pages.mjs')
  return readGeoJsonPages(`${MUNICIPAL_BRIDGE_BASE}/${table}?_format=geojson&page_size=5000`,fetcher)
}
