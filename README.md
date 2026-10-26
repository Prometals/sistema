# Prometals · Sistema Integrado

Sistema web interno da fundição **Prometals**, que integra o fluxo operacional entre departamentos:

```
PCP → Produção → Qualidade → Estoque → Compras → Comercial / Financeiro
```

Ele é **complementar ao ERP oficial**: o ERP continua cuidando da parte fiscal e burocrática, e este sistema cuida do dia a dia do chão de fábrica de forma simples, rápida e visual. Funciona no computador, no celular e na TV da fábrica.

**Status:** em produção desde **07/10/2026**.

---

## Módulos

| Grupo | Página | Para que serve |
|---|---|---|
| — | **Entrar** (`index.html`) | Login único do sistema, com usuário e PIN |
| — | **Visão geral** (`inicio.html`) | Resumo da produção e das OPs que exigem atenção |
| Produção | **Consulta** (`consulta.html`) | Consulta somente leitura das OPs: onde estão, liga, prazo e situação |
| Produção | **PCP · Monitor** (`pcp.html`) | Cadastro e edição das OPs (prazo, moldes, peso, processo) e etiquetas |
| Produção | **Mapa · Calendário** (`mapa.html`) | Calendário de prazos por departamento, com cronograma reverso |
| Manufatura | **Controle Gerencial** (`gerencial.html`) | Previsão de saída e processo de cada OP; impressão de prioridades |
| Manufatura | **Plano de Fusão** (`fusao.html`) | Montagem das corridas de fusão com controle de peso e romaneio |
| Manufatura | **Histórico de Corridas** (`historico.html`) | Corridas ativas e fundidas, data de fusão, estorno e reimpressão do romaneio |
| Comercial | **Financeiro** (`comercial.html`) | Valor da OP, prontas para faturar, NF emitida / não faturado |
| Qualidade | **Registro de Refugo** (`refugo.html`) | Apontamento de refugo e retrabalho pelo operador |
| Qualidade | **Qualidade · Refugo** (`qualidade.html`) | Acompanhamento dos apontamentos, com filtros, Excel e PDF |
| Estoque | **Estoque · Operador** (`estoque.html`) | Retirada de insumos (com ou sem OP) e devolução, pensado para celular |
| Estoque | **Compras** (`compras.html`) | O que saiu, para quê, e o que precisa ser comprado |
| Cadastros | **Produtos e Estrutura** (`produtos.html`) | Cadastro de produtos e da estrutura (BOM) |
| Cadastros | **Insumos** (`insumos.html`) | Cadastro de insumos, entradas e ajuste de saldo (inventário) |
| Indicadores | **Dashboard BI** (`bi.html`) | Painel para a TV da fábrica (1920×1080) |
| Administração | **Usuários** (`usuarios.html`) | Usuários e matriz de permissões por página |
| — | **Diagnóstico** (`diag.html`) | Página de apoio para medir a velocidade do sistema |

---

## Arquitetura

```
 Navegador (computador / celular / TV)
        │  HTML + CSS + JavaScript puro (PWA)
        │  publicado no GitHub Pages
        ▼
 Google Apps Script (web app)
        │  regras de negócio, login, permissões, auditoria
        ▼
 Google Sheets (banco de dados)
        ├── Produção
        ├── Estoque
        └── Refugo
```

- **Frontend:** HTML, CSS e JavaScript puro, sem framework. Um arquivo HTML por página, um CSS global e scripts compartilhados. Pode ser instalado como app no celular (PWA).
- **Backend:** um único projeto Google Apps Script, publicado como web app. O front se comunica com ele por `POST` com JSON.
- **Banco:** planilhas Google separadas por assunto (Produção, Estoque e Refugo), tratadas como tabelas: colunas acessadas pelo nome e IDs sequenciais.
- **Desempenho:** cache no servidor (por aba, invalidado a cada gravação), aquecimento automático do cache em horário de expediente e cache local no navegador para abrir as páginas na hora.

---

## Estrutura de pastas

