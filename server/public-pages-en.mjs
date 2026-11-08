// English editions of the public information pages. Each page names its Dutch
// counterpart so both editions can declare each other as hreflang alternates.
// Only pages that are fully translated belong here; untranslated pages stay
// Dutch-only and carry no English alternate.
import { WATERWAY_PROFILES, PROFILE_SOURCE_URL } from '../shared/waterway-profiles.mjs'
import { BRIDGE_GUIDES, CANAL_GUIDES, bridgePageData } from './public-navigation.mjs'

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const meters = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? `${Number(value).toLocaleString('en-GB', { maximumFractionDigits: 2 })} m` : 'Unknown'
const row = (label, value) => `<tr><th scope="row">${escape(label)}</th><td>${escape(value)}</td></tr>`
const sourceLink = (url, label) => `<a href="${escape(url)}" rel="noopener noreferrer">${escape(label)}</a>`

const EN = {
  planner: '/en/amsterdam-boat-route-planner',
  bridges: '/en/amsterdam-bridges',
  canals: '/en/amsterdam-canals',
  clearance: '/en/bridge-clearance-amsterdam',
  profiles: '/en/amsterdam-waterway-profiles',
  about: '/en/about-boottracker',
}
const bridgePath = (bridge) => `${EN.bridges}/${bridge.slug}`
const canalPath = (canal) => `${EN.canals}/${canal.slug}`

const BRIDGE_DETAILS = {
  kortjewantsbrug: 'A flood lock sits next to this bridge. The bridge and the lock are separate structures: a dimension of the lock is not automatically the clearance of the bridge.',
  kikkerbilssluis: 'The Rijkswaterstaat FIS source also calls this bridge Kikkerbilsluisbrug. Use the bridge number to compare the municipal map with the recorded opening.',
  latjesbrug: 'Check both the closed height and the available width before you set off. A boat that fits under the deck can still be too wide for the recorded opening.',
  'magere-brug': 'A route past the Magere Brug depends on the dimensions of your own boat. The closed clearance does not tell you when the bridge opens; check current waterway information for that.',
  torontobrug: 'The source lists several openings. The smallest known height and width may come from different openings, so the source record for each dimension is shown below.',
  berlagebrug: 'For a bridge with several openings, check which opening belongs to your lane. The cautious summary below does not guarantee that every opening has the same dimensions.',
  westerkeersluis: 'The municipal name is Westerkeersluis; the FIS bridge record uses Westerkeersluisbrug. Bridge data is matched on bridge number, separately from other hydraulic structures.',
  vluchthavenbrug: 'The navigable opening may lie off-centre within the bridge outline. Boottracker links the dimensions to the bridge geometry and the available fairways; check the intended passage before departure.',
}
const CANAL_INTROS = {
  prinsengracht: 'The Prinsengracht is part of the Amsterdam canal ring. Besides boat dimensions that fit, a route along this canal needs attention to the recorded direction of travel and the bridges on your stretch.',
  herengracht: 'The Herengracht connects to several cross canals. Its profile does not automatically apply to a side canal, so check the whole route rather than only the canal you start on.',
  keizersgracht: 'On the Keizersgracht, the connection you choose decides which bridges you pass. A general maximum boat width for the canal does not replace checking each individual opening.',
  'nieuwe-herengracht': 'On the municipal profile map, the Nieuwe Herengracht has a wider profile than the Herengracht. They are separate waterways: search with the full name and check the bridges on your connection.',
  achtergracht: 'The Achtergracht is profile E on the municipal map. The width of fairway to keep clear is not the same as the maximum width of your boat, especially at junctions.',
  bloemgracht: 'The Bloemgracht is classed as profile C, so its maximum vessel dimensions differ from profile B on the Prinsengracht. A boat that fits there is not automatically suitable for the Bloemgracht.',
}
const BRIDGE_TYPES = {
  'Vaste brug': 'Fixed bridge', 'Gewone normale vaste brug': 'Fixed bridge', 'Beweegbare brug': 'Movable bridge',
  Duikerbrug: 'Culvert bridge', Boogbrug: 'Arch bridge', Hangbrug: 'Suspension bridge', 'Drijvende brug': 'Floating bridge',
  Tuibrug: 'Cable-stayed bridge', Vakwerkbrug: 'Truss bridge', Onbekend: 'Unknown',
}
const HEIGHT_BASIS = {
  'Berekend bij gemeentelijk winterpeil': 'Calculated at the municipal winter water level',
  'Nominale FIS-hoogte, gesloten stand': 'Nominal FIS height, closed position',
  'Geen betrouwbare hoogte beschikbaar': 'No reliable height available',
}

