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
//   Se já existe a resposta da última vez (nesta sessão), ela volta NA HORA
//   e o servidor é consultado em segundo plano; se os dados mudaram, chama
//   rapido() para a página redesenhar. Qualquer gravação (salvar, estornar…)
//   apaga as respostas guardadas, para ninguém ver dado antigo depois de salvar.
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
    if (opcoes.rapido) return chamarRapido(acao, dados, opcoes);
    const r = await buscar(acao, dados, opcoes);
    if (!LEITURA.test(acao)) limparRespostas();   // gravou algo: as respostas guardadas ficaram velhas
    return r;
  }

  // ---------- Resposta rápida (últimos dados guardados na sessão) ----------
  const PREFIXO = 'pm_resp|';
  const LEITURA = /^(listar|buscar|consultar|ler|meu|resumo|painel|situacao|estrutura|setores|inicio|conferencia|dados|embalagens|ping)/;
  const INICIO_PAGINA = Date.now();
  let atualizandoInicio = 0;

  function chaveResposta(acao, dados) {
    const s = Sessao.ler();
    return PREFIXO + (s && s.usuario ? s.usuario.login : '') + '|' + acao + '|' + JSON.stringify(dados || {});
  }
  function lerResposta(k) {
    try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }
  function guardarResposta(k, d) {
    try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), j: JSON.stringify(d) })); }
    catch (e) { limparRespostas(); }   // armazenamento cheio: começa de novo
  }
  function limparRespostas() {
    try {
      Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf(PREFIXO) === 0) sessionStorage.removeItem(k); });
    } catch (e) { /* navegador sem armazenamento */ }
  }

  async function chamarRapido(acao, dados, opcoes) {
    const k = chaveResposta(acao, dados);
    const guardada = lerResposta(k);
    if (!guardada) {
      const novo = await buscar(acao, dados, opcoes);
      guardarResposta(k, novo);
      return novo;
    }
    // Resposta de menos de 5 s (ex.: logo depois de atualizar): usa direto, sem ir ao servidor.
    if (Date.now() - guardada.t > 5000) {
      // No primeiro carregamento da página, trava os campos até os dados novos chegarem.
      const travar = Date.now() - INICIO_PAGINA < 4000;
      if (travar) { atualizandoInicio++; document.documentElement.classList.add('atualizando'); }
      buscar(acao, dados, opcoes)
        .then(function (novo) {
          guardarResposta(k, novo);
          if (JSON.stringify(novo) !== guardada.j) opcoes.rapido(novo);
        })
        .catch(function () { /* a página segue com os dados que já mostra */ })
        .then(function () {
          if (travar && --atualizandoInicio <= 0) document.documentElement.classList.remove('atualizando');
        });
    }
    return JSON.parse(guardada.j);
  }

  // Retorno visual de "estou trabalhando": se uma chamada ao servidor passa
  // de 0,3 s, aparece a barrinha laranja no topo até terminar.
  let emAndamento = 0, timerOcupado = null;
  function ocupado(d) {
    emAndamento = Math.max(emAndamento + d, 0);
    if (emAndamento > 0 && !timerOcupado) {
      timerOcupado = setTimeout(function () { if (emAndamento > 0) document.documentElement.classList.add('api-ocupado'); }, 300);
    }
    if (emAndamento === 0) {
      clearTimeout(timerOcupado); timerOcupado = null;
      document.documentElement.classList.remove('api-ocupado');
    }
  }

  // Enquanto atualiza no primeiro carregamento: barra fina no topo e campos travados.
  (function () {
    const css = document.createElement('style');
    css.textContent =
      'html.atualizando main.conteudo input, html.atualizando main.conteudo select, html.atualizando main.conteudo textarea,' +
      'html.atualizando main.conteudo button, html.atualizando .barra-mob button { pointer-events: none; }' +
      'html.api-ocupado::after, html.atualizando::after { content: ""; position: fixed; z-index: 9999; top: 0; left: 0; height: 3px; width: 35%;' +
      ' background: var(--destaque, #f07a1f); animation: pm-atualizando 1.1s linear infinite; }' +
      '@keyframes pm-atualizando { from { transform: translateX(-100%); } to { transform: translateX(290%); } }';
    document.head.appendChild(css);
  })();

  async function buscar(acao, dados, opcoes) {
    if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('http') !== 0) {
      throw new ErroApi('CONFIG', 'A URL do backend não foi configurada (js/config.js › API_URL).');
    }
    const corpo = { acao: acao, dados: dados || {} };
    if (!opcoes.semToken) corpo.token = Sessao.token();

    const controle = new AbortController();
    const tempo = setTimeout(function () { controle.abort(); }, CONFIG.TEMPO_LIMITE_MS);
    ocupado(1);
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
      avisar(false);
      throw new ErroApi('SEM_CONEXAO', controle.signal.aborted
        ? 'O servidor demorou demais para responder. Tente de novo.'
        : 'Sem conexão com o servidor. Verifique a internet e tente de novo.');
    } finally {
      clearTimeout(tempo);
      ocupado(-1);
    }
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

  return { chamar: chamar, idReq: idReq, Erro: ErroApi, limparRespostas: limparRespostas };
})();
