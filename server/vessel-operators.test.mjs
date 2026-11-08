import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createOperatorStore, publicOperatorGroups } from './vessel-operators.mjs'
import { VESSEL_OPERATORS, inferVesselOperator, groupVesselsByOperator, buildOperatorDirectories } from '../shared/vessel-operators.mjs'
const vessel = (name, mmsi = '244123456') => ({ name, mmsi, latitude: 52.37, longitude: 4.9 })

test('all requested operator groups exist independently of the managed fleet', () => {
  assert.equal(VESSEL_OPERATORS.length, 11)
  assert.equal(groupVesselsByOperator([]).length, 11)
  for (const [name, id] of [['LOVERS 1', 'lovers'], ['Lovely Cruises 2', 'lovers'], ["'t Smidtje", 'smidtje'], ['STROMMA 5', 'stromma'], ['P. KOOIJ 4', 'p-kooij'], ['BLUE BOAT 3', 'blue-boat'], ['Rederij E.E. Plas 1', 'plas'], ['PURE BOATS 1', 'pure-boats'], ['KINboat 2', 'kinboat'], ['FLAGSHIP', 'flagship']]) {
    assert.equal(inferVesselOperator(vessel(name))?.id, id, name)
  }
})

test('ambiguous, partial, duplicate and out-of-area names do not claim ownership', () => {
  for (const name of ['ROOS', 'PAX', 'LOVELY DAY', 'PLASTIC WHALE', 'KINSHIP', 'NOORDZEE', '']) assert.equal(inferVesselOperator(vessel(name)), null, name)
  assert.equal(inferVesselOperator({ ...vessel('LOVERS 1'), latitude: 53 }), null)
  assert.equal(inferVesselOperator(vessel('STROMMA 1', 'invalid')), null)
  const groups = groupVesselsByOperator([vessel('Pure Spirit', '244123456'), vessel('Pure Spirit', '244123457')])
  assert.equal(groups.find((group) => group.id === 'pure-boats').mmsis.length, 0)
})

test('manual MMSI assignment wins, can move operators, and null suppresses automatic matches', () => {
  const boat = vessel('LOVERS 1')
  assert.equal(inferVesselOperator(boat, { '244123456': 'stromma' }).id, 'stromma')
  assert.equal(inferVesselOperator(boat, { '244123456': null }), null)
  const groups = groupVesselsByOperator([boat], { '244123456': 'stromma' })
  assert.deepEqual(groups.find((group) => group.id === 'lovers').mmsis, [])
  assert.deepEqual(groups.find((group) => group.id === 'stromma').mmsis, ['244123456'])
  assert.deepEqual(groupVesselsByOperator([], { '244123456': 'kinboat' }).find((group) => group.id === 'kinboat').mmsis, ['244123456'])
})

test('operator assignments persist and public projection excludes private AIS fields', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const store = createOperatorStore(db)
    db.exec('CREATE TABLE vessels (mmsi TEXT PRIMARY KEY, data TEXT)')
    db.prepare('INSERT INTO vessels VALUES (?,?)').run('244123456', JSON.stringify({ ...vessel('Private-name boat'), notes: 'PRIVATE', secret: 'PRIVATE' }))
    store.write('244123456', 'blue-boat', 1, 100)
    assert.deepEqual(createOperatorStore(db).read(), { '244123456': 'blue-boat' })
    const groups = publicOperatorGroups(db, store.read())
    assert.equal(groups.find((group) => group.id === 'blue-boat').vessels.length, 1)
    assert.ok(!JSON.stringify(groups).includes('PRIVATE'))
    assert.ok(!JSON.stringify(store.read()).includes('updated_by'))
    assert.throws(() => store.write('invalid', 'stromma', 1))
    assert.throws(() => store.write('244123456', 'unknown', 1))
    store.reset('244123456')
    assert.deepEqual(store.read(), {})
  } finally { db.close() }
})


test('directories include every operator, KINboat names without AIS, and deduplicate stored/AIS boats', () => {
  const boats = [{ id: 1, name: 'Boot2go 17', mmsi: '244123456' }]
  const groups = groupVesselsByOperator([vessel('Boot2go 17')])
  const directories = buildOperatorDirectories(boats, groups)
  assert.equal(directories.length, 11)
  const kinboat = directories.find((directory) => directory.id === 'kinboat')
  assert.equal(kinboat.boats.filter((boat) => boat.mmsi === '244123456').length, 1)
  assert.equal(kinboat.boats.find((boat) => boat.mmsi === '244123456').id, 1)
  assert.equal(kinboat.boats.find((boat) => boat.mmsi === '244123456').directoryOnly, false)
  const offline = buildOperatorDirectories().find((directory) => directory.id === 'kinboat').boats.find((boat) => boat.name === 'KIN12')
  assert.equal(offline.name, 'KIN12')
  assert.equal(offline.ais, undefined)
  const unassigned = buildOperatorDirectories(boats, groups, { '244123456': null }).find((directory) => directory.id === 'unassigned')
  assert.equal(unassigned.boats[0].id, 1)
})


