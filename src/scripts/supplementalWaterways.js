const IJ_MAIN_POLYGON = [
  [4.8888, 52.3843], [4.8950, 52.3842], [4.9050, 52.3836], [4.9180, 52.3831],
  [4.9340, 52.3836], [4.9510, 52.3838], [4.9640, 52.3831], [4.9650, 52.3818],
  [4.9610, 52.3819], [4.9550, 52.3820], [4.9440, 52.3821], [4.9320, 52.3822],
  [4.9200, 52.3822], [4.9080, 52.3822], [4.8990, 52.3824], [4.8940, 52.3825],
  [4.8887, 52.3821],
]

const IJHAVEN_POLYGON = [
  [4.9168, 52.3794], [4.9250, 52.3790], [4.9385, 52.3787], [4.9525, 52.3790],
  [4.9615, 52.3800], [4.9630, 52.3810], [4.9585, 52.3814], [4.9470, 52.3805],
  [4.9340, 52.3800], [4.9210, 52.3801], [4.9162, 52.3800],
]

const IJ_OPEN_WATER_FEATURES = [
  {
    type: "Feature",
    id: "supplemental/ij-main-fairway",
    geometry: {
      type: "LineString",
      coordinates: [
        [4.8909, 52.3840], [4.8995, 52.3836], [4.9049, 52.3836], [4.9140, 52.3830],
        [4.9195, 52.3822], [4.9245, 52.3831], [4.9365, 52.3834], [4.9490, 52.3834],
        [4.9605, 52.3829], [4.9639, 52.3822],
      ],
    },
    properties: { name: "IJ", waterway: "river", maxspeed: "12", navigationZone: "zone3", source: "supplemental-open-water-fairway" },
  },
  ...openWaterMeshFeatures("ij-open-water", "IJ", IJ_MAIN_POLYGON, 0.0018, "12", [
    [4.8909, 52.3840],
    [4.9041, 52.3822],
    [4.9107, 52.3822],
    [4.9195, 52.3822],
    [4.9639, 52.3822],
  ]),
  ...openWaterMeshFeatures("ijhaven-open-water", "IJhaven", IJHAVEN_POLYGON, 0.0020, "7.5"),
]

export const SUPPLEMENTAL_WATERWAY_FEATURES = [
  ...IJ_OPEN_WATER_FEATURES,
  {
    type: "Feature",
    id: "supplemental/ij-westerdok",
    geometry: { type: "LineString", coordinates: [[4.8909, 52.3840], [4.8911483, 52.3830576], [4.8914748, 52.3830531], [4.8907017, 52.3830424]] },
    properties: { name: "IJ verbinding Westerdoksluis", waterway: "canal", maxspeed: "7.5", navigationZone: "zone3", source: "supplemental-route-network" },
  },
  {
    type: "Feature",
    id: "supplemental/ij-open-havenfront",
    geometry: { type: "LineString", coordinates: [[4.9049, 52.3836], [4.9041, 52.3822], [4.9028, 52.3802], [4.9005, 52.3791], [4.8975814, 52.3787988]] },
    properties: { name: "IJ verbinding Open Havenfront", waterway: "canal", maxspeed: "7.5", navigationZone: "zone3", source: "supplemental-route-network" },
  },
  {
    type: "Feature",
    id: "supplemental/ij-oosterdok",
    geometry: { type: "LineString", coordinates: [[4.9140, 52.3830], [4.9107, 52.3822], [4.9108, 52.3797], [4.9106169, 52.3783535]] },
    properties: { name: "IJ verbinding Oosterdoksdoorgang", waterway: "canal", maxspeed: "7.5", navigationZone: "zone3", source: "supplemental-route-network" },
  },
  {
    type: "Feature",
    id: "supplemental/ij-oosterdok-open-haven",
    geometry: { type: "LineString", coordinates: [[4.9049, 52.3836], [4.9041, 52.3822], [4.9032, 52.3799], [4.9015, 52.3786], [4.8996416, 52.3773686]] },
    properties: { name: "IJ verbinding Oosterdok/Open Havenfront", waterway: "canal", maxspeed: "7.5", navigationZone: "zone3", source: "supplemental-route-network" },
  },
  {
    type: "Feature",
    id: "supplemental/ijhaven-west",
    geometry: { type: "LineString", coordinates: [[4.9195, 52.3822], [4.9202, 52.3807], [4.9165, 52.3801], [4.9168, 52.3792], [4.9205, 52.3787]] },
    properties: { name: "IJhaven westelijke toegang", waterway: "canal", maxspeed: "7.5", navigationZone: "zone3", source: "supplemental-route-network" },
  },
  {
    type: "Feature",
    id: "supplemental/ijhaven",
    geometry: { type: "LineString", coordinates: [[4.9205, 52.3787], [4.9290, 52.3782], [4.9385, 52.3779], [4.9475, 52.3779], [4.9570, 52.3784]] },
    properties: { name: "IJhaven", waterway: "canal", maxspeed: "7.5", navigationZone: "zone3", source: "supplemental-route-network" },
  },
  {
    type: "Feature",
    id: "supplemental/ijhaven-east",
    geometry: { type: "LineString", coordinates: [[4.9570, 52.3784], [4.9605, 52.3795], [4.9582, 52.3807], [4.9639, 52.3822]] },
    properties: { name: "IJhaven oostelijke toegang", waterway: "canal", maxspeed: "7.5", navigationZone: "zone3", source: "supplemental-route-network" },
  },
  {
    type: "Feature",
    id: "supplemental/entrepothaven",
    geometry: { type: "LineString", coordinates: [[4.9205, 52.3787], [4.9194, 52.3768], [4.9228, 52.3758], [4.9295, 52.3756], [4.9365, 52.3757]] },
    properties: { name: "Entrepothaven", waterway: "canal", maxspeed: "6", navigationZone: "zone3", source: "supplemental-route-network" },
  },
  {
    type: "Feature",
    id: "supplemental/knsm-erhaven",
    geometry: { type: "LineString", coordinates: [[4.9475, 52.3779], [4.9505, 52.3766], [4.9565, 52.3764], [4.9635, 52.3770]] },
    properties: { name: "KNSM / Ertshaven verbinding", waterway: "canal", maxspeed: "6", navigationZone: "zone3", source: "supplemental-route-network" },
  },
]

