import test from 'node:test'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { amsterdamDayBounds } from './fleet-leaderboard.mjs'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { PUBLIC_PAGES } from './public-pages.mjs'

// Real production HTTP handling with an isolated empty database and public
// bridge fixtures. Never reads the laptop's .env, accounts or WhatsApp session.
test('production public pages and sitemap work without login or JavaScript', { timeout: 30_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'boottracker-public-'))
  const reservation = createServer()
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve))
  const port = reservation.address().port
  await new Promise((resolve) => reservation.close(resolve))
  await mkdir(join(directory, 'data'))
  // Minimal manifest and public assets also make this test independent of a build.
  await mkdir(join(directory, 'dist', '.vite'), { recursive: true })
  await writeFile(join(directory, 'dist', '.vite', 'manifest.json'), JSON.stringify({ 'src/publicPages.js': { file: 'assets/publicPages.js' } }))
  await writeFile(join(directory, 'dist', 'index.html'), '<!doctype html><html><head><title>Fixture</title></head><body><div id="app"><h1>Boottracker</h1></div></body></html>')
  await symlink(resolve('public'), join(directory, 'public'))
  await writeFile(join(directory, 'data', 'amsterdam-bridges-v6.json'), JSON.stringify({ type: 'FeatureCollection', catalogVersion: 6, fetchedAt: Date.now(), features: [{ type: 'Feature', properties: { number: 'BRU0487', fisClearanceMeters: 3.94, fisPassageWidthMeters: 12 } }] }))
  await writeFile(join(directory, 'data', 'navigation-closures-v1.json'), JSON.stringify({type: 'FeatureCollection', features: [], fetchedAt: new Date().toISOString(), stale: false}))
  const child = spawn(process.execPath, [resolve('server.mjs')], {
    cwd: directory, env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), DATABASE_PATH: join(directory, 'data', 'test.sqlite'), WHATSAPP_ENABLED: 'false', AISSTREAM_API_KEY: '', DATABASE_BACKUP_DIRECTORY: join(directory, 'backups') }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit') } await rm(directory, { recursive: true, force: true }) })
  const origin = `http://127.0.0.1:${port}`
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(`${origin}/healthz`)).ok } catch {}
    if (ready) break
    if (child.exitCode !== null) throw new Error(output)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.ok(ready, output)
  for (const path of Object.keys(PUBLIC_PAGES).filter((path) => !['/', '/km-leaderboard'].includes(path))) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 200, path)
    const html = await response.text()
    assert.ok(html.includes(`<link rel="canonical" href="https://boottracker.nl${path}">`), path)
    assert.ok(html.includes('<h1>'), path)
  }
  for (const asset of ['/llms.txt', '/openapi.json']) {
    const response = await fetch(origin + asset)
    assert.equal(response.status, 200, asset)
    assert.equal((await fetch(origin + asset, {method:'HEAD'})).status, 200)
    assert.ok((await response.text()).includes('routeplanner'))
  }
  assert.equal((await fetch(origin + '/api/routeplanner/route')).status, 400)
  assert.equal((await fetch(origin + '/api/routeplanner/route', {method:'POST'})).status, 405)
  const routeParams = new URLSearchParams({points:'[[4.8920164,52.3792362],[4.8975988,52.3650949]]',heightMeters:'1.4',widthMeters:'2.2',lengthMeters:'7',draftMeters:'0.6'})
  const agentRoute = await fetch(origin + '/api/routeplanner/route?' + routeParams)
  assert.equal(agentRoute.status, 200)
  const calculated = await agentRoute.json()
  assert.equal(calculated.complete, true)
  assert.equal(calculated.geometry.type, 'LineString')
  assert.ok(calculated.geometry.coordinates[0][0] < 5)
  assert.ok(calculated.warnings.length)
  const hindrances = await fetch(origin + '/api/map/navigation-layer?layer=closures')
  assert.equal(hindrances.status, 200)
  assert.match(hindrances.headers.get('cache-control'), /no-cache|no-store/)
  assert.doesNotMatch(hindrances.headers.get('cache-control'), /stale-while-revalidate/)
  assert.equal((await hindrances.json()).stale, false)
  const operators = await fetch(origin + '/api/map/operator-groups')
  assert.equal(operators.status, 200)
  assert.equal((await operators.json()).groups.length, 11)
  assert.equal((await fetch(origin + '/api/map/operator-membership/244123456', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operatorId: 'stromma' }) })).status, 401)
  // Real SQL path: an AIS-only boat from another operator must enter the same ranking.
  const fixtureDb = new DatabaseSync(join(directory, 'data', 'test.sqlite'))
  const fixtureNow = Date.now()
  const sharedToken = 'abcdefghijklmnopqrstuvwx'
  const sharedRoute = {name:'AI leesbare testvaarroute',points:[{role:'start',latitude:52.37,longitude:4.89},{role:'end',latitude:52.371,longitude:4.891}],result:{status:'ok',coordinates:[[52.37,4.89],[52.371,4.891]],distanceMeters:130,durationMinutes:2,steps:[{name:'Herengracht',distanceMeters:130}],warnings:['Testwaarschuwing']}}
  fixtureDb.prepare('INSERT INTO shared_routes (token,route_json,created_at,expires_at) VALUES (?,?,?,?)').run(sharedToken,JSON.stringify(sharedRoute),fixtureNow,fixtureNow+60000)
  const sharedPage = await fetch(origin + '/?route=' + sharedToken + '&utm_source=chatgpt.com')
  assert.equal(sharedPage.status,200)
  assert.equal(sharedPage.headers.get('cache-control'),'private, no-store')
  const sharedHtml = await sharedPage.text()
  for (const text of ['AI leesbare testvaarroute','Herengracht','Testwaarschuwing','<td>4.891</td><td>52.371</td>','Gekoppelde marifoonmeldpunten']) assert.ok(sharedHtml.includes(text),text)
  assert.ok(sharedHtml.includes('href="https://boottracker.nl/?route='+sharedToken+'"'))
  assert.equal((await fetch(origin+'/?route='+sharedToken,{method:'HEAD'})).status,200)
  assert.equal((await fetch(origin+'/?route=invalid')).status,404)
  const geoResponse = await fetch(origin+'/api/shared-routes/'+sharedToken+'?format=geojson')
  assert.match(geoResponse.headers.get('content-type'),/application\/geo\+json/)
  const geo = await geoResponse.json()
  assert.deepEqual(geo.geometry.coordinates,[[4.89,52.37],[4.891,52.371]])
  assert.equal(geo.properties.complete,true)
  fixtureDb.prepare('UPDATE shared_routes SET expires_at = ? WHERE token = ?').run(fixtureNow-1,sharedToken)
  assert.equal((await fetch(origin+'/?route='+sharedToken)).status,404)

  for (const [mmsi, name] of [['244123456', 'LOVERS 1'], ['244123457', 'STROMMA 1']]) {
    fixtureDb.prepare('INSERT INTO vessels (mmsi, data, updated_at) VALUES (?, ?, ?)').run(mmsi, JSON.stringify({ mmsi, name, latitude: 52.37, longitude: 4.9, receivedAt: new Date(fixtureNow).toISOString() }), fixtureNow)
    const from = amsterdamDayBounds('2026-10-30').from
    for (const [offset, latitude] of [[0, 52.37], [60000, 52.371]]) fixtureDb.prepare('INSERT INTO positions (mmsi, latitude, longitude, speed, received_at) VALUES (?, ?, ?, ?, ?)').run(mmsi, latitude, 4.9, 4, from + offset)
  }
  fixtureDb.prepare("INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at) VALUES (1, 'Test admin', 'admin@example.invalid', 'unused-test-hash', 'admin', ?, ?)").run(fixtureNow, fixtureNow)
  fixtureDb.prepare('INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, 1, ?, ?)').run(createHash('sha256').update('operator-test-session').digest('hex'), fixtureNow + 60000, fixtureNow)
  fixtureDb.close()
  const adminHeaders = { 'Content-Type': 'application/json', Cookie: 'grachten_session=operator-test-session' }
  const createBoat = await fetch(origin + '/api/fleet/boats', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ name: 'KINboat without AIS', homeDock: 'Test dock', operatorId: 'kinboat' }) })
  assert.equal(createBoat.status, 201)
  const createdBoat = await createBoat.json()
  assert.equal(createdBoat.operator_id, 'kinboat')
  const photoDb = new DatabaseSync(join(directory, 'data', 'test.sqlite'))
  photoDb.prepare("UPDATE fleet_boats SET photo = ?, photo_mime = 'image/png' WHERE id = ?").run(Buffer.from('old-unverified-import'), createdBoat.id)
  photoDb.close()
  assert.equal((await fetch(origin + `/api/fleet/boats/${createdBoat.id}/photo`)).status, 404)
  const unverifiedSummary = await (await fetch(origin + '/api/fleet/summary')).json()
  assert.equal(unverifiedSummary.boats.find((boat) => boat.id === createdBoat.id).photoUrl, null)
  const uploadPhoto = await fetch(origin + `/api/fleet/boats/${createdBoat.id}/photo`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXiAAAAAASUVORK5CYII=' }) })
  assert.equal(uploadPhoto.status, 200)
  assert.equal((await fetch(origin + `/api/fleet/boats/${createdBoat.id}/photo`)).status, 200)

  const updateBoat = await fetch(origin + `/api/fleet/boats/${createdBoat.id}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ name: 'KINboat without AIS', homeDock: 'Test dock', operatorId: 'pure-boats' }) })
  assert.equal(updateBoat.status, 200)
  const savedSummary = await (await fetch(origin + '/api/fleet/summary')).json()
  assert.equal(savedSummary.boats.find((boat) => boat.id === createdBoat.id).operator_id, 'pure-boats')
  const allRanking = await (await fetch(origin + '/api/fleet/leaderboard?date=2026-10-30')).json()
  assert.equal(allRanking.entries.filter((entry) => entry.distanceKm > 0).length, 2)
  const strommaRanking = await (await fetch(origin + '/api/fleet/leaderboard?date=2026-10-30&operator=stromma')).json()
  assert.equal(strommaRanking.entries.filter((entry) => entry.distanceKm > 0).length, 1)
  assert.ok(strommaRanking.entries.every((entry) => entry.operatorId === 'stromma'))
  assert.equal((await fetch(origin + '/api/fleet/leaderboard?operator=unknown')).status, 400)
  const statisticsResponse = await fetch(origin + '/api/fleet/statistics?from=2026-10-30&to=2026-10-30')
  assert.equal(statisticsResponse.status, 200)
  const statistics = await statisticsResponse.json()
  assert.equal(statistics.summary.activeBoats, 2)
  assert.equal(statistics.operators.find((operator) => operator.id === 'stromma').activeBoats, 1)
  assert.equal(statistics.daily.length, 1)
  assert.equal((await fetch(origin + '/api/fleet/statistics?from=2026-01-01&to=2026-03-01')).status, 400)
  assert.equal((await fetch(origin + '/api/fleet/statistics?operator=unknown')).status, 400)

  const bridge = await (await fetch(origin + '/bruggen-amsterdam/kortjewantsbrug')).text()
  assert.ok(bridge.includes('3,94 m'))
  const sitemap = await (await fetch(origin + '/sitemap.xml')).text()
  assert.equal((sitemap.match(/<loc>/g) || []).length, Object.keys(PUBLIC_PAGES).length)
  const robots = await (await fetch(origin + '/robots.txt')).text()
  assert.ok(robots.includes('Sitemap: https://boottracker.nl/sitemap.xml'))
  assert.equal((await fetch(origin + '/bruggen-amsterdam/kortjewantsbrug', { method: 'HEAD' })).status, 200)
  const redirect = await fetch(origin + '/grachten-amsterdam/prinsengracht/', { redirect: 'manual' })
  assert.equal(redirect.status, 301)
  assert.equal(redirect.headers.get('location'), '/grachten-amsterdam/prinsengracht')
  assert.equal((await fetch(origin + '/bruggen-amsterdam/verzonnen-brug')).status, 404)
})
