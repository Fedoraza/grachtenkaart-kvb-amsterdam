import { nextTick, reactive, watch } from 'vue'

const STORAGE_PREFIX = 'boat-tracker-language:'

const phrases = [
  ['Please note: the schedule may differ', 'Let op: planning kan afwijken'],
  ['This schedule is read automatically from shared schedule images. Names and times may be misread, and later changes may be missing. Check the current schedule with the organiser.', 'Deze planning wordt automatisch uit gedeelde planningsafbeeldingen gelezen. Daarbij kunnen namen en tijden verkeerd worden herkend en latere wijzigingen ontbreken. Controleer de actuele planning bij de organisator.'],
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

phrases.push(
  ['Test version', 'Testversie'], ['Continue as guest', 'Doorgaan als gast'], ['Loading map…', 'Kaart laden…'],
  ['Boat inventory', 'Bootvoorraad'], ['Stock management', 'Voorraadbeheer'], ['Inventory', 'Voorraad'],
  ['Issue stock to a boat', 'Voorraad aan een boot meegeven'], ['Stock location', 'Voorraadlocatie'],
  ['Choose harbour / warehouse', 'Kies haven / magazijn'], ['Search boat', 'Boot zoeken'],
  ['Type boat name or date…', 'Typ bootnaam of datum…'], ['Selected:', 'Geselecteerd:'],
  ['Search products or boxes…', 'Zoek producten of dozen…'], ['selected', 'geselecteerd'],
  ['No products found.', 'Geen producten gevonden.'], ['Issue & deduct', 'Uitgeven en afboeken'],
  ['Adjust stock', 'Voorraad aanpassen'], ['Save adjustment', 'Aanpassing opslaan'],
  ['Stock conversion', 'Voorraad ompakken'], ['Pack or unpack mixed boxes', 'Gemengde dozen in- of uitpakken'],
  ['Choose location', 'Kies locatie'], ['Choose mixed box', 'Kies gemengde doos'],
  ['Pack boxes', 'Dozen inpakken'], ['Unpack boxes', 'Dozen uitpakken'],
  ['Inventory settings', 'Voorraadinstellingen'], ['Locations and product catalogue', 'Locaties en productcatalogus'],
  ['Add location', 'Locatie toevoegen'], ['Harbour', 'Haven'], ['Warehouse', 'Magazijn'],
  ['Product categories', 'Productcategorieën'], ['No categories yet.', 'Nog geen categorieën.'],
  ['Add product or bulk box', 'Product of voorraadbox toevoegen'], ['No category', 'Geen categorie'],
  ['This is a bulk product / box', 'Dit is een voorraadproduct / doos'],
  ['Contained product', 'Product in de doos'], ['+ Contents', '+ Inhoud'], ['Add product', 'Product toevoegen'],
  ['Product catalogue', 'Productcatalogus'], ['Edit product', 'Product bewerken'],
  ['Current stock', 'Huidige voorraad'], ['No stock recorded.', 'Geen voorraad geregistreerd.'],
  ['My boat', 'Mijn boot'], ['& list', '& lijst'], ['Search inventory products…', 'Zoek voorraadproducten…'],
  ['Assignment removed.', 'Toewijzing verwijderd.'], ['Assignment saved.', 'Toewijzing opgeslagen.'],
  ['New list received live.', 'Nieuwe lijst live ontvangen.'], ['List overview updated live.', 'Lijstoverzicht live bijgewerkt.'],
  ['Not submitted', 'Niet ingestuurd'], ['Submitted', 'Ingestuurd'], ['not restocked', 'nog niet bijgevuld'],
  ['Mark visited', 'Markeer geweest'], ['Unmark', 'Ongedaan maken'],
  ['No reporting movement configured yet. Add one and select both sides on the map.', 'Nog geen vaarbeweging ingesteld. Voeg er één toe en wijs beide kanten aan op de kaart.'],
  ['Step 1 · Place the point', 'Stap 1 · Plaats het punt'],
  ['Choose the junction or bend on the map. After saving, draw the straight passage or turn for each arrival direction.', 'Kies de kruising of bocht op de kaart. Na opslaan teken je per aankomstrichting rechtdoor of een afslag.'],
  ['Description / report', 'Omschrijving / melding'], ['Permanently closed · do not use for routes', 'Blijvend afgesloten · niet gebruiken voor routes'],
  ['Maximum speed (km/h)', 'Maximumsnelheid (km/u)'], ['Sailing direction', 'Vaarrichting'],
  ['Both directions', 'Beide richtingen'], ['Only along the drawn line', 'Alleen met de getekende lijn mee'],
  ['Only against the drawn line', 'Alleen tegen de getekende lijn in'],
  ['Edit position: drag the points on the map', 'Ligging aanpassen: sleep de punten op de kaart'],
  ['Add temporary closure on this line', 'Tijdelijke stremming op deze lijn toevoegen'],
  ['This closure is avoided by the route planner. Without an end time it stays active until removed.', 'Deze stremming wordt door de routeplanner vermeden. Zonder eindtijd blijft hij actief totdat je hem verwijdert.'],
  ['Starts (local time)', 'Begint (lokale tijd)'], ['Ends (optional)', 'Eindigt (optioneel)'],
  ['Applies to the entire selected line.', 'Geldt voor de hele geselecteerde lijn.'],
  ['Reporting numbers at this point', 'Meldingsnummers op dit punt'],
  ['Each number can have its own sailing movements and radio messages.', 'Ieder nummer kan eigen vaarbewegingen en meldteksten hebben.'],
  ['Reporting number', 'Meldingsnummer'], ['configured sailing movements', 'ingestelde vaarbewegingen'],
  ['Add at least one reporting number.', 'Voeg minimaal één meldingsnummer toe.'],
  ['Link bridge', 'Brug koppelen'], ['Link radio point', 'Marifoonpunt koppelen'],
  ['Not yet linked to a blue waterway', 'Nog niet aan een blauwe vaarlijn gekoppeld'],
  ['This point stays in its fixed location. Choose how to connect it to the blue waterway network.', 'Het punt blijft op zijn vaste plek staan. Kies hoe je het met het blauwe vaarwegnetwerk wilt verbinden.'],
  ['Drag to line', 'Sleep naar lijn'], ['Which side is the boat coming from?', 'Van welke kant komt de boot?'],
  ['Choose two places on the blue lines: before and after the reporting point. Opposite sides of the same canal can have different messages.', 'Kies twee plekken op de blauwe lijnen: vóór en na het meldpunt. Ook twee kanten van dezelfde gracht krijgen zo hun eigen melding.'],
  ['Sailing movement', 'Vaarbeweging'], ['Old setting. Select both sides on the map to convert it.', 'Oude instelling. Wijs beide kanten op de kaart aan om deze om te zetten.'],
  ['Boat arrives from', 'Boot komt vanaf'], ['Boat sails to', 'Boot vaart naar'],
  ['Movement type', 'Soort beweging'], ['Straight / crossing', 'Rechtdoor / kruisen'],
  ['Turn left', 'Linksaf'], ['Turn right', 'Rechtsaf'], ['Turn around', 'Keren'],
  ['What should the skipper report?', 'Wat meldt de schipper?'],
  ['+ Turn from this side', '+ Afslag vanaf deze kant'], ['+ Opposite direction', '+ Tegengestelde richting'],
  ['+ Add sailing movement on map', '+ Vaarbeweging op kaart toevoegen'],
  ['Save sailing movements and reports', 'Vaarbewegingen en meldingen opslaan'],
  ['Green is the arrival side; blue is the onward direction. The route must pass them in that order. Drag the labels to change the places.', 'Groen is de aankomstkant, blauw is de vervolgrichting. De route moet ze in deze volgorde passeren. Sleep de labels om de plekken te wijzigen.'],
  ['Start at my location', 'Start mijn locatie'], ['For an AIS start: tap a boat on the map. It remains available here as a starting point.', 'Voor AIS-start: klik een boot op de kaart. Daarna blijft die boot hier beschikbaar als startpunt.'],
  ['Loop within', 'Rondje binnen'], ['Generate loop', 'Genereer rondje'],
  ['Height m', 'Hoogte m'], ['Width m', 'Breedte m'], ['Draft m', 'Diepgang m'],
  ['Allow zone 3 / IJ', 'Zone 3 / IJ toestaan'],
  ['Only enable this when the skipper and boat are permitted to sail there.', 'Alleen aanzetten als de schipper en boot hier mogen varen.'],
  ['Default 6 km/h for the canals. The route avoids known restrictions, one-way traffic and active closure points. Height includes a 15 cm safety margin.', 'Standaard 6 km/u voor de grachten. Route vermijdt bekende beperkingen, eenrichting en actieve stremmingspunten. Hoogte gebruikt 15 cm veiligheidsmarge.'],
  ['Restrictions on route', 'Beperkingen op route'], ['Bridges on route', 'Bruggen onder route'],
  ['Reporting points along route', 'Meldpunten richting route'], ['Selected', 'Geselecteerd'],
  ['Link this fixed point directly to a blue waterway on the map.', 'Koppel dit vaste punt rechtstreeks aan een blauwe vaarlijn op de kaart.'],
  ['Restore original link', 'Herstel oorspronkelijke koppeling'], ['Recent changes', 'Recente wijzigingen'],
  ['Retry', 'Opnieuw proberen'], ['Current closures checked.', 'Actuele stremmingen gecontroleerd.'],
  ['Saved routes', 'Opgeslagen routes'], ['Save', 'Bewaar'], ['No saved routes yet.', 'Nog geen routes opgeslagen.'],
  ['Open link', 'Open link'], ['Swap', 'Wissel'],
  ['The route uses mapped waterways, prohibited canals and one-way tags. Always check current closures and bridges.', 'Route gebruikt mapped waterwegen, verboden grachten en oneway-tags. Controleer altijd actuele stremmingen/bruggen.'],
  ['+ Own closure', '+ Eigen stremming'], ['+ Radio point on map', '+ Marifoonpunt op kaart'],
  ['Tap a blue line to close it permanently, edit its position or add a temporary closure.', 'Klik een blauwe lijn voor blijvend afsluiten, ligging aanpassen of een tijdelijke stremming.'],
  ['Closed', 'Afgesloten'], ['Restricted', 'Beperkt'], ['Warning', 'Waarschuwing'],
  ['Dashed = planned', 'Gestreept = gepland'], ['Custom routing lines', 'Eigen routeringslijnen'],
  ['Main corridor', 'Hoofdcorridor'], ['Crossing', 'Oversteek'], ['Harbour connection', 'Havenverbinding'],
  ['Drawn direction', 'Tekenrichting'], ['Against drawn direction', 'Tegen tekenrichting'],
  ['Tap at least two points on the map. Connect the line to existing blue water.', 'Klik minimaal twee punten op de kaart. Sluit de lijn aan op bestaand blauw vaarwater.'],
  ['Undo point', 'Punt terug'], ['Save line', 'Lijn opslaan'], ['New', 'Nieuw'],
  ['Back to map', 'Naar de kaart'], ['The daily fleet tournament', 'Het dagelijkse vloottoernooi'],
  ['The great kilometre race', 'De grote kilometerstrijd'],
  ['Which boat covers the most Amsterdam water kilometres today? AIS keeps score. No jury, no photo finish, and teleporting earns no points.', 'Welke boot verslindt vandaag de meeste Amsterdamse waterkilometers? AIS houdt de stand bij. Geen jury, geen fotofinish en teleporteren levert geen punten op.'],
  ['Standings for', 'Stand van'], ['Fishing kilometres out of the water…', 'Kilometers uit het water vissen…'],
  ['Place', 'Plaats'], ['measured today', 'gemeten vandaag'], ['Full standings', 'Volledige uitslag'],
  ['Kilometre eaters', 'Kilometervreters'], ['fleet boats', 'fleetboten'],
  ['Search your boat by name…', 'Zoek je boot op naam…'], ['Clear search', 'Zoekopdracht wissen'],
  ['No fleet boat found for', 'Geen fleetboot gevonden voor'], ['See more · view all', 'See more · bekijk alle'],
  ['No boat has left the dock yet', 'Nog geen boot van de kant'],
  ['No valid kilometres have been measured for this day yet.', 'Voor deze dag zijn nog geen geldige kilometers gemeten.'],
  ['Standings reliability', 'Betrouwbaarheid van de stand'],
  ['AIS reception looks good', 'AIS-ontvangst ziet er goed uit'], ['This is a partial daily result', 'Dit is een gedeeltelijke dagstand'],
  ['AIS is the referee', 'AIS is de scheidsrechter'], ['A new race at 02:00', 'Om 02:00 een nieuwe race'],
  ['No teleport bonus', 'Geen teleportbonus'],
  ['Leading water level', 'Leidende waterstand'], ['Measured', 'Gemeten'],
  ['Normal operating range:', 'Normale beheerband:'], ['Target level:', 'Streefpeil:'],
  ['· may be outdated', '· mogelijk verouderd'], ['Close water level', 'Waterstand sluiten'],
  ['Water level relative to the normal operating range', 'Waterstand ten opzichte van de normale beheerband'],
  ['Open WhatsApp with message ready', 'Open WhatsApp met ingevuld bericht'],
  ['Check the chat and tap send yourself.', 'Controleer de chat en tik zelf op verzenden.'],
  ['Verify with WhatsApp', 'Verifiëren met WhatsApp'],
  ['Open the chat with the message ready', 'Open de chat met het bericht alvast ingevuld'],
  ['Check the chat and tap Send in WhatsApp.', 'Controleer de chat en tik in WhatsApp op Verzenden.'],
  ['Or do it manually', 'Of doe het handmatig'],
  ['Open WhatsApp yourself and send the exact code below as a private message to this number.', 'Open zelf WhatsApp en stuur de exacte code hieronder als privébericht naar dit nummer.'],
  ['WhatsApp number', 'WhatsApp-nummer'], ['Verification code', 'Verificatiecode'],
  ['Copy number', 'Kopieer nummer'], ['Copy code', 'Kopieer code'],
  ['Unlinked', 'niet gekoppeld'], ['Nearest route:', 'Dichtstbijzijnde route:'],
  ['Link to route', 'Routekoppeling'], ['Edit sailing movements on map', 'Vaarbewegingen op kaart aanpassen'],
  ['Manage point and reporting numbers', 'Punt en meldingsnummers beheren'],
  ['+ Sailing movement at this point', '+ Vaarbeweging aan dit punt'],
  ['Reporting does not grant right of way.', 'Melden geeft geen voorrang.'],
  ['Own map', 'Eigen kaart'], ['Own closure', 'Eigen stremming'],
  ['No map position is available for this point.', 'Voor dit punt is geen kaartpositie beschikbaar.'],
  ['Opposite sailing movement added. Enter its own message.', 'Omgekeerde vaarbeweging toegevoegd. Vul hiervoor de andere melding in.'],
  ['Tap the blue line on the side the boat comes from, before the reporting point.', 'Klik op de blauwe lijn aan de kant waar de boot vandaan komt, vóór het meldpunt.'],
  ['Tap the blue line the boat follows after the reporting point.', 'Klik op de blauwe lijn waar de boot na het meldpunt naartoe vaart.'],
  ['Tap a blue line just before or after the reporting point (15 to 250 metres).', 'Klik op een blauwe lijn iets vóór of na het meldpunt (15 tot 250 meter).'],
  ['Arrival side selected. Now tap where the boat sails after the reporting point.', 'Aankomstkant gekozen. Klik nu waar de boot na het meldpunt naartoe vaart.'],
  ['Sailing movement selected. Check the coloured places and enter the message.', 'Vaarbeweging gekozen. Controleer de gekleurde plekken en vul de melding in.'],
  ['For each old setting, select both sides on the map first.', 'Wijs voor iedere oude instelling eerst beide kanten op de kaart aan.'],
  ['The server could not confirm the updated reporting rules. Try again.', 'De server kon de aangepaste meldregels niet bevestigen. Probeer opnieuw.'],
  ['Reporting rules for this custom point saved in this browser.', 'Meldregels voor dit eigen punt opgeslagen in deze browser.'],
  ['This radio point has no existing report to extend.', 'Dit marifoonpunt bevat geen bestaande melding om uit te breiden.'],
  ['New sailing movement for this existing radio point: choose where the boat comes from.', 'Nieuwe vaarbeweging voor dit bestaande marifoonpunt: kies waar de boot vandaan komt.'],
  ['Could not determine the next reporting number.', 'Het volgende meldingsnummer kon niet worden bepaald.'],
  ['Could not determine a new reporting number.', 'Een nieuw meldingsnummer kon niet worden bepaald.'],
  ['Failed to save radio point.', 'Marifoonpunt opslaan faalde.'],
  ['First choose a position on the map.', 'Kies eerst een positie op de kaart.'],
  ['Reporting point saved. Now select its arrival side and onward direction on the map.', 'Meldpunt opgeslagen. Wijs nu de aankomstkant en vervolgrichting aan op de kaart.'],
  ['Enter a number for every report.', 'Vul voor iedere melding een nummer in.'],
  ['Every reporting number at this point must be unique.', 'Ieder meldingsnummer op dit punt moet uniek zijn.'],
  ['Object details could not be opened.', 'Objectgegevens konden niet worden geopend.'],
  ['Drag to the correct part of the blue route and release.', 'Sleep naar het juiste stuk van de blauwe route en laat los.'],
  ['Tap the map to add the new end point.', 'Klik op de kaart om het nieuwe eindpunt toe te voegen.'],
  ['Choose a start point first, use “Start at my location”, or tap start on the map.', 'Kies eerst een startpunt, gebruik “Start mijn locatie”, of klik start op de kaart.'],
  ['Source temporarily unavailable. Last known closures are being used.', 'Bron tijdelijk niet bereikbaar. Laatst bekende stremmingen worden gebruikt.'],
  ['Some official reports could not be loaded; the remaining information is current.', 'Enkele officiële berichten konden niet worden geladen; de overige informatie is actueel.'],
  ['Closures unavailable. This route has not been checked against current closures.', 'Stremmingen niet beschikbaar. Deze route is niet op actuele stremmingen gecontroleerd.'],
  ['Share link copied. This route remains available for 7 days.', 'Deellink gekopieerd. Deze route blijft 7 dagen beschikbaar.'],
  ['Share link created. This route remains available for 7 days.', 'Deellink gemaakt. Deze route blijft 7 dagen beschikbaar.'],
  ['Failed to load shared route.', 'Gedeelde route laden faalde.'],
  ['Unknown waterway', 'Onbekende vaarweg'], ['Not yet chosen', 'Nog niet gekozen'],
  ['Waiting for GPS location. Then tap “Start at my location” again.', 'Wacht op GPS-locatie en klik daarna nogmaals op “Start mijn locatie”.'],
  ['Could not determine location', 'Locatie kon niet worden bepaald'],
  ['Could not load waterway changes.', 'Vaarlijnwijzigingen konden niet worden geladen.'],
  ['Waterway changes not loaded. The map may contain outdated waterways.', 'Vaarlijnwijzigingen niet geladen. De kaart kan verouderde vaarlijnen bevatten.'],
  ['Edit waterway / close permanently', 'Vaarlijn bewerken / blijvend afsluiten'],
  ['Add temporary closure', 'Tijdelijke stremming toevoegen'],
  ['Only an administrator can edit the shared map.', 'Alleen een beheerder kan de gedeelde kaart aanpassen.'],
  ['Daily standings', 'Dagklassement'], ['Most kilometres sailed', 'Meeste kilometers gevaren'],
  ['Standings date', 'Datum klassement'], ['Calculating distances…', 'Afstanden berekenen…'],
  ['No AIS distance found for this day.', 'Geen AIS-afstand voor deze dag gevonden.'],
  ['Complete AIS day', 'Volledige AIS-dag'], ['Incomplete AIS measurement', 'Onvolledige AIS-meting'],
  ['coverage', 'dekking'],
  ['These kilometre totals are too low because parts of the AIS reception are missing. They only cover measured periods.', 'Deze kilometerstanden zijn te laag doordat delen van de AIS-ontvangst ontbreken. Ze gelden alleen voor de gemeten perioden.'],
  ['Calculated from valid AIS movements and speed; unrealistic GPS jumps do not count.', 'Berekend uit geldige AIS-verplaatsingen en vaarsnelheid; onrealistische GPS-sprongen tellen niet mee.'],
  ['Open the full kilometre tournament →', 'Open het volledige kilometertoernooi →'],
  ['AIS reports', 'AIS-metingen'], ['No AIS reports this day', 'Geen AIS-metingen deze dag'],
  ['👻 Missing your boat? It might be sailing in stealth mode — check whether its AIS is working.', '👻 Zie je je boot niet? Misschien vaart hij in stealthmodus — check even of de AIS het wel doet.'],
  ['The AIS gateway listened nearly all day, so the ranking gives a useful picture.', 'De AIS-gateway heeft vrijwel de hele dag meegeluisterd. De ranglijst geeft daardoor een bruikbaar beeld.'],
  ['The AIS gateway missed part of the day. Distances are lower than actually sailed and only include received reports.', 'De AIS-gateway heeft een deel van de dag gemist. Afstanden zijn dan lager dan werkelijk gevaren en gelden alleen voor ontvangen meetmomenten.'],
  ['Only valid movements by fleet boats count.', 'Alleen geldige bewegingen van boten uit de fleet tellen mee.'],
  ['Boats finishing after midnight still count toward the previous sailing day. At 02:00 everyone starts from zero again.', 'Nachtelijke uitlopers tellen nog mee voor de vorige vaardag. Om twee uur springt iedereen terug naar nul.'],
  ['GPS jumps and unrealistic speeds are excluded from the results.', 'GPS-sprongen en onrealistische snelheden worden uit de uitslag gevist.'],
  ['Could not load the standings.', 'Het klassement kon niet worden geladen.'],
  ['Water level Surinamekade', 'Waterstand Surinamekade'], ['Unavailable', 'Niet beschikbaar'],
  ['Low', 'Laag'], ['Normal', 'Normaal'], ['Above operating range', 'Boven beheerband'],
  ['The current water level is loading…', 'De actuele waterstand wordt geladen…'],
  ['Current water level unavailable', 'Actuele waterstand niet beschikbaar'],
  ['Source: Rijkswaterstaat', 'Bron: Rijkswaterstaat'], ['Refresh', 'Vernieuwen'],
  ['−55 to −30 cm NAP', '−55 tot −30 cm NAP'],
  ['Route map', 'Routekaart'], ['Generated:', 'Gegenereerd:'],
  ['Collapse', 'Inklappen'], ['Expand', 'Uitklappen'], ['Close fleet directory', 'Vlootoverzicht sluiten'],
  ['Bridges along the route', 'Bruggen langs de route'],
  ['Reporting points along the route', 'Meldpunten langs de route'],
  ['Map', 'Kaart'], ['Bridge', 'Brug'], ['Bridge number', 'Brugnummer'],
  ['Clearance below NAP', 'Onderkant NAP'], ['Clearance at 4 m width NAP', '4 m breedte NAP'],
  ['Winter water level', 'Winterpeil'], ['Waterway', 'Vaarroute'],
  ['Reporting point', 'Meldpunt'], ['Report', 'Melding'],
  ['Allowed', 'toegestaan'], ['Avoided', 'vermeden'],
  ['No items found along this route.', 'Geen items langs deze route gevonden.'],
  ['Planned route', 'Geplande route'], ['Numbered bridge', 'Genummerde brug'],
  ['Radio reporting point', 'Marifoonmeldpunt'],
  ['less clearance under canal bridges than at target level. The route planner accounts for this.', 'minder doorvaarthoogte onder grachtbruggen dan bij streefpeil. De routeplanner rekent hiermee.'],
  ['Clearance at current water level', 'Vrije hoogte bij actuele waterstand'],
  ['Surinamekade water level', 'Waterstand Surinamekade'],
  [': canal bridge clearances are calculated', ': doorvaarthoogtes van grachtbruggen zijn'],
  ['cm lower.', 'cm lager gerekend.'],
  ['Current water level is outdated; clearances assume target level NAP −0.40 m.', 'Actuele waterstand is verouderd; doorvaarthoogtes gaan uit van streefpeil NAP −0,40 m.'],
  ['Current water level unavailable; clearances assume target level NAP −0.40 m.', 'Actuele waterstand niet beschikbaar; doorvaarthoogtes gaan uit van streefpeil NAP −0,40 m.'],
  ['Bridge heights unavailable. The route has not been checked against every bridge.', 'Brughoogtes niet beschikbaar. De route is niet op alle bruggen gecontroleerd.'],
  ['Loading bridge heights; the route will be recalculated afterwards.', 'Brughoogtes laden; de route wordt daarna opnieuw berekend.'],
  ['Linked bridges with known clearance are checked at winter water level. Check the current water level and bridge operation before departure.', 'Gekoppelde bruggen met bekende hoogte worden bij winterpeil gecontroleerd. Controleer de actuele waterstand en brugbediening voor vertrek.'],
)

const containedPairs = [...phrases].sort((a, b) => Math.max(b[0].length, b[1].length) - Math.max(a[0].length, a[1].length))

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
      if (element.closest('[translate="no"]')) continue
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
  if (!node.nodeValue?.trim() || ['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName) || node.parentElement?.closest('[translate="no"]')) return
  const translated = translateValue(node.nodeValue, locale)
  if (translated !== node.nodeValue) node.nodeValue = translated
}

export function translateValue(value, locale) {
  const leading = value.match(/^\s*/)?.[0] || ''
  const trailing = value.match(/\s*$/)?.[0] || ''
  const text = value.trim()
  if (!text) return value
  const direct = exact[locale].get(text)
  if (direct) return `${leading}${direct}${trailing}`
  let output = text
  for (const [english, dutch] of containedPairs) {
    const source = locale === 'nl' ? english : dutch
    const target = locale === 'nl' ? dutch : english
    if (source.length >= 10 && output.includes(source)) output = output.replaceAll(source, target)
  }
  const replacements = locale === 'nl'
    ? [[/\bboats\b/gi, 'boten'], [/\brows\b/gi, 'regels'], [/\bLast signal\b/gi, 'Laatste signaal'], [/\bminutes? ago\b/gi, 'minuten geleden'], [/\bShowing\b/gi, 'Getoond'], [/\bSubmitted\b/gi, 'Ingestuurd'], [/\bnot restocked\b/gi, 'nog niet bijgevuld'], [/\bVisited\b/gi, 'Geweest'], [/\bShipping restrictions avoided by route:\s*(\d+)/gi, 'Routeplanning vermijdt $1 scheepvaartbeperkingen']]
    : [[/\bboten\b/gi, 'boats'], [/\bregels\b/gi, 'rows'], [/\bLaatste signaal\b/gi, 'Last signal'], [/\bminuten geleden\b/gi, 'minutes ago'], [/\bGetoond\b/gi, 'Showing'], [/\bIngestuurd\b/gi, 'Submitted'], [/\bnog niet bijgevuld\b/gi, 'not restocked'], [/\bGeweest\b/gi, 'Visited'], [/\bLinksaf\b/gi, 'Turn left'], [/\bRechtsaf\b/gi, 'Turn right'], [/\bRechtdoor\b/gi, 'Straight'], [/\bRouteplanning vermijdt (\d+) scheepvaartbeperking(en)?\b/gi, (_, count) => `Route avoids ${count} shipping restriction${count === '1' ? '' : 's'}`]]
  for (const [pattern, replacement] of replacements) output = output.replace(pattern, replacement)
  return `${leading}${output}${trailing}`
}
