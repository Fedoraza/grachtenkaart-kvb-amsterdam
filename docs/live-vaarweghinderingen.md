# Live vaarweghinderingen

De kaart toont standaard de laag **Live hinderingen en stremmingen**, ook voor
bezoekers zonder account. De bron is Rijkswaterstaat Vaarweginformatie:
`https://vaarweginformatie.nl/frp/api/messages/nts/summaries` en de bijbehorende
`/ftm/{berichtnummer}`-details. Rijkswaterstaat publiceert hier ook berichten
van andere Nederlandse vaarwegbeheerders. Bronuitleg:
https://www.rijkswaterstaat.nl/water/scheepvaart/scheepvaartberichten.

- Tijdens gebruik wordt iedere 60 seconden gecontroleerd; een verborgen tabblad
  pauzeert en controleert direct opnieuw bij terugkeer. Dit is periodiek ophalen,
  geen directe pushverbinding met Rijkswaterstaat. De publicatiesnelheid van de
  bronhouder bepaalt wanneer een nieuwe hindering beschikbaar is.
- Het gebied is gelijk aan de brugimport: 4,65–5,15° OL, 52,20–52,50° NB. Actuele
  beperkingen en aangekondigde beperkingen binnen 30 dagen worden opgenomen.
- Volledige stremmingen blokkeren actieve routepassages. Geen bediening, beperkte
  maten, vertraging en andere hinder zijn waarschuwingen; ze worden niet zonder
  verdere voorwaarden als volledige vaarwegafsluiting behandeld. Tijdelijke
  maatbeperkingen worden nog niet automatisch met het bootprofiel vergeleken.
- De kaart toont een ophaaltijd, bronlinks, begin/einde en type hinder. Verlopen
  vensters verdwijnen ook bij een bronstoring; toekomstige vensters worden op
  grond van hun tijd actief. Een ingetrokken bericht verdwijnt bij de volgende
  succesvolle samenvatting.
- Bij gedeeltelijke bronuitval blijven geldige eerdere records van specifiek
  mislukte berichten bewaard, met `sourceStale: true`, een waarschuwing in de popup
  en `partial: true` op de collectie. Andere berichten worden wel vernieuwd.
- Bij volledige bronuitval worden laatst bekende gegevens expliciet als verouderd
  getoond. Zonder eerdere gegevens meldt de kaart dat controle niet mogelijk is.
- De server bundelt gelijktijdige bronverzoeken en bewaart maximaal één minuut
  een momentopname. HTTP-responses moeten worden geherverifieerd; er is geen
  `stale-while-revalidate` op deze laag. Een oude momentopname mag niet door een
  tussenliggende cache als actuele controle worden gepresenteerd.
- De AI-route-API vermeldt `closuresPartial` en `closuresStale`, met bijbehorende
  waarschuwingen. Bronuitval tijdens een vereiste nieuwe controle geeft daar een
  fout in plaats van een ten onrechte actuele route.

Verificatie: unit/regressietests voor officiële berichtnormalisatie, individuele
bronuitval, ingetrokken berichten, onbekende beperkingscodes, verlopen tijdvensters,
route-omvaart en datakwaliteit in AI-antwoorden. Browsertests simuleren de
minuutverversing en bronuitval op desktop en mobiel. De echte publieke HTTP-handler
wordt met een geïsoleerde database en bronfixture gecontroleerd.
