import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { combineBridgeSources } from './bridge-catalog.mjs'
import { readGeoJsonPages } from './bridge-source-pages.mjs'
const real=JSON.parse(readFileSync(new URL('../src/scripts/fixtures/oosterdok-rws-bridges.json',import.meta.url)))
const empty={type:'FeatureCollection',features:[]}
test('adds RWS-only Oosterdoksspoorbrug with both real openings and stable source identity',()=>{
  const c=combineBridgeSources(empty,empty,real)
  const rail=c.features.find(f=>f.properties.fisBridgeId===38832)
  assert.equal(rail.properties.number,'FIS-38832')
  assert.equal(rail.geometry.type,'Point')
  assert.equal(rail.properties.fisClearanceMeters,5.1)
  assert.deepEqual(rail.properties.fisOpenings.map(o=>o.widthMeters),[17,19])
  assert.notEqual(rail.id,c.features.find(f=>f.properties.fisBridgeId===26960).id)
  assert.equal(c.sourceCoverage.fisRepresented,2)
})
test('matches an existing municipal identity without merging nearby rail and road bridges',()=>{
  const road=real.bridges.find(b=>b.properties.id===26960)
  const municipal={features:[{type:'Feature',id:'municipal-road',geometry:road.geometry,properties:{objectnummer:'BRU2270',objectnaam:'Oosterdoksdraaibrug'}}]}
  const c=combineBridgeSources(municipal,empty,real)
  assert.equal(c.features.length,2)
  assert.equal(c.features[0].id,'municipal-road')
  assert.equal(c.features[0].properties.number,'BRU2270')
  assert.equal(c.sourceCoverage.fisAdded,1)
})
test('keeps numberless municipal objects and excludes unbuilt RWS records',()=>{
  const fixed={features:[{id:'numberless',geometry:{type:'Point',coordinates:[4.9,52.37]},properties:{objectnaam:'Numberless bridge'}}]}
  const unbuilt=structuredClone(real);unbuilt.bridges[0].properties.condition='UNDER_CONSTRUCTION'
  const c=combineBridgeSources(empty,fixed,unbuilt)
  assert.ok(c.features.some(f=>f.id==='numberless'))
  assert.equal(c.sourceCoverage.excluded.length,1)
})
test('complete pagination follows same-origin next links and rejects silently incomplete sources',async()=>{
  const urls=[]
  const result=await readGeoJsonPages('https://example.test/bridges',async url=>{
    urls.push(url);return{ok:true,json:async()=>url.includes('page=2')?{features:[{id:2}],numberMatched:2}:{features:[{id:1}],numberMatched:2,links:[{rel:'next',href:'?page=2'}]}}
  })
  assert.equal(urls.length,2);assert.equal(result.features.length,2)
  await assert.rejects(()=>readGeoJsonPages('https://example.test/bridges',async()=>({ok:true,json:async()=>({features:[],numberMatched:2})})),/Incomplete/)
  await assert.rejects(()=>readGeoJsonPages('https://example.test/bridges',async()=>({ok:true,json:async()=>({features:[],links:[{rel:'next',href:'https://other.test/'}]})})),/Invalid/)
})
