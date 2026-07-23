import { withSupplementalWaterways } from "./supplementalWaterways.js";

const GRID_SIZE = 0.002;
const MAX_SNAP_DISTANCE_METERS = 50;
const MAX_ENDPOINT_GAP_METERS = 45;
const MAX_REPORT_GAP_MS = 15 * 60 * 1000;
const MAX_REPORT_DISTANCE_METERS = 2_000;
const MAX_IMPLIED_SPEED_KNOTS = 30;
const KNOTS_TO_KMH = 1.852;
const FORBIDDEN_WATERWAY_NAMES = new Set([
  "Beulingsloot",
  "Oudezijds Achterburgwal",
]);
export function buildCanalRoutingNetwork(geoJson, options = {}) {
  const nodes = new Map();
  const grid = new Map();
  const endpointKeys = new Set();
  const respectRestrictions = Boolean(options.respectRestrictions);

  const features = withSupplementalWaterways(geoJson, options)?.features || [];
  for (const feature of features) {
    if (respectRestrictions && isForbiddenForRouting(feature)) continue;
    for (const line of getLines(feature)) {
      let previous = null;
      let first = null;
      for (const coordinate of line) {
        if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
        const node = getOrCreateNode(nodes, grid, coordinate[1], coordinate[0]);
        if (!first) first = node;
        if (previous && previous !== node) {
          const distance = distanceMeters(previous, node);
          const edge = createEdge(distance, feature);
          previous.neighbors.set(node.key, edge);
          if (!respectRestrictions || !isOneway(feature)) node.neighbors.set(previous.key, edge);
        }
        previous = node;
      }
      if (first) endpointKeys.add(first.key);
      if (previous) endpointKeys.add(previous.key);
    }
  }

  const virtualEdges = connectNearbyComponents(nodes, endpointKeys);
  return { nodes, grid, virtualEdges };
}

export function planCanalRoute(start, end, network, options = {}) {
  return planCanalRouteVia([start, end], network, options);
}

