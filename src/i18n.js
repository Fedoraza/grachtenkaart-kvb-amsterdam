import { nextTick, reactive, watch } from 'vue'

const STORAGE_PREFIX = 'boat-tracker-language:'

const phrases = [
  ['Account', 'Profiel'], ['Search', 'Zoeken'], ['Hide', 'Verbergen'], ['Clear', 'Wissen'], ['Close', 'Sluiten'], ['Find', 'Zoek'],
  ['Schedule', 'Planning'], ['Company fleet', 'Bedrijfsvloot'], ['Fleet directory', 'Vlootoverzicht'], ['Add boat', 'Boot toevoegen'],
  ['My boat', 'Mijn boot'], ['My boat & list', 'Mijn boot & lijst'], ['Boat assignments and lists', 'Boottoewijzingen en lijsten'],
  ['Search for a person', 'Persoon zoeken'], ['Search for a boat', 'Boot zoeken'], ['Type a name…', 'Typ een naam…'], ['Type a boat name…', 'Typ een bootnaam…'],
  ['Assign', 'Toewijzen'], ['Search by boat or person…', 'Zoek op boot of persoon…'], ['Not submitted', 'Niet ingestuurd'],
  ['Submitted, not restocked', 'Ingestuurd, niet bijgevuld'], ['Visited', 'Geweest'], ['Mark visited', 'Markeer geweest'], ['Undo', 'Ongedaan maken'],
  ['Delete', 'Verwijder'], ['No boats found.', 'Geen boten gevonden.'], ['No boat assignments for this date.', 'Geen boottoewijzingen voor deze datum.'],
  ['Not submitted yet', 'Nog niet ingestuurd'], ['Save draft', 'Concept bewaren'], ['Submit list', 'Lijst insturen'], ['No list completed yet.', 'Nog geen lijst ingevuld.'],
  ['Choose a date to view assigned boats and lists.', 'Kies een datum om de toegewezen boten en lijsten te bekijken.'],
  ['Daily boat', 'Dagelijkse boot'], ['Dock', 'Aanlegplaats'], ['Loading…', 'Laden…'], ['Boat', 'Boot'], ['Person', 'Persoon'],
  ['Home harbour', 'Thuishaven'], ['Choose a home harbour…', 'Kies een thuishaven…'], ['Other — define a name', 'Anders — geef een naam op'],
  ['Other harbour name', 'Naam andere haven'], ['Enter harbour name', 'Voer de havennaam in'], ['Docking location', 'Aanleglocatie'],
  ['Save changes', 'Wijzigingen opslaan'], ['Cancel', 'Annuleren'], ['Edit details', 'Gegevens bewerken'], ['Add a new boat', 'Nieuwe boot toevoegen'],
  ['Boat name', 'Bootnaam'], ['Passenger capacity', 'Passagierscapaciteit'], ['Required licence', 'Vereist vaarbewijs'], ['Length in metres', 'Lengte in meters'],
  ['Width in metres', 'Breedte in meters'], ['Open boat', 'Open boot'], ['Has toilet', 'Heeft toilet'], ['Operational notes', 'Operationele opmerkingen'],
  ['Search by boat name, MMSI or type', 'Zoek op bootnaam, MMSI of type'], ['Clear filters', 'Filters wissen'], ['Show on map', 'Toon op kaart'],
  ['No position available', 'Geen positie beschikbaar'], ['No AIS linked', 'Geen AIS gekoppeld'], ['No AIS signal recorded', 'Geen AIS-signaal geregistreerd'],
  ['Recent AIS report', 'Recent AIS-bericht'], ['Source report stale', 'Bronbericht verouderd'], ['Not recently received', 'Niet recent ontvangen'],
  ['Company database', 'Bedrijfsdatabase'], ['Any licence', 'Elk vaarbewijs'], ['Any toilet', 'Elk toilet'], ['Has toilet', 'Met toilet'], ['No toilet', 'Geen toilet'],
  ['Any rating', 'Elke beoordeling'], ['Any AIS freshness', 'Elke AIS-actualiteit'], ['Report within 15 min', 'Bericht binnen 15 min'],
  ['No report for 24h+', 'Geen bericht in 24u+'], ['Type', 'Type'], ['Licence', 'Vaarbewijs'], ['Dimensions', 'Afmetingen'], ['Capacity', 'Capaciteit'],
  ['Propulsion', 'Aandrijving'], ['Unknown', 'Onbekend'], ['Not set', 'Niet ingesteld'], ['Yes', 'Ja'], ['No', 'Nee'], ['Niceness', 'Beoordeling'],
  ['Boat schedule', 'Bootplanning'], ['Previous day', 'Vorige dag'], ['Next day', 'Volgende dag'], ['Today', 'Vandaag'], ['Rescan', 'Opnieuw scannen'],
  ['Import a schedule image', 'Planningafbeelding importeren'], ['Choose a schedule screenshot', 'Kies een screenshot van de planning'],
  ['Schedule date', 'Planningsdatum'], ['Import at location', 'Importeren op locatie'], ['Recognized schedule rows', 'Herkende planningregels'],
  ['Add driver', 'Schipper toevoegen'], ['Add row', 'Regel toevoegen'], ['Import schedule', 'Planning importeren'], ['No schedule for this day', 'Geen planning voor deze dag'],
  ['Day operations', 'Dagoperatie'], ['Location', 'Locatie'], ['boats', 'boten'], ['rows', 'regels'], ['Map', 'Kaart'], ['Driver', 'Schipper'], ['Host', 'Host'],
  ['User administration', 'Gebruikersbeheer'], ['Your account', 'Jouw profiel'], ['Add user', 'Gebruiker toevoegen'], ['Create an account', 'Account aanmaken'],
  ['Full name', 'Volledige naam'], ['Email address', 'E-mailadres'], ['Password', 'Wachtwoord'], ['Confirm password', 'Bevestig wachtwoord'],
  ['Role', 'Rol'], ['Create user', 'Gebruiker aanmaken'], ['Accounts', 'Accounts'], ['Refresh', 'Vernieuwen'], ['Change password', 'Wachtwoord wijzigen'],
  ['New password', 'Nieuw wachtwoord'], ['Confirm new password', 'Bevestig nieuw wachtwoord'], ['Cancel', 'Annuleren'], ['Sign out', 'Uitloggen'],
  ['Administrators', 'Beheerders'], ['Viewers', 'Kijkers'], ['Active', 'Actief'], ['All roles', 'Alle rollen'], ['English', 'Engels'], ['Dutch', 'Nederlands'],
  ['Language', 'Taal'], ['Route planning', 'Route plannen'], ['Map filters', 'Vaarkaartfilters'], ['Click start', 'Klik start'], ['Click end', 'Klik eind'],
  ['Start address or place', 'Startadres of plek'], ['End address or place', 'Eindadres of plek'], ['Search canals and boats', 'Zoek grachten en boten'],
  ['Canal, boat name or MMSI', 'Gracht, bootnaam of MMSI'], ['Live AIS', 'Live AIS'], ['Show vessels', 'Toon vaartuigen'], ['All AIS vessels', 'Alle AIS-vaartuigen'],
  ['New group name', 'Naam nieuwe groep'], ['Add', 'Toevoegen'], ['Delete group', 'Groep verwijderen'], ['Find live vessel or MMSI', 'Zoek live vaartuig of MMSI'],
  ['Unnamed vessel', 'Naamloos vaartuig'], ['Saved, currently offline', 'Opgeslagen, momenteel offline'], ['Close details', 'Details sluiten'],
  ['Expand details', 'Details uitklappen'], ['Collapse details', 'Details inklappen'], ['Close details and history', 'Details en geschiedenis sluiten'],
  ['Stock remaining', 'Resterende voorraad'], ['complete/unused boxes', 'complete/ongebruikte dozen'], ['Beer', 'Bier'], ['Wine', 'Wijn'], ['Soda', 'Frisdrank'],
  ['Small silver bowl?', 'Kleine zilveren schaal?'], ['Big silver bowl?', 'Grote zilveren schaal?'], ['Is it complete?', 'Is deze compleet?'],
  ['Amount of Merlot', 'Aantal Merlot'], ['Water', 'Water'], ['Extra stock needed to complete a box', 'Extra voorraad nodig om een doos compleet te maken'],
  ['Complete every field before submitting.', 'Vul elk veld in voordat je instuurt.'], ['Describe what is needed, or enter None', 'Beschrijf wat nodig is, of vul Geen in'],
  ['Boat assigned.', 'Boot toegewezen.'], ['Choose a person from the search results.', 'Kies een persoon uit de zoekresultaten.'], ['Choose a boat from the search results.', 'Kies een boot uit de zoekresultaten.'],
  ['List — one item per line', 'Lijst — één regel per item'], ['For example:', 'Bijvoorbeeld:'], ['Refill fuel', 'Brandstof bijvullen'], ['Check life jackets', 'Reddingsvest controleren'],
  ['Report port-side damage', 'Schade bakboord melden'], ['Map object management', 'Kaartobject beheren'], ['Name', 'Naam'], ['Number / code', 'Nummer / code'],
  ['Choose position on map', 'Kies positie op kaart'], ['Click the new position on the map.', 'Klik nu de nieuwe positie op de kaart.'], ['Save for everyone', 'Opslaan voor iedereen'],
  ['Delete point and reports', 'Punt en meldingen verwijderen'], ['Delete connection', 'Verwijder koppeling'], ['Click blue line', 'Klik blauwe lijn'],
  ['Choose direction with arrow on map', 'Kies richting met pijl op kaart'], ['Click the direction on the map…', 'Klik nu de richting op de kaart…'],
  ['Plan route', 'Route plannen'], ['Search an address or click start/end on the map.', 'Zoek een adres of klik start/eind op de kaart.'],
  ['Speed', 'Snelheid'], ['Distance', 'Afstand'], ['Sailing time', 'Vaartijd'], ['Traffic', 'Drukte'], ['No bridges directly under this route.', 'Geen bruggen direct onder deze route gevonden.'],
  ['No reporting points found in this sailing direction.', 'Geen meldpunten in deze vaarrichting gevonden.'], ['Name for this route', 'Naam voor deze route'],
  ['Cancel', 'Annuleer'], ['No canals, bridges or boats found.', 'Geen grachten, bruggen of boten gevonden.'], ['Map', 'Kaart'], ['Bridge', 'Brug'],
  ['Bridge number', 'Brugnummer'], ['Height', 'Hoogte'], ['From', 'Van'], ['To', 'Naar'], ['No address found.', 'Geen adres gevonden.'],
  ['Select at least one additional route point.', 'Kies nog minimaal één extra routepunt.'], ['Click the map to choose a start point and destination on the water.', 'Klik op de kaart om een startpunt en eindpunt op het water te kiezen.'],
]

