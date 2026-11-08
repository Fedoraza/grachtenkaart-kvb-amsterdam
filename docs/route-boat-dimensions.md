# Bootmaten en vaarprofielen in de routeplanner

Aanpassing van 25 oktober 2026.

De planner toetst ingevulde breedte aan lokale `maxwidth`/doorvaartbreedte, gemeentelijke/FIS-brugbreedtes en het maximale vaartuigbreedte van een bekend Amsterdams vaarprofiel. Bij meerdere beperkingen geldt de kleinste maat. Lengte wordt getoetst aan `maxlength` en het maximale vaartuiglengte van het profiel. Gelijkheid aan de limiet is toegestaan. De bestaande hoogtemarge van 0,15 m blijft uitsluitend een hoogtemarge.

Profielen en benoemde vaarwegen staan in `src/scripts/waterwayProfiles.js`. Bron: Gemeente Amsterdam, Uitvoeringsplan Transport over Water, figuur 5 op pagina 9:
https://assets.amsterdam.nl/publish/pages/1071270/uitvoeringsplan_transport_over_water_3.pdf

Alleen eenduidig geclassificeerde volledige vaarwegen zijn op naam gekoppeld, binnen een geografische begrenzing. Wateren met wisselende profielen, waaronder Lijnbaansgracht, krijgen geen profiel op basis van alleen hun naam. Een individueel GeoJSON-segment kan expliciet `navigationProfile`, `doorvaartprofiel` of `ref:doorvaartprofiel` bevatten. Deze classificatie gaat voor de naamkoppeling. Onbekende profielen blijven onbekend en verschijnen in routewaarschuwingen op desktop en mobiel. Er wordt dus geen volledige gebiedsdekking geclaimd.

De diepte in de profiellegenda is een bodem-/profieldiepte ten opzichte van NAP, geen actuele toegestane bootdiepgang. Daaruit wordt geen `maxDraft` afgeleid. Expliciete `maxdraft`-gegevens worden wel gecontroleerd. Er is actuele waterstandsinformatie nodig om profieldiepte naar beschikbare waterdiepte te vertalen.

Bekende brugbreedtes worden ook verwerkt als er geen brughoogte bekend is. Dit geldt voor beide richtingen, expliciet gekoppelde vaarstroken en automatische kaartverbindingen. Synthetische kaartverbindingen krijgen conservatief de kleinste bekende breedte-/lengte-/diepgangslimiet van hun aansluitende fysieke segmenten. Daardoor kunnen ze een beperking niet via een kaartgat omzeilen; bij een kruispunt kan dit een verbinding extra conservatief beperken.

Bij een ingevulde hoogte of breedte wacht de planner op de bruggegevens. Opgeslagen routes worden met alle ingevulde bootmaten opnieuw berekend. Dezelfde toetsing geldt voor gewone routes en rondjes. Bootlengte is op desktop en mobiel instelbaar en wordt in de opgeslagen route-instellingen meegenomen.

Controle: routekeuze met te brede/te lange boten, exacte grensmaten, lokale beperkingen, breedte zonder brughoogte, retourrichting, ontbrekende profielen, profielgeografie, kaartgatverbindingen en bestaande routes/rondjes zijn getest.
