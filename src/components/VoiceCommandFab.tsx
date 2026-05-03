import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { browserSpeechRecognitionCtor, matchVoiceIntent, type VoiceNavContext } from '@/lib/voiceNavigation'
import { cn } from '@/lib/utils'
import { useToast } from '@/shared/ui/toastContext'

export default function VoiceCommandFab(props: { userId: string | null; profileRole: VoiceNavContext }) {
  const nav = useNavigate()
  const { push } = useToast()
  const [enabledPref, setEnabledPref] = useState(false)
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRecognition | null>(null)

  const envBypass = Boolean(
    typeof import.meta.env.VITE_VOICE_NAV === 'string' && import.meta.env.VITE_VOICE_NAV.trim() === '1',
  )

  useEffect(() => {
    if (!props.userId) return
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('voice_commands_enabled')
          .eq('user_id', props.userId)
          .maybeSingle()
        if (!mounted || error) return
        const row = data as { voice_commands_enabled?: boolean } | null
        setEnabledPref(Boolean(row?.voice_commands_enabled))
      } catch {
        /* ignore */
      }
    })()
    return () => {
      mounted = false
    }
  }, [props.userId])

  const active = envBypass || enabledPref

  const stop = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      /* ignore */
    }
    recRef.current = null
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Ctor = browserSpeechRecognitionCtor()
    if (!Ctor) {
      push({ tone: 'danger', title: 'Riconoscimento vocale non supportato da questo browser.' })
      return
    }
    stop()
    const rec = new Ctor()
    rec.lang = 'it-IT'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const text = ev.results[0]?.[0]?.transcript?.trim() ?? ''
      const intent = matchVoiceIntent(text, props.profileRole === 'unknown' ? 'cliente' : props.profileRole)
      if (intent) {
        push({ tone: 'success', title: `Voce: «${text}»`, description: intent.label })
        nav(intent.path)
      } else {
        push({
          tone: 'danger',
          title: 'Comando non riconosciuto',
          description: `«${text || '(vuoto)'}». Prova «Esplora» o «Prenotazioni».`,
        })
      }
      stop()
    }
    rec.onerror = () => {
      push({ tone: 'danger', title: 'Errore microfono o voce. Controlla i permessi.' })
      stop()
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
      push({ tone: 'success', title: 'Ascolto… parla ora.' })
    } catch {
      push({ tone: 'danger', title: 'Impossibile avviare il microfono.' })
      stop()
    }
  }, [nav, props.profileRole, push, stop])

  useEffect(() => () => stop(), [stop])

  if (!props.userId || !active) return null

  return (
    <button
      type="button"
      aria-label={listening ? 'Interrompi comando vocale' : 'Comando vocale'}
      title="Comandi vocali (beta)"
      onClick={() => (listening ? stop() : start())}
      className={cn(
        'fixed bottom-24 right-4 z-[80] flex h-14 w-14 items-center justify-center rounded-full border shadow-xl transition md:bottom-8 md:right-8',
        listening
          ? 'border-red-400/60 bg-red-500/25 text-red-100 animate-pulse'
          : 'border-white/15 bg-[#0B1220]/90 text-white/90 hover:bg-[#151d2e]',
      )}
    >
      {listening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
    </button>
  )
}