const exact = { en: new Map(), nl: new Map() }
for (const [english, dutch] of phrases) {
  exact.en.set(english, english); exact.en.set(dutch, english)
  exact.nl.set(english, dutch); exact.nl.set(dutch, dutch)
}

export function createLanguage() {
  const state = reactive({ locale: 'en', userKey: 'guest' })
  state.setUser = (user) => {
    state.userKey = user?.id ? `user-${user.id}` : 'guest'
    state.locale = localStorage.getItem(`${STORAGE_PREFIX}${state.userKey}`) === 'nl' ? 'nl' : 'en'
  }
  state.setLocale = (locale) => {
    state.locale = locale === 'nl' ? 'nl' : 'en'
    localStorage.setItem(`${STORAGE_PREFIX}${state.userKey}`, state.locale)
  }
  return state
}

export function installDomTranslations(root, language) {
  let frame = 0
  const translateTree = () => {
    if (!root) return
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) translateTextNode(walker.currentNode, language.locale)
    for (const element of root.querySelectorAll('[placeholder], [title], [aria-label]')) {
      for (const attribute of ['placeholder', 'title', 'aria-label']) {
        if (!element.hasAttribute(attribute)) continue
        const current = element.getAttribute(attribute)
        const translated = translateValue(current, language.locale)
        if (translated !== current) element.setAttribute(attribute, translated)
      }
    }
    document.documentElement.lang = language.locale
  }
  const scheduleTranslation = () => {
    if (frame) return
    frame = requestAnimationFrame(() => { frame = 0; translateTree() })
  }
  const observer = new MutationObserver(scheduleTranslation)
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] })
  const stop = watch(() => language.locale, () => nextTick(scheduleTranslation), { immediate: true })
  return () => { observer.disconnect(); stop(); cancelAnimationFrame(frame) }
}

