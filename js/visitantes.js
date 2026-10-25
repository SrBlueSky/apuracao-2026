/* visitantes.js — "N pessoas no site agora · M hoje", dentro das caixas "Anuncie aqui" e da página
 * Anuncie (elementos com a classe vis-contagem), a partir do contador da Cloudflare
 * (functions/apuracoes/api/visitas.js). Cada navegador guarda um código aleatório anônimo e
 * avisa o contador a cada 3 minutos enquanto a página está visível. Sem resposta (ex. no endereço
 * reserva do GitHub, que não tem o contador), a linha simplesmente não aparece. */
(function (window, document) {
  "use strict";

  var URL_APP = "https://pedrohipolito.com.br/apuracoes/api/visitas";
  var INTERVALO_MS = 3 * 60 * 1000;

  function ehApp() { return !!window.AndroidBridge || /[?&]app=1\b/.test(window.location.search); }

  function codigo() {
    var k = "apuracoes_visitante", id = null;
    try { id = localStorage.getItem(k); } catch (e) {}
    if (!id || !/^[a-z0-9]{12,40}$/.test(id)) {
      id = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/g, "").slice(0, 20);
      try { localStorage.setItem(k, id); } catch (e) {}
    }
    return id;
  }

  function fmt(n) { return Number(n).toLocaleString("pt-BR"); }

  var ultimo = null;

  // Preenche todas as linhas de contagem da página (as caixas de anúncio são redesenhadas de tempos
  // em tempos, por isso anuncios.js chama Visitantes.preencher() depois de cada desenho).
  function preencher() {
    if (!ultimo) return;
    var html = '<i aria-hidden="true"></i><span><b>' + fmt(ultimo.hoje) + "</b> " +
      (ultimo.hoje === 1 ? "pessoa entrou" : "pessoas entraram") + " hoje · <b>" + fmt(ultimo.agora) + "</b> no site agora</span>";
    Array.prototype.forEach.call(document.querySelectorAll(".vis-contagem"), function (el) {
      if (el._h !== html) { el._h = html; el.innerHTML = html; }
      el.hidden = false;
    });
  }

  function mostrar(d) { ultimo = d; preencher(); }

  function pingar() {
    if (document.visibilityState === "hidden") return;
    var url = (ehApp() ? URL_APP : "api/visitas") + "?id=" + codigo();
    fetch(url, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && isFinite(d.agora) && isFinite(d.hoje)) mostrar(d); })
      .catch(function () { /* sem contador: o selo não aparece */ });
  }

  function iniciar() {
    pingar();
    setInterval(pingar, INTERVALO_MS);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") pingar(); });
  }

  window.Visitantes = { preencher: preencher };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})(window, document);
