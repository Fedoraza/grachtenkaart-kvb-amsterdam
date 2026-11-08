export const POSITION_MESSAGE_TYPES = new Set([
  "PositionReport",
  "StandardClassBPositionReport",
  "ExtendedClassBPositionReport",
]);

export function validAisCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    && !(latitude === 0 && longitude === 0);
}

export function sourceLatencyMs(sourceReceivedAt, gatewayReceivedAt = Date.now()) {
  const source = Date.parse(sourceReceivedAt);
  return Number.isFinite(source) ? Math.max(0, gatewayReceivedAt - source) : null;
}

export function shouldAcceptPosition(previous, incoming) {
  if (!validAisCoordinates(incoming.latitude, incoming.longitude)) return false;
  const previousAt = Date.parse(previous?.sourceReceivedAt || previous?.receivedAt || "");
  const incomingAt = Date.parse(incoming.sourceReceivedAt || incoming.receivedAt || "");
  if (Number.isFinite(previousAt) && Number.isFinite(incomingAt) && incomingAt <= previousAt) return false;
  return true;
}

export { mergeAisState } from '../shared/ais-state.mjs';

export function staleAfterMs(vessel, movingMs, stationaryMs) {
  return Number(vessel?.speed) > 0.5 ? movingMs : stationaryMs;
}

export function feedState({ configured, open, messageAgeMs, positionAgeMs = messageAgeMs, watchdogMs }) {
  if (!configured) return { status: "offline", reason: "AISStream API key is not configured" };
  if (!open) return { status: "reconnecting", reason: "AISStream connection is not open" };
  if (positionAgeMs > watchdogMs / 2) return { status: "degraded", reason: "AISStream is connected but no recent vessel positions are arriving" };
  if (messageAgeMs > watchdogMs / 2) return { status: "degraded", reason: "AISStream is connected but data is delayed" };
  return { status: "live", reason: "AISStream is delivering messages" };
}
