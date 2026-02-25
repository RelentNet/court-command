import { motion } from 'framer-motion';

const sports = ["PICKLEBALL", "TENNIS", "PADEL", "BASKETBALL", "VOLLEYBALL"];

export default function MultiSport() {
    return (
        <section id="sports" className="py-24 relative overflow-hidden bg-[#0A0A14] border-t border-b border-[#18181B]">
            <div className="absolute inset-0 bg-[#05050A]/50 bg-[radial-gradient(circle_at_bottom_left,rgba(123,97,255,0.05),transparent_50%)] pointer-events-none mix-blend-screen" />

            <div className="max-w-7xl mx-auto px-6 flex flex-col items-center justify-center text-center">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="w-16 h-16 bg-[#7B61FF]/10 rounded-[1.5rem] flex items-center justify-center mx-auto mb-8 border border-[#7B61FF]/30 shadow-[0_0_20px_rgba(123,97,255,0.1)]">
                        <svg className="w-8 h-8 text-[#7B61FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
                        Beyond <span className="font-drama text-[#7B61FF] italic text-glow">Pickleball.</span>
                    </h2>
                    <p className="text-[#F0EFF4]/60 text-lg md:text-xl max-w-2xl mx-auto font-light mb-16">
                        CourtCommand's core state engine was built to handle complex sideouts and scoring in pickleball. That makes adapting it to any other sport effortless.
                    </p>
                </motion.div>
            </div>

            {/* Infinite Scrolling Ticker effect */}
            <div className="relative flex overflow-x-hidden group">
                <div className="animate-marquee whitespace-nowrap flex items-center gap-8 py-4">
                    {[...sports, ...sports, ...sports, ...sports].map((sport, i) => (
                        <span key={i} className="text-4xl md:text-7xl font-bold text-[#18181B] bg-clip-text uppercase tracking-tight select-none hover:text-[#7B61FF] transition-colors duration-500">
                            {sport}
                        </span>
                    ))}
                </div>

                <div className="absolute top-0 animate-marquee2 whitespace-nowrap flex items-center gap-8 py-4 px-8">
                    {[...sports, ...sports, ...sports, ...sports].map((sport, i) => (
                        <span key={i} className="text-4xl md:text-7xl font-bold text-[#18181B] bg-clip-text uppercase tracking-tight select-none hover:text-[#7B61FF] transition-colors duration-500">
                            {sport}
                        </span>
                    ))}
                </div>
            </div>

            <style>{`
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
        .animate-marquee2 {
          animation: marquee2 30s linear infinite;
        }
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes marquee2 {
          0% { transform: translateX(100%); }
          100% { transform: translateX(0%); }
        }
      `}</style>
        </section>
    );
}