export function planCanalRouteVia(points, network, options = {}) {
  const routePoints = (Array.isArray(points) ? points : []).map(normalizePoint).filter(Boolean);
  if (routePoints.length < 2) return { status: "invalid", message: "Choose at least a start and destination." };
  if (!network?.nodes?.size) return { status: "no-network", message: "Waterway network is not loaded yet." };

  const snapDistance = Number(options.snapDistanceMeters || 120);
  const snapped = routePoints.map((point) => findNearestNode(network, point.lat, point.lng, snapDistance));
  const missingIndex = snapped.findIndex((snap) => !snap);
  if (missingIndex >= 0) {
    return {
      status: "not-on-water",
      message: `Route point ${missingIndex + 1} is too far from mapped water.`,
      snapped,
    };
  }

  const route = [];
  let partialRoute = null;
  for (let index = 1; index < snapped.length; index += 1) {
    const from = snapped[index - 1];
    const to = snapped[index];
    const directDistance = distanceMeters(from.node, to.node);
    const maximumRouteDistance = Number(options.maximumDistanceMeters || Math.max(5_000, directDistance * 8 + 1_000));
    const leg = findShortestPath(network, from.node, to.node, maximumRouteDistance, options);
    if (!leg?.length) {
      const closest = findClosestReachablePath(network, from.node, to.node, maximumRouteDistance, options);
      if (!closest?.path?.length) return { status: "no-route", message: `No connected water route was found between point ${index} and ${index + 1}.`, snapped };
      if (!route.length) route.push(...closest.path);
      else route.push(...closest.path.slice(1));
      partialRoute = {
        failedLegIndex: index,
        target: { latitude: to.node.lat, longitude: to.node.lng },
        reached: { latitude: closest.node.lat, longitude: closest.node.lng },
        distanceToTargetMeters: Math.round(closest.distanceToGoal),
      };
      break;
    }
    if (!route.length) route.push(...leg);
    else route.push(...leg.slice(1));
  }

  const distance = pathDistance(route);
  const speedKnots = Number(options.speedKnots || 5.5);
  const baseDurationMinutes = speedKnots > 0 ? Math.max(1, Math.round(pathDurationMinutes(route, network, speedKnots))) : null;
  const traffic = estimateTraffic(route, options.trafficPoints || []);
  const durationMinutes = baseDurationMinutes === null ? null : Math.max(1, Math.round(baseDurationMinutes * traffic.factor));
  const coordinates = route.map((node) => [node.lat, node.lng]);
  const virtualSegmentCount = route.slice(1).filter((node, index) => network.virtualEdges.has(getEdgeKey(route[index].key, node.key))).length;
  const warnings = routeConstraintWarnings(route, network, options.boatProfile);
  return {
    status: partialRoute ? "partial" : "ok",
    message: partialRoute ? `Geen volledige waterroute gevonden; route gaat tot ${partialRoute.distanceToTargetMeters} m van de bestemming.` : "Route found.",
    coordinates,
    distanceMeters: Math.round(distance),
    baseDurationMinutes,
    durationMinutes,
    speedKnots,
    speedKmh: speedKnots * KNOTS_TO_KMH,
    trafficFactor: traffic.factor,
    trafficLevel: traffic.level,
    trafficVesselCount: traffic.vesselCount,
    trafficDelayMinutes: baseDurationMinutes === null ? 0 : Math.max(0, durationMinutes - baseDurationMinutes),
    steps: routeSteps(route, network),
    segments: routeSegments(route, network),
    snapped: snapped.map((snap) => ({ latitude: snap.node.lat, longitude: snap.node.lng, snapDistanceMeters: Math.round(snap.distance) })),
    from: { latitude: snapped[0].node.lat, longitude: snapped[0].node.lng, snapDistanceMeters: Math.round(snapped[0].distance) },
    to: { latitude: snapped.at(-1).node.lat, longitude: snapped.at(-1).node.lng, snapDistanceMeters: Math.round(snapped.at(-1).distance) },
    virtualSegmentCount,
    warnings,
    partialRoute,
  };
}

