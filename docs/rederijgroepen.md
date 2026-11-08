# Rederijgroepen — 31 oktober 2026

Boottracker heeft negen vaste, afzonderlijk filterbare rederijgroepen: Flagship Amsterdam, LOVERS / Lovely Cruises, Smidtje, Stromma, Rederij P. Kooij, Blue Boat Company, Rederij Plas, Pure Boats en KINboat. Het bestaande vlootregister en persoonlijke groepen blijven daarnaast bestaan. De algemene navigatie verwijst naar `/rederijen-amsterdam`, met negen afzonderlijke informatiepagina’s. De oude Flagship-pagina bestaat nog, maar ontvangt alleen boten die daadwerkelijk als Flagship zijn ingedeeld; niet meer alle boten uit het algemene register.

## Herkenning

`shared/vessel-operators.mjs` bevat het catalogus- en herkenningsmodel. `shared/operator-register.json` bevat 196 geselecteerde naamvermeldingen uit het openbare gemeentelijke passagiersvaartregister, met bronstand 22 oktober 2026 en reviewdatum 31 oktober 2026. De regels verwijzen naar de vergunninghouder, niet automatisch naar de actuele eigenaar. Alleen eenduidig herkende vergunninghouders zijn aan een merk gekoppeld. LOVERS en Lovely horen bij één groep; KINboat staat apart en heeft in deze registerselectie geen vastgestelde bootnamen.

Bronnen:
- Gemeentelijk register: https://www.amsterdam.nl/ondernemen/passagiers-beroepsvaart/beroepsvaart/register-passagiersvaart-amsterdam/
- LOVERS/Lovely: https://www.lovers.nl/nl/rondvaarten-amsterdam/lovely-cruises-rondvaart-open-boot-met-drankjes-inbegrepen/
- Stromma-merken: https://www.stromma.com/en-nl/amsterdam/about-us/about-us/
- Smidtje-vloot: https://smidtje.nl/boten/
- Blue Boat: https://www.blueboat.nl/en/about-us/
- P. Kooij: https://www.rederijkooij.nl/nl
- Plas: https://rederijplas.nl/nl/contact
- Pure Boats: https://pureboats.com/
- KINboat: https://kinboat.com/

Volgorde van herkenning:
1. Expliciete beheerderskoppeling per MMSI. Een opgeslagen `null` onderdrukt automatische herkenning.
2. Duidelijke merknaam in de AIS-naam, binnen het Amsterdamse gebied.
3. Exact genormaliseerde bootnaam uit de registerselectie, binnen datzelfde gebied.

Dubbele registerbenamingen zoals ROOS, PAX, APOLLO en FRANS HALS worden niet automatisch toegewezen. Als twee verschillende ontvangen MMSI’s dezelfde bootnaam gebruiken, wordt de naamkoppeling eveneens overgeslagen. Naamnormalisatie verwijdert interpunctie, spaties en diakritische tekens; er wordt niet fuzzy gematcht. Willekeurige woorden zoals “Lovely Day” of “Plastic Whale” worden geen merkmatches.

Een controletelling op de lokale AIS-snapshot gaf 47 Flagship, 34 LOVERS/Lovely, 11 Smidtje, 13 Stromma, 15 P. Kooij, 9 Blue Boat, 6 Plas, 4 Pure Boats en 0 KINboat herkende MMSI’s. Dit zijn herkenningsresultaten op opgeslagen gegevens, geen bevestigde actuele vlootomvang of live-aantallen. Voor KINboat worden geen MMSI’s verzonnen; herkenbare toekomstige AIS-namen of een beheerderskoppeling kunnen de groep vullen.

## Opslag en rechten

Gedeelde beheerderskoppelingen staan in dezelfde SQLite-database als de rest van de applicatie:

```sql
CREATE TABLE vessel_operator_assignments (
  mmsi TEXT PRIMARY KEY,
  operator_id TEXT,
  updated_by INTEGER,
  updated_at INTEGER NOT NULL
);
```

- `GET /api/map/operator-groups`: openbaar; alleen catalogus, MMSI-koppelingen en expliciet geselecteerde openbare AIS-velden. Geen operationele notities of beheerdersidentiteiten.
- `PUT /api/map/operator-membership/:mmsi`: alleen beheerder; JSON `{ "operatorId": "stromma" }` of `{ "operatorId": null }`.
- `DELETE /api/map/operator-membership/:mmsi`: alleen beheerder; verwijdert de override en herstelt automatische herkenning.

Dit is een uitbreidende migratie die bij starten de tabel aanmaakt; bestaande vloot-, planning- en voorraadrecords worden niet herschreven of aan een rederij opgedrongen. Andere bezoekers verversen de gedeelde koppelingen bij het laden en ongeveer iedere minuut zolang het venster zichtbaar is. Live AIS-namen werken de filters bij. De oude Flagship-browsergroep wordt niet meer stilzwijgend naar het algemene vlootregister gemigreerd.

## Gebruik

De kaart toont rederijen als vaste filtergroepen. `/?operator=lovers` activeert alleen de groep LOVERS/Lovely; een onbekende slug wordt genegeerd. Beheerders kunnen bij een geselecteerde boot een rederijkoppeling opslaan. Deze verplaatst de boot naar één rederijgroep. Persoonlijke groepen kunnen onafhankelijk meerdere indelingen blijven bevatten en worden nog in de browser bewaard.

