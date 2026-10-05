// ============================================================
// ui.js — Peças de tela usadas por todas as páginas:
//   Ui.esc(texto)            → texto seguro para colocar no HTML
//   Ui.ic('i-home')          → HTML de um ícone
//   Ui.toast(msg, tipo)      → aviso rápido (ok | erro | aviso)
//   Ui.erro(e)               → mostra o erro vindo do servidor
//   Ui.confirmar({...})      → janela Sim/Não (devolve Promise<boolean>)
//   Ui.janela({...})         → janela com campos (devolve o elemento)
//   Fmt.num / Fmt.data / Fmt.dataHora / Fmt.hoje
// ============================================================

const Ui = {
  esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  ic(nome, estilo) {
    return '<svg class="i"' + (estilo ? ' style="' + estilo + '"' : '') + '><use href="#' + nome + '"/></svg>';
  },

  toast(msg, tipo, titulo) {
    let area = document.querySelector('.toasts');
    if (!area) {
      area = document.createElement('div');
      area.className = 'toasts';
      document.body.appendChild(area);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + (tipo || 'ok');
    t.innerHTML = (titulo ? '<b>' + Ui.esc(titulo) + '</b>' : '') + Ui.esc(msg);
    area.appendChild(t);
    setTimeout(function () { t.remove(); }, tipo === 'erro' ? 7000 : 4000);
  },

  // Erro de uma chamada: mostra a mensagem que o servidor mandou.
  erro(e) {
    const msg = (e && e.message) || 'Erro inesperado.';
    Ui.toast(msg, 'erro', e && e.codigo === 'SEM_CONEXAO' ? 'Sem conexão' : 'Não foi possível concluir');
    if (!(e && e.codigo)) console.error(e);
  },

  // Janela genérica. corpo = HTML. botoes = [{ texto, classe, valor }]
  // (classe 'esq' põe o botão no canto esquerdo). largura = px (padrão 420).
  // Devolve Promise com o "valor" do botão clicado (ou null se fechou).
  // antesDeFechar(valor, caixa) pode devolver false (ou Promise<false>) para manter aberta.
  janela(opcoes) {
    return new Promise(function (resolver) {
      const fundo = document.createElement('div');
      fundo.className = 'modal-fundo';
      fundo.innerHTML =
        '<div class="modal-caixa" role="dialog" aria-modal="true"' + (opcoes.largura ? ' style="max-width:' + opcoes.largura + 'px"' : '') + '>' +
        '<h3>' + Ui.esc(opcoes.titulo || '') + (opcoes.subtitulo ? '<small>' + Ui.esc(opcoes.subtitulo) + '</small>' : '') + '</h3>' +
        '<div class="corpo">' + (opcoes.corpo || '') + '</div>' +
        '<div class="rodape">' + (opcoes.botoes || []).map(function (b, i) {
          return '<button class="btn2 ' + (b.classe || '') + '" data-i="' + i + '">' + Ui.esc(b.texto) + '</button>';
        }).join('') + '</div></div>';
      document.body.appendChild(fundo);
      const caixa = fundo.querySelector('.modal-caixa');
      const primeiro = caixa.querySelector('input, select, textarea');
      if (primeiro) setTimeout(function () { primeiro.focus(); }, 30);

      function fechar(valor) {
        document.removeEventListener('keydown', teclas);
        fundo.remove();
        resolver(valor);
      }
      async function clicar(valor) {
        if (opcoes.antesDeFechar && valor !== null) {
          const botoes = caixa.querySelectorAll('.rodape button');
          botoes.forEach(function (b) { b.disabled = true; });
          let ok = true;
          try { ok = await opcoes.antesDeFechar(valor, caixa); } catch (e) { ok = false; }
          botoes.forEach(function (b) { b.disabled = false; });
          if (ok === false) return;
        }
        fechar(valor);
      }
      function teclas(ev) {
        if (ev.key === 'Escape') fechar(null);
        if (ev.key === 'Enter' && opcoes.enterConfirma !== false) {
          const pri = (opcoes.botoes || []).findIndex(function (b) { return /pri|perigo/.test(b.classe || ''); });
          if (pri !== -1) { ev.preventDefault(); clicar(opcoes.botoes[pri].valor); }
        }
      }
      document.addEventListener('keydown', teclas);
      fundo.addEventListener('mousedown', function (ev) { if (ev.target === fundo) fechar(null); });
      caixa.querySelectorAll('.rodape button').forEach(function (b) {
        b.addEventListener('click', function () { clicar(opcoes.botoes[Number(b.dataset.i)].valor); });
      });
    });
  },

  confirmar(opcoes) {
    return Ui.janela({
      titulo: opcoes.titulo || 'Confirmar',
      corpo: '<p style="margin:0">' + Ui.esc(opcoes.texto || '') + '</p>',
      botoes: [
        { texto: opcoes.cancelar || 'Cancelar', valor: false },
        { texto: opcoes.ok || 'Confirmar', classe: opcoes.perigo ? 'perigo' : 'pri', valor: true }
      ]
    }).then(function (v) { return v === true; });
  },

  // Mostra/esconde a mensagem de erro de um formulário.
  msgErro(el, texto) {
    if (!el) return;
    el.textContent = texto || '';
    el.classList.toggle('vis', !!texto);
  }
};

// ---------- Formatação (padrão brasileiro) ----------
const Fmt = {
  // O formatador é criado uma vez por nº de casas e reaproveitado:
  // toLocaleString(...) cria um novo a cada chamada e pesa em listas grandes.
  _fmt: {},
  num(n, casas) {
    if (n === '' || n === null || n === undefined || isNaN(Number(n))) return '';
    const k = casas === undefined ? 'p' : casas;
    const f = this._fmt[k] || (this._fmt[k] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas === undefined ? 3 : casas }));
    return f.format(Number(n));
  },
  // O servidor manda datas como "2026-09-28T10:45:00" (ou já "dd/mm/aaaa").
  _d(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return null;
  },
  data(v) {
    const d = Fmt._d(v);
    if (!d) return v ? String(v) : '';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  },
  dataHora(v) {
    const d = Fmt._d(v);
    if (!d) return v ? String(v) : '';
    return Fmt.data(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  },
  hora(d) {
    d = d || new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return String(n).padStart(2, '0'); }).join(':');
  },
  // "terça-feira, 29 de setembro de 2026"
  hojeExtenso() {
    const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  },
  saudacao() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }
};

