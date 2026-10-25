/* mapa-frente.js — traz para a frente o estado/país em destaque nos mapas (SVG não tem z-index):
 * sem isso, o contorno grosso fica escondido sob os vizinhos desenhados depois (ex. a Bahia).
 * Vale para passar o mouse, tocar, focar pelo teclado e para a seleção vinda do ranking. */
(function (document) {
  "use strict";

  var ALVO = ".mapa-svg path, .mundi-svg [data-pais]";

  function paraFrente(el) {
    if (!el || !el.parentNode || el.classList.contains("bolha")) return;
    var pai = el.parentNode;
    var bolha = pai.querySelector(":scope > .bolha"); // bolhas do mapa-múndi ficam sempre por cima
    if (bolha) { if (el.nextElementSibling !== bolha) pai.insertBefore(el, bolha); }
    else if (pai.lastElementChild !== el) pai.appendChild(el);
  }

  function doEvento(e) {
    var el = e.target && e.target.closest && e.target.closest(ALVO);
    if (el) paraFrente(el);
  }
  document.addEventListener("pointerover", doEvento);
  document.addEventListener("focusin", doEvento);

  // seleção feita por fora do mapa (lista, ranking, chip): quem ganhar a classe "sel" vem para a frente
  new MutationObserver(function (mud) {
    mud.forEach(function (m) {
      var el = m.target;
      if (el.classList && el.classList.contains("sel") && el.matches && el.matches(ALVO)) paraFrente(el);
    });
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["class"] });
})(document);
