// Official fairway centre lines from Rijkswaterstaat's NWB Vaarwegen dataset.
// Source collection (queried 2026-09-17):
// https://geo.rijkswaterstaat.nl/services/ogc/gdr/nwb_vaarwegen/ogc/features/v1/collections/vaarwegvakken
//
// These lines replace the old generated mesh, whose hand-drawn boundaries
// allowed diagonals across quays, islands and Amsterdam Centraal.

const NWB_SOURCE = 'Rijkswaterstaat NWB Vaarwegen'
const NWB_SOURCE_URL = 'https://geo.rijkswaterstaat.nl/services/ogc/gdr/nwb_vaarwegen/ogc/features/v1/collections/vaarwegvakken'

export const SUPPLEMENTAL_WATERWAY_FEATURES = [
  nwbFeature(1327, 'IJ verbinding Westerdok', [[4.8907017,52.3830424],[4.8907,52.3831],[4.8922,52.3829],[4.8936,52.3831],[4.8943,52.3833]]),
  nwbFeature(3273, 'IJ verbinding Westerdok', [[4.8943,52.3833],[4.8963,52.3833],[4.8982,52.3835]]),
  nwbFeature(3272, 'IJ', [[4.8982,52.3835],[4.8993,52.3826]]),
  nwbFeature(2439, 'IJ', [[4.8993,52.3826],[4.8999,52.3821]]),
  nwbFeature(2440, 'IJ', [[4.8999,52.3821],[4.9019,52.3809]]),
  nwbFeature(1801, 'IJ', [[4.9019,52.3809],[4.9043,52.38]]),
  nwbFeature(1802, 'IJ', [[4.9043,52.38],[4.9076,52.3796],[4.9104,52.3796]]),
  nwbFeature(425, 'IJ', [[4.9104,52.3796],[4.9128,52.3799],[4.9131,52.3799]]),
  nwbFeature(1867, 'IJ', [[4.9131,52.3799],[4.9173,52.3804],[4.9224,52.381],[4.9296,52.3819],[4.9321,52.3822]]),
  nwbFeature(1866, 'IJ', [[4.9321,52.3822],[4.9378,52.3824],[4.9431,52.3824]]),
  nwbFeature(1865, 'IJ', [[4.9431,52.3824],[4.9523,52.3819]]),
  nwbFeature(4192, 'IJ', [[4.9523,52.3819],[4.9535,52.3822],[4.9547,52.3823],[4.956,52.3824],[4.9566,52.3824],[4.9575,52.3824],[4.9584,52.3823],[4.9594,52.3822]]),
  nwbFeature(4193, 'IJ', [[4.9594,52.3822],[4.9596,52.3821],[4.9597,52.3821],[4.96,52.3819],[4.9617,52.3811],[4.9619,52.3811]]),
  nwbFeature(4187, 'IJ', [[4.9619,52.3811],[4.9653,52.3789]]),

  // The recognised passages around Amsterdam Centraal connect the IJ to the
  // city network without drawing a route through the station or railway land.
  nwbFeature(2783, 'Westertoegang', [[4.8993,52.3826],[4.8972,52.3815],[4.8955,52.3799]], '7.5'),
  nwbFeature(1958, 'Open Havenfront', [[4.8955,52.3799],[4.8974,52.3788],[4.8975814,52.3787988],[4.898,52.3785],[4.8983,52.3783],[4.8985,52.378],[4.8987,52.3778],[4.8988,52.3778],[4.8994,52.3774],[4.8995,52.3774]], '7.5'),
  nwbFeature(2773, 'Voormalige Oosterdoksluis', [[4.9104,52.3796],[4.9106169,52.3783535],[4.9107,52.3775],[4.9109,52.376],[4.9119,52.3754]], '7.5'),

  // IJhaven follows the official axis south of Java-eiland and continues via
  // Ertshaven to the Amsterdam-Rijnkanaal connection.
  nwbFeature(3804, 'IJhaven', [[4.9131,52.3799],[4.9153,52.3792],[4.9157,52.3791],[4.9167,52.3789],[4.9172,52.3788],[4.9194,52.3786],[4.9209,52.3785],[4.9222,52.3784],[4.9247,52.378]], '7.5'),
  nwbFeature(3805, 'IJhaven', [[4.9247,52.378],[4.9267,52.3773]], '7.5'),
  nwbFeature(3806, 'IJhaven', [[4.9267,52.3773],[4.9292,52.3768]], '7.5'),
  nwbFeature(3807, 'IJhaven', [[4.9292,52.3768],[4.9321,52.3763]], '7.5'),
  nwbFeature(3853, 'IJhaven', [[4.9321,52.3763],[4.937,52.3755],[4.9376,52.3755],[4.938,52.3754],[4.9388,52.3755]], '7.5'),
  nwbFeature(3768, 'Ertshaven', [[4.9388,52.3755],[4.9488,52.3759]], '7.5'),
  nwbFeature(1539, 'Ertshaven', [[4.9488,52.3759],[4.953,52.3766]], '7.5'),
  nwbFeature(1477, 'Amsterdam-Rijnkanaal', [[4.953,52.3766],[4.9523,52.3819]], '7.5'),
]

export function withSupplementalWaterways(geoJson, options = {}) {
  if (options.includeSupplementalOpenWater === false) return geoJson
  const existingIds = new Set((geoJson?.features || []).map((feature) => feature.id).filter(Boolean))
  const supplemental = SUPPLEMENTAL_WATERWAY_FEATURES.filter((feature) => !existingIds.has(feature.id))
  return {
    type: 'FeatureCollection',
    ...geoJson,
    features: [...(geoJson?.features || []), ...supplemental],
  }
}

function nwbFeature(id, name, coordinates, maxspeed = '12') {
  return {
    type: 'Feature',
    id: `supplemental/nwb-vaarwegvakken/${id}`,
    geometry: { type: 'LineString', coordinates },
    properties: {
      name,
      waterway: 'fairway',
      maxspeed,
      navigationZone: 'zone3',
      source: NWB_SOURCE,
      sourceUrl: `${NWB_SOURCE_URL}/items/vaarwegvakken.${id}`,
      sourceFeatureId: `vaarwegvakken.${id}`,
    },
  }
}
