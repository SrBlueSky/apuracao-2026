/* anuncios.js — espaços de publicidade, lidos de anuncios.json (dados, nunca código).
 *
 * Para trocar um patrocinador basta editar e publicar o anuncios.json: o site e o app leem o
 * arquivo ao abrir e de novo a cada 10 minutos, sem precisar de versão nova do app.
 *
 * Três espaços, sempre longe dos números da apuração (clique sem querer é proibido pelas regras de
 * redes como o AdSense): entre o frente a frente e os números gerais (aba Presidente), na coluna do
 * mapa (abaixo do ranking) e uma faixa acima do rodapé. Espaço sem anúncio ativo mostra "Anuncie
 * aqui" no site; no app, só aparece anúncio com "mostrarNoApp": true (o convite nunca aparece lá).
 *
 * Formato de cada espaço em anuncios.json (todos os campos de texto opcionais, menos titulo):
 *   { "ativo": true, "mostrarNoApp": false, "anunciante": "Padaria Exemplo",
 *     "titulo": "…", "texto": "…", "botao": "Saiba mais", "link": "https://…",
 *     "imagem": "img/anuncios/arquivo.jpg", "de": "2026-10-25", "ate": "2026-10-31" }
 * Tudo vira texto escapado; links e imagens só https (ou imagem relativa em img/anuncios/).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Anuncios = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CONTATO = "contato@pedrohipolito.com.br";
  var ASSUNTO = "Anúncio no site Apurações";
  var INTERVALO_MS = 10 * 60 * 1000;
  // O site lê o arquivo ao lado dele; o app (file://) lê do site publicado, nesta ordem.
  var URLS_APP = [
    "https://pedrohipolito.com.br/apuracoes/anuncios.json",
    "https://srbluesky.github.io/apuracao-2026/anuncios.json"
  ];

  // onde: seletor do elemento de referência; como: "antes" dele ou "dentro" (no fim).
  var ESPACOS = {
    presidente: { onde: '#painel-presidente section[aria-labelledby="tituloNum"]', como: "antes", formato: "faixa" },
    mapa: { onde: "#painel-mapa .mapa-lateral", como: "dentro", formato: "bloco" },
    rodape: { onde: "footer.rodape", como: "antes", formato: "faixa" }
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function linkSeguro(u) {
    return typeof u === "string" && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : null;
  }

  function imagemSegura(u) {
    if (typeof u !== "string") return null;
    if (/^img\/anuncios\/[A-Za-z0-9._-]+$/.test(u)) return u;
    return linkSeguro(u);
  }

  // "AAAA-MM-DD" -> início (de) ou fim (ate) do dia em Brasília (UTC-3), em ms.
  function diaMs(s, fim) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    if (!m) return NaN;
    var base = Date.UTC(+m[1], +m[2] - 1, +m[3], 3, 0, 0);
    return fim ? base + 86400000 - 1 : base;
  }

  // Anúncio válido para mostrar agora (ou null). Regras: ativo, com título, dentro das datas e,
  // no app, só se mostrarNoApp. A imagem, se inválida, é descartada (o anúncio continua em texto).
  function anuncioValido(a, agoraMs, ehApp) {
    if (!a || typeof a !== "object" || a.ativo !== true) return null;
    if (typeof a.titulo !== "string" || !a.titulo.trim()) return null;
    if (ehApp && a.mostrarNoApp !== true) return null;
    var de = diaMs(a.de, false), ate = diaMs(a.ate, true);
    if (isFinite(de) && agoraMs < de) return null;
    if (isFinite(ate) && agoraMs > ate) return null;
    return {
      anunciante: typeof a.anunciante === "string" ? a.anunciante : "",
      titulo: a.titulo, texto: typeof a.texto === "string" ? a.texto : "",
      botao: typeof a.botao === "string" && a.botao.trim() ? a.botao : "Saiba mais",
      link: linkSeguro(a.link), imagem: imagemSegura(a.imagem)
    };
  }

  function htmlConvite() {
    var mailto = "mailto:" + CONTATO + "?subject=" + encodeURIComponent(ASSUNTO);
    return '<div class="anuncio-convite">' +
      '<div class="anuncio-txt"><strong>Anuncie aqui</strong>' +
      "<span>Seu negócio para quem acompanha a apuração ao vivo.</span></div>" +
      '<a class="anuncio-btn" href="' + mailto + '">' + CONTATO + "</a>" +
      '<small class="anuncio-regra">Não aceitamos anúncios de candidatos, partidos ou campanhas.</small>' +
      "</div>";
  }

  function htmlAnuncio(a) {
    var img = a.imagem ? '<img class="anuncio-img" src="' + esc(a.imagem) + '" alt="' + esc(a.anunciante || a.titulo) +
      '" loading="lazy" referrerpolicy="no-referrer">' : "";
    var btn = a.link ? '<a class="anuncio-btn" href="' + esc(a.link) + '" target="_blank" rel="sponsored noopener noreferrer">' +
      esc(a.botao) + "</a>" : "";
    return '<div class="anuncio-convite anuncio-pago' + (img ? " com-img" : "") + '">' + img +
      '<div class="anuncio-txt"><strong>' + esc(a.titulo) + "</strong>" +
      (a.texto ? "<span>" + esc(a.texto) + "</span>" : "") +
      (a.anunciante ? '<small class="anuncio-regra">Patrocinado por ' + esc(a.anunciante) + "</small>" : "") +
      "</div>" + btn + "</div>";
  }

  // HTML de um espaço: anúncio válido, senão convite (só no site), senão nada.
  function htmlEspaco(cfg, agoraMs, ehApp) {
    var a = anuncioValido(cfg, agoraMs, ehApp);
    if (a) return htmlAnuncio(a);
    return ehApp ? "" : htmlConvite();
  }

  // ---------------------------------------------------------------- DOM (só no navegador)
  function ehApp() {
    return !!window.AndroidBridge || /[?&]app=1\b/.test(window.location.search) ||
      document.documentElement.classList.contains("modo-app");
  }

  function aplicar(dados) {
    var app = ehApp(), agora = Date.now(), espacos = (dados && dados.espacos) || {};
    Object.keys(ESPACOS).forEach(function (id) {
      var lugar = ESPACOS[id], miolo = htmlEspaco(espacos[id], agora, app);
      var caixa = document.getElementById("anuncio-" + id);
      if (!miolo) { if (caixa) caixa.remove(); return; }
      if (!caixa) {
        var ref = document.querySelector(lugar.onde);
        if (!ref) return;
        caixa = document.createElement(lugar.formato === "faixa" ? "section" : "div");
        caixa.id = "anuncio-" + id;
        caixa.className = "anuncio anuncio-" + lugar.formato;
        caixa.setAttribute("aria-label", "Publicidade");
        if (lugar.como === "antes") ref.parentNode.insertBefore(caixa, ref);
        else ref.appendChild(caixa);
      }
      var html = (lugar.formato === "faixa" ? '<div class="wrap">' : "") +
        '<div class="anuncio-caixa"><span class="anuncio-rotulo">Publicidade</span>' + miolo + "</div>" +
        (lugar.formato === "faixa" ? "</div>" : "");
      if (caixa._h !== html) { caixa._h = html; caixa.innerHTML = html; }
    });
  }

  function buscar(url) {
    var u = url + (url.indexOf("?") < 0 ? "?" : "&") + "t=" + Math.floor(Date.now() / 300000); // cache de 5 min
    var rede = window.Site && typeof window.Site.urlRede === "function" ? window.Site.urlRede(u) : u;
    return fetch(rede, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // Site: o anuncios.json ao lado da página. App: os endereços publicados, um depois do outro.
  function carregar() {
    var lista = ehApp() ? URLS_APP.slice() : ["anuncios.json"];
    function tentar(i) {
      if (i >= lista.length) return Promise.resolve(null);
      return buscar(lista[i]).catch(function () { return tentar(i + 1); });
    }
    return tentar(0).then(function (dados) {
      if (dados) ultimo = dados;
      aplicar(ultimo);
      // O mesmo arquivo traz outras configurações remotas (ex. o botão de apoio, js/apoio.js).
      if (ultimo) document.dispatchEvent(new CustomEvent("apuracoes:config", { detail: ultimo }));
    });
  }

  var ultimo = null;
  function iniciar() {
    aplicar(null); // convite já na primeira pintura (no site); o arquivo chega logo depois
    carregar();
    setInterval(carregar, INTERVALO_MS);
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
  }

  return { CONTATO: CONTATO, ESPACOS: ESPACOS, URLS_APP: URLS_APP, anuncioValido: anuncioValido,
    htmlEspaco: htmlEspaco, esc: esc, diaMs: diaMs };
});
