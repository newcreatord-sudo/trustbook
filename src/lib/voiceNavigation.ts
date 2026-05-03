/**
 * Navigazione vocale (browser Web Speech API). Non sostituisce conferme legali/depositi:
 * solo shortcut verso schermate principali.
 */

export type VoiceNavContext = 'cliente' | 'attivita' | 'unknown'

export function browserSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function matchVoiceIntent(
  transcript: string,
  ctx: VoiceNavContext,
): { path: string; label: string } | null {
  const t = transcript
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const has = (...words: string[]) => words.some((w) => t.includes(w))

  if (ctx === 'cliente') {
    if (has('esplora', 'cerca attivita', 'trova')) return { path: '/esplora', label: 'Esplora' }
    if (has('prenotazioni', 'le mie prenotazioni', 'appuntamenti')) return { path: '/prenotazioni', label: 'Prenotazioni' }
    if (has('profilo')) return { path: '/profilo', label: 'Profilo' }
    if (has('home', 'inizio')) return { path: '/', label: 'Home' }
    if (has('dashboard cliente', 'la mia area', 'area cliente')) return { path: '/dashboard-cliente', label: 'Area cliente' }
  }

  if (ctx === 'attivita') {
    if (has('dashboard', 'area attivita', 'la mia attivita')) return { path: '/dashboard-attivita', label: 'Dashboard attività' }
    if (has('calendario', 'agenda')) return { path: '/dashboard-attivita', label: 'Dashboard (usa tab Calendario)' }
    if (has('impostazioni')) return { path: '/dashboard-attivita', label: 'Dashboard (tab Impostazioni)' }
    if (has('onboarding')) return { path: '/onboarding-attivita', label: 'Onboarding' }
  }

  return null
}
