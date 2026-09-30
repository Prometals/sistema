// ============================================================
// config.js — Configuração do sistema (o ÚNICO arquivo que muda
// quando o backend é publicado de novo com outra URL).
// ============================================================
const CONFIG = {
  // URL do App da Web do Apps Script (termina em /exec).
  // Apps Script › Implantar › Gerenciar implantações › copiar "URL do app da Web".
  API_URL: 'https://script.google.com/macros/s/AKfycbzU9S-lWEfJCxVikBBpnX7B-vrye9_JqzNQwEApuzT3FchzTNMgg24vtsB5Rph_jgIxxA/exec',

  VERSAO: '1.0.0',

  // Páginas já construídas. As outras aparecem no menu com a etiqueta
  // "em breve" até ficarem prontas (evita link quebrado durante a Fase 5).
  PAGINAS_PRONTAS: ['inicio', 'consulta', 'pcp', 'mapa', 'gerencial', 'fusao', 'historico', 'comercial', 'refugo', 'qualidade', 'estoque', 'compras', 'produtos', 'insumos', 'bi', 'usuarios'],

  // Ícone de cada página no menu (id da página → símbolo do icones.js)
  ICONES: {
    inicio: 'i-home', consulta: 'i-busca', pcp: 'i-tabela', mapa: 'i-cal',
    gerencial: 'i-clip', fusao: 'i-fogo', historico: 'i-hist', comercial: 'i-moeda',
    refugo: 'i-alerta', qualidade: 'i-graf', estoque: 'i-pacote', compras: 'i-carrinho',
    produtos: 'i-camadas', insumos: 'i-cubo', bi: 'i-tv', usuarios: 'i-usuarios'
  },

  // Tema padrão de cada página (o usuário troca pela lua; a escolha fica salva)
  TEMA_PADRAO: { comercial: 'claro', qualidade: 'claro', compras: 'claro' },

  TEMPO_LIMITE_MS: 45000   // desiste de uma chamada ao servidor depois de 45 s
};