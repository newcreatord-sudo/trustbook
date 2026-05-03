import { Lock } from 'lucide-react'

export default function OwnerOnlyPanel(props: { title: string; subtitle?: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Lock className="h-4 w-4" />
        {props.title}
      </div>
      <div className="mt-2 text-sm text-white/70">{props.subtitle ?? 'Solo l’owner può accedere.'}</div>
    </div>
  )
}

