export default function FullScreenLoader(props: { title?: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-5xl items-center justify-center px-4">
      <div className="tb-card w-full max-w-md p-6">
        <div className="text-sm font-semibold text-white">{props.title ?? 'Caricamento…'}</div>
        {props.subtitle && <div className="mt-1 text-sm text-white/70">{props.subtitle}</div>}
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-2/5 rounded-full bg-[#4F7CFF] animate-pulse" />
        </div>
        {props.action}
      </div>
    </div>
  )
}