export function withSupplementalWaterways(geoJson, options = {}) {
  if (options.includeSupplementalOpenWater === false) return geoJson
  const existingIds = new Set((geoJson?.features || []).map((feature) => feature.id).filter(Boolean))
  const supplemental = SUPPLEMENTAL_WATERWAY_FEATURES.filter((feature) => !existingIds.has(feature.id))
  return {
    type: "FeatureCollection",
    ...geoJson,
    features: [...(geoJson?.features || []), ...supplemental],
  }
}

function openWaterMeshFeatures(idPrefix, name, polygon, step, maxspeed, anchors = []) {
  const [minLng, minLat, maxLng, maxLat] = polygonBounds(polygon)
  const points = []
  const pointKeys = new Set()
  const addPoint = (point) => {
    const key = pointKey(point)
    if (pointKeys.has(key)) return
    pointKeys.add(key)
    points.push(point)
  }
  for (let lng = minLng; lng <= maxLng + step / 2; lng += step) {
    for (let lat = minLat; lat <= maxLat + step / 2; lat += step) {
      const point = [roundCoordinate(lng), roundCoordinate(lat)]
      if (pointInPolygon(point, polygon)) addPoint(point)
    }
  }
  for (const anchor of anchors) {
    const point = [roundCoordinate(anchor[0]), roundCoordinate(anchor[1])]
    if (pointInPolygon(point, polygon)) addPoint(point)
  }

  const features = []
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    for (let otherIndex = index + 1; otherIndex < points.length; otherIndex += 1) {
      const other = points[otherIndex]
      if (Math.abs(point[0] - other[0]) > step * 1.45 || Math.abs(point[1] - other[1]) > step * 1.45) continue
      if (!segmentInsidePolygon(point, other, polygon)) continue
      features.push({
        type: "Feature",
        id: `supplemental/${idPrefix}/${features.length}`,
        geometry: { type: "LineString", coordinates: [point, other] },
        properties: { name, waterway: "river", maxspeed, navigationZone: "zone3", source: "supplemental-open-water-mesh" },
      })
    }
  }
  return features
}

function segmentInsidePolygon(start, end, polygon) {
  for (const ratio of [0.25, 0.5, 0.75]) {
    const point = [
      roundCoordinate(start[0] + (end[0] - start[0]) * ratio),
      roundCoordinate(start[1] + (end[1] - start[1]) * ratio),
    ]
    if (!pointInPolygon(point, polygon)) return false
  }
  return true
}

function polygonBounds(polygon) {
  return polygon.reduce(([minLng, minLat, maxLng, maxLat], [lng, lat]) => [
    Math.min(minLng, lng), Math.min(minLat, lat), Math.max(maxLng, lng), Math.max(maxLat, lat),
  ], [Infinity, Infinity, -Infinity, -Infinity])
}

function pointKey(point) {
  return `${point[0].toFixed(6)},${point[1].toFixed(6)}`
}

function roundCoordinate(value) {
  return Number(value.toFixed(6))
}

function pointInPolygon(point, polygon) {
  const [lng, lat] = point
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [lngA, latA] = polygon[index]
    const [lngB, latB] = polygon[previous]
    const intersects = (latA > lat) !== (latB > lat) && lng < ((lngB - lngA) * (lat - latA)) / (latB - latA || 1) + lngA
    if (intersects) inside = !inside
  }
  return inside
}
