/* app.js — interface do site de apuração do 2º turno de 2026 (DOM + rede).
 * Toda a lógica de dados está em apuracao-core.js (testada em tests/). Aqui só há:
 * busca no TSE (ou demo), montagem da página e atualização in-place dos elementos
 * (assim as barras e os números animam em vez de "piscar").
 */
(function () {
  "use strict";

  var C = window.ApuracaoCore, D = window.ApuracaoDemo, Evo = window.Evolucao, Not = window.Noticias;
  var PT = window.PRIMEIRO_TURNO || { presidente: {}, governador: {} };
  var esc = C.escapeHtml;

  var qs = new URLSearchParams(location.search);
  var DEMO = qs.get("demo") === "1";
  var DEMO_T = null;
  if (qs.has("t") && isFinite(parseFloat(qs.get("t")))) DEMO_T = Math.max(0, Math.min(1, parseFloat(qs.get("t"))));
  // ?agora=2026-10-25T21:00:00Z — só para testar estados de horário (não é anunciado na página)
  var AGORA_FIXO = qs.get("agora") ? Date.parse(qs.get("agora")) : NaN;
  function agoraMs() { return isFinite(AGORA_FIXO) ? AGORA_FIXO : Date.now(); }

  // Modo app: dentro do app Android (AndroidBridge) ou, para testar no PC, com ?app=1.
  // Nele, js/modo-app.js (e os módulos de ../js/) acrescenta Radar, Notícias completas, Ajustes e o aviso de versão.
  var APP = !!window.AndroidBridge || qs.get("app") === "1";
  // Em modo app o TSE é buscado pelo proxy do app (em file:// a origem é "null" e o CORS bloquearia).
  function urlRede(u) {
    return (APP && window.News && typeof window.News.proxied === "function") ? window.News.proxied(u) : u;
  }
  function abrirExterno(url) {
    var b = window.AndroidBridge;
    if (b && typeof b.openExternal === "function") { try { b.openExternal(url); return; } catch (e) { /* cai no fallback */ } }
    window.open(url, "_blank", "noopener");
  }

  var REDUZ = false;
  try { REDUZ = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var S = {
    br: null, ufs: {}, gov: {}, vis: {},
    okBr: 0, falhasBr: 0, okEst: 0,
    mapaModo: "1t", modoManual: false, algumVoto: false, onde: "brasil", ordem: "nome", agrupar: false, regiao: "",
    fixado: null, hover: null, ordemChave: "",
    linhas: {}, govEls: {}, demoInicio: (typeof performance !== "undefined" ? performance.now() : 0)
  };

  function $(id) { return document.getElementById(id); }
  function setTxt(node, txt) { if (node && node.textContent !== txt) node.textContent = txt; }
  function setHtml(node, html) { if (node && node._h !== html) { node._h = html; node.innerHTML = html; } }
  function setW(node, pct) { if (node) node.style.width = Math.max(0, Math.min(100, isFinite(pct) ? pct : 0)).toFixed(3) + "%"; }
  function d2(x) { return C.fmtDec(x, 2); }

  // número que "rola" até o novo valor (sem animação se o usuário pede menos movimento)
  function animNum(node, alvo, fmt) {
    if (!node) return;
    if (typeof alvo !== "number" || !isFinite(alvo)) alvo = 0;
    var de = node._v;
    if (typeof de !== "number" || REDUZ || Math.abs(alvo - de) < 1e-9) { node._v = alvo; setTxt(node, fmt(alvo)); return; }
    if (node._raf) cancelAnimationFrame(node._raf);
    var t0 = performance.now();
    (function passo(t) {
      var k = Math.min(1, (t - t0) / 800), e = 1 - Math.pow(1 - k, 3);
      node._v = k < 1 ? de + (alvo - de) * e : alvo;
      setTxt(node, fmt(node._v));
      if (k < 1) node._raf = requestAnimationFrame(passo);
    })(t0);
  }

  function htmlFoto(url, ini, alt) {
    return '<span class="ini" aria-hidden="true">' + esc(ini) + '</span>' +
      '<img src="' + esc(url) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  }
  // foto que não carrega some e deixa as iniciais aparecerem
  document.addEventListener("error", function (e) {
    var t = e.target;
    if (t && t.tagName === "IMG" && t.closest && t.closest(".foto, .gov-foto")) t.classList.add("erro");
  }, true);

  function nomePres(k) { return C.PRES[k] ? C.PRES[k].nome : k; }

  // =====================================================================
  // HERO
  // =====================================================================
  // Princípio do site: o placar grande é SEMPRE do 2º turno. O 1º turno só aparece na caixa de referência (#refHero).
  function renderHero() {
    var vn = C.visaoNacional(S.br, PT), d = vn.d, ref = vn.ref;
    var modo = C.modoHero(d, agoraMs()), vivo = modo === "vivo";
    $("heroModo").dataset.modo = modo;
    setHtml($("heroPilula"), C.selo2(vivo) + " <span>" + (vivo ? "Ao vivo · apuração em andamento" :
      modo === "antes" ? "Aguardando os primeiros resultados (17h)" : "Aguardando os primeiros resultados do TSE") + "</span>");
    document.querySelectorAll(".selo-2t.g").forEach(function (e) { e.classList.toggle("vivo", vivo); });

    ["13", "22"].forEach(function (k) {
      var lado = k === "13" ? d.a : d.b, card = $("cand" + k);
      card.classList.toggle("sem-voto", !vivo);
      if (vivo) {
        animNum($("pct" + k), lado.pct, d2);
        animNum($("votos" + k), lado.vap, C.fmtInt);
        setTxt($("rot" + k), "votos");
      } else {
        $("pct" + k)._v = undefined; $("votos" + k)._v = undefined;
        setTxt($("pct" + k), "—"); setTxt($("votos" + k), ""); setTxt($("rot" + k), "aguardando apuração");
      }
      $("eleito" + k).hidden = !lado.eleito;
    });

    var w13 = 0, w22 = 0;
    if (vivo) { var soma = d.a.vap + d.b.vap; w13 = 100 * d.a.vap / soma; w22 = 100 - w13; }
    setW($("seg13"), w13); setW($("seg22"), w22); setW($("segOutros"), 0);
    $("barraHero").classList.toggle("vazia", !vivo);
    $("barraHero").setAttribute("aria-label", vivo
      ? "2º turno: Lula " + d2(w13) + " por cento, Flávio Bolsonaro " + d2(w22) + " por cento, dos votos válidos"
      : "Barra do 2º turno vazia: ainda sem votos apurados");
    setTxt($("barraNota"), vivo
      ? "Barra do 2º turno: parcela de cada um nos votos válidos. A linha marca os 50%."
      : "Barra do 2º turno: aparece quando houver votos apurados. A linha marca os 50%.");

    renderRefHero(ref, vivo);

    // frase de liderança: SÓ com votos do 2º turno (nunca do 1º)
    var dif = $("heroDif");
    if (dif) {
      var txtDif = "";
      if (vivo) {
        if (d.empate || !d.lider) txtDif = "Empate em votos válidos";
        else txtDif = '<b class="c' + d.lider + '">' + esc(C.PRES[d.lider].curto) + '</b> à frente por <b>' + C.fmtInt(d.margemVotos) +
          ' votos</b> (' + d2(d.margemPP) + ' ponto' + (d.margemPP >= 1.005 || d.margemPP < 0.995 ? "s" : "") + ' percentuais)';
      }
      dif.hidden = !txtDif;
      setHtml(dif, txtDif);
    }

    var ele = d.eleito;
    $("heroEleito").hidden = !ele;
    if (ele) setTxt($("heroEleito"), "O TSE registra " + nomePres(ele) + " como eleito.");

    $("blocoContagem").hidden = modo !== "antes";
    $("blocoAguardando").hidden = modo !== "aguardando";
    document.querySelector(".painel").classList.toggle("dois", modo !== "vivo");
    document.querySelector(".hero-grade").classList.toggle("dois", modo !== "vivo");
    animNum($("progPct"), d.pst, d2);
    setW($("progBarra"), d.pst);
    setTxt($("progDet"), d.secTot > 0 ? C.fmtInt(d.secApur) + " de " + C.fmtInt(d.secTot) + " seções totalizadas" : "Aguardando o TSE");
    setTxt($("heroAtual"), d.atualizacao.longo);
  }

  // Caixa "Como foi no 1º turno (04/10)": aberta antes de haver votos; recolhida ("Comparar com o 1º turno") quando o 2º turno está ao vivo.
  function renderRefHero(ref, vivo) {
    var box = $("refHero"); if (!box) return;
    box.hidden = !ref;
    if (!ref) return;
    var ant = box._vivo;
    if (ant !== vivo) { box._vivo = vivo; box.open = !vivo; }       // só na troca de modo: não fecha o que a pessoa abriu
    setTxt($("refTit"), vivo ? "Comparar com o 1º turno (04/10)" : "Como foi no 1º turno (04/10)");
    setTxt($("ref13"), C.fmtPct(ref["13"].pct)); setTxt($("ref22"), C.fmtPct(ref["22"].pct));
    setTxt($("refv13"), C.fmtInt(ref["13"].vap) + " votos"); setTxt($("refv22"), C.fmtInt(ref["22"].vap) + " votos");
    setTxt($("refResumo"), "Lula " + C.fmtPct(ref["13"].pct) + " · Flávio " + C.fmtPct(ref["22"].pct));
    var w13 = ref["13"].pct, w22 = ref["22"].pct;
    setW($("rseg13"), w13); setW($("rseg22"), w22); setW($("rsegOutros"), Math.max(0, 100 - w13 - w22));
    $("refBarra").setAttribute("aria-label", "1º turno: Lula " + d2(w13) + " por cento, Flávio Bolsonaro " + d2(w22) + " por cento");
    var cinza = Math.max(0, 100 - w13 - w22);
    var dif = cinza > 0.005 ? "Em cinza na barra, os demais candidatos (" + C.fmtPct(cinza) + ")." : "&nbsp;";
    setHtml($("refDif"), dif);
  }

  function tickRelogio() {
    var c = C.contagem(agoraMs());
    function dois(x) { return (x < 10 ? "0" : "") + x; }
    setTxt($("cdDias"), dois(c.dias)); setTxt($("cdHoras"), dois(c.horas));
    setTxt($("cdMin"), dois(c.minutos)); setTxt($("cdSeg"), dois(c.segundos));
  }

  // =====================================================================
  // STATUS (topo)
  // =====================================================================
  function renderStatus() {
    var st = $("status"), txt;
    if (DEMO) { st.dataset.estado = "demo"; txt = "Demonstração"; }
    else if (!S.okBr) { st.dataset.estado = S.falhasBr > 0 ? "erro" : "conectando"; txt = S.falhasBr > 0 ? "Sem conexão, tentando de novo" : ""; }
    else {
      var seg = Math.max(0, Math.round((Date.now() - S.okBr) / 1000));
      var quando = seg < 60 ? "há " + seg + " s" : "há " + Math.floor(seg / 60) + " min";
      if (seg > 240) { st.dataset.estado = "erro"; txt = "Sem atualizar " + quando; }
      else {
        var vivo = C.visaoNacional(S.br, PT).d.temVotos;
        st.dataset.estado = vivo ? "vivo" : "ok";
        txt = vivo ? "Ao vivo" : "";
      }
    }
    setTxt($("statusTxt"), txt);
  }

  // =====================================================================
  // MAPA
  // =====================================================================
  var COD2UF = {};
  Object.keys(C.UF_INFO).forEach(function (uf) { if (C.UF_INFO[uf].cod) COD2UF[C.UF_INFO[uf].cod] = uf; });

  function lideranca(v, modo) {
    // devolve {l: "13"|"22"|null, b: faixa}
    if (modo === "1t") {
      if (v.ref && v.refLider) return { l: v.refLider, b: C.faixaMargem(v.refMargemPP) };
      return { l: null, b: 0 };
    }
    if (v.d.temVotos && v.d.lider) return { l: v.d.lider, b: v.faixa };
    return { l: null, b: 0 };
  }

  function pintar(node, v, modo) {
    var x = lideranca(v, modo || S.mapaModo);
    if (x.l) { node.dataset.l = x.l; node.dataset.b = String(Math.max(1, x.b)); }
    else { delete node.dataset.l; delete node.dataset.b; }
  }

  var TXT_MAPA_1T = "Resultado final do 1º turno (04/10), colorido pelo mais votado entre Lula e Flávio em cada estado. Os demais candidatos não entram na cor.";
  var TXT_MAPA_2T = "Cada estado leva a cor de quem está à frente no 2º turno; quanto mais intensa, maior a vantagem. Cinza: ainda sem votos apurados.";

  // Faixa explícita acima do mapa (Brasil e exterior): diz qual turno está desenhado.
  function faixaTurno(modo) {
    var inicio = agoraMs() >= C.INICIO_DIVULGACAO_MS;
    if (modo === "1t") {
      return { turno: "1t", html: C.selo1() + "<span><b>Mostrando o 1º turno (04/10).</b> " + (S.algumVoto
        ? "Para ver o 2º turno, escolha “2º turno (ao vivo)” acima."
        : inicio ? "O mapa do 2º turno aparece assim que o TSE publicar os primeiros votos."
          : "O mapa do 2º turno aparece quando a apuração começar, às 17h.") + "</span>" };
    }
    if (!S.algumVoto) {
      return { turno: "2t", html: C.selo2(false) + "<span><b>Mostrando o 2º turno.</b> Ainda sem votos apurados: o mapa fica cinza até a apuração começar" + (inicio ? "." : " (17h).") + "</span>" };
    }
    return null;
  }
  // o selo do título acompanha o turno que está desenhado no mapa
  function renderKickerMapa() {
    var ext = S.onde === "exterior";
    setHtml($("kickerMapa"), (S.mapaModo === "1t" ? C.selo1() : C.selo2(S.algumVoto)) + (ext ? " Presidente · voto de brasileiros no exterior" : " Presidente por estado"));
  }
  function renderFaixaMapa() {
    var f = $("faixaMapa"); if (!f) return;
    var x = faixaTurno(S.mapaModo);
    f.hidden = !x;
    if (x) { f.dataset.turno = x.turno; setHtml(f, x.html); }
    ["brasilGrade", "mundiGrade"].forEach(function (id) { var g = $(id); if (g) g.dataset.turno = S.mapaModo; });
    setHtml($("rankUfNota"), S.mapaModo === "1t" ? C.selo1() + " Lula × Flávio, em %" : (S.algumVoto ? "por vantagem" : "sem votos ainda"));
    var lt = $("legTurno");
    if (lt) setHtml(lt, S.mapaModo === "1t" ? C.selo1() + " cores do 1º turno" : C.selo2(S.algumVoto) + " cores do 2º turno");
  }

  function renderMapa() {
    var box = $("mapaBox");
    box.querySelectorAll("path[data-uf]").forEach(function (p) { if (S.vis[p.dataset.uf]) pintar(p, S.vis[p.dataset.uf]); });
    if (S.vis.zz) pintar($("chipZZ"), S.vis.zz);
    if (S.onde === "brasil") setTxt($("mapaSub"), S.mapaModo === "2t" ? TXT_MAPA_2T : TXT_MAPA_1T);
    $("ctlMapa").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.modo === S.mapaModo)); });
    renderFaixaMapa(); renderKickerMapa();
    var sel = S.fixado || null;
    box.querySelectorAll("path.sel").forEach(function (p) { if (p.dataset.uf !== sel) p.classList.remove("sel"); });
    if (sel) { var p = box.querySelector('path[data-uf="' + sel + '"]'); if (p) p.classList.add("sel"); }
    $("chipZZ").classList.toggle("sel", sel === "zz");
    renderCartao();
    renderRankUF();
  }

  function construirLegenda() {
    function esc5(cls) {
      var h = '<span class="leg-esc ' + cls + '">';
      for (var i = 1; i <= 5; i++) h += '<i data-b="' + i + '" title="' + esc(C.FAIXAS_TEXTO[i]) + '"></i>';
      return h + "</span>";
    }
    $("legenda").innerHTML =
      '<div class="leg-turno" id="legTurno"></div>' +
      '<div class="leg-linha"><span class="leg-nome" style="color:var(--c13)">Lula à frente</span>' + esc5("s13") + '<span class="leg-rot">vantagem: de menos de 2 a mais de 20 pontos percentuais</span></div>' +
      '<div class="leg-linha"><span class="leg-nome" style="color:var(--c22)">Flávio à frente</span>' + esc5("s22") + '<span class="leg-rot">mesma escala</span></div>' +
      '<div class="leg-linha"><span class="leg-nome">Sem votos</span><span class="leg-esc vazio"><i></i></span><span class="leg-rot">ainda não apurado (ou empate exato)</span></div>';
  }

  function cartaoVazio() {
    var n2 = 0, a13 = 0, a22 = 0, n1 = 0, b13 = 0, b22 = 0;
    C.UFS.forEach(function (uf) {
      var v = S.vis[uf]; if (!v) return;
      var x2 = lideranca(v, "2t"), x1 = lideranca(v, "1t");
      if (v.d.temVotos) n2++;
      if (x2.l) { if (x2.l === "13") a13++; else a22++; }
      if (x1.l) { n1++; if (x1.l === "13") b13++; else b22++; }
    });
    var h = '<h3><small>Detalhes</small>Escolha um estado</h3><p class="cartao-vazio" style="margin-top:10px">Passe o mouse (ou toque) em um estado do mapa para ver a votação do 2º turno e, separado, como foi o 1º turno.</p>';
    h += '<section class="turno-bloco"><p class="turno-cab">' + C.selo2(n2 > 0) + '</p>' + (n2 > 0
      ? '<p class="cartao-info" style="border:0;padding:0;margin-top:8px"><span>Entre os 28 locais de votação (27 estados e exterior), <b>' + n2 + '</b> já têm votos apurados.</span>' +
        (S.mapaModo === "2t" ? '<span><span class="c13">Lula lidera em ' + a13 + '</span> · <span class="c22">Flávio lidera em ' + a22 + '</span></span>' : '') + '</p>'
      : '<p class="cartao-info mut" style="border:0;padding:0;margin-top:8px"><span class="mut">Nenhum estado tem votos apurados ainda.</span></p>') + '</section>';
    h += '<section class="caixa-ref"><p class="turno-cab">' + C.selo1() + '</p>' + (n1 > 0
      ? '<p class="cartao-info" style="border:0;padding:0;margin-top:8px"><span>Resultado final em 27 estados e exterior.</span></p>'
      : '<p class="cartao-info" style="border:0;padding:0;margin-top:8px"><span class="mut">Sem dados do 1º turno.</span></p>') + '</section>';
    return h;
  }

  function linhaCartao(cls, nome, pct, votos) {
    return '<div class="lin ' + cls + '"><span class="pt"></span><span>' + esc(nome) + '</span><b>' + C.fmtPct(pct) + '</b><span class="v">' + C.fmtInt(votos) + ' votos</span></div>';
  }

  function cartaoHtml(uf) {
    var v = S.vis[uf]; if (!v) return cartaoVazio();
    var ref = v.ref, d = v.d, info = v.info, live = d.temVotos;
    var h = '<h3><small>' + esc(info.regiao || "") + '</small>' + esc(info.nome) + '</h3>';
    // ---- 2º turno (bloco principal)
    h += '<section class="turno-bloco"><p class="turno-cab">' + C.selo2(live) + (live ? "" : ' <span class="mut">ainda sem votos apurados</span>') + '</p>';
    if (live) {
      var sum = (d.a.vap + d.b.vap) || 1;
      h += '<div class="mini-barra"><span class="a" style="width:' + (100 * d.a.vap / sum).toFixed(2) + '%"></span><span class="b" style="width:' + (100 * d.b.vap / sum).toFixed(2) + '%"></span></div>';
      h += linhaCartao("c13", "Lula", d.a.pct, d.a.vap) + linhaCartao("c22", "Flávio Bolsonaro", d.b.pct, d.b.vap);
      h += '<div class="cartao-info">';
      h += d.lider
        ? '<span>Vantagem: <span class="c' + d.lider + '">' + esc(nomePres(d.lider)) + ' +' + d2(d.margemPP) + ' p.p.</span> (' + C.fmtInt(d.margemVotos) + ' votos)</span>'
        : '<span>Votos idênticos até aqui.</span>';
      h += '<span>Urnas apuradas: <b>' + C.fmtPct(d.pst) + '</b> (' + C.fmtInt(d.secApur) + ' de ' + C.fmtInt(d.secTot) + ' seções)</span></div>';
    } else {
      h += '<div class="mini-barra vazia"><span class="a"></span><span class="b"></span></div>';
      h += '<p class="cartao-vazio" style="margin-top:10px">Aguardando a apuração do 2º turno. Urnas apuradas: ' + C.fmtPct(d.pst) + '.</p>';
    }
    h += '</section>';
    // ---- 1º turno (caixa de referência)
    h += '<section class="caixa-ref"><p class="turno-cab">' + C.selo1() + (S.mapaModo === "1t" ? ' <span class="mut">cor do mapa agora</span>' : "") + '</p>';
    if (ref) {
      h += '<div class="mini-barra"><span class="a" style="width:' + ref["13"].pct.toFixed(2) + '%"></span><span class="o" style="width:' + ref.outros.toFixed(2) + '%"></span><span class="b" style="width:' + ref["22"].pct.toFixed(2) + '%"></span></div>';
      h += linhaCartao("c13", "Lula", ref["13"].pct, ref["13"].vap) + linhaCartao("c22", "Flávio Bolsonaro", ref["22"].pct, ref["22"].vap);
      h += '<div class="cartao-info">';
      if (ref.outros > 0) h += '<span class="mut">Demais candidatos: ' + C.fmtPct(ref.outros) + ' dos votos válidos.</span>';
      if (ref.pc !== null) h += '<span class="mut">Comparecimento: ' + C.fmtPct(ref.pc) + '</span>';
      if (live) h += '<span class="mut">Variação do 2º turno sobre o 1º: Lula ' + C.fmtSinal(v.var13) + ' p.p. · Flávio ' + C.fmtSinal(v.var22) + ' p.p.</span>';
      h += '</div>';
    } else h += '<p class="cartao-vazio" style="margin-top:8px">Sem dados do 1º turno.</p>';
    h += '</section>';
    if (v.eleitorado > 0) h += '<p class="cartao-info"><span class="mut">Eleitorado: ' + C.fmtInt(v.eleitorado) + '</span></p>';
    return h;
  }

  function renderCartao() {
    var uf = S.hover || S.fixado;
    setHtml($("cartaoUF"), uf ? cartaoHtml(uf) : cartaoVazio());
  }

  function setHover(uf) {
    if (S.hover === uf) return;
    S.hover = uf;
    renderCartao();
  }
  function alternarFixo(uf) {
    S.fixado = S.fixado === uf ? null : uf;
    renderMapa();
    if (S.fixado && window.matchMedia && window.matchMedia("(max-width: 1023px)").matches) {
      $("cartaoUF").scrollIntoView({ block: "nearest", behavior: REDUZ ? "auto" : "smooth" });
    }
  }

  function montarMapa() {
    var box = $("mapaBox");
    box.innerHTML = window.MAPA_SVG || '<p class="cartao-vazio">Mapa indisponível.</p>';
    box.querySelectorAll("path").forEach(function (p) {
      var uf = COD2UF[p.id];
      if (!uf) return;
      p.dataset.uf = uf;
      p.setAttribute("tabindex", "0");
      p.setAttribute("role", "button");
      p.setAttribute("aria-label", C.UF_INFO[uf].nome);
      var t = document.createElementNS("http://www.w3.org/2000/svg", "title");
      t.textContent = C.UF_INFO[uf].nome;
      p.appendChild(t);
    });
    box.addEventListener("pointerover", function (e) {
      if (e.pointerType !== "mouse") return;
      var p = e.target.closest && e.target.closest("path[data-uf]");
      setHover(p ? p.dataset.uf : null);
    });
    box.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") setHover(null); });
    box.addEventListener("click", function (e) {
      var p = e.target.closest && e.target.closest("path[data-uf]");
      if (p) alternarFixo(p.dataset.uf); else if (S.fixado) { S.fixado = null; renderMapa(); }
    });
    box.addEventListener("focusin", function (e) { var p = e.target.closest && e.target.closest("path[data-uf]"); if (p) setHover(p.dataset.uf); });
    box.addEventListener("focusout", function () { setHover(null); });
    box.addEventListener("keydown", function (e) {
      var p = e.target.closest && e.target.closest("path[data-uf]");
      if (p && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); alternarFixo(p.dataset.uf); }
    });
    var chip = $("chipZZ");
    chip.addEventListener("click", function () { irParaMapaOnde("exterior"); });       // Exterior = mapa-múndi (#mapa/exterior)
    chip.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") setHover("zz"); });
    chip.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") setHover(null); });
    $("ctlOnde").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-onde]"); if (b) irParaMapaOnde(b.dataset.onde);
    });
    $("chipBR").addEventListener("click", function () { irParaMapaOnde("brasil"); });
    // toque/clique fora fecha o cartão fixado
    document.addEventListener("click", function (e) {
      if (S.fixado && !e.target.closest("#mapaBox, #brasilGrade .mapa-lateral, #chipZZ, #ctlMapa, .dest-grade")) { S.fixado = null; renderMapa(); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.fixado) { S.fixado = null; renderMapa(); } });
    $("ctlMapa").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-modo]");
      if (!b) return;
      S.mapaModo = b.dataset.modo;
      S.modoManual = true;
      renderMapa();
      if (mundi) mundi.modoMudou();
    });
  }

  // =====================================================================
  // MAPA-MÚNDI (voto no exterior): js/mundi.js, dados em exterior.js
  // =====================================================================
  var mundi = null;
  function criarMundi() {
    if (!window.Mundi || !window.Exterior || !window.ExteriorPaises) return;
    mundi = window.Mundi.criar({
      C: C, X: window.Exterior, P: window.ExteriorPaises, D: D, DEMO: DEMO, esc: esc, $: $, setHtml: setHtml, setTxt: setTxt,
      buscarUrl: buscarUrl, ele2: C.ELE.pres2, modo: function () { return S.mapaModo; },
      demoT: function () { return S.demoT !== undefined && S.demoT !== null ? S.demoT : 0; },
      reduz: function () { return REDUZ; },
      irParaBrasil: function () { irParaMapaOnde("brasil"); },
      // total do Exterior (arquivo "zz" dos estados), para o cartão sem país escolhido
      totalExterior: function () {
        var v = S.vis.zz; if (!v) return null;
        if (S.mapaModo === "2t" && v.d.temVotos) return { temVotos: true, p13: v.d.a.pct, p22: v.d.b.pct, ref: false };
        if (v.ref && v.ref.vv > 0) return { temVotos: true, p13: v.ref["13"].pct, p22: v.ref["22"].pct, ref: true };
        return null;
      }
    });
  }

  // =====================================================================
  // LISTA DE ESTADOS
  // =====================================================================
  function construirLista() {
    var ul = $("listaUFs");
    C.UFS.forEach(function (uf) {
      var info = C.UF_INFO[uf];
      var li = document.createElement("li");
      li.className = "uf sem-voto"; li.dataset.uf = uf;
      li.innerHTML =
        '<div class="uf-nome">' + esc(info.nome) + (uf === "zz" ? "" : "<small>" + uf.toUpperCase() + "</small>") + "</div>" +
        '<div class="uf-barra"><div class="mini-barra vazia"><span class="a"></span><span class="o"></span><span class="b"></span></div></div>' +
        '<div class="uf-n l13"><span class="uf-lbl">Lula</span><b data-r="p13">—</b><span class="d" data-r="d13"></span></div>' +
        '<div class="uf-n l22"><span class="uf-lbl">Flávio</span><b data-r="p22">—</b><span class="d" data-r="d22"></span></div>' +
        '<div class="uf-marg" data-r="marg">—</div>' +
        '<div class="uf-apur"><span data-r="apur">—</span><div class="mini-trilho"><span></span></div></div>' +
        '<div class="uf-ref"><span class="uf-ref-rot">' + C.selo1() + '</span>' +
        '<span class="uf-r l13"><em>Lula</em> <b data-r="r13">—</b></span><span class="uf-r l22"><em>Flávio</em> <b data-r="r22">—</b></span></div>';
      var q = function (s) { return li.querySelector(s); };
      S.linhas[uf] = {
        li: li, a: q(".mini-barra .a"), o: q(".mini-barra .o"), b: q(".mini-barra .b"), barra: q(".mini-barra"),
        p13: q('[data-r="p13"]'), p22: q('[data-r="p22"]'), d13: q('[data-r="d13"]'), d22: q('[data-r="d22"]'),
        marg: q('[data-r="marg"]'), apur: q('[data-r="apur"]'), trilho: q(".mini-trilho span"),
        r13: q('[data-r="r13"]'), r22: q('[data-r="r22"]')
      };
      li.addEventListener("pointerenter", function () {
        var p = $("mapaBox").querySelector('path[data-uf="' + uf + '"]'); if (p) p.classList.add("hl");
      });
      li.addEventListener("pointerleave", function () {
        var p = $("mapaBox").querySelector('path[data-uf="' + uf + '"]'); if (p) p.classList.remove("hl");
      });
      ul.appendChild(li);
    });
    $("ctlOrdem").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-ord]"); if (!b) return;
      S.ordem = b.dataset.ord;
      $("ctlOrdem").querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      renderLista();
    });
    $("chkRegiao").addEventListener("change", function (e) { S.agrupar = e.target.checked; S.ordemChave = ""; renderLista(); });
    $("ctlRegiao").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-reg]"); if (!b) return;
      S.regiao = b.dataset.reg;
      $("ctlRegiao").querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      S.ordemChave = ""; renderLista();
    });
  }

  function renderLista() {
    var vis = C.UFS.map(function (uf) { return S.vis[uf]; }).filter(Boolean);
    vis.forEach(function (v) {
      var L = S.linhas[v.uf], d = v.d, ref = v.ref, live = d.temVotos;
      L.li.classList.toggle("sem-voto", !live);
      // 2º turno: só dados do 2º turno ("—" enquanto não há votos). O 1º turno fica nas colunas próprias (r13, r22).
      L.barra.classList.toggle("vazia", !live);
      if (live) { var s = d.a.vap + d.b.vap; setW(L.a, 100 * d.a.vap / s); setW(L.b, 100 * d.b.vap / s); }
      else { setW(L.a, 0); setW(L.b, 0); }
      setW(L.o, 0);
      setTxt(L.p13, live ? C.fmtPct(d.a.pct) : "—");
      setTxt(L.p22, live ? C.fmtPct(d.b.pct) : "—");
      setTxt(L.d13, live && v.var13 !== null ? C.fmtSinal(v.var13) + " p.p. vs 1º turno" : "");
      setTxt(L.d22, live && v.var22 !== null ? C.fmtSinal(v.var22) + " p.p. vs 1º turno" : "");
      setTxt(L.r13, ref ? C.fmtPct(ref["13"].pct) : "—");
      setTxt(L.r22, ref ? C.fmtPct(ref["22"].pct) : "—");
      if (live && d.lider) {
        L.marg.className = "uf-marg c" + d.lider;
        setHtml(L.marg, esc(C.PRES[d.lider].curto) + " +" + d2(d.margemPP) + " p.p.<small>" + C.fmtInt(d.margemVotos) + " votos</small>");
      } else if (live) { L.marg.className = "uf-marg"; setHtml(L.marg, "Empate<small>votos idênticos</small>"); }
      else { L.marg.className = "uf-marg"; setHtml(L.marg, "—<small>sem votos</small>"); }
      setTxt(L.apur, C.fmtPct(d.pst, 1));
      setW(L.trilho, d.pst);
    });
    var dica = $("dicaOrd");
    if (dica) dica.hidden = S.algumVoto || !(S.ordem === "lula" || S.ordem === "flavio" || S.ordem === "margem");

    if (S.regiao) vis = vis.filter(function (v) { return v.info.regiao === S.regiao; });
    var ord = C.ordenarUFs(vis, S.ordem);
    var chave = S.ordem + "|" + S.agrupar + "|" + S.regiao + "|" + ord.map(function (v) { return v.uf; }).join(",");
    if (chave === S.ordemChave) return;
    S.ordemChave = chave;
    var ul = $("listaUFs");
    ul.querySelectorAll("li.reg").forEach(function (n) { n.remove(); });
    C.UFS.forEach(function (uf) { S.linhas[uf].li.hidden = !!S.regiao && C.UF_INFO[uf].regiao !== S.regiao; });
    var frag = document.createDocumentFragment();
    if (S.agrupar) {
      C.REGIOES.forEach(function (reg) {
        var grupo = ord.filter(function (v) { return v.info.regiao === reg; });
        if (!grupo.length) return;
        var h = document.createElement("li"); h.className = "reg"; h.textContent = reg;
        frag.appendChild(h);
        grupo.forEach(function (v) { frag.appendChild(S.linhas[v.uf].li); });
      });
    } else ord.forEach(function (v) { frag.appendChild(S.linhas[v.uf].li); });
    ul.appendChild(frag);
  }

  // =====================================================================
  // GOVERNADORES
  // =====================================================================
  function identGov(uf, n, d) {
    var cfg = C.GOV[uf], est = null;
    if (cfg) cfg.cand.forEach(function (c) { if (c.n === String(n)) est = c; });
    var live = C.acharCand(d, n);
    return {
      n: String(n),
      nome: est ? est.nome : (live ? C.nomeBonito(live.nm) : String(n)),
      sg: est ? est.sg : (live && live.sg) || "",
      vice: est ? est.vice : (live ? C.nomeBonito(live.vice) : ""),
      sqcand: est ? est.sqcand : live && live.sqcand
    };
  }

  function linhaGov(cls, id) {
    return '<div class="gov-c ' + cls + '" data-r="' + id + '">' +
      '<div class="gov-foto"></div>' +
      '<div><div class="gov-nome"><span data-r="nome"></span><span class="selo-mini" data-r="selo" hidden>Eleito</span></div><div class="gov-sub" data-r="sub"></div></div>' +
      '<div class="gov-pct"><span data-r="pct">—</span><small data-r="votos"></small></div></div>';
  }

  function construirGov() {
    var grade = $("govGrade");
    C.UFS_GOV.forEach(function (uf) {
      var art = document.createElement("article");
      art.className = "gov-card"; art.dataset.uf = uf;
      art.setAttribute("aria-label", "Governador, " + C.UF_INFO[uf].nome);
      art.innerHTML =
        '<div class="gov-topo"><h3>' + esc(C.UF_INFO[uf].nome) + ' <span class="gov-uf">' + uf.toUpperCase() + '</span></h3><span data-r="selo">' + C.selo2(false) + '</span></div>' +
        linhaGov("a", "ca") + linhaGov("b", "cb") +
        '<div class="gov-barra vazia"><span class="a"></span><span class="o"></span><span class="b"></span></div>' +
        '<div class="gov-prog"><div class="trilho"><span class="trilho-fill" data-r="trilho"></span></div><span data-r="prog">0,00% das urnas</span></div>' +
        '<div class="gov-rod" data-r="rod"></div>' +
        '<div class="caixa-ref gov-ref" data-r="ref"></div>';
      var q = function (s) { return art.querySelector(s); };
      var els = { art: art, barra: q(".gov-barra"), a: q(".gov-barra .a"), o: q(".gov-barra .o"), b: q(".gov-barra .b"), trilho: q('[data-r="trilho"]'), prog: q('[data-r="prog"]'), rod: q('[data-r="rod"]'), ref: q('[data-r="ref"]'), selo: q('.gov-topo [data-r="selo"]') };
      ["ca", "cb"].forEach(function (k) {
        var r = q('[data-r="' + k + '"]');
        els[k] = { row: r, foto: r.querySelector(".gov-foto"), nome: r.querySelector('[data-r="nome"]'), selo: r.querySelector('[data-r="selo"]'),
          sub: r.querySelector('[data-r="sub"]'), pct: r.querySelector('[data-r="pct"]'), votos: r.querySelector('[data-r="votos"]'), n: null };
      });
      S.govEls[uf] = els;
      grade.appendChild(art);
    });
  }

  function renderGov() {
    C.UFS_GOV.forEach(function (uf) {
      var G = S.govEls[uf], d = S.gov[uf] || null;
      var v = C.visaoGov(d, uf, PT), disp = v.d, ref = v.ref, live = disp.temVotos;
      var ids = [identGov(uf, v.nums[0], d), identGov(uf, v.nums[1], d)];
      var lados = [disp.a, disp.b];
      ["ca", "cb"].forEach(function (k, i) {
        var E = G[k], id = ids[i], lado = lados[i];
        if (E.n !== id.n) {   // identidade mudou (ou primeira vez): refaz foto e textos fixos
          E.n = id.n;
          E.foto.innerHTML = htmlFoto(C.urlFoto(C.ELE.gov2, uf, id.sqcand), C.iniciais(id.nome), "Foto de " + id.nome);
          setTxt(E.nome, id.nome);
          setTxt(E.sub, id.sg + " · " + id.n + (id.vice ? " · vice " + id.vice : ""));
        }
        E.selo.hidden = !lado.eleito;
        E.row.classList.toggle("sem-voto", !live);
        // bloco principal: só 2º turno. Sem votos: "—" (o 1º turno fica na caixinha de baixo)
        if (live) animNum(E.pct, lado.pct, C.fmtPct);
        else { E.pct._v = undefined; setTxt(E.pct, "—"); }
        setTxt(E.votos, live ? C.fmtInt(lado.vap) + " votos" : "aguardando apuração");
      });
      var wa = 0, wb = 0;
      if (live) { var s = disp.a.vap + disp.b.vap; wa = 100 * disp.a.vap / s; wb = 100 - wa; }
      G.barra.classList.toggle("vazia", !live);
      setW(G.a, wa); setW(G.b, wb); setW(G.o, 0);
      setW(G.trilho, disp.pst);
      setHtml(G.selo, C.selo2(live));
      setTxt(G.prog, d ? C.fmtPct(disp.pst) + " das urnas apuradas" : "Aguardando o TSE");
      var rod = "";
      if (live && disp.lider) {
        var li = disp.lider === v.nums[0] ? 0 : 1;
        rod += "<span>Vantagem: <b>" + esc(ids[li].nome) + "</b> +" + d2(disp.margemPP) + " p.p. (" + C.fmtInt(disp.margemVotos) + " votos)</span>";
      } else if (!live) rod += "<span>Resultado do 2º turno ainda não apurado.</span>";
      setHtml(G.rod, rod);
      // caixinha do 1º turno (referência, separada)
      var rh = "";
      if (ref) {
        var r0 = ref[v.nums[0]] ? ref[v.nums[0]].pct : 0, r1 = ref[v.nums[1]] ? ref[v.nums[1]].pct : 0;
        rh = '<p class="turno-cab">' + C.selo1() + '</p>' +
          '<div class="gov-ref-barra"><span class="a" style="width:' + r0.toFixed(2) + '%"></span><span class="o" style="width:' + Math.max(0, 100 - r0 - r1).toFixed(2) + '%"></span><span class="b" style="width:' + r1.toFixed(2) + '%"></span></div>' +
          '<p class="gov-ref-txt">' + v.nums.map(function (n, i) {
            return '<span class="gr' + (i ? " b" : " a") + '"><i></i>' + esc(ids[i].nome) + " <b>" + (ref[n] ? C.fmtPct(ref[n].pct) : "—") + "</b></span>";
          }).join("") + "</p>";
      }
      G.ref.hidden = !ref;
      setHtml(G.ref, rh);
    });
  }

  // =====================================================================
  // NÚMEROS GERAIS
  // =====================================================================
  var NUM_CARDS = [
    { id: "pc", titulo: "Comparecimento" }, { id: "pa", titulo: "Abstenção" },
    { id: "pb", titulo: "Votos brancos" }, { id: "pn", titulo: "Votos nulos" }
  ];
  function construirNumeros() {
    var g = $("numGrade");
    NUM_CARDS.forEach(function (c) {
      var art = document.createElement("article");
      art.className = "num-card"; art.id = "num-" + c.id;
      art.innerHTML = "<h3>" + esc(c.titulo) + '</h3><p class="num-valor vazio" data-r="v">—</p><p class="num-abs" data-r="abs"></p><p class="num-ref caixa-ref" data-r="ref" hidden></p>';
      g.appendChild(art);
    });
    var nota = document.createElement("p");
    nota.className = "num-nota"; nota.id = "numNota"; nota.hidden = true;
    g.parentNode.appendChild(nota);
  }
  function renderNumeros() {
    var n = C.visaoNumeros(S.br, PT), tem = n.temDados;
    function card(id, pct, abs, refHtml) {
      var el = $("num-" + id);
      var v = el.querySelector('[data-r="v"]');
      v.classList.toggle("vazio", !tem);
      if (tem) setHtml(v, C.fmtDec(pct, 2) + "<small>%</small>"); else setHtml(v, "—");
      setTxt(el.querySelector('[data-r="abs"]'), abs);
      var r = el.querySelector('[data-r="ref"]');
      r.hidden = !refHtml; setHtml(r, refHtml || "");
    }
    var ref = n.ref;
    function dtxt(x) { return x === null || x === undefined ? "" : " (2º turno " + C.fmtSinal(x) + " p.p.)"; }
    function refLin(pct, d) { return C.selo1() + " <b>" + C.fmtPct(pct) + "</b>" + dtxt(d); }
    card("pc", n.pc, tem ? C.fmtInt(n.comparecimento) + " eleitores votaram" : "Aguardando a apuração · eleitorado: " + C.fmtInt(n.eleitorado),
      ref ? refLin(ref.pc, n.dPc) : "");
    card("pa", n.pa, tem ? C.fmtInt(n.abstencao) + " eleitores não compareceram" : "Aguardando a apuração",
      ref ? refLin(ref.pa, n.dPa) : "");
    card("pb", n.pvb, tem ? C.fmtInt(n.brancos) + " votos" : "Aguardando a apuração", "");
    card("pn", n.ptvn, tem ? C.fmtInt(n.nulos) + " votos" : "Aguardando a apuração", "");
    var nota = $("numNota");
    if (ref) {
      nota.hidden = false;
      setHtml(nota, '<span class="nota-lin">' + C.selo2(tem) + " Brancos e nulos juntos: " + (tem ? "<b>" + C.fmtPct(n.pbn) + "</b>" : "<b>—</b> (aguardando a apuração)") + "</span>" +
        '<span class="nota-lin nota-ref">' + C.selo1() + " Brancos e nulos juntos: <b>" + C.fmtPct(ref.pbn) + "</b>" + (tem ? " (2º turno " + C.fmtSinal(n.dPbn) + " p.p.)" : "") +
        ' <small>Calculado como comparecimento menos votos válidos; o arquivo do 1º turno aqui guardado não separa brancos de nulos.</small></span>');
    } else nota.hidden = true;
    setTxt($("numSub"), tem ? "Totais nacionais do 2º turno, com a apuração em curso. A linha “1º turno” de cada cartão é só referência." : "Aparecem quando o TSE publicar os primeiros votos do 2º turno. O 1º turno aparece abaixo de cada número, só como referência.");
  }

  // =====================================================================
  // ABAS (hash da URL: #presidente #mapa #evolucao #estados #governadores #noticias; app: #radar #ajustes)
  // =====================================================================
  var abaAtual = null, aoMostrar = {};

  function painelDe(nome) { return nome ? $("painel-" + nome) : null; }
  function hashLimpo() {
    var h = "";
    try { h = decodeURIComponent((location.hash || "").replace(/^#/, "")).toLowerCase(); } catch (e) { h = ""; }
    return h;
  }
  // "#mapa/exterior" -> aba "mapa" (o que vem depois da barra é a sub-visão da aba)
  function abaDoHash() {
    var h = hashLimpo().split("/")[0];
    if (h === "numeros") h = "presidente";          // âncora da versão antiga (página longa)
    return painelDe(h) ? h : "presidente";
  }
  function subDoHash() {
    var p = hashLimpo().split("/");
    return p[0] === "mapa" && p[1] === "exterior" ? "exterior" : "";
  }
  // Brasil | Exterior dentro da aba Mapa. O estado fica na URL (#mapa / #mapa/exterior), então "voltar" funciona.
  function irParaMapaOnde(onde) {
    var alvo = onde === "exterior" ? "mapa/exterior" : "mapa";
    if (hashLimpo() === alvo) sincronizarMapaOnde();
    else location.hash = alvo;
  }
  function sincronizarMapaOnde() {
    var ext = abaAtual === "mapa" && subDoHash() === "exterior", antes = S.onde;
    S.onde = ext ? "exterior" : "brasil";
    var gB = $("brasilGrade"), gM = $("mundiGrade");
    if (!gB || !gM) return;
    gB.hidden = ext; gM.hidden = !ext;
    $("ctlOnde").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.onde === S.onde)); });
    renderKickerMapa();
    setTxt($("tituloMapa"), ext ? "Mapa-múndi do voto no exterior" : "Mapa do Brasil");
    if (ext) { if (mundi) mundi.abrir(); }
    else { if (mundi) mundi.fechar(); if (antes !== S.onde) renderMapa(); }
  }
  function botoesAbas() { return Array.prototype.slice.call($("abasLista").querySelectorAll('[role="tab"]')); }

  function ativarAba(nome, rolar) {
    if (!painelDe(nome)) nome = "presidente";
    var mudou = nome !== abaAtual;
    abaAtual = nome;
    Array.prototype.forEach.call(document.querySelectorAll(".aba-painel"), function (p) { p.hidden = p.dataset.aba !== nome; });
    var achou = false;
    botoesAbas().forEach(function (b, i) {
      var sel = b.dataset.aba === nome;
      if (sel) achou = true;
      b.setAttribute("aria-selected", String(sel));
      b.setAttribute("tabindex", sel ? "0" : "-1");
    });
    if (!achou) { var b0 = botoesAbas()[0]; if (b0) b0.setAttribute("tabindex", "0"); }   // aba "oculta" (Ajustes): mantém a lista alcançável
    var btn = $("tab-" + nome), lista = $("abasLista");
    if (btn && lista && lista.scrollWidth > lista.clientWidth) {
      lista.scrollTo({ left: Math.max(0, btn.offsetLeft - (lista.clientWidth - btn.offsetWidth) / 2), behavior: REDUZ ? "auto" : "smooth" });
    }
    if (mudou) {
      if (rolar) window.scrollTo(0, 0);
      if (aoMostrar[nome]) { try { aoMostrar[nome](); } catch (e) { console.error("aba", nome, e); } }
    }
    try { sincronizarMapaOnde(); } catch (e) { console.error("mapa/onde", e); }
  }
  function irParaAba(nome) {
    if ((location.hash || "").replace(/^#/, "") === nome) ativarAba(nome, true);
    else location.hash = nome;                       // dispara hashchange; o botão "voltar" volta à aba anterior
  }
  function iniciarAbas() {
    window.addEventListener("hashchange", function () { var n = abaDoHash(); ativarAba(n, n !== abaAtual); });
    var lista = $("abasLista");
    lista.addEventListener("click", function (e) {
      var b = e.target.closest('[role="tab"]'); if (b) irParaAba(b.dataset.aba);
    });
    lista.addEventListener("keydown", function (e) {
      var bs = botoesAbas(), i = bs.indexOf(document.activeElement);
      if (i < 0) return;
      var j = -1;
      if (e.key === "ArrowRight") j = (i + 1) % bs.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + bs.length) % bs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = bs.length - 1;
      if (j < 0) return;
      e.preventDefault(); bs[j].focus(); irParaAba(bs[j].dataset.aba);
    });
    // botões "ir para a aba X" espalhados pela página
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-ir]"); if (b) irParaAba(b.dataset.ir);
    });
    ativarAba(abaDoHash(), false);
  }
  // Cria uma aba extra (usada pelo modo app: Radar, Ajustes). oculta = sem botão na barra.
  function criarAba(o) {
    if (painelDe(o.nome)) return painelDe(o.nome);
    var sec = document.createElement("section");
    sec.className = "aba-painel secao"; sec.id = "painel-" + o.nome; sec.dataset.aba = o.nome; sec.hidden = true;
    sec.setAttribute("role", "tabpanel"); sec.setAttribute("tabindex", "0");
    sec.innerHTML = '<div class="wrap"></div>';
    if (!o.oculta) {
      sec.setAttribute("aria-labelledby", "tab-" + o.nome);
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "tab"); b.id = "tab-" + o.nome; b.dataset.aba = o.nome;
      b.setAttribute("aria-controls", "painel-" + o.nome); b.setAttribute("aria-selected", "false"); b.setAttribute("tabindex", "-1");
      b.textContent = o.rotulo;
      var ref = o.depoisDe ? $("tab-" + o.depoisDe) : null;
      if (ref && ref.nextSibling) ref.parentNode.insertBefore(b, ref.nextSibling); else $("abasLista").appendChild(b);
    } else sec.setAttribute("aria-label", o.rotulo);
    $("conteudo").appendChild(sec);
    return sec;
  }

  // =====================================================================
  // DESTAQUES (aba Presidente): mini-mapa e maiores vantagens
  // =====================================================================
  function modoDestaque() {
    for (var i = 0; i < C.UFS.length; i++) { var v = S.vis[C.UFS[i]]; if (v && v.d.temVotos) return "2t"; }
    return "1t";
  }
  function margemUF(v, modo) { return modo === "1t" ? v.refMargemPP : v.d.margemPP; }

  function construirMiniMapa() {
    var box = $("miniMapa");
    if (!window.MAPA_SVG) { box.parentNode.hidden = true; return; }
    box.innerHTML = window.MAPA_SVG;
    box.querySelectorAll("path").forEach(function (p) {
      var uf = COD2UF[p.id];
      p.removeAttribute("id");                       // ids duplicados com o mapa grande
      if (uf) p.dataset.uf = uf;
    });
    var svg = box.querySelector("svg");
    if (svg) { svg.removeAttribute("role"); svg.removeAttribute("aria-label"); svg.setAttribute("aria-hidden", "true"); }
    box.addEventListener("click", function (e) {
      var p = e.target.closest && e.target.closest("path[data-uf]");
      if (p) abrirUFnoMapa(p.dataset.uf);
    });    ["rank13", "rank22"].forEach(function (id) {
      $(id).addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("button[data-uf]");
        if (b) abrirUFnoMapa(b.dataset.uf);
      });
    });
    $("rankUFs").addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button[data-uf]");
      if (b && b.dataset.uf === "zz") { e.stopPropagation(); irParaMapaOnde("exterior"); return; }
      if (b) { e.stopPropagation(); alternarFixo(b.dataset.uf); }   // o clique não pode chegar ao "clicou fora" (a lista é refeita e o botão sai do DOM)
    });
  }
  function abrirUFnoMapa(uf) {
    S.fixado = uf; renderMapa(); irParaAba("mapa");
  }

  function linhaRank(uf, v, modo, max) {
    var pp = margemUF(v, modo), w = max > 0 ? Math.max(4, 100 * pp / max) : 0;
    return '<li><button type="button" class="rank-lin" data-uf="' + uf + '"><span class="rk-nome">' + esc(v.info.nome) + '</span>' +
      '<span class="rk-bar"><i style="width:' + w.toFixed(1) + '%"></i></span><b>+' + d2(pp) + ' p.p.</b></button></li>';
  }
  function renderDestaques() {
    var modo = modoDestaque();
    var por = { "13": [], "22": [] };
    C.UFS.forEach(function (uf) {
      if (uf === "zz") return;
      var v = S.vis[uf]; if (!v) return;
      var x = lideranca(v, modo);
      if (x.l) por[x.l].push({ uf: uf, v: v, pp: margemUF(v, modo) });
    });
    ["13", "22"].forEach(function (k) {
      var arr = por[k].sort(function (a, b) { return b.pp - a.pp || a.v.info.nome.localeCompare(b.v.info.nome, "pt-BR"); }).slice(0, 6);
      var max = arr.length ? arr[0].pp : 0;
      setHtml($("rank" + k), arr.length ? arr.map(function (r) { return linhaRank(r.uf, r.v, modo, max); }).join("") :
        '<li class="rank-vazio">' + (modo === "2t" ? "Nenhum estado com " + esc(nomePres(k)) + " à frente até aqui." : "Sem dados.") + "</li>");
    });
    setTxt($("destSub"), modo === "2t"
      ? "Os estados onde cada candidato tem a maior vantagem agora no 2º turno, entre os que já têm votos apurados. Toque em um estado para ver os detalhes no mapa."
      : "Ainda não há votos do 2º turno. Enquanto isso, o mapa mostra o resultado do 1º turno, só como referência.");
    var fx = $("destFaixa");
    fx.hidden = modo === "2t";
    setHtml(fx, modo === "2t" ? "" : C.selo1() + "<span><b>Mostrando o 1º turno (04/10).</b> As vantagens do 2º turno aparecem aqui quando a apuração começar.</span>");
    $("destGrade").dataset.turno = modo;
    document.querySelectorAll("#destGrade .dest-lista").forEach(function (e) { e.hidden = modo === "1t"; });   // 1º turno: sem listas de quem liderou
    ["13", "22"].forEach(function (k) {
      setHtml($("tit" + k), (k === "13" ? "Lula" : "Flávio") + " · maiores vantagens " + (modo === "1t" ? C.selo1() : C.selo2(true)));
    });
    $("miniMapa").querySelectorAll("path[data-uf]").forEach(function (p) { if (S.vis[p.dataset.uf]) pintar(p, S.vis[p.dataset.uf], modo); });
  }

  // Ranking dos estados (aba Mapa, só no desktop): líder e vantagem de cada UF, no turno escolhido no mapa
  function renderRankUF() {
    var ol = $("rankUFs"); if (!ol) return;
    var modo = S.mapaModo, itens = [];
    C.UFS.forEach(function (uf) {
      var v = S.vis[uf]; if (!v) return;
      var x = lideranca(v, modo);
      itens.push({ uf: uf, v: v, l: x.l, pp: x.l ? margemUF(v, modo) : -1 });
    });
    var algum = itens.some(function (i) { return !!i.l; });
    itens.sort(function (a, b) { return (b.pp - a.pp) || a.v.info.nome.localeCompare(b.v.info.nome, "pt-BR"); });
    setHtml($("rankUfNota"), modo === "1t" ? C.selo1() + " Lula × Flávio, em %" : (algum ? "por vantagem" : "sem votos ainda"));
    setHtml(ol, itens.map(function (i) {
      var sel = S.fixado === i.uf;
      return '<li><button type="button" class="rank-lin' + (sel ? " sel" : "") + '" data-uf="' + i.uf + '"' + (sel ? ' aria-current="true"' : "") + '>' +
        '<span class="rk-pt' + (i.l ? " c" + i.l : "") + '"></span><span class="rk-nome">' + esc(i.v.info.nome) + '</span>' +
        (!i.l ? '<b class="mut">—</b>' : modo === "1t" && i.v.ref ? '<b class="mut">' + C.fmtPct(i.v.ref["13"].pct) + " × " + C.fmtPct(i.v.ref["22"].pct) + "</b>"
          : '<b class="c' + i.l + '">' + esc(C.PRES[i.l].curto) + " +" + d2(i.pp) + "</b>") + "</button></li>";
    }).join(""));
  }

  // =====================================================================
  // EVOLUÇÃO (aba): % de votos válidos × % de urnas apuradas
  // =====================================================================
  var EVO = { serie: [], demoT: -1, largura: 0, tamanho: -1, sel: -1 };
  function evoCarregar() {
    if (DEMO || !Evo) return;
    try { EVO.serie = Evo.lerSerie(localStorage.getItem(Evo.CHAVE)); } catch (e) { EVO.serie = []; }   // sem storage: só na sessão
  }
  function evoSalvar() {
    if (DEMO) return;                                  // dados falsos nunca vão para o armazenamento
    try { localStorage.setItem(Evo.CHAVE, JSON.stringify(EVO.serie)); } catch (e) { /* sem storage: segue só na sessão */ }
  }
  function evoVisivel() { var p = $("painel-evolucao"); return !!p && !p.hidden; }
  // chamado a cada render geral: guarda ponto novo (real) ou refaz a série (demo)
  function evoAtualizar() {
    if (!Evo) return;
    if (DEMO) {
      if (!evoVisivel()) return;                        // série da demo só é montada quando alguém olha
      var t = S.demoT !== undefined && S.demoT !== null ? Math.round(S.demoT * 100) / 100 : 0;
      if (t !== EVO.demoT) { EVO.demoT = t; EVO.serie = Evo.serieDemo(D, C, PT, t, 30); EVO.tamanho = -1; }
    } else if (S.br) {
      var p = Evo.ponto(S.br, C.visaoNacional(S.br, PT).d);
      if (p && Evo.adicionar(EVO.serie, p)) { evoSalvar(); EVO.tamanho = -1; }
    }
    if (evoVisivel()) renderEvolucao();
  }

  function fmtCompacto(v) {
    var a = Math.abs(v), s;
    if (a >= 1e6) s = C.fmtDec(a / 1e6, a >= 1e7 ? 0 : 1) + " mi";
    else if (a >= 1e3) s = C.fmtDec(a / 1e3, 0) + " mil";
    else s = C.fmtInt(a);
    return (v < 0 ? "−" : v > 0 ? "+" : "") + s;
  }

  function renderEvolucao() {
    var serie = EVO.serie, vazio = serie.length === 0, ult = serie[serie.length - 1];
    $("evoVazio").hidden = !vazio; $("evoCorpo").hidden = vazio;
    setTxt($("evoP13"), ult ? C.fmtPct(ult.a) : "—");
    setTxt($("evoP22"), ult ? C.fmtPct(ult.b) : "—");
    setTxt($("evoV13"), ult ? C.fmtInt(ult.va) + " votos" : "");
    setTxt($("evoV22"), ult ? C.fmtInt(ult.vb) + " votos" : "");
    setTxt($("evoDifTxt"), ult ? (ult.dif !== 0 ? C.PRES[ult.dif > 0 ? "13" : "22"].curto + " +" + C.fmtInt(Math.abs(ult.dif)) : "Empate") : "—");
    setTxt($("evoDifDet"), ult ? "votos de vantagem, com " + C.fmtPct(ult.x) + " das urnas apuradas" : "Aparece com a primeira totalização.");
    setTxt($("evoN"), String(serie.length));
    setTxt($("evoNDet"), DEMO ? "Série de demonstração, refeita a cada atualização; não é guardada." : "Os pontos ficam guardados neste aparelho, só neste navegador.");
    if (!vazio) desenharEvolucao();
  }

  function svgTxt(x, y, txt, cls, anc) {
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" class="' + cls + '"' + (anc ? ' text-anchor="' + anc + '"' : "") + ">" + esc(txt) + "</text>";
  }

  // desenha um gráfico de linhas dentro de `el`. cfg: {ys:[{cls, f(p)}], faixa:{min,max}, fmtY(v), ticksY:[...], zero:valor, altura}
  function grafico(el, serie, cfg) {
    var W = el.clientWidth;
    if (!W) return null;                                  // painel escondido: recalcula quando abrir
    var H = cfg.altura, m = { l: 62, r: 16, t: 12, b: 36 };
    var fx = Evo.escala(0, 100, m.l, W - m.r), fy = Evo.escala(cfg.faixa.min, cfg.faixa.max, H - m.b, m.t);
    var h = '<svg class="evo-svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(cfg.rotulo) + '">';
    cfg.ticksY.forEach(function (v) {
      var y = fy(v);
      h += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" class="g-grade' + (v === cfg.destaque ? " g-meio" : "") + '"/>';
      h += svgTxt(m.l - 8, y + 4, cfg.fmtY(v), "g-eixo", "end");
    });
    Evo.ticks(0, 100, W < 520 ? 5 : 10).forEach(function (v) {
      var x = fx(v);
      h += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + m.t + '" y2="' + (H - m.b) + '" class="g-grade g-vert"/>';
      h += svgTxt(x, H - m.b + 18, v + "%", "g-eixo", "middle");
    });
    h += svgTxt((m.l + W - m.r) / 2, H - 3, "Urnas apuradas", "g-tit", "middle");
    cfg.ys.forEach(function (s) {
      var d = Evo.caminho(serie, function (p) { return fx(p.x); }, function (p) { return fy(s.f(p)); });
      h += '<path d="' + d + '" class="g-linha ' + s.cls + '"/>';
    });
    var passo = serie.length > 80 ? Math.ceil(serie.length / 80) : 1;
    serie.forEach(function (p, i) {
      if (i % passo && i !== serie.length - 1) return;
      cfg.ys.forEach(function (s) {
        var ptCls = cfg.corPonto ? cfg.corPonto(p) : s.cls;
        h += '<circle cx="' + fx(p.x).toFixed(1) + '" cy="' + fy(s.f(p)).toFixed(1) + '" r="' + (i === serie.length - 1 ? 5 : 3) + '" class="g-pt ' + ptCls + '"/>';
      });
    });
    h += '<line class="g-cursor" x1="0" x2="0" y1="' + m.t + '" y2="' + (H - m.b) + '" visibility="hidden"/>';
    h += '<rect class="g-alvo" x="' + m.l + '" y="' + m.t + '" width="' + Math.max(1, W - m.l - m.r) + '" height="' + (H - m.t - m.b) + '"/>';
    el.innerHTML = h + "</svg>";
    return { W: W, m: m, fx: fx, svg: el.firstChild };
  }

  function desenharEvolucao() {
    var serie = EVO.serie, W = $("evoGraf").clientWidth;
    if (!W) return;
    if (W === EVO.largura && serie.length === EVO.tamanho) return;
    EVO.largura = W; EVO.tamanho = serie.length;
    var alt = Math.max(250, Math.min(440, Math.round(W * 0.5)));
    var fy = Evo.faixaPct(serie);
    var g1 = grafico($("evoGraf"), serie, {
      altura: alt, faixa: fy, ticksY: Evo.ticks(fy.min, fy.max, 5), destaque: 50, fmtY: function (v) { return v + "%"; },
      rotulo: "Porcentagem de votos válidos de Lula e de Flávio Bolsonaro conforme as urnas são apuradas",
      ys: [{ cls: "s13", f: function (p) { return p.a; } }, { cls: "s22", f: function (p) { return p.b; } }]
    });
    var fd = Evo.faixaDif(serie);
    var g2 = grafico($("evoDif"), serie, {
      altura: Math.round(alt * 0.62), faixa: fd, ticksY: Evo.ticks(fd.min, fd.max, 4), destaque: 0, fmtY: fmtCompacto,
      rotulo: "Diferença de votos entre Lula e Flávio Bolsonaro conforme as urnas são apuradas",
      ys: [{ cls: "sdif", f: function (p) { return p.dif; } }],
      corPonto: function (p) { return p.dif >= 0 ? "s13" : "s22"; }
    });
    [g1, g2].forEach(function (g) {
      if (!g) return;
      var cur = g.svg.querySelector(".g-cursor");
      function mover(e) {
        var r = g.svg.getBoundingClientRect(); if (!r.width) return;
        var x = (e.clientX - r.left) * (g.W / r.width), melhor = -1, dist = 1e9;
        serie.forEach(function (p, i) { var d = Math.abs(g.fx(p.x) - x); if (d < dist) { dist = d; melhor = i; } });
        if (melhor < 0) return;
        var p = serie[melhor], cx = g.fx(p.x).toFixed(1);
        [g1, g2].forEach(function (o) { if (!o) return; var c = o.svg.querySelector(".g-cursor"); c.setAttribute("x1", cx); c.setAttribute("x2", cx); c.setAttribute("visibility", "visible"); });
        setTxt($("evoSel"), "Com " + C.fmtPct(p.x) + " das urnas apuradas: Lula " + C.fmtPct(p.a) + " · Flávio " + C.fmtPct(p.b) + " · " +
          (p.dif === 0 ? "empate" : "diferença de " + C.fmtInt(Math.abs(p.dif)) + " votos") + " (totalização de " + p.k.slice(0, 5) + " às " + p.k.slice(11, 16) + ")");
      }
      g.svg.addEventListener("pointermove", mover);
      g.svg.addEventListener("pointerdown", mover);
      g.svg.addEventListener("pointerleave", function (e) {
        if (e.pointerType === "mouse") { [g1, g2].forEach(function (o) { if (o) o.svg.querySelector(".g-cursor").setAttribute("visibility", "hidden"); }); setTxt($("evoSel"), EVO_DICA); }
      });
    });
    setTxt($("evoSel"), EVO_DICA);
  }
  var EVO_DICA = "Passe o mouse (ou toque) sobre o gráfico para ver cada totalização.";

  // =====================================================================
  // NOTÍCIAS (aba): manchetes + links
  // =====================================================================
  var NOT = { itens: [], estado: "carregando", fonte: "Agência Brasil", iniciou: false };

  function fmtQuando(d) {
    if (!d || isNaN(d.getTime())) return "";
    try { return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", ""); } catch (e) { return ""; }
  }
  function renderNoticias() {
    var ul = $("listaNot");
    var h = NOT.itens.map(function (it) {
      var novo = it.quando && Date.now() - it.quando.getTime() < 20 * 60 * 1000;
      return '<li' + (novo ? ' class="nova"' : "") + "><span class=\"not-meta\"><time>" + esc(fmtQuando(it.quando)) + "</time>" + (it.fonte ? " · <span>" + esc(it.fonte) + "</span>" : "") + "</span>" +
        '<a href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer">' + esc(it.titulo) + "</a></li>";
    }).join("");
    setHtml(ul, h);
    setTxt($("notFonte"), NOT.fonte);
    var msg = NOT.estado === "carregando" ? "Carregando as manchetes…" :
      NOT.estado === "falha" ? "Não foi possível carregar as manchetes agora. Use os links ao lado para acompanhar nos veículos e no X." :
      NOT.estado === "vazio" ? "Nenhuma manchete sobre as eleições no feed neste momento." : "";
    var est = $("notEstado"); setTxt(est, msg); est.hidden = !msg;
  }
  function grupoLinks(titulo, lista, nota) {
    return '<section class="cartao-g not-grupo"><h3>' + esc(titulo) + "</h3>" + (nota ? '<p class="not-nota">' + esc(nota) + "</p>" : "") + '<ul class="links-grade">' +
      lista.map(function (l) { return '<li><a href="' + esc(l[1]) + '" target="_blank" rel="noopener noreferrer">' + esc(l[0]) + '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 3h7v7M13 3 5 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a></li>'; }).join("") +
      "</ul></section>";
  }
  function construirLinksNoticias() {
    if (!Not) return;
    $("notLinks").innerHTML =
      grupoLinks("Outros veículos", Not.LINKS_VEICULOS) +
      grupoLinks("Checagem de fatos", Not.LINKS_CHECAGEM, "Para conferir boatos sobre a votação e a apuração.") +
      grupoLinks("No X", Not.LINKS_X, "Abre no X (Twitter), em outra página.") +
      grupoLinks("Fontes oficiais", Not.LINKS_OFICIAIS);
  }
  function buscarNoticiasPublico() {
    if (!Not) return Promise.resolve();
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 12000);
    return fetch(Not.FEED_AGENCIA_BRASIL, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (xml) {
        clearTimeout(to);
        NOT.itens = Not.filtrar(Not.parseRss(xml, "Agência Brasil"), Not.PALAVRAS, 14);
        NOT.estado = NOT.itens.length ? "ok" : "vazio";
      }, function () { clearTimeout(to); if (!NOT.itens.length) NOT.estado = "falha"; })
      .then(renderNoticias);
  }
  function iniciarNoticiasPublico() {
    if (NOT.iniciou || APP) return;
    NOT.iniciou = true;
    ciclo("noticias", 5 * 60 * 1000, buscarNoticiasPublico);
  }

  // =====================================================================
  // RENDER GERAL
  // =====================================================================
  var rodouRender = false;
  function agendarRender() {
    if (rodouRender) return;
    rodouRender = true;
    requestAnimationFrame(function () { rodouRender = false; renderTudo(); });
  }
  function renderTudo() {
    S.vis = {};
    C.UFS.forEach(function (uf) { S.vis[uf] = C.visaoUF(S.ufs[uf] || null, uf, PT); });
    // Sem votos do 2º turno o mapa "ao vivo" seria todo cinza: até a apuração começar, os mapas
    // mostram o 1º turno; quando chegam votos, passam sozinhos para o ao vivo (salvo escolha manual).
    var algumVoto = C.visaoNacional(S.br, PT).d.temVotos;
    for (var uf in S.vis) if (S.vis[uf].d && S.vis[uf].d.temVotos) algumVoto = true;
    S.algumVoto = algumVoto;
    if (!S.modoManual) {
      var modoAuto = algumVoto ? "2t" : "1t";
      if (S.mapaModo !== modoAuto) { S.mapaModo = modoAuto; if (mundi) mundi.modoMudou(); }
    }
    try { renderHero(); } catch (e) { console.error("hero", e); }
    try { renderMapa(); } catch (e) { console.error("mapa", e); }
    try { if (mundi) mundi.render(); } catch (e) { console.error("mundi", e); }
    try { renderLista(); } catch (e) { console.error("lista", e); }
    try { renderGov(); } catch (e) { console.error("gov", e); }
    try { renderNumeros(); } catch (e) { console.error("numeros", e); }
    try { renderDestaques(); } catch (e) { console.error("destaques", e); }
    try { evoAtualizar(); } catch (e) { console.error("evolucao", e); }
    renderStatus();
    Site.hooks.forEach(function (fn) { try { fn(); } catch (e) { console.error("gancho", e); } });
  }

  // =====================================================================
  // REDE (TSE)
  // =====================================================================
  function buscarTSE(ele, cargo, uf) { return buscarUrl(C.urlDados(ele, cargo, uf)); }
  // busca e decodifica um arquivo .jws do TSE (pelo proxy do app, se for o caso)
  function buscarUrl(url) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    return fetch(urlRede(url), { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (txt) {
        var d = C.adaptarFormato2026(C.decodificarJws(txt));
        if (!d || !d.cand || !d.cand.length) throw new Error("formato inesperado");
        return d;
      })
      .then(function (d) { clearTimeout(to); return d; }, function (e) { clearTimeout(to); throw e; });
  }
  // descarta resposta mais antiga do que a que já temos
  function aceitar(antigo, novo) {
    var a = C.carimboGeracao(antigo), b = C.carimboGeracao(novo);
    return !(a && b && b < a);
  }

  function atualizarBR() {
    return buscarTSE(C.ELE.pres2, 1, "br").then(function (d) {
      S.falhasBr = 0; S.okBr = Date.now();
      if (aceitar(S.br, d)) S.br = d;
    }, function () { S.falhasBr++; }).then(agendarRender);
  }

  function atualizarEstados() {
    var tarefas = [];
    C.UFS.forEach(function (uf) {
      tarefas.push(buscarTSE(C.ELE.pres2, 1, uf).then(function (d) { if (aceitar(S.ufs[uf], d)) S.ufs[uf] = d; }));
    });
    C.UFS_GOV.forEach(function (uf) {
      tarefas.push(buscarTSE(C.ELE.gov2, 3, uf).then(function (d) { if (aceitar(S.gov[uf], d)) S.gov[uf] = d; }));
    });
    // uma UF que falha não derruba as outras: mantém o último dado bom
    return Promise.all(tarefas.map(function (p) { return p.then(function () { return 1; }, function () { return 0; }); }))
      .then(function (r) { if (r.some(Boolean)) S.okEst = Date.now(); })
      .then(agendarRender);
  }

  var timers = {}, rodando = {}, ultimaTentativa = {};
  function ciclo(nome, intervaloMs, fn) {
    function agenda() { clearTimeout(timers[nome]); timers[nome] = setTimeout(rodar, intervaloMs + Math.floor(Math.random() * 1500)); }
    function rodar() {
      if (document.hidden || rodando[nome]) { agenda(); return; }
      rodando[nome] = true; ultimaTentativa[nome] = Date.now();
      var fim = function () { rodando[nome] = false; agenda(); };
      try { Promise.resolve(fn()).then(fim, fim); } catch (e) { fim(); }
    }
    ciclo[nome] = function () { if (!rodando[nome] && Date.now() - (ultimaTentativa[nome] || 0) > 15000) { clearTimeout(timers[nome]); rodar(); } };
    rodar();
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !DEMO) { ["br", "estados"].forEach(function (n) { if (ciclo[n]) ciclo[n](); }); }
  });

  // =====================================================================
  // DEMO
  // =====================================================================
  function demoRodar() {
    var t = DEMO_T !== null ? DEMO_T : D.progressoPorTempo(performance.now() - S.demoInicio + 20000);
    var g = D.gerar(PT, t);
    S.br = g.br; S.ufs = g.ufs; S.gov = g.gov; S.okBr = Date.now(); S.demoT = t;
    renderTudo();
  }

  // =====================================================================
  // TEMA
  // =====================================================================
  function iniciarTema() {
    $("btnTema").addEventListener("click", function () {
      var raiz = document.documentElement, atual = raiz.getAttribute("data-theme");
      var prox = atual === "dark" ? "light" : "dark";
      raiz.setAttribute("data-theme", prox);
    });
  }

  // =====================================================================
  // INÍCIO
  // =====================================================================
  function iniciar() {
    // identidade fixa dos candidatos à presidência (fotos)
    ["13", "22"].forEach(function (k) {
      var p = C.PRES[k];
      $("foto" + k).innerHTML = htmlFoto(C.urlFoto(C.ELE.pres2, "br", p.sqcand), C.iniciais(p.nome), "Foto de " + p.nome);
    });
    criarMundi();
    montarMapa(); construirMiniMapa(); construirLegenda(); construirLista(); construirGov(); construirNumeros(); iniciarTema();
    construirLinksNoticias(); renderNoticias();
    aoMostrar.evolucao = function () { EVO.tamanho = -1; evoAtualizar(); renderEvolucao(); };
    aoMostrar.noticias = iniciarNoticiasPublico;
    evoCarregar();
    renderTudo(); tickRelogio();
    setInterval(function () { tickRelogio(); renderStatus(); if (!DEMO) renderHeroModoSeMudou(); }, 1000);
    iniciarAbas();
    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(function () { if (evoVisivel()) desenharEvolucao(); });
      ro.observe($("evoGraf"));
    } else window.addEventListener("resize", function () { if (evoVisivel()) desenharEvolucao(); });

    // No modo app, espera os módulos do app (proxy, radar...) antes da primeira busca ao TSE
    var pronto = APP ? prepararModoApp() : Promise.resolve();
    pronto.then(function () {
      ativarAba(abaDoHash(), false);                 // #radar / #ajustes só existem depois do modo app
      if (DEMO) {
        $("faixaDemo").hidden = false;
        document.title = "[DEMO] Apuração 2º Turno 2026";
        demoRodar();
        if (DEMO_T === null) setInterval(demoRodar, 2500);
      } else {
        ciclo("br", 60000, atualizarBR);
        ciclo("estados", 120000, atualizarEstados);
      }
    });
  }

  // Modo app: carrega, em ordem, os módulos do app (em ../js/, relativo a www/site/) e o js/modo-app.js do site.
  var MODULOS_APP = ["../js/integridade.js", "../js/monitorLogic.js", "../js/config.js", "../js/news.js", "../js/eventos.js", "../js/atualizacao.js", "js/modo-app.js"];
  function carregarScripts(lista) {
    return lista.reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (ok) {
          var s = document.createElement("script");
          s.src = src; s.async = false;
          s.onload = function () { ok(true); };
          s.onerror = function () { console.warn("modo app: não carregou " + src); ok(false); };   // segue sem ele
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve());
  }
  function prepararModoApp() {
    var limite = new Promise(function (ok) { setTimeout(ok, 8000); });      // nunca deixa a página esperando para sempre
    return Promise.race([carregarScripts(MODULOS_APP), limite]).then(function () {
      if (window.ModoApp) { try { window.ModoApp.iniciar(Site); } catch (e) { console.error("modo app", e); } }
    });
  }

  // =====================================================================
  // API para o modo app (js/modo-app.js)
  // =====================================================================
  var Site = window.Site = {
    C: C, PT: PT, S: S, APP: APP, DEMO: DEMO, esc: esc, $: $, setTxt: setTxt, setHtml: setHtml, d2: d2,
    agoraMs: agoraMs, abrirExterno: abrirExterno, urlRede: urlRede, hooks: [], renderizar: function () { renderTudo(); },
    aoRenderizar: function (fn) { Site.hooks.push(fn); },
    criarAba: criarAba, irParaAba: irParaAba, abaAtual: function () { return abaAtual; },
    // o modo app entrega as manchetes de todos os feeds (via proxy); a aba usa a mesma lista
    noticias: {
      definir: function (itens, estado, fonte) {
        NOT.itens = itens || []; NOT.estado = estado || (NOT.itens.length ? "ok" : "vazio"); if (fonte) NOT.fonte = fonte;
        renderNoticias();
      },
      extra: function () { return $("notExtra"); }
    }
  };
  // No app, links externos abrem no navegador do aparelho (o WebView não abre janelas novas)
  if (window.AndroidBridge && typeof window.AndroidBridge.openExternal === "function") {
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a || !/^https?:/i.test(a.getAttribute("href"))) return;
      e.preventDefault();
      abrirExterno(a.href);
    });
  }

  // quando o relógio cruza 17h sem novos dados, troca "antes" por "aguardando"
  var modoAnterior = null;
  function renderHeroModoSeMudou() {
    var m = C.modoHero(C.visaoNacional(S.br, PT).d, agoraMs());
    if (m !== modoAnterior) { modoAnterior = m; renderHero(); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