const intro = (title, text) => `<section class="guide-hero"><p class="eyebrow">Amsterdam · Boating information</p><h1>${escape(title)}</h1><p class="lead">${escape(text)}</p></section>`
const cards = (guides, pathFor) => `<div class="guide-grid">${guides.map((guide) => `<article><h2><a href="${pathFor(guide)}">${escape(guide.name)}</a></h2><p>${escape(guide.number || `Waterway profile ${guide.profile}`)}</p><a href="${pathFor(guide)}">View ${guide.number ? 'bridge data' : 'waterway profile'} →</a></article>`).join('')}</div>`
const planner = `<section class="guide-section"><h2>Plan your route with your own boat dimensions</h2><p>Enter height, width and length, then check the bridges and known restrictions along the whole route. Not all data is known; missing data does not mean a passage is suitable.</p><a class="button" href="/?planner=1">Open the route planner ↗</a></section>`
const profileTable = (codes) => `<div class="table-scroll"><table class="guide-table"><caption>Maximum vessel dimensions according to the municipal profile map</caption><thead><tr><th scope="col">Profile</th><th scope="col">Boat length</th><th scope="col">Boat width</th><th scope="col">Profile depth relative to NAP</th></tr></thead><tbody>${codes.map((code) => { const p = WATERWAY_PROFILES[code]; return `<tr><th scope="row">${escape(code)}</th><td>${meters(p.maxLength)}</td><td>${meters(p.maxWidth)}</td><td>${escape(p.depthNap.toLocaleString('en-GB'))} m NAP</td></tr>` }).join('')}</tbody></table></div>`
const profileNotes = `<p>The profile depth is a depth relative to NAP (the Dutch reference level). It is not a current permitted draught: water level, the canal bed and clearance under the keel matter too. The dimensions apply to the vessel, not to the width of the canal.</p><p>Source: ${sourceLink(PROFILE_SOURCE_URL, 'City of Amsterdam, Uitvoeringsplan Transport over Water, figure 5, page 9')} (Dutch). Check the ${sourceLink('https://www.amsterdam.nl/ondernemen/passagiers-beroepsvaart/beroepsvaart/', 'current municipal information on waterway profiles')} for changes and any permits.</p>`

