import Button from '@/shared/ui/Button'
import Card from '@/shared/ui/Card'

export default function HomeSuggestions(props: {
  totalBusinesses: number
  totalCategories: number
  favoriteCount: number
  topCategories: string[]
  onPickCategory: (category: string) => void
  onUseLocation: () => void
  onReset: () => void
  featuredFavoriteName: string | null
  onOpenFavorite: () => void
  featuredTopName: string | null
  onOpenTop: () => void
}) {
  return (
    <Card padded={false} className="p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="tb-kicker">SUGGERIMENTI</div>
          <div className="mt-1 text-sm font-semibold text-white">Inizia più velocemente</div>
          <div className="mt-1 text-xs text-white/70">Usa scorciatoie intelligenti per trovare subito l’attività giusta.</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs text-white/70">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-sm font-semibold text-white">{props.totalBusinesses}</div>
            <div>Attività</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-sm font-semibold text-white">{props.totalCategories}</div>
            <div>Categorie</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-sm font-semibold text-white">{props.favoriteCount}</div>
            <div>Preferiti</div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {props.topCategories.map((cat) => (
          <Button key={cat} type="button" variant="secondary" size="sm" onClick={() => props.onPickCategory(cat)}>
            {cat}
          </Button>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={props.onUseLocation}>
          Vicino a me
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={props.onReset}>
          Reset
        </Button>
        {props.featuredFavoriteName ? (
          <Button type="button" variant="primary" size="sm" onClick={props.onOpenFavorite}>
            Preferito: {props.featuredFavoriteName}
          </Button>
        ) : null}
        {props.featuredTopName ? (
          <Button type="button" variant="primary" size="sm" onClick={props.onOpenTop}>
            Top valutata: {props.featuredTopName}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

