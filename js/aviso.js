/* aviso.js — faixa de aviso no topo de todas as abas (site e app), ligada e escrita pelo
 * anuncios.json ("aviso": { ativo, titulo, texto }), sem atualizar o app. Ex.: 25/10, quando o
 * TSE pausou a divulgação após a prorrogação da votação. Só texto (escapado), nunca HTML. */
(function (document) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  document.addEventListener("apuracoes:config", function (e) {
    var a = e.detail && e.detail.aviso, el = document.getElementById("avisoGeral");
    if (!a || a.ativo !== true || !a.texto) { if (el) el.remove(); return; }
    if (!el) {
      var main = document.getElementById("conteudo");
      if (!main) return;
      el = document.createElement("div");
      el.id = "avisoGeral"; el.className = "aviso-geral"; el.setAttribute("role", "status");
      main.parentNode.insertBefore(el, main);
    }
    var html = '<div class="wrap"><strong>' + esc(a.titulo || "Aviso") + "</strong> <span>" + esc(a.texto) + "</span></div>";
    if (el._h !== html) { el._h = html; el.innerHTML = html; }
  });
})(document);
