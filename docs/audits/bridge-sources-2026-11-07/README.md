# Controle officiële brugbronnen — 7 november 2026

De import gebruikte Rijkswaterstaat FIS alleen om bestaande gemeentelijke bruggen
aan te vullen. Daardoor ontbraken RWS-only objecten, waaronder de
Oosterdoksspoorbrug. De import verenigt nu de broninventarissen.

## Volledigheid van de opgehaalde bronnen

| Bron | Records |
|---|---:|
| Amsterdam `brug` | 1.837 |
| Amsterdam `brug_vast` | 1.731 |
| Gemeentelijke objecten na samenvoegen | 1.856 |
| RWS FIS `brug` binnen onderzoeksgebied | 637 |
| Daarvan `CONSTRUCTED`, vertegenwoordigd in uitvoer | 636 |
| Daarvan gekoppeld aan gemeentelijke brug | 429 |
| Aanvullende RWS-objecten | 207 |
| Samengevoegde kaartobjecten | 2.063 |
| Bekende positieve vrije hoogte / hoogte bij winterpeil | 873 |
| Bekende positieve breedte | 988 |

De 763 opgehaalde FIS-openingen bevatten 735 brugopeningen en 28 openingen van
andere waterbouwkundige constructies. Die laatste worden niet als brug geïmporteerd.
Eén FIS-brug, Zaanbrug Wormerveer, heeft de bronstatus `UNDER_CONSTRUCTION` en
wordt daarom niet als bestaande brug op de kaart gezet. Dit is de bronstatus,
geen onafhankelijke bevestiging van de actuele bouwsituatie.

Het FIS-onderzoeksgebied is 4,65–5,15° oosterlengte en 52,20–52,50° noorderbreedte:
Amsterdam en omgeving. Deze audit is geen inventarisatie van heel Nederland.
Ontbrekende maten blijven onbekend. Veel gemeentelijke objecten zijn kleine
bruggen zonder opgenomen vaarmaten. De gemeentelijke documentatie meldt dat
de algemene brugtabel sinds december 2025 bevroren is; een nieuwe ophaaltijd
betekent daarom geen nieuwe meting of nieuwe actualisering door de bronhouder.

## Oosterdoksspoorbrug

RWS-brugidentiteit **38832**, kaartnummer **FIS-38832**. De spoorbrug blijft
gescheiden van de nabije Oosterdoksdraaibrug **26960 / BRU2270**.

| Opening | Type | Vrije hoogte gesloten (nominaal) | Breedte |
|---|---|---:|---:|
| 30416 | Vast | 5,10 m | 17 m |
| 46508 | Beweegbaar | 5,10 m | 19 m |

Bronvelden `clearanceheightclosed` en `width` worden gebruikt; `heightclosed`
van 4,70 wordt niet verward met de vrije hoogte van 5,10. Een nominale
bronhoogte is geen garantie bij de actuele waterstand. Een beweegbare opening
is niet automatisch beschikbaar voor bediening.

## Koppeling en resterende bronverschillen

Koppeling vereist een overeenkomstig brugnummer plus ligging, of een eenduidige
naam plus ligging. Gelijke naam of nabijheid alleen zijn onvoldoende. Gemeentelijke
identiteiten en geometrieën blijven behouden. Meerdere FIS-records met hetzelfde
geverifieerde gemeentelijke brugnummer kunnen hun afzonderlijke openingen aan
hetzelfde kaartobject toevoegen. Naamloze of nummerloze bronobjecten worden niet
alleen vanwege een ontbrekend nummer weggelaten.

Zeven aanvullende FIS-objecten liggen binnen 15 m van een gemeentelijk object
met een andere identiteit. Het betreft onder meer spoor-, metro- en trambruggen
naast of binnen bredere brugcomplexen. Deze zijn **niet bewezen duplicaten**.
De vergelijkingen staan in `summary.json` onder `nearbyDistinctIdentities` en
blijven afzonderlijk zichtbaar; er is geen onzekere automatische samenvoeging.

Puntgeometrieën uit FIS worden als punten weergegeven, niet als verzonnen
brugvlakken. De planner koppelt de afzonderlijke officiële openingposities aan
vaarlijnen binnen 8 m. Openingen behouden hun eigen hoogte én breedte. Niet alle
regionale bruggen liggen op het meegeleverde routenetwerk; kaartaanwezigheid is
geen garantie dat een opening aan dat netwerk gekoppeld kon worden.

## Techniek en controlebestanden

- `bridges.csv`: alle 2.063 kaartobjecten met maten en bronverwijzingen.
- `rws-coverage.json`: verantwoording van iedere opgenomen bestaande FIS-brug.
- `summary.json`: broncounts, ontbrekende geometrieën, bronverschillen en hashes.
- `data/amsterdam-bridges-v6.json`: lokaal gegenereerde, genegeerde broncache.

Paginering wordt volledig gevolgd. Een onvolledige response, paginalus of
verwijzing naar een andere host wordt geweigerd. Een complete nieuwe cache wordt
pas na succesvolle import van alle vier de bronnen atomair opgeslagen. Bij
bronuitval mag een bestaande v6-cache alleen expliciet als verouderd worden
geleverd. Een oude v5-cache wordt niet als nieuwe volledige import beschouwd.

Reproduceer met bronbestanden `municipal.json`, `fixed.json`, `brug.json` en
`opening.json` in een tijdelijke directory:

```sh
node scripts/audit-bridge-catalog.mjs /tmp/bronbestanden docs/audits/bridge-sources-2026-11-07
```

Voeg `--write-cache` toe om de lokale v6-brugcache bij te werken. Dit publiceert
niets en wijzigt geen gebruikers, AIS-posities of personeelsgegevens.

## Officiële bronnen

- [Amsterdamse dataset en velddefinities](https://api.data.amsterdam.nl/v1/docs/datasets/civieleconstructies.html)
- [Gemeentelijke brugobjecten](https://api.data.amsterdam.nl/v1/civieleconstructies/v1/brug?_format=geojson&page_size=5000)
- [Gemeentelijke vaste bruggen](https://api.data.amsterdam.nl/v1/civieleconstructies/v1/brug_vast?_format=geojson&page_size=5000)
- [RWS FIS-bruggen](https://geo.rijkswaterstaat.nl/services/ogc/gdr/fis_vnds/ogc/features/v1/collections/brug/items?bbox=4.65,52.20,5.15,52.50&limit=1000&f=json)
- [RWS FIS-openingen](https://geo.rijkswaterstaat.nl/services/ogc/gdr/fis_vnds/ogc/features/v1/collections/opening/items?bbox=4.65,52.20,5.15,52.50&limit=1000&f=json)
