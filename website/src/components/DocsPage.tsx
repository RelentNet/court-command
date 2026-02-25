import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowLeft, Terminal, Server, Database, Cpu, Globe, Zap } from 'lucide-react';

const fadeUp = {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
};

function CodeBlock({ children, title }: { children: string; title?: string }) {
    return (
        <div className="rounded-xl border border-[#18181B] bg-[#0A0A14] overflow-hidden">
            {title && (
                <div className="flex items-center gap-2 px-5 py-3 border-b border-[#18181B] bg-[#05050A]">
                    <Terminal className="w-3.5 h-3.5 text-[#7B61FF]" />
                    <span className="text-xs font-data text-[#F0EFF4]/50 uppercase tracking-widest">{title}</span>
                </div>
            )}
            <pre className="p-6 text-sm md:text-base font-data text-[#F0EFF4]/80 leading-relaxed overflow-x-auto">
                <code>{children}</code>
            </pre>
        </div>
    );
}

function StepCard({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
    return (
        <motion.div {...fadeUp} className="glass-card p-8 md:p-10 relative">
            <div className="flex items-start gap-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#7B61FF]/10 border border-[#7B61FF]/30 flex items-center justify-center font-data text-[#7B61FF] text-lg font-bold">
                    {number}
                </div>
                <div className="flex-grow">
                    <h3 className="text-xl md:text-2xl font-bold text-[#F0EFF4] mb-4">{title}</h3>
                    {children}
                </div>
            </div>
        </motion.div>
    );
}

function EnvRow({ name, defaultVal, description }: { name: string; defaultVal: string; description: string }) {
    return (
        <tr className="border-b border-[#18181B] hover:bg-[#0A0A14] transition-colors">
            <td className="py-4 px-5 font-data text-[#7B61FF] text-sm">{name}</td>
            <td className="py-4 px-5 font-data text-[#F0EFF4]/50 text-sm">{defaultVal}</td>
            <td className="py-4 px-5 text-[#F0EFF4]/70 text-sm">{description}</td>
        </tr>
    );
}

export default function DocsPage() {
    return (
        <div className="min-h-screen bg-[#05050A] font-sans relative" style={{ overflow: 'clip' }}>
            <div className="bg-noise"></div>

            {/* Sticky Doc Nav */}
            <nav className="fixed top-6 left-1/2 -translate-x-1/2 w-[90%] md:w-auto z-[60] bg-[#05050A]/60 backdrop-blur-xl border border-[#18181B] rounded-full px-6 md:px-8 py-3">
                <div className="flex items-center justify-between gap-8 md:gap-16">
                    <Link to="/" className="flex items-center gap-3 group cursor-pointer">
                        <ArrowLeft className="w-4 h-4 text-[#F0EFF4]/50 group-hover:text-[#7B61FF] group-hover:-translate-x-1 transition-all" />
                        <div className="flex items-baseline uppercase">
                            <span className="font-black text-[#F0EFF4] tracking-[0.2em] text-lg">COURT</span>
                            <span className="text-[#F0EFF4]/30 font-data text-sm mx-1.5 font-medium -translate-y-0.5">/&#8205;/</span>
                            <span className="font-drama text-[#7B61FF] italic text-2xl lowercase animate-breathe">command</span>
                        </div>
                    </Link>
                    <div className="hidden md:flex gap-6 items-center text-sm font-data text-[#F0EFF4]/50">
                        <a href="#quickstart" className="hover:text-[#F0EFF4] transition-colors">Quick Start</a>
                        <a href="#architecture" className="hover:text-[#F0EFF4] transition-colors">Architecture</a>
                        <a href="#config" className="hover:text-[#F0EFF4] transition-colors">Config</a>
                        <a href="#development" className="hover:text-[#F0EFF4] transition-colors">Development</a>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className="pt-40 pb-20 px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#7B61FF]/30 bg-[#7B61FF]/10 text-xs font-data text-[#7B61FF] uppercase tracking-widest mb-8">
                            <Globe className="w-3 h-3" />
                            Self-Hosted Deployment
                        </div>
                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-[#F0EFF4] mb-6">
                            Deploy your own <br />
                            <span className="font-drama text-[#7B61FF] text-glow pr-4">instance.</span>
                        </h1>
                        <p className="text-lg md:text-xl text-[#F0EFF4]/60 max-w-2xl leading-relaxed">
                            CourtCommand is designed for "appliance-style" deployment. Clone, configure, and launch — your tournament infrastructure in under 5 minutes.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Prerequisites */}
            <section className="py-16 px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.div {...fadeUp}>
                        <h2 className="text-2xl font-bold text-[#F0EFF4] mb-6 flex items-center gap-3">
                            <Cpu className="w-5 h-5 text-[#7B61FF]" />
                            Prerequisites
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {[
                                { name: 'Docker', desc: 'v24+ with Compose' },
                                { name: 'Git', desc: 'To clone the repository' },
                                { name: 'A Server', desc: 'VPS, bare metal, or local machine' },
                            ].map((item) => (
                                <div
                                    key={item.name}
                                    className="glass-card p-5 flex flex-col gap-1"
                                >
                                    <span className="font-bold text-[#F0EFF4]">{item.name}</span>
                                    <span className="text-sm text-[#F0EFF4]/50">{item.desc}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Quick Start */}
            <section id="quickstart" className="py-16 px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.h2
                        {...fadeUp}
                        className="text-3xl md:text-4xl font-bold text-[#F0EFF4] mb-4 flex items-center gap-3"
                    >
                        <Zap className="w-6 h-6 text-[#7B61FF]" />
                        Quick Start
                    </motion.h2>
                    <motion.p {...fadeUp} className="text-[#F0EFF4]/60 mb-12 max-w-xl">
                        Three steps. That's all it takes.
                    </motion.p>

                    <div className="flex flex-col gap-8">
                        <StepCard number="01" title="Clone the repository">
                            <CodeBlock title="terminal">{`git clone https://github.com/brandon-relentnet/court-command.git
cd court-command`}</CodeBlock>
                        </StepCard>

                        <StepCard number="02" title="Configure your environment">
                            <p className="text-[#F0EFF4]/60 mb-4">
                                Create a <code className="font-data text-[#7B61FF] text-sm">.env</code> file in the project root. The defaults work out of the box for local testing.
                            </p>
                            <CodeBlock title=".env">{`# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=courtcommand

# Frontend → Backend connection
VITE_API_URL=https://your-api-domain.com`}</CodeBlock>
                        </StepCard>

                        <StepCard number="03" title="Launch with Docker Compose">
                            <CodeBlock title="terminal">{`docker compose up -d --build`}</CodeBlock>
                            <p className="text-[#F0EFF4]/60 mt-4 text-sm">
                                This spins up 4 services: <span className="text-[#7B61FF] font-data">PostgreSQL 17</span>, <span className="text-[#7B61FF] font-data">Redis</span>, <span className="text-[#7B61FF] font-data">FastAPI backend</span>, and the <span className="text-[#7B61FF] font-data">Nginx frontend</span>.
                            </p>
                        </StepCard>
                    </div>
                </div>
            </section>

            {/* Architecture */}
            <section id="architecture" className="py-16 px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.h2
                        {...fadeUp}
                        className="text-3xl md:text-4xl font-bold text-[#F0EFF4] mb-12 flex items-center gap-3"
                    >
                        <Server className="w-6 h-6 text-[#7B61FF]" />
                        Architecture
                    </motion.h2>

                    <motion.div {...fadeUp} className="glass-card p-8 md:p-12">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                            {[
                                { name: 'Frontend', tech: 'React + Nginx', port: ':80', color: 'bg-blue-500/20 border-blue-500/30 text-blue-400' },
                                { name: 'Backend', tech: 'FastAPI + Uvicorn', port: ':8000', color: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' },
                                { name: 'Database', tech: 'PostgreSQL 17', port: ':5432', color: 'bg-amber-500/20 border-amber-500/30 text-amber-400' },
                                { name: 'Cache', tech: 'Redis Alpine', port: ':6379', color: 'bg-rose-500/20 border-rose-500/30 text-rose-400' },
                            ].map((svc) => (
                                <div key={svc.name} className={`rounded-xl border p-5 flex flex-col gap-2 ${svc.color}`}>
                                    <span className="font-bold text-base">{svc.name}</span>
                                    <span className="text-xs font-data opacity-70">{svc.tech}</span>
                                    <span className="text-xs font-data mt-auto opacity-50">{svc.port}</span>
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 pt-6 border-t border-[#18181B]">
                            <h4 className="font-data text-xs text-[#F0EFF4]/50 uppercase tracking-widest mb-4">Data Flow</h4>
                            <p className="text-[#F0EFF4]/60 text-sm leading-relaxed font-data">
                                Referee Action → API (FastAPI) → Persistence (Postgres) → Broadcast (Redis Pub/Sub) → Ticker (WebSocket Update)
                            </p>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Environment Variables */}
            <section id="config" className="py-16 px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.h2
                        {...fadeUp}
                        className="text-3xl md:text-4xl font-bold text-[#F0EFF4] mb-12 flex items-center gap-3"
                    >
                        <Database className="w-6 h-6 text-[#7B61FF]" />
                        Configuration
                    </motion.h2>

                    <motion.div
                        {...fadeUp}
                        className="rounded-xl border border-[#18181B] overflow-hidden"
                    >
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-[#0A0A14] border-b border-[#18181B]">
                                    <th className="py-4 px-5 font-data text-xs text-[#F0EFF4]/40 uppercase tracking-widest">Variable</th>
                                    <th className="py-4 px-5 font-data text-xs text-[#F0EFF4]/40 uppercase tracking-widest">Default</th>
                                    <th className="py-4 px-5 font-data text-xs text-[#F0EFF4]/40 uppercase tracking-widest">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <EnvRow name="POSTGRES_USER" defaultVal="postgres" description="Database superuser name" />
                                <EnvRow name="POSTGRES_PASSWORD" defaultVal="postgres" description="Database password" />
                                <EnvRow name="POSTGRES_DB" defaultVal="courtcommand" description="Database name" />
                                <EnvRow name="DATABASE_URL" defaultVal="auto-generated" description="AsyncPG connection string (set by Compose)" />
                                <EnvRow name="REDIS_URL" defaultVal="redis://redis:6379" description="Redis connection string" />
                                <EnvRow name="VITE_API_URL" defaultVal="—" description="Public URL of the backend API for the frontend" />
                            </tbody>
                        </table>
                    </motion.div>
                </div>
            </section>

            {/* Coolify Deployment */}
            <section className="py-16 px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.div {...fadeUp} className="glass-card p-8 md:p-12 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[#7B61FF]/10 rounded-full blur-[100px] pointer-events-none" />
                        <div className="relative">
                            <span className="inline-block px-3 py-1 rounded-full bg-[#7B61FF]/10 border border-[#7B61FF]/30 text-xs font-data text-[#7B61FF] uppercase tracking-widest mb-6">
                                Recommended
                            </span>
                            <h3 className="text-2xl md:text-3xl font-bold text-[#F0EFF4] mb-4">Deploy with Coolify</h3>
                            <p className="text-[#F0EFF4]/60 mb-8 max-w-xl leading-relaxed">
                                The recommended way to deploy CourtCommand. Coolify gives you a self-hosted PaaS that handles SSL, domains, and container orchestration automatically.
                            </p>
                            <ol className="space-y-4 text-[#F0EFF4]/70 text-sm">
                                <li className="flex items-start gap-3">
                                    <span className="font-data text-[#7B61FF] font-bold mt-0.5">1.</span>
                                    <span>Install Coolify on your server (<code className="font-data text-[#7B61FF]">curl -fsSL https://get.coolify.io | bash</code>)</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="font-data text-[#7B61FF] font-bold mt-0.5">2.</span>
                                    <span>Create a new project and connect your GitHub repository</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="font-data text-[#7B61FF] font-bold mt-0.5">3.</span>
                                    <span>Select "Docker Compose" as the build method — Coolify will auto-detect <code className="font-data text-[#7B61FF]">docker-compose.yaml</code></span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="font-data text-[#7B61FF] font-bold mt-0.5">4.</span>
                                    <span>Set your environment variables in the Coolify dashboard and deploy</span>
                                </li>
                            </ol>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Development Setup */}
            <section id="development" className="py-16 px-6">
                <div className="max-w-4xl mx-auto">
                    <motion.h2
                        {...fadeUp}
                        className="text-3xl md:text-4xl font-bold text-[#F0EFF4] mb-4 flex items-center gap-3"
                    >
                        <Terminal className="w-6 h-6 text-[#7B61FF]" />
                        Local Development
                    </motion.h2>
                    <motion.p {...fadeUp} className="text-[#F0EFF4]/60 mb-12 max-w-xl">
                        For contributors and developers who want to run the system outside of Docker.
                    </motion.p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <motion.div {...fadeUp}>
                            <h4 className="font-bold text-[#F0EFF4] mb-4 text-lg">Backend</h4>
                            <CodeBlock title="terminal">{`cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py`}</CodeBlock>
                            <p className="text-[#F0EFF4]/50 text-xs font-data mt-3">
                                Runs on http://localhost:8000
                            </p>
                        </motion.div>

                        <motion.div {...fadeUp}>
                            <h4 className="font-bold text-[#F0EFF4] mb-4 text-lg">Frontend</h4>
                            <CodeBlock title="terminal">{`cd frontend
npm install
npm run dev`}</CodeBlock>
                            <p className="text-[#F0EFF4]/50 text-xs font-data mt-3">
                                Runs on http://localhost:3000
                            </p>
                        </motion.div>
                    </div>

                    <motion.div {...fadeUp} className="mt-8">
                        <h4 className="font-bold text-[#F0EFF4] mb-4 text-lg">Or use the Makefile</h4>
                        <CodeBlock title="terminal">{`# Install all dependencies
make install

# Run both backend and frontend concurrently
make dev`}</CodeBlock>
                    </motion.div>
                </div>
            </section>

            {/* Footer CTA */}
            <section className="py-16 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <motion.div {...fadeUp}>
                        <h2 className="text-3xl md:text-4xl font-bold text-[#F0EFF4] mb-6">
                            Ready to launch?
                        </h2>
                        <p className="text-[#F0EFF4]/60 mb-10 max-w-lg mx-auto">
                            CourtCommand is open source and free to self-host. Star us on GitHub or deploy your own instance today.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <a
                                href="https://github.com/brandon-relentnet/court-command"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="magnetic-btn px-8 py-4 rounded-full bg-[#7B61FF] text-white font-bold uppercase tracking-widest text-sm shadow-[0_0_40px_rgba(123,97,255,0.3)]"
                            >
                                View on GitHub
                            </a>
                            <Link
                                to="/"
                                className="magnetic-btn px-8 py-4 rounded-full bg-[#0A0A14] border border-[#18181B] text-[#F0EFF4] font-data text-sm hover:bg-[#18181B] transition-colors"
                            >
                                ← Back to Home
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>
        </div>
    );
}