function translateTextNode(node, locale) {
  if (!node.nodeValue?.trim() || ['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName)) return
  const translated = translateValue(node.nodeValue, locale)
  if (translated !== node.nodeValue) node.nodeValue = translated
}

function translateValue(value, locale) {
  const leading = value.match(/^\s*/)?.[0] || ''
  const trailing = value.match(/\s*$/)?.[0] || ''
  const text = value.trim()
  if (!text) return value
  const direct = exact[locale].get(text)
  if (direct) return `${leading}${direct}${trailing}`
  let output = text
  const containedPairs = [...phrases].sort((a, b) => Math.max(b[0].length, b[1].length) - Math.max(a[0].length, a[1].length))
  for (const [english, dutch] of containedPairs) {
    const source = locale === 'nl' ? english : dutch
    const target = locale === 'nl' ? dutch : english
    if (source.length >= 10 && output.includes(source)) output = output.replaceAll(source, target)
  }
  const replacements = locale === 'nl'
    ? [[/\bboats\b/gi, 'boten'], [/\brows\b/gi, 'regels'], [/\bLast signal\b/gi, 'Laatste signaal'], [/\bminutes? ago\b/gi, 'minuten geleden'], [/\bShowing\b/gi, 'Getoond'], [/\bSubmitted\b/gi, 'Ingestuurd'], [/\bnot restocked\b/gi, 'nog niet bijgevuld'], [/\bVisited\b/gi, 'Geweest']]
    : [[/\bboten\b/gi, 'boats'], [/\bregels\b/gi, 'rows'], [/\bLaatste signaal\b/gi, 'Last signal'], [/\bminuten geleden\b/gi, 'minutes ago'], [/\bGetoond\b/gi, 'Showing'], [/\bIngestuurd\b/gi, 'Submitted'], [/\bnog niet bijgevuld\b/gi, 'not restocked'], [/\bGeweest\b/gi, 'Visited']]
  for (const [pattern, replacement] of replacements) output = output.replace(pattern, replacement)
  return `${leading}${output}${trailing}`
}
