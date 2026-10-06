// ============================================================
// shell.js — A "moldura" de todas as páginas: menu lateral,
// barra do topo, barra de status, tema claro/escuro, menu do
// usuário (Trocar PIN / Sair) e a tela "sem permissão".
//
// A página só escreve o conteúdo dela dentro de <main class="conteudo">.
// O Shell monta o resto em volta (chamado por Sessao.iniciarPagina).
//
// Menu: TODAS as páginas aparecem (interface coletiva).
//   - nível NENHUM → apagada, com cadeado
//   - ainda não construída → etiqueta "em breve"
// ============================================================

const Shell = (function () {

  // ---------- Tema (claro / escuro) ----------
  // O tema é do USUÁRIO, não da página: vale para todas as páginas e
  // fica gravado no cadastro dele (servidor), então segue o usuário em
  // qualquer computador ou celular. Aqui no aparelho fica só uma cópia
  // (pm_tema) para a página já abrir na cor certa, sem piscar.
  function temaDe() {
    let t = null;
    try { t = localStorage.getItem('pm_tema'); } catch (e) { /* navegador sem armazenamento */ }
    return t === 'claro' ? 'claro' : 'escuro';
  }
  function aplicarTema() {
    document.documentElement.classList.toggle('tema-claro', temaDe() === 'claro');
  }
  // Recebe o tema que veio do servidor (login / conferência das permissões)
  function usarTemaDoUsuario(tema) {
    if (tema !== 'claro' && tema !== 'escuro') return;
    try { localStorage.setItem('pm_tema', tema); } catch (e) { /* ignora */ }
    aplicarTema();
  }
  function alternarTema() {
    const novo = temaDe() === 'claro' ? 'escuro' : 'claro';
    try { localStorage.setItem('pm_tema', novo); } catch (e) { /* ignora */ }
    aplicarTema();
    try {
      const s = JSON.parse(sessionStorage.getItem('pm_sessao') || 'null');
      if (s && s.usuario) { s.usuario.tema = novo; sessionStorage.setItem('pm_sessao', JSON.stringify(s)); }
    } catch (e) { /* ignora */ }
    // Grava no cadastro do usuário em segundo plano. sendBeacon garante que
    // o pedido chega ao servidor mesmo se a pessoa trocar de página logo em
    // seguida (um fetch comum seria cancelado na troca de página).
    try {
      const corpo = JSON.stringify({ acao: 'salvarTema', token: Sessao.token(), dados: { tema: novo } });
      const foi = navigator.sendBeacon && navigator.sendBeacon(CONFIG.API_URL, new Blob([corpo], { type: 'text/plain;charset=utf-8' }));
      if (!foi) fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: corpo, keepalive: true }).catch(function () { /* fica no aparelho */ });
    } catch (e) { /* fica no aparelho; vai de novo na próxima troca */ }
  }

  // ---------- Montagem ----------
  function montar(ctx) {
    const main = document.querySelector('main.conteudo');
    const app = document.createElement('div');
    app.className = 'app';
    app.innerHTML =
      '<aside class="lateral">' +
      '  <div class="lat-topo"><div><b>PROMETALS</b><small>SISTEMA INTEGRADO</small></div></div>' +
      '  <nav class="lat-nav">' + htmlMenu(ctx.paginas, ctx.pagina.id) + '</nav>' +
      '  <div class="lat-rodape">v' + Ui.esc(CONFIG.VERSAO) + '</div>' +
      '</aside>' +
      '<div class="veu"></div>' +
      '<header class="topo">' +
      '  <button class="icone-btn hamb" title="Menu">' + Ui.ic('i-menu') + '</button>' +
      '  <div class="migalha">' + (ctx.pagina.grupo ? Ui.esc(ctx.pagina.grupo) + ' &nbsp;/&nbsp; ' : 'Início &nbsp;/&nbsp; ') +
           '<b>' + Ui.esc(ctx.pagina.nome) + '</b></div>' +
      '  <div class="topo-dir">' +
      '    <button class="icone-btn" data-acao="tema" title="Tema claro/escuro">' + Ui.ic('i-lua') + '</button>' +
      '    <div class="usuario" data-acao="usuario" title="' + Ui.esc(ctx.usuario.nome) + '">' +
      '      <div class="avatar">' + Ui.esc(iniciais(ctx.usuario.nome)) + '</div>' +
      '      <div><b>' + Ui.esc(ctx.usuario.nome) + '</b><small>' + Ui.esc(nomeCargo(ctx.usuario)) + '</small></div>' +
      '      <div class="menu-usuario">' +
      '        <div class="cab"><b>' + Ui.esc(ctx.usuario.nome) + '</b>' + Ui.esc(ctx.usuario.login) + ' · ' + Ui.esc(nomeCargo(ctx.usuario)) + '</div>' +
      '        <button data-acao="pin">' + Ui.ic('i-chave') + 'Trocar PIN</button>' +
      '        <button data-acao="sair">' + Ui.ic('i-sair') + 'Sair</button>' +
      '      </div>' +
      '    </div>' +
      '    <button class="icone-btn" data-acao="sair" title="Sair">' + Ui.ic('i-sair') + '</button>' +
      '  </div>' +
      '</header>' +
      '<footer class="status">' +
      '  <span class="on" data-st="con">Conectado</span>' +
      '  <span data-st="hora">Última sincronização ' + Fmt.hora() + '</span>' +
      '  <span class="dir">Sessão: ' + Ui.esc(ctx.usuario.login) + ' · ' + Ui.esc(ctx.usuario.cargo) + '</span>' +
      '</footer>';
    main.parentNode.insertBefore(app, main);
    app.insertBefore(main, app.querySelector('footer'));
    ligarEventos(app, ctx);
    document.title = ctx.pagina.nome + ' · Prometals';
  }

  function htmlMenu(paginas, atual) {
    const grupos = [];
    paginas.forEach(function (p) {
      let g = grupos.find(function (x) { return x.nome === (p.grupo || ''); });
      if (!g) { g = { nome: p.grupo || '', itens: [] }; grupos.push(g); }
      g.itens.push(p);
    });
    return grupos.map(function (g) {
      return (g.nome ? '<div class="lat-sec">' + Ui.esc(g.nome) + '</div>' : '') + g.itens.map(function (p) {
        const icone = Ui.ic(CONFIG.ICONES[p.id] || 'i-lista');
        const pronta = CONFIG.PAGINAS_PRONTAS.indexOf(p.id) !== -1;
        const nome = '<span class="nm">' + Ui.esc(p.nome) + '</span>';
        if (p.nivel === 'NENHUM') {
          return '<a class="lat-item bloq" title="Sem permissão — fale com o administrador">' + icone + nome +
                 '<svg class="i cad"><use href="#i-cadeado"/></svg></a>';
        }
        if (!pronta) {
          return '<a class="lat-item embreve" title="Esta página ainda está sendo construída">' + icone + nome +
                 '<span class="breve">breve</span></a>';
        }
        return '<a class="lat-item' + (p.id === atual ? ' ativo' : '') + '" href="' + p.id + '.html">' + icone + nome + '</a>';
      }).join('');
    }).join('');
  }

  function ligarEventos(app, ctx) {
    const menuUsuario = app.querySelector('.menu-usuario');
    app.addEventListener('click', function (ev) {
      const alvo = ev.target.closest('[data-acao], .hamb, .veu');
      if (!alvo) { menuUsuario.classList.remove('aberto'); return; }
      if (alvo.classList.contains('hamb')) { app.classList.add('menu-aberto'); return; }
      if (alvo.classList.contains('veu')) { app.classList.remove('menu-aberto'); return; }
      const acao = alvo.dataset.acao;
      if (acao === 'tema') alternarTema();
      if (acao === 'usuario') { if (!ev.target.closest('.menu-usuario')) menuUsuario.classList.toggle('aberto'); return; }
      if (acao === 'sair') { ev.stopPropagation(); Sessao.sair(); }
      if (acao === 'pin') { menuUsuario.classList.remove('aberto'); trocarPin(); }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { app.classList.remove('menu-aberto'); menuUsuario.classList.remove('aberto'); }
    });
    window.addEventListener('api:status', function (ev) {
      const con = app.querySelector('[data-st="con"]');
      con.className = ev.detail.ok ? 'on' : 'off';
      con.textContent = ev.detail.ok ? 'Conectado' : 'Sem conexão';
      if (ev.detail.ok) app.querySelector('[data-st="hora"]').textContent = 'Última sincronização ' + Fmt.hora(ev.detail.quando);
    });
  }

  // ---------- Trocar PIN ----------
  function trocarPin() {
    Ui.janela({
      titulo: 'Trocar PIN',
      corpo:
        '<div class="msg-erro"></div>' +
        '<label class="campo">PIN atual<input type="password" inputmode="numeric" maxlength="8" name="atual" autocomplete="current-password"></label>' +
        '<label class="campo">Novo PIN (4 a 8 números)<input type="password" inputmode="numeric" maxlength="8" name="novo" autocomplete="new-password"></label>' +
        '<label class="campo">Repita o novo PIN<input type="password" inputmode="numeric" maxlength="8" name="rep" autocomplete="new-password"></label>',
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Trocar PIN', classe: 'pri', valor: 'ok' }],
      antesDeFechar: async function (valor, caixa) {
        const v = function (n) { return caixa.querySelector('[name="' + n + '"]').value.trim(); };
        const erro = caixa.querySelector('.msg-erro');
        if (!/^\d{4,8}$/.test(v('novo'))) { Ui.msgErro(erro, 'O novo PIN deve ter de 4 a 8 números.'); return false; }
        if (v('novo') !== v('rep')) { Ui.msgErro(erro, 'A repetição não confere com o novo PIN.'); return false; }
        try {
          await Api.chamar('trocarPin', { pinAtual: v('atual'), pinNovo: v('novo') });
          return true;
        } catch (e) {
          Ui.msgErro(erro, e.message);
          return false;
        }
      }
    }).then(function (v) { if (v === 'ok') Ui.toast('PIN trocado. Use o novo PIN no próximo acesso.'); });
  }

  // ---------- Sem permissão ----------
  function semPermissao(pagina) {
    const main = document.querySelector('main.conteudo');
    main.innerHTML =
      '<div class="bloqueio">' + Ui.ic('i-cadeado') +
      '<h2>Sem permissão</h2>' +
      '<p>Seu perfil não tem acesso à página <b>' + Ui.esc(pagina.nome) + '</b>.<br>Se precisar dela, fale com o administrador.</p>' +
      '<a class="btn2" href="inicio.html">' + Ui.ic('i-home') + 'Ir para a Visão geral</a></div>';
  }

  // ---------- Apoio ----------
  function iniciais(nome) {
    const p = String(nome || '?').trim().split(/\s+/);
    return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  function nomeCargo(u) {
    const nomes = { ADMIN: 'Administrador', PCP: 'PCP', GERENCIA: 'Gerência', COMERCIAL: 'Comercial', FINANCEIRO: 'Financeiro',
      COMPRAS: 'Compras', ALMOXARIFADO: 'Almoxarifado', QUALIDADE: 'Qualidade', OPERADOR: 'Operador', CONSULTA: 'Consulta' };
    const setor = u.setor ? ' · ' + (u.setor === 'FUNDICAO' ? 'Fundição' : u.setor === 'USINAGEM' ? 'Usinagem' : u.setor) : '';
    return (nomes[u.cargo] || u.cargo || '') + setor;
  }

  return { montar: montar, aplicarTema: aplicarTema, alternarTema: alternarTema, usarTemaDoUsuario: usarTemaDoUsuario, semPermissao: semPermissao };
})();
