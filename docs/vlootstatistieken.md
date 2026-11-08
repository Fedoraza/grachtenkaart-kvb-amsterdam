# Uitgebreid vlootdashboard

Het dashboard staat op `/vlootstatistieken`, bereikbaar vanuit de Boottracker-navigatie, fleet directory, kilometerklassement, rederijpagina en de details van een geselecteerde AIS-boot. Het is openbaar, net als de onderliggende AIS-posities en de openbare vlootdirectory. Account-, planning- en personeelsgegevens worden niet opgenomen.

## Gebruik

Kies een begin- en einddatum (maximaal 31 kalenderdagen), rederij, boot en eventueel een lokaal uur. Snelkeuzes bieden vandaag, zeven en dertig dagen. “Toon statistieken” past de selectie toe. De URL bewaart de geselecteerde filters, zodat een gefilterd overzicht kan worden heropend of gedeeld. Overige AIS-boten zonder rederijkoppeling zijn afzonderlijk in te schakelen en vormen geen fictieve rederij.

Het dashboard bevat zeven onderdelen:

1. **Overzicht:** actieve en waargenomen boten, geschatte kilometers, gemeten vaar- en stilstanduren, bekende vloot en gekoppelde MMSI’s, geschatte vaarten en onvolledige trajecten. Dagstaafgrafiek, rederijvergelijking en waargenomen vlootinzet.
2. **Rederijen:** totalen, inzet, afstand en uren per actieve boot, plus schakelbare dagtrendlijnen. Klik op een rederij om in te zoomen. CSV-export van de rederijvergelijking.
3. **Dagen en uren:** interactieve weekdag/uur-matrix, uurprofiel en dagtabel. Klik op een uur om daarop te filteren.
4. **Kaart en vaarwegen:** interactieve kaart met meetgebieden en schakelbare aantallen varende boten, vaaruren of stilstanduren. Ranglijst van benaderde vaarwegen.
5. **Stops en locaties:** waargenomen stilstand nabij bruggen en sluizen; geclusterde stopgebieden die mogelijke lig- of opstaplocaties tonen.
6. **Boten en vaarten:** doorzoekbare, gepagineerde boottabel met kilometers, uren, gemiddelde/maximale snelheid, observatiegraad en ontvangstgaten. Klik op een boot voor eigen statistieken. Getoonde trajecten zijn begrensd op 250; het totaal staat erbij. Bootstatistieken zijn als CSV te downloaden.
7. **Datakwaliteit:** meetperiode, ontvangstgaten, verworpen GPS-sprongen, observatiegraad, definities en beperkingen.

## Berekeningsregels

Alle tijdvakken gebruiken **Europe/Amsterdam**, van lokale middernacht tot de volgende lokale middernacht. De lopende dag eindigt op het berekeningstijdstip. De dagen waarop de klok wisselt duren dus 23 of 25 uur; het herhaalde najaarsuur telt voor de klokduur twee keer, maar dezelfde boot wordt binnen de lokale uurcel niet dubbel geteld.

