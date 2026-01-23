import { X } from 'lucide-react'
import { PlayerEditor } from './PlayerEditor'

interface CreatePlayerModalProps {
  onClose: () => void
}

export function CreatePlayerModal({ onClose }: CreatePlayerModalProps) {

  return (

    <div className="z-[60] fixed inset-0 flex justify-center items-center bg-black/60 p-4 backdrop-blur-sm">

      <div className="bg-slate-800 border border-slate-700 shadow-2xl rounded-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        <div className="flex justify-between items-center bg-slate-900 p-4 border-b border-slate-700">

          <h3 className="font-bold text-white text-lg">Create New Player</h3>

          <button onClick={onClose} className="text-slate-400 hover:text-white">

            <X className="w-5 h-5" />

          </button>

        </div>



        <div className="p-6">

          <PlayerEditor onSuccess={onClose} onCancel={onClose} />

        </div>

      </div>

    </div>

  )

}
