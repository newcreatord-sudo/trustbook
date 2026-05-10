import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, CheckCircle2, ShieldCheck, Sparkles, Store, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import Button from '@/shared/ui/Button'

function LandingHeroIllustration() {
  return (
    <div className="relative mx-auto flex w-full max-w-[400px] items-center justify-center md:mx-0">
      <div className="absolute inset-0 rounded-[40%] bg-[#4F7CFF]/25 blur-[80px]" aria-hidden />
      <svg
        viewBox="0 0 320 320"
        className="relative h-auto w-full drop-shadow-[0_24px_60px_rgba(79,124,255,0.42)]"
        aria-hidden
      >
        <defs>
          <linearGradient id="trustStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a8b9ff" />
            <stop offset="100%" stopColor="#4f7cff" />
          </linearGradient>
          <linearGradient id="trustFill" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(79,124,255,0.35)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0.06)" />
          </linearGradient>
          <radialGradient id="trustGlow" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="rgba(79,124,255,0.45)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle cx="160" cy="155" r="118" fill="url(#trustGlow)" opacity="0.65" />
        <rect
          x="52"
          y="72"
          width="216"
          height="188"
          rx="26"
          fill="url(#trustFill)"
          stroke="url(#trustStroke)"
          strokeWidth="2"
          opacity="0.95"
        />
        <path
          d="M92 124h136M92 154h96M92 184h116"
          stroke="url(#trustStroke)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.55"
        />
        <circle cx="228" cy="108" r="34" fill="rgba(79,124,255,0.4)" stroke="url(#trustStroke)" strokeWidth="2" />
        <path
          d="M214 108l9 9 20-20"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.92"
        />
      </svg>
    </div>
  )
}

function SectionTitle(props: { kicker: string; title: string; subtitle: string }) {
  return (
    <div>
      <div className="tb-kicker">{props.kicker}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">{props.title}</div>
      <div className="tb-subtitle mt-2 max-w-2xl">{props.subtitle}</div>
    </div>
  )
}

