# Bootfoto’s: alleen bevestigde koppelingen

Na de terugmelding over onjuiste foto’s is de weergave op 31 oktober 2026 aangescherpt. Algemene vlootfoto’s verschijnen niet meer bij afzonderlijke boten, ook niet als terugvaloptie. Naamovereenkomst of dezelfde rederij is op zichzelf geen bevestiging dat een foto bij een AIS-identiteit hoort.

## Automatische fotocatalogus

In `shared/boat-photos.json` staan 27 bootfoto-kandidaten en 10 vlootfoto-kandidaten, met bronpagina, oorspronkelijke URL, controledatum en SHA-256. Deze bestanden zijn behouden voor broncontrole, maar **worden niet automatisch getoond** zolang `verified` niet expliciet waar is. Algemene vlootfoto’s worden nooit door `boatPhoto()` aan een boot toegekend.

Alleen Spartacus is in de huidige catalogus vrijgegeven: de scheepsbouwer benoemt die foto expliciet als Spartacus en de koppeling is begrensd tot MMSI 244311331. Voor een boot met een MMSI is een concrete MMSI-koppeling nodig; een foto zonder MMSI-bewijs wordt niet op alleen een naam toegepast. Onbekende of dubbele namen krijgen geen vervangende foto.

## Opgeslagen en geüploade foto’s

`fleet_boats` krijgt drie uitbreidende kolommen:

- `photo_verified INTEGER NOT NULL DEFAULT 0`
- `photo_verified_mmsi TEXT`
- `photo_verified_name TEXT`

Oude automatische imports en andere bestaande beelden zonder expliciete bevestiging zijn standaard verborgen, zonder de afbeeldingen uit de database te wissen. Dat kan ook eerder handmatig opgeslagen foto’s raken als hun bevestiging niet was vastgelegd. Een beheerder kan via de bestaande foto-upload een juiste afbeelding aan de boot koppelen.

Een nieuwe beheerdersupload bindt de foto aan de huidige bootnaam en het MMSI, en wist de samenvattingscache. Zowel de directory als het foto-endpoint controleren deze koppeling. Als naam of MMSI wijzigt, vervalt de weergave tot de foto opnieuw is bevestigd door upload. Een reeds bevestigde beheerdersfoto houdt voorrang op de automatische catalogus.

## Dubbele weergave Apsara

Het kaartdetailvenster bevatte twee fotoblokken: het oude blok voor `selectedVessel.fleet.photoUrl` en het nieuwe algemene fotoblok. Het oude blok is verwijderd. Iedere geselecteerde boot heeft nu hoogstens één fotoblok, ook bij een bevestigde beheerdersfoto.

Gecontroleerd met tests voor identiteitsbinding, oude onbevestigde imports, handmatige uploads en bestandsintegriteit. Browsercontroles gebruiken desktop en mobiel en controleren afzonderlijk dat onbevestigde beelden ontbreken en Apsara precies één afbeelding heeft.

Deze wijzigingen staan lokaal; er is geen productiepublicatie uitgevoerd.
