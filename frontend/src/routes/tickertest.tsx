import { createFileRoute } from '@tanstack/react-router'
import Ticker from '../components/Ticker'
import type { Match } from '../types/domain'

export const Route = createFileRoute('/tickertest')({
  component: TickerTestPage,
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
} as unknown as Match

function TickerTestPage() {
  return (
    <div className="flex flex-1 items-center bg-[#00b140] min-h-screen">
      <div className="mx-auto w-full max-w-5xl">
        <Ticker match={mockMatch} />
      </div>
    </div>
  )
}
