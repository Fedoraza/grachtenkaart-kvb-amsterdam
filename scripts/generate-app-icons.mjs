// Generates the PWA and home-screen icons in public/icons from the favicon.
// Run after changing public/favicon.svg: node scripts/generate-app-icons.mjs
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
// The pin without its rounded background, for full-bleed variants.
const pin = svg.replace(/<rect[^>]*\/>/, '')
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname

async function fullBleed(size, pinScale, name) {
  const inner = Math.round(size * pinScale)
  const glyph = await sharp(Buffer.from(pin), { density: 72 * inner / 64 * 2 }).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
    .composite([{ input: glyph, gravity: 'center' }]).png().toFile(out(name))
}

for (const size of [192, 512]) {
  await sharp(Buffer.from(svg), { density: 72 * size / 64 * 2 }).resize(size, size).png().toFile(out(`icon-${size}.png`))
}
// Maskable icons keep the glyph inside the 80% safe zone.
await fullBleed(512, 0.6, 'icon-maskable-512.png')
// iOS rounds the corners itself and ignores transparency.
await fullBleed(180, 0.75, 'apple-touch-icon.png')
console.log('icons written to public/icons')
