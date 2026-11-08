import test from 'node:test'
import assert from 'node:assert/strict'
import { KNOWLEDGE_PAGES, KNOWLEDGE_ARTICLES, KNOWLEDGE_ENTRIES, knowledgeContent } from './knowledge-base.mjs'
import { PUBLIC_PAGES, renderPublicPage, sitemapXml } from './public-pages.mjs'
import { matchesKnowledge } from '../shared/knowledge-search.mjs'

test('knowledge articles are public, linked, readable without scripts and have Article metadata', () => {
  assert.equal(KNOWLEDGE_ARTICLES.length,10)
  assert.equal(new Set(KNOWLEDGE_ENTRIES.map(a=>a.path)).size,KNOWLEDGE_ENTRIES.length)
  for (const path of Object.keys(KNOWLEDGE_PAGES)) {
    const html=renderPublicPage(path)
    assert.equal((html.match(/<h1>/g)||[]).length,1,path)
    assert.ok(sitemapXml().includes(`<loc>https://boottracker.nl${path}</loc>`))
    const ld=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1])
    assert.equal(ld['@type'],path==='/kennisbank'?'CollectionPage':'Article')
    if(path!=='/kennisbank') {
      assert.equal(ld.breadcrumb.itemListElement[1].item,'https://boottracker.nl/kennisbank')
      assert.ok(html.includes('Bronnen en verder lezen'))
      assert.ok(html.includes('7 november 2026'))
    }
    for(const [,href] of html.matchAll(/href="(\/[^"?#]*)[^"]*"/g)) assert.ok(Object.hasOwn(PUBLIC_PAGES,href)||['/public-pages.css','/favicon.svg','/openapi.json'].includes(href),`${path} -> ${href}`)
  }
})
test('search is accent insensitive, combines words and filters in server HTML', () => {
  assert.ok(matchesKnowledge('Coördinaten voor AIS','coordinaten AIS'))
  assert.equal(matchesKnowledge('Brughoogte en waterstand','brughoogte marifoon'),false)
  const html=knowledgeContent('/kennisbank',{searchParams:new URLSearchParams({q:'brughoogte'})})
  assert.match(html,/[1-9]\d* artikel(?:en)? gevonden/)
  assert.ok(html.includes('href="/doorvaarthoogte-amsterdam"'))
  const filtered=knowledgeContent('/kennisbank',{searchParams:new URLSearchParams({categorie:'communicatie'})})
  assert.ok(filtered.includes('value="communicatie" selected'))
  const empty=knowledgeContent('/kennisbank',{searchParams:new URLSearchParams({q:'zzzznoresults'})})
  assert.ok(empty.includes('0 artikelen gevonden'))
  assert.ok(empty.includes('data-knowledge-empty>'))
})
test('search query cannot inject HTML and unknown articles fail closed', () => {
  const html=knowledgeContent('/kennisbank',{searchParams:new URLSearchParams({q:'"><script>alert(1)</script>'})})
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.throws(()=>knowledgeContent('/kennisbank/missing'))
})
