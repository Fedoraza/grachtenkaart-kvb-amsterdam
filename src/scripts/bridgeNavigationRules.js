// The waterway is a signed dead end for regular navigation. Very small boats
// may physically fit, but the planner must never suggest passing this bridge.
export function bridgeNavigationWarning(properties = {}) {
  return properties.number === 'BRU0114'
    ? 'Geen doorgaande vaarroute: borden geven een doodlopende doorgang aan. Alleen zeer kleine bootjes kunnen mogelijk fysiek passeren.'
    : null
}
