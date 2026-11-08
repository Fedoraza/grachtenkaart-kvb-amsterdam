import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'

const compress = promisify(gzip)
const assets = new Map()
const MAX_CACHED_BYTES = 8 * 1024 * 1024
let cachedBytes = 0

export function acceptsGzip(header = '') {
  const values = String(header).toLowerCase().split(',').map(value => value.trim().split(';'))
  const quality = parts => Number(parts.slice(1).map(value => value.trim()).find(value => value.startsWith('q='))?.slice(2) ?? 1)
  const explicit = values.find(parts => parts[0] === 'gzip')
  return explicit ? quality(explicit) > 0 : values.some(parts => parts[0] === '*' && quality(parts) > 0)
}

export function vary(res, name) {
  const names = String(res.getHeader('Vary') || '').split(',').map(value => value.trim()).filter(Boolean)
  if (!names.some(value => value.toLowerCase() === name.toLowerCase())) names.push(name)
  res.setHeader('Vary', names.join(', '))
}

export async function sendEncoded(req, res, body) {
  let bytes = Buffer.isBuffer(body) ? body : Buffer.from(body)
  if (bytes.length >= 1024) {
    vary(res, 'Accept-Encoding')
    if (acceptsGzip(req?.headers?.['accept-encoding'])) {
      try {
        const compressed = await compress(bytes, { level: 4 })
        if (res.destroyed) return
        bytes = compressed
        res.setHeader('Content-Encoding', 'gzip')
      } catch { /* An uncompressed response remains valid if compression fails. */ }
    }
  }
  if (res.destroyed) return
  res.setHeader('Content-Length', bytes.length)
  res.end(req?.method === 'HEAD' ? undefined : bytes)
}

export function sendJsonResponse(req, res, status, value, cacheControl = 'no-store') {
  const body = JSON.stringify(value)
  const path = new URL(req?.url || '/', 'http://localhost').pathname
  const revalidate = status === 200 && req?.method === 'GET' && /^\/api\/map\/(objects|route-links|navigation-layer|bridges)$/.test(path) && cacheControl === 'no-store'
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', revalidate ? 'private, no-cache' : cacheControl)
  if (Buffer.byteLength(body) >= 1024) vary(res, 'Accept-Encoding')
  if (revalidate) {
    const etag = `W/"${createHash('sha256').update(body).digest('base64url')}"`
    res.setHeader('ETag', etag)
    vary(res, 'Cookie')
    if (etagMatches(req.headers['if-none-match'], etag)) {
      res.statusCode = 304
      return res.end()
    }
  }
  return sendEncoded(req, res, body)
}

function etagMatches(header, etag) {
  return String(header || '').split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''))
}

export async function sendAsset(req, res, path, contentType, cacheControl) {
  try {
    const info = await stat(path)
    const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', cacheControl)
    res.setHeader('ETag', etag)
    vary(res, 'Accept-Encoding')
    if (etagMatches(req.headers['if-none-match'], etag)) {
      res.statusCode = 304
      return res.end()
    }
    let entry = assets.get(path)
    if (!entry || entry.etag !== etag) {
      const raw = await readFile(path)
      const zipped = /(?:text\/|json|javascript|svg)/.test(contentType) && raw.length >= 1024 ? await compress(raw, { level: 6 }) : null
      entry = { etag, raw, zipped, size: raw.length + (zipped?.length || 0) }
      // Bound memory independently of the number of requested static files.
      if (assets.has(path)) { cachedBytes -= assets.get(path).size; assets.delete(path) }
      while (cachedBytes + entry.size > MAX_CACHED_BYTES && assets.size) {
        const oldest = assets.keys().next().value
        cachedBytes -= assets.get(oldest).size
        assets.delete(oldest)
      }
      if (entry.size <= MAX_CACHED_BYTES) { assets.set(path, entry); cachedBytes += entry.size }
    }
    if (res.destroyed) return
    const zipped = entry.zipped && acceptsGzip(req.headers['accept-encoding'])
    const bytes = zipped ? entry.zipped : entry.raw
    if (zipped) res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Content-Length', bytes.length)
    res.end(req.method === 'HEAD' ? undefined : bytes)
  } catch {
    if (!res.headersSent) { res.statusCode = 500; res.end('Bestand niet beschikbaar') }
    else res.destroy()
  }
}