function bridgeContent(bridge, { bridgeCollection } = {}) {
  const feature = bridgeCollection?.features?.find((item) => item.properties?.number === bridge.number)
  const data = bridgePageData(feature, bridgeCollection?.fetchedAt)
  const facts = `<table class="guide-table"><caption>Available source data for ${escape(bridge.name)}</caption><tbody>${row('Bridge number', bridge.number)}${row('Type', BRIDGE_TYPES[data.type] || data.type)}${row('Clearance height', meters(data.height))}${row('Height basis', HEIGHT_BASIS[data.heightBasis] || data.heightBasis)}${row('Passage width', meters(data.width))}</tbody></table>`
  const fetched = data.fetchedAt
    ? `Source data retrieved on ${escape(new Date(data.fetchedAt).toLocaleString('en-GB', { timeZone: 'Europe/Amsterdam', dateStyle: 'long', timeStyle: 'short' }))}. This is when the data was fetched, not the date of a new measurement.`
    : 'Retrieval time of the source data unknown.'
  return intro(`${bridge.name}: clearance and passage width`, BRIDGE_DETAILS[bridge.slug]) + `<section class="guide-section">${facts}${!feature ? '<p role="status">The source data is temporarily unavailable. No dimensions are estimated.</p>' : ''}<p>${fetched}</p><h2>Where do these dimensions come from?</h2><p>${sourceLink('https://api.data.amsterdam.nl/v1/civieleconstructies/v1/', 'City of Amsterdam: Civiele Constructies')}${data.heightSource ? ` · ${sourceLink(data.heightSource, 'Rijkswaterstaat: height source record')}` : ''}${data.widthSource ? ` · ${sourceLink(data.widthSource, 'Rijkswaterstaat: width source record')}` : ''}</p>${data.heightOpening ? `<p>Height record: ${escape(data.heightOpening)}.</p>` : ''}${data.widthOpening ? `<p>Width record: ${escape(data.widthOpening)}.</p>` : ''}<h2>Will my boat fit under this bridge?</h2><p>Compare the height of your boat, including anything that sticks up, with the available clearance. The planner adds a 0.15 m height margin and lowers clearances when the measured water level is above target. The figure on this page is not a live water-level measurement. For bridges with several openings, Boottracker shows the smallest known source value for each dimension; height and width may belong to different openings.</p><p>A movable bridge does not open on request. Operating hours and closures are published on ${sourceLink('https://www.vaarweginformatie.nl/', 'Rijkswaterstaat Vaarweginformatie')} (Dutch).</p><a href="/?bridge=${escape(bridge.number)}" class="button">View this bridge on the map ↗</a></section>${planner}<section class="guide-section"><h2>Further reading</h2><p><a href="${EN.clearance}">How does bridge clearance work?</a> · <a href="${EN.bridges}">All bridge pages</a></p></section>`
}

function canalContent(canal) {
  return intro(`Boating on the ${canal.name}`, CANAL_INTROS[canal.slug]) + `<section class="guide-section"><h2>Which waterway profile applies to the ${escape(canal.name)}?</h2>${profileTable([canal.profile])}${profileNotes}<h2>From canal profile to a suitable route</h2><p>Profile ${escape(canal.profile)} limits vessel dimensions on this waterway. Also check the profiles of connecting canals, local signs, directions of travel and closures. A narrower bridge opening can be decisive even when your boat fits the canal profile.</p><p><a href="${EN.profiles}">Compare all profile classes</a> · <a href="${EN.bridges}">View available bridge data</a></p></section>${planner}<section class="guide-section"><h2>Other canals</h2>${cards(CANAL_GUIDES.filter((item) => item !== canal).slice(0, 3), canalPath)}</section>`
}

