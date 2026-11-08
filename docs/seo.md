# Vindbaarheid van Boottracker

Het hoofddomein is **https://boottracker.nl**. De interactieve vaarkaart blijft
op `/`. Er zijn nu 38 openbare pagina’s in de sitemap. Naast de kaart en het kilometerklassement zijn er 36 informatiepagina’s:

- `/rederijen-amsterdam`: overzicht van negen rederijen met afzonderlijke bootgroeppagina’s.

- `/vaarroutes-amsterdam`: drie voorbeeldtrajecten met afzonderlijke pagina’s.
- `/boottracker-delen`: kopieerbare links voor havens, verhuurders en verenigingen.

- `/bruggen-amsterdam`: overzicht met acht afzonderlijke brugpagina’s, zoals
  `/bruggen-amsterdam/kortjewantsbrug`, met maten uit dezelfde broncache als de kaart.
- `/grachten-amsterdam`: overzicht met zes afzonderlijke grachtpagina’s, waaronder
  `/grachten-amsterdam/prinsengracht` en `/grachten-amsterdam/nieuwe-herengracht`.
- `/doorvaarthoogte-amsterdam`: uitleg over NAP, winterpeil en nominale hoogtes.
- `/vaarprofielen-amsterdam`: profielklassen, maximale bootmaten en bronverwijzingen.
- `/over-boottracker`: werkwijze, brongegevens en beperkingen.
- `/amsterdam-routeplanner`: vaarrouteplanner, Amsterdamse grachten, bruggegevens,
  bootafmetingen en uitleg over het plannen.
- `/flagship-vloot`: de in Boottracker opgenomen bedrijfsvloot, met bootnamen,
  openbare kenmerken, AIS-status en links naar beschikbare kaartposities.

De informatiepagina’s worden op de server gerenderd en zijn zonder JavaScript
leesbaar. De bootzoeker en gebruiksmeting zijn kleine aanvullende scripts.
Operationele notities, bemanning en planning komen niet in het paginamodel.
De pagina presenteert zich als Boottracker en verwijst voor boekingen naar
Flagship Amsterdam. Er wordt geen officiële relatie met Flagship geclaimd.

Iedere pagina heeft een eigen titel, beschrijving en canonical URL. De sitemap
op `/sitemap.xml` vermeldt alleen bestaande openbare pagina’s; `/robots.txt`
verwijst ernaar. Pagina’s die niet bestaan geven in productie een echte 404.
Kaart-URL’s met queryparameters verwijzen met hun canonical naar `/` en krijgen
`X-Robots-Tag: noindex, follow` om varianten met gedeelde routes of bootselecties
uit de zoekresultaten te houden.

## Engelse pagina’s

Voor Engelstalige bezoekers, zoals toeristen die een boot huren, staan 20
volledig vertaalde pagina’s onder `/en/` (`server/public-pages-en.mjs`). De
sitemap telt nu 73 URL’s: 53 Nederlandse en 20 Engelse.

| Nederlands | Engels |
| --- | --- |
| `/amsterdam-routeplanner` | `/en/amsterdam-boat-route-planner` |
| `/bruggen-amsterdam` (+ 8 bruggen) | `/en/amsterdam-bridges` (+ 8 bruggen, zelfde slug) |
| `/grachten-amsterdam` (+ 6 grachten) | `/en/amsterdam-canals` (+ 6 grachten, zelfde slug) |
| `/doorvaarthoogte-amsterdam` | `/en/bridge-clearance-amsterdam` |
| `/vaarprofielen-amsterdam` | `/en/amsterdam-waterway-profiles` |
| `/over-boottracker` | `/en/about-boottracker` |

- Beide versies verwijzen met `hreflang="nl"`, `hreflang="en"` en
  `hreflang="x-default"` (Nederlands) naar elkaar, in de `<head>` en in de
  sitemap (`xhtml:link`). Elke versie heeft een eigen canonical.
