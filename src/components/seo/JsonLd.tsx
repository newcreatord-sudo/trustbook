import { useEffect } from 'react'

type Props = {
  /**
   * Either a single JSON-LD object or an array of @graph nodes. Each is
   * stringified independently and rendered as <script type="application/ld+json">.
   */
  data: object | object[]
  /** Optional DOM id used so repeated renders replace the previous tag instead of stacking. */
  id?: string
}

/**
 * Injects a JSON-LD script into <head>. Removed on unmount.
 *
 * Why not just render `<script>` inside a React tree: most React renderers
 * silently strip <script> elements inside body for security, breaking
 * structured data. Mounting to <head> via a side effect is the supported pattern.
 *
 * Schema helpers: `@/components/seo/jsonLdSchema`
 */
export default function JsonLd({ data, id }: Props) {
  useEffect(() => {
    const items = Array.isArray(data) ? data : [data]
    const elements: HTMLScriptElement[] = []
    items.forEach((item, idx) => {
      const el = document.createElement('script')
      el.type = 'application/ld+json'
      el.dataset.tbJsonLd = id ?? `auto-${idx}`
      el.textContent = JSON.stringify(item, null, 2)
      document.head.appendChild(el)
      elements.push(el)
    })
    return () => {
      for (const el of elements) {
        if (el.parentNode) el.parentNode.removeChild(el)
      }
    }
  }, [data, id])
  return null
}
