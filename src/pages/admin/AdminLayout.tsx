import { Link, NavLink, Outlet } from 'react-router-dom'
import { CreditCard, LayoutDashboard, Package, PlusCircle, ShoppingBag, Store } from 'lucide-react'

export function AdminLayout() {
  return (
    <div className="container page">
      <h1 className="page-title">Painel do administrador</h1>
      <p className="page-subtitle" style={{ marginBottom: 22 }}>
        Gerencie produtos, estoque, pedidos e cobranças.
      </p>

      <div className="admin-shell">
        <nav className="admin-nav" aria-label="Menu do administrador">
          <NavLink to="/admin" end>
            <LayoutDashboard size={18} aria-hidden />
            Visão geral
          </NavLink>
          <NavLink to="/admin/produtos" end>
            <Package size={18} aria-hidden />
            Produtos
          </NavLink>
          <NavLink to="/admin/produtos/novo">
            <PlusCircle size={18} aria-hidden />
            Novo produto
          </NavLink>
          <NavLink to="/admin/pedidos">
            <ShoppingBag size={18} aria-hidden />
            Pedidos
          </NavLink>
          <NavLink to="/admin/cobrancas">
            <CreditCard size={18} aria-hidden />
            Cobranças Pix
          </NavLink>
          <hr className="nav-divider" />
          <Link to="/">
            <Store size={18} aria-hidden />
            Ver a loja
          </Link>
        </nav>

        <div>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
