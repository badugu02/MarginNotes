import { db } from './db.js'

export type Citation = {
  documentId: string
  documentName: string
  page: number
  excerpt: string
}

const stopWords = new Set([
  'what', 'when', 'where', 'which', 'who', 'why', 'how', 'does', 'do', 'is', 'are', 'was', 'were', 'the', 'a', 'an', 'of', 'in', 'on', 'to', 'for', 'from', 'and', 'or', 'with', 'about', 'tell', 'me', 'please', 'can', 'i', 'నా', 'ఏమిటి', 'ఏంటి', 'ఎప్పుడు', 'ఎక్కడ', 'ఎలా', 'గురించి',
])

function terms(value: string): string[] {
  return [...new Set((value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((term) => !stopWords.has(term)))]
}

function excerptFor(text: string, queryTerms: string[]): string {
  const sentences = text.split(/(?<=[.!?।])\s+|\n+/).map((part) => part.trim()).filter(Boolean)
  const ranked = sentences.map((sentence) => ({
    sentence,
    hits: queryTerms.filter((term) => terms(sentence).includes(term)).length,
  })).sort((left, right) => right.hits - left.hits)
  const excerpt = ranked[0]?.sentence || text.trim()
  return excerpt.length > 680 ? `${excerpt.slice(0, 677).trimEnd()}...` : excerpt
}

export function retrieve(question: string, branch: string, semester: number): Citation[] {
  const queryTerms = terms(question)
  if (queryTerms.length === 0) return []

  const rows = db.prepare(`
    SELECT p.document_id AS documentId, p.page_number AS page, p.text, d.name AS documentName
    FROM pages p JOIN documents d ON d.id = p.document_id
    WHERE d.branch = ? AND d.semester = ? AND d.status = 'ready'
  `).all(branch, semester) as Array<{ documentId: string; page: number; text: string; documentName: string }>

  const ranked = rows.map((row) => {
    const pageTerms = terms(row.text)
    const pageSet = new Set(pageTerms)
    const hits = queryTerms.filter((term) => pageSet.has(term)).length
    const coverage = hits / queryTerms.length
    const density = hits / Math.max(Math.sqrt(pageTerms.length), 1)
    return { row, hits, coverage, score: coverage * 0.75 + density * 0.25 }
  }).filter(({ hits, coverage }) => hits > 0 && coverage >= 0.2)
    .sort((left, right) => right.score - left.score)

  const citations: Citation[] = []
  const seen = new Set<string>()
  for (const match of ranked) {
    const key = `${match.row.documentId}:${match.row.page}`
    if (seen.has(key)) continue
    seen.add(key)
    citations.push({
      documentId: match.row.documentId,
      documentName: match.row.documentName,
      page: match.row.page,
      excerpt: excerptFor(match.row.text, queryTerms),
    })
    if (citations.length === 3) break
  }
  return citations
}
