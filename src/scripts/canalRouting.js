import { waterwayProfileForFeature } from './waterwayProfiles.js';
import { withSupplementalWaterways } from "./supplementalWaterways.js";

const GRID_SIZE = 0.002;
const MAX_SNAP_DISTANCE_METERS = 50;
const MAX_ENDPOINT_GAP_METERS = 45;
const MAX_REPORT_GAP_MS = 15 * 60 * 1000;
const MAX_REPORT_DISTANCE_METERS = 2_000;
const MAX_IMPLIED_SPEED_KMH = 55.56;
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
    for (const sourceLine of getLines(feature)) {
      const line = respectRestrictions && String(feature.properties?.oneway) === "-1" ? [...sourceLine].reverse() : sourceLine;
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
  const speedKmh = Number(options.speedKmh || 6);
  const baseDurationMinutes = speedKmh > 0 ? Math.max(1, Math.round(pathDurationMinutes(route, network, speedKmh))) : null;
  const durationMinutes = baseDurationMinutes;
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
    speedKmh,
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
  const speedKmh = Number(options.speedKmh || 6);
  const requestedDistance = Math.max(350, speedKmh * 1000 * (targetMinutes / 60));
  const random = seededRandom(options.seed ?? Math.floor(Math.random() * 1_000_000_000));
  const attempts = Math.max(20, Number(options.attempts || 120));
  let best = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const loopOptions = { ...options, avoidVirtualEdges: true };
    const outbound = randomWalkOutbound(snapped.node, network, requestedDistance * (0.45 + random() * 0.35), random, loopOptions);
    const far = outbound.at(-1);
    if (!far || outbound.length < 3) continue;
    const routeCandidates = [];
    // Preserve genuine cycles completed during the exploratory leg. Without
    // this, the walk may pass its start and continue until its eventual return
    // path turns the result into an unnecessary out-and-back route.
    outbound.forEach((node, index) => {
      if (index >= 3 && node.key === snapped.node.key) routeCandidates.push(outbound.slice(0, index + 1));
    });
    if (far.key !== snapped.node.key) {
      const returnPath = findShortestPath(network, far, snapped.node, requestedDistance * 0.9 + 600, loopOptions);
      if (returnPath?.length >= 2) routeCandidates.push([...outbound, ...returnPath.slice(1)]);
    }
    for (const route of routeCandidates) {
    if (routeUsesVirtualEdge(route, network)) continue;
    const distance = pathDistance(route);
    const retrace = routeRetraceMetrics(route, network);
    // A generated "loop" should not simply sail down the same canal and turn
    // around. A short shared approach to a real loop is acceptable, but reject
    // candidates where a substantial part of the journey repeats an edge.
    if (retrace.ratio > 0.42) continue;
    const baseDurationMinutes = Math.max(1, Math.round(pathDurationMinutes(route, network, speedKmh)));
    if (baseDurationMinutes > targetMinutes) continue;
    const score = targetMinutes - baseDurationMinutes + repeatedNodePenalty(route) + retrace.ratio * targetMinutes * 1.5;
    if (!best || score < best.score) best = { route, distance, baseDurationMinutes, retrace, score };
    }
  }

  if (!best) return { status: "no-loop", message: `Geen rondje gevonden dat binnen ${targetMinutes} minuten terug is bij het startpunt.` };

  const durationMinutes = best.baseDurationMinutes;
  return {
    status: "ok",
    routeType: "loop",
    message: `Rondje gevonden binnen ${targetMinutes} minuten.`,
    coordinates: best.route.map((node) => [node.lat, node.lng]),
    distanceMeters: Math.round(best.distance),
    baseDurationMinutes: best.baseDurationMinutes,
    durationMinutes,
    targetDurationMinutes: targetMinutes,
    speedKmh,
    steps: routeSteps(best.route, network),
    segments: routeSegments(best.route, network),
    snapped: [{ latitude: snapped.node.lat, longitude: snapped.node.lng, snapDistanceMeters: Math.round(snapped.distance) }],
    from: { latitude: snapped.node.lat, longitude: snapped.node.lng, snapDistanceMeters: Math.round(snapped.distance) },
    to: { latitude: snapped.node.lat, longitude: snapped.node.lng, snapDistanceMeters: Math.round(snapped.distance) },
    virtualSegmentCount: best.route.slice(1).filter((node, index) => network.virtualEdges.has(getEdgeKey(best.route[index].key, node.key))).length,
    warnings: routeConstraintWarnings(best.route, network, options.boatProfile),
    retracedDistanceMeters: Math.round(best.retrace.distanceMeters),
    retracedRoutePercent: Math.round(best.retrace.ratio * 100),
  };
}

