import { createFileRoute } from '@tanstack/react-router'
import Ticker from '../components/Ticker'
import { DEFAULT_THEME, PRESETS, hsl } from '../utils/theme'
import type { Match } from '../types/domain'

interface TickerTestSearch {
  theme?: string
}

export const Route = createFileRoute('/tickertest')({
  component: TickerTestPage,
  validateSearch: (search: Record<string, unknown>): TickerTestSearch => ({
    theme: typeof search.theme === 'string' ? search.theme : undefined,
  }),
})

const mockMatch = {
  id: 1,
  public_id: 'mock-match',
  status: 'in_progress',
  participants: {
    team_1: {
      name: 'Titan Racquets',
      player_1: { display_name: "Sarah 'The Wall' Jenkins" },
      player_2: { display_name: 'Marcus Vane' },
    },
    team_2: {
      name: 'Silver Smashers',
      player_1: { display_name: 'Elena Rodriguez' },
      player_2: { display_name: 'David Chen' },
    },
  },
  team_1_score: 2,
  team_2_score: 1,
  current_game_num: 1,
  team_1_name: 'Titan Racquets',
  team_2_name: 'Silver Smashers',
  config: { format: 'best_of_3', show_team_logos: true },
  completed_games: [],
} as unknown as Match

function TickerTestPage() {
  const { theme: themeId } = Route.useSearch()
  const preset = PRESETS.find((p) => p.id === themeId)
  const theme = preset?.theme ?? DEFAULT_THEME

  // In transparent mode keep the chroma green so designers can still see
  // against a broadcast key color.
  const bg =
    theme.backgroundMode === 'transparent'
      ? '#00b140'
      : hsl(theme.colors.pageBackground)

  return (
    <div
      className="flex flex-1 items-center min-h-screen"
      style={{ backgroundColor: bg }}
    >
      <div className="mx-auto w-full max-w-5xl">
        <Ticker match={mockMatch} theme={theme} />
      </div>
    </div>
  )
}
