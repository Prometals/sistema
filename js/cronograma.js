// ============================================================
// cronograma.js — Cronograma reverso da OP (a partir do prazo) e a
// classificação ATRASADA / NO PRAZO usada em TODO o sistema.
//
// Portado SEM MUDAR A LÓGICA do painel PCP antigo (cronogramaMON /
// statusOPMON / categoriaMON), que por sua vez veio do Track
// Planejamento e do BI Dashboard. Mesma regra em todas as telas:
//   - Ligas de disco (SFK, CRK, DRF): sequência de 25 dias úteis.
//   - Demais ligas (fundido): 2 d.u. de folga + 20 dias úteis.
//   - Conta de trás para frente a partir do prazo, pulando sábado e
//     domingo, e vê em qual fase a OP DEVERIA estar hoje.
//   - Compara com o processo REAL: atrás da fase planejada = ATRASADO.
//
// Uso:  Cronograma.status(op)    → { cls, label, fase, diasAtraso }
//       Cronograma.categoria(op) → 'ATRASADO' | 'NO_PRAZO' | 'OUTROS'
//       op precisa ter: prazo ('dd/mm/aaaa'), liga, processo
// ============================================================

const Cronograma = (function () {
  const LIGAS_DISCO = ['SFK', 'CRK', 'DRF'];
  const SEQ_DISCO = [
    { n: 'VALIDAÇÃO TÉCNICA', d: 2 }, { n: 'ENGENHARIA', d: 2 }, { n: 'PLANEJAMENTO', d: 1 },
    { n: 'MODELAÇÃO', d: 1 }, { n: 'MOLDAGEM', d: 3 }, { n: 'PINTURA', d: 1 }, { n: 'FUSÃO', d: 1 },
    { n: 'REBARBAÇÃO', d: 2 }, { n: 'TRATAMENTO TÉRMICO', d: 3 }, { n: 'JATEAMENTO', d: 1 },
    { n: 'USINAGEM', d: 3 }, { n: 'BALANCEAMENTO EXTERNO', d: 3 }, { n: 'INSPEÇÃO FINAL', d: 1 }, { n: 'EXPEDIÇÃO', d: 1 }
  ];
  const SEQ_FUNDIDO = [
    { n: 'BUFFER', d: 2 }, { n: 'VALIDAÇÃO TÉCNICA', d: 2 }, { n: 'ENGENHARIA', d: 2 }, { n: 'PLANEJAMENTO', d: 1 },
    { n: 'MODELAÇÃO', d: 1 }, { n: 'MOLDAGEM', d: 3 }, { n: 'PINTURA', d: 1 }, { n: 'FUSÃO', d: 1 },
    { n: 'REBARBAÇÃO', d: 2 }, { n: 'TRATAMENTO TÉRMICO', d: 3 }, { n: 'JATEAMENTO', d: 1 },
    { n: 'INSPEÇÃO FINAL', d: 1 }, { n: 'EXPEDIÇÃO', d: 1 }
  ];

  const ehDisco = function (liga) { return LIGAS_DISCO.indexOf(String(liga || '').toUpperCase().trim()) !== -1; };
  const hoje = function () { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  function parseBR(v) {
    if (!v || v === '-') return null;
    const p = String(v).split('/');
    if (p.length < 3) return null;
    const d = new Date(parseInt(p[2], 10), parseInt(p[1], 10) - 1, parseInt(p[0], 10));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function addDU(d, n) { const c = new Date(d); let r = n; while (r > 0) { c.setDate(c.getDate() + 1); if (c.getDay() !== 0 && c.getDay() !== 6) r--; } return c; }
  function subDU(d, n) { const c = new Date(d); let r = n; while (r > 0) { c.setDate(c.getDate() - 1); if (c.getDay() !== 0 && c.getDay() !== 6) r--; } return c; }
  function proxDU(d) { const c = new Date(d); while (c.getDay() === 0 || c.getDay() === 6) c.setDate(c.getDate() + 1); return c; }

  function cronograma(op) {
    const prazo = parseBR(op.prazo);
    if (!prazo) return null;
    const seq = ehDisco(op.liga) ? SEQ_DISCO : SEQ_FUNDIDO;
    const totalDU = seq.reduce(function (s, p) { return s + p.d; }, 0);
    const ini = proxDU(subDU(prazo, totalDU));
    const fases = [];
    let cur = new Date(ini);
    seq.forEach(function (p) {
      cur = proxDU(cur);
      const fim = addDU(cur, p.d);
      fases.push({ n: p.n, ini: new Date(cur), fim: new Date(fim), d: p.d });
      cur = new Date(fim);
    });
    return { ini: ini, prazo: prazo, fases: fases };
  }

  function fasePlanejadaParaDia(cron, dia) {
    if (!cron) return null;
    for (let i = 0; i < cron.fases.length; i++) {
      const f = cron.fases[i];
      if (f.n === 'BUFFER') continue;
      if (dia >= f.ini && dia < f.fim) return f;
    }
    return null;
  }

  const limpar = function (p) { return String(p || '').replace(/ - INICIADO| - FINALIZADO/g, '').trim().toUpperCase(); };
  const semMov = function (r) { return !r || r === 'SEM MOVIMENTAÇÃO' || r === 'AGUARDANDO PROCESSO'; };

  function status(op) {
    const h = hoje();
    const cron = cronograma(op);
    if (!cron) return { cls: 'future', label: 'SEM PRAZO', fase: null, diasAtraso: 0 };
    const prazo = parseBR(op.prazo);
    const diasAtrasoPrazo = Math.floor((h - prazo) / 86400000);
    let fase = fasePlanejadaParaDia(cron, h);
    if (!fase && h >= prazo) {
      const validas = cron.fases.filter(function (f) { return f.n !== 'BUFFER'; });
      fase = validas[validas.length - 1] || null;
    }
    if (!fase) {
      if (h > prazo) return { cls: 'bad', label: 'PRAZO VENCIDO', fase: null, diasAtraso: diasAtrasoPrazo };
      const realCedo = limpar(op.processo);
      if (!semMov(realCedo)) {
        const validasCedo = cron.fases.filter(function (f) { return f.n !== 'BUFFER'; });
        return { cls: 'future', label: 'ADIANTADO', fase: validasCedo[0] || null, diasAtraso: 0 };
      }
      return { cls: 'future', label: 'AGUARDANDO INÍCIO', fase: null, diasAtraso: 0 };
    }
    const real = limpar(op.processo);
    const plan = fase.n.toUpperCase();
    if (semMov(real)) return { cls: 'warn', label: 'SEM MOVIMENTAÇÃO', fase: fase, diasAtraso: 0 };
    if (real === plan) return { cls: 'ok', label: 'NO PRAZO', fase: fase, diasAtraso: 0 };
    const idxReal = cron.fases.findIndex(function (f) { return f.n.toUpperCase() === real; });
    const idxPlan = cron.fases.findIndex(function (f) { return f.n === fase.n; });
    if (idxReal > idxPlan) return { cls: 'ok', label: 'ADIANTADO', fase: fase, diasAtraso: 0 };
    const diasAtraso = idxPlan - idxReal > 0 ? cron.fases.slice(idxReal, idxPlan).reduce(function (s, f) { return s + f.d; }, 0) : 0;
    return { cls: 'bad', label: 'ATRASADO', fase: fase, diasAtraso: diasAtraso };
  }

  function categoria(op) {
    const st = status(op);
    if (st.label === 'ATRASADO' || st.label === 'PRAZO VENCIDO') return 'ATRASADO';
    if (st.label === 'NO PRAZO' || st.label === 'ADIANTADO') return 'NO_PRAZO';
    return 'OUTROS';
  }

  // "Parada" (mesma regra do PCP antigo e do BI): já está em produção e
  // está há 4 dias ou mais sem nenhuma movimentação nova.
  function parada(op) {
    if (op.situacao !== 'EM PRODUÇÃO' || !op.ultima || op.ultima === '-') return false;
    const d = parseBR(String(op.ultima).split(' ')[0]);
    return !!d && Math.floor((hoje() - d) / 86400000) >= 4;
  }
  function diasParada(op) {
    const d = parseBR(String(op.ultima || '').split(' ')[0]);
    return d ? Math.floor((hoje() - d) / 86400000) : 0;
  }

  return { cronograma: cronograma, status: status, categoria: categoria, parada: parada, diasParada: diasParada, parseBR: parseBR };
})();