export function generateCanalLoopRoute(start, network, options = {}) {
  const point = normalizePoint(start);
  if (!point) return { status: "invalid", message: "Choose a start point first." };
  if (!network?.nodes?.size) return { status: "no-network", message: "Waterway network is not loaded yet." };

  const snapDistance = Number(options.snapDistanceMeters || 120);
  const snapped = findNearestNode(network, point.lat, point.lng, snapDistance);
  if (!snapped) return { status: "not-on-water", message: "Start point is too far from mapped water." };

  const targetMinutes = Math.max(10, Number(options.targetMinutes || 60));
  const speedKnots = Number(options.speedKnots || 5.5);
  const requestedDistance = Math.max(350, speedKnots * 1852 * (targetMinutes / 60));
  const random = seededRandom(options.seed ?? Math.floor(Math.random() * 1_000_000_000));
  const attempts = Math.max(20, Number(options.attempts || 90));
  let best = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const loopOptions = { ...options, avoidVirtualEdges: true };
    const outbound = randomWalkOutbound(snapped.node, network, requestedDistance * (0.35 + random() * 0.2), random, loopOptions);
    const far = outbound.at(-1);
    if (!far || far.key === snapped.node.key || outbound.length < 3) continue;
    const returnPath = findShortestPath(network, far, snapped.node, requestedDistance * 0.9 + 600, loopOptions);
    if (!returnPath?.length || returnPath.length < 2) continue;
    const route = [...outbound, ...returnPath.slice(1)];
    if (routeUsesVirtualEdge(route, network)) continue;
    const distance = pathDistance(route);
    const baseDurationMinutes = Math.max(1, Math.round(pathDurationMinutes(route, network, speedKnots)));
    if (baseDurationMinutes > targetMinutes) continue;
    const score = Math.abs(targetMinutes - baseDurationMinutes) + repeatedNodePenalty(route) + Math.max(0, targetMinutes * 0.45 - baseDurationMinutes);
    if (!best || score < best.score) best = { route, distance, baseDurationMinutes, score };
  }

  if (!best) return { status: "no-loop", message: `Geen rondje gevonden dat binnen ${targetMinutes} minuten terug is bij het startpunt.` };

  const traffic = estimateTraffic(best.route, options.trafficPoints || []);
  const durationMinutes = Math.max(1, Math.round(best.baseDurationMinutes * traffic.factor));
  return {
    status: "ok",
    routeType: "loop",
    message: `Rondje gevonden binnen ${targetMinutes} minuten.`,
    coordinates: best.route.map((node) => [node.lat, node.lng]),
    distanceMeters: Math.round(best.distance),
    baseDurationMinutes: best.baseDurationMinutes,
    durationMinutes,
    targetDurationMinutes: targetMinutes,
    speedKnots,
    speedKmh: speedKnots * KNOTS_TO_KMH,
    trafficFactor: traffic.factor,
    trafficLevel: traffic.level,
    trafficVesselCount: traffic.vesselCount,
    trafficDelayMinutes: Math.max(0, durationMinutes - best.baseDurationMinutes),
    steps: routeSteps(best.route, network),
    segments: routeSegments(best.route, network),
    snapped: [{ latitude: snapped.node.lat, longitude: snapped.node.lng, snapDistanceMeters: Math.round(snapped.distance) }],
    from: { latitude: snapped.node.lat, longitude: snapped.node.lng, snapDistanceMeters: Math.round(snapped.distance) },
    to: { latitude: snapped.node.lat, longitude: snapped.node.lng, snapDistanceMeters: Math.round(snapped.distance) },
    virtualSegmentCount: best.route.slice(1).filter((node, index) => network.virtualEdges.has(getEdgeKey(best.route[index].key, node.key))).length,
    warnings: routeConstraintWarnings(best.route, network, options.boatProfile),
  };
}

function randomWalkOutbound(start, network, targetDistance, random, options = {}) {
  const route = [start];
  let distance = 0;
  let previousKey = null;
  const visits = new Map([[start.key, 1]]);
  while (distance < targetDistance && route.length < 90) {
    const current = route.at(-1);
    const candidates = [...current.neighbors.entries()]
      .filter(([key, edge]) => isEdgePassable(edge, options.boatProfile) && isEdgeAllowed(current.key, key, edge, network, options))
      .map(([key, edge]) => ({ key, edge, node: network.nodes.get(key), visits: visits.get(key) || 0 }))
      .filter((candidate) => candidate.node && (current.neighbors.size <= 1 || candidate.key !== previousKey))
      .sort((a, b) => a.visits - b.visits || random() - 0.5);
    if (!candidates.length) break;
    const pool = candidates.slice(0, Math.min(4, candidates.length));
    const selected = pool[Math.floor(random() * pool.length)];
    previousKey = current.key;
    route.push(selected.node);
    visits.set(selected.key, (visits.get(selected.key) || 0) + 1);
    distance += edgeMeters(selected.edge);
  }
  return route;
}

function repeatedNodePenalty(route) {
  const seen = new Set();
  let repeats = 0;
  for (const node of route) {
    if (seen.has(node.key)) repeats += 1;
    seen.add(node.key);
  }
  return repeats * 3;
}

function routeUsesVirtualEdge(route, network) {
  return route.slice(1).some((node, index) => network.virtualEdges.has(getEdgeKey(route[index].key, node.key)));
}

