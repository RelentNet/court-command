export function ControlPanel() {
  return (
    <div className="bg-slate-900 p-4 border border-slate-800 rounded-lg">
      <h3 className="mb-2 text-slate-500 uppercase">Controls</h3>
      <div className="gap-2 grid grid-cols-2">
        {/* Placeholders for future features */}
        <button className="bg-slate-800 hover:bg-slate-700 p-2 rounded text-slate-400 text-sm">
          Timeout (T1)
        </button>
        <button className="bg-slate-800 hover:bg-slate-700 p-2 rounded text-slate-400 text-sm">
          Timeout (T2)
        </button>
        <button className="bg-slate-800 hover:bg-slate-700 p-2 rounded text-slate-400 text-sm">
          Warning
        </button>
        <button className="bg-slate-800 hover:bg-slate-700 p-2 rounded text-slate-400 text-sm">
          Technical
        </button>
      </div>
    </div>
  )
}