function randomWalkOutbound(start, network, targetDistance, random, options = {}) {
  const route = [start];
  let distance = 0;
  let previousKey = null;
  const visits = new Map([[start.key, 1]]);
  while (distance < targetDistance && route.length < 240) {
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
  // A few revisits are unavoidable in a canal network. Duration should remain
  // the main ranking criterion, particularly for two-hour routes.
  return repeats * 0.15;
}

function routeRetraceMetrics(route, network) {
  const traversals = new Map();
  let totalDistance = 0;
  for (let index = 1; index < route.length; index += 1) {
    const from = route[index - 1];
    const to = route[index];
    const edge = from.neighbors.get(to.key) || to.neighbors.get(from.key);
    const distance = edge ? edgeMeters(edge) : distanceMeters(from, to);
    const key = getEdgeKey(from.key, to.key);
    const previous = traversals.get(key) || { count: 0, distance };
    previous.count += 1;
    traversals.set(key, previous);
    totalDistance += distance;
  }
  const distanceMeters = [...traversals.values()]
    .reduce((sum, traversal) => sum + Math.max(0, traversal.count - 1) * traversal.distance, 0);
  return { distanceMeters, ratio: totalDistance > 0 ? distanceMeters / totalDistance : 0 };
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
  const speedKmh = (distance / (elapsed / 1000)) * 3.6;
  return speedKmh <= MAX_IMPLIED_SPEED_KMH;
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
  const incidentLimits = new Map([...nodes.keys()].map((key) => [key, {}]));
  for (const node of nodes.values()) for (const [neighborKey, edge] of node.neighbors) {
    for (const key of [node.key, neighborKey]) for (const field of ['clearanceWidth', 'maxLength', 'maxDraft']) {
      if (Number.isFinite(edge[field]) && edge[field] > 0) incidentLimits.get(key)[field] = Math.min(incidentLimits.get(key)[field] ?? Infinity, edge[field]);
    }
  }
  const virtualEdges = new Set();
  // Gap repairs must never add a reverse lane to a real one-way waterway.
  const physicalNeighbors = new Map([...nodes.keys()].map(key => [key, new Set()]));
  for (const node of nodes.values()) for (const key of node.neighbors.keys()) {
    physicalNeighbors.get(node.key).add(key);
    physicalNeighbors.get(key).add(node.key);
  }
  function alreadyJoinedNearby(start, target) {
    const queue = [{ key: start.key, distance: 0 }];
    const best = new Map([[start.key, 0]]);
    while (queue.length) {
      const current = queue.pop();
      if (current.key === target.key) return true;
      for (const key of physicalNeighbors.get(current.key)) {
        const distance = current.distance + distanceMeters(nodes.get(current.key), nodes.get(key));
        if (distance > MAX_ENDPOINT_GAP_METERS || distance >= (best.get(key) ?? Infinity)) continue;
        best.set(key, distance);
        queue.push({ key, distance });
      }
    }
    return false;
  }

  for (const endpoint of endpoints) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const candidate of endpoints) {
      if (candidate === endpoint || endpoint.neighbors.has(candidate.key)) continue;
      const distance = distanceMeters(endpoint, candidate);
      const sameComponent = componentByNode.get(candidate.key) === componentByNode.get(endpoint.key);
      const allowedDistance = sameComponent ? 30 : MAX_ENDPOINT_GAP_METERS;
      if (distance < nearestDistance && distance <= allowedDistance && !alreadyJoinedNearby(endpoint, candidate)) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    if (!nearest) continue;

    const limits = {};
    for (const field of ['clearanceWidth', 'maxLength', 'maxDraft']) {
      const limit = Math.min(incidentLimits.get(endpoint.key)[field] ?? Infinity, incidentLimits.get(nearest.key)[field] ?? Infinity);
      if (Number.isFinite(limit)) limits[field] = limit;
    }
    endpoint.neighbors.set(nearest.key, { distance: nearestDistance, name: "kaartverbinding", virtual: true, ...limits });
    nearest.neighbors.set(endpoint.key, { distance: nearestDistance, name: "kaartverbinding", virtual: true, ...limits });
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
  if (!Number.isFinite(maxDistanceMeters)) {
    let bestNode = null;
    let bestDistance = Infinity;
    for (const node of network?.nodes?.values?.() || []) {
      const distance = distanceMeters({ lat, lng }, node);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestNode = node;
      }
    }
    return bestNode ? { node: bestNode, distance: bestDistance } : null;
  }
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
      const edgeDistance = edgeRoutingCost(edge);
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
      const nextDistance = currentDistance + edgeRoutingCost(edge);
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
  const profile = waterwayProfileForFeature(feature);
  const minimum = (...values) => { const known = values.filter((v) => Number.isFinite(v) && v > 0); return known.length ? Math.min(...known) : null; };
  return {
    distance,
    name: properties.name || properties.alt_name || properties.old_name || properties["@id"] || "Naamloos water",
    maxspeed: Number.parseFloat(properties.maxspeed) || null,
    clearanceHeight: parseMeters(properties["seamark:bridge:clearance_height"] ?? properties.maxheight ?? properties.clearance_height),
    clearanceWidth: minimum(parseMeters(properties["seamark:bridge:clearance_width"]), parseMeters(properties.maxwidth), parseMeters(properties.clearance_width), profile?.maxWidth),
    maxLength: minimum(parseMeters(properties.maxlength), profile?.maxLength),
    navigationProfile: profile?.code || null,
    maxDraft: parseMeters(properties.maxdraft ?? properties["seamark:waterway:maxdraft"]),
    zone: properties.navigationZone || properties.zone || null,
    closed: isClosedForRouting(feature),
    oneway: isOneway(feature),
    routeCostMultiplier: Math.max(0.1, Number.parseFloat(properties.routeCostMultiplier) || 1),
  };
}

