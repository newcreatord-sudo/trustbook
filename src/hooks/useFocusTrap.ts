import { useEffect } from 'react'

/**
 * Traps keyboard focus inside the provided element until `active` is false.
 *
 * Behavior:
 *   - On mount with `active === true`, focuses the first focusable child.
 *   - Captures Tab / Shift+Tab to cycle within the modal.
 *   - On Escape, calls `onClose` if provided.
 *   - On unmount or when `active` becomes false, restores focus to the
 *     element that was active before the modal opened.
 *
 * Accessible modals require this behavior per WAI-ARIA APG dialog pattern.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onClose?: () => void,
): void {
  useEffect(() => {
    if (!active || !ref.current) return
    const node = ref.current
    const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null

    const FOCUSABLE_SELECTOR = [
      'a[href]',
      'area[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'iframe',
      'object',
      'embed',
      '[contenteditable="true"]',
      '[tabindex]:not([tabindex^="-"])',
    ].join(', ')

    const getFocusable = (): HTMLElement[] => {
      const list = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      return list.filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
    }

    const focusFirst = () => {
      const items = getFocusable()
      if (items.length > 0) {
        items[0].focus()
      } else {
        node.focus()
      }
    }

    focusFirst()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onClose) {
          e.preventDefault()
          onClose()
        }
        return
      }
      if (e.key !== 'Tab') return
      const items = getFocusable()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (current === first || !node.contains(current)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (current === last || !node.contains(current)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try {
          previouslyFocused.focus()
        } catch {
          /* ignore */
        }
      }
    }
  }, [active, ref, onClose])
}
