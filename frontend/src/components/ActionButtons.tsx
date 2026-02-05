import { Trash2 } from 'lucide-react'

interface ActionButtonsProps {
  onReset: () => void
  onDelete: () => void
  onEndGame: () => void
  onEndMatch: () => void
}

export function ActionButtons({
  onReset,
  onDelete,
  onEndGame,
  onEndMatch,
}: ActionButtonsProps) {
  return (
    <>
      <button
        onClick={onEndGame}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-bold"
      >
        End Game
      </button>
      <button
        onClick={() => {
          if (confirm('Are you sure you want to END the match?')) {
            onEndMatch()
          }
        }}
        className="flex items-center gap-2 bg-green-700 hover:bg-green-600 px-4 py-2 rounded-lg font-bold"
      >
        End Match
      </button>
      <button
        onClick={onReset}
        className="flex items-center gap-2 bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg font-bold"
      >
        Reset Match
      </button>
      <button
        onClick={() => {
          if (
            confirm(
              'Are you sure you want to DELETE this match completely? This cannot be undone and will return you to the court dashboard.',
            )
          ) {
            onDelete()
          }
        }}
        className="flex items-center gap-2 bg-red-900/50 hover:bg-red-800 px-3 py-2 border border-red-800/50 rounded-lg text-red-200 hover:text-white transition-all"
        title="Delete Match"
      >
        <Trash2 className="w-5 h-5" />
      </button>
    </>
  )
}
