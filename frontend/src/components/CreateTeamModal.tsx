import { X } from 'lucide-react'
import { TeamEditor } from './TeamEditor'
import type { Player } from '../types/domain'

interface CreateTeamModalProps {
  players: Array<Player>
  onClose: () => void
}

export function CreateTeamModal({ players, onClose }: CreateTeamModalProps) {
  return (
    <div className="z-50 fixed inset-0 flex justify-center items-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 shadow-2xl rounded-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center bg-slate-900 p-4 border-b border-slate-700">
          <h3 className="font-bold text-white text-lg">Create New Team</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <TeamEditor
            players={players}
            onSuccess={onClose}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}
