export function interpolateCoordinate(start, target, progress) {
  const bounded = Math.max(0, Math.min(1, Number(progress) || 0));
  return [
    start[0] + (target[0] - start[0]) * bounded,
    start[1] + (target[1] - start[1]) * bounded,
  ];
}

export function reconnectDelay(attempt) {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, Number(attempt) || 0));
}
