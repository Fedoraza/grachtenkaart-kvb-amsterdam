import { startUsageAnalytics } from './scripts/usageAnalytics.js'
import { matchesKnowledge } from '../shared/knowledge-search.mjs'
import { registerServiceWorker } from './scripts/serviceWorker.js'

registerServiceWorker()

let tracker = startUsageAnalytics(document.body.dataset.usagePage)
window.addEventListener('pagehide', () => tracker.stop())
window.addEventListener('pageshow', (event) => { if (event.persisted) tracker = startUsageAnalytics(document.body.dataset.usagePage) })
const input = document.querySelector('[data-boat-search]')
if (input) {
  document.querySelector('[data-search-label]').hidden = false
  const cards = [...document.querySelectorAll('[data-boat-name]')]
  input.addEventListener('input', () => {
    const query = input.value.trim().toLocaleLowerCase('nl')
    let count = 0
    for (const card of cards) {
      card.hidden = !card.dataset.boatName.includes(query)
      if (!card.hidden) count++
    }
    document.querySelector('[data-result-count]').textContent = `${count} ${count === 1 ? 'boot gevonden' : 'boten gevonden'}`
    document.querySelector('[data-no-results]').hidden = count !== 0
  })
}

const knowledge = document.querySelector('[data-knowledge-index]')
if (knowledge) {
  const form = knowledge.querySelector('[data-knowledge-form]')
  const query = knowledge.querySelector('[data-knowledge-query]')
  const category = knowledge.querySelector('[data-knowledge-category]')
  const cards = [...knowledge.querySelectorAll('[data-knowledge-card]')]
  function updateKnowledge() {
    let count = 0
    for (const card of cards) {
      card.hidden = !matchesKnowledge(card.dataset.knowledgeSearch, query.value) || Boolean(category.value && card.dataset.category !== category.value)
      if (!card.hidden) count++
    }
    knowledge.querySelector('[data-knowledge-count]').textContent = `${count} ${count === 1 ? 'artikel' : 'artikelen'} gevonden`
    knowledge.querySelector('[data-knowledge-empty]').hidden = count !== 0
    const url = new URL(location.href)
    query.value.trim() ? url.searchParams.set('q', query.value.trim()) : url.searchParams.delete('q')
    category.value ? url.searchParams.set('categorie', category.value) : url.searchParams.delete('categorie')
    history.replaceState(null, '', url)
  }
  form.addEventListener('submit', event => { event.preventDefault(); updateKnowledge() })
  query.addEventListener('input', updateKnowledge)
  category.addEventListener('change', updateKnowledge)
}
