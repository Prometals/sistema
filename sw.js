// ============================================================
// sw.js — Service worker do app (PWA).
//
// O que ele faz:
//   1. Guarda no aparelho os arquivos FIXOS (CSS, JS, ícones) para
//      as telas abrirem mais rápido. Usa a cópia guardada e, ao mesmo
//      tempo, busca a versão nova no servidor para a próxima vez.
//   2. Páginas HTML e o config.js vêm SEMPRE do servidor primeiro
//      (só usa a cópia se estiver sem internet).
//   3. Sem internet e sem cópia → mostra "Sem conexão".
//
// O que ele NÃO faz: não guarda dados de produção. As chamadas ao
// backend (POST para o Apps Script, outro domínio) passam direto.
// ============================================================

const VERSAO = 'prometals-v5';   // mude (v2, v3…) se quiser forçar todos a baixarem tudo de novo
const FIXOS = [
  'css/tema.css', 'css/sistema.css',
  'js/icones.js', 'js/ui.js', 'js/api.js', 'js/sessao.js', 'js/shell.js', 'js/cronograma.js',
  'icones/icone-192.png', 'icones/icone-512.png', 'manifest.webmanifest'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(FIXOS); }).then(function () { return self.skipWaiting(); }));
});

// Apaga as cópias de versões antigas
self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (nomes) {
    return Promise.all(nomes.filter(function (n) { return n !== VERSAO; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (ev) {
  const req = ev.request;
  const url = new URL(req.url);
  // Só GET do próprio site. Backend (POST / outro domínio) passa direto.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  const ehPagina = req.mode === 'navigate' || url.pathname.endsWith('.html');
  const ehConfig = url.pathname.endsWith('/js/config.js');
  if (ehPagina || ehConfig) {
    ev.respondWith(primeiroServidor(req, ehPagina));
  } else {
    ev.respondWith(copiaEAtualiza(req));
  }
});

// Servidor primeiro; sem internet usa a cópia; sem cópia mostra "Sem conexão"
function primeiroServidor(req, ehPagina) {
  return fetch(req).then(function (resp) {
    if (resp.ok) { const copia = resp.clone(); caches.open(VERSAO).then(function (c) { c.put(req, copia); }); }
    return resp;
  }).catch(function () {
    return caches.match(req).then(function (guardada) {
      if (guardada) return guardada;
      return ehPagina ? paginaSemConexao() : Response.error();
    });
  });
}

// Usa a cópia na hora e atualiza em segundo plano
function copiaEAtualiza(req) {
  return caches.match(req).then(function (guardada) {
    const rede = fetch(req).then(function (resp) {
      if (resp.ok) { const copia = resp.clone(); caches.open(VERSAO).then(function (c) { c.put(req, copia); }); }
      return resp;
    }).catch(function () { return guardada || Response.error(); });
    return guardada || rede;
  });
}

function paginaSemConexao() {
  const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Sem conexão · Prometals</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1720;color:#e6edf3;font-family:system-ui,Arial,sans-serif;text-align:center;padding:24px}' +
    '.sq{width:56px;height:56px;border-radius:14px;background:#f07a1f;display:grid;place-items:center;font-weight:900;font-size:26px;color:#fff;margin:0 auto 18px}' +
    'h1{font-size:20px;margin:0 0 8px}p{color:#9eb0c1;margin:0 0 22px;line-height:1.5}button{height:44px;padding:0 22px;border-radius:10px;border:0;background:#f07a1f;color:#fff;font-weight:700;font-size:15px}</style></head>' +
    '<body><div><div class="sq">P</div><h1>Sem conexão</h1><p>O sistema precisa de internet para mostrar os dados da produção.<br>Verifique o Wi-Fi ou os dados móveis.</p>' +
    '<button onclick="location.reload()">Tentar de novo</button></div></body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
