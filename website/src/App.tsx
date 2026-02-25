import { Hero, Features, MultiSport, Pricing } from './components';

function App() {
    return (
        <div className="min-h-screen relative overflow-hidden font-sans">
            <div className="bg-noise"></div>

            {/* Navbar - Vapor Clinic */}
            <nav className="fixed top-6 left-1/2 -translate-x-1/2 w-[90%] md:w-auto z-[60] bg-[#05050A]/60 backdrop-blur-xl border border-[#18181B] rounded-full px-6 md:px-8 py-3 transition-all duration-300">
                <div className="flex items-center justify-between gap-8 md:gap-16">
                    <div className="flex items-center gap-3 group cursor-pointer">
                        {/* Upgraded Radar Logo Mark */}
                        <div className="relative w-6 h-6 flex items-center justify-center">
                            <div className="absolute inset-0 border border-[#7B61FF]/40 rounded-full group-hover:scale-125 transition-transform duration-500 ease-out" />
                            <div className="w-2 h-2 bg-[#7B61FF] rounded-full animate-pulse shadow-[0_0_10px_#7B61FF]" />
                            <div className="absolute top-1/2 left-1/2 -content-[''] w-8 h-px bg-gradient-to-r from-transparent via-[#7B61FF]/50 to-transparent -translate-x-1/2 -translate-y-1/2 rotate-45 group-hover:rotate-[225deg] transition-transform duration-700 ease-in-out" />
                        </div>

                        {/* Extreme Contrast Typography */}
                        <div className="flex items-baseline uppercase">
                            <span className="font-black text-[#F0EFF4] tracking-[0.2em] text-lg">COURT</span>
                            <span className="text-[#F0EFF4]/30 font-data text-sm mx-1.5 font-medium -translate-y-0.5">/&zwj;/</span>
                            <span className="font-drama text-[#7B61FF] italic text-2xl lowercase animate-breathe">command</span>
                        </div>
                    </div>

                    <div className="hidden md:flex gap-8 items-center text-sm font-data text-[#F0EFF4]/70">
                        <a href="#features" className="hover:text-[#F0EFF4] hover:-translate-y-px transition-all duration-300">Features</a>
                        <a href="#sports" className="hover:text-[#F0EFF4] hover:-translate-y-px transition-all duration-300">Sports</a>
                        <a href="#pricing" className="hover:text-[#F0EFF4] hover:-translate-y-px transition-all duration-300">Pricing</a>
                        <button className="magnetic-btn bg-[#7B61FF] text-white px-5 py-2 rounded-full font-bold uppercase tracking-widest text-[#F0EFF4]">
                            Go Pro
                        </button>
                    </div>
                </div>
            </nav>

            <main className="isolate bg-[#05050A]">
                <Hero />
                <Features />
                <MultiSport />
                <Pricing />
            </main>

            {/* Footer - Vapor Clinic */}
            <footer className="bg-[#05050A] border-t border-[#18181B] rounded-t-[4rem] py-16 px-6 mt-[-4rem] relative z-20">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 md:gap-6">
                    <div className="flex items-center gap-3">
                        <div className="relative w-5 h-5 flex items-center justify-center grayscale opacity-50">
                            <div className="absolute inset-0 border border-[#27272A] rounded-full" />
                            <div className="w-1.5 h-1.5 bg-[#27272A] rounded-full" />
                        </div>
                        <div className="flex items-baseline uppercase opacity-70">
                            <span className="font-black text-[#F0EFF4] tracking-[0.1em] text-sm">COURT</span>
                            <span className="text-[#F0EFF4]/30 font-data text-xs mx-1.5 font-medium -translate-y-px">/&zwj;/</span>
                            <span className="font-drama text-[#7B61FF] italic text-lg lowercase">command</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-[#F0EFF4]/50 text-xs font-data uppercase tracking-widest bg-[#0A0A14] px-4 py-2 rounded-full border border-[#18181B]">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        System Operational
                    </div>
                    <div className="flex gap-6 font-data text-sm">
                        <a href="#" className="text-[#F0EFF4]/50 hover:text-[#7B61FF] transition-colors">GitHub</a>
                        <a href="#" className="text-[#F0EFF4]/50 hover:text-[#7B61FF] transition-colors">Twitter</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default App;