```
/
├── index.html            ← login
├── inicio.html           ← visão geral
├── *.html                ← uma página por módulo (nome = id da página)
├── manifest.webmanifest  ← configuração do app (PWA)
├── sw.js                 ← service worker (atualização dos arquivos)
├── icones/               ← ícones do app e favicon
├── css/
│   ├── tema.css          ← cores dos temas escuro e claro (variáveis)
│   └── sistema.css       ← layout, componentes e versão celular
└── js/
    ├── config.js         ← configuração: endereço do backend, páginas, ícones, tema padrão
    ├── icones.js         ← ícones SVG do sistema
    ├── ui.js             ← avisos, janelas, confirmação, formatação
    ├── api.js            ← comunicação com o backend e cache local
    ├── sessao.js         ← controle de acesso das páginas e tempo de inatividade
    ├── shell.js          ← menu lateral, topo e barra de status
    └── cronograma.js     ← cálculo do cronograma reverso das OPs
```

Ordem de carregamento dos scripts em todas as páginas:

```
config → icones → ui → api → sessao → shell (→ cronograma)
```

---

## Princípios da base de dados

- **Nada é apagado.** Correções são feitas por **estorno** (lançamento contrário) ou **inativação** (`ATIVO = NÃO`).
- **Tudo é auditado.** Toda alteração registra quem mudou, quando, o campo, o valor antigo e o valor novo.
- **Tipos de aba:**
  - `CAD_`: cadastros (nunca apagados, só inativados);
  - sem prefixo: estado atual (alteração permitida, sempre auditada);
  - `MOV_`: movimentos (somente inclusão);
  - `VW_`: visões calculadas (nunca editadas à mão).
- **Uma linha = uma OP.** Um pedido pode ter várias OPs do mesmo item.
- **Ciclo de vida da OP:**
  ```
  EM_ENGENHARIA → ABERTA → EM_PRODUCAO → EXPEDICAO → (AGUARDANDO_FATURAMENTO) → FINALIZADA
                                                      CANCELADA (somente o PCP)
  ```
- **Acesso por permissão de página.** Cada cargo tem nível **VER** ou **EDITAR** em cada página. O administrador configura isso na tela de Usuários, inclusive com exceções por usuário. Todas as páginas exigem login.

---

## Como publicar

### Frontend (este repositório)
1. No GitHub, abra a pasta certa (raiz, `js/` ou `css/`).
2. Use **Add file › Upload files** e arraste o arquivo alterado.
3. Faça o commit.
4. Aguarde alguns instantes e atualize a página com **Ctrl+F5**.

> Se a tela ficar estranha depois de uma atualização, limpe os dados do site no navegador ou teste numa janela anônima.

### Backend (Google Apps Script)
1. Cole o arquivo `.gs` alterado no editor do Apps Script e salve.
2. Vá em **Implantar › Gerenciar implantações › ✏️ (editar) › Versão: Nova versão › Implantar**.

> ⚠ **Nunca** crie uma implantação nova nem arquive a atual: o endereço do backend mudaria e o sistema pararia de funcionar.

---

## Padrões de interface

- **Botões só com ícone.** O nome aparece apenas ao passar o mouse (dica).
- **Sem textos extras na tela.** A interface é feita para uso rápido no chão de fábrica.
- **Edição pelo lápis.** As tabelas abrem travadas. O ✏️ destrava a edição, e os botões de salvar e descartar ficam visíveis, porém desabilitados, até a edição começar.
- **Dois temas:** escuro e claro, com escolha salva por página.
- **Celular com layout próprio** (adaptativo, não só responsivo): indicadores compactos, cartões no lugar de tabelas e barra de ações no rodapé.
- **Impressão profissional:** preto no branco, sem fundo colorido, com negrito apenas no título e no cabeçalho das colunas.
- **Regra de impressão:** linhas selecionadas imprimem só elas; senão, o que está filtrado; senão, tudo.

---

## Responsável

Desenvolvido por **Oliver Augusto**, da Engenharia de Processos / PCP da Prometals.
