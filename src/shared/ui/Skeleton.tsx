import { cn } from '@/lib/utils'

export default function Skeleton(props: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl border border-white/10 bg-white/5', props.className)} />
}

