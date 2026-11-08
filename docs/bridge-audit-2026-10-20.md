Bruggencontrole op 20 oktober 2026

Alle 1.853 gemeentelijke brugobjecten zijn gecontroleerd met volledige FIS-responsen: 763 doorvaartopeningen en 637 bruggen in het gebied 4.65,52.20–5.15,52.50. De CSV naast dit bestand bevat ieder gemeentelijk object, de beschikbare maten, bronlinks en ontbrekende velden. Een ontbrekende FIS-koppeling betekent niet dat nergens informatie bestaat.

Na correctie hebben 668 objecten een vrije hoogte boven winterpeil of een nominale FIS-hoogte, 782 een breedte en 661 beide. Van de 117 als beweegbaar geregistreerde objecten hebben 77 beide maten; bij 40 ontbreken beide nog. Dit zijn bronclassificaties, inclusief kleine bruggen en objecten met onbekende namen. De afzonderlijke Waterkaart-verrijking voor de Buiksloterdraaibrug valt buiten deze gemeentelijke/FIS-telling.

Opgelost:
- Keersluizen en andere niet-brugobjecten werden ten onrechte als tweede kandidaat gezien. Dit blokkeerde onder andere Kortjewantsbrug en Westerkeersluisbrug.
- Het FIS-zoekgebied sloot een deel van Weesp uit.
- De afstand werd tot het gemiddelde van de polygoonpunten gemeten. Nu wordt de afstand tot het brugvlak gemeten, zodat openingen aan de uiteinden van lange bruggen meetellen.
- Korte exacte brugnamen met plaatsnaam, zoals Sluisbrug Weesp, worden nu herkend.
- Een bevestigde brugnummerkoppeling krijgt voorrang boven een algemene waterwegnaam.
- Beweegbare bruggen zonder hoogte krijgen een aanklikbaar vraagteken en expliciete onbekende velden.

Acht extra brugobjecten hebben nu een FIS-hoogte: Roskambrug, Zwaantjesbrug, Sluisbrug Weesp, Lange Vechtbrug, Westerkeersluis, Kortjewantsbrug, Vluchthavenbrug en Nesciobrug. Kortjewantsbrug: nominaal 3,94 m gesloten en 12 m breed, uit opening.2283. De naastgelegen keersluis heeft een ander objectnummer en wordt niet als brugmaat overgenomen.

Bij Rozenoordbrug is de oude aanvulling uit het spoorbrugrecord vervallen: meerdere brugobjecten met vergelijkbare namen zijn geen eenduidige koppeling. Bij de IJdoornlaanbrug wordt door de volledige bruggeometrie een extra opening meegenomen en verandert de conservatieve FIS-hoogte van 4,57 naar 4,55 m.

Reproduceren met volledige bronbestanden:

```sh
node scripts/audit-bridge-data.mjs municipal.json openings.json bridges.json audit.csv
```

FIS-bron: https://geo.rijkswaterstaat.nl/services/ogc/gdr/fis_vnds/ogc/features/v1/collections

Nominale hoogtes zijn geen actuele waterstandsmetingen. Bij meerdere openingen worden hoogte en breedte afzonderlijk conservatief aangevuld; bronlinks blijven per maat beschikbaar.
