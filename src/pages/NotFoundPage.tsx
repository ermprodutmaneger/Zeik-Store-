import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'

export function NotFoundPage() {
  return (
    <div className="container page">
      <EmptyState
        icon={<Compass size={30} />}
        title="Página não encontrada"
        description="O endereço que você abriu não existe na Zeik Store. Que tal voltar para a vitrine?"
        action={
          <Link to="/" className="btn btn-primary">
            Ir para a página inicial
          </Link>
        }
      />
    </div>
  )
}
