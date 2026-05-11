/**
 * AI Agent — bounded conversational endpoint.
 *
 * POST /api/ai/agent — accepts a prompt + tool scope, validates budget, then
 * either calls the configured LLM provider (OPENAI_API_KEY or
 * ANTHROPIC_API_KEY) or returns a structured `unavailable` payload that the
 * client can render gracefully.
 *
 * Why we don't expose a streaming SSE channel yet: provider keys are still in
 * staging; first iteration is request/response with a hard timeout. The
 * `ai_agent_runs` table records every call for auditing and cost tracking.
 *
 * The endpoint never executes arbitrary SQL or destructive operations.
 * `tool_scope` whitelisted values are: 'help', 'suggest_action',
 * 'explain_status'. Anything else is rejected.
 */

import express from 'express'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { logEvent, captureBackendException } from '../lib/observability.js'

const router: express.Router = express.Router()

const ALLOWED_SCOPES = new Set(['help', 'suggest_action', 'explain_status'])
const MAX_PROMPT_CHARS = 4000
const HARD_TIMEOUT_MS = 25_000

function getUserScopedClient(authHeader: string | undefined) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key || !authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return null
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

router.post('/agent', async (req, res) => {
  const startedAt = Date.now()
  let runId: string | null = null
  let userId: string | null = null
  try {
    const sb = getUserScopedClient(req.headers.authorization)
    if (!sb) {
      res.status(401).json({ success: false, error: 'unauthorized' })
      return
    }
    const { data: userData } = await sb.auth.getUser()
    if (!userData?.user) {
      res.status(401).json({ success: false, error: 'unauthorized' })
      return
    }
    userId = userData.user.id

    const { prompt, toolScope, businessId, context } = req.body ?? {}
    if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > MAX_PROMPT_CHARS) {
      res.status(400).json({ success: false, error: 'invalid_prompt' })
      return
    }
    if (typeof toolScope !== 'string' || !ALLOWED_SCOPES.has(toolScope)) {
      res.status(400).json({ success: false, error: 'invalid_tool_scope' })
      return
    }

    // Budget check via DB function.
    const { error: budgetErr } = await sb.rpc('assert_ai_run_budget', { p_user: userId, p_max: 3 })
    if (budgetErr) {
      res.status(429).json({ success: false, error: budgetErr.message || 'ai_run_budget_exceeded' })
      return
    }

    const promptHash = createHash('sha256').update(`${toolScope}\n${prompt}`).digest('hex').slice(0, 32)
    const model = process.env.AI_AGENT_MODEL ?? 'auto'

    const { data: run, error: runErr } = await sb
      .from('ai_agent_runs')
      .insert({
        business_id: typeof businessId === 'string' ? businessId : null,
        user_id: userId,
        tool_scope: toolScope,
        model,
        prompt_hash: promptHash,
        request_payload: { prompt: prompt.slice(0, MAX_PROMPT_CHARS), context: context ?? null },
        status: 'running',
        request_id: (req as unknown as { requestId?: string }).requestId ?? null,
      })
      .select('id')
      .single()
    if (runErr || !run) {
      res.status(500).json({ success: false, error: 'run_create_failed' })
      return
    }
    runId = (run as { id: string }).id

    const provider = pickProvider()
    if (!provider) {
      await markRun(sb, runId, 'failed', { error_message: 'no_provider', duration_ms: Date.now() - startedAt })
      res.status(503).json({
        success: false,
        unavailable: true,
        error: 'ai_provider_unavailable',
        hint: 'Configura OPENAI_API_KEY o ANTHROPIC_API_KEY per abilitare l\'agente.',
      })
      return
    }

    const completion = await provider.complete({ prompt, toolScope, signal: AbortSignal.timeout(HARD_TIMEOUT_MS) })
    if (completion.ok === false) {
      await markRun(sb, runId, 'failed', {
        error_message: completion.error,
        duration_ms: Date.now() - startedAt,
        response_payload: completion.raw ?? null,
      })
      res.status(502).json({ success: false, error: completion.error })
      return
    }

    await markRun(sb, runId, 'succeeded', {
      response_payload: { text: completion.text, raw: completion.raw },
      duration_ms: Date.now() - startedAt,
      prompt_tokens: completion.promptTokens ?? null,
      completion_tokens: completion.completionTokens ?? null,
      cost_cents: completion.costCents ?? null,
    })

    res.status(200).json({
      success: true,
      runId,
      text: completion.text,
      toolScope,
      provider: provider.name,
    })
  } catch (e) {
    captureBackendException(e, { route: '/api/ai/agent', userId, runId })
    if (runId) {
      const sb = getUserScopedClient(req.headers.authorization)
      if (sb) await markRun(sb, runId, 'failed', { error_message: 'server_error', duration_ms: Date.now() - startedAt })
    }
    res.status(500).json({ success: false, error: 'server_error' })
  }
})

