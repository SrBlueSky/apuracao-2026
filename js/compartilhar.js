/* compartilhar.js — botão "Compartilhar" no cabeçalho.
 * Celular (navegador): abre a folha de compartilhar do sistema (navigator.share).
 * Computador e app: abre um diálogo com WhatsApp, X, Facebook, Telegram e "Copiar link".
 * A URL é sempre a do site oficial, mesmo no endereço reserva ou dentro do app.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Compartilhar = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var URL_SITE = "https://pedrohipolito.com.br/apuracoes/";
  var TITULO = "Apurações 2026 · 2º turno ao vivo";
  var TEXTO = "Acompanhe AO VIVO a apuração do 2º turno das eleições 2026: presidente, governadores e mapa por estado 👉";

  var ICONE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="18" cy="5" r="3" fill="currentColor"/>' +
    '<circle cx="6" cy="12" r="3" fill="currentColor"/><circle cx="18" cy="19" r="3" fill="currentColor"/>' +
    '<path d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2" stroke="currentColor" stroke-width="2" fill="none"/></svg>';

  function links(texto, url) {
    var junto = encodeURIComponent(texto + " " + url);
    return [
      { id: "whatsapp", nome: "WhatsApp", href: "https://wa.me/?text=" + junto },
      { id: "x", nome: "X", href: "https://x.com/intent/post?text=" + encodeURIComponent(texto) + "&url=" + encodeURIComponent(url) },
      { id: "facebook", nome: "Facebook", href: "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url) },
      { id: "telegram", nome: "Telegram", href: "https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(texto) }
    ];
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function ehApp() { return !!window.AndroidBridge; }

  function copiar(texto, botao) {
    function ok() { var t = botao.textContent; botao.textContent = "Copiado!"; setTimeout(function () { botao.textContent = t; }, 1800); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = texto; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); ok(); } catch (e) { /* o link continua visível no texto */ }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(ok, fallback);
    } else fallback();
  }

  function abrirDialogo() {
    var dlg = document.getElementById("compartilharDialogo");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "compartilharDialogo";
      dlg.className = "apoio-dialogo";
      dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
      document.body.appendChild(dlg);
    }
    dlg.innerHTML =
      '<div class="apoio-cx">' +
      '<button type="button" class="apoio-fechar" aria-label="Fechar">×</button>' +
      "<h2>Compartilhar</h2>" +
      '<p class="comp-texto">' + esc(TEXTO) + " " + esc(URL_SITE) + "</p>" +
      '<div class="comp-lista">' +
      links(TEXTO, URL_SITE).map(function (l) {
        return '<a class="apoio-btn comp-link comp-' + l.id + '" href="' + esc(l.href) +
          '" target="_blank" rel="noopener noreferrer">' + l.nome + "</a>";
      }).join("") +
      '<button type="button" class="apoio-btn apoio-btn-2 comp-copiar">Copiar link</button>' +
      "</div></div>";
    dlg.querySelector(".apoio-fechar").addEventListener("click", function () { dlg.close(); });
    var cp = dlg.querySelector(".comp-copiar");
    cp.addEventListener("click", function () { copiar(URL_SITE, cp); });
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }

  function clicar() {
    if (typeof navigator.share === "function" && !ehApp()) {
      var p;
      try { p = navigator.share({ title: TITULO, text: TEXTO, url: URL_SITE }); } catch (e) { abrirDialogo(); return; }
      if (p && typeof p.catch === "function") p.catch(function (e) {
        if (!e || e.name !== "AbortError") abrirDialogo(); // cancelar a folha não abre o diálogo
      });
    } else abrirDialogo();
  }

  function montar() {
    var topo = document.querySelector(".topo-dir"), tema = document.getElementById("btnTema");
    if (!topo || document.getElementById("btnCompartilhar")) return;
    var b = document.createElement("button");
    b.type = "button"; b.id = "btnCompartilhar"; b.className = "btn-tema btn-comp";
    b.setAttribute("aria-label", "Compartilhar o site");
    b.title = "Compartilhar";
    b.innerHTML = ICONE + "<span>Compartilhar</span>";
    b.addEventListener("click", clicar);
    topo.insertBefore(b, tema && tema.parentNode === topo ? tema : null);
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
    else montar();
  }

  return { links: links, URL_SITE: URL_SITE, TITULO: TITULO, TEXTO: TEXTO };
});
