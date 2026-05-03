import { supabase } from '@/lib/supabase'

export type UploadedMedia = { path: string; publicUrl: string }
export type UploadedPrivateMedia = { bucket: 'business-private'; path: string }

function extFromFile(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (fromName && fromName.length <= 5) return fromName
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

export async function uploadBusinessMedia(params: {
  businessId: string
  file: File
  kind: 'logo' | 'gallery'
}): Promise<UploadedMedia> {
  const ext = extFromFile(params.file)
  const stamp = Date.now()
  const key = params.kind === 'logo' ? `logo-${stamp}.${ext}` : `gallery-${stamp}.${ext}`
  const path = `${params.businessId}/${key}`

  const { error } = await supabase.storage
    .from('business-media')
    .upload(path, params.file, {
      upsert: true,
      cacheControl: '3600',
      contentType: params.file.type || undefined,
    })
  if (error) throw error

  const { data } = supabase.storage.from('business-media').getPublicUrl(path)
  const publicUrl = data.publicUrl
  return { path, publicUrl }
}

export async function uploadBusinessPrivateMedia(params: {
  businessId: string
  file: File
  key: string
}): Promise<UploadedPrivateMedia> {
  const ext = extFromFile(params.file)
  const stamp = Date.now()
  const safeKey = params.key.replace(/^\//, '')
  const key = safeKey.includes('.') ? safeKey : `${safeKey}-${stamp}.${ext}`
  const path = `${params.businessId}/${key}`

  const { error } = await supabase.storage
    .from('business-private')
    .upload(path, params.file, {
      upsert: true,
      cacheControl: '3600',
      contentType: params.file.type || undefined,
    })
  if (error) throw error

  return { bucket: 'business-private', path }
}

export async function createBusinessPrivateSignedUrl(params: {
  path: string
  expiresIn: number
}): Promise<string> {
  const { data, error } = await supabase.storage
    .from('business-private')
    .createSignedUrl(params.path, params.expiresIn)
  if (error) throw error
  const signedUrl = data?.signedUrl
  if (!signedUrl) throw new Error('signed_url_missing')
  return signedUrl
}
