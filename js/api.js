// ============================================================
// api.js — Única porta de comunicação com o backend (Apps Script).
//
//   const dados = await Api.chamar('listarCarteira', { visao: 'PRODUCAO' });
//
// - Sempre POST, corpo JSON { acao, token, dados }, Content-Type
//   text/plain (assim o navegador não bloqueia por CORS).
// - Resposta { ok:true, dados } → devolve "dados".
// - Resposta { ok:false, erro, mensagem } → lança Api.Erro (codigo + mensagem).
// - SESSAO_EXPIRADA → volta para o login sozinho.
// - Sem internet / servidor fora → Api.Erro('SEM_CONEXAO').
// - Api.idReq() gera o ID da requisição (anti clique duplo): gere UM por
//   clique e reenvie o MESMO se for tentar de novo.
// - Resposta rápida (consultas):
//     Api.chamar('listarCarteira', {...}, { rapido: function () { carregar(true); } })
//   Se já existe a resposta da última vez (guardada no computador, até 12 h),
//   ela volta NA HORA e o servidor é consultado em segundo plano; se os dados
//   mudaram, chama rapido() para a página redesenhar. Qualquer gravação
//   (salvar, estornar…) apaga as respostas guardadas.
// - Leitura igual já a caminho não é repetida; gravações vão uma de cada vez.
// ============================================================

