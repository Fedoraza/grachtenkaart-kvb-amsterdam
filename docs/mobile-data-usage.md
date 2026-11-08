# Mobiel dataverbruik

Lokaal gemeten op 17 oktober 2026. Er is niets naar productie gepubliceerd.

## Waarnemingen

- Voor de wijziging was de AIS-momentopname 443.459 bytes voor 1.022 boten. De server bood geen WebSocket-compressie aan.
- Na de wijziging was een momentopname van 444.220 bytes ongeveer 78.456 ontvangen bytes op de verbinding, inclusief handshake/protocoloverhead: circa 82% kleiner.
- Twee gelijktijdige lokale WebSocket-verbindingen ontvingen gedurende dezelfde 22 seconden elk 109 updates. De gewone stand verstuurde 27 batches en gebruikte 15.347 ontvangen bytes na de momentopname. De dataspaarstand verstuurde 4 batches en gebruikte 6.768 bytes: circa 56% minder liveverkeer dan de al gecomprimeerde gewone stand.

Dit zijn korte AIS-metingen, geen schatting van het totale verbruik per uur. Het aantal boten en updates varieert. Kaarttegels, luchtfoto’s, bootfoto’s, beginschermbestanden en API-aanroepen zijn niet in deze AIS-cijfers inbegrepen. De lokale ontwikkelversie laadt bovendien ontwikkelbestanden die de productiebuild niet nodig heeft.

## Gedrag

Dataspaarstand staat standaard aan voor mobiele gasten en gasten met Save-Data of een langzame 2G-verbinding. Voor ingelogde gebruikers staat deze standaard uit. Een opgeslagen keuze gaat voor; gast- en accountvoorkeuren blijven gescheiden. De instelling staat onder Instellingen in het Boottracker-menu en in Account. Posities worden ongeveer per vijf seconden gebundeld; statische bootinformatie blijft behouden. De server blijft de volledige ontvangen historie opslaan. Een verborgen pagina sluit de live verbinding en pauzeert periodieke achtergrondverzoeken; terugkeren haalt actuele gegevens op.

Grote JSON-responsen en statische productiebestanden ondersteunen gzip. Kaartgegevens worden met private hervalidatie en ETags gecontroleerd; een ongewijzigde reactie heeft geen nieuwe body. Na een wijziging verandert de ETag onmiddellijk. Kaarttegels laden na bewegen/zoomen met een kleinere buffer, en vlootfoto’s laden uitgesteld.

## Controle

- `npm test`: onder meer compressie, ETags, direct zichtbare wijzigingen, gebundelde AIS-velden en achtergrondpolling.
- `npm run test:mobile`: WebKit/iPhone-formaten en Chrome/Android/desktop; zoekbediening, opgeslagen dataspaarvoorkeur, sluiten van de live verbinding op de achtergrond en herstel bij terugkeer.
- `npm run build`: productiebuild.
