import { useState } from 'react'

interface ProductImageProps {
  src: string | null
  alt: string
}

/** Foto do produto com alternativa elegante caso falte ou falhe a imagem. */
export function ProductImage({ src, alt }: ProductImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (!src || failedSrc === src) {
    return (
      <div className="product-image-fallback" role="img" aria-label={alt}>
        {alt.trim().charAt(0).toUpperCase() || 'Z'}
      </div>
    )
  }

  return <img src={src} alt={alt} loading="lazy" onError={() => setFailedSrc(src)} />
}
