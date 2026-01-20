import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/' as any)({
  component: App,
})

function App() {
  const [domain, setDomain] = useState<string>('Detecting...')

  useEffect(() => {
    setDomain(window.location.host)
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-xl shadow-2xl p-8 border border-slate-700 text-center">
        <h1 className="text-3xl font-bold bg-linear-to-r from-lime-400 to-emerald-500 bg-clip-text text-transparent mb-4">
          Pickleball Ticker
        </h1>

        <div className="space-y-4">
          <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
            <p className="text-slate-400 text-sm uppercase tracking-wider mb-1">
              Active Court Domain
            </p>
            <p className="text-xl font-mono text-lime-400">{domain}</p>
          </div>

          <p className="text-slate-400 text-sm italic">
            Deployment successful. This instance is now isolated for this client
            project.
          </p>

          <button className="w-full py-3 bg-lime-500 hover:bg-lime-400 text-slate-900 font-bold rounded-lg transition-colors">
            Enter Referee Mode
          </button>
        </div>
      </div>

      <footer className="mt-8 text-slate-500 text-xs">
        Powered by RelentNet Infrastructure
      </footer>
    </div>
  )
}

export default App