test('curated MMSI corrections respect overrides and do not conflate two boats called Roos', () => {
  assert.equal(inferVesselOperator(vessel('PAX', '244154960'))?.id, 'flagship')
  assert.equal(inferVesselOperator(vessel('PAX', '244154960'), { '244154960': 'stromma' })?.id, 'stromma')
  assert.equal(inferVesselOperator(vessel('ROOS', '244126390'))?.id, 'flagship')
  assert.equal(inferVesselOperator(vessel('ROOS', '244070458')), null)
  assert.equal(new Set(VESSEL_OPERATORS.map((operator) => operator.color)).size, VESSEL_OPERATORS.length)
  const directories = buildOperatorDirectories([{ id: 1, name: 'New boat without AIS', operator_id: 'kinboat' }])
  assert.equal(directories.find((item) => item.id === 'kinboat').boats.some((boat) => boat.id === 1), true)
})


test('same-name boats with different MMSIs remain separate within a directory', () => {
  const boats = [{ id: 1, name: 'PAX', mmsi: '244154960' }]
  const assignments = { '244154960': 'flagship', '244780654': 'flagship' }
  const groups = groupVesselsByOperator([vessel('PAX', '244154960'), vessel('PAX', '244780654')], assignments)
  const directory = buildOperatorDirectories(boats, groups, assignments).find((item) => item.id === 'flagship')
  assert.deepEqual(directory.boats.filter((boat) => boat.mmsi).map((boat) => boat.mmsi).sort(), ['244154960', '244780654'])
})

test('Jobien, Boot2go registered fleet and Those Dam Boat Guys are recognized without invented MMSIs', () => {
  assert.equal(inferVesselOperator(vessel('JOBIEN', '244002621'))?.id, 'flagship')
  for (const name of ['Boot2go17', 'G-Star', 'KIN12', 'Gangster', 'Mamacita']) assert.equal(inferVesselOperator(vessel(name))?.id, 'kinboat', name)
  for (const name of ['Jackson 1', 'Jackson 5', 'De Blauwe Draeck']) assert.equal(inferVesselOperator(vessel(name))?.id, 'those-dam-boat-guys', name)
  assert.equal(inferVesselOperator(vessel('Boot2go999')), null)
  assert.equal(inferVesselOperator(vessel('Apollo')), null)
})


test('Rederij de Nederlanden includes official fleet names and spelling variants', () => {
  for (const name of ['Najade', 'Proost van Sint Jan', 'Proost van St. Jan', 'Bredero', 'Multatuli', 'Jacob van Lennep', 'Hildebrand', 'Peter de Grote', 'Wapen van Amsterdam', 'Wan-Hoop']) assert.equal(inferVesselOperator(vessel(name))?.id, 'de-nederlanden', name)
  assert.equal(buildOperatorDirectories().find((directory) => directory.id === 'de-nederlanden').boats.length, 9)
})


test('Lovely Spartacus and Apollo use specific MMSIs without claiming other boats called Apollo', () => {
  const apollos = [vessel('APOLLO', '244086784'), vessel('APOLLO', '244830076'), vessel('APOLLO', '253000037')]
  const groups = groupVesselsByOperator([...apollos, vessel('SPARTACUS', '244311331')])
  const lovely = groups.find((group) => group.id === 'lovers')
  assert.ok(lovely.mmsis.includes('244086784'))
  assert.ok(lovely.mmsis.includes('244311331'))
  assert.equal(groups.some((group) => group.mmsis.includes('244830076')), false)
  assert.equal(groups.some((group) => group.mmsis.includes('253000037')), false)
  assert.equal(inferVesselOperator(apollos[0], { '244086784': null }), null)
  const directory = buildOperatorDirectories([], groups).find((item) => item.id === 'lovers')
  for (const mmsi of ['244086784', '244311331']) assert.equal(directory.boats.filter((boat) => boat.mmsi === mmsi).length, 1)
})
