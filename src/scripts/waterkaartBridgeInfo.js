export const WATERKAART_BRIDGE_INFO = [
  {
    bridgeNumber: '2205',
    names: ['Buiksloterdraaibrug'],
    sourceName: 'Waterkaart Live',
    sourceUrl: 'https://waterkaart.net/gids/brug.php?naam=Amsterdam%2C-brug',
    sourceUpdatedAt: '2026-07-15T14:23:00+02:00',
    clearanceHeightMeters: 3.5,
    passageWidthMeters: 15,
    waterLevelReference: 'Kanaalpeil, circa NAP -1,40 m',
    vhfChannel: '20',
    phone: '088 - 9394095',
    requestPhone: '06 - 82347129',
    manager: 'Gemeente Amsterdam',
    bridgeStatus: 'Dicht bij raadpleging bronpagina',
    operatingSummary: [
      'Werkdagen doorgaans 06:00-07:00, 09:00-16:00 en 18:00-22:00',
      'Weekenden en feestdagen in vaarseizoen doorgaans 09:30-17:30',
      'Winter- en feestdagperioden hebben afwijkingen; controleer de bron voor actuele bediening',
    ],
    notes: [
      'Doorvaarthoogte is afhankelijk van waterstand.',
      'Brug wordt tijdelijk lokaal bediend; houd rekening met aanrijtijd of vertraging.',
    ],
  },
]

export function waterkaartInfoForBridge(properties = {}) {
  const bridgeNumber = normalizeBridgeNumber(properties.number)
  const name = normalizeText(properties.name)
  return WATERKAART_BRIDGE_INFO.find((info) => {
    if (bridgeNumber && normalizeBridgeNumber(info.bridgeNumber) === bridgeNumber) return true
    return info.names.some((candidate) => name.includes(normalizeText(candidate)))
  }) || null
}

function normalizeBridgeNumber(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
