interface DebugConsoleProps {
  data: unknown
}

export function DebugConsole({ data }: DebugConsoleProps) {
  return (
    <div className="bg-slate-900 p-4 border border-slate-800 rounded-lg h-64 overflow-auto font-mono text-xs">
      <h3 className="mb-2 text-slate-500 uppercase">Raw State</h3>
      <pre className="text-lime-300">{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}
