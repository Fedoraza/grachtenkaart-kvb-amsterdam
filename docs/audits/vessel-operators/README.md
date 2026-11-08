# Vlootcontrole, 31 oktober 2026

De scan leest alle 3.156 AIS-identiteiten uit de lokale momentopname. De bronvergelijking bevat 251 naamvermeldingen voor elf rederijen. Dit is geen verklaring dat alle Amsterdamse rederijen, actuele eigendommen of alle AIS-zenders compleet zijn geïnventariseerd. Een juridische vergunninghouder, een merknaam, een verhuurproduct en een schip met MMSI zijn verschillende gegevens.

- [Alle AIS-classificaties](all-ais-classifications.csv): iedere opgeslagen MMSI, naam, herkenningsmethode, positie-tijdstip en gelijknamige MMSI’s.
- [Vergelijking van vlootnamen en bronnen](fleet-source-comparison.csv): iedere catalogusvermelding met bron, aliassen, aangetroffen MMSI’s en identiteitswaarschuwing.
- [Tellingen](summary.json): reproduceerbare resultaten van deze momentopname, geen live vlootomvang.

Herhalen: `node scripts/audit-vessel-operators.mjs [pad/naar/ais.sqlite] [uitvoermap]`. De database wordt alleen-lezen geopend; accounts, planning, notities en posities worden niet geëxporteerd.

## Controle per rederij