// ============================================================
// Botões só com ícone (vale para o sistema inteiro).
// Todo botão .btn2 que tem ícone esconde o texto; o texto vira
// a dica que aparece ao passar o mouse (title) e o nome lido
// pelo leitor de tela (aria-label). O contador (.n) vira uma
// bolinha no canto do ícone.
// Para manter o texto num botão específico: class="btn2 com-texto".
// ============================================================
(function () {
  function rotulo(b) {
    let t = '';
    b.childNodes.forEach(function (n) {
      if (n.nodeType === 3) t += n.textContent;
      else if (n.nodeType === 1 && n.tagName.toLowerCase() !== 'svg' && !n.classList.contains('n')) t += n.textContent;
    });
    return t.replace(/\s+/g, ' ').trim();
  }

  function ajustar(b) {
    if (b.classList.contains('com-texto') || b.closest('.bloqueio')) return;
    const ic = b.firstElementChild;
    if (!ic || ic.tagName.toLowerCase() !== 'svg') return;
    const r = rotulo(b) || b.getAttribute('aria-label') || b.title;
    if (!r) return;
    b.classList.add('so-icone');
    // Nome do ícone (ex.: i-imp) → a cor do botão segue o assunto.
    const u = ic.querySelector('use');
    const nome = u ? (u.getAttribute('href') || u.getAttribute('xlink:href') || '').replace('#', '') : '';
    if (b.dataset.ic !== nome) b.dataset.ic = nome;
    const n = b.querySelector('.n');
    const qtd = n ? n.textContent.trim() : '';
    // Na bolinha vai só o número ("todas · 8" → 8); o texto todo fica na dica.
    const num = (qtd.match(/\d+/g) || []).pop() || '';
    const vazio = !num || num === '0';
    if (n) { n.classList.toggle('vazio', vazio); if (n.dataset.num !== num) n.dataset.num = num; }
    const dica = r + (vazio ? '' : ' (' + qtd + ')');
    // Se a página já escreveu uma dica própria, ela é mantida.
    if (!b.title || b.dataset.dicaAuto === b.title) {
      b.title = dica;
      b.dataset.dicaAuto = dica;
    }
    b.setAttribute('aria-label', dica);
  }

  function varrer() {
    document.querySelectorAll('.btn2').forEach(ajustar);
  }

  let agendado = false;
  function agendar() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(function () { agendado = false; varrer(); });
  }

  function iniciar() {
    varrer();
    // Botões criados ou renomeados depois (janelas, painéis, "Salvando…")
    // e ícones trocados (ex.: Editar ↔ Travar no PCP).
    new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
