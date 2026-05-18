import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, CheckCircle2, ShieldCheck, Store, User } from 'lucide-react'
import { cn } from '@/lib/utils'

function SectionTitle(props: { kicker: string; title: string; subtitle: string }) {
  return (
    <div>
      <div className="text-xs font-semibold tracking-wide text-white/60">{props.kicker}</div>
      <div className="mt-2 text-2xl font-semibold text-white md:text-3xl">{props.title}</div>
      <div className="mt-2 max-w-2xl text-sm text-white/70">{props.subtitle}</div>
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
    <div>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0B1220]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#4F7CFF]">
              <ShieldCheck className="h-4 w-4 text-white" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">TrustBook</div>
              <div className="text-xs text-white/70">Prenotazioni anti no-show</div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => nav('/start')}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            >
              Inizia
            </button>
            <button
              type="button"
              onClick={() => nav('/login?mode=login')}
              className="rounded-xl bg-[#4F7CFF] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#6A90FF]"
            >
              Accedi
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-center">
          <div className="md:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              <CheckCircle2 className="h-4 w-4 text-emerald-200" />
              Meno no-show · Più controllo · Più ordine
            </div>
            <div className="mt-4 text-3xl font-semibold leading-tight text-white md:text-5xl">
              Prenotazioni moderne, essenziali e affidabili.
            </div>
            <div className="mt-4 max-w-xl text-sm text-white/70">
              TrustBook mette le attività al centro: regole chiare, caparra intelligente e reputazione.
              Il cliente prenota veloce e capisce subito cosa succede.
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link
                to="/start?role=attivita"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#4F7CFF] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6A90FF]"
              >
                <Store className="h-4 w-4" />
                Inizia come attività
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/start?role=cliente"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10"
              >
                <User className="h-4 w-4" />
                Inizia come cliente
              </Link>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[{ k: 'Attività', v: 'Prenotazioni filtrate' }, { k: 'Cliente', v: 'Prenotazione veloce' }, { k: 'Anti no-show', v: 'Regole + reputazione' }].map(
                (x) => (
                  <div key={x.k} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs font-semibold text-white/60">{x.k}</div>
                    <div className="mt-1 text-sm font-semibold text-white">{x.v}</div>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Perché funziona</div>
                <CalendarDays className="h-4 w-4 text-white/60" />
              </div>
              <div className="mt-4 space-y-2 text-sm text-white/70">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  Stati chiari: richiesta → approvazione → caparra (se serve) → conferma.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  Chat per singola prenotazione: niente messaggi persi, niente caos.
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  Reputazione semplice: i clienti seri ottengono meno attrito e più fiducia.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8">
          <SectionTitle
            kicker="ATTIVITÀ AL CENTRO"
            title="Ordine e controllo, senza perdere tempo"
            subtitle="Dashboard operativa: oggi / in attesa / prossime, azioni rapide e conferme. Regole e caparra configurabili."
          />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { t: 'Prenotazioni vere', d: 'Filtri, rischio cliente e caparra quando serve.' },
              { t: 'Regole chiare', d: 'Finestra cancellazione, approvazione auto/manuale.' },
              { t: 'Meno no-show', d: 'Reputazione e caparra intelligente riducono le assenze.' },
            ].map((x) => (
              <div key={x.t} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-semibold text-white">{x.t}</div>
                <div className="mt-2 text-sm text-white/70">{x.d}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12">
          <SectionTitle
            kicker="FAQ"
            title="Risposte rapide"
            subtitle="Trasparenza = fiducia. Le regole sono semplici e orientate alla realtà delle attività."
          />
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {faq.map((x) => (
              <div key={x.q} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-semibold text-white">{x.q}</div>
                <div className="mt-2 text-sm text-white/70">{x.a}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-semibold text-white">Pronto a ridurre i no-show?</div>
              <div className="mt-1 text-sm text-white/70">Imposta le regole una volta, poi lavori con ordine ogni giorno.</div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                to="/start?role=attivita"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#4F7CFF] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6A90FF]"
              >
                Inizia come attività
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login?mode=login"
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10',
                )}
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
