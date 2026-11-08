import { inject, onUnmounted, watch } from 'vue'

export function useMobileMapPanel(key, open) {
  const coordinator = inject('mobilePanelCoordinator', null)
  if (!coordinator) return
  const unregister = coordinator.register(key, () => { open.value = false })
  watch(open, value => value ? coordinator.claim(key) : coordinator.release(key), { flush: 'sync' })
  onUnmounted(unregister)
}
