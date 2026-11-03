import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Menu, Search, ShoppingCart, User, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'

export function Header() {
  const { user, profile, isAdmin } = useAuth()
  const { totalItems } = useCart()
  const navigate = useNavigate()
  const location = useLocation()
  // O menu guarda a rota em que foi aberto; ao navegar, ele fecha sozinho
  // (estado derivado, sem efeito sincronizando).
  const [menuOpenAtPath, setMenuOpenAtPath] = useState<string | null>(null)
  const menuOpen = menuOpenAtPath === location.pathname
  const [search, setSearch] = useState('')

  const firstName = profile?.full_name?.trim().split(' ')[0] || ''

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const term = search.trim()
    navigate(term ? `/?busca=${encodeURIComponent(term)}` : '/')
    setMenuOpenAtPath(null)
  }

  const closeMenu = () => setMenuOpenAtPath(null)

  const searchField = (id: string) => (
    <form onSubmit={submitSearch} role="search">
      <div className="input-with-icon">
        <Search size={18} aria-hidden />
        <label className="sr-only" htmlFor={id}>
          Buscar produtos
        </label>
        <input
          id={id}
          className="input"
          type="search"
          placeholder="Buscar produtos…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
    </form>
  )

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="logo" aria-label="Zeik Store — página inicial">
          <span className="logo-zeik">Zeik</span>
          <span>Store</span>
        </Link>

        <div className="header-search">{searchField('busca-desktop')}</div>

        <nav className="header-actions" aria-label="Navegação principal">
          {isAdmin ? (
            <Link to="/admin" className="header-link">
              <LayoutDashboard size={18} aria-hidden />
              Painel
            </Link>
          ) : null}

          <Link to={user ? '/conta' : '/entrar'} className="header-link">
            <User size={18} aria-hidden />
            {user ? firstName || 'Minha conta' : 'Entrar'}
          </Link>

          <Link to="/carrinho" className="icon-btn" aria-label={`Carrinho com ${totalItems} itens`}>
            <ShoppingCart size={20} aria-hidden />
            {totalItems > 0 ? <span className="count-badge">{totalItems}</span> : null}
          </Link>

          <button
            type="button"
            className="icon-btn menu-toggle"
            onClick={() => setMenuOpenAtPath(menuOpen ? null : location.pathname)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </nav>
      </div>

      {menuOpen ? (
        <div className="mobile-menu">
          <div className="mobile-search">{searchField('busca-mobile')}</div>
          <Link to="/" onClick={closeMenu}>
            Início
          </Link>
          <Link to="/carrinho" onClick={closeMenu}>
            <ShoppingCart size={18} aria-hidden />
            Carrinho{totalItems > 0 ? ` (${totalItems})` : ''}
          </Link>
          <Link to={user ? '/conta' : '/entrar'} onClick={closeMenu}>
            <User size={18} aria-hidden />
            {user ? 'Minha conta' : 'Entrar / Criar conta'}
          </Link>
          {isAdmin ? (
            <Link to="/admin" onClick={closeMenu}>
              <LayoutDashboard size={18} aria-hidden />
              Painel do administrador
            </Link>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}
