const MOVING_SPEED_KNOTS = 0.8;
const STOPPED_SPEED_KNOTS = 0.5;
const LOCATION_RADIUS_METERS = 100;

function distanceMeters(point, location) {
  const radians = Math.PI / 180;
  const lat1 = Number(point.latitude) * radians;
  const lat2 = Number(location.latitude) * radians;
  const deltaLat = (Number(location.latitude) - Number(point.latitude)) * radians;
  const deltaLon = (Number(location.longitude) - Number(point.longitude)) * radians;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function interpolatedCrossing(previous, current, radius) {
  if (!previous || Number(current.receivedAt) - Number(previous.receivedAt) > 5 * 60_000) return Number(current.receivedAt);
  const span = current.distance - previous.distance;
  if (!Number.isFinite(span) || Math.abs(span) < 0.1) return Number(current.receivedAt);
  const fraction = Math.max(0, Math.min(1, (radius - previous.distance) / span));
  return Math.round(Number(previous.receivedAt) + fraction * (Number(current.receivedAt) - Number(previous.receivedAt)));
}

function deriveGeofenceTimes(points, scheduledStart, locationPin) {
  const radius = Number(locationPin.radiusMeters) || LOCATION_RADIUS_METERS;
  const insideRadius = radius * 0.75;
  const outsideRadius = radius * 1.25;
  let seenInside = false;
  let actualStart = null;
  let actualEnd = null;
  let previous = null;
  for (const point of points) {
    if (!Number.isFinite(Number(point.latitude)) || !Number.isFinite(Number(point.longitude))) continue;
    const timestamp = Number(point.receivedAt);
    if (timestamp < scheduledStart - 15 * 60_000) continue;
    const current = { ...point, distance: distanceMeters(point, locationPin) };
    if (current.distance <= insideRadius && actualStart == null) seenInside = true;
    if (actualStart == null && seenInside && current.distance >= outsideRadius && timestamp >= scheduledStart - 5 * 60_000) {
      actualStart = interpolatedCrossing(previous, current, radius);
    }
    if (actualStart != null && current.distance <= insideRadius && timestamp >= actualStart + 15 * 60_000) {
      actualEnd = interpolatedCrossing(previous, current, radius);
      break;
    }
    previous = current;
  }
  return { actualStart, actualEnd };
}

export function deriveTourPerformance({ scheduledStart, scheduledEnd, points = [], now = Date.now(), locationPin = null }) {
  const validPoints = points
    .filter((point) => Number.isFinite(Number(point.receivedAt)))
    .sort((left, right) => Number(left.receivedAt) - Number(right.receivedAt));
  let actualStart;
  let actualEnd;
  let trackingMethod;
  if (locationPin) {
    ({ actualStart, actualEnd } = deriveGeofenceTimes(validPoints, scheduledStart, locationPin));
    trackingMethod = "location-pin";
  } else {
    const moving = validPoints.find((point) => Number(point.receivedAt) >= scheduledStart - 5 * 60_000 && Number(point.speed) >= MOVING_SPEED_KNOTS);
    actualStart = moving ? Number(moving.receivedAt) : null;
    actualEnd = actualStart == null ? null : validPoints.find((point) =>
      Number(point.receivedAt) > actualStart
      && Number(point.receivedAt) >= scheduledEnd - 15 * 60_000
      && Number(point.speed) <= STOPPED_SPEED_KNOTS)?.receivedAt ?? null;
    trackingMethod = "speed-fallback";
  }
  const delayMinutes = actualStart == null ? null : Math.round((actualStart - scheduledStart) / 60_000);
  const returnDelayMinutes = actualEnd == null ? null : Math.round((Number(actualEnd) - scheduledEnd) / 60_000);
  const roundDurationMinutes = actualStart == null || actualEnd == null ? null : Math.round((Number(actualEnd) - actualStart) / 60_000);

  let status;
  if (actualStart != null && actualEnd != null) status = returnDelayMinutes > 5 ? "completed-late" : returnDelayMinutes < -5 ? "completed-early" : "completed-on-time";
  else if (actualStart != null) status = delayMinutes > 5 ? "active-late" : "active-on-time";
  else if (now < scheduledStart - 5 * 60_000) status = "scheduled";
  else if (now > scheduledEnd + 30 * 60_000) status = "no-ais";
  else status = "waiting-ais";

  return {
    status,
    actualStart,
    actualEnd: actualEnd == null ? null : Number(actualEnd),
    delayMinutes,
    returnDelayMinutes,
    roundDurationMinutes,
    trackingMethod,
    pointCount: validPoints.length,
    routeFrom: (actualStart ?? scheduledStart) - 5 * 60_000,
    routeTo: (actualEnd == null ? scheduledEnd + 15 * 60_000 : Number(actualEnd) + 5 * 60_000),
  };
}
