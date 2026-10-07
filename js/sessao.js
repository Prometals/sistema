// ============================================================
// sessao.js — Login, token e "porteiro" de cada página.
//
// O token fica no sessionStorage: a sessão ACABA ao fechar o
// navegador (regra aprovada no mockup). No servidor, ela também
// expira depois de 6 h sem uso.
//
// Toda página (menos o login) começa assim:
//   Sessao.iniciarPagina('pcp').then(function (ctx) {
//     // ctx.usuario, ctx.nivel ('VER' | 'EDITAR'), ctx.podeEditar, ctx.paginas
//   });
// ============================================================

const Sessao = (function () {
  const CHAVE = 'pm_sessao';
  const CHAVE_AVISO = 'pm_aviso';

  function ler() {
    try { return JSON.parse(sessionStorage.getItem(CHAVE) || 'null'); } catch (e) { return null; }
  }
  function salvar(s) { sessionStorage.setItem(CHAVE, JSON.stringify(s)); }
  // As respostas guardadas ficam (são separadas por usuário e apagadas a cada gravação):
  // assim, ao entrar de novo, as páginas já abrem na hora.
  function limpar() { sessionStorage.removeItem(CHAVE); }
  function token() { const s = ler(); return s ? s.token : ''; }
  // Tema do usuário (vem do servidor): guarda a cópia do aparelho para
  // as páginas abrirem já na cor certa. Sem tema salvo, fica o do aparelho.
  function guardarTema(u) { return Tema.guardar(u && u.tema); }

  // Login: guarda token, usuário e páginas liberadas.
  async function entrar(login, pin) {
    const r = await Api.chamar('login', { login: login, pin: pin }, { semToken: true });
    salvar({ token: r.token, usuario: r.usuario, paginas: r.paginas, conferidoEm: Date.now() });
    try { localStorage.removeItem('pm_precarga'); } catch (e) { /* ignora */ }   // login novo: pré-carrega de novo
    guardarTema(r.usuario);
    return r;
  }

  // Para onde ir depois do login:
  // 1) a página que pediu o login (?volta=pcp.html), se o usuário puder abrir;
  // 2) se ele só tem UMA página (ex.: operador do refugo), direto nela;
  // 3) senão, a Visão geral.
  function destino(paginas, volta) {
    const abre = function (id) {
      const p = paginas.find(function (x) { return x.id === id; });
      return p && p.nivel !== 'NENHUM' && CONFIG.PAGINAS_PRONTAS.indexOf(id) !== -1;
    };
    const m = /^([a-z]+)\.html$/.exec(volta || '');
    if (m && abre(m[1])) return m[1] + '.html';
    const liberadas = paginas.filter(function (p) { return p.id !== 'inicio' && p.nivel !== 'NENHUM'; });
    if (liberadas.length === 1 && abre(liberadas[0].id)) return liberadas[0].id + '.html';
    return 'inicio.html';
  }

  // Sai NA HORA: o aviso de logout vai para o servidor "por baixo" (sem esperar resposta).
  function sair() {
    try {
      const corpo = JSON.stringify({ acao: 'logout', token: token(), dados: {} });
      const enviado = navigator.sendBeacon && navigator.sendBeacon(CONFIG.API_URL, new Blob([corpo], { type: 'text/plain;charset=utf-8' }));
      if (!enviado) fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: corpo, keepalive: true }).catch(function () {});
    } catch (e) { /* sai mesmo sem internet */ }
    limpar();
    location.href = 'index.html';
  }

  // Chamado pelo api.js quando o servidor responde SESSAO_EXPIRADA.
  function expirou(mensagem) {
    limpar();
    sessionStorage.setItem(CHAVE_AVISO, mensagem || 'Sua sessão expirou. Entre novamente.');
    location.href = 'index.html?volta=' + encodeURIComponent(paginaAtual());
  }

  function paginaAtual() {
    return location.pathname.split('/').pop() || 'inicio.html';
  }

  // Aviso deixado para a tela de login (ex.: "sessão expirou").
  function pegarAviso() {
    const a = sessionStorage.getItem(CHAVE_AVISO);
    sessionStorage.removeItem(CHAVE_AVISO);
    return a;
  }

  // Porteiro da página: exige login, atualiza as permissões no servidor,
  // monta o menu/topo e bloqueia a página se o nível for NENHUM.
  let temaAoAbrir = null;   // para não desfazer uma troca de tema feita enquanto a página carregava
  async function iniciarPagina(idPagina) {
    let s = ler();
    if (s) guardarTema(s.usuario);
    Shell.aplicarTema();
    try { temaAoAbrir = localStorage.getItem('pm_tema'); } catch (e) { /* ignora */ }
    if (!s || !s.token) {
      location.replace('index.html?volta=' + encodeURIComponent(paginaAtual()));
      return new Promise(function () {});
    }
    // Já tem as permissões guardadas (do login ou da última página)?
    // Monta o menu NA HORA com elas e confere no servidor em segundo plano.
    // Assim o menu não "some" enquanto o Apps Script responde.
    if (s.paginas && s.paginas.length) {
      conferirAcessoEmSegundoPlano(s, idPagina);
    } else {
      try {
        const r = await Api.chamar('meuAcesso', {});
        s.usuario = r.usuario;
        s.paginas = r.paginas;
        salvar(s);
      } catch (e) {
        if (e.codigo !== 'SEM_CONEXAO') throw e;
        Ui.toast('Mostrando o menu da última conexão.', 'aviso', 'Sem conexão');
      }
    }
    // A Visão geral é a página inicial de TODOS: nunca fica bloqueada, seja qual for o cargo
    s.paginas = s.paginas.map(function (p) { return p.id === 'inicio' && p.nivel === 'NENHUM' ? Object.assign({}, p, { nivel: 'VER' }) : p; });
    const pagina = s.paginas.find(function (p) { return p.id === idPagina; }) || { id: idPagina, nome: idPagina, grupo: '', nivel: 'NENHUM' };
    Shell.montar({ pagina: pagina, usuario: s.usuario, paginas: s.paginas });
    // Depois que esta página carregar o que precisa, busca por trás os dados das outras
    setTimeout(function () { try { Api.preCarregar(s.paginas); } catch (e) { /* ignora */ } }, 4000);
    if (pagina.nivel === 'NENHUM') {
      Shell.semPermissao(pagina);
      return new Promise(function () {});
    }
    return {
      usuario: s.usuario, paginas: s.paginas, pagina: pagina,
      nivel: pagina.nivel, podeEditar: pagina.nivel === 'EDITAR',
      nivelDe: function (id) { const p = s.paginas.find(function (x) { return x.id === id; }); return p ? p.nivel : 'NENHUM'; }
    };
  }

  // Pergunta ao servidor as permissões atuais. Se o admin mudou algo
  // (menu ou nível desta página), guarda o novo e recarrega a página
  // uma vez para ela já abrir com o acesso certo.
  async function conferirAcessoEmSegundoPlano(s, idPagina) {
    // No máximo a cada 10 min (antes: a cada troca de página = uma chamada a mais no servidor)
    if (s.conferidoEm && Date.now() - s.conferidoEm < 10 * 60 * 1000) return;
    try {
      const r = await Api.chamar('meuAcesso', {});
      const fresca = ler();
      if (fresca) { fresca.conferidoEm = Date.now(); salvar(fresca); }
      // tema trocado em outro aparelho: aplica na hora, sem recarregar
      // (se a pessoa trocou o tema nesta página enquanto carregava, vale o dela)
      let agora = null;
      try { agora = localStorage.getItem('pm_tema'); } catch (e) { /* ignora */ }
      if (agora === temaAoAbrir && guardarTema(r.usuario)) Shell.aplicarTema();
      const chave = function (u) { u = u || {}; return [u.login, u.nome, u.cargo, u.setor || ''].join('|'); };
      const mudou = JSON.stringify(r.paginas) !== JSON.stringify(s.paginas) || chave(r.usuario) !== chave(s.usuario);
      if (!mudou) return;
      const atual = ler() || s;
      atual.usuario = r.usuario;
      atual.paginas = r.paginas;
      salvar(atual);
      location.reload();
    } catch (e) {
      if (e.codigo === 'SEM_CONEXAO') Ui.toast('Mostrando o menu da última conexão.', 'aviso', 'Sem conexão');
      // sessão expirada: o Api já leva para o login
    }
  }

  return {
    ler: ler, token: token, entrar: entrar, destino: destino, sair: sair,
    expirou: expirou, pegarAviso: pegarAviso, iniciarPagina: iniciarPagina, limpar: limpar
  };
})();

// ============================================================
// App instalável (PWA). Roda em TODAS as páginas, porque todas
// carregam este arquivo. Só funciona em https (GitHub Pages) ou
// localhost; abrindo o HTML direto do computador, não faz nada.
// ============================================================
(function () {
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  const cab = document.head;
  function tag(nome, attrs) { const el = document.createElement(nome); Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); }); cab.appendChild(el); }
  tag('link', { rel: 'manifest', href: 'manifest.webmanifest' });
  tag('meta', { name: 'theme-color', content: '#0f1720' });
  tag('link', { rel: 'apple-touch-icon', href: 'icones/icone-192.png' });
  tag('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  tag('meta', { name: 'apple-mobile-web-app-title', content: 'Prometals' });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* sem PWA, o site segue normal */ });
    });
  }
})();
