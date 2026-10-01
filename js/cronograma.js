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
//   - Compara com o processo REAL: atrás da fase planejada = FORA DO CRONO.
//   - Passou o prazo do cliente = PRAZO VENCIDO.
//
// Uso:  Cronograma.status(op)    → { cls, label, fase, diasAtraso }
//       Cronograma.categoria(op) → 'VENCIDO' | 'FORA_CRONO' | 'NO_PRAZO' | 'OUTROS'
//       Cronograma.cor(op)       → cor do chip do processo
//       op precisa ter: prazo ('dd/mm/aaaa'), liga, processo, op, ultima, abertura
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
  const DIAS_PARADA = 4;

  // Situação da OP — UMA etiqueta, a mais grave vence:
  //   PRAZO VENCIDO     passou o prazo do CLIENTE (atraso de verdade)
  //   FORA DO CRONO.    o departamento passou do tempo combinado no
  //                     cronograma, mas o prazo do cliente ainda dá
  //   NO PRAZO / ADIANTADO   em dia com o cronograma
  // Engenharia (sem nº de OP) também segue o cronograma: se passar do
  // tempo combinado da fase dela, fica FORA DO CRONO.
  function status(op) {
    const h = hoje();
    const cron = cronograma(op);
    if (!cron) return { cls: 'future', label: 'SEM PRAZO', fase: null, diasAtraso: 0 };
    const prazo = parseBR(op.prazo);
    if (h > prazo) return { cls: 'bad', label: 'PRAZO VENCIDO', fase: null, diasAtraso: Math.floor((h - prazo) / 86400000) };
    let fase = fasePlanejadaParaDia(cron, h);
    const validas = cron.fases.filter(function (f) { return f.n !== 'BUFFER'; });
    const real = limpar(op.processo) || (op.op ? 'PLANEJAMENTO' : 'ENGENHARIA');
    const idxReal = validas.findIndex(function (f) { return f.n.toUpperCase() === real; });
    if (!fase && h >= prazo) fase = validas[validas.length - 1] || null;
    if (!fase) {
      // Ainda não chegou a hora de começar (pela conta reversa)
      const inicio = ['ENGENHARIA', 'VALIDAÇÃO TÉCNICA'].indexOf(real) !== -1 || idxReal === -1;
      return inicio ? { cls: 'future', label: 'AGUARDANDO INÍCIO', fase: null, diasAtraso: 0 }
                    : { cls: 'future', label: 'ADIANTADO', fase: validas[0] || null, diasAtraso: 0 };
    }
    const idxPlan = validas.findIndex(function (f) { return f.n === fase.n; });
    if (idxReal === -1 || idxReal === idxPlan) return { cls: 'ok', label: 'NO PRAZO', fase: fase, diasAtraso: 0 };
    if (idxReal > idxPlan) return { cls: 'future', label: 'ADIANTADO', fase: fase, diasAtraso: 0 };   // azul
    const diasAtraso = validas.slice(idxReal, idxPlan).reduce(function (s, f) { return s + f.d; }, 0);
    return { cls: 'late', label: 'FORA DO CRONO.', fase: fase, diasAtraso: diasAtraso };
  }

  // 'VENCIDO' | 'FORA_CRONO' | 'NO_PRAZO' | 'OUTROS'
  function categoria(op) {
    const l = status(op).label;
    if (l === 'PRAZO VENCIDO') return 'VENCIDO';
    if (l === 'FORA DO CRONO.') return 'FORA_CRONO';
    if (l === 'NO PRAZO' || l === 'ADIANTADO') return 'NO_PRAZO';
    return 'OUTROS';
  }

  // Cores e nomes iguais em todas as telas
  const COR = { VENCIDO: '#ef4444', FORA_CRONO: '#f97316', NO_PRAZO: '#22c55e', ENG: '#a855f7', NEUTRO: '#64748b' };
  const ROTULO = { VENCIDO: 'Prazo vencido', FORA_CRONO: 'Fora do crono.', NO_PRAZO: 'No prazo' };
  // Cor do "chip" do processo: alerta primeiro; senão engenharia (roxo),
  // em produção em dia (verde) ou aguardando (cinza).
  function cor(op, cat) {
    cat = cat || categoria(op);
    if (COR[cat] && cat !== 'NO_PRAZO') return COR[cat];
    if (!op.op) return COR.ENG;
    if (op.situacao === 'EM PRODUÇÃO') return COR.NO_PRAZO;
    return COR.NEUTRO;
  }

  // Dia de referência do "parado": último apontamento; se a OP nunca
  // foi apontada, a data de abertura da OP.
  function refParada(op) {
    const u = op.ultima && op.ultima !== '-' ? parseBR(String(op.ultima).split(' ')[0]) : null;
    return u || parseBR(op.abertura);
  }
  // "Parada": tem nº de OP e 4+ dias sem apontamento novo (só informativo;
  // não entra na situação).
  function parada(op) {
    if (!op.op) return false;
    const d = refParada(op);
    return !!d && Math.floor((hoje() - d) / 86400000) >= DIAS_PARADA;
  }
  function diasParada(op) {
    const d = refParada(op);
    return d ? Math.floor((hoje() - d) / 86400000) : 0;
  }

  return { cronograma: cronograma, status: status, categoria: categoria, parada: parada, diasParada: diasParada, parseBR: parseBR, cor: cor, COR: COR, ROTULO: ROTULO };
})();
