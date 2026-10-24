/* app.js — interface do site de apuração do 2º turno de 2026 (DOM + rede).
 * Toda a lógica de dados está em apuracao-core.js (testada em tests/). Aqui só há:
 * busca no TSE (ou demo), montagem da página e atualização in-place dos elementos
 * (assim as barras e os números animam em vez de "piscar").
 */
(function () {
  "use strict";

  var C = window.ApuracaoCore, D = window.ApuracaoDemo;
  var PT = window.PRIMEIRO_TURNO || { presidente: {}, governador: {} };
  var esc = C.escapeHtml;

  var qs = new URLSearchParams(location.search);
  var DEMO = qs.get("demo") === "1";
  var DEMO_T = null;
  if (qs.has("t") && isFinite(parseFloat(qs.get("t")))) DEMO_T = Math.max(0, Math.min(1, parseFloat(qs.get("t"))));
  // ?agora=2026-10-25T21:00:00Z — só para testar estados de horário (não é anunciado na página)
  var AGORA_FIXO = qs.get("agora") ? Date.parse(qs.get("agora")) : NaN;
  function agoraMs() { return isFinite(AGORA_FIXO) ? AGORA_FIXO : Date.now(); }

  var REDUZ = false;
  try { REDUZ = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var S = {
    br: null, ufs: {}, gov: {}, vis: {},
    okBr: 0, falhasBr: 0, okEst: 0,
    mapaModo: "2t", ordem: "nome", agrupar: false,
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
  function renderHero() {
    var vn = C.visaoNacional(S.br, PT), d = vn.d, ref = vn.ref;
    var modo = C.modoHero(d, agoraMs()), vivo = modo === "vivo";
    $("heroModo").dataset.modo = modo;
    setTxt($("heroPilula"), vivo ? "Ao vivo · 2º turno" :
      modo === "antes" ? "Referência · resultado do 1º turno (04/10). O 2º turno começa a ser divulgado às 17h" :
        "Aguardando os primeiros resultados · abaixo, o 1º turno como referência");

    ["13", "22"].forEach(function (k) {
      var lado = k === "13" ? d.a : d.b;
      animNum($("pct" + k), vivo ? lado.pct : (ref ? ref[k].pct : 0), d2);
      animNum($("votos" + k), vivo ? lado.vap : (ref ? ref[k].vap : 0), C.fmtInt);
      setTxt($("rot" + k), vivo ? "votos" : "votos no 1º turno");
      $("cand" + k).classList.toggle("ref", !vivo);
      $("eleito" + k).hidden = !lado.eleito;
    });

    var w13 = 50, w22 = 50, wo = 0;
    if (vivo) { var soma = d.a.vap + d.b.vap; w13 = 100 * d.a.vap / soma; w22 = 100 - w13; }
    else if (ref) { w13 = ref["13"].pct; w22 = ref["22"].pct; wo = Math.max(0, 100 - w13 - w22); }
    setW($("seg13"), w13); setW($("seg22"), w22); setW($("segOutros"), wo);
    $("barraHero").setAttribute("aria-label", vivo
      ? "Lula " + d2(w13) + " por cento, Flávio Bolsonaro " + d2(w22) + " por cento, dos votos válidos"
      : ref ? "Referência do 1º turno: Lula " + d2(ref["13"].pct) + " por cento, Flávio Bolsonaro " + d2(ref["22"].pct) + " por cento" : "Barra sem dados");
    setTxt($("barraNota"), vivo
      ? "Parcela de cada um nos votos válidos. A linha marca os 50%."
      : "Referência: parcela de cada um nos votos válidos do 1º turno (04/10); em cinza, os demais candidatos (" + C.fmtPct(wo) + "). A linha marca os 50%.");

    var dif;
    if (vivo) {
      if (d.empate || !d.lider) dif = "Votos idênticos até aqui.";
      else dif = '<b class="c' + d.lider + '">' + esc(nomePres(d.lider)) + '</b> à frente por <b>' + C.fmtInt(d.margemVotos) +
        ' votos</b> (' + d2(d.margemPP) + ' ponto' + (d.margemPP >= 1.005 || d.margemPP < 0.995 ? "s" : "") + ' percentuais)';
    } else if (ref && ref["13"].vap !== ref["22"].vap) {
      var l = ref["13"].vap > ref["22"].vap ? "13" : "22", o = l === "13" ? "22" : "13";
      dif = 'No 1º turno, <b class="c' + l + '">' + esc(nomePres(l)) + '</b> ficou à frente de ' + esc(nomePres(o)) + ' por <b>' +
        C.fmtInt(Math.abs(ref["13"].vap - ref["22"].vap)) + ' votos</b> (' + d2(Math.abs(ref["13"].pct - ref["22"].pct)) + ' pontos percentuais)';
    } else dif = "&nbsp;";
    setHtml($("heroDif"), dif);

    var ele = d.eleito;
    $("heroEleito").hidden = !ele;
    if (ele) setTxt($("heroEleito"), "O TSE registra " + nomePres(ele) + " como eleito.");

    $("blocoContagem").hidden = modo !== "antes";
    $("blocoAguardando").hidden = modo !== "aguardando";
    document.querySelector(".painel").classList.toggle("dois", modo !== "vivo");
    animNum($("progPct"), d.pst, d2);
    setW($("progBarra"), d.pst);
    setTxt($("progDet"), d.secTot > 0 ? C.fmtInt(d.secApur) + " de " + C.fmtInt(d.secTot) + " seções totalizadas" : "Aguardando o TSE");
    setTxt($("heroAtual"), d.atualizacao.longo);
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
    else if (!S.okBr) { st.dataset.estado = S.falhasBr > 0 ? "erro" : "conectando"; txt = S.falhasBr > 0 ? "Sem conexão com o TSE" : "Conectando ao TSE…"; }
    else {
      var seg = Math.max(0, Math.round((Date.now() - S.okBr) / 1000));
      var quando = seg < 60 ? "há " + seg + " s" : "há " + Math.floor(seg / 60) + " min";
      if (seg > 240) { st.dataset.estado = "erro"; txt = "Sem atualizar " + quando; }
      else {
        var vivo = C.visaoNacional(S.br, PT).d.temVotos;
        st.dataset.estado = vivo ? "vivo" : "ok";
        txt = (vivo ? "Ao vivo · " : "Conectado ao TSE · ") + quando;
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

  function pintar(node, v) {
    var x = lideranca(v, S.mapaModo);
    if (x.l) { node.dataset.l = x.l; node.dataset.b = String(Math.max(1, x.b)); }
    else { delete node.dataset.l; delete node.dataset.b; }
  }

  function renderMapa() {
    var box = $("mapaBox");
    box.querySelectorAll("path[data-uf]").forEach(function (p) { if (S.vis[p.dataset.uf]) pintar(p, S.vis[p.dataset.uf]); });
    if (S.vis.zz) pintar($("chipZZ"), S.vis.zz);
    setTxt($("mapaSub"), S.mapaModo === "2t"
      ? "Cada estado leva a cor de quem está à frente no 2º turno; quanto mais intensa, maior a vantagem. Cinza: ainda sem votos apurados."
      : "Resultado final do 1º turno (04/10), colorido pelo mais votado entre Lula e Flávio em cada estado. Os demais candidatos não entram na cor.");
    $("ctlMapa").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.modo === S.mapaModo)); });
    var sel = S.fixado || null;
    box.querySelectorAll("path.sel").forEach(function (p) { if (p.dataset.uf !== sel) p.classList.remove("sel"); });
    if (sel) { var p = box.querySelector('path[data-uf="' + sel + '"]'); if (p) p.classList.add("sel"); }
    $("chipZZ").classList.toggle("sel", sel === "zz");
    renderCartao();
  }

  function construirLegenda() {
    function esc5(cls) {
      var h = '<span class="leg-esc ' + cls + '">';
      for (var i = 1; i <= 5; i++) h += '<i data-b="' + i + '" title="' + esc(C.FAIXAS_TEXTO[i]) + '"></i>';
      return h + "</span>";
    }
    $("legenda").innerHTML =
      '<div class="leg-linha"><span class="leg-nome" style="color:var(--c13)">Lula à frente</span>' + esc5("s13") + '<span class="leg-rot">vantagem: de menos de 2 a mais de 20 pontos percentuais</span></div>' +
      '<div class="leg-linha"><span class="leg-nome" style="color:var(--c22)">Flávio à frente</span>' + esc5("s22") + '<span class="leg-rot">mesma escala</span></div>' +
      '<div class="leg-linha"><span class="leg-nome">Sem votos</span><span class="leg-esc vazio"><i></i></span><span class="leg-rot">ainda não apurado (ou empate exato)</span></div>';
  }

  function cartaoVazio() {
    var ufsVotos = 0, l13 = 0, l22 = 0;
    C.UFS.forEach(function (uf) {
      var v = S.vis[uf]; if (!v) return;
      var x = lideranca(v, S.mapaModo);
      if (x.l) { if (x.l === "13") l13++; else l22++; }
      if (S.mapaModo === "1t" ? !!x.l : v.d.temVotos) ufsVotos++;
    });
    var quem = S.mapaModo === "1t" ? "no 1º turno" : "no 2º turno";
    var resumo = ufsVotos > 0
      ? '<p class="cartao-info" style="border:0;padding:0;margin-top:14px"><span>Entre os 28 locais de votação (27 estados e exterior), <b>' + ufsVotos + '</b> ' + (S.mapaModo === "1t" ? "têm resultado" : "já têm votos apurados") + ' ' + quem + '.</span>' +
        '<span><span class="c13">Lula lidera em ' + l13 + '</span> · <span class="c22">Flávio lidera em ' + l22 + '</span></span></p>'
      : '<p class="cartao-info" style="border:0;padding:0;margin-top:14px"><span class="mut">Nenhum estado tem votos apurados ainda. Troque para “1º turno” para ver a referência.</span></p>';
    return '<h3><small>Detalhes</small>Escolha um estado</h3><p class="cartao-vazio" style="margin-top:10px">Passe o mouse (ou toque) em um estado do mapa para ver a votação, a apuração e a comparação com o 1º turno.</p>' + resumo;
  }

  function cartaoHtml(uf) {
    var v = S.vis[uf]; if (!v) return cartaoVazio();
    var ref = v.ref, d = v.d, info = v.info;
    var usaRef = S.mapaModo === "1t" || !d.temVotos;
    var h = '<h3><small>' + esc(info.regiao || "") + '</small>' + esc(info.nome) + '</h3>';
    var a, b, o = 0, va, vb;
    if (!usaRef) { a = d.a.pct; b = d.b.pct; va = d.a.vap; vb = d.b.vap; }
    else if (ref) { a = ref["13"].pct; b = ref["22"].pct; o = ref.outros; va = ref["13"].vap; vb = ref["22"].vap; }
    else { a = 0; b = 0; va = 0; vb = 0; }
    var sum = a + b + o || 1;
    var wa = !usaRef ? 100 * a / sum : a, wb = !usaRef ? 100 * b / sum : b, wo = !usaRef ? 0 : o;
    h += '<span class="cartao-modo ' + (usaRef ? "" : "vivo") + '">' +
      (!usaRef ? "2º turno · ao vivo" : S.mapaModo === "1t" ? "1º turno (04/10) · resultado final" : "Sem votos apurados no 2º turno · mostrando o 1º turno") + '</span>';
    h += '<div class="mini-barra ' + (usaRef && S.mapaModo === "2t" ? "ref" : "") + '"><span class="a" style="width:' + wa.toFixed(2) + '%"></span><span class="o" style="width:' + wo.toFixed(2) + '%"></span><span class="b" style="width:' + wb.toFixed(2) + '%"></span></div>';
    h += '<div class="lin c13"><span class="pt"></span><span>Lula</span><b>' + C.fmtPct(a) + '</b><span class="v">' + C.fmtInt(va) + ' votos</span></div>';
    h += '<div class="lin c22"><span class="pt"></span><span>Flávio Bolsonaro</span><b>' + C.fmtPct(b) + '</b><span class="v">' + C.fmtInt(vb) + ' votos</span></div>';
    if (usaRef && o > 0) h += '<p class="cartao-info"><span class="mut">Demais candidatos no 1º turno: ' + C.fmtPct(o) + ' dos votos válidos.</span></p>';
    h += '<div class="cartao-info">';
    if (!usaRef) {
      h += d.lider
        ? '<span>Vantagem: <span class="c' + d.lider + '">' + esc(nomePres(d.lider)) + ' +' + d2(d.margemPP) + ' p.p.</span> (' + C.fmtInt(d.margemVotos) + ' votos)</span>'
        : '<span>Votos idênticos até aqui.</span>';
      h += '<span>Urnas apuradas: <b>' + C.fmtPct(d.pst) + '</b> (' + C.fmtInt(d.secApur) + ' de ' + C.fmtInt(d.secTot) + ' seções)</span>';
      if (ref) {
        h += '<span class="mut">No 1º turno: Lula ' + C.fmtPct(ref["13"].pct) + ' · Flávio ' + C.fmtPct(ref["22"].pct) + '</span>';
        h += '<span class="mut">Variação sobre o 1º turno: Lula ' + C.fmtSinal(v.var13) + ' p.p. · Flávio ' + C.fmtSinal(v.var22) + ' p.p.</span>';
      }
    } else if (ref) {
      if (ref["13"].vap !== ref["22"].vap) {
        var l = ref["13"].vap > ref["22"].vap ? "13" : "22";
        h += '<span>Vantagem: <span class="c' + l + '">' + esc(nomePres(l)) + ' +' + d2(Math.abs(ref["13"].pct - ref["22"].pct)) + ' p.p.</span> (' + C.fmtInt(Math.abs(ref["13"].vap - ref["22"].vap)) + ' votos)</span>';
      }
      if (ref.pc !== null) h += '<span class="mut">Comparecimento no 1º turno: ' + C.fmtPct(ref.pc) + '</span>';
    }
    if (v.eleitorado > 0) h += '<span class="mut">Eleitorado: ' + C.fmtInt(v.eleitorado) + '</span>';
    h += '</div>';
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
    if (S.fixado && window.matchMedia && window.matchMedia("(max-width: 899px)").matches) {
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
    chip.addEventListener("click", function () { alternarFixo("zz"); });
    chip.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") setHover("zz"); });
    chip.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") setHover(null); });
    // toque/clique fora fecha o cartão fixado
    document.addEventListener("click", function (e) {
      if (S.fixado && !e.target.closest("#mapaBox, #cartaoUF, #chipZZ, #ctlMapa")) { S.fixado = null; renderMapa(); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.fixado) { S.fixado = null; renderMapa(); } });
    $("ctlMapa").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-modo]");
      if (!b) return;
      S.mapaModo = b.dataset.modo;
      renderMapa();
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
      li.className = "uf ref"; li.dataset.uf = uf;
      li.innerHTML =
        '<div class="uf-nome">' + esc(info.nome) + (uf === "zz" ? "" : "<small>" + uf.toUpperCase() + "</small>") + "</div>" +
        '<div class="uf-barra"><div class="mini-barra ref"><span class="a"></span><span class="o"></span><span class="b"></span></div></div>' +
        '<div class="uf-n l13"><b data-r="p13">—</b><span class="d" data-r="d13"></span></div>' +
        '<div class="uf-n l22"><b data-r="p22">—</b><span class="d" data-r="d22"></span></div>' +
        '<div class="uf-marg" data-r="marg">—</div>' +
        '<div class="uf-apur"><span data-r="apur">—</span><div class="mini-trilho"><span></span></div></div>';
      var q = function (s) { return li.querySelector(s); };
      S.linhas[uf] = {
        li: li, a: q(".mini-barra .a"), o: q(".mini-barra .o"), b: q(".mini-barra .b"), barra: q(".mini-barra"),
        p13: q('[data-r="p13"]'), p22: q('[data-r="p22"]'), d13: q('[data-r="d13"]'), d22: q('[data-r="d22"]'),
        marg: q('[data-r="marg"]'), apur: q('[data-r="apur"]'), trilho: q(".mini-trilho span")
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
  }

  function renderLista() {
    var vis = C.UFS.map(function (uf) { return S.vis[uf]; }).filter(Boolean);
    vis.forEach(function (v) {
      var L = S.linhas[v.uf], d = v.d, ref = v.ref, live = d.temVotos;
      L.li.classList.toggle("ref", !live);
      var pa, pb, wa, wb, wo = 0;
      if (live) { pa = d.a.pct; pb = d.b.pct; var s = d.a.vap + d.b.vap; wa = 100 * d.a.vap / s; wb = 100 - wa; }
      else if (ref) { pa = ref["13"].pct; pb = ref["22"].pct; wa = pa; wb = pb; wo = ref.outros; }
      else { pa = 0; pb = 0; wa = 50; wb = 50; }
      L.barra.classList.toggle("ref", !live);
      setW(L.a, wa); setW(L.b, wb); setW(L.o, wo);
      var tag = live ? "" : ' <span class="tag-ref" title="Resultado do 1º turno">1º T</span>';
      setHtml(L.p13, (live || ref) ? C.fmtPct(pa) + tag : "—");
      setHtml(L.p22, (live || ref) ? C.fmtPct(pb) + tag : "—");
      setTxt(L.d13, live ? C.fmtSinal(v.var13) + " p.p. vs 1º T" : "");
      setTxt(L.d22, live ? C.fmtSinal(v.var22) + " p.p. vs 1º T" : "");
      if (live && d.lider) {
        L.marg.className = "uf-marg c" + d.lider;
        setHtml(L.marg, esc(C.PRES[d.lider].curto) + " +" + d2(d.margemPP) + " p.p.<small>" + C.fmtInt(d.margemVotos) + " votos</small>");
      } else if (live) { L.marg.className = "uf-marg"; setHtml(L.marg, "Empate<small>votos idênticos</small>"); }
      else { L.marg.className = "uf-marg"; setHtml(L.marg, "—<small>sem votos</small>"); }
      setTxt(L.apur, C.fmtPct(d.pst, 1));
      setW(L.trilho, d.pst);
    });

    var ord = C.ordenarUFs(vis, S.ordem);
    var chave = S.ordem + "|" + S.agrupar + "|" + ord.map(function (v) { return v.uf; }).join(",");
    if (chave === S.ordemChave) return;
    S.ordemChave = chave;
    var ul = $("listaUFs");
    ul.querySelectorAll("li.reg").forEach(function (n) { n.remove(); });
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
        '<div class="gov-topo"><h3>' + esc(C.UF_INFO[uf].nome) + '</h3><span>' + uf.toUpperCase() + '</span></div>' +
        linhaGov("a", "ca") + linhaGov("b", "cb") +
        '<div class="gov-barra ref"><span class="a"></span><span class="o"></span><span class="b"></span></div>' +
        '<div class="gov-prog"><div class="trilho"><span class="trilho-fill" data-r="trilho"></span></div><span data-r="prog">0,00% das urnas</span></div>' +
        '<div class="gov-rod" data-r="rod"></div>';
      var q = function (s) { return art.querySelector(s); };
      var els = { art: art, barra: q(".gov-barra"), a: q(".gov-barra .a"), o: q(".gov-barra .o"), b: q(".gov-barra .b"), trilho: q('[data-r="trilho"]'), prog: q('[data-r="prog"]'), rod: q('[data-r="rod"]') };
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
        E.row.classList.toggle("ref", !live);
        var pct = live ? lado.pct : (ref && ref[id.n] ? ref[id.n].pct : null);
        var vot = live ? lado.vap : (ref && ref[id.n] ? ref[id.n].vap : null);
        animNum(E.pct, pct === null ? 0 : pct, function (x) { return pct === null ? "—" : C.fmtPct(x); });
        setTxt(E.votos, vot === null ? "" : C.fmtInt(vot) + (live ? " votos" : " votos no 1º turno"));
      });
      var wa = 50, wb = 50, wo = 0;
      if (live) { var s = disp.a.vap + disp.b.vap; wa = 100 * disp.a.vap / s; wb = 100 - wa; }
      else if (ref) { wa = ref[v.nums[0]] ? ref[v.nums[0]].pct : 0; wb = ref[v.nums[1]] ? ref[v.nums[1]].pct : 0; wo = Math.max(0, 100 - wa - wb); }
      G.barra.classList.toggle("ref", !live);
      setW(G.a, wa); setW(G.b, wb); setW(G.o, wo);
      setW(G.trilho, disp.pst);
      setTxt(G.prog, d ? C.fmtPct(disp.pst) + " das urnas apuradas" : "Aguardando o TSE");
      var rod = "";
      if (ref) {
        rod += "<span>1º turno: " + v.nums.map(function (n, i) {
          return "<b>" + esc(ids[i].nome) + "</b> " + (ref[n] ? C.fmtPct(ref[n].pct) : "—");
        }).join(" · ") + "</span>";
      }
      if (live && disp.lider) {
        var li = disp.lider === v.nums[0] ? 0 : 1;
        rod += "<span>Vantagem: <b>" + esc(ids[li].nome) + "</b> +" + d2(disp.margemPP) + " p.p. (" + C.fmtInt(disp.margemVotos) + " votos)</span>";
      } else if (!live) rod += "<span>Resultado do 2º turno ainda não apurado.</span>";
      setHtml(G.rod, rod);
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
      art.innerHTML = "<h3>" + esc(c.titulo) + '</h3><p class="num-valor vazio" data-r="v">—</p><p class="num-abs" data-r="abs"></p><p class="num-ref" data-r="ref" hidden></p>';
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
    function dtxt(x) { return x === null || x === undefined ? "" : " (" + C.fmtSinal(x) + " p.p.)"; }
    card("pc", n.pc, tem ? C.fmtInt(n.comparecimento) + " eleitores votaram" : "Eleitorado: " + C.fmtInt(n.eleitorado),
      ref ? "1º turno: <b>" + C.fmtPct(ref.pc) + "</b>" + dtxt(n.dPc) : "");
    card("pa", n.pa, tem ? C.fmtInt(n.abstencao) + " eleitores não compareceram" : "Quem não vota entra aqui quando houver apuração",
      ref ? "1º turno: <b>" + C.fmtPct(ref.pa) + "</b>" + dtxt(n.dPa) : "");
    card("pb", n.pvb, tem ? C.fmtInt(n.brancos) + " votos" : "Percentual sobre o total de votos", "");
    card("pn", n.ptvn, tem ? C.fmtInt(n.nulos) + " votos" : "Percentual sobre o total de votos", "");
    var nota = $("numNota");
    if (ref) {
      nota.hidden = false;
      setHtml(nota, "Brancos e nulos juntos: " + (tem ? "<b>" + C.fmtPct(n.pbn) + "</b> no 2º turno" + dtxt(n.dPbn) + " · " : "") +
        "<b>" + C.fmtPct(ref.pbn) + "</b> no 1º turno (calculado como comparecimento menos votos válidos; o arquivo do 1º turno aqui guardado não separa brancos de nulos).");
    } else nota.hidden = true;
    setTxt($("numSub"), tem ? "Totais nacionais da apuração em curso, com o 1º turno como régua." : "Aparecem quando o TSE publicar os primeiros votos; o 1º turno serve de régua.");
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
    try { renderHero(); } catch (e) { console.error("hero", e); }
    try { renderMapa(); } catch (e) { console.error("mapa", e); }
    try { renderLista(); } catch (e) { console.error("lista", e); }
    try { renderGov(); } catch (e) { console.error("gov", e); }
    try { renderNumeros(); } catch (e) { console.error("numeros", e); }
    renderStatus();
  }

  // =====================================================================
  // REDE (TSE)
  // =====================================================================
  function buscarTSE(ele, cargo, uf) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    return fetch(C.urlDados(ele, cargo, uf), { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
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
    S.br = g.br; S.ufs = g.ufs; S.gov = g.gov; S.okBr = Date.now();
    renderTudo();
  }

  // =====================================================================
  // TEMA
  // =====================================================================
  function iniciarTema() {
    $("btnTema").addEventListener("click", function () {
      var raiz = document.documentElement, atual = raiz.getAttribute("data-theme");
      if (!atual) atual = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      var prox = atual === "dark" ? "light" : "dark";
      raiz.setAttribute("data-theme", prox);
      try { localStorage.setItem("tema", prox); } catch (e) {}
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
    montarMapa(); construirLegenda(); construirLista(); construirGov(); construirNumeros(); iniciarTema();
    renderTudo(); tickRelogio();
    setInterval(function () { tickRelogio(); renderStatus(); if (!DEMO) renderHeroModoSeMudou(); }, 1000);
    if (DEMO) {
      $("faixaDemo").hidden = false;
      document.title = "[DEMO] Apuração 2º Turno 2026";
      demoRodar();
      if (DEMO_T === null) setInterval(demoRodar, 2500);
    } else {
      ciclo("br", 60000, atualizarBR);
      ciclo("estados", 120000, atualizarEstados);
    }
  }
  // quando o relógio cruza 17h sem novos dados, troca "antes" por "aguardando"
  var modoAnterior = null;
  function renderHeroModoSeMudou() {
    var m = C.modoHero(C.visaoNacional(S.br, PT).d, agoraMs());
    if (m !== modoAnterior) { modoAnterior = m; renderHero(); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
