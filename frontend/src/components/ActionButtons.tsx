import { Trash2, Undo } from 'lucide-react'

interface ActionButtonsProps {
  onUndo: () => void
  onReset: () => void
  onDelete: () => void
}

export function ActionButtons({
  onUndo,
  onReset,
  onDelete,
}: ActionButtonsProps) {
  return (
    <>
      <button
        onClick={onUndo}
        className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded-lg font-bold"
      >
        <Undo className="w-4 h-4" /> Undo
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
