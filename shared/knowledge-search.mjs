export const knowledgeSearchText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('nl').trim()
export function matchesKnowledge(text, query) {
  const haystack = knowledgeSearchText(text)
  return knowledgeSearchText(query).split(/\s+/).filter(Boolean).every(word => haystack.includes(word))
}
