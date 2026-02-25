import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function Features() {
    // Telemetry Typewriter Logic
    const [telemetryText, setTelemetryText] = useState("");
    const fullText = "> CONNECTING TO REDIS PUB/SUB...\n> SYNCING COURT 1 DATA...\n> EVENT: SIDEOUT_TEAM_A\n> LATENCY: 4ms... OK";

    useEffect(() => {
        let i = 0;
        const interval = setInterval(() => {
            setTelemetryText(fullText.substring(0, i));
            i++;
            if (i > fullText.length) {
                clearInterval(interval);
            }
        }, 50);
        return () => clearInterval(interval);
    }, []);

    return (
        <section id="features" className="py-32 px-6 relative z-10 bg-[#05050A]">
            <div className="max-w-7xl mx-auto">
                <div className="mb-20 md:mb-32 max-w-2xl">
                    <h2 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
                        Engineered for <br />
                        <span className="font-drama text-[#7B61FF] text-glow pr-8">precision.</span>
                    </h2>
                    <p className="text-[#F0EFF4]/60 text-lg md:text-xl font-light">
                        Ditch the clipboards. Elevate your tournament with tools that feel like they belong in a control room.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* Card 1: Telemetry Typewriter */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="glass-card p-10 flex flex-col h-[400px] relative group"
                    >
                        <div className="flex items-center gap-3 mb-8 border-b border-[#18181B] pb-4">
                            <div className="w-2 h-2 rounded-full bg-[#7B61FF] animate-pulse shadow-[0_0_10px_#7B61FF]" />
                            <span className="font-data text-xs text-[#7B61FF] uppercase tracking-widest">Live Feed Integration</span>
                        </div>

                        <div className="flex-grow font-data text-sm md:text-base text-[#F0EFF4]/80 whitespace-pre-line leading-loose">
                            {telemetryText}
                            <span className="inline-block w-2 h-4 bg-[#7B61FF] ml-1 animate-pulse" />
                        </div>

                        <div className="mt-8">
                            <h3 className="text-2xl font-bold mb-2">Zero-Latency Sync</h3>
                            <p className="text-[#F0EFF4]/60">Scores instantly reflect across mobile controllers and broadcast graphics.</p>
                        </div>
                    </motion.div>

                    {/* Card 2: Interactive State Visualizer (Scheduler style alternative) */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                        className="glass-card p-10 flex flex-col h-[400px] relative overflow-hidden group"
                    >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[#7B61FF]/10 rounded-full blur-[80px] group-hover:bg-[#7B61FF]/20 transition-colors duration-700 pointer-events-none" />

                        <div className="flex-grow flex items-center justify-center relative">
                            <div className="w-full h-32 border border-[#18181B] bg-[#0A0A14] rounded-xl flex items-center justify-between px-8 relative overflow-hidden">
                                {/* Fake animated timeline elements */}
                                <motion.div
                                    animate={{ x: ["-100%", "200%"] }}
                                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                    className="absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b from-transparent via-[#7B61FF] to-transparent/10 opacity-50 shadow-[0_0_15px_#7B61FF]"
                                />

                                <div className="flex flex-col items-center gap-2 z-10">
                                    <div className="w-12 h-12 rounded-full bg-[#18181B] flex items-center justify-center font-data text-xs border border-[#27272A] text-[#F0EFF4]/50">REV 1</div>
                                </div>
                                <div className="h-px bg-[#27272A] flex-grow mx-4 relative">
                                    <div className="absolute top-1/2 left-[-4px] w-2 h-2 rounded-full bg-[#7B61FF] -translate-y-1/2" />
                                </div>
                                <div className="flex flex-col items-center gap-2 z-10">
                                    <div className="w-12 h-12 rounded-full bg-[#7B61FF]/20 flex items-center justify-center font-data text-xs border border-[#7B61FF] text-[#7B61FF] shadow-[0_0_20px_rgba(123,97,255,0.2)]">CURRENT</div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-2xl font-bold mb-2">Robust Immutable State</h3>
                            <p className="text-[#F0EFF4]/60">Every point is an event. Need to undo a sideout? Step back through history instantly.</p>
                        </div>
                    </motion.div>

                </div>
            </div>
        </section>
    );
}
