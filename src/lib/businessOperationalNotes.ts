import { supabase } from '@/lib/supabase'

export type BusinessOperationalNoteRow = {
  id: string
  business_id: string
  title: string | null
  body: string
  tags: string[]
  pinned: boolean
  agent_id: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export async function listBusinessOperationalNotes(params: { businessId: string; limit?: number }): Promise<BusinessOperationalNoteRow[]> {
  const { data, error } = await supabase.rpc('list_business_operational_notes', {
    p_business_id: params.businessId,
    p_limit: params.limit ?? 50,
  })
  if (error) throw error
  return (data as BusinessOperationalNoteRow[]) ?? []
}

export async function upsertBusinessOperationalNote(params: {
  businessId: string
  noteId?: string | null
  title?: string | null
  body: string
  tags?: string[]
  pinned?: boolean
}): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_business_operational_note', {
    p_business_id: params.businessId,
    p_note_id: params.noteId ?? null,
    p_title: params.title ?? null,
    p_body: params.body,
    p_tags: params.tags ?? [],
    p_pinned: params.pinned ?? false,
    p_agent_id: null,
  })
  if (error) throw error
  return data as string
}

export async function deleteBusinessOperationalNote(params: { businessId: string; noteId: string }): Promise<void> {
  const { error } = await supabase.rpc('delete_business_operational_note', {
    p_business_id: params.businessId,
    p_note_id: params.noteId,
    p_agent_id: null,
  })
  if (error) throw error
}