const Api = (function () {
  class ErroApi extends Error {
    constructor(codigo, mensagem) {
      super(mensagem);
      this.codigo = codigo;
    }
  }

  async function chamar(acao, dados, opcoes) {
    opcoes = opcoes || {};
    if (LEITURA.test(acao)) {
      if (opcoes.rapido) return chamarRapido(acao, dados, opcoes);
      return lerUmaVez(acao, dados, opcoes);
    }
    // Gravação: uma de cada vez (a segunda espera a primeira terminar),
    // para não empilhar gravações no servidor.
    const minha = filaGravacao.then(function () { return buscar(acao, dados, opcoes); });
    filaGravacao = minha.catch(function () { /* a próxima segue mesmo se esta falhar */ });
    const r = await minha;
    if (!NAO_MUDA_DADOS.test(acao)) {
      // Gravou algo: as respostas guardadas ficam marcadas como "velhas".
      // - Nesta tela, as leituras dos próximos 15 s vão ao servidor (você vê na hora o que gravou).
      // - Nas outras páginas, a cópia aparece na hora e é atualizada por trás logo em seguida.
      gravouEm = Date.now();
      envelhecerRespostas();
    }
    return r;
  }
  let filaGravacao = Promise.resolve();
  let gravouEm = 0;
  const NAO_MUDA_DADOS = /^(login|logout|salvarTema|trocarPin)$/;

  // ---------- Respostas guardadas NO COMPUTADOR (valem até 12 h, mesmo fechando o navegador) ----------
  // A página aparece NA HORA com a última resposta e a atualização vem do
  // servidor por trás (sem travar a tela). Qualquer gravação apaga tudo,
  // para ninguém ver dado antigo depois de salvar.
  const PREFIXO = 'pm_resp|';
  const LEITURA = /^(listar|buscar|consultar|ler|meu|resumo|painel|situacao|estrutura|setores|inicio|conferencia|dados|embalagens|ping|ajustes)/;
  const VALIDADE_MS = 12 * 60 * 60 * 1000;   // depois disso a cópia não é usada
  const REVALIDAR_MS = 30000;               // cópia com menos de 30 s: nem pergunta ao servidor

  function chaveResposta(acao, dados) {
    const s = Sessao.ler();
    return PREFIXO + (s && s.usuario ? s.usuario.login : '') + '|' + acao + '|' + JSON.stringify(dados || {});
  }
  function lerResposta(k) {
    try {
      const g = JSON.parse(localStorage.getItem(k) || 'null');
      return g && Date.now() - g.t < VALIDADE_MS ? g : null;
    } catch (e) { return null; }
  }
  function guardarResposta(k, d) {
    const v = JSON.stringify({ t: Date.now(), j: JSON.stringify(d) });
    try { localStorage.setItem(k, v); }
    catch (e) {   // armazenamento cheio: apaga as cópias antigas e tenta de novo
      limparRespostas();
      try { localStorage.setItem(k, v); } catch (e2) { /* segue sem guardar */ }
    }
  }
  function envelhecerRespostas() {
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (k.indexOf(PREFIXO) !== 0) return;
        const g = JSON.parse(localStorage.getItem(k) || 'null');
        if (g && !g.v) { g.v = 1; localStorage.setItem(k, JSON.stringify(g)); }
      });
    } catch (e) { limparRespostas(); }
  }
  function limparRespostas() {
    try {
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf(PREFIXO) === 0) localStorage.removeItem(k); });
      Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf(PREFIXO) === 0) sessionStorage.removeItem(k); });
    } catch (e) { /* navegador sem armazenamento */ }
  }

  async function chamarRapido(acao, dados, opcoes) {
    const k = chaveResposta(acao, dados);
    // forcar: botão "Atualizar" · logo depois de gravar nesta tela: vai ao servidor
    const guardada = opcoes.forcar || Date.now() - gravouEm < 15000 ? null : lerResposta(k);
    if (!guardada) {
      const novo = await lerUmaVez(acao, dados, opcoes);
      guardarResposta(k, novo);
      return novo;
    }
    // Atualiza por trás — só se a cópia tem mais de 30 s e a aba está na frente da pessoa
    if ((guardada.v || Date.now() - guardada.t > REVALIDAR_MS) && !document.hidden) {
      lerUmaVez(acao, dados, opcoes)
        .then(function (novo) {
          guardarResposta(k, novo);
          if (JSON.stringify(novo) !== guardada.j) opcoes.rapido(novo);
        })
        .catch(function () { /* a página segue com os dados que já mostra */ });
    }
    return JSON.parse(guardada.j);
  }

  // A mesma leitura já a caminho do servidor não é pedida de novo:
  // quem pedir junto recebe a mesma resposta.
  const lendo = {};
  function lerUmaVez(acao, dados, opcoes) {
    const k = acao + '|' + JSON.stringify(dados || {});
    if (lendo[k]) return lendo[k];
    const p = buscar(acao, dados, opcoes);
    lendo[k] = p;
    const solta = function () { if (lendo[k] === p) delete lendo[k]; };
    p.then(solta, solta);
    return p;
  }

  // Trocou de página no meio de uma chamada: não é "sem conexão", não avisa nada.
  let saindo = false;
  window.addEventListener('pagehide', function () { saindo = true; });
  window.addEventListener('pageshow', function () { saindo = false; });

  // Tempo máximo esperando o servidor:
  //   leitura  → 90 s (e tenta 1 vez de novo sozinha se a rede falhar)
  //   gravação → 2 min (sem repetir: a gravação pode ter acontecido)
  const LIMITE_LEITURA = 90000, LIMITE_GRAVACAO = 120000;

  async function buscar(acao, dados, opcoes, tentativa) {
    if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('http') !== 0) {
      throw new ErroApi('CONFIG', 'A URL do backend não foi configurada (js/config.js › API_URL).');
    }
    const leitura = LEITURA.test(acao);
    const corpo = { acao: acao, dados: dados || {} };
    if (!opcoes.semToken) corpo.token = Sessao.token();

    const controle = new AbortController();
    const tempo = setTimeout(function () { controle.abort(); }, Math.max(CONFIG.TEMPO_LIMITE_MS || 0, leitura ? LIMITE_LEITURA : LIMITE_GRAVACAO));
    let resposta;
    try {
      const r = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(corpo),
        signal: controle.signal,
        redirect: 'follow'
      });
      resposta = await r.json();
    } catch (e) {
      clearTimeout(tempo);
      if (saindo) return new Promise(function () {});
      // Leitura: tenta mais uma vez sozinha (não grava nada, é seguro repetir)
      if (leitura && !tentativa && !controle.signal.aborted) return buscar(acao, dados, opcoes, 1);
      avisar(false);
      if (leitura) {
        throw new ErroApi('SEM_CONEXAO', controle.signal.aborted
          ? 'O servidor está lento agora. A página tenta de novo sozinha em instantes.'
          : 'Sem conexão com o servidor. Verifique a internet e tente de novo.');
      }
      throw new ErroApi('SEM_CONEXAO', controle.signal.aborted
        ? 'O servidor está demorando para confirmar. Ele pode ter gravado: espere 1 minuto e recarregue a página para conferir ANTES de salvar de novo.'
        : 'Sem conexão com o servidor. Confira se gravou (recarregue a página) antes de salvar de novo.');
    }
    clearTimeout(tempo);
    avisar(true);

    if (resposta && resposta.ok) return resposta.dados;
    const codigo = (resposta && resposta.erro) || 'ERRO';
    const mensagem = (resposta && resposta.mensagem) || 'Erro inesperado no servidor.';
    if (codigo === 'SESSAO_EXPIRADA' && !opcoes.semToken) {
      Sessao.expirou(mensagem);
      // a página vai ser trocada; esta promessa nunca termina
      return new Promise(function () {});
    }
    throw new ErroApi(codigo, mensagem);
  }

  // Avisa a barra de status (Conectado / Sem conexão + hora da última resposta)
  function avisar(ok) {
    window.dispatchEvent(new CustomEvent('api:status', { detail: { ok: ok, quando: new Date() } }));
  }

  function idReq() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // ---------- Pré-carregar (depois do login) ----------
  // Busca por trás, UMA de cada vez, os dados das páginas que a pessoa pode abrir.
  // Quando ela clicar no menu, a página já abre na hora. Só busca o que ainda
  // não está guardado; se a pessoa trocar de página no meio, continua na próxima.
  const PRECARGA = {
    inicio:    [['resumoBI', {}]],
    bi:        [['resumoBI', {}]],
    consulta:  [['listarCarteira', { visao: 'PRODUCAO' }]],
    pcp:       [['listarCarteira', { visao: 'PRODUCAO' }], ['listarProdutos', {}]],
    mapa:      [['listarCarteira', { visao: 'PRODUCAO' }]],
    gerencial: [['listarCarteira', { visao: 'PRODUCAO' }]],
    fusao:     [['listarCarteira', { visao: 'PRODUCAO' }]],
    historico: [['listarCorridas', { canceladas: true }]],
    comercial: [['listarCarteira', { visao: 'COMERCIAL' }]],
    compras:   [['painelCompras', { categorias: 'TODAS' }]],
    qualidade: [['listarRefugo', {}]],
    refugo:    [['inicioRefugo', {}]],
    insumos:   [['listarInsumos', { incluirInativos: true }], ['situacaoInsumos', {}], ['ajustesSaldo', { dias: 30 }]],
    produtos:  [['listarProdutos', { incluirInativos: true }], ['listarInsumos', {}]],
    estoque:   [['embalagensParaBaixar', {}]]
  };
  let preCarregando = false;
  async function preCarregar(paginas) {
    if (preCarregando || !paginas) return;
    // no máximo a cada 10 min (não fica enchendo o servidor depois de cada gravação)
    try {
      if (Date.now() - Number(localStorage.getItem('pm_precarga') || 0) < 10 * 60 * 1000) return;
      localStorage.setItem('pm_precarga', String(Date.now()));
    } catch (e) { return; }
    preCarregando = true;
    const vistas = {};
    const lista = [];
    paginas.forEach(function (p) {
      if (!p || p.nivel === 'NENHUM') return;
      (PRECARGA[p.id] || []).forEach(function (c) {
        const k = chaveResposta(c[0], c[1]);
        if (!vistas[k]) { vistas[k] = true; lista.push({ k: k, acao: c[0], dados: c[1] }); }
      });
    });
    for (const c of lista) {
      if (saindo) break;
      if (lerResposta(c.k)) continue;   // já guardado
      try { guardarResposta(c.k, await lerUmaVez(c.acao, c.dados, {})); } catch (e) { /* segue com a próxima */ }
    }
    preCarregando = false;
  }

  // Tela de login: já "acorda" o servidor e abre a conexão com o Google enquanto
  // a pessoa digita usuário e PIN — o Entrar responde mais rápido.
  if (/(^|\/)(index\.html)?$/.test(location.pathname)) {
    setTimeout(function () { buscar('ping', {}, { semToken: true }).catch(function () { /* ignora */ }); }, 0);
  }

  return { chamar: chamar, idReq: idReq, Erro: ErroApi, limparRespostas: limparRespostas, preCarregar: preCarregar };
})();
