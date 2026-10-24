/* modo-app.js — o que o APP Android acrescenta ao site (carregado só em "modo app": window.AndroidBridge
 * presente, ou ?app=1 para testar no PC; ver app.js). O site continua sendo a única interface; aqui entram:
 *   - aba Radar (radar de integridade, com os módulos integridade.js/monitorLogic.js do app);
 *   - aba Notícias completa (todos os feeds de config.js, via proxy do app) + contagem por categoria;
 *   - Ajustes (engrenagem no topo): manter tela ligada, avisar com o app fechado, estado acompanhado ao fundo;
 *   - aviso de nova versão (atualizacao.js + atualizacao-app.js);
 *   - avisos de marcos no PC (no Android quem avisa é o serviço de fundo, para não duplicar).
 * Os dados (TSE) vêm do próprio site: window.Site.S. As chaves de localStorage são as MESMAS do app antigo
 * (quem atualiza não perde as escolhas, e o serviço de fundo — fundo.js — lê a mesma chave de estado).
 */
(function (window, document) {
  "use strict";

  var M = window.MonitorLogic, I = window.Integridade, E = window.Eventos, CFG = window.AppConfig;
  var Noticias = window.News, Atu = window.Atualizacao;

  // chaves iguais às do app antigo (valores em JSON)
  var LS_TELA = "apuracao2026_tela_ligada";        // padrão: desligado
  var LS_SERVICO = "apuracao2026_servico_fundo";   // padrão: ligado
  var LS_ESTADO = "apuracao2026.uf";               // ex.: '"rj"'; fundo.js lê esta mesma chave a cada ciclo
  var CATEGORIAS = ["Investigação oficial", "Ocorrência oficial", "Checagem/desmentido", "Alegação", "Geral"];

  var Site, C, esc;
  var st = { anteriores: {}, persistencia: {}, corAnterior: null, estadoEvt: null, histAlertas: [], news: [], agrupado: null, av: null, rodouRadar: false };

  function lerLS(chave, padrao) {
    try { var v = window.localStorage.getItem(chave); return v === null || v === undefined || v === "" ? padrao : JSON.parse(v); } catch (e) { return padrao; }
  }
  function gravarLS(chave, valor) { try { window.localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem storage */ } }
  function ponte() { return window.AndroidBridge || null; }
  function estadoEscolhido() { return M ? M.ufValida(lerLS(LS_ESTADO, "sp")) : "sp"; }
  function ehPc() { try { return /^https?:$/.test(window.location.protocol); } catch (e) { return false; } }

  // ---------------------------------------------------------------- ajustes nativos
  function aplicarTela(ligado) {
    var b = ponte();
    if (b && typeof b.keepScreenOn === "function") { try { b.keepScreenOn(!!ligado); } catch (e) { /* ignora */ } }
  }
  function aplicarServico(ligado) {
    if (!window.Android) return;
    try { if (ligado) window.Android.ligarServico(); else window.Android.desligarServico(); } catch (e) { /* ignora */ }
  }

  // ---------------------------------------------------------------- Radar
  function dadosParaRadar(uf) {
    var S = Site.S, out = {};
    if (S.br) out["Presidente"] = S.br;
    if (M.temGovernador(uf) && S.gov[uf]) out["Governador " + uf.toUpperCase()] = S.gov[uf];
    return out;
  }

  function cicloRadar() {
    if (!M || !I) return;
    var S = Site.S, uf = estadoEscolhido();
    var res = dadosParaRadar(uf), inconsistencias = {};
    var estados = {};
    Object.keys(S.ufs || {}).forEach(function (k) { if (S.ufs[k]) estados[k] = S.ufs[k]; });

    Object.keys(res).forEach(function (rotulo) {
      var d = res[rotulo], ant = st.anteriores[rotulo];
      var novos = M.checar(d, ant, M.unico(d, true));
      if (rotulo === "Presidente") novos = novos.concat(M.somaEstados(d, estados));
      if (novos.length) inconsistencias[rotulo] = novos;
      if (!ant || d.ht !== ant.ht) st.anteriores[rotulo] = d;
    });

    var agrupado = I.agruparNoticias((st.news || []).map(function (it) {
      return { quando: it.quando, fonte: it.fonte, titulo: it.titulo, link: it.link };
    }));
    st.agrupado = agrupado;
    var av = I.avaliarIntegridade(inconsistencias, st.persistencia, res, st.anteriores, estados, agrupado.contagemDia);
    if (st.corAnterior !== null && av.cor !== st.corAnterior) {
      st.histAlertas.push(new Date().toLocaleTimeString("pt-BR") + " · o radar mudou de " + st.corAnterior + " para " + av.cor);
    }
    st.corAnterior = av.cor;
    st.av = av;
    st.temDados = Object.keys(res).length > 0;

    // avisos de marcos: no PC pelo notify-send; no Android só o serviço de fundo avisa (senão duplicaria)
    if (E && ehPc()) {
      var atual = E.construirEstado(av, res);
      var evs = E.detectarEventos(st.estadoEvt, atual);
      st.estadoEvt = atual;
      evs.forEach(function (ev) {
        try { window.fetch("/notificar?t=" + encodeURIComponent(ev.titulo) + "&m=" + encodeURIComponent(ev.texto), { cache: "no-store" }).catch(function () {}); } catch (e) { /* ignora */ }
      });
    }
    renderRadar();
    renderExtraNoticias();
    marcarSemaforo(av.cor);
  }

  function marcarSemaforo(cor) {
    var b = document.getElementById("tab-radar");
    if (!b) return;
    var i = b.querySelector(".rad-dot");
    if (!i) { i = document.createElement("i"); i.className = "rad-dot"; b.insertBefore(i, b.firstChild); }
    i.setAttribute("data-cor", String(cor || "").toLowerCase());
    b.title = "Radar de integridade: " + cor;
  }

  var EXPLICA = {
    VERDE: "Nenhum sinal anômalo ou inconsistência identificado até agora.",
    AMARELO: "Há sinais que merecem atenção. Isso não é prova de nada: é um lugar para olhar.",
    VERMELHO: "Há inconsistências que persistem. Confira nas fontes oficiais antes de tirar conclusões."
  };

  function renderRadar() {
    var wrap = document.querySelector("#painel-radar .wrap");
    if (!wrap) return;
    var av = st.av, h = "";
    h += '<header class="sec-cab"><div><p class="sec-kicker">Só no app · integridade da apuração</p><h2>Radar de integridade</h2>' +
      '<p class="sec-sub">Confere se os números do TSE fecham entre si (nacional × estados, comparecimento, saltos improváveis) e acompanha o noticiário.</p></div></header>';
    h += '<p class="radar-aviso"><b>' + esc(CFG.AVISO_RADAR) + "</b></p>";
    if (!av || !st.temDados) {
      h += '<div class="cartao-g radar-vazio"><p class="painel-rot">Aguardando o TSE</p><p>O radar começa a funcionar quando houver votos apurados (a partir das 17h, Brasília). Enquanto isso, o semáforo fica sem cor.</p></div>';
      h += '<p class="radar-nota">' + esc(CFG.NOTA_BENFORD) + "</p>";
      wrap.innerHTML = h; return;
    }
    var cor = av.cor, cls = cor.toLowerCase();
    var motivos = av.sinaisVermelhos.map(function (s) { return '<li class="mv crit"><b>Crítico</b> ' + esc(s) + "</li>"; })
      .concat(av.sinaisAmarelos.map(function (s) { return '<li class="mv aten"><b>Atenção</b> ' + esc(s) + "</li>"; })).join("") ||
      '<li class="mv ok"><b>Tudo certo</b> Nenhum sinal anômalo ou inconsistência identificado até o momento.</li>';
    h += '<div class="radar-grade"><div class="cartao-g radar-sema radar-' + cls + '"><span class="rad-bola" aria-hidden="true"></span>' +
      '<div><p class="painel-rot">Semáforo</p><p class="rad-cor">' + esc(cor) + '</p><p class="rad-exp">' + esc(EXPLICA[cor] || "") + "</p></div></div>" +
      '<div class="cartao-g radar-motivos"><h3>Sinais no radar</h3><ul>' + motivos + "</ul></div></div>";
    var chaves = Object.keys(av.tabMetricas || {});
    if (chaves.length) {
      h += '<div class="cartao-g radar-tab"><h3>Atipicidade entre estados <small>(com 20% ou mais das urnas apuradas)</small></h3><div class="tab-rolagem"><table class="tabela-metricas"><thead><tr><th>Métrica</th><th>Mediana nacional</th><th>MAD</th></tr></thead><tbody>' +
        chaves.map(function (k) { var v = av.tabMetricas[k]; return "<tr><td>" + esc(v.label) + "</td><td>" + v.mediana.toFixed(2).replace(".", ",") + "%</td><td>" + v.mad.toFixed(2).replace(".", ",") + "%</td></tr>"; }).join("") +
        "</tbody></table></div></div>";
    }
    if (st.histAlertas.length) {
      h += '<div class="cartao-g radar-hist"><h3>Mudanças do semáforo nesta sessão</h3><ul>' + st.histAlertas.slice(-8).reverse().map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>";
    }
    h += '<p class="radar-nota">' + esc(CFG.NOTA_BENFORD) + "</p>";
    wrap.innerHTML = h;
  }

  // ---------------------------------------------------------------- Notícias (todos os feeds, via proxy)
  function renderExtraNoticias() {
    var el = Site.noticias.extra();
    if (!el || !st.agrupado) return;
    var g = st.agrupado;
    var h = '<section class="cartao-g not-cats"><h3>Notícias por categoria</h3><div class="tab-rolagem"><table class="tabela-metricas"><thead><tr><th>Categoria</th><th>Última hora</th><th>No dia</th></tr></thead><tbody>' +
      CATEGORIAS.map(function (c) { return "<tr><td>" + esc(c) + "</td><td>" + (g.contagemHora[c] || 0) + "</td><td>" + (g.contagemDia[c] || 0) + "</td></tr>"; }).join("") +
      '</tbody></table></div><p class="not-nota">Classificação automática pelo título. Manchete em amarelo: publicada nos últimos 20 minutos.</p></section>';
    if (el._h !== h) { el._h = h; el.innerHTML = h; }
  }
  function cicloNoticias() {
    if (!Noticias) return Promise.resolve();
    return Noticias.buscarNoticias().then(function (itens) {
      st.news = itens || [];
      Site.noticias.definir(st.news, st.news.length ? "ok" : "vazio", "todos os feeds");
      if (st.rodouRadar) cicloRadar();
    }, function () { Site.noticias.definir(st.news, st.news.length ? "ok" : "falha"); });
  }

  // ---------------------------------------------------------------- Ajustes
  function linhaSwitch(id, titulo, desc, ok) {
    return '<label class="ajuste' + (ok ? "" : " desativado") + '"><span class="aj-txt"><b>' + esc(titulo) + "</b><small>" + esc(desc) + '</small></span>' +
      '<input type="checkbox" role="switch" id="' + id + '"' + (ok ? "" : " disabled") + '><i class="aj-chave" aria-hidden="true"></i></label>';
  }
  function montarAjustes() {
    var wrap = document.querySelector("#painel-ajustes .wrap");
    var temPonte = !!ponte(), temServico = !!window.Android;
    var ufs = (M ? M.UFS_SELETOR : []).map(function (u) { return '<option value="' + u + '">' + esc(C.UF_INFO[u].nome) + " (" + u.toUpperCase() + ")</option>"; }).join("");
    wrap.innerHTML =
      '<header class="sec-cab"><div><p class="sec-kicker">Neste aparelho</p><h2>Ajustes</h2><p class="sec-sub">As escolhas ficam guardadas no próprio app.</p></div></header>' +
      '<div class="ajustes-grade">' +
      '<div class="cartao-g ajustes-bloco"><h3>Tela e avisos</h3>' +
      linhaSwitch("ajTela", "Manter a tela ligada", "A tela não apaga enquanto o app está aberto. Gasta mais bateria.", temPonte) +
      linhaSwitch("ajServico", "Avisar com o app fechado", "Um serviço acompanha a apuração ao fundo e avisa nas viradas e marcos.", temServico) +
      (temPonte ? "" : '<p class="aj-nota">Estas duas opções só funcionam dentro do app do celular.</p>') +
      "</div>" +
      '<div class="cartao-g ajustes-bloco"><h3>Estado acompanhado ao fundo</h3>' +
      '<label class="aj-campo" for="ajUF"><span>Governador deste estado entra nos avisos e no radar</span><select id="ajUF">' + ufs + "</select></label>" +
      '<p class="aj-nota">O Presidente é sempre o nacional. Só há governador em disputa no 2º turno em AM, RN, DF, ES, AC e TO; nos outros estados, o aviso fala só do Presidente.</p></div>' +
      '<div class="cartao-g ajustes-bloco"><h3>Sobre o app</h3>' +
      '<p class="aj-nota">Versão instalada: <b id="ajVersao">' + esc(String(Atu ? Atu.VERSAO_APP : "?")) + '</b></p>' +
      '<div class="aj-acoes"><button type="button" class="btn-ver" id="ajChecar">Procurar atualização</button><span class="aj-nota" id="ajChecarMsg" role="status"></span></div></div>' +
      "</div>";

    var tela = document.getElementById("ajTela"), srv = document.getElementById("ajServico"), uf = document.getElementById("ajUF");
    tela.checked = !!lerLS(LS_TELA, false);
    srv.checked = !!lerLS(LS_SERVICO, true);
    uf.value = estadoEscolhido();
    tela.addEventListener("change", function () { gravarLS(LS_TELA, tela.checked); aplicarTela(tela.checked); });
    srv.addEventListener("change", function () { gravarLS(LS_SERVICO, srv.checked); aplicarServico(srv.checked); });
    uf.addEventListener("change", function () { gravarLS(LS_ESTADO, M.ufValida(uf.value)); st.anteriores = {}; st.persistencia = {}; cicloRadar(); });
    document.getElementById("ajChecar").addEventListener("click", function () {
      var msg = document.getElementById("ajChecarMsg");
      if (!Atu) { msg.textContent = "Não foi possível verificar agora."; return; }
      msg.textContent = "Procurando…";
      Atu.checar().then(function (r) {
        if (r) { msg.textContent = "Há uma versão nova. O aviso apareceu no alto da tela."; window.AtualizacaoApp && window.AtualizacaoApp.mostrarNova(r); }
        else msg.textContent = "Você já está com a versão mais recente (ou sem conexão agora).";
      });
    });
  }

  function botaoAjustes() {
    var dir = document.querySelector(".topo-dir"), tema = document.getElementById("btnTema");
    if (!dir) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "btn-tema btn-ajustes"; b.id = "btnAjustes";
    b.setAttribute("aria-label", "Ajustes do app"); b.title = "Ajustes";
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill-rule="evenodd" d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm8.2 4.6.1-1.2-.1-1.2 1.9-1.5a.5.5 0 0 0 .1-.6l-1.8-3.1a.5.5 0 0 0-.6-.2l-2.3.9a8 8 0 0 0-2-1.2l-.3-2.4a.5.5 0 0 0-.5-.4H10.4a.5.5 0 0 0-.5.4l-.3 2.4a8 8 0 0 0-2 1.2l-2.3-.9a.5.5 0 0 0-.6.2L3 8.7a.5.5 0 0 0 .1.6L5 10.8l-.1 1.2.1 1.2-1.9 1.5a.5.5 0 0 0-.1.6l1.8 3.1c.1.2.4.3.6.2l2.3-.9c.6.5 1.3.9 2 1.2l.3 2.4c0 .2.3.4.5.4h3.6c.2 0 .5-.2.5-.4l.3-2.4c.7-.3 1.4-.7 2-1.2l2.3.9c.2.1.5 0 .6-.2l1.8-3.1a.5.5 0 0 0-.1-.6z" fill="currentColor"/></svg>';
    b.addEventListener("click", function () { Site.irParaAba("ajustes"); });
    dir.insertBefore(b, tema);
  }

  // ---------------------------------------------------------------- versão nova
  function cicloVersao() {
    if (!ponte() || !Atu || !window.AtualizacaoApp) return;       // no PC o app usa os arquivos locais
    Atu.checar().then(function (r) { if (r) window.AtualizacaoApp.mostrarNova(r); });
  }

  // ---------------------------------------------------------------- início
  function iniciar(site) {
    Site = site; C = site.C; esc = site.esc;
    document.documentElement.classList.add("modo-app");
    var css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "css/modo-app.css";
    document.head.appendChild(css);

    // preferências guardadas (mesmo comportamento do app antigo ao abrir)
    aplicarTela(!!lerLS(LS_TELA, false));
    aplicarServico(!!lerLS(LS_SERVICO, true));

    var radar = site.criarAba({ nome: "radar", rotulo: "Radar", depoisDe: "governadores" });
    site.criarAba({ nome: "ajustes", rotulo: "Ajustes", oculta: true });
    botaoAjustes();
    montarAjustes();
    renderRadar();

    var sub = document.getElementById("notSub");
    if (sub) sub.textContent = "Manchetes sobre as eleições de todos os veículos acompanhados pelo app, da mais nova para a mais antiga, e links para o X.";

    // primeira rodada do radar assim que houver dado do TSE (por temporizador: não depende de a tela ter repintado)
    var espera = setInterval(function () {
      if (!site.S.br) return;
      clearInterval(espera);
      if (!st.rodouRadar) { st.rodouRadar = true; cicloRadar(); }
    }, 1000);
    setInterval(cicloRadar, (CFG && CFG.INTERVALO_MS) || 60000);
    cicloNoticias(); setInterval(cicloNoticias, (CFG && CFG.INTERVALO_MS) || 60000);
    cicloVersao(); setInterval(cicloVersao, 30 * 60 * 1000);

    // teste no PC: ?testar_banner=1 mostra o aviso de versão (não faz nada no app real)
    try {
      if (new URLSearchParams(location.search).get("testar_banner") === "1" && window.AtualizacaoApp) {
        window.AtualizacaoApp.mostrarNova({ versao: 999, notas: "versão de teste", apk: "https://github.com/SrBlueSky/apuracao-2026/raw/main/Apuracao2026-v999.apk" });
      }
    } catch (e) { /* ignora */ }
  }

  window.ModoApp = { iniciar: iniciar, _estado: st };
})(window, document);
