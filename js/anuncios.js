/* anuncios.js — espaços de publicidade do site público (nunca no app).
 *
 * Três espaços, sempre longe dos números da apuração (clique sem querer é proibido pelas regras de
 * redes como o AdSense): entre o frente a frente e os números gerais (aba Presidente), na coluna do
 * mapa (abaixo do ranking) e uma faixa acima do rodapé. Enquanto não há anunciante, cada espaço
 * mostra "Anuncie aqui" com o contato. Para trocar por um anúncio de verdade, basta preencher
 * ESPACOS[id].html (ou trocar render por um bloco de rede de anúncios) — os lugares ficam os mesmos.
 */
(function (window, document) {
  "use strict";

  var CONTATO = "contato@pedrohipolito.com.br";
  var ASSUNTO = "Anúncio no site Apurações";

  // onde: seletor do elemento de referência; como: "antes" dele ou "dentro" (no fim).
  var ESPACOS = {
    presidente: { onde: '#painel-presidente section[aria-labelledby="tituloNum"]', como: "antes", formato: "faixa", html: null },
    mapa: { onde: "#painel-mapa .mapa-lateral", como: "dentro", formato: "bloco", html: null },
    rodape: { onde: "footer.rodape", como: "antes", formato: "faixa", html: null }
  };

  function ehApp() {
    return !!window.AndroidBridge || /[?&]app=1\b/.test(window.location.search) ||
      document.documentElement.classList.contains("modo-app");
  }

  function convite() {
    var mailto = "mailto:" + CONTATO + "?subject=" + encodeURIComponent(ASSUNTO);
    return '<div class="anuncio-convite">' +
      '<div class="anuncio-txt"><strong>Anuncie aqui</strong>' +
      "<span>Seu negócio para quem acompanha a apuração ao vivo.</span></div>" +
      '<a class="anuncio-btn" href="' + mailto + '">' + CONTATO + "</a>" +
      '<small class="anuncio-regra">Não aceitamos anúncios de candidatos, partidos ou campanhas.</small>' +
      "</div>";
  }

  function montar(id, cfg) {
    var ref = document.querySelector(cfg.onde);
    if (!ref || document.getElementById("anuncio-" + id)) return;
    var caixa = document.createElement(cfg.formato === "faixa" ? "section" : "div");
    caixa.id = "anuncio-" + id;
    caixa.className = "anuncio anuncio-" + cfg.formato;
    caixa.setAttribute("aria-label", "Publicidade");
    caixa.innerHTML = (cfg.formato === "faixa" ? '<div class="wrap">' : "") +
      '<div class="anuncio-caixa"><span class="anuncio-rotulo">Publicidade</span>' +
      (cfg.html || convite()) + "</div>" +
      (cfg.formato === "faixa" ? "</div>" : "");
    if (cfg.como === "antes") ref.parentNode.insertBefore(caixa, ref);
    else ref.appendChild(caixa);
  }

  function iniciar() {
    if (ehApp()) return;
    Object.keys(ESPACOS).forEach(function (id) { montar(id, ESPACOS[id]); });
  }

  window.Anuncios = { CONTATO: CONTATO, ESPACOS: ESPACOS, iniciar: iniciar };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})(window, document);
