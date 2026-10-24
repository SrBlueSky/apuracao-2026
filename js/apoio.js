/* apoio.js — botão "Apoie" com Pix (chave por e-mail), ligado e desligado pelo anuncios.json
 * ("apoio": { ativo, mostrarNoApp, chavePix, nome, cidade, texto }), sem atualizar o app.
 *
 * Mostra a chave com botão de copiar e um QR Code "Pix copia e cola" (BR Code estático, sem
 * valor: a pessoa escolhe quanto no app do banco). O QR é desenhado por js/vendor/qrcode.min.js
 * (qrcode-generator 1.4.4, local, nada de script de fora).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Apoio = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como o BR Code do Banco Central pede.
  function crc16(s) {
    var crc = 0xffff;
    for (var i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return ("000" + crc.toString(16).toUpperCase()).slice(-4);
  }

  function campo(id, valor) {
    return id + ("0" + valor.length).slice(-2) + valor;
  }

  // Nome e cidade do recebedor: sem acento, maiúsculas, no tamanho máximo do padrão (25 e 15).
  function limpar(s, max) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9 ]/g, "").toUpperCase().trim().slice(0, max);
  }

  // "Pix copia e cola" estático sem valor (EMV/BR Code).
  function brCode(chave, nome, cidade) {
    var conta = campo("00", "br.gov.bcb.pix") + campo("01", chave);
    var corpo = campo("00", "01") + campo("26", conta) + campo("52", "0000") + campo("53", "986") +
      campo("58", "BR") + campo("59", limpar(nome, 25) || "APOIO") + campo("60", limpar(cidade, 15) || "BRASIL") +
      campo("62", campo("05", "***")) + "6304";
    return corpo + crc16(corpo);
  }

  function configValida(c, ehApp) {
    if (!c || c.ativo !== true) return null;
    if (ehApp && c.mostrarNoApp === false) return null;
    var chave = typeof c.chavePix === "string" ? c.chavePix.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chave) || chave.length > 77) return null; // só chave e-mail
    return { chave: chave, nome: c.nome || "", cidade: c.cidade || "BRASIL",
      texto: typeof c.texto === "string" ? c.texto : "" };
  }

  // ---------------------------------------------------------------- DOM
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  var CORACAO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" ' +
    'd="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 4.4 2.5.8-1.4 2.3-2.5 4.4-2.5 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>';

  var atual = null;

  function ehApp() {
    return !!window.AndroidBridge || /[?&]app=1\b/.test(window.location.search) ||
      document.documentElement.classList.contains("modo-app");
  }

  function copiar(texto, botao) {
    function ok() { var t = botao.textContent; botao.textContent = "Copiado!"; setTimeout(function () { botao.textContent = t; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(ok, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = texto; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); ok(); } catch (e) { /* a chave continua visível para copiar à mão */ }
      ta.remove();
    }
  }

  function qrSvg(texto) {
    if (typeof window.qrcode !== "function") return "";
    var q = window.qrcode(0, "M");
    q.addData(texto); q.make();
    return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }

  function abrir() {
    if (!atual) return;
    var dlg = document.getElementById("apoioDialogo");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "apoioDialogo";
      dlg.className = "apoio-dialogo";
      dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
      document.body.appendChild(dlg);
    }
    var codigo = brCode(atual.chave, atual.nome, atual.cidade);
    dlg.innerHTML =
      '<div class="apoio-cx">' +
      '<button type="button" class="apoio-fechar" aria-label="Fechar">×</button>' +
      '<h2>Apoie o projeto</h2>' +
      (atual.texto ? "<p>" + esc(atual.texto) + "</p>" : "") +
      '<div class="apoio-qr" aria-label="QR Code do Pix">' + qrSvg(codigo) + "</div>" +
      '<p class="apoio-rot">Chave Pix (e-mail)</p>' +
      '<div class="apoio-chave"><code>' + esc(atual.chave) + '</code>' +
      '<button type="button" class="apoio-btn" data-copiar="chave">Copiar chave</button></div>' +
      '<button type="button" class="apoio-btn apoio-btn-2" data-copiar="codigo">Copiar Pix copia e cola</button>' +
      '<p class="apoio-nota">No app do seu banco: Pix → Pagar com QR Code ou Pix copia e cola. Você escolhe o valor.</p>' +
      "</div>";
    dlg.querySelector(".apoio-fechar").addEventListener("click", function () { dlg.close(); });
    Array.prototype.forEach.call(dlg.querySelectorAll("[data-copiar]"), function (b) {
      b.addEventListener("click", function () { copiar(b.getAttribute("data-copiar") === "chave" ? atual.chave : codigo, b); });
    });
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }

  function montarBotoes() {
    var topo = document.querySelector(".topo-dir"), status = document.getElementById("status");
    if (topo && !document.getElementById("btnApoio")) {
      var b = document.createElement("button");
      b.type = "button"; b.id = "btnApoio"; b.className = "btn-apoio";
      b.setAttribute("aria-label", "Apoie o projeto com Pix");
      b.innerHTML = CORACAO + "<span>Apoie</span>";
      b.addEventListener("click", abrir);
      topo.insertBefore(b, status ? status.nextSibling : topo.firstChild);
    }
    var rod = document.querySelector("footer.rodape .wrap");
    if (rod && !document.getElementById("rodApoio")) {
      var p = document.createElement("p");
      p.id = "rodApoio"; p.className = "rodape-apoio";
      p.innerHTML = '<button type="button" class="btn-apoio">' + CORACAO + "<span>Apoie com Pix</span></button>";
      p.querySelector("button").addEventListener("click", abrir);
      rod.appendChild(p);
    }
  }

  function desmontar() {
    ["btnApoio", "rodApoio"].forEach(function (id) { var el = document.getElementById(id); if (el) el.remove(); });
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    document.addEventListener("apuracoes:config", function (e) {
      atual = configValida(e.detail && e.detail.apoio, ehApp());
      if (atual) montarBotoes(); else desmontar();
    });
  }

  return { crc16: crc16, brCode: brCode, configValida: configValida, limpar: limpar };
});