function parseMeters(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function isEdgePassable(edge, boatProfile = {}) {
  if (!edge || typeof edge !== "object") return true;
  boatProfile ||= {};
  const height = Number(boatProfile.heightMeters);
  const width = Number(boatProfile.widthMeters);
  const length = Number(boatProfile.lengthMeters);
  const draft = Number(boatProfile.draftMeters);
  const safetyMargin = Number.isFinite(Number(boatProfile.safetyMarginMeters)) ? Number(boatProfile.safetyMarginMeters) : 0.15;
  if (Number.isFinite(height) && edge.clearanceHeight !== null && edge.clearanceHeight !== undefined && height + safetyMargin > edge.clearanceHeight) return false;
  if (Number.isFinite(width) && edge.clearanceWidth !== null && edge.clearanceWidth !== undefined && width > edge.clearanceWidth) return false;
  if (Number.isFinite(length) && edge.maxLength != null && length > edge.maxLength) return false;
  if (Number.isFinite(draft) && edge.maxDraft !== null && edge.maxDraft !== undefined && draft > edge.maxDraft) return false;
  return true;
}

function isEdgeAllowed(fromKey, toKey, edge, network, options = {}) {
  if (options.avoidVirtualEdges && (edge?.virtual || network?.virtualEdges?.has(getEdgeKey(fromKey, toKey)))) return false;
  if (edge?.closed) return false;
  if (edge?.zone === "zone3" && !options.allowZone3) return false;
  if (edgeIsClosedByPoint(network.nodes.get(fromKey), network.nodes.get(toKey), options.closurePoints, edge?.name)) return false;
  return true;
}

function edgeMeters(edge) {
  return typeof edge === "number" ? edge : Number(edge?.distance) || 0;
}

function edgeRoutingCost(edge) {
  return edgeMeters(edge) * (typeof edge === "object" ? Number(edge?.routeCostMultiplier) || 1 : 1);
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

function edgeIsClosedByPoint(start, end, closurePoints = [], edgeName = "") {
  if (!start || !end || !Array.isArray(closurePoints) || !closurePoints.length) return false;
  return closurePoints.some((closure) => {
    const normalize = value => String(value || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]/g, "");
    if (closure.waterway && edgeName && normalize(closure.waterway) !== normalize(edgeName)) return false;
    const point = normalizePoint(closure);
    if (!point) return false;
    const radius = Math.max(15, Number(closure.radiusMeters || 90));
    return distanceToSegmentMeters(point, start, end) <= radius;
  });
}

function pathDurationMinutes(route, network, requestedSpeedKmh) {
  let totalMinutes = 0;
  for (let index = 1; index < route.length; index += 1) {
    const edge = network.nodes.get(route[index - 1].key)?.neighbors.get(route[index].key);
    const edgeDistanceKm = distanceMeters(route[index - 1], route[index]) / 1000;
    const limitKmh = Number(edge?.maxspeed);
    const speedKmh = Math.max(1, Number.isFinite(limitKmh) && limitKmh > 0 ? Math.min(requestedSpeedKmh, limitKmh) : requestedSpeedKmh);
    totalMinutes += (edgeDistanceKm / speedKmh) * 60;
  }
  return totalMinutes;
}

function routeConstraintWarnings(route, network, boatProfile = {}) {
  const warnings = [];
  if (routeUsesZone(route, network, "zone3")) warnings.push("Zone 3 / IJ: alleen varen als schipper en boot hiervoor bevoegd zijn");
  if (!boatProfile || (!Number(boatProfile.heightMeters) && !Number(boatProfile.widthMeters) && !Number(boatProfile.draftMeters) && !Number(boatProfile.lengthMeters))) return warnings;
  const constrained = new Map();
  const unknownProfiles = new Set();
  for (let index = 1; index < route.length; index += 1) {
    const edge = network.nodes.get(route[index - 1].key)?.neighbors.get(route[index].key);
    if (!edge || typeof edge !== "object") continue;
    const parts = [];
    if (!edge.navigationProfile && !edge.virtual && (Number(boatProfile.widthMeters) || Number(boatProfile.lengthMeters))) unknownProfiles.add(edge.name);
    if (edge.navigationProfile) parts.push(`vaarprofiel ${edge.navigationProfile}`);
    if (edge.maxLength != null) parts.push(`lengte ${edge.maxLength} m`);
    if (edge.clearanceHeight !== null && edge.clearanceHeight !== undefined) parts.push(`hoogte ${edge.clearanceHeight} m`);
    if (edge.clearanceWidth !== null && edge.clearanceWidth !== undefined) parts.push(`breedte ${edge.clearanceWidth} m`);
    if (edge.maxDraft !== null && edge.maxDraft !== undefined) parts.push(`diepgang ${edge.maxDraft} m`);
    if (parts.length) constrained.set(edge.name, parts.join(", "));
  }
  if (unknownProfiles.size) warnings.push(`Vaarprofiel onbekend voor: ${[...unknownProfiles].slice(0, 4).join(", ")}${unknownProfiles.size > 4 ? ", …" : ""}. Lengte en breedte zijn daar alleen op beschikbare lokale beperkingen gecontroleerd.`);
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
  return /^(?:yes|1|true|-1)$/i.test(String(feature?.properties?.oneway || ""));
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
