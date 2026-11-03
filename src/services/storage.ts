import { requireSupabase } from '../lib/supabase'

/** Bucket público que guarda APENAS imagens do catálogo. */
export const PRODUCT_IMAGE_BUCKET = 'product-images'

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

function extensionFor(file: File): string {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

/**
 * Valida formato e tamanho no navegador antes do upload.
 * Retorna a mensagem de erro, ou null se o arquivo é aceitável.
 * (O bucket também impõe os mesmos limites no servidor.)
 */
export function validateProductImage(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'Formato não aceito. Envie uma imagem JPEG, PNG ou WebP.'
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'A imagem é maior que 5 MB. Envie um arquivo menor.'
  }
  return null
}

export interface UploadedImage {
  /** URL pública para exibir a foto. */
  publicUrl: string
  /** Caminho no bucket, para substituição/exclusão posterior. */
  path: string
}

/**
 * Envia a foto de um produto ao Supabase Storage.
 * As políticas do bucket permitem escrita somente a administradores.
 */
export async function uploadProductImage(file: File): Promise<UploadedImage> {
  const validationError = validateProductImage(file)
  if (validationError) throw new Error(validationError)

  const supabase = requireSupabase()
  const path = `produtos/${crypto.randomUUID()}.${extensionFor(file)}`

  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })
  if (error) throw new Error(error.message)

  const { data } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl, path }
}

/** Remove uma foto do bucket (somente administradores, via políticas do Storage). */
export async function deleteProductImage(path: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path])
  if (error) throw new Error(error.message)
}
