// Reference calculations use mapped physical waterways, 6 km/h, and a sample
// boat. The planner imports only the points, never assumes these are YOUR boat's
// dimensions, and recalculates with the current source data and restrictions.
export const EXAMPLE_ROUTE_BOAT = Object.freeze({ heightMeters: 1.4, widthMeters: 2.2, lengthMeters: 7, draftMeters: 0.6, safetyMarginMeters: 0.15 })
export const EXAMPLE_ROUTES = [
  {
    slug: 'herengracht-noord-zuid', name: 'Herengracht van noord naar zuid',
    summary: 'Een traject over de Herengracht, van het noordelijke deel bij de Brouwersgracht naar het zuidelijke deel richting de Amstel.',
    highlights: ['De route blijft op de Herengracht.', 'Je passeert verschillende bruggen; vergelijk de maten van elke passage met je eigen boot.', 'Dit traject eindigt op een andere plek dan waar je begint.'],
    distanceMeters: 2223, durationMinutes: 22, canalPaths: ['/grachten-amsterdam/herengracht'],
    points: [{ latitude: 52.3792362, longitude: 4.8920164, name: 'Herengracht noord' }, { latitude: 52.3650949, longitude: 4.8975988, name: 'Herengracht zuid' }],
  },
  {
    slug: 'nieuwe-herengracht', name: 'Nieuwe Herengracht vanaf de Amstel',
    summary: 'Een kort traject vanaf de Amstelzijde over de Nieuwe Herengracht. Handig om het plannen met brugmaten en een ander vaarprofiel te bekijken.',
    highlights: ['De Nieuwe Herengracht is een andere vaarweg dan de Herengracht.', 'Het opgenomen profiel A2 is ruimer dan profiel B van de Herengracht; de brugopeningen blijven afzonderlijk van belang.', 'Deze voorbeeldroute eindigt op de Nieuwe Herengracht en loopt niet door de Oesjesduiker.'],
    distanceMeters: 780, durationMinutes: 8, canalPaths: ['/grachten-amsterdam/nieuwe-herengracht'],
    points: [{ latitude: 52.3659368, longitude: 4.902085, name: 'Nieuwe Herengracht bij de Amstel' }, { latitude: 52.3699446, longitude: 4.9110914, name: 'Nieuwe Herengracht oost' }],
  },
  {
    slug: 'amstel-naar-zuid', name: 'Over de Amstel richting Zuid',
    summary: 'Een traject in zuidelijke richting over de Amstel. Gebruik het als uitgangspunt voor een eigen vaarroute, met aandacht voor de bruggen onderweg.',
    highlights: ['Het traject volgt de Amstel in zuidelijke richting.', 'Het opgenomen vaarprofiel is A2+; controleer ook brugmaten en eventuele aansluitende grachten.', 'De start- en eindpunten zijn punten op het water, geen aangewezen aanlegplaatsen.'],
    distanceMeters: 1653, durationMinutes: 17, canalPaths: [],
    points: [{ latitude: 52.3619206, longitude: 4.9035002, name: 'Amstel centrum' }, { latitude: 52.3500738, longitude: 4.911069, name: 'Amstel richting Zuid' }],
  },
].map((route) => ({ ...route, path: `/vaarroutes-amsterdam/${route.slug}`, plannerUrl: `/?planner=1&voorbeeld=${route.slug}`, speedKmh: 6, avoidVirtualEdges: true }))

export function exampleRouteFromSearch(search) {
  const params = new URLSearchParams(search)
  // An explicitly shared route takes precedence over a sample.
  if (params.has('route')) return null
  const route = EXAMPLE_ROUTES.find((candidate) => candidate.slug === params.get('voorbeeld'))
  return route ? { ...route, points: route.points.map((point, index) => ({ ...point, role: index === 0 ? 'start' : index === route.points.length - 1 ? 'end' : 'waypoint' })) } : null
}