const plannerLanding = () => `<section class="hero"><div><p class="eyebrow">Amsterdam · Boat route planner</p><h1>Your route through the Amsterdam canals.</h1><p class="lead">Plan a boat route in Amsterdam on a map that brings together bridges, clearance heights and boat positions. From a trip along the Prinsengracht to a link via the Nieuwe Herengracht.</p><div class="actions"><a class="button" href="/?planner=1">Plan your route <span aria-hidden="true">↗</span></a><a class="text-link" href="/">Open the map →</a></div><p class="caption">The map and route planner work without an account.</p></div><div class="canal-graphic" aria-hidden="true"><span class="canal-label label-a">Prinsengracht</span><span class="canal-label label-b">Herengracht</span><svg viewBox="0 0 400 400" fill="none"><path d="M-50 90Q200 40 240 450M-20 160Q140 90 160 450M-50 240Q80 160 80 450" stroke="#93c5fd" stroke-opacity=".28" stroke-width="32"/><path d="M400 50Q150 120 20 340" stroke="#93c5fd" stroke-opacity=".28" stroke-width="26"/><path d="M38 313Q120 200 205 143Q223 220 230 296" stroke="#22d3ee" stroke-width="5" stroke-linecap="round" stroke-dasharray="8 10"/><circle cx="38" cy="313" r="10" fill="#22d3ee" stroke="#0b1625" stroke-width="4"/><circle cx="230" cy="296" r="10" fill="#fcd34d" stroke="#0b1625" stroke-width="4"/></svg><span class="graphic-note">Your next trip starts here</span></div></section>
<section class="feature-grid" aria-label="Features"><article><span class="feature-number">01 / ROUTE</span><h2>From departure to destination</h2><p>Pick points on the map or search for an address. See the distance and an estimated sailing time based on your chosen speed.</p></article><article><span class="feature-number">02 / BRIDGES</span><h2>A route that fits your boat</h2><p>Enter your boat dimensions and see the available bridge data along your route. The planner takes the restrictions in the map data into account, including the current water level.</p></article><article><span class="feature-number">03 / LIVE AIS</span><h2>More insight on the water</h2><p>See received AIS boat positions on the map. Visibility depends on AIS transmissions and on receiving those signals.</p></article></section>
<section class="split-section"><div><p class="eyebrow">How it works</p><h2>Planning a boat route in Amsterdam</h2><p>Boottracker is built for planning and viewing routes on the water. The map combines Amsterdam fairways with available bridge data, live waterway notices and AIS information.</p><a class="text-link" href="/?planner=1">Open the Amsterdam route planner →</a></div><ol class="steps"><li><strong>Choose your start and end point</strong><span>Search for a place or tap the points on the map.</span></li><li><strong>Enter your boat and speed</strong><span>Use the dimensions of the boat you will be sailing.</span></li><li><strong>Check the route and bridges</strong><span>Review the available clearance heights, distance and estimated sailing time.</span></li></ol></section>
<section class="guide-section"><h2>Prepare your trip</h2><p>See <a href="${EN.bridges}">bridge heights and widths</a>, compare <a href="${EN.canals}">canal profiles</a> and read how <a href="${EN.clearance}">water level and bridge clearance</a> relate.</p></section><section class="faq"><p class="eyebrow">Good to know</p><h2>Questions about the route planner</h2><details open><summary>Can I use the route planner without an account?</summary><p>Yes. The map and route planner are public. You can sign in for account features, such as saving personal settings.</p></details><details><summary>Which canals can I find on the map?</summary><p>Among others the Prinsengracht, Keizersgracht, Herengracht and Nieuwe Herengracht. Which route is possible depends on the recorded fairways, restrictions and your boat settings.</p></details><details><summary>Are all bridge heights and closures known?</summary><p>Not every bridge has complete data. Check the restrictions shown and the situation on site; signs, instructions from the waterway authority and the actual water level always take precedence.</p></details><details><summary>Do I need a boating licence?</summary><p>Boottracker does not check licences or permits. On the busy IJ (zone 3) the planner only routes through when you allow it, because extra rules apply there.</p></details></section>`

function bridgesOverview() {
  return intro('Bridges in Amsterdam: height and width', 'Compare the available source dimensions of these bridges. Each bridge page states whether a height was calculated at the winter water level or recorded as a nominal closed height.') + cards(BRIDGE_GUIDES, bridgePath) + `<section class="guide-section"><h2>How to read the dimensions</h2><p>A height relative to NAP is not the same as space above the water. Read the <a href="${EN.clearance}">explanation of bridge height and water level</a>. This selection is not a complete list of Amsterdam bridges; the map contains many more.</p></section>${planner}`
}

function canalsOverview() {
  return intro('Amsterdam canals and waterway profiles', 'A suitable route depends on the length and width of your boat and on the bridges along the way. See the profile limits and practical points for these canals.') + cards(CANAL_GUIDES, canalPath) + `<section class="guide-section"><h2>Not every stretch has the same limit</h2><p>A profile belongs to a waterway or a stretch of one. Connecting canals can have different limits. These pages only use profiles that are recorded unambiguously; missing profiles are not estimated.</p><a href="${EN.profiles}">About the profile classes →</a></section>${planner}`
}

