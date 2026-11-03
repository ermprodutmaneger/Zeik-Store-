import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AdminRoute } from './components/AdminRoute'
import { ConfigPending } from './components/ConfigPending'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './contexts/AuthProvider'
import { CartProvider } from './contexts/CartProvider'
import { isSupabaseConfigured } from './lib/supabase'
import { AccountPage } from './pages/AccountPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { CartPage } from './pages/CartPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OrderSuccessPage } from './pages/OrderSuccessPage'
import { ProductPage } from './pages/ProductPage'
import { RegisterPage } from './pages/RegisterPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage'
import { AdminProductFormPage } from './pages/admin/AdminProductFormPage'
import { AdminProductsPage } from './pages/admin/AdminProductsPage'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  // Sem as variáveis públicas do Supabase, mostramos a tela de configuração
  // pendente em vez de simular uma loja funcionando.
  if (!isSupabaseConfigured) {
    return <ConfigPending />
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <ScrollToTop />
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/produto/:slug" element={<ProductPage />} />
              <Route path="/carrinho" element={<CartPage />} />

              <Route path="/entrar" element={<LoginPage />} />
              <Route path="/cadastro" element={<RegisterPage />} />
              <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
              <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />

              <Route
                path="/conta"
                element={
                  <ProtectedRoute>
                    <AccountPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pedido-concluido/:id"
                element={
                  <ProtectedRoute>
                    <OrderSuccessPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminLayout />
                  </AdminRoute>
                }
              >
                <Route index element={<AdminDashboardPage />} />
                <Route path="produtos" element={<AdminProductsPage />} />
                <Route path="produtos/novo" element={<AdminProductFormPage />} />
                <Route path="produtos/:id/editar" element={<AdminProductFormPage />} />
                <Route path="pedidos" element={<AdminOrdersPage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
