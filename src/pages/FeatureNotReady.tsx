import { Link } from 'react-router-dom'
import { Construction, ArrowLeft } from 'lucide-react'

type Props = {
  title?: string
  description?: string
  backTo?: string
}

export default function FeatureNotReady(props: Props) {
  const title = props.title ?? 'Funzione non ancora disponibile'
  const description =
    props.description ??
    'Questa funzionalità è in fase di stabilizzazione. Il team ha già registrato la richiesta.'
  const backTo = props.backTo ?? '/dashboard-attivita'

  return (
    <div className="tb-page flex min-h-[70vh] items-center justify-center px-4">
      <div className="tb-card w-full max-w-xl p-6">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-amber-200">
          <Construction className="h-5 w-5" />
        </div>
        <div className="mt-4 text-lg font-semibold text-white">{title}</div>
        <div className="mt-2 text-sm text-white/70">{description}</div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link to={backTo} className="tb-btn tb-btn-primary inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Torna alla dashboard
          </Link>
          <Link to="/impostazioni" className="tb-btn tb-btn-secondary">
            Apri impostazioni
          </Link>
        </div>
      </div>
    </div>
  )
}
