/* visitantes.js — "N agora · M hoje" no topo, a partir do contador da Cloudflare
 * (functions/apuracoes/api/visitas.js). Cada navegador guarda um código aleatório anônimo e
 * avisa o contador a cada minuto enquanto a página está visível. Sem resposta (ex. no endereço
 * reserva do GitHub, que não tem o contador), o selo simplesmente não aparece. */
(function (window, document) {
  "use strict";

  var URL_APP = "https://pedrohipolito.com.br/apuracoes/api/visitas";
  var INTERVALO_MS = 60 * 1000;

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

  function mostrar(d) {
    var el = document.getElementById("visitantes");
    if (!el) {
      var topo = document.querySelector(".topo-dir");
      if (!topo) return;
      el = document.createElement("span");
      el.id = "visitantes"; el.className = "visitantes"; el.setAttribute("role", "status");
      topo.insertBefore(el, topo.firstChild);
    }
    el.innerHTML = '<i aria-hidden="true"></i><b>' + fmt(d.agora) + "</b>&nbsp;agora" +
      '<span class="vis-hoje"> · <b>' + fmt(d.hoje) + "</b>&nbsp;hoje</span>";
    el.title = fmt(d.agora) + " pessoas no site agora · " + fmt(d.hoje) + " passaram hoje";
  }

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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})(window, document);
