import { motion } from 'framer-motion';

export default function Hero() {
    return (
        <section className="relative min-h-[100dvh] flex flex-col justify-end px-6 pb-24 md:pb-32 overflow-hidden bg-[#05050A]">
            {/* Background Image/Gradient setup for Vapor Clinic */}
            <div
                className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-40 mix-blend-luminosity"
                style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070&auto=format&fit=crop)' }}
            />
            <div className="absolute inset-0 z-0 bg-gradient-to-t from-[#05050A] via-[#05050A]/80 to-transparent" />

            {/* Abstract Glowing Orb (Bioluminescence vibe) */}
            <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#7B61FF] rounded-full mix-blend-screen filter blur-[120px] opacity-20 animate-pulse pointer-events-none" />

            <div className="relative z-10 max-w-7xl w-full mx-auto flex flex-col items-start gap-8">

                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="inline-flex items-center gap-3 border border-[#7B61FF]/30 bg-[#7B61FF]/10 text-[#F0EFF4] px-4 py-2 rounded-full text-xs md:text-sm font-data tracking-widest uppercase backdrop-blur-md"
                >
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7B61FF] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7B61FF]"></span>
                    </span>
                    System Engine Online
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col gap-2 md:gap-4"
                >
                    <span className="text-4xl md:text-6xl font-bold tracking-tight text-[#F0EFF4] uppercase">
                        Refereeing beyond
                    </span>
                    <span className="text-7xl md:text-9xl font-drama text-[#7B61FF] leading-[0.85] pr-8 text-glow">
                        boundaries.
                    </span>
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="text-lg md:text-2xl text-[#F0EFF4]/70 max-w-2xl font-light leading-relaxed"
                >
                    Zero-latency multi-sport ticker and referee engine. Built for performance. Optimized for the broadcast.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col sm:flex-row gap-6 mt-8 w-full sm:w-auto"
                >
                    <button className="magnetic-btn relative group px-8 py-5 rounded-full bg-[#7B61FF] text-white font-bold tracking-wide uppercase text-sm w-full sm:w-auto shadow-[0_0_40px_rgba(123,97,255,0.3)] border-none">
                        <span className="relative z-10 flex items-center justify-center gap-2">
                            Deploy Instantly
                            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                        </span>
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out rounded-full" />
                    </button>

                    <button className="magnetic-btn px-8 py-5 rounded-full bg-[#0A0A14] border border-[#18181B] text-[#F0EFF4] hover:bg-[#18181B] font-data text-sm w-full sm:w-auto transition-colors">
                        View Documentation
                    </button>
                </motion.div>
            </div>
        </section>
    );
}
