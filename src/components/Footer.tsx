import { Link } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-inner">
          <div>
            <p className="footer-logo">
              <span className="logo-zeik">Zeik</span> Store
            </p>
            <p style={{ marginTop: 10, maxWidth: 360, fontSize: '0.93rem' }}>
              Loja criada para testar Supabase na prática: contas, banco de dados,
              imagens e permissões de verdade — sem cobrança real.
            </p>
            <p style={{ marginTop: 14 }}>
              <span className="badge badge-warning">
                <FlaskConical size={13} aria-hidden />
                Ambiente de testes
              </span>
            </p>
          </div>

          <div>
            <h4>Loja</h4>
            <ul className="footer-links">
              <li>
                <Link to="/">Produtos</Link>
              </li>
              <li>
                <Link to="/carrinho">Carrinho</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>Sua conta</h4>
            <ul className="footer-links">
              <li>
                <Link to="/entrar">Entrar</Link>
              </li>
              <li>
                <Link to="/cadastro">Criar conta</Link>
              </li>
              <li>
                <Link to="/conta">Minha conta e pedidos</Link>
              </li>
              <li>
                <Link to="/recuperar-senha">Recuperar senha</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Zeik Store — projeto de estudo.</span>
          <span>Produtos fictícios e pedidos de teste: nenhum valor é cobrado.</span>
        </div>
      </div>
    </footer>
  )
}
