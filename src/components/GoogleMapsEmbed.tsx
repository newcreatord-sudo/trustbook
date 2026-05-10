type Props = {
  lat: number
  lng: number
  zoom?: number
  title?: string
  className?: string
}

export default function GoogleMapsEmbed(props: Props) {
  const q = `${props.lat},${props.lng}`
  const src = `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${encodeURIComponent(
    String(props.zoom ?? 14),
  )}&output=embed`

  return (
    <iframe
      title={props.title ?? 'Mappa'}
      className={props.className ?? 'h-full w-full'}
      src={src}
      loading="lazy"
      allowFullScreen
      referrerPolicy="no-referrer-when-downgrade"
    />
  )
}
