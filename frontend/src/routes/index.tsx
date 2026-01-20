import { createFileRoute } from '@tanstack/react-router'
import {
  useQuery,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'

// Initialize QueryClient (usually done in main.tsx, but fine here for now)
const queryClient = new QueryClient()

export const Route = createFileRoute('/')({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  ),
})

function App() {
  // Real fetch from your Python Backend
  const { data, isLoading, error } = useQuery({
    queryKey: ['courtInfo'],
    queryFn: async () => {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const res = await fetch(`${apiUrl}/api/court-info`)
      if (!res.ok) throw new Error('Network response was not ok')
      return res.json()
    },
  })

  // Show loading state while fetching
  if (isLoading)
    return (
      <div className="text-white text-center mt-20">
        Connecting to Engine...
      </div>
    )
  if (error)
    return (
      <div className="text-red-500 text-center mt-20">
        Error: {error.message}
      </div>
    )

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
            {/* Displaying Real Data from Python Backend */}
            <p className="text-xl font-mono text-lime-400">
              {data.detected_host}
            </p>
          </div>

          <div className="p-2 bg-slate-800 rounded border border-slate-600">
            <p className="text-xs text-slate-400">
              Storage Mode: {data.storage_mode}
            </p>
          </div>

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