function clearanceGuide() {
  return intro('Calculating bridge clearance in Amsterdam', 'The space under a bridge changes with the water level. Always check whether a source gives a height relative to NAP, a height calculated at the winter water level, or a nominal clearance.') + `<section class="guide-section"><h2>From NAP height to free height</h2><p>Free height is the underside of the bridge deck relative to NAP minus the water level relative to NAP. Worked example, not a real bridge measurement: underside +1.60 m NAP and water level −0.40 m NAP gives 2.00 m of free height. If the water rises 0.10 m, 1.90 m remains.</p><h2>What do the heights in Boottracker mean?</h2><p>Municipal NAP heights are only converted when a winter water level is known. Additional FIS heights are nominal heights of an opening in the closed position. Heights on the bridge pages are not adjusted continuously. The route planner does use the Rijkswaterstaat gauge at Surinamekade: when the water stands above the target level of NAP −0.40 m, it lowers the clearance of bridges measured against that level. Low water never adds clearance.</p><h2>Which boat height should I enter?</h2><p>Use the height from the waterline to the highest fixed or raised part, including a canopy or antenna. The planner adds a 0.15 m height margin. Include width and length too: enough height alone does not make a passage suitable.</p><h2>If a bridge has to open</h2><p>Check operating hours and current closures at ${sourceLink('https://www.vaarweginformatie.nl/', 'Rijkswaterstaat Vaarweginformatie')} (Dutch). A nominal height and a calculated route do not confirm that a bridge will open.</p><p><a href="${EN.bridges}/kortjewantsbrug">Example: source dimensions of the Kortjewantsbrug</a> · <a href="${EN.bridges}">Bridge overview</a></p></section>${planner}`
}

function profilesGuide() {
  return intro('Amsterdam waterway profiles: which boat fits?', 'Waterway profiles set maximum vessel dimensions and the space to keep clear on a waterway. The width of the fairway is not the maximum permitted width of your boat.') + `<section class="guide-section">${profileTable(Object.keys(WATERWAY_PROFILES))}${profileNotes}<h2>Why can't a boat enter every canal?</h2><p>A boat can physically fit under a bridge and still fall outside the permitted canal profile. Compare both boat length and width with the profile. A permit for larger dimensions is not applied automatically by Boottracker.</p><h2>How does the planner use this data?</h2><p>The planner checks the boat dimensions you enter against known profile limits and local restrictions. Unknown or mixed profiles still need checking, and a missing profile is listed in the route warnings.</p><p><a href="${EN.canals}/prinsengracht">Prinsengracht: profile B</a> · <a href="${EN.canals}/bloemgracht">Bloemgracht: profile C</a> · <a href="${EN.canals}/achtergracht">Achtergracht: profile E</a></p></section>${planner}`
}

function aboutPage() {
  return intro('About Boottracker and the map data', 'Boottracker brings together the Amsterdam waterway map, a boat route planner and received AIS boat positions. Here is what the data means and where it comes from.') + `<section class="guide-section"><h2>Bridges and waterways</h2><p>Municipal bridge objects come from ${sourceLink('https://api.data.amsterdam.nl/v1/civieleconstructies/v1/', 'Amsterdam Civiele Constructies')}. Missing bridge dimensions are filled in where possible from ${sourceLink('https://geo.rijkswaterstaat.nl/services/ogc/gdr/fis_vnds/ogc/features/v1/collections', 'Rijkswaterstaat FIS')}, after checking identity and location. Fairways are based on OpenStreetMap and additional Rijkswaterstaat NWB waterways.</p><h2>Live water level and notices</h2><p>The current water level comes from the Rijkswaterstaat gauge at Amsterdam Surinamekade. Closures and other restrictions come from official Rijkswaterstaat waterway notices and are refreshed every minute while you use the map.</p><h2>Verifiable dimensions</h2><p>The <a href="${EN.bridges}">bridge pages</a> link to a source for each available dimension. The <a href="${EN.profiles}">profile guide</a> refers to the municipal map. The retrieval time of data is not a new measurement. When a dimension is unknown, we do not show an estimate.</p><h2>AIS is not a guaranteed live location</h2><p>A boat only appears when a position is available. The AIS transmitter can be switched off and signals can be missing or delayed. A missing signal does not mean the boat is not sailing.</p><h2>Limits of the route planner</h2><p>Not all bridge openings, water levels and waterway profiles are fully available. Signs, instructions from the waterway authority, the actual water level and the situation on site always take precedence. Boottracker is not an official waterway authority and does not confirm bridge operation or permits.</p></section>`
}

