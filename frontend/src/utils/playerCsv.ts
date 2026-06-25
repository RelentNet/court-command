import type { Player } from '../types/domain'

export interface ParsedPlayerRow {
  display_name: string
  handedness: string
  skill_rating?: number
}

const HEADERS = ['display_name', 'handedness', 'skill_rating'] as const

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Serialize players to a CSV string with a header row. */
export function playersToCsv(players: Array<Player>): string {
  const rows = [HEADERS.join(',')]
  for (const p of players) {
    rows.push(
      [
        escapeCell(p.display_name ?? ''),
        escapeCell(p.handedness ?? 'right'),
        escapeCell(p.skill_rating != null ? String(p.skill_rating) : ''),
      ].join(','),
    )
  }
  return rows.join('\n')
}

/** Split a single CSV line into cells, honoring quotes and escaped quotes. */
function parseLine(line: string): Array<string> {
  const cells: Array<string> = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}

/**
 * Parse a players CSV into validated rows.
 * Accepts columns in any order as long as a header row names them.
 * If the first row has no recognizable header, assumes column order
 * display_name, handedness, skill_rating.
 */
export function parsePlayersCsv(text: string): Array<ParsedPlayerRow> {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0)

  if (lines.length === 0) return []

  const firstCells = parseLine(lines[0]).map((c) => c.trim().toLowerCase())
  const hasHeader = firstCells.some((c) =>
    (HEADERS as ReadonlyArray<string>).includes(c),
  )

  const colIndex = {
    display_name: hasHeader ? firstCells.indexOf('display_name') : 0,
    handedness: hasHeader ? firstCells.indexOf('handedness') : 1,
    skill_rating: hasHeader ? firstCells.indexOf('skill_rating') : 2,
  }

  const dataLines = hasHeader ? lines.slice(1) : lines
  const rows: Array<ParsedPlayerRow> = []

  for (const line of dataLines) {
    const cells = parseLine(line)
    const name =
      colIndex.display_name >= 0
        ? (cells[colIndex.display_name] ?? '').trim()
        : ''
    if (!name) continue

    const handednessRaw =
      colIndex.handedness >= 0
        ? (cells[colIndex.handedness] ?? '').trim().toLowerCase()
        : ''
    const handedness = handednessRaw === 'left' ? 'left' : 'right'

    const ratingRaw =
      colIndex.skill_rating >= 0
        ? (cells[colIndex.skill_rating] ?? '').trim()
        : ''
    const rating = ratingRaw ? Number.parseFloat(ratingRaw) : NaN

    rows.push({
      display_name: name,
      handedness,
      skill_rating: Number.isFinite(rating) ? rating : undefined,
    })
  }

  return rows
}
