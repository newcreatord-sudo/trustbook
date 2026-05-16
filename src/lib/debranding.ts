export async function initDebranding(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const needles = ['TRAE SOLO']

  const shouldRemove = (el: Element): boolean => {
    const t = (el.textContent || '').toUpperCase()
    return needles.some((n) => t.includes(n))
  }

  const isFixedOrSticky = (el: Element): boolean => {
    try {
      const style = window.getComputedStyle(el)
      return style.position === 'fixed' || style.position === 'sticky'
    } catch {
      return false
    }
  }

  const pickTarget = (el: Element): Element => {
    let cur: Element | null = el
    for (let i = 0; i < 8 && cur; i++) {
      if (isFixedOrSticky(cur)) return cur
      cur = cur.parentElement
    }
    const root = el.getRootNode()
    if (root instanceof ShadowRoot && root.host && isFixedOrSticky(root.host)) return root.host
    return el
  }

  const hide = (el: Element) => {
    const target = pickTarget(el) as HTMLElement
    try {
      target.style.setProperty('display', 'none', 'important')
      target.style.setProperty('visibility', 'hidden', 'important')
      target.style.setProperty('pointer-events', 'none', 'important')
    } catch {}
  }

  const scan = (root: ParentNode) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
    let n = walker.nextNode() as Element | null
    while (n) {
      if (shouldRemove(n)) {
        hide(n)
      }
      try {
        const sr = (n as unknown as { shadowRoot?: ShadowRoot | null }).shadowRoot
        if (sr) scan(sr)
      } catch {}
      n = walker.nextNode() as Element | null
    }
  }

  const nukeBottomRightBadge = () => {
    try {
      const el = document.elementFromPoint(window.innerWidth - 12, window.innerHeight - 12)
      if (!el) return
      let cur: Element | null = el
      for (let i = 0; i < 12 && cur; i++) {
        if (isFixedOrSticky(cur)) {
          const r = cur.getBoundingClientRect()
          const looksLikeBadge =
            r.width > 80 &&
            r.width < 320 &&
            r.height > 20 &&
            r.height < 120 &&
            r.right > window.innerWidth - 20 &&
            r.bottom > window.innerHeight - 20
          if (looksLikeBadge) {
            hide(cur)
            return
          }
        }
        cur = cur.parentElement
      }
    } catch {}
  }

  try {
    if (document.body) scan(document.body)
  } catch {}

  try {
    nukeBottomRightBadge()
    window.setTimeout(nukeBottomRightBadge, 250)
    window.setTimeout(nukeBottomRightBadge, 1000)
    window.setTimeout(nukeBottomRightBadge, 2500)

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue
          const el = node as Element
          if (shouldRemove(el)) hide(el)
          scan(el)
        }
      }
      nukeBottomRightBadge()
    })
    obs.observe(document.documentElement, { childList: true, subtree: true })
  } catch {}
}