function seededRandom(seed) {
  let value = Number(seed) || 1;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

export function reconstructCanalRoute(points, network) {
  const reports = points
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
    .sort((left, right) => reportTimestamp(left) - reportTimestamp(right))
    .map((point) => ({ ...point, snapped: findNearestNode(network, point.latitude, point.longitude) }));
  const paths = [];
  const fallbackSegments = [];
  let omittedSegments = 0;

  for (let index = 1; index < reports.length; index += 1) {
    const previous = reports[index - 1];
    const current = reports[index];
    const reportDistance = distanceMeters(
      { lat: previous.latitude, lng: previous.longitude },
      { lat: current.latitude, lng: current.longitude },
    );
    if (!isPlausibleReportPair(previous, current, reportDistance)) {
      omittedSegments += 1;
      continue;
    }
    if (!previous.snapped || !current.snapped) {
      if (reportDistance <= 500) fallbackSegments.push([[previous.latitude, previous.longitude], [current.latitude, current.longitude]]);
      else omittedSegments += 1;
      continue;
    }

    const directDistance = distanceMeters(previous.snapped.node, current.snapped.node);
    const maximumRouteDistance = Math.min(2_500, Math.max(350, directDistance * 2.5 + 100));
    const route = findShortestPath(network, previous.snapped.node, current.snapped.node, maximumRouteDistance, { allowZone3: true });
    if (!route?.length) {
      if (reportDistance <= 500) fallbackSegments.push([[previous.latitude, previous.longitude], [current.latitude, current.longitude]]);
      else omittedSegments += 1;
      continue;
    }

    const routedDistance = pathDistance(route);
    if (routedDistance > Math.max(250, reportDistance * 2.25 + 100)) {
      omittedSegments += 1;
      continue;
    }

    if (route.length === 1) {
      if (reportDistance > 15) fallbackSegments.push([[previous.latitude, previous.longitude], [current.latitude, current.longitude]]);
    }

    for (let routeIndex = 1; routeIndex < route.length; routeIndex += 1) {
      const start = route[routeIndex - 1];
      const end = route[routeIndex];
      const segment = [[start.lat, start.lng], [end.lat, end.lng]];
      if (network.virtualEdges.has(getEdgeKey(start.key, end.key))) fallbackSegments.push(segment);
      else appendConnectedSegment(paths, segment);
    }
  }

  return { paths, fallbackSegments, reports, omittedSegments };
}

function isPlausibleReportPair(previous, current, distance) {
  if (distance > MAX_REPORT_DISTANCE_METERS) return false;
  const previousTime = reportTimestamp(previous);
  const currentTime = reportTimestamp(current);
  if (!previousTime || !currentTime) return distance <= 500;
  const elapsed = currentTime - previousTime;
  if (elapsed <= 0 || elapsed > MAX_REPORT_GAP_MS) return false;
  const speedKnots = (distance / (elapsed / 1000)) * 1.943844;
  return speedKnots <= MAX_IMPLIED_SPEED_KNOTS;
}

function reportTimestamp(report) {
  const numeric = Number(report?.receivedAt);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(report?.receivedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function pathDistance(route) {
  let total = 0;
  for (let index = 1; index < route.length; index += 1) total += distanceMeters(route[index - 1], route[index]);
  return total;
}

function appendConnectedSegment(paths, segment) {
  const lastPath = paths.at(-1);
  const lastPoint = lastPath?.at(-1);
  if (lastPoint && lastPoint[0] === segment[0][0] && lastPoint[1] === segment[0][1]) lastPath.push(segment[1]);
  else paths.push(segment);
}

function connectNearbyComponents(nodes, endpointKeys) {
  const componentByNode = findComponents(nodes);
  const endpoints = Array.from(endpointKeys, (key) => nodes.get(key));
  const virtualEdges = new Set();

  for (const endpoint of endpoints) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const candidate of endpoints) {
      if (candidate === endpoint || endpoint.neighbors.has(candidate.key)) continue;
      const distance = distanceMeters(endpoint, candidate);
      const sameComponent = componentByNode.get(candidate.key) === componentByNode.get(endpoint.key);
      const allowedDistance = sameComponent ? 30 : MAX_ENDPOINT_GAP_METERS;
      if (distance < nearestDistance && distance <= allowedDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    if (!nearest) continue;

    endpoint.neighbors.set(nearest.key, { distance: nearestDistance, name: "kaartverbinding", virtual: true });
    nearest.neighbors.set(endpoint.key, { distance: nearestDistance, name: "kaartverbinding", virtual: true });
    virtualEdges.add(getEdgeKey(endpoint.key, nearest.key));
  }

  return virtualEdges;
}

function findComponents(nodes) {
  const components = new Map();
  let componentId = 0;
  for (const node of nodes.values()) {
    if (components.has(node.key)) continue;
    componentId += 1;
    const stack = [node];
    components.set(node.key, componentId);
    while (stack.length) {
      const current = stack.pop();
      for (const neighborKey of current.neighbors.keys()) {
        if (components.has(neighborKey)) continue;
        components.set(neighborKey, componentId);
        stack.push(nodes.get(neighborKey));
      }
    }
  }
  return components;
}

function getEdgeKey(firstKey, secondKey) {
  return firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
}

function getLines(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  return feature.geometry.type === "MultiLineString" ? coordinates : [coordinates];
}

function getOrCreateNode(nodes, grid, lat, lng) {
  const key = `${lat.toFixed(7)},${lng.toFixed(7)}`;
  if (nodes.has(key)) return nodes.get(key);

  const node = { key, lat, lng, neighbors: new Map() };
  nodes.set(key, node);
  const bucketKey = getBucketKey(lat, lng);
  if (!grid.has(bucketKey)) grid.set(bucketKey, []);
  grid.get(bucketKey).push(node);
  return node;
}

export function findNearestNode(network, lat, lng, maxDistanceMeters = MAX_SNAP_DISTANCE_METERS) {
  const centerLat = Math.floor(lat / GRID_SIZE);
  const centerLng = Math.floor(lng / GRID_SIZE);
  let bestNode = null;
  let bestDistance = Infinity;

  for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
    for (let lngOffset = -1; lngOffset <= 1; lngOffset += 1) {
      const bucket = network.grid.get(`${centerLat + latOffset}:${centerLng + lngOffset}`) || [];
      for (const node of bucket) {
        const distance = distanceMeters({ lat, lng }, node);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestNode = node;
        }
      }
    }
  }

  return bestNode && bestDistance <= maxDistanceMeters ? { node: bestNode, distance: bestDistance } : null;
}

function findShortestPath(network, start, goal, maximumDistance, options = {}) {
  if (start.key === goal.key) return [start];

  const open = new MinHeap();
  const distance = new Map([[start.key, 0]]);
  const previous = new Map();
  open.push({ key: start.key, score: distanceMeters(start, goal) });
  let visited = 0;

  while (open.size && visited < 20_000) {
    const currentEntry = open.pop();
    const current = network.nodes.get(currentEntry.key);
    const currentDistance = distance.get(current.key);
    visited += 1;

    if (current.key === goal.key) return buildPath(network, previous, goal.key);
    if (currentDistance > maximumDistance) continue;

    for (const [neighborKey, edge] of current.neighbors) {
      if (!isEdgePassable(edge, options.boatProfile) || !isEdgeAllowed(current.key, neighborKey, edge, network, options)) continue;
      const edgeDistance = edgeMeters(edge);
      const nextDistance = currentDistance + edgeDistance;
      if (nextDistance >= (distance.get(neighborKey) ?? Infinity) || nextDistance > maximumDistance) continue;
      distance.set(neighborKey, nextDistance);
      previous.set(neighborKey, current.key);
      const neighbor = network.nodes.get(neighborKey);
      open.push({ key: neighborKey, score: nextDistance + distanceMeters(neighbor, goal) });
    }
  }

  return null;
}

function findClosestReachablePath(network, start, goal, maximumDistance, options = {}) {
  const open = new MinHeap();
  const distance = new Map([[start.key, 0]]);
  const previous = new Map();
  let best = { node: start, distanceToGoal: distanceMeters(start, goal) };
  open.push({ key: start.key, score: 0 });
  let visited = 0;

  while (open.size && visited < 20_000) {
    const currentEntry = open.pop();
    const current = network.nodes.get(currentEntry.key);
    const currentDistance = distance.get(current.key);
    visited += 1;

    const distanceToGoal = distanceMeters(current, goal);
    if (distanceToGoal < best.distanceToGoal) best = { node: current, distanceToGoal };
    if (currentDistance > maximumDistance) continue;

    for (const [neighborKey, edge] of current.neighbors) {
      if (!isEdgePassable(edge, options.boatProfile) || !isEdgeAllowed(current.key, neighborKey, edge, network, options)) continue;
      const nextDistance = currentDistance + edgeMeters(edge);
      if (nextDistance >= (distance.get(neighborKey) ?? Infinity) || nextDistance > maximumDistance) continue;
      distance.set(neighborKey, nextDistance);
      previous.set(neighborKey, current.key);
      open.push({ key: neighborKey, score: nextDistance });
    }
  }

  return {
    ...best,
    path: buildPath(network, previous, best.node.key),
  };
}

function buildPath(network, previous, goalKey) {
  const path = [network.nodes.get(goalKey)];
  let key = goalKey;
  while (previous.has(key)) {
    key = previous.get(key);
    path.push(network.nodes.get(key));
  }
  return path.reverse();
}

function createEdge(distance, feature) {
  const properties = feature?.properties || {};
  return {
    distance,
    name: properties.name || properties.alt_name || properties.old_name || properties["@id"] || "Naamloos water",
    maxspeed: Number.parseFloat(properties.maxspeed) || null,
    clearanceHeight: parseMeters(properties["seamark:bridge:clearance_height"] ?? properties.maxheight ?? properties.clearance_height),
    clearanceWidth: parseMeters(properties["seamark:bridge:clearance_width"] ?? properties.maxwidth ?? properties.clearance_width),
    maxDraft: parseMeters(properties.maxdraft ?? properties["seamark:waterway:maxdraft"]),
    zone: properties.navigationZone || properties.zone || null,
    closed: isClosedForRouting(feature),
    oneway: isOneway(feature),
  };
}

function parseMeters(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function isEdgePassable(edge, boatProfile = {}) {
  if (!edge || typeof edge !== "object") return true;
  const height = Number(boatProfile.heightMeters);
  const width = Number(boatProfile.widthMeters);
  const draft = Number(boatProfile.draftMeters);
  const safetyMargin = Number.isFinite(Number(boatProfile.safetyMarginMeters)) ? Number(boatProfile.safetyMarginMeters) : 0.15;
  if (Number.isFinite(height) && edge.clearanceHeight !== null && edge.clearanceHeight !== undefined && height + safetyMargin > edge.clearanceHeight) return false;
  if (Number.isFinite(width) && edge.clearanceWidth !== null && edge.clearanceWidth !== undefined && width > edge.clearanceWidth) return false;
  if (Number.isFinite(draft) && edge.maxDraft !== null && edge.maxDraft !== undefined && draft > edge.maxDraft) return false;
  return true;
}

function isEdgeAllowed(fromKey, toKey, edge, network, options = {}) {
  if (options.avoidVirtualEdges && (edge?.virtual || network?.virtualEdges?.has(getEdgeKey(fromKey, toKey)))) return false;
  if (edge?.closed) return false;
  if (edge?.zone === "zone3" && !options.allowZone3) return false;
  if (edgeIsClosedByPoint(network.nodes.get(fromKey), network.nodes.get(toKey), options.closurePoints)) return false;
  return true;
}

function edgeMeters(edge) {
  return typeof edge === "number" ? edge : Number(edge?.distance) || 0;
}

function routeSteps(route, network) {
  if (!route?.length || route.length < 2) return [];
  const steps = [];
  let current = null;
  for (let index = 1; index < route.length; index += 1) {
    const edge = network.nodes.get(route[index - 1].key)?.neighbors.get(route[index].key);
    const name = typeof edge === "object" && edge?.name ? edge.name : "Naamloos water";
    const distance = distanceMeters(route[index - 1], route[index]);
    if (current && current.name === name) current.distanceMeters += distance;
    else {
      current = { name, distanceMeters: distance };
      steps.push(current);
    }
  }
  return steps.map((step) => ({ ...step, distanceMeters: Math.round(step.distanceMeters) }))
    .filter((step) => step.distanceMeters >= 5);
}

function routeSegments(route, network) {
  if (!route?.length || route.length < 2) return [];
  const segments = [];
  let routeMeters = 0;
  for (let index = 1; index < route.length; index += 1) {
    const start = route[index - 1];
    const end = route[index];
    const edge = network.nodes.get(start.key)?.neighbors.get(end.key);
    const distance = distanceMeters(start, end);
    segments.push({
      name: typeof edge === "object" && edge?.name ? edge.name : "Naamloos water",
      distanceMeters: Math.round(distance),
      startMeters: Math.round(routeMeters),
      endMeters: Math.round(routeMeters + distance),
      start: { latitude: start.lat, longitude: start.lng },
      end: { latitude: end.lat, longitude: end.lng },
    });
    routeMeters += distance;
  }
  return segments.filter((segment) => segment.distanceMeters >= 1);
}

function edgeIsClosedByPoint(start, end, closurePoints = []) {
  if (!start || !end || !Array.isArray(closurePoints) || !closurePoints.length) return false;
  return closurePoints.some((closure) => {
    const point = normalizePoint(closure);
    if (!point) return false;
    const radius = Math.max(15, Number(closure.radiusMeters || 90));
    return distanceToSegmentMeters(point, start, end) <= radius;
  });
}

function pathDurationMinutes(route, network, requestedSpeedKnots) {
  let totalMinutes = 0;
  const requestedKmh = requestedSpeedKnots * KNOTS_TO_KMH;
  for (let index = 1; index < route.length; index += 1) {
    const edge = network.nodes.get(route[index - 1].key)?.neighbors.get(route[index].key);
    const edgeDistanceKm = distanceMeters(route[index - 1], route[index]) / 1000;
    const limitKmh = Number(edge?.maxspeed);
    const speedKmh = Math.max(1, Number.isFinite(limitKmh) && limitKmh > 0 ? Math.min(requestedKmh, limitKmh) : requestedKmh);
    totalMinutes += (edgeDistanceKm / speedKmh) * 60;
  }
  return totalMinutes;
}

function routeConstraintWarnings(route, network, boatProfile = {}) {
  const warnings = [];
  if (routeUsesZone(route, network, "zone3")) warnings.push("Zone 3 / IJ: alleen varen als schipper en boot hiervoor bevoegd zijn");
  if (!boatProfile || (!Number(boatProfile.heightMeters) && !Number(boatProfile.widthMeters) && !Number(boatProfile.draftMeters))) return warnings;
  const constrained = new Map();
  for (let index = 1; index < route.length; index += 1) {
    const edge = network.nodes.get(route[index - 1].key)?.neighbors.get(route[index].key);
    if (!edge || typeof edge !== "object") continue;
    const parts = [];
    if (edge.clearanceHeight !== null && edge.clearanceHeight !== undefined) parts.push(`hoogte ${edge.clearanceHeight} m`);
    if (edge.clearanceWidth !== null && edge.clearanceWidth !== undefined) parts.push(`breedte ${edge.clearanceWidth} m`);
    if (edge.maxDraft !== null && edge.maxDraft !== undefined) parts.push(`diepgang ${edge.maxDraft} m`);
    if (parts.length) constrained.set(edge.name, parts.join(", "));
  }
  for (const [name, text] of constrained) warnings.push(`${name}: beperking ${text}`);
  return warnings.slice(0, 6);
}

function routeUsesZone(route, network, zone) {
  if (!route?.length || route.length < 2) return false;
  for (let index = 1; index < route.length; index += 1) {
    const edge = network.nodes.get(route[index - 1].key)?.neighbors.get(route[index].key);
    if (edge?.zone === zone) return true;
  }
  return false;
}

function estimateTraffic(route, trafficPoints) {
  if (!route?.length || route.length < 2 || !Array.isArray(trafficPoints) || !trafficPoints.length) {
    return { factor: 1, level: "rustig", vesselCount: 0 };
  }
  const nearby = new Set();
  for (const vessel of trafficPoints) {
    const point = normalizePoint(vessel);
    if (!point) continue;
    const timestamp = Date.parse(vessel.sourceReceivedAt || vessel.receivedAt || "");
    if (Number.isFinite(timestamp) && Date.now() - timestamp > 15 * 60_000) continue;
    for (let index = 1; index < route.length; index += 1) {
      if (distanceToSegmentMeters(point, route[index - 1], route[index]) <= 90) {
        nearby.add(String(vessel.mmsi || `${point.lat},${point.lng}`));
        break;
      }
    }
  }
  const vesselCount = nearby.size;
  const routeKm = Math.max(0.25, pathDistance(route) / 1000);
  const density = vesselCount / routeKm;
  const factor = density >= 8 ? 1.45 : density >= 5 ? 1.28 : density >= 2.5 ? 1.14 : 1;
  const level = factor >= 1.4 ? "druk" : factor >= 1.2 ? "matig druk" : factor > 1 ? "licht druk" : "rustig";
  return { factor, level, vesselCount };
}

function distanceToSegmentMeters(point, start, end) {
  const latScale = 111_320;
  const lngScale = 111_320 * Math.cos(((start.lat + end.lat) / 2) * Math.PI / 180);
  const px = (point.lng - start.lng) * lngScale;
  const py = (point.lat - start.lat) * latScale;
  const vx = (end.lng - start.lng) * lngScale;
  const vy = (end.lat - start.lat) * latScale;
  const lengthSquared = vx * vx + vy * vy;
  const t = lengthSquared ? Math.max(0, Math.min(1, (px * vx + py * vy) / lengthSquared)) : 0;
  return Math.hypot(px - vx * t, py - vy * t);
}

function getBucketKey(lat, lng) {
  return `${Math.floor(lat / GRID_SIZE)}:${Math.floor(lng / GRID_SIZE)}`;
}

export function distanceMeters(first, second) {
  const latDistance = (second.lat - first.lat) * 111_320;
  const lngDistance = (second.lng - first.lng) * 111_320 * Math.cos(((first.lat + second.lat) / 2) * Math.PI / 180);
  return Math.hypot(latDistance, lngDistance);
}

function normalizePoint(value) {
  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function isForbiddenForRouting(feature) {
  const properties = feature?.properties || {};
  const name = String(properties.name || "").trim();
  if (FORBIDDEN_WATERWAY_NAMES.has(name)) return true;
  if (/^(?:no|private)$/i.test(String(properties.boat || properties.motorboat || ""))) return true;
  return false;
}

function isClosedForRouting(feature) {
  const properties = feature?.properties || {};
  return /^(?:yes|true|1|closed|stremming|gestremd)$/i.test(String(properties.closed || properties.closure || properties.stremming || properties.status || ""));
}

function isOneway(feature) {
  return /^(?:yes|1|true)$/i.test(String(feature?.properties?.oneway || ""));
}

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(value) {
    this.items.push(value);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].score <= value.score) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = value;
  }
  pop() {
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        const smallest = right < this.items.length && this.items[right].score < this.items[left].score ? right : left;
        if (this.items[smallest].score >= last.score) break;
        this.items[index] = this.items[smallest];
        index = smallest;
      }
      this.items[index] = last;
    }
    return first;
  }
}
