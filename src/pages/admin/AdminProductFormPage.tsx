import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ImagePlus, Save, Trash2 } from 'lucide-react'
import { Alert } from '../../components/Alert'
import { LoadingScreen } from '../../components/LoadingScreen'
import { ProductImage } from '../../components/ProductImage'
import { centsToInput, inputToCents } from '../../lib/format'
import { isValidSlug, slugify } from '../../lib/slug'
import {
  createCategory,
  createProduct,
  getProductById,
  listCategories,
  updateProduct,
  type ProductInput,
} from '../../services/catalog'
import {
  deleteProductImage,
  uploadProductImage,
  validateProductImage,
  type UploadedImage,
} from '../../services/storage'
import type { Category, Product } from '../../types/database'

interface ParsedValues {
  priceCents: number
  stock: number
}

export function AdminProductFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [product, setProduct] = useState<Product | null>(null)
  const [categories, setCategories] = useState<Category[]>([])

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [priceInput, setPriceInput] = useState('')
  const [stockInput, setStockInput] = useState('0')
  const [isActive, setIsActive] = useState(true)

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      listCategories(),
      id ? getProductById(id) : Promise.resolve<Product | null>(null),
    ])
      .then(([loadedCategories, loadedProduct]) => {
        if (!active) return
        setCategories(loadedCategories)
        if (id) {
          if (!loadedProduct) {
            setLoadError('Produto não encontrado. Ele pode ter sido excluído.')
            return
          }
          setProduct(loadedProduct)
          setName(loadedProduct.name)
          setSlug(loadedProduct.slug)
          setSlugTouched(true)
          setDescription(loadedProduct.description ?? '')
          setCategoryId(loadedProduct.category_id ?? '')
          setPriceInput(centsToInput(loadedProduct.price_cents))
          setStockInput(String(loadedProduct.stock))
          setIsActive(loadedProduct.is_active)
        }
      })
      .catch(() => {
        if (active) setLoadError('Não foi possível carregar os dados do formulário.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  // Revoga a URL temporária da prévia quando ela muda ou a página desmonta.
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  const displayedImage = imagePreview ?? (removeImage ? null : (product?.image_url ?? null))

  function handleNameChange(value: string) {
    setName(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  function handleFileChange(file: File | undefined) {
    if (!file) return
    const validationError = validateProductImage(file)
    if (validationError) {
      setFieldErrors((prev) => ({ ...prev, image: validationError }))
      return
    }
    setFieldErrors((prev) => ({ ...prev, image: '' }))
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setRemoveImage(false)
  }

  function validate(): ParsedValues | null {
    const errors: Record<string, string> = {}

    if (name.trim().length < 2) errors.name = 'Informe o nome do produto (mínimo 2 letras).'
    if (name.trim().length > 120) errors.name = 'O nome pode ter no máximo 120 caracteres.'

    if (!slug.trim()) errors.slug = 'Informe o slug (ele aparece no endereço da página).'
    else if (!isValidSlug(slug.trim()))
      errors.slug = 'Use apenas letras minúsculas, números e hífens (ex.: fone-sem-fio).'

    if (description.length > 2000)
      errors.description = 'A descrição pode ter no máximo 2000 caracteres.'

    const priceCents = inputToCents(priceInput)
    if (priceCents === null) errors.price = 'Informe um preço válido, como 349,90.'

    let stock = 0
    if (!/^\d+$/.test(stockInput.trim())) {
      errors.stock = 'O estoque deve ser um número inteiro (0 ou mais).'
    } else {
      stock = Number(stockInput.trim())
      if (stock > 1000000) errors.stock = 'O estoque máximo é 1.000.000 unidades.'
    }

    if (newCategoryName.trim() && slugify(newCategoryName) === '') {
      errors.newCategory = 'O nome da nova categoria precisa ter letras ou números.'
    }

    setFieldErrors((prev) => ({ ...errors, image: prev.image ?? '' }))
    if (Object.keys(errors).length > 0 || priceCents === null) return null
    return { priceCents, stock }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = validate()
    if (!parsed) return

    setSaving(true)
    setFormError(null)

    // Categoria nova (se preenchida) é criada primeiro.
    let finalCategoryId: string | null = categoryId || null
    if (newCategoryName.trim()) {
      try {
        const created = await createCategory(newCategoryName)
        finalCategoryId = created.id
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        setFieldErrors((prev) => ({
          ...prev,
          newCategory: /duplicate key|unique/i.test(message)
            ? 'Já existe uma categoria parecida. Selecione-a na lista acima.'
            : 'Não foi possível criar a categoria.',
        }))
        setSaving(false)
        return
      }
    }

    let uploaded: UploadedImage | null = null
    try {
      const oldImagePath = product?.image_path ?? null
      let imageUrl = product?.image_url ?? null
      let imagePath = product?.image_path ?? null

      if (imageFile) {
        uploaded = await uploadProductImage(imageFile)
        imageUrl = uploaded.publicUrl
        imagePath = uploaded.path
      } else if (removeImage) {
        imageUrl = null
        imagePath = null
      }

      const payload: ProductInput = {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        category_id: finalCategoryId,
        price_cents: parsed.priceCents,
        stock: parsed.stock,
        image_url: imageUrl,
        image_path: imagePath,
        is_active: isActive,
      }

      if (isEditing && product) {
        await updateProduct(product.id, payload)
      } else {
        await createProduct(payload)
      }

      // Remove a foto antiga do Storage quando ela foi trocada ou removida.
      if ((imageFile || removeImage) && oldImagePath && oldImagePath !== imagePath) {
        await deleteProductImage(oldImagePath).catch(() => {})
      }

      navigate('/admin/produtos', {
        state: {
          notice: isEditing
            ? `Produto “${payload.name}” atualizado.`
            : `Produto “${payload.name}” criado.`,
        },
      })
    } catch (err) {
      // Se algo falhou depois do upload, não deixa arquivo órfão no bucket.
      if (uploaded) await deleteProductImage(uploaded.path).catch(() => {})
      const message = err instanceof Error ? err.message : ''
      if (/duplicate key|unique/i.test(message) && /slug/i.test(message)) {
        setFieldErrors((prev) => ({
          ...prev,
          slug: 'Já existe um produto com este slug. Escolha outro.',
        }))
      } else {
        setFormError(message || 'Não foi possível salvar o produto.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingScreen message="Carregando formulário…" />
  if (loadError) {
    return (
      <div>
        <Alert variant="error">{loadError}</Alert>
        <Link to="/admin/produtos" className="btn btn-outline">
          Voltar para produtos
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h2 style={{ fontSize: '1.3rem', marginBottom: 16 }}>
        {isEditing ? `Editar: ${product?.name ?? ''}` : 'Novo produto'}
      </h2>

      {formError ? <Alert variant="error">{formError}</Alert> : null}

      <div className="product-form-grid">
        <section className="card">
          <div className="field">
            <label htmlFor="nome">Nome do produto *</label>
            <input
              id="nome"
              className="input"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ex.: Fone Bluetooth Zeik Pulse Pro"
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? <span className="field-error">{fieldErrors.name}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="slug">Slug (endereço da página) *</label>
            <input
              id="slug"
              className="input"
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value)
                setSlugTouched(true)
              }}
              placeholder="fone-bluetooth-pulse-pro"
              aria-invalid={Boolean(fieldErrors.slug)}
            />
            {fieldErrors.slug ? (
              <span className="field-error">{fieldErrors.slug}</span>
            ) : (
              <span className="field-hint">
                Ficará em <strong>/produto/{slug || '…'}</strong>. Gerado do nome; pode ajustar.
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="descricao">Descrição</label>
            <textarea
              id="descricao"
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o produto, recursos e o que acompanha…"
              aria-invalid={Boolean(fieldErrors.description)}
            />
            {fieldErrors.description ? (
              <span className="field-error">{fieldErrors.description}</span>
            ) : (
              <span className="field-hint">{description.length}/2000 caracteres</span>
            )}
          </div>

          <div className="form-2col">
            <div className="field">
              <label htmlFor="categoria">Categoria</label>
              <select
                id="categoria"
                className="select"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={Boolean(newCategoryName.trim())}
              >
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="nova-categoria">Ou criar categoria nova</label>
              <input
                id="nova-categoria"
                className="input"
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Ex.: Games"
                aria-invalid={Boolean(fieldErrors.newCategory)}
              />
              {fieldErrors.newCategory ? (
                <span className="field-error">{fieldErrors.newCategory}</span>
              ) : (
                <span className="field-hint">Se preencher, ela é criada ao salvar.</span>
              )}
            </div>

            <div className="field">
              <label htmlFor="preco">Preço (R$) *</label>
              <input
                id="preco"
                className="input"
                type="text"
                inputMode="decimal"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="349,90"
                aria-invalid={Boolean(fieldErrors.price)}
              />
              {fieldErrors.price ? (
                <span className="field-error">{fieldErrors.price}</span>
              ) : (
                <span className="field-hint">Use vírgula nos centavos. Guardado em centavos no banco.</span>
              )}
            </div>

            <div className="field">
              <label htmlFor="estoque">Estoque (unidades) *</label>
              <input
                id="estoque"
                className="input"
                type="text"
                inputMode="numeric"
                value={stockInput}
                onChange={(e) => setStockInput(e.target.value)}
                placeholder="0"
                aria-invalid={Boolean(fieldErrors.stock)}
              />
              {fieldErrors.stock ? <span className="field-error">{fieldErrors.stock}</span> : null}
            </div>
          </div>

          <div className="switch-row">
            <span>
              <strong>Produto ativo na vitrine</strong>
              <br />
              <span className="small muted">
                Desativado, ele some da loja sem apagar o histórico de pedidos.
              </span>
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                aria-label="Produto ativo na vitrine"
              />
              <span className="switch-track" />
            </label>
          </div>
        </section>

        <section className="card" aria-labelledby="foto-titulo">
          <h3 id="foto-titulo" style={{ fontSize: '1.05rem', marginBottom: 12 }}>
            Foto do produto
          </h3>

          <div className="image-drop">
            <div className="preview">
              <ProductImage src={displayedImage} alt={name || 'Foto do produto'} />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                handleFileChange(e.target.files?.[0])
                e.target.value = ''
              }}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={16} aria-hidden />
                {displayedImage ? 'Trocar foto' : 'Enviar foto'}
              </button>
              {displayedImage ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setImageFile(null)
                    setImagePreview(null)
                    setRemoveImage(true)
                  }}
                >
                  <Trash2 size={16} aria-hidden />
                  Remover
                </button>
              ) : null}
            </div>

            {imageFile ? (
              <p className="small muted" style={{ marginTop: 10 }}>
                Nova foto: <strong>{imageFile.name}</strong> (será enviada ao salvar)
              </p>
            ) : product?.image_path && !removeImage ? (
              <p className="small muted" style={{ marginTop: 10 }}>
                Foto atual vinda do Supabase Storage (bucket <code>product-images</code>).
              </p>
            ) : null}

            {fieldErrors.image ? (
              <p className="field-error" style={{ marginTop: 10 }}>
                {fieldErrors.image}
              </p>
            ) : (
              <p className="small muted" style={{ marginTop: 10 }}>
                Formatos: JPEG, PNG ou WebP, até 5 MB. O bucket impõe os mesmos
                limites no servidor.
              </p>
            )}
          </div>
        </section>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          marginTop: 22,
        }}
      >
        <Link to="/admin/produtos" className="btn btn-outline">
          Cancelar
        </Link>
        <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
          {saving ? (
            <>
              <span className="spinner" aria-hidden />
              Salvando…
            </>
          ) : (
            <>
              <Save size={18} aria-hidden />
              {isEditing ? 'Salvar alterações' : 'Criar produto'}
            </>
          )}
        </button>
      </div>
    </form>
  )
}
