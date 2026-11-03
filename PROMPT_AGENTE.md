Crie uma loja de testes completa chamada Zeik Store no repositório https://github.com/ermprodutmaneger/Zeik-Store-.

O objetivo é testar na prática Supabase Auth, banco de dados, upload de imagens e permissões. Implemente o projeto e os arquivos necessários para hospedar na Vercel. Preserve os documentos úteis já existentes e atualize o README conforme o que for implementado.

1. Tecnologia e visual
Use React, TypeScript, Vite, React Router e @supabase/supabase-js, com versões compatíveis e fixadas e lockfile. Consulte a documentação atual antes de integrar o Supabase. Organize componentes, páginas, serviços e tipos em arquivos separados.
Interface em português do Brasil, preços em reais, visual premium e leve: fundo claro, texto escuro, roxo e ciano, cartões elegantes, boas fotos, cantos arredondados e animações discretas. Use a marca tipográfica “Zeik Store”. Priorize celular e iPad, mantendo ótima experiência no computador.

2. Vitrine e carrinho
Crie página inicial com banner, categorias, busca, ordenação, cards e página de cada produto. Mostre foto, nome, descrição, preço e disponibilidade. Inclua carrinho com alteração de quantidade, remoção e subtotal. O carrinho pode persistir no navegador; catálogo, perfis e pedidos devem usar o Supabase.
Prepare um seed com oito produtos fictícios de acessórios e tecnologia. Após conectar o banco, a vitrine deve buscar os produtos cadastrados nele.

3. Cadastro e login reais
Implemente cadastro com nome, e-mail, senha e confirmação de senha; login, logout, confirmação de e-mail, recuperação e redefinição de senha. Use Supabase Auth e sua sessão, sem implementar armazenamento próprio de senhas.
Trate carregamento inicial da sessão, usuário aguardando confirmação, erros e links expirados. Configure rotas de retorno de autenticação e recuperação, documentando os endereços necessários.
Crie “Minha conta” para o cliente editar o próprio nome e consultar seus pedidos. Proteja as rotas privadas e impeça acesso ao painel administrativo por clientes comuns.

4. Painel do administrador
Crie /admin com contadores reais de produtos, estoque baixo e pedidos de teste. Inclua cadastro, edição, publicação, desativação e exclusão de produtos quando não houver referências em pedidos; nesses casos use desativação para preservar o histórico.
Campos: nome, slug único, descrição, categoria, preço, estoque inteiro, foto e status ativo. Valide valores no formulário e no banco.
Implemente upload, substituição e remoção de fotos no Supabase Storage. Restrinja formatos a JPEG, PNG e WebP e limite a 5 MB. Somente administradores podem gravar ou excluir arquivos. O bucket público deve guardar apenas imagens do catálogo.
Permita ao administrador consultar pedidos e atualizar seu andamento.

5. Banco e autorização
Entregue SQL executável para profiles, user_roles, categories, products, orders e order_items, com chaves, relacionamentos, índices e constraints. Use valores monetários em centavos inteiros e preserve nos itens o nome e o preço praticados no pedido.
Ative Row Level Security em todas as tabelas expostas e conceda somente os privilégios necessários. Visitantes veem o catálogo ativo; clientes leem e alteram apenas os campos permitidos de seu perfil e consultam somente os próprios pedidos; administradores gerenciam catálogo e pedidos.
As funções de cliente e administrador devem ser controladas no banco. O cliente não pode promover a si mesmo nem modificar user_roles. Não use user_metadata, e-mail escrito no código ou localStorage para decidir autorização.
Forneça um procedimento separado para promover meu usuário a administrador pelo UUID após o cadastro. Não transforme automaticamente o primeiro cadastrado em administrador e não crie senhas padrão.
Políticas de UPDATE precisam de USING e WITH CHECK apropriados. Proteja também Storage e funções de banco; não confie apenas em esconder botões.

6. Pedidos de teste
Exija login para finalizar o carrinho e salve o pedido no banco com indicação clara de “pedido de teste, sem cobrança”.
A criação deve validar o usuário, os produtos ativos, preços e disponibilidade no banco, registrar os itens e baixar estoque em uma única transação, evitando estoque negativo e pedidos duplicados em reenvios. O navegador envia IDs e quantidades, nunca determina o total cobrado.
O cliente não pode alterar total, dono ou status do pedido. Caso uma função privilegiada seja necessária, restrinja sua execução, valide auth.uid(), fixe search_path e exponha apenas a operação necessária.
Não integre cobrança real ou marque pedidos como pagos nesta etapa.

7. Configuração e hospedagem
Use apenas VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no frontend. Mantenha .env.local fora do Git e preserve .env.example com valores vazios. Nunca exponha service_role, sb_secret, senha de banco ou outras credenciais privadas.
Sem configuração do Supabase, mostre uma tela clara de configuração pendente, sem simular login ou pedidos bem-sucedidos.
Entregue supabase/schema.sql, supabase/seed.sql e instruções SQL separadas para atribuição do administrador. Caso use migrations, gere os nomes pela CLI do Supabase.
Prepare scripts de desenvolvimento, build, lint e verificação de tipos, além do rewrite de SPA para que links diretos e recarregamentos funcionem na Vercel.
Atualize docs/HOSPEDAGEM.md com instalação, execução dos SQLs em projeto exclusivo de testes, configuração do Storage, autenticação, URLs de retorno, variáveis na Vercel e deploy GitHub → Vercel.
Nesta etapa, gere o código e os scripts; a conexão com o projeto Supabase e a publicação serão feitas depois. Não altere bancos ou sites de outros projetos.

8. Validação e entrega
Execute instalação, verificação de tipos, lint e build. Valide navegação responsiva, formulários, estados vazios, erros e rotas diretas.
Quando houver um banco de testes configurado, verifique cadastro, confirmação, login, recuperação, logout, persistência de produtos e imagens após recarregar, pedido com baixa de estoque e histórico.
Teste com visitante, administrador e dois clientes: um cliente não pode ler pedidos do outro, alterar estoque/preços, assumir outra identidade ou promover a si mesmo, inclusive por chamadas diretas à API.
Entregue os arquivos completos, resumo do que foi implementado, comandos usados, resultados das verificações e pendências exatas. Se algo depender de configuração externa, informe claramente que ainda não foi testado. Prossiga até concluir o código, sem parar apenas em uma proposta de interface.
