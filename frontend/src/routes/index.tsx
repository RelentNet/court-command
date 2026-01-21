import { Link, createFileRoute } from '@tanstack/react-router'
import { History, LayoutGrid, Users, Zap } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  return (
    <div className="bg-slate-900 p-6 min-h-screen text-white">
      <div className="space-y-12 mx-auto pt-12 max-w-5xl">
        {/* Hero Section */}
        <div className="text-center">
          <h1 className="mb-4 font-bold text-5xl tracking-tight">
            Court<span className="text-lime-500">Command</span>
          </h1>
          <p className="text-slate-400 text-xl">Tournament Operations Center</p>
        </div>

        {/* Quick Actions Grid */}
        <div className="gap-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/quick-match"
            className="group relative flex flex-col items-center bg-slate-800 hover:bg-slate-750 p-8 border border-slate-700 hover:border-amber-500 rounded-2xl transition-all overflow-hidden"
          >
            <div className="group-hover:scale-110 mb-4 transition-transform duration-300">
              <Zap className="w-12 h-12 text-amber-500" />
            </div>
            <h3 className="font-bold text-xl">Quick Match</h3>
            <p className="mt-2 text-center text-slate-400 text-sm">
              Start an ad-hoc game instantly.
            </p>
          </Link>

          <Link
            to="/courts"
            className="group flex flex-col items-center bg-slate-800 hover:bg-slate-750 p-8 border border-slate-700 hover:border-lime-500 rounded-2xl transition-all"
          >
            <div className="group-hover:scale-110 mb-4 transition-transform duration-300">
              <LayoutGrid className="w-12 h-12 text-lime-500" />
            </div>
            <h3 className="font-bold text-xl">Courts</h3>
            <p className="mt-2 text-center text-slate-400 text-sm">
              Manage courts and active matches.
            </p>
          </Link>

          <Link
            to="/registry"
            className="group flex flex-col items-center bg-slate-800 hover:bg-slate-750 p-8 border border-slate-700 hover:border-blue-500 rounded-2xl transition-all"
          >
            <div className="group-hover:scale-110 mb-4 transition-transform duration-300">
              <Users className="w-12 h-12 text-blue-500" />
            </div>
            <h3 className="font-bold text-xl">Registry</h3>
            <p className="mt-2 text-center text-slate-400 text-sm">
              Manage players and teams.
            </p>
          </Link>

          <button
            disabled
            className="group flex flex-col items-center bg-slate-800/50 p-8 border border-slate-800 rounded-2xl opacity-50 cursor-not-allowed"
          >
            <div className="mb-4">
              <History className="w-12 h-12 text-slate-600" />
            </div>
            <h3 className="font-bold text-xl">History</h3>
            <p className="mt-2 text-center text-slate-500 text-sm">
              Match logs (Coming Soon)
            </p>
          </button>
        </div>
      </div>
    </div>
  )
}
