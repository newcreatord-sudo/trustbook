export async function initDebranding(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const needles = ['TRAE SOLO']

  const shouldRemove = (el: Element): boolean => {
    const t = (el.textContent || '').toUpperCase()
    return needles.some((n) => t.includes(n))
  }

  const pickTarget = (el: Element): Element => {
    let cur: Element | null = el
    for (let i = 0; i < 8 && cur; i++) {
      try {
        const style = window.getComputedStyle(cur)
        if (style.position === 'fixed' || style.position === 'sticky') return cur
      } catch {}
      cur = cur.parentElement
    }
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
      n = walker.nextNode() as Element | null
    }
  }

  try {
    if (document.body) scan(document.body)
  } catch {}

  try {
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue
          const el = node as Element
          if (shouldRemove(el)) hide(el)
          scan(el)
        }
      }
    })
    obs.observe(document.documentElement, { childList: true, subtree: true })
  } catch {}
}

