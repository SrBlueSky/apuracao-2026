/* baixar-app.js — botão "Baixar o app" (só no site, nunca dentro do app).
 * Android: baixa o APK mais recente direto. Computador: abre um QR Code para baixar no celular.
 * iPhone/iPad: não aparece (APK não instala em iOS).
 */
(function (window, document) {
  "use strict";

  var APK = "https://github.com/SrBlueSky/apuracao-2026/raw/main/Apuracao2026.apk";
  var ICONE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" ' +
    'd="M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4L11 12.2V3zM5 18h14v2H5z"/></svg>';

  function ehApp() {
    return !!window.AndroidBridge || /[?&]app=1\b/.test(window.location.search);
  }

  function tipo() {
    var ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
    if (/Android/i.test(ua)) return "android";
    return "pc";
  }

  function abrirQr() {
    var dlg = document.getElementById("baixarDialogo");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "baixarDialogo";
      dlg.className = "apoio-dialogo";
      var qr = "";
      if (typeof window.qrcode === "function") {
        var q = window.qrcode(0, "M"); q.addData(APK); q.make();
        qr = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
      }
      dlg.innerHTML = '<div class="apoio-cx"><button type="button" class="apoio-fechar" aria-label="Fechar">×</button>' +
        "<h2>App para Android</h2><p>Aponte a câmera do celular para o código e baixe o app. " +
        "Na instalação, o Android pode pedir para permitir apps desta fonte.</p>" +
        '<div class="apoio-qr" aria-label="QR Code para baixar o app">' + qr + "</div>" +
        '<p class="apoio-nota">Só para Android. No iPhone, use o site normalmente.</p></div>';
      dlg.querySelector(".apoio-fechar").addEventListener("click", function () { dlg.close(); });
      dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
      document.body.appendChild(dlg);
    }
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }

  function botao(classe, texto) {
    var t = tipo(), el;
    if (t === "android") {
      el = document.createElement("a");
      el.href = APK; el.setAttribute("download", "Apuracao2026.apk");
    } else {
      el = document.createElement("button");
      el.type = "button"; el.addEventListener("click", abrirQr);
    }
    el.className = "btn-apoio btn-baixar " + classe;
    el.setAttribute("aria-label", "Baixar o app para Android");
    el.innerHTML = ICONE + "<span>" + texto + "</span>";
    return el;
  }

  function iniciar() {
    if (ehApp() || tipo() === "ios") return;
    var topo = document.querySelector(".topo-dir"), tema = document.getElementById("btnTema");
    if (topo && !document.getElementById("btnBaixar")) {
      var b = botao("", "Baixar o app");
      b.id = "btnBaixar";
      topo.insertBefore(b, tema);
    }
    var rod = document.querySelector("footer.rodape .wrap");
    if (rod && !document.getElementById("rodBaixar")) {
      var p = document.createElement("p");
      p.id = "rodBaixar"; p.className = "rodape-apoio";
      p.appendChild(botao("", "Baixar o app para Android"));
      rod.appendChild(p);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})(window, document);
