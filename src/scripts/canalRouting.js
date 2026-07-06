const GRID_SIZE = 0.002;
const MAX_SNAP_DISTANCE_METERS = 50;
const MAX_ENDPOINT_GAP_METERS = 45;
const MAX_REPORT_GAP_MS = 15 * 60 * 1000;
const MAX_REPORT_DISTANCE_METERS = 2_000;
const MAX_IMPLIED_SPEED_KNOTS = 30;

export function buildCanalRoutingNetwork(geoJson) {
  const nodes = new Map();
  const grid = new Map();
  const endpointKeys = new Set();

  for (const feature of geoJson?.features || []) {
    for (const line of getLines(feature)) {
      let previous = null;
      let first = null;
      for (const coordinate of line) {
        if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
        const node = getOrCreateNode(nodes, grid, coordinate[1], coordinate[0]);
        if (!first) first = node;
        if (previous && previous !== node) {
          const distance = distanceMeters(previous, node);
          previous.neighbors.set(node.key, distance);
          node.neighbors.set(previous.key, distance);
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
    const route = findShortestPath(network, previous.snapped.node, current.snapped.node, maximumRouteDistance);
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

function pathDistance(route) {
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

    endpoint.neighbors.set(nearest.key, nearestDistance);
    nearest.neighbors.set(endpoint.key, nearestDistance);
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

function findNearestNode(network, lat, lng) {
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

  return bestNode && bestDistance <= MAX_SNAP_DISTANCE_METERS ? { node: bestNode, distance: bestDistance } : null;
}

function findShortestPath(network, start, goal, maximumDistance) {
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

    for (const [neighborKey, edgeDistance] of current.neighbors) {
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

function buildPath(network, previous, goalKey) {
  const path = [network.nodes.get(goalKey)];
  let key = goalKey;
  while (previous.has(key)) {
    key = previous.get(key);
    path.push(network.nodes.get(key));
  }
  return path.reverse();
}

function getBucketKey(lat, lng) {
  return `${Math.floor(lat / GRID_SIZE)}:${Math.floor(lng / GRID_SIZE)}`;
}

function distanceMeters(first, second) {
  const latDistance = (second.lat - first.lat) * 111_320;
  const lngDistance = (second.lng - first.lng) * 111_320 * Math.cos(((first.lat + second.lat) / 2) * Math.PI / 180);
  return Math.hypot(latDistance, lngDistance);
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
