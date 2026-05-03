import { ArrowRight, ShieldCheck, Star, Search, CalendarCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export default function HomeHero(props: {
  role: 'cliente' | 'attivita' | null
  myScore: number | null
  myStars: number | null
}) {
  const isCustomer = props.role === 'cliente'
  
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#0B1220] via-[#0B1220] to-[#4F7CFF]/10 p-8 md:p-12">
      {/* Abstract background elements */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#4F7CFF]/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-emerald-500/5 blur-3xl" />

      <div className="relative grid grid-cols-1 gap-8 md:grid-cols-12 md:items-center">
        <div className="md:col-span-7 lg:col-span-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-white/80 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4F7CFF] opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4F7CFF]"></span>
            </span>
            TRUSTBOOK EXPLORE
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Prenota le migliori <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4F7CFF] to-[#8CA8FF]">attività locali.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
            Meno no-show, più rispetto per il tuo tempo. Trova professionisti, verifica le regole di caparra e prenota in sicurezza grazie al tuo punteggio di affidabilità.
          </p>

          {isCustomer && (
            <div className="mt-8 inline-flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-2 pr-6 backdrop-blur-md">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F7CFF] to-[#3B62CC] shadow-lg shadow-[#4F7CFF]/20">
                <ShieldCheck className="h-6 w-6 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Il tuo Trust Score</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-white leading-none">{props.myScore ?? 80}<span className="text-sm text-white/50">/100</span></span>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          'h-3 w-3',
                          i < (props.myStars ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-white/20'
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="md:col-span-5 lg:col-span-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Inizia subito</h3>
            <p className="mt-2 text-sm text-white/60">
              {isCustomer ? 'Gestisci i tuoi appuntamenti o cerca un servizio.' : 'Controlla la tua dashboard o esplora il network.'}
            </p>
            
            <div className="mt-6 flex flex-col gap-3">
              {isCustomer ? (
                <>
                  <Link to="/prenotazioni" className="group flex items-center justify-between rounded-xl bg-[#4F7CFF] px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-[#6A90FF] hover:shadow-lg hover:shadow-[#4F7CFF]/20">
                    <div className="flex items-center gap-3">
                      <CalendarCheck className="h-5 w-5" />
                      Le mie prenotazioni
                    </div>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <button onClick={() => document.getElementById('tb-search-input')?.focus()} className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-white/10">
                    <div className="flex items-center gap-3">
                      <Search className="h-5 w-5 text-white/60" />
                      Cerca attività
                    </div>
                  </button>
                </>
              ) : (
                <Link to="/dashboard-attivita" className="group flex items-center justify-between rounded-xl bg-[#4F7CFF] px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-[#6A90FF] hover:shadow-lg hover:shadow-[#4F7CFF]/20">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5" />
                    Dashboard Attività
                  </div>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              )}
            </div>

            <div className="mt-6 flex items-center gap-3 rounded-xl border border-[#4F7CFF]/20 bg-[#4F7CFF]/5 p-3">
              <div className="h-2 w-2 shrink-0 rounded-full bg-[#4F7CFF]" />
              <p className="text-[11px] leading-relaxed text-white/70">
                Il sistema TrustBook garantisce rispetto reciproco: caparre automatiche solo per utenti a rischio.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

