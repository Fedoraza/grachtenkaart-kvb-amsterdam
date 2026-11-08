import { KNOWLEDGE_ARTICLES, KNOWLEDGE_CATEGORIES } from './knowledge-articles.mjs'
import { knowledgeSearchText, matchesKnowledge } from '../shared/knowledge-search.mjs'
export { KNOWLEDGE_ARTICLES, KNOWLEDGE_CATEGORIES }
const escape = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const categoryName = id => KNOWLEDGE_CATEGORIES.find(c=>c.id===id)?.name || id
const existing = [
  ['/doorvaarthoogte-amsterdam','Doorvaarthoogte, NAP en waterstand','bruggen','Bereken de vrije hoogte en lees wat een bronmaat wel en niet zegt.'],
  ['/vaarprofielen-amsterdam','Vaarprofielen: welke boot past waar?','bruggen','Vergelijk de opgenomen profielklassen voor bootlengte en breedte.'],
  ['/bruggen-amsterdam','Bruggegevens in Amsterdam','bruggen','Bekijk bekende hoogtes, breedtes en bronverwijzingen per brug.'],
  ['/grachten-amsterdam','Grachten en hun vaarprofielen','bruggen','Lees de uitleg bij onder meer Herengracht, Prinsengracht en Bloemgracht.'],
  ['/vaarroutes-amsterdam','Voorbeeldvaarroutes door Amsterdam','voorbereiden','Open een bestaand traject en bereken het met je eigen bootmaten.'],
  ['/routeplanner-api','Routes voor AI-assistenten en bots','kaart','Gebruik de routeplanner en gedeelde routes via JSON en GeoJSON.'],
].map(([path,title,category,summary])=>({path,title,category,summary,reference:true,keywords:`${summary} ${path === '/doorvaarthoogte-amsterdam' ? 'brughoogte brughoogtes vrije hoogte onder brug NAP waterstand' : ''}`}))
export const KNOWLEDGE_ENTRIES = [...KNOWLEDGE_ARTICLES,...existing]
export const KNOWLEDGE_PAGES = {
  '/kennisbank': {title:'Kennisbank varen in Amsterdam: regels, bruggen en routes | Boottracker',description:'Praktische kennis voor varen in Amsterdam. Zoek uitleg over vaarregels, scheepvaartborden, bruggen, bootmaten, marifoon, AIS en routeplanning.'},
  ...Object.fromEntries(KNOWLEDGE_ARTICLES.map(a=>[a.path,{title:`${a.title} | Boottracker kennisbank`,description:a.summary}])),
}
const entryText = a => [a.title,a.summary,a.keywords,categoryName(a.category),a.takeaway,...(a.sections || []).flat()].join(' ')
const card = (a, query='',category='') => {
  const search = knowledgeSearchText(entryText(a))
  const hidden = !matchesKnowledge(search,query) || (category && a.category !== category)
  return `<article class="kb-card" data-knowledge-card data-category="${a.category}" data-knowledge-search="${escape(search)}"${hidden?' hidden':''}><span class="kb-category">${escape(categoryName(a.category))}${a.reference?' · Naslag':''}</span><h2><a href="${a.path}">${escape(a.title)}</a></h2><p>${escape(a.summary)}</p><a class="kb-card-link" href="${a.path}">Lees ${a.reference?'de uitleg':'het artikel'} <span aria-hidden="true">↗</span></a></article>`
}
const dimensions = `<figure class="kb-diagram"><svg viewBox="0 0 600 230" role="img" aria-label="Schematische boot: hoogte boven de waterlijn, diepgang onder water en lengte van boeg tot achtersteven"><path d="M40 130H560" stroke="#67e8f9" stroke-width="2" stroke-dasharray="6 6"/><path d="M100 110H470L430 165H145Z" fill="#164e63" stroke="#67e8f9" stroke-width="2"/><path d="M180 110V70H330V110" fill="#1e293b" stroke="#a5effa" stroke-width="2"/><path d="M80 70V130M70 70H90M70 130H90M510 130V165M500 165H520M500 130H520M100 200H470M100 192V208M470 192V208" stroke="#bef264" stroke-width="2"/><g fill="#d9e8f7" font-family="system-ui" font-size="15"><text x="110" y="44">Hoogte boven de waterlijn</text><text x="420" y="100">Waterlijn</text><text x="475" y="187">Diepgang</text><text x="250" y="223">Lengte</text></g></svg><figcaption>Schematische uitleg, geen maatvoering voor jouw boot. De breedte meet je dwars op de boot.</figcaption></figure>`
export function knowledgeContent(path, {searchParams = new URLSearchParams()} = {}) {
  if (path === '/kennisbank') {
    const query=String(searchParams.get('q')||'').slice(0,120)
    const requested=searchParams.get('categorie')||''
    const category=KNOWLEDGE_CATEGORIES.some(c=>c.id===requested)?requested:''
    const count=KNOWLEDGE_ENTRIES.filter(a=>(!category||a.category===category)&&matchesKnowledge(entryText(a),query)).length
    return `<section class="kb-hero"><div><p class="eyebrow">Boottracker · Kennisbank</p><h1>Goed voorbereid<br><span>het water op.</span></h1><p class="lead">Wat betekent een brugmaat? Welke regels gelden op de grachten? En wat zegt die boot op de kaart? Vind de uitleg voor jouw volgende vaartocht.</p><p class="kb-hero-note">${KNOWLEDGE_ARTICLES.length} artikelen · ${existing.length} naslagpagina’s · Vrij toegankelijk</p></div><aside class="kb-start"><span class="eyebrow">Begin hier</span><h2>Je eerste tocht door Amsterdam?</h2><p>Begin met je bootmaten en vertrekpunt. Bekijk daarna de vaarwegen en de omstandigheden onderweg.</p><a href="/kennisbank/vaarroute-voorbereiden">Bereid je vaarroute voor <span aria-hidden="true">↗</span></a><a href="/?planner=1">Open de routeplanner <span aria-hidden="true">↗</span></a></aside></section>
<section class="kb-index" data-knowledge-index aria-labelledby="knowledge-title"><h2 id="knowledge-title">Waar wil je meer over weten?</h2><form class="kb-search" action="/kennisbank" method="get" data-knowledge-form><label>Zoek in de kennisbank<input name="q" type="search" value="${escape(query)}" maxlength="120" placeholder="Bijvoorbeeld brughoogte, marifoon of AIS" data-knowledge-query /></label><label>Onderwerp<select aria-label="Onderwerp" name="categorie" data-knowledge-category><option value="">Alle onderwerpen</option>${KNOWLEDGE_CATEGORIES.map(c=>`<option value="${c.id}"${c.id===category?' selected':''}>${escape(c.name)}</option>`).join('')}</select></label><button class="button" type="submit">Zoeken</button></form>
<nav class="kb-topics" aria-label="Onderwerpen">${KNOWLEDGE_CATEGORIES.map(c=>`<a href="/kennisbank?categorie=${c.id}#knowledge-title"><span>${c.number}</span>${escape(c.name)}</a>`).join('')}</nav><p class="kb-result-count" role="status" aria-live="polite" data-knowledge-count>${count} ${count===1?'artikel':'artikelen'} gevonden</p><div class="kb-grid">${KNOWLEDGE_ENTRIES.map(a=>card(a,query,category)).join('')}</div><p class="empty-state" data-knowledge-empty${count?' hidden':''}>Geen artikelen gevonden. Probeer een korter zoekwoord of <a href="/kennisbank#knowledge-title">bekijk alle onderwerpen</a>.</p></section>
<section class="kb-sources"><h2>Uitleg voor onderweg. Actuele informatie bij de bron.</h2><p>De kennisbank helpt je de kaart en vaarinformatie te begrijpen. Controleer voor vertrek de actuele regels, berichten en aanwijzingen van de beheerder. Bij de artikelen vind je de gebruikte bronnen; uitleg over Boottracker beschrijft de werking van deze applicatie.</p><a href="/over-boottracker">Over de kaartgegevens en bronnen →</a></section>`
  }
  const a=KNOWLEDGE_ARTICLES.find(a=>a.path===path)
  if(!a)throw Error('Unknown knowledge article')
  const extraLinks = {
    '/rederijen-amsterdam': {title:'Rederijen en boten',summary:'Bekijk de opgenomen vloten en beschikbare bootgegevens.'},
    '/vlootstatistieken': {title:'Vlootstatistieken en datakwaliteit',summary:'Bekijk ontvangen vaarbewegingen en de dekking van de AIS-metingen.'},
    '/over-boottracker': {title:'Over Boottracker en de kaartgegevens',summary:'Lees waar de gegevens vandaan komen en welke beperkingen ze hebben.'},
  }
  const explicit = a.related.map(p=>KNOWLEDGE_ENTRIES.find(e=>e.path===p) || (extraLinks[p] ? {...extraLinks[p],path:p,category:a.category,reference:true} : null)).filter(Boolean)
  const related = [...explicit,...KNOWLEDGE_ENTRIES.filter(e=>e.path!==path&&!a.related.includes(e.path)&&e.category===a.category)].slice(0,3)
  return `<article class="kb-article"><header class="guide-hero"><p class="eyebrow">${escape(categoryName(a.category))}</p><h1>${escape(a.title)}</h1><p class="lead">${escape(a.summary)}</p><p class="caption">Boottracker redactie · Bijgewerkt <time datetime="${a.updatedAt}">7 november 2026</time></p></header><div class="kb-article-layout"><aside class="kb-toc"><nav aria-label="In dit artikel"><strong>In dit artikel</strong>${a.sections.map(([title],i)=>`<a href="#onderdeel-${i+1}">${escape(title)}</a>`).join('')}</nav><a class="kb-back" href="/kennisbank">← Alle onderwerpen</a></aside><div class="kb-article-body"><p class="kb-takeaway">${escape(a.takeaway)}</p>${a.diagram==='dimensions'?dimensions:''}${a.sections.map(([title,body],i)=>`<section id="onderdeel-${i+1}"><h2>${escape(title)}</h2><p>${escape(body)}</p></section>`).join('')}<section class="kb-article-sources"><h2>Bronnen en verder lezen</h2>${a.sources.length?`<ul>${a.sources.map(source=>`<li><a href="${escape(source.url)}" rel="external noopener noreferrer">${escape(source.name)} ↗</a></li>`).join('')}</ul>`:'<p>Dit artikel beschrijft de werking en gegevens van Boottracker.</p>'}<p><a href="/over-boottracker">Lees over de herkomst en beperkingen van de kaartgegevens</a>.</p></section><a class="button" href="/?planner=1">Naar de routeplanner ↗</a></div></div></article><section class="kb-related"><h2>Lees ook</h2><div class="kb-grid">${related.map(e=>card(e)).join('')}</div><a class="text-link" href="/kennisbank">Terug naar de kennisbank →</a></section>`
}
export function knowledgeStructuredData(path) {
  const a=KNOWLEDGE_ARTICLES.find(a=>a.path===path)
  if(a)return {'@type':'Article',headline:a.title,articleSection:categoryName(a.category),datePublished:a.updatedAt,dateModified:a.updatedAt,author:{'@type':'Organization',name:'Boottracker redactie'},publisher:{'@type':'Organization',name:'Boottracker'},mainEntityOfPage:`https://boottracker.nl${path}`}
  return {'@type':'CollectionPage',mainEntity:{'@type':'ItemList',numberOfItems:KNOWLEDGE_ENTRIES.length,itemListElement:KNOWLEDGE_ENTRIES.map((a,i)=>({'@type':'ListItem',position:i+1,url:`https://boottracker.nl${a.path}`,name:a.title}))}}
}