type Provider = {
  name: 'openai' | 'anthropic'
  complete(input: { prompt: string; toolScope: string; signal: AbortSignal }): Promise<CompletionResult>
}

type CompletionResult =
  | { ok: true; text: string; promptTokens?: number; completionTokens?: number; costCents?: number; raw?: unknown }
  | { ok: false; error: string; raw?: unknown }

function pickProvider(): Provider | null {
  if (process.env.OPENAI_API_KEY) return openAiProvider(process.env.OPENAI_API_KEY)
  if (process.env.ANTHROPIC_API_KEY) return anthropicProvider(process.env.ANTHROPIC_API_KEY)
  return null
}

function systemPromptFor(toolScope: string): string {
  const base = 'Sei un assistente esperto per attività di servizi locali in Italia. Risposte concise, senza marketing, in italiano. Non promettere azioni che non puoi compiere.'
  switch (toolScope) {
    case 'help':
      return `${base} Aiuta l'utente con domande operative su TrustBook.`
    case 'suggest_action':
      return `${base} Suggerisci una sola azione concreta basata sui dati forniti. Massimo 4 frasi.`
    case 'explain_status':
      return `${base} Spiega lo stato della prenotazione in modo chiaro al cliente. Massimo 3 frasi.`
    default:
      return base
  }
}

function openAiProvider(apiKey: string): Provider {
  return {
    name: 'openai',
    async complete({ prompt, toolScope, signal }) {
      try {
        const body = {
          model: process.env.AI_AGENT_MODEL || 'gpt-4o-mini',
          temperature: 0.2,
          max_tokens: 600,
          messages: [
            { role: 'system', content: systemPromptFor(toolScope) },
            { role: 'user', content: prompt },
          ],
        }
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
          signal,
        })
        const data = (await resp.json().catch(() => null)) as
          | {
              choices?: Array<{ message?: { content?: string } }>
              usage?: { prompt_tokens?: number; completion_tokens?: number }
              error?: { message?: string }
            }
          | null
        if (!resp.ok) return { ok: false, error: data?.error?.message ?? `openai_http_${resp.status}`, raw: data }
        const text = data?.choices?.[0]?.message?.content ?? ''
        if (!text) return { ok: false, error: 'empty_completion', raw: data }
        return {
          ok: true,
          text,
          promptTokens: data?.usage?.prompt_tokens,
          completionTokens: data?.usage?.completion_tokens,
          raw: data,
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'fetch_failed' }
      }
    },
  }
}

function anthropicProvider(apiKey: string): Provider {
  return {
    name: 'anthropic',
    async complete({ prompt, toolScope, signal }) {
      try {
        const body = {
          model: process.env.AI_AGENT_MODEL || 'claude-3-5-sonnet-latest',
          max_tokens: 600,
          system: systemPromptFor(toolScope),
          messages: [{ role: 'user', content: prompt }],
        }
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal,
        })
        const data = (await resp.json().catch(() => null)) as
          | { content?: Array<{ type?: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } }
          | null
        if (!resp.ok) return { ok: false, error: data?.error?.message ?? `anthropic_http_${resp.status}`, raw: data }
        const text = (data?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim()
        if (!text) return { ok: false, error: 'empty_completion', raw: data }
        return {
          ok: true,
          text,
          promptTokens: data?.usage?.input_tokens,
          completionTokens: data?.usage?.output_tokens,
          raw: data,
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'fetch_failed' }
      }
    },
  }
}

async function markRun(
  sb: ReturnType<typeof getUserScopedClient>,
  runId: string,
  status: 'succeeded' | 'failed' | 'cancelled',
  patch: Record<string, unknown>,
) {
  if (!sb) return
  try {
    await sb
      .from('ai_agent_runs')
      .update({ status, completed_at: new Date().toISOString(), ...patch })
      .eq('id', runId)
  } catch (e) {
    logEvent('warn', 'ai_run_mark_failed', { runId, message: e instanceof Error ? e.message : String(e) })
  }
}

export default router