- Engelse pagina’s hebben `lang="en"`, `og:locale` `en_GB`, Engelse navigatie,
  kruimelpad en structured data (`inLanguage: en-GB`). Een taallink in de
  navigatie wisselt tussen beide versies.
- `/en` verwijst met een 301 naar `/en/amsterdam-boat-route-planner`.
- Alleen volledig vertaalde pagina’s krijgen een Engelse versie. Kennisbank,
  rederijen, voorbeeldroutes, vlootoverzicht en statistieken zijn nog
  Nederlandstalig en hebben geen `hreflang`. Een half vertaalde pagina is
  slechter dan geen vertaling.
- Bronrecordnamen van Rijkswaterstaat (bijv. “Doorvaartopening (beweegbaar)
  Magere Brug”) blijven letterlijk staan, zodat ze in de bron terug te vinden zijn.

## Na publicatie

1. Controleer dat `https://boottracker.nl/amsterdam-routeplanner` en
   `https://boottracker.nl/flagship-vloot` zonder login een HTTP 200 geven.
   Google moet de pagina’s en hun CSS/JavaScript kunnen ophalen; voorkom
   blokkades door een Cloudflare-toegangslogin of botchallenge voor Googlebot.
2. Voeg in [Google Search Console](https://search.google.com/search-console)
   een **domeinproperty** voor `boottracker.nl` toe. Verifieer het eigendom met
   het TXT-record dat Google geeft in de DNS-instellingen. Gebruik exact de
   persoonlijke verificatiewaarde uit Search Console; die staat niet in deze repo.
3. Dien `https://boottracker.nl/sitemap.xml` in onder **Sitemaps**.
4. Inspecteer de nieuwe URL’s met **URL-inspectie**, voer de live test uit en
   vraag indexering aan. Google bepaalt zelf of en wanneer een pagina wordt
   geïndexeerd; indienen geeft geen garantie.
5. Controleer onder **Indexering → Pagina’s** of Google dezelfde canonical kiest
   en geen blokkade ziet. Bekijk onder **Prestaties** welke zoekopdrachten
   vertoningen en klikken opleveren.

## Een relevante plek verdienen

Voor alleen `Flagship` of `Flagship Amsterdam` zoeken veel mensen de rederij
zelf. Boven de officiële site verschijnen is daardoor geen realistische
belofte. Richt de vlootpagina op de taak die Boottracker ondersteunt, bijvoorbeeld
`Flagship boten volgen`, `Flagship vloot AIS` en specifieke bootnamen met
`locatie`. Richt de routepagina op `Amsterdam vaarrouteplanner`,
`routeplanner boot Amsterdam` en `vaarroute Amsterdam brughoogte`.

Houd de vlootgegevens en de kaart bruikbaar en actueel. Voeg inhoud toe die
gebruikers helpt: uitleg over AIS-vertraging, ontbrekende signalen en het
controleren van bruggegevens. Vraag relevante Amsterdamse watersport-,
verhuur- of vaarinformatiepagina’s om een redactionele verwijzing wanneer
Boottracker hun bezoekers helpt. Vermijd gekochte linkpakketten, misleidende
Flagship-pagina’s en herhaalde zoekwoorden zonder inhoudelijke meerwaarde.

Een advertentie kan boven organische resultaten staan, maar is een betaalde,
als advertentie herkenbare plaatsing. Dat verbetert de organische ranking niet.

## Bronnen

- [Google Search Essentials](https://developers.google.com/search/docs/essentials)
- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: nuttige, betrouwbare inhoud](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)


## Bereikbaarheidsonderzoek en controlescript — 31 oktober 2026

De eerdere externe controle leverde HTTP 403 op voor `/`, `/amsterdam-routeplanner` en `/sitemap.xml`. `/robots.txt` gaf wel 200 en bevatte uitsluitend het Cloudflare Managed Content-blok, zonder de sitemapregel uit de applicatie. De responsen liepen via Cloudflare. Dit bewijst niet welke Cloudflare-regel de blokkade veroorzaakt, noch dat geverifieerde Googlebot-verzoeken dezelfde respons krijgen.

Een vervolgmeting met Node en de herkenbare user-agent `BoottrackerDiagnostics/1.0` kreeg 200 op homepage, routeplanner, robots.txt en sitemap. De nieuwe pagina’s gaven nog 404 omdat ze niet zijn uitgerold. Met de standaard Python-user-agent bleef dezelfde routepagina 403 geven; de native Python-respons vermeldde `error code: 1010`. Ook een Node-verzoek met die Python-user-agent werd geblokkeerd. De blokkade is dus clientafhankelijk, geen aangetoonde algemene blokkade van zoekmachines. Cloudflare beschrijft code 1010 als een browser-signatureblokkade, onder meer door Browser Integrity Check:
https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/

De productieserver `192.168.1.90` was in de vervolgsessie niet via SSH bereikbaar. Er was geen beschikbare Cloudflare-koppeling. Daarom zijn Cloudflare-instellingen niet aangepast en is de nieuwe versie niet uitgerold.

De oorsprongserver is lokaal in productiemodus getest met een lege testdatabase en openbare brugfixtures. Alle 21 informatiepagina’s gaven 200 zonder login of JavaScript; de sitemap bevatte 23 URL’s; robots.txt bevatte de sitemapregel; slashvarianten gaven 301; onbekende pagina’s gaven 404. Dit valideert de applicatie, niet de Cloudflare-configuratie.

Na uitrol kun je vanaf een extern netwerk de openbare bereikbaarheid controleren:

```sh
node scripts/check-public-search.mjs
```

Het script controleert zeven representatieve URL’s op HTTP-status, indexeringsblokkades en verwachte inhoud. Het geeft een foutstatus terug bij een probleem. Geen user-agent wordt als Googlebot vermomd; een succesvolle test bewijst geen Google-indexering.

### Gerichte correctie in Cloudflare

1. Controleer Browser Integrity Check en zoek, waar deze gebeurtenissen worden geregistreerd, in Security Events naar de 403-verzoeken voor de openbare pagina’s en `/sitemap.xml`. Noteer de werkelijke actie en regel die deze veroorzaakt. Controleer geverifieerde zoekbots afzonderlijk.
2. Pas uitsluitend de betrokken regel of botpolicy aan, zodat legitieme zoekcrawlers de openbare HTML, sitemap en benodigde assets kunnen ophalen. Schakel de bescherming van inlog-, beheer- of mutatie-endpoints niet uit. Een robotsregel alleen heft een HTTP-blokkade niet op.
3. Controleer onder Bot traffic / AI bot policies of **Search** is toegestaan. Beoordeel **Agent** afzonderlijk als bezoekers of zoekdiensten pagina’s laten ophalen. Een keuze om AI-training te blokkeren hoeft niet te worden veranderd voor gewone zoekindexering. De exacte beschikbaarheid en namen van instellingen hangen van het account af.
4. Controleer dat Cloudflare de eigen robots.txt van de origin kan ophalen en de sitemapregel behoudt. Het managed blok hoort vóór de oorspronkelijke robots.txt te staan wanneer deze als 200 wordt gevonden.
5. Herhaal het externe controlescript en daarna de live URL-inspectie in Search Console. Dien de sitemap in en inspecteer enkele brug- en grachtpagina’s. De daadwerkelijke Googlebot-toegang moet met de inspectietest en geverifieerde logregels worden vastgesteld.

Cloudflare-documentatie: https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/

### Inhoud en indexering

De pagina’s zijn gewone servergerenderde HTML met eigen titels, beschrijvingen, canonicals, zichtbare kruimelpaden en bijpassende BreadcrumbList-gegevens. Alle interne informatielinks verwijzen naar geregistreerde pagina’s. Er worden geen honderden lege brugpagina’s of herhaalde zoekwoordpagina’s aangemaakt.

Brugmaten worden per verzoek uit de gedeelde broncache gelezen en nooit in SEO-teksten vastgezet. Die cache vernieuwt nu ook na de maximale leeftijd in het servergeheugen; gelijktijdige verversingen delen één bronverzoek. Als de brugbron niet kan worden geladen, antwoordt de pagina met 503, Retry-After en no-store in plaats van een indexeerbare foutpagina. De ophaaltijd wordt niet als meetdatum of inhoudelijke wijzigingsdatum voorgesteld.

Voor brugmaten blijven de twee afzonderlijke bronrecords zichtbaar wanneer hoogte en breedte bij verschillende openingen horen. Onbekende maten blijven onbekend. Het kaartlinkje `/?bridge=BRU0487` focust de bijbehorende brug na het laden van de kaartgegevens.

## Voorbeeldroutes en delen

Toegevoegd: `/vaarroutes-amsterdam`, drie afzonderlijke trajectpagina’s en `/boottracker-delen`. De sitemap bevat daarmee 28 openbare URL’s. De routepagina’s hebben servergerenderde trajectinformatie, indicatieve afstand/vaartijd en een link met een vaste voorbeeldslug. De client importeert alleen bekende routepunten en berekent opnieuw met de eigen bootmaten; voorbeeldafmetingen worden niet ingevuld. Een gedeelde route heeft voorrang op een voorbeeldslug. Automatische kaartgatverbindingen staan voor deze voorbeelden uit; deze instelling wordt ook in opgeslagen routes bewaard.

De rekenvoorbeelden zijn drie trajecten, geen rondjes: Herengracht noord–zuid (circa 2,22 km / 22 minuten), Nieuwe Herengracht vanaf de Amstel (circa 0,78 km / 8 minuten) en Amstel richting Zuid (circa 1,65 km / 17 minuten). Referentie: 6 km/u en een voorbeeldboot van 7 × 2,20 m, 1,40 m hoog, 0,60 m diepgang, met 0,15 m hoogtemarge. De referentieberekening gebruikt de meegeleverde vaarlijnen en de brugcache van 20 oktober 2026. Geen tijdelijke stremmingen, wachttijden of gegarandeerde passage. Routepunten zijn geen aanlegplaatsen.

De deelpagina bevat gewone, kopieerbare HTML-links naar relevante informatie. Er is geen verplichte backlink, script, iframe of linkruil. Benadering van externe websites is afzonderlijk werk; er zijn geen berichten verstuurd.

### Minder JavaScript bij eerste kaartbezoek

AccountMenu, BoatDutyPanel, InventoryPanel, PlanningPanel, AuthScreen en KmLeaderboardPage worden met dynamische imports geladen wanneer de betreffende Vue-component wordt getoond. De eerste kaartweergave bevat ongeveer 658 kB JavaScript, inclusief statische gedeelde chunks, tegenover circa 772 kB vóór deze opsplitsing: ongeveer 15% minder on-gecomprimeerde code. Dit is een buildmeting, geen gemeten winst in seconden of Core Web Vitals. De openbare informatiepagina’s gebruiken al hun eigen kleine script in plaats van de kaartbundel.


## Meerdere rederijen

De primaire vlootnavigatie verwijst nu naar `/rederijen-amsterdam` met negen afzonderlijke operatorpagina’s, in plaats van alleen naar Flagship. De sitemap bevat 38 openbare URL’s. Zie `docs/rederijgroepen.md` voor de bronselectie, herkenning en gedeelde beheerderskoppelingen. De herkenningscatalogus voegt circa 19 kB aan de kaartcode toe. Na deze uitbreiding is de initiële JavaScript-set ongeveer 677 kB in plaats van 658 kB; nog steeds circa 12% minder dan de circa 772 kB vóór het uitgesteld laden van account- en operationele schermen. Dit is geen gemeten laadtijdwinst.