- Alleen opeenvolgende posities met maximaal **vijf minuten** tussentijd ondersteunen afstand of tijd. Grotere gaten worden niet opgevuld als beweging of stilstand.
- GPS-sprongen boven **35 km/u** worden uitgesloten. Dit is een filterregel, geen uitspraak over lokale wettelijke snelheidslimieten.
- Beweging vereist voldoende GPS-verplaatsing: minimaal twaalf meter, of minimaal vier meter met een gemelde snelheid boven 0,5 knoop. Voor afstand gebruiken we de grootste van de directe GPS-verplaatsing en de uit twee bruikbare snelheidsmeldingen geschatte afstand. Gemelde snelheden boven veertien knopen zijn voor die schatting onbruikbaar. Afstand blijft een benadering.
- Een **actieve boot** heeft ten minste één geldig bewegingsinterval; een **waargenomen boot** heeft ten minste één ontvangen positie.
- **Vlootinzet** is actief waargenomen boten gedeeld door de huidige bekende directoryomvang. Het is geen bewijs dat de overige boten niet hebben gevaren.
- **Observatiegraad** is de door geldige opeenvolgende posities ondersteunde tijd, gedeeld door de geselecteerde klokduur maal het aantal geselecteerde MMSI’s. Dit is geen technische ontvanger-uptime: een zender kan ook uit staan, een boot kan buiten het gebied varen of de dekking kan ontbreken.
- Een **geschatte vaart** vereist minimaal vijf minuten gemeten beweging en 200 meter afstand, met aan beide kanten minimaal vijf minuten waargenomen stilstand. Begin of einde onbekend: onvolledig traject. Dit zijn geen boekingen of bevestigde rondvaarten. De gemiddelde vaartijd betreft de gemeten bewegingsminuten van de volledig begrensde vaarten.
- **Stopgebieden** vereisen minimaal drie minuten aaneengesloten stilstand binnen circa 35 meter. De kaart clustert locaties grofweg; een cluster is geen bevestigd steigerbezoek. Brug-/sluisverblijf geldt binnen circa 45 meter en bewijst geen wachttijd voor opening.
- Bewegende intervallen worden op hun middenpositie gekoppeld aan de dichtstbijzijnde benoemde vaarweg binnen 40 meter. Kruisingen, brede wateren en schaarse ontvangst maken dit onzeker. De bron is het bestaande lokale `export.geojson`.

Het gebied is Amsterdam en omgeving: 52,28–52,45° N en 4,72–5,10° E. De server bewaart maximaal dertig dagen ruwe AIS-historie, afhankelijk van de ingestelde bewaartermijn. Een periode zonder metingen toont expliciet “geen AIS-metingen”, geen conclusie over varen. De huidige rederijkoppelingen worden toegepast op historische meetpunten; vroegere eigendomswisselingen zijn niet gereconstrueerd. Passagiers, bezetting en omzet worden niet uit AIS afgeleid.

## Implementatie

- `server/fleet-statistics.mjs`: datumvalidatie, verwerking, geografische koppeling en read-only database-adapter.
- `server/database-read-worker.mjs`: de taak `fleet-statistics` draait buiten de hoofdthread, zodat berekeningen de live kaart niet blokkeren.
- `GET /api/fleet/statistics`: filters `from`, `to`, `operator`, `mmsi`, `hour`, `includeUnassigned=1`. Maximaal 31 dagen; onbekende rederijen en ongeldige MMSI’s geven 400. Resultaten worden maximaal een minuut hergebruikt; de begrensde cache bevat hoogstens zestien selecties en deelt lopende identieke berekeningen.
- `src/components/FleetStatisticsPage.vue`: dashboard, SVG-grafieken, filters, tijdmatrix en CSV-export. CSV beschermt tekstvelden tegen spreadsheetformules en gebruikt Nederlandse decimale notatie.
- `src/components/FleetDensityMap.vue`: apart geladen interactieve Leaflet-kaart met lokale aggregaties; kaarttegels van OpenStreetMap.

De Nederlandstalige dashboardtekst gebruikt `translate="no"`, zodat de bestaande automatische vertaler geen half-Engelse labels maakt. De vertaler respecteert deze standaard HTML-markering; de overige applicatieschermen behouden hun taalgedrag.

## Verificatie

Tests bestrijken beweging en stilstand, schatting van vaarten, ontvangstgaten, GPS-sprongen, filters, geografische toekenning, lokale middernacht en beide tijdwisselingen. Een HTTP-integratietest voert de werkelijke SQLite-workertaak uit. Browsercontroles op desktop en mobiel behandelen grafieken, alle tabbladen, bootselectie, kaart, CSV-download, ontbrekende ontvangst en foutafhandeling.

Een read-only controle van de lokale database over dertig dagen verwerkte circa 87.000 posities in ongeveer een halve seconde; dit is een momentopname, geen prestatiegarantie. De wijzigingen zijn lokaal en niet naar productie gepubliceerd.
