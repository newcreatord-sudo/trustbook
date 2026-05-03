import { MessageSquareText, ShieldCheck, Wallet } from 'lucide-react'
import Card from '@/shared/ui/Card'

export default function TrustStrip() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Card padded={false} className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/5">
            <ShieldCheck className="h-4 w-4 text-white/80" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Regole chiare</div>
            <div className="mt-1 text-sm text-white/70">Richiesta → approvazione → caparra (se serve) → conferma.</div>
          </div>
        </div>
      </Card>

      <Card padded={false} className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/5">
            <Wallet className="h-4 w-4 text-white/80" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Caparra intelligente</div>
            <div className="mt-1 text-sm text-white/70">Fissa o percentuale con min/max, solo quando ha senso.</div>
          </div>
        </div>
      </Card>

      <Card padded={false} className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/5">
            <MessageSquareText className="h-4 w-4 text-white/80" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Chat per prenotazione</div>
            <div className="mt-1 text-sm text-white/70">Un solo thread per prenotazione: meno caos, più contesto.</div>
          </div>
        </div>
      </Card>
    </div>
  )
}