De nieuwe rederijpagina’s zijn servergerenderd en opgenomen in de sitemap. Een pagina zonder beschikbare AIS-koppelingen zegt dat expliciet; geregistreerde namen worden niet als live posities gepresenteerd. Rechten op eventuele namen/logo’s blijven bij de betreffende rederij. Er wordt geen officiële samenwerking geclaimd.


## Fleet directories per rederij

De fleet directory heeft een rederijkeuze voor alle negen bedrijven. De lijsten combineren bestaande beheerde bootdetails, ontvangen AIS-koppelingen en de registerselectie. Dubbele vermeldingen worden binnen een rederij op MMSI of genormaliseerde naam samengevoegd. Niet gekoppelde beheerde boten blijven zichtbaar onder “Nog niet gekoppeld”. Registervermeldingen krijgen geen verzonnen MMSI, positie of bootdetails.

Boot2Go is op 31 oktober 2026 door de opdrachtgever als KINboat-boot doorgegeven. Deze vermelding staat in `OPERATOR_FLEET_NAMES`; de naam Boot2Go (ook met nummer) wordt binnen het bestaande Amsterdamse gebied als KINboat herkend. Deze bron is gebruikersinformatie, geen gemeentelijke eigendomsbevestiging.

De oude aparte Company Fleet/Fleet directory-kaartfilter is verwijderd. De beheerde bootgegevens blijven bestaan. Bij opslaan van een boot met MMSI in een gekozen rederijdirectory wordt de rederijkoppeling centraal opgeslagen.


## Gelijke behandeling van rederijen (31 oktober 2026)

- De directory en het kilometerklassement beginnen bij **Alle rederijen**. Beide kunnen op dezelfde negen rederijen en op ongekoppelde boten worden gefilterd.
- Iedere rederij gebruikt de kleur uit `VESSEL_OPERATORS` voor AIS-markers, groepsfilters en de rederijnaam in bootinformatie. Alle rederijen krijgen dezelfde markerafmetingen, naamlabels, prioriteit en behandeling van laatst bekende posities. Politie en NT houden hun dienstkleur.
- Het klassement combineert beheerde boten, registervermeldingen en AIS-boten van alle rederijen. Alleen echte MMSI’s worden voor afstandsberekening gebruikt. Geen AIS geeft geen verzonnen kilometers. Alle groepen gebruiken dezelfde berekening en historische bewaartermijn; de dekkingsindicatie gebruikt alleen de geselecteerde boten. Eerdere ontbrekende meetpunten kunnen niet achteraf worden gereconstrueerd.
- `fleet_boats.operator_id TEXT` bewaart de rederij ook zonder MMSI. Beheerders kunnen details voor register- en AIS-boten toevoegen, en bij iedere boot dezelfde rederijkeuze gebruiken. Bestaande boot-IDs en gekoppelde operationele gegevens blijven behouden. MMSI-overschrijvingen krijgen voorrang.
- Bestaande, specifieke MMSI-koppelingen voor Elisabeth, Monne de Miranda, Pax en Tijd zal het leren volgen de eerder opgeslagen officiële vlootfotobronnen in `scripts/fleet-photo-sources.json`. Jan van der Heijden wordt ondersteund door de [Flagship-campagnecase](https://www.videobrouwerij.nl/nieuws/klantcase-flagship-amsterdam-open-flower-boat-tour-promotie-fotografie/); Jean Schmitz door de [Arka-klantreferentie](https://www.arka.nl/referenties/salonboot-jean-schmitz).
- **Roos blijft een identiteitspunt:** de lokale beheerde vermelding heeft MMSI `244070458`, de eerdere officiële vlootfotokoppeling gebruikt `244126390`. Alleen de laatste identiteit is als Flagship gekoppeld; de andere wordt niet op uitsluitend dezelfde naam samengevoegd. Jobien blijft zonder bevestigde rederijkoppeling. Daardoor zijn niet alle oude ongekoppelde vermeldingen automatisch Flagship geworden.

Deze wijzigingen staan lokaal. Er is geen productiepublicatie uitgevoerd.

## Hercontrole en AIS-herstel, 31 oktober 2026

De nieuwste stand omvat tien rederijen, inclusief Those Dam Boat Guys. KINboat gebruikt nu vijftien afzonderlijke Boot2go-registervermeldingen plus G-Star en KIN12 uit de officiële FAQ. De oude enkele vermelding “Boot2Go” is vervallen. Jobien 244002621 is expliciet als Flagship bevestigd door de opdrachtgever. De paragrafen hierboven met negen groepen of onbevestigde Jobien beschrijven eerdere tussenstanden.

Zie de [volledige vloot- en AIS-controle](audits/vessel-operators/README.md), met exports voor alle 3.148 opgeslagen AIS-identiteiten, 242 vlootvermeldingen, bronbeperkingen en de reparaties voor gedeeltelijke AIS-berichten en dubbele namen. Websitevermeldingen zijn opgenomen met bron en datum; onbekende MMSI’s worden niet verzonnen. Op dat meetmoment ontvangt productie wel actuele AIS-berichten; de reparaties staan nog lokaal.


Rederij de Nederlanden is aansluitend als elfde rederij toegevoegd. De eigen vlootpagina bevestigt negen namen: Najade, Proost van Sint Jan, Bredero, Multatuli, Jacob van Lennep, Hildebrand, Peter de Grote, Wapen van Amsterdam en Wan-Hoop. Directory, kaartkleur, openbare pagina, gedeelde beheerderskoppelingen en klassementfilter gebruiken dezelfde catalogus als de andere rederijen. De auditexports zijn opnieuw gegenereerd met deze uitbreiding.
