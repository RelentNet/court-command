import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

export default function Pricing() {
    return (
        <section id="pricing" className="py-32 px-6 relative z-10 bg-[#05050A]">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-24 relative">
                    <h2 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
                        Choose your <span className="font-drama text-[#7B61FF] italic pr-8 text-glow">arena.</span>
                    </h2>
                    <p className="text-[#F0EFF4]/60 text-xl font-light max-w-2xl mx-auto">
                        Open Source forever. Managed hosting for when you just want to focus on the game.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto relative">
                    {/* Background Glows for Pricing Cards */}
                    <div className="absolute inset-0 bg-[#7B61FF]/10 blur-[120px] rounded-full pointer-events-none mix-blend-screen" />

                    {/* Open Source Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="glass-card p-10 relative group overflow-hidden bg-[#05050A]"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-[#18181B] group-hover:bg-[#27272A] transition-colors" />
                        <h3 className="text-3xl font-bold mb-2 text-[#F0EFF4] tracking-tight">Open Source</h3>
                        <div className="text-6xl font-data mb-2 font-light">$0<span className="text-xl text-[#F0EFF4]/40">/mo</span></div>
                        <p className="text-[#F0EFF4]/60 font-light mb-8">Deploy via Docker or Coolify.</p>

                        <ul className="space-y-4 mb-10 font-light text-[#F0EFF4]/80">
                            {['Full access to all features', 'Unlimited tournaments & courts', 'Self-managed infrastructure', 'Community support via GitHub'].map(feature => (
                                <li key={feature} className="flex gap-3 items-center">
                                    <Check className="w-5 h-5 shrink-0 text-[#F0EFF4]/30" />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>

                        <button className="magnetic-btn w-full py-5 border border-[#18181B] font-data text-sm tracking-widest uppercase bg-[#0A0A14] text-[#F0EFF4] hover:bg-[#18181B]">
                            Read the Docs
                        </button>
                    </motion.div>

                    {/* Pro Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                        className="glass-card p-10 relative overflow-hidden border-[#7B61FF]/30 ring-1 ring-[#7B61FF]/50 shadow-[0_0_50px_rgba(123,97,255,0.15)] group bg-[#0A0A14]"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#7B61FF] to-transparent/50" />

                        <div className="absolute top-6 right-8 text-[0.65rem] font-bold font-data uppercase tracking-widest text-[#F0EFF4] bg-[#7B61FF]/20 border border-[#7B61FF]/30 py-1.5 px-3 rounded-full">
                            Recommended
                        </div>

                        <h3 className="text-3xl font-bold mb-2 text-[#7B61FF] tracking-tight">Pro Plan</h3>
                        <div className="text-6xl font-data mb-2 text-white font-light">$49<span className="text-xl text-[#F0EFF4]/40">/mo</span></div>
                        <p className="text-[#F0EFF4]/60 font-light mb-8">Managed hosting. Zero setup.</p>

                        <ul className="space-y-4 mb-10 font-light text-[#F0EFF4]/90">
                            {['Everything in Open Source', 'Done-for-you deployment', 'Priority email support', 'Custom broadcast overlays', 'SSO & Advanced Security'].map(feature => (
                                <li key={feature} className="flex gap-3 items-center">
                                    <Check className="w-5 h-5 shrink-0 text-[#7B61FF]" />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>

                        <button className="magnetic-btn w-full py-5 rounded-full font-bold bg-[#7B61FF] text-white tracking-wide uppercase text-sm shadow-[0_0_30px_rgba(123,97,255,0.3)] hover:shadow-[0_0_40px_rgba(123,97,255,0.5)]">
                            Start Free Trial
                        </button>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
