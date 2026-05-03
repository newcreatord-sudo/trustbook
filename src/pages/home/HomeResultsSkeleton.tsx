import Skeleton from '@/shared/ui/Skeleton'

export default function HomeResultsSkeleton(props: { rows?: number }) {
  const rows = Math.max(3, props.rows ?? 6)
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-2xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <div className="space-y-2 text-right">
              <Skeleton className="ml-auto h-3 w-28" />
              <Skeleton className="ml-auto h-3 w-24" />
              <Skeleton className="ml-auto h-6 w-24 rounded-xl" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-32 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  )
}

