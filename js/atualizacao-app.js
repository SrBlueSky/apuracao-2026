/* atualizacao-app.js — banner "Nova versão disponível" do app Android e a ponte de atualização
 * dentro do próprio app.
 *
 * Contrato com o lado Java (MainActivity chama via evaluateJavascript):
 *     window.AtualizacaoApp.estado(tipo, valor)
 *       "baixando"  valor = 0..100   -> barra de progresso
 *       "permissao"                  -> pede a autorização "Permitir desta fonte"
 *       "instalando"                 -> "toque em Atualizar na janela do Android"
 *       "concluido"                  -> "Atualizado!"
 *       "erro"      valor = mensagem -> erro + "Tentar de novo" + "baixar pelo navegador"
 *       "cancelado"                  -> volta ao banner normal (Atualizar / Agora não)
 *   Quem toca em "Atualizar" chama window.AndroidBridge.atualizarApp(urlDoApk) se a função existir;
 *   senão (versões antigas do app, PC) abre o link do APK com openExternal.
 *
 * Este arquivo é carregado SEMPRE e define window.AtualizacaoApp de forma síncrona, para o Java
 * poder chamar a qualquer momento sem erro (mesmo sem banner na tela, mesmo com valores estranhos).
 * UMD: no Node, exporta { criar, descrever } (testado em tests/atualizacao-app.test.js).
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.AtualizacaoUI = api; root.AtualizacaoApp = api.criar(root); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var LS_IGNORADA = "apuracao2026.versaoIgnorada"; // mesma chave de antes: quem tocou "Agora não" não vê de novo

  // Texto e botões de cada situação (puro, sem DOM). Ações: atualizar | depois | navegador.
  function descrever(tipo, valor, remoto) {
    var notas = remoto && remoto.notas ? String(remoto.notas) : "";
    switch (tipo) {
      case "baixando": {
        var n = Number(valor);
        var pct = isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
        return { modo: "progresso", texto: "Baixando a nova versão… " + pct + "%", progresso: pct, botoes: [], link: null };
      }
      case "permissao":
        return {
          modo: "aviso", progresso: null, link: null,
          texto: "Falta uma autorização: na tela que vai abrir, ative “Permitir desta fonte” e depois volte para o app.",
          botoes: [{ rotulo: "Abrir autorização", acao: "atualizar" }]
        };
      case "instalando":
        return { modo: "aviso", progresso: null, link: null, texto: "Quase lá: toque em “Atualizar” na janela do Android.", botoes: [] };
      case "concluido":
        return { modo: "ok", progresso: null, link: null, texto: "Atualizado!", botoes: [] };
      case "erro": {
        var msg = valor === undefined || valor === null || String(valor) === "" ? "erro desconhecido" : String(valor);
        return {
          modo: "erro", progresso: null,
          texto: "Não deu para atualizar por aqui (" + msg + ").",
          botoes: [{ rotulo: "Tentar de novo", acao: "atualizar" }],
          link: { rotulo: "baixar pelo navegador", acao: "navegador" }
        };
      }
      default: // "cancelado", nulo ou desconhecido: banner normal
        return {
          modo: "normal", progresso: null, link: null,
          texto: "Nova versão disponível" + (notas ? " — " + notas : ""),
          botoes: [{ rotulo: "Atualizar", acao: "atualizar" }, { rotulo: "Agora não", acao: "depois" }]
        };
    }
  }

  function criar(root) {
    var remoto = null;       // { versao, notas, apk } do versao.json
    var atual = null;        // { tipo, valor } enquanto o Java está conduzindo a atualização

    function doc() { try { return root.document || null; } catch (e) { return null; } }
    function ponte() { try { return root.AndroidBridge || null; } catch (e) { return null; } }
    function lerIgnorada() {
      try { return Number(root.localStorage.getItem(LS_IGNORADA)) || 0; } catch (e) { return 0; }
    }
    function gravarIgnorada(v) { try { root.localStorage.setItem(LS_IGNORADA, String(v)); } catch (e) { /* sem storage */ } }

    function abrirExterno(url) {
      if (!url) return;
      var b = ponte();
      if (b && typeof b.openExternal === "function") {
        try { b.openExternal(url); return; } catch (e) { /* cai no fallback */ }
      }
      try { root.open(url, "_blank"); } catch (e) { /* nada a fazer */ }
    }

    function atualizar() {
      var url = remoto && remoto.apk;
      var b = ponte();
      if (b && typeof b.atualizarApp === "function") {
        try { b.atualizarApp(url); return; } catch (e) { /* cai no fluxo antigo */ }
      }
      abrirExterno(url);
    }

    function executar(acao) {
      if (acao === "atualizar") atualizar();
      else if (acao === "navegador") abrirExterno(remoto && remoto.apk);
      else if (acao === "depois") {
        if (remoto) gravarIgnorada(Number(remoto.versao) || 0);
        atual = null;
        render();
      }
    }

    function render() {
      try {
        var d = doc(), el = d && d.getElementById ? d.getElementById("avisoVersao") : null;
        if (!el) return;                                   // sem banner na página: nada a desenhar
        var mostrar = !!atual || (remoto && lerIgnorada() < Number(remoto.versao));
        if (!mostrar) { el.hidden = true; return; }
        var desc = descrever(atual ? atual.tipo : "normal", atual ? atual.valor : null, remoto);
        el.setAttribute("data-modo", desc.modo);
        while (el.firstChild) el.removeChild(el.firstChild);
        var wrap = d.createElement("div");
        wrap.className = "aviso-versao-in";
        var txt = d.createElement("p");
        txt.className = "aviso-versao-txt";
        txt.textContent = desc.texto;
        wrap.appendChild(txt);
        if (desc.progresso !== null) {
          var tr = d.createElement("div");
          tr.className = "aviso-versao-trilho";
          tr.setAttribute("role", "progressbar");
          tr.setAttribute("aria-valuemin", "0"); tr.setAttribute("aria-valuemax", "100");
          tr.setAttribute("aria-valuenow", String(desc.progresso));
          var fill = d.createElement("span");
          fill.style.width = desc.progresso + "%";
          tr.appendChild(fill);
          wrap.appendChild(tr);
        }
        if (desc.botoes.length || desc.link) {
          var bx = d.createElement("div");
          bx.className = "aviso-versao-acoes";
          desc.botoes.forEach(function (bt, i) {
            var b = d.createElement("button");
            b.type = "button";
            b.className = i === 0 ? "btn-primario" : "btn-sec";
            b.textContent = bt.rotulo;
            b.addEventListener("click", function () { executar(bt.acao); });
            bx.appendChild(b);
          });
          if (desc.link) {
            var a = d.createElement("button");
            a.type = "button";
            a.className = "btn-link";
            a.textContent = desc.link.rotulo;
            a.addEventListener("click", function () { executar(desc.link.acao); });
            bx.appendChild(a);
          }
          wrap.appendChild(bx);
        }
        el.appendChild(wrap);
        el.hidden = false;
      } catch (e) { /* o banner nunca pode derrubar a página */ }
    }

    return {
      // Chamado pelo Java. Nunca lança erro.
      estado: function (tipo, valor) {
        try {
          if (tipo === "cancelado") atual = null;
          else atual = { tipo: String(tipo), valor: valor };
          render();
        } catch (e) { /* ignora */ }
      },
      // Chamado pelo modo app quando o versao.json traz versão maior que a instalada.
      mostrarNova: function (r) {
        try { remoto = r || null; render(); } catch (e) { /* ignora */ }
      },
      _atual: function () { return atual; },
      _remoto: function () { return remoto; },
      _render: render
    };
  }

  return { criar: criar, descrever: descrever, LS_IGNORADA: LS_IGNORADA };
});
