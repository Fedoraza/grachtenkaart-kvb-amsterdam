import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { acceptsGzip, sendAsset, sendJsonResponse } from './http-transfer.mjs'

function get(server, path, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method, headers }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end()
  })
}

test('gzip negotiation respects disabled encodings', () => {
  assert.equal(acceptsGzip('br, gzip;q=0.8'), true)
  assert.equal(acceptsGzip('gzip;q=0, *;q=1'), false)
  assert.equal(acceptsGzip('br'), false)
  assert.equal(acceptsGzip('*;q=0.5'), true)
})

test('map data is compressed, validated without a body when unchanged and refreshed immediately after edits', async t => {
  let value = { features: Array.from({ length: 100 }, (_, id) => ({ id, name: 'Amsterdamse brug', height: 2.4 })) }
  const server = createServer((req, res) => sendJsonResponse(req, res, 200, value))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const first = await get(server, '/api/map/objects', { 'accept-encoding': 'gzip' })
  assert.equal(first.headers['content-encoding'], 'gzip')
  assert.deepEqual(JSON.parse(gunzipSync(first.body)), value)
  assert.ok(first.body.length < JSON.stringify(value).length / 2)
  assert.equal(first.headers['cache-control'], 'private, no-cache')
  const unchanged = await get(server, '/api/map/objects', { 'if-none-match': first.headers.etag })
  assert.equal(unchanged.status, 304)
  assert.equal(unchanged.body.length, 0)
  value = { ...value, edited: true }
  const changed = await get(server, '/api/map/objects', { 'if-none-match': first.headers.etag })
  assert.equal(changed.status, 200)
  assert.equal(JSON.parse(changed.body).edited, true)
  assert.notEqual(changed.headers.etag, first.headers.etag)
  const privateData = await get(server, '/api/auth/status')
  assert.equal(privateData.headers['cache-control'], 'no-store')
  assert.equal(privateData.headers.etag, undefined)
})

test('static assets support gzip, HEAD, conditional requests and changed files', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'boottracker-assets-'))
  const path = join(folder, 'canals.geojson')
  const body = JSON.stringify({ features: Array(1000).fill({ name: 'Herengracht' }) })
  await writeFile(path, body)
  const server = createServer((req, res) => sendAsset(req, res, path, 'application/geo+json', 'no-cache'))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(folder, { recursive: true }) })
  const first = await get(server, '/', { 'accept-encoding': 'gzip' })
  assert.equal(gunzipSync(first.body).toString(), body)
  const head = await get(server, '/', { 'accept-encoding': 'gzip' }, 'HEAD')
  assert.equal(head.headers['content-length'], first.headers['content-length'])
  assert.equal(head.body.length, 0)
  assert.equal((await get(server, '/', { 'if-none-match': first.headers.etag })).status, 304)
  assert.equal((await get(server, '/', { 'accept-encoding': 'gzip;q=0' })).body.toString(), body)
  await writeFile(path, body + '\n')
  const changed = await get(server, '/', { 'if-none-match': first.headers.etag })
  assert.equal(changed.status, 200)
  assert.equal(changed.body.toString(), body + '\n')
})
