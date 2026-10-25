/* ajustes-site.js — botão de AJUSTES (engrenagem) no cabeçalho do SITE (no app, quem cuida é o modo-app.js).
 * Itens: tema escuro (só na visita; o site sempre abre no claro), manter a tela ligada (Screen Wake Lock),
 * avisos da apuração (Notification API, só com o site aberto) e baixar o app (Android).
 * Os avisos usam os dados que o site já carrega (Site.S.br), pelo gancho Site.aoRenderizar.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AjustesSite = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MARCOS = [25, 50, 75, 100];
  var LS_AVISOS = "apuracoes_6258_avisos";    // "1" quando o usuário ligou os avisos
  var LS_MARCOS = "apuracoes_6258_marcos";    // marcos de % das seções já avisados (JSON)
  var LS_TELA = "apuracoes_6258_tela";        // "1" quando pediu para manter a tela ligada
  var APK = "https://github.com/SrBlueSky/apuracao-2026/raw/main/Apuracao2026.apk";

  // ------------------------------------------------------------ lógica pura (testável)
  function fmtPct(v) { return (Math.round(v * 10) / 10).toFixed(1).replace(".", ","); }

  // est = { lider: "13"|"22"|null, marcos: [25,...] }; d = disputa do presidente (C.visaoNacional(...).d);
  // nomes = { "13": "Lula", "22": "Flávio Bolsonaro" }. Devolve { est, eventos:[{titulo,texto}] }.
  // silencioso = só registra o ponto de partida, sem gerar avisos.
  function avaliar(est, d, nomes, silencioso) {
    var novo = { lider: est && est.lider || null, marcos: ((est && est.marcos) || []).slice() };
    var eventos = [];
    if (!d || !d.temVotos) return { est: novo, eventos: eventos };
    var placar = nomes[d.a.n] + " " + fmtPct(d.a.pct) + "% × " + nomes[d.b.n] + " " + fmtPct(d.b.pct) + "% dos votos válidos";
    if (d.lider) {
      if (novo.lider && novo.lider !== d.lider && !silencioso) {
        eventos.push({ titulo: nomes[d.lider] + " passou à frente", texto: placar + ". Apuração em andamento: o resultado ainda pode mudar." });
      }
      novo.lider = d.lider;
    }
    var maior = null;
    MARCOS.forEach(function (m) {
      if (d.pst >= m - 1e-9 && novo.marcos.indexOf(m) < 0) { novo.marcos.push(m); maior = m; }
    });
    if (maior !== null && !silencioso) {
      eventos.push({
        titulo: maior === 100 ? "Apuração chegou a 100% das seções" : "Apuração passou de " + maior + "% das seções",
        texto: placar + "."
      });
    }
    return { est: novo, eventos: eventos };
  }

  // ------------------------------------------------------------ navegador
  var navegador = typeof window !== "undefined" && typeof document !== "undefined";
  var estado = { est: { lider: null, marcos: [] }, base: false, wake: null, dlg: null };

  function ehApp() { return !!window.AndroidBridge || /[?&]app=1\b/.test(window.location.search); }
  function ehAndroid() { return /Android/i.test(navigator.userAgent || ""); }
  function lerLS(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function gravarLS(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* sem storage */ } }
  function temWake() { return !!(navigator.wakeLock && typeof navigator.wakeLock.request === "function"); }
  function temAviso() { return typeof window.Notification === "function"; }
  function escuro() { return document.documentElement.getAttribute("data-theme") === "dark"; }

  // ---- manter a tela ligada
  function pedirWake() {
    if (!temWake() || estado.wake || document.visibilityState !== "visible") return;
    navigator.wakeLock.request("screen").then(function (w) {
      estado.wake = w;
      w.addEventListener("release", function () { estado.wake = null; });
    }, function () { estado.wake = null; });
  }
  function soltarWake() { var w = estado.wake; estado.wake = null; if (w && w.release) { try { w.release(); } catch (e) { /* ignora */ } } }
  function aplicarTela(on) { if (on) pedirWake(); else soltarWake(); }

  // ---- avisos
  var registro = null;
  function garantirSW() {
    if (registro || !("serviceWorker" in navigator)) return registro;
    try {
      registro = navigator.serviceWorker.register("js/sw-avisos.js", { scope: "js/" }).catch(function () { return null; });
    } catch (e) { registro = null; }
    return registro;
  }
  function mostrar(ev) {
    var opc = { body: ev.texto, tag: "apuracao-6258", icon: "img/favicon.svg", renotify: true };
    try { var n = new window.Notification(ev.titulo, opc); n.onclick = function () { window.focus(); n.close(); }; return; } catch (e) { /* Chrome do Android */ }
    var p = garantirSW();
    if (p && p.then) p.then(function (r) { return r && navigator.serviceWorker.ready.then(function (reg) { return reg.showNotification(ev.titulo, opc); }); }).catch(function () {});
  }
  function avisosLigados() { return lerLS(LS_AVISOS) === "1" && temAviso() && window.Notification.permission === "granted"; }

  function dadosAtuais() {
    var S = window.Site;
    if (!S || !S.S || !S.S.br || S.DEMO) return null;       // demonstração: dados falsos nunca geram aviso
    return S.C.visaoNacional(S.S.br, S.PT).d;
  }
  function nomes() { var P = window.Site.C.PRES; return { "13": P["13"].nome, "22": P["22"].nome }; }
  function lerMarcos() { try { var v = JSON.parse(lerLS(LS_MARCOS) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }

  // ponto de partida ao ligar: o que já passou não gera aviso
  function baseline() {
    var d = dadosAtuais();
    estado.est = { lider: null, marcos: [] };
    if (d) estado.est = avaliar(estado.est, d, nomes(), true).est;
    gravarLS(LS_MARCOS, JSON.stringify(estado.est.marcos));
    estado.base = true;
  }
  function aoRenderizar() {
    if (!avisosLigados()) return;
    var d = dadosAtuais();
    if (!d || !d.temVotos) return;
    if (!estado.base) {          // site recém-aberto: marcos já avisados vêm do armazenamento; a liderança parte do estado atual
      estado.est = { lider: null, marcos: lerMarcos() };
      estado.est = avaliar(estado.est, d, nomes(), true).est;   // fixa a liderança sem avisar...
      estado.est.marcos = lerMarcos();                           // ...mas marcos novos desde a última visita ainda avisam
      estado.base = true;
    }
    var r = avaliar(estado.est, d, nomes(), false);
    estado.est = r.est;
    gravarLS(LS_MARCOS, JSON.stringify(r.est.marcos));
    r.eventos.forEach(mostrar);
  }

  // ------------------------------------------------------------ interface
  var ENGRENAGEM = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill-rule="evenodd" d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm8.2 4.6.1-1.2-.1-1.2 1.9-1.5a.5.5 0 0 0 .1-.6l-1.8-3.1a.5.5 0 0 0-.6-.2l-2.3.9a8 8 0 0 0-2-1.2l-.3-2.4a.5.5 0 0 0-.5-.4H10.4a.5.5 0 0 0-.5.4l-.3 2.4a8 8 0 0 0-2 1.2l-2.3-.9a.5.5 0 0 0-.6.2L3 8.7a.5.5 0 0 0 .1.6L5 10.8l-.1 1.2.1 1.2-1.9 1.5a.5.5 0 0 0-.1.6l1.8 3.1c.1.2.4.3.6.2l2.3-.9c.6.5 1.3.9 2 1.2l.3 2.4c0 .2.3.4.5.4h3.6c.2 0 .5-.2.5-.4l.3-2.4c.7-.3 1.4-.7 2-1.2l2.3.9c.2.1.5 0 .6-.2l1.8-3.1a.5.5 0 0 0-.1-.6z" fill="currentColor"/></svg>';
  var ICONE_BAIXAR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4L11 12.2V3zM5 18h14v2H5z"/></svg>';

  function linha(id, titulo, desc, ok, motivo) {
    return '<label class="ajs-linha' + (ok ? "" : " desativado") + '" for="' + id + '"><span class="ajs-txt"><b>' + titulo + "</b><small id=\"" + id + 'Desc">' +
      (ok ? desc : motivo) + '</small></span><input type="checkbox" role="switch" id="' + id + '"' + (ok ? "" : " disabled") +
      '><i class="ajs-chave" aria-hidden="true"></i></label>';
  }

  function montarDialogo() {
    var dlg = document.createElement("dialog");
    dlg.id = "ajustesDialogo"; dlg.className = "apoio-dialogo ajs-dialogo";
    dlg.setAttribute("aria-labelledby", "ajsTitulo");
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.innerHTML = '<div class="apoio-cx"><button type="button" class="apoio-fechar" aria-label="Fechar">×</button>' +
      '<h2 id="ajsTitulo">Ajustes</h2>' +
      linha("ajsTema", "Tema escuro", "Só vale nesta visita: o site sempre abre no tema claro.", true) +
      linha("ajsTela", "Manter a tela ligada", "A tela não apaga enquanto o site está aberto. Gasta mais bateria.", temWake(), "Seu navegador não permite.") +
      linha("ajsAvisos", "Avisos da apuração", "Avisa quando a liderança mudar e quando a apuração passar de 25%, 50%, 75% e 100% das seções.", temAviso(), "Seu navegador não permite.") +
      '<p class="ajs-msg" id="ajsMsg" role="status"></p>' +
      (ehAndroid() ? '<a class="apoio-btn ajs-baixar" href="' + APK + '" download="Apuracao2026.apk">' + ICONE_BAIXAR + "<span>Baixar o app para Android</span></a>" : "") +
      '<p class="apoio-nota">Os avisos só funcionam com o site aberto. Para avisos com o site fechado, use o app (Android).</p></div>';
    document.body.appendChild(dlg);
    dlg.querySelector(".apoio-fechar").addEventListener("click", function () { dlg.close(); });

    var tema = dlg.querySelector("#ajsTema"), tela = dlg.querySelector("#ajsTela"), av = dlg.querySelector("#ajsAvisos"), msg = dlg.querySelector("#ajsMsg");
    tema.addEventListener("change", function () { document.documentElement.setAttribute("data-theme", tema.checked ? "dark" : "light"); });
    tela.addEventListener("change", function () { gravarLS(LS_TELA, tela.checked ? "1" : "0"); aplicarTela(tela.checked); });
    av.addEventListener("change", function () {
      msg.textContent = "";
      if (!av.checked) { gravarLS(LS_AVISOS, "0"); estado.base = false; return; }
      if (!temAviso()) { av.checked = false; return; }
      var ligar = function () {
        gravarLS(LS_AVISOS, "1"); baseline(); av.checked = true;
        msg.textContent = "Avisos ligados. Deixe o site aberto (pode ser em outra aba).";
        garantirSW();
      };
      var perm = window.Notification.permission;
      if (perm === "granted") { ligar(); return; }
      if (perm === "denied") { av.checked = false; msg.textContent = "As notificações estão bloqueadas para este site. Libere nas configurações do navegador (cadeado ao lado do endereço) e tente de novo."; return; }
      av.checked = false;
      var fim = function (p) {
        if (p === "granted") ligar();
        else msg.textContent = "Sem a permissão do navegador não dá para avisar. Você pode tentar de novo quando quiser.";
      };
      try {
        var pr = window.Notification.requestPermission(fim);
        if (pr && typeof pr.then === "function") pr.then(fim);
      } catch (e) { msg.textContent = "Seu navegador não conseguiu pedir a permissão."; }
    });
    estado.dlg = dlg;
    return dlg;
  }

  function sincronizar() {
    var dlg = estado.dlg; if (!dlg) return;
    dlg.querySelector("#ajsTema").checked = escuro();
    dlg.querySelector("#ajsTela").checked = temWake() && lerLS(LS_TELA) === "1";
    dlg.querySelector("#ajsAvisos").checked = avisosLigados();
    var msg = dlg.querySelector("#ajsMsg");
    if (temAviso() && window.Notification.permission === "denied") {
      msg.textContent = "As notificações estão bloqueadas para este site. Libere nas configurações do navegador (cadeado ao lado do endereço) para usar os avisos.";
    }
  }

  function abrir() {
    var dlg = estado.dlg || montarDialogo();
    sincronizar();
    if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute("open", "");
  }

  function montarBotao() {
    var topo = document.querySelector(".topo-dir"), tema = document.getElementById("btnTema");
    if (!topo || document.getElementById("btnAjustes")) return;
    var b = document.createElement("button");
    b.type = "button"; b.id = "btnAjustes"; b.className = "btn-tema btn-ajustes";
    b.setAttribute("aria-label", "Ajustes"); b.title = "Ajustes";
    b.innerHTML = ENGRENAGEM;
    b.addEventListener("click", abrir);
    topo.insertBefore(b, tema && tema.parentNode === topo ? tema : null);
  }

  function iniciar() {
    if (ehApp()) return;
    montarBotao();
    // o botão de sol/lua do cabeçalho muda o data-theme: o interruptor acompanha
    try { new MutationObserver(sincronizar).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); } catch (e) { /* ignora */ }
    // a tela ligada é re-pedida ao voltar para a aba (o navegador solta o bloqueio ao esconder)
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && lerLS(LS_TELA) === "1") pedirWake();
    });
    if (lerLS(LS_TELA) === "1") pedirWake();
    if (window.Site && typeof window.Site.aoRenderizar === "function") window.Site.aoRenderizar(aoRenderizar);
    if (avisosLigados()) garantirSW();
    try { if (/[?&]ajustes=1\b/.test(window.location.search)) abrir(); } catch (e) { /* ignora */ }
  }

  if (navegador) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
  }

  return { avaliar: avaliar, MARCOS: MARCOS };
});
