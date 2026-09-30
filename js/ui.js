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
  num(n, casas) {
    if (n === '' || n === null || n === undefined || isNaN(Number(n))) return '';
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas === undefined ? 3 : casas });
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