| Rederij | Gecontroleerde website | Resultaat en beperking |
| --- | --- | --- |
| Flagship | [Vloot](https://flagshipamsterdam.com/our-boats/) | Individuele namen vergeleken; onder meer Lucky Strike toegevoegd en The Dutchman als alias. Jobien, MMSI 244002621, is door de opdrachtgever bevestigd. |
| LOVERS / Lovely | [Over ons](https://www.lovers.nl/nl/over-ons/), [Lovely](https://www.lovers.nl/nl/rondvaarten-amsterdam/lovely-cruises-rondvaart-open-boot-met-drankjes-inbegrepen/) | Website beschrijft vloot en samenwerking; geen volledige individuele MMSI-lijst. Bestaande registervermeldingen behouden. Lovely-samenwerking is geen bewijs van juridisch eigendom. |
| Smidtje | [Boten](https://smidtje.nl/boten/) | Acht individueel benoemde schepen vergeleken. Aliassen Vondel, Couperus, De Wilhelmus en Tjalk Rinske ondersteunen registratie-/AIS-naamsverschillen. |
| Stromma | [Vloot](https://www.stromma.com/nl-nl/amsterdam/groepen-events/vloot/) | 34 namen/aliassen uit het door de huidige pagina gelinkte vlootoverzicht vergeleken. De PDF dateert uit 2022: historische bron, geen afzonderlijke actuele eigendomsbevestiging. Registerselectie uitgebreid met Canal Rondvaart en Meijer’s Rondvaarten op basis van de gemeentelijke groepsindeling. |
| P. Kooij | [Vloot](https://www.rederijkooij.nl/en/canal-cruise-amsterdam-rederij-kooij-our-fleet) | Pagina vindbaar in zoekresultaten; inhoud ophalen gaf 502/fetchfout. De 21 registervermeldingen zijn niet als volledig websitebevestigd gemarkeerd. |
| Blue Boat | [Over ons](https://www.blueboat.nl/over-ons/blue-boat-company/) | Officiële tekst bevestigt de rederij en beschrijft de vloot, maar publiceert geen complete naam-/MMSI-lijst. Negen registervermeldingen zijn dus geen claim van volledige actuele vlootomvang. |
| Plas | [Officiële website](https://www.rederijplas.nl/en) | Vindbaar in zoekresultaten, maar inhoud ophalen gaf 502/fetchfout. Negen registervermeldingen behouden; individuele websitecontrole blijft onbevestigd. |
| Pure Boats | [Benoemde vloot](https://pureboats.com/nl/what-boats-does-pure-boats-use-for-the-light-festival-cruise/) | Geertje, Schollevaar, Pure Spirit, Stan Huygens, Lucy en Danique vergeleken. De pagina spreekt over vijf boten maar noemt ook Danique; geen exact vloottotaal overgenomen. |
| KINboat | [FAQ](https://kinboat.com/veelgestelde-vragen/) | G-Star en KIN12 toegevoegd. Boot2go B.V. is volgens de opdrachtgever onderdeel van KINboat; vijftien bootnamen uit het gemeentelijke register toegevoegd, waaronder Boot2go 17. Boot2Go is niet langer één verzonnen verzamelboot. Deze merk-/bedrijfsrelatie is gebruikersinformatie. |
| Rederij de Nederlanden | [Boten](https://denederlanden.com/boten/) | Negen individueel benoemde schepen vergeleken. De drie RDN-Holding-registervermeldingen matchen Najade, Proost van St. Jan en Wan-Hoop op de officiële vlootpagina. Proost van Sint Jan is als spellingvariant gekoppeld. |
| Those Dam Boat Guys | [Officiële website](https://www.thosedamboatguys.com/) | Website noemt Jackson 1–5; register bevat daarnaast Apollo en De Blauwe Draeck. Apollo is een dubbelzinnige naam en wordt zonder specifieke MMSI-koppeling niet automatisch toegewezen. |

Het [gemeentelijke register](https://www.amsterdam.nl/ondernemen/passagiers-beroepsvaart/beroepsvaart/register-passagiersvaart-amsterdam/) blijft een aanvullende bron. De gebruikte bronstand is 22 oktober 2026. Gecontroleerde websitevermeldingen staan met bron en controledatum in `shared/operator-website-evidence.json`.

## Dubbele namen

De scan vond 131 namen met meerdere MMSI’s. Namen zoals Roos en Pax zijn geen unieke identiteit. Directorylijsten voegen twee verschillende MMSI’s niet meer samen op basis van dezelfde naam. MMSI’s krijgen afzonderlijke kaartposities, geschiedenis en kilometers. Een bronvermelding zonder MMSI mag als naamsvermelding worden samengevoegd, maar wijzigt geen AIS-identiteit.

De oude lokale Roos-vermelding 244070458 is niet stilzwijgend vervangen door 244126390. Jobien 244002621 wordt wel specifiek bij Flagship ingedeeld op expliciete bevestiging van de opdrachtgever. Beheerders kunnen iedere automatische of vooraf gecontroleerde koppeling overschrijven.

## AIS-onderzoek

Op 31 oktober 2026 om circa 11:11 CET werkte de openbare productie-WebSocket: 1.076 posities in de snapshot, waarvan 671 jonger dan vijftien minuten; 39 nieuwe positieberichten in vijftien seconden. De gemelde gemiddelde bronvertraging was 4,2 seconden. Dit toont ontvangst op dat meetmoment, geen garantie voor iedere boot of tijdsperiode.

Wel gerepareerd in de lokale code:

1. De browser overschreef een bestaande bootnaam met een leeg naamveld uit een gedeeltelijk AIS-bericht. Daardoor kon een boot uit zijn rederijfilter verdwijnen. Browser, opslag en databesparingsbatch gebruiken nu dezelfde merge-regels.
2. Gelijknamige schepen met verschillende MMSI’s werden in de directory soms samengevoegd. Deduplicatie gebruikt voor AIS-identiteiten nu uitsluitend MMSI.
3. Een zwijgende browser-WebSocket die OPEN bleef na een netwerkprobleem kreeg geen herstel. Een watchdog maakt opnieuw verbinding wanneer de gateway-heartbeats ontbreken; ook vastgelopen CONNECTING wordt hersteld.
4. Een actieve socket met alleen statische berichten wordt niet meer als recente positieontvangst gepresenteerd. De feedstatus controleert de leeftijd van echte positieberichten.
5. Standaard stonden alleen herkende rederijgroepen aan, waardoor ongekoppelde AIS-boten verborgen bleven. De kaart begint nu bij alle AIS-boten; een rederijfilter is een expliciete keuze.
6. Naamconflicten volgen op kaart, server en directory dezelfde conservatieve classificatie. Een naamconflict geldt niet als bewijs dat AIS uitstaat.

De productieserver via 192.168.1.90:22 was vanuit deze sessie niet bereikbaar. Er is geen productie-uitrol uitgevoerd. Ontbrekende providerdekking of een uitgeschakelde AIS-zender kan deze applicatie niet reconstrueren.


## Aanvulling Lovely: Spartacus en Apollo

Beide namen stonden al onder Rederij Lovers B.V. in de registerselectie. Apollo werd terecht uitgesloten van automatische naamherkenning omdat ook Those Dam Boat Guys een Apollo heeft. De twee specifieke Lovely-koppelingen zijn nu opgenomen:

- Spartacus: MMSI **244311331**. Lovely is door de opdrachtgever bevestigd. De [scheepsbouwer noemt Spartacus expliciet als Lovely-boot](https://aluship.nl/en/aluminium-verhuurboten/); het AIS-record geeft 11 × 4 m.
- Apollo: MMSI **244086784**. De opdrachtgever bevestigt een Lovely-boot met deze naam. De lokale AIS-kandidaat is 10 × 4 m; dit past bij de gepubliceerde Lovely-bouwserie. Dit is een onderbouwde identiteitskoppeling, geen afzonderlijke openbare eigendomsbevestiging van het MMSI. De kleinere Apollo **244830076** (9 × 2 m) en Apollo **253000037** (110 × 14 m) worden hierdoor niet aan Lovely toegewezen.

Beheerdersoverschrijvingen blijven voorrang houden. Namen worden niet globaal samengevoegd. De auditexports zijn vernieuwd. Deze aanvulling is lokaal en niet naar productie uitgerold.
