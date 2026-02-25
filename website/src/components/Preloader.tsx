import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PreloaderProps {
    onComplete: () => void;
}

export default function Preloader({ onComplete }: PreloaderProps) {
    const [phase, setPhase] = useState<'logo' | 'wipe'>('logo');

    useEffect(() => {
        // Phase 1: Show logo for 1.2s, then start wipe
        const logoTimer = setTimeout(() => setPhase('wipe'), 1200);
        // Phase 2: After wipe animation (0.8s), signal completion
        const completeTimer = setTimeout(() => onComplete(), 2000);
        return () => {
            clearTimeout(logoTimer);
            clearTimeout(completeTimer);
        };
    }, [onComplete]);

    return (
        <AnimatePresence>
            {phase !== 'wipe' ? null : null}
            <motion.div
                key="preloader"
                className="fixed inset-0 z-[200] flex items-center justify-center bg-[#05050A]"
                initial={{ y: 0 }}
                animate={phase === 'wipe' ? { y: '-100%' } : { y: 0 }}
                transition={
                    phase === 'wipe'
                        ? { duration: 0.8, ease: [0.76, 0, 0.24, 1] }
                        : {}
                }
            >
                {/* Centered Logo Animation */}
                <motion.div
                    className="flex items-baseline gap-2"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                    {/* Radar */}
                    <motion.div
                        className="relative w-8 h-8 flex items-center justify-center mr-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1, duration: 0.4 }}
                    >
                        <div className="absolute inset-0 border-2 border-[#7B61FF]/50 rounded-full" />
                        <motion.div
                            className="w-3 h-3 bg-[#7B61FF] rounded-full shadow-[0_0_20px_#7B61FF]"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.3, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                        />
                    </motion.div>

                    <motion.span
                        className="font-black text-[#F0EFF4] tracking-[0.2em] text-2xl uppercase"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    >
                        COURT
                    </motion.span>
                    <motion.span
                        className="text-[#F0EFF4]/30 font-data text-base mx-1 font-medium"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4, duration: 0.3 }}
                    >
                        /&#8205;/
                    </motion.span>
                    <motion.span
                        className="font-drama text-[#7B61FF] italic text-4xl lowercase"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    >
                        command
                    </motion.span>
                </motion.div>

                {/* Horizontal scan line effect */}
                <motion.div
                    className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#7B61FF] to-transparent"
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: [0, 1, 1, 0] }}
                    transition={{ delay: 0.6, duration: 1, ease: 'easeInOut' }}
                />
            </motion.div>
        </AnimatePresence>
    );
}
