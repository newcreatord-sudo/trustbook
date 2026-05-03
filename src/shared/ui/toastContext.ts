import { createContext, useContext } from 'react'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export type ToastItem = {
  id: string
  tone: ToastTone
  title: string
  description?: string
  createdAt: number
}

export type ToastContextValue = {
  push: (t: Omit<ToastItem, 'id' | 'createdAt'> & { id?: string; ttlMs?: number }) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

