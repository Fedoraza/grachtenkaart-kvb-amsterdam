# Fleet Directory: bronfoto’s per boot

Op 17 oktober 2026 zijn 36 gecontroleerde bootfoto’s toegevoegd aan de
productie-Fleet Directory van 54 boten. De bronbestanden zijn lokaal opgeslagen
als WebP; de directory gebruikt de bestaande foto-API. Er is geen afhankelijkheid
van externe hotlinks en er zijn geen nieuwe boten aangemaakt.

De import controleert zowel de actuele bootnaam als het MMSI. Bestaande foto’s
blijven behouden. De oorspronkelijke fotovelden zijn vóór de productie-import
apart opgeslagen, zodat de wijziging teruggedraaid kan worden.

De exacte afbeelding, bronpagina, naam en SHA-256 staan in
[`fleet-photo-sources.json`](../scripts/fleet-photo-sources.json).
De definitieve selectie is visueel gecontroleerd. Afbeeldingen van personen,
generieke arrangementen en een lichtkunstwerk met de naam Atlantis zijn niet als
bootfoto gebruikt. Lucky Strike is niet zonder bewijs gekoppeld aan Lucky Stripper.
Roos en Rosé zijn apart behandeld.

## Onderzochte websites

Begonnen bij [de opgegeven Amsterdam Boat Experience-pagina](https://amsterdamboatexperience.com/boat-rental-amsterdam/).
Vervolgens zijn de openbare vloot- en bootpagina’s en beschikbare openbare
foto-indexen op deze bedrijfssites bekeken:

- [Amsterdam Boat Experience](https://amsterdamboatexperience.com/our-fleet/)
- [Flagship Amsterdam](https://flagshipamsterdam.com/our-boats/)
- [Aemstelland](https://aemstelland.nl/)
- [Amsterdam Boat Center](https://amsterdamboatcenter.com/alle-boten/alle-boten/)
- [Booot](https://booot.nl/our-fleet/)
- [Skipper Jack Amsterdam](https://skipperjackamsterdam.com/)
- [Voyage Amsterdam](https://voyageamsterdam.com/boats/)
- [Sloepvrienden](https://sloepvrienden.nl/)
- [Book A Watertaxi](https://www.bookawatertaxi.com/)
- [Flying Dutch Boats](https://flyingdutchboats.com/fleet/)
- [Amsterdamse Salonboot Rederij](https://amsterdamse-salonbootrederij.nl/)
- [Rederij Mokum](https://www.rederijmokum.nl/en/our-boats/)
- [E-boats](https://e-boats.nl/boten/)
- [Hilda](https://hilda.nl/)
- [Amsterdam Boat Events](https://amsterdamboatevents.nl/karakteristieke-rondvaartboten/)

## Nog geen bevestigde foto

Voor deze 18 boten is geen betrouwbare, passende bootfoto gevonden binnen de
onderzochte bronnen. Hiervoor is geen vervangende of verzonnen foto ingevuld:

- Creusen-1
- Dirck van Os
- Flagship
- Freewilly
- Gast
- Harry Slinger
- Herman Brood
- Jan van der Heijden
- Jobien
- Lucky Stripper
- Majestic
- Meike
- Pierre Cuypers
- Ramses Shaffy
- Rosalie
- Royalty
- Russian Star
- The Dude

## Opnieuw uitvoeren

De importeur staat in `scripts/fleet-photo-import.mjs`. Hij voert standaard
alleen een controle uit. Alleen `--apply` schrijft de goedgekeurde afbeeldingen.
De foto’s en het uitgebreide onderzoeksrapport staan in `data/fleet-photos/`;
op productie in het persistente volume onder `data/fleet-photos-20261017/`.

```sh
node scripts/fleet-photo-import.mjs scripts/fleet-photo-sources.json data/fleet-photos
node scripts/fleet-photo-import.mjs scripts/fleet-photo-sources.json data/fleet-photos --apply
```

De lokale testdatabase bevat voor Roos nog een ander MMSI dan productie. Daarom
heeft de importeur die lokale rij overgeslagen. De 36 productie-rijen hebben
allemaal de naam- én MMSI-controle doorstaan; die productiegegevens zijn leidend
voor de bronlijst. Het MMSI van een boot is niet gewijzigd door deze import.