const page = (path, nlPath, title, description, content) => [path, { title, description, nlPath, content }]

export const ENGLISH_PAGES = Object.fromEntries([
  page(EN.planner, '/amsterdam-routeplanner', 'Amsterdam boat route planner for the canals | Boottracker', 'Planning a boat trip in Amsterdam? Plan a canal route with bridge clearances, your boat dimensions, sailing time, live waterway notices and AIS positions.', plannerLanding),
  page(EN.bridges, '/bruggen-amsterdam', 'Amsterdam bridges: clearance height and width | Boottracker', 'See Amsterdam bridges with available clearance heights, widths and source records. Learn how water level and openings decide whether your boat can pass.', bridgesOverview),
  page(EN.canals, '/grachten-amsterdam', 'Amsterdam canals: waterway profiles and boat sizes | Boottracker', 'See waterway profiles for Amsterdam canals. Compare maximum boat length and width and open the route planner.', canalsOverview),
  page(EN.clearance, '/doorvaarthoogte-amsterdam', 'Bridge clearance in Amsterdam: NAP, water level and boat height | Boottracker', 'How do you work out the free height under an Amsterdam bridge? NAP, winter water level, nominal bridge heights and the height of your boat explained.', clearanceGuide),
  page(EN.profiles, '/vaarprofielen-amsterdam', 'Amsterdam waterway profiles: maximum boat length and width | Boottracker', 'What do waterway profiles A1 to E® mean? Compare maximum vessel dimensions and learn why profile depth is not the current water depth.', profilesGuide),
  page(EN.about, '/over-boottracker', 'About Boottracker: map sources and methods | Boottracker', 'Which sources Boottracker uses for the Amsterdam waterway map, bridge data, waterway profiles, water level and AIS positions, and where the data has limits.', aboutPage),
  ...BRIDGE_GUIDES.map((bridge) => page(bridgePath(bridge), bridge.path, `${bridge.name}, Amsterdam: clearance height and width | Boottracker`, `Available clearance dimensions of the ${bridge.name} (${bridge.number}) in Amsterdam, with source records, an explanation of closed height and a link to the map.`, (ctx) => bridgeContent(bridge, ctx))),
  ...CANAL_GUIDES.map((canal) => page(canalPath(canal), canal.path, `Boating on the ${canal.name}: waterway profile and boat size | Boottracker`, `Planning a route on the ${canal.name} in Amsterdam? See profile ${canal.profile}, maximum boat length and width, and what to watch for at bridges.`, () => canalContent(canal))),
])

export const ENGLISH_PARENTS = [
  [`${EN.bridges}/`, EN.bridges, 'Amsterdam bridges'],
  [`${EN.canals}/`, EN.canals, 'Amsterdam canals'],
]

export const ENGLISH_NAV_LINKS = `<a href="${EN.planner}">Route planner</a><a href="${EN.bridges}">Bridges</a><a href="${EN.canals}">Canals</a><a href="${EN.clearance}">Bridge clearance</a><a href="${EN.profiles}">Waterway profiles</a><a href="${EN.about}">Sources</a>`
export const ENGLISH_HOME = EN.planner

export function englishPageContent(path, context = {}) {
  const definition = ENGLISH_PAGES[path]
  if (!definition) throw new Error('Unknown English page')
  return definition.content(context)
}