export default function Landing() {
  const nav = useNavigate()

  const faq = useMemo(
    () => [
      {
        q: 'Serve il login?',
        a: 'Sì. Il login rende il sistema affidabile: reputazione, caparra e regole funzionano solo con account stabili.',
      },
      {
        q: 'La caparra è obbligatoria?',
        a: 'No. Ogni attività decide se attivarla e quando: sempre, solo clienti a rischio, fissa o percentuale con min/max.',
      },
      {
        q: 'Cosa rende TrustBook diversa?',
        a: 'Non è solo prenotare: è ordine, controllo e meno no-show grazie a stati chiari, chat per prenotazione e reputazione.',
      },
    ],
    [],
  )

  return (
    <div className="relative isolate min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a111d]/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.38)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-3 text-white transition-opacity hover:opacity-95">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7398FF] via-[#4F7CFF] to-[#3559d8] shadow-lg shadow-[#4F7CFF]/35 ring-2 ring-white/[0.12]">
              <ShieldCheck className="h-4 w-4 text-white" aria-hidden />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">TrustBook</div>
              <div className="text-[11px] font-medium text-white/70">Prenotazioni anti no-show</div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => nav('/start')}>
              Inizia
            </Button>
            <Button type="button" size="sm" onClick={() => nav('/login?mode=login')}>
              Accedi
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <section className="tb-immersive-panel px-6 py-10 md:px-12 md:py-14">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:items-center md:gap-8">
            <div className="md:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-semibold text-white/85 shadow-lg shadow-black/25 backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5 text-amber-300/95" aria-hidden />
                Meno no-show · Più controllo · Più ordine
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-[1.12] tracking-tight text-white md:text-5xl md:leading-[1.08]">
                Prenotazioni moderne,{' '}
                <span className="bg-gradient-to-r from-[#a8b9ff] via-white to-[#8ea8ff] bg-clip-text text-transparent">
                  essenziali e affidabili.
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75 md:text-[17px]">
                TrustBook mette le attività al centro: regole chiare, caparra intelligente e reputazione. Il cliente prenota
                veloce e capisce subito cosa succede.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  to="/start?role=attivita"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#4F7CFF] px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#4F7CFF]/35 ring-1 ring-white/15 transition hover:bg-[#6A90FF] hover:shadow-[#4F7CFF]/45"
                >
                  <Store className="h-4 w-4" aria-hidden />
                  Inizia come attività
                  <ArrowRight className="h-4 w-4 opacity-90" aria-hidden />
                </Link>
                <Link
                  to="/start?role=cliente"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3.5 text-sm font-semibold text-white/90 shadow-lg shadow-black/30 backdrop-blur-sm transition hover:border-white/25 hover:bg-white/[0.1]"
                >
                  <User className="h-4 w-4" aria-hidden />
                  Inizia come cliente
                </Link>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[{ k: 'Attività', v: 'Prenotazioni filtrate' }, { k: 'Cliente', v: 'Prenotazione veloce' }, { k: 'Anti no-show', v: 'Regole + reputazione' }].map(
                  (x) => (
                    <div
                      key={x.k}
                      className="rounded-2xl border border-white/12 bg-white/[0.05] p-4 shadow-inner shadow-black/20 backdrop-blur-sm transition hover:border-white/18 hover:bg-white/[0.07]"
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a8b9ff]/95">{x.k}</div>
                      <div className="mt-1.5 text-sm font-semibold tracking-tight text-white">{x.v}</div>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="relative md:col-span-5">
              <LandingHeroIllustration />
              <div className="relative mx-auto mt-8 max-w-md rounded-3xl border border-white/15 bg-[#0c1426]/75 p-5 shadow-tbElevated backdrop-blur-xl ring-1 ring-[#4F7CFF]/20 md:mt-10 md:ml-0">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div className="text-sm font-semibold tracking-tight text-white">Perché funziona</div>
                  <CalendarDays className="h-4 w-4 shrink-0 text-[#8ea8ff]" aria-hidden />
                </div>
                <div className="mt-4 space-y-2.5 text-sm leading-relaxed text-white/72">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                    Stati chiari: richiesta → approvazione → caparra (se serve) → conferma.
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                    Chat per singola prenotazione: niente messaggi persi, niente caos.
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
                    Reputazione semplice: i clienti seri ottengono meno attrito e più fiducia.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-16 md:mt-20 grid grid-cols-1 gap-10">
          <SectionTitle
            kicker="ATTIVITÀ AL CENTRO"
            title="Ordine e controllo, senza perdere tempo"
            subtitle="Dashboard operativa: oggi / in attesa / prossime, azioni rapide e conferme. Regole e caparra configurabili."
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { t: 'Prenotazioni vere', d: 'Filtri, rischio cliente e caparra quando serve.' },
              { t: 'Regole chiare', d: 'Finestra cancellazione, approvazione auto/manuale.' },
              { t: 'Meno no-show', d: 'Reputazione e caparra intelligente riducono le assenze.' },
            ].map((x) => (
              <div
                key={x.t}
                className="rounded-3xl border border-white/12 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-6 shadow-lg shadow-black/35 ring-1 ring-white/[0.06] transition hover:border-white/18 hover:from-white/[0.09]"
              >
                <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400/95" aria-hidden />
                  {x.t}
                </div>
                <div className="mt-3 text-sm leading-relaxed text-white/72">{x.d}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 md:mt-20">
          <SectionTitle
            kicker="FAQ"
            title="Risposte rapide"
            subtitle="Trasparenza = fiducia. Le regole sono semplici e orientate alla realtà delle attività."
          />
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {faq.map((x) => (
              <div
                key={x.q}
                className="rounded-3xl border border-white/12 bg-[#0d1526]/55 p-6 shadow-lg shadow-black/40 backdrop-blur-sm ring-1 ring-white/[0.05]"
              >
                <div className="text-sm font-semibold tracking-tight text-white">{x.q}</div>
                <div className="mt-3 text-sm leading-relaxed text-white/72">{x.a}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-16 overflow-hidden rounded-3xl border border-[#4F7CFF]/25 bg-gradient-to-br from-[#4F7CFF]/18 via-[#0d1526]/90 to-[#0b1220] p-8 shadow-tbGlow md:mt-20 md:p-10">
          <div className="pointer-events-none absolute -right-20 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-[#4F7CFF]/25 blur-3xl" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xl font-semibold tracking-tight text-white md:text-2xl">Pronto a ridurre i no-show?</div>
              <div className="mt-2 max-w-xl text-sm leading-relaxed text-white/78">
                Imposta le regole una volta, poi lavori con ordine ogni giorno.
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to="/start?role=attivita"
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3.5 text-sm font-semibold text-[#0b1220] shadow-xl shadow-black/35 ring-1 ring-white/25 transition hover:bg-white/95',
                )}
              >
                Inizia come attività
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                to="/login?mode=login"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/[0.08] px-5 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:border-white/35 hover:bg-white/[0.12]"
              >
                Accedi
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
