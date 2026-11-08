export function mobileViewportMetrics({ width, height, visibleHeight = height, offsetTop = 0, offsetLeft = 0, visibleWidth = width, baselineHeight = height, editing = false }) {
  const keyboardOpen = editing && Math.max(height, baselineHeight) - visibleHeight > 120
  return {
    width: visibleWidth, height: visibleHeight, top: offsetTop, left: offsetLeft,
    bottom: Math.max(0, height - visibleHeight - offsetTop), keyboardOpen,
  }
}

export function mobileRoutePadding(map, viewport, { toolbar = null, sheet = null, bottomSpace = 0 } = {}) {
  const gap = 16
  let top = Math.max(gap, viewport.top - map.top + gap)
  let bottom = Math.max(gap, map.bottom - viewport.bottom + bottomSpace + gap)
  const left = Math.max(gap, viewport.left - map.left + gap)
  const right = Math.max(gap, map.right - viewport.right + gap)
  if (toolbar) top = Math.max(top, toolbar.bottom - map.top + gap)
  if (sheet) bottom = Math.max(bottom, map.bottom - sheet.top + gap)
  // Keep Leaflet's drawable rectangle positive, including in landscape mode.
  const available = Math.max(0, map.height - 100)
  if (top + bottom > available) {
    const scale = available / (top + bottom || 1)
    top *= scale; bottom *= scale
  }
  return { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom] }
}

export function createMobilePanelCoordinator(isMobile, changed = () => {}) {
  const panels = new Map()
  let active = null
  return {
    register(key, close) { panels.set(key, close); return () => { panels.delete(key); this.release(key) } },
    claim(key) {
      if (!isMobile()) return
      active = key
      for (const [other, close] of panels) if (other !== key) close()
      changed(key)
    },
    release(key) { if (active === key) { active = null; changed(null) } },
    close() { const previous = active; active = null; if (previous) panels.get(previous)?.(); changed(null) },
  }
}
