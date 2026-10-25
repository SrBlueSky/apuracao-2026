/* mundi.js — interface do MAPA-MÚNDI do voto no exterior (aba Mapa, visão "Exterior", hash #mapa/exterior).
 * Só DOM + rede; a lógica de dados está em exterior.js / exterior-paises.js (testadas em tests/).
 * app.js chama Mundi.criar(contexto) e depois sincroniza (abrir/fechar), renderiza e repassa o modo (2º turno ao vivo / 1º turno).
 * Rede: SÓ com a visão aberta (186 arquivos pequenos, no máximo 12 por vez, a cada 3 min; mantém o último dado bom por cidade).
 * As 186 cidades NÃO são buscadas ao carregar a página. O SVG do mapa e o 1º turno por cidade são carregados na primeira abertura.
 */
(function () {
  "use strict";

  function criar(ctx) {
    var C = ctx.C, X = ctx.X, P = ctx.P, esc = ctx.esc, $ = ctx.$, DEMO = ctx.DEMO;
    var LOTE = 12, CICLO_MS = 180000;

    var M = {
      ativo: false, svgOk: false, carregando: false, erro: "",
      regs: {}, cg: {},                 // último dado bom por cidade (ao vivo)
      refRegs: null,                    // 1º turno por cidade
      fixo: null, hover: null, todos: false,
      agg: null, aggRef: null, regsDemo: null,
      lendo: false, ult: 0, falhas: 0, timer: null, renderT: null,
      base: null, vb: null, arrastou: false, svg: null
    };

    function modo() { return ctx.modo(); }
    function d2(x) { return C.fmtDec(x, 2); }
    function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
    function nomePres(k) { return C.PRES[k] ? C.PRES[k].nome : k; }

    // ---------------------------------------------------------------- carga preguiçosa (SVG + 1º turno por cidade)
    function carregarScript(src) {
      return new Promise(function (ok, falha) {
        var s = document.createElement("script");
        s.src = src; s.async = true;
        s.onload = function () { ok(); };
        s.onerror = function () { falha(new Error("não carregou " + src)); };
        document.head.appendChild(s);
      });
    }
    function garantirDados() {
      if (M.svgOk) return Promise.resolve();
      if (M.carregando) return M.carregando;
      var pend = [];
      if (!window.MUNDI_SVG) pend.push(carregarScript("js/mundi-svg.js"));
      if (!window.PRIMEIRO_TURNO_EXTERIOR) pend.push(carregarScript("dados/primeiro-turno-exterior.js"));
      M.carregando = Promise.all(pend).then(function () {
        M.refRegs = (window.PRIMEIRO_TURNO_EXTERIOR && window.PRIMEIRO_TURNO_EXTERIOR.cidades) || {};
        montarSvg();
        M.svgOk = true; M.erro = "";
      }, function (e) {
        M.erro = "Não foi possível carregar o mapa-múndi. Recarregue a página.";
        console.error("mundi", e);
      }).then(function () { M.carregando = false; });
      return M.carregando;
    }

    // ---------------------------------------------------------------- SVG
    function montarSvg() {
      var box = $("mundiBox");
      box.innerHTML = window.MUNDI_SVG || "";
      var svg = M.svg = box.querySelector("svg");
      if (!svg) return;
      var vb = svg.viewBox.baseVal;
      M.base = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
      M.vb = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
      svg.querySelectorAll("[data-pais]").forEach(function (el) {
        var iso = el.getAttribute("data-pais");
        var t = document.createElementNS("http://www.w3.org/2000/svg", "title");
        if (iso === "BR") { t.textContent = "Brasil — voltar ao mapa do Brasil"; el.setAttribute("role", "link"); }
        else { t.textContent = P.nomePais(iso); el.setAttribute("role", "button"); el.setAttribute("aria-label", P.nomePais(iso)); }
        el.appendChild(t);
      });
      ligarEventos(box);
    }

    function paisDe(el) {
      var n = el && el.closest ? el.closest("[data-pais]") : null;
      return n ? n.getAttribute("data-pais") : null;
    }
    function ligarEventos(box) {
      box.addEventListener("pointerover", function (e) {
        if (e.pointerType !== "mouse") return;
        var iso = paisDe(e.target);
        setHover(iso && iso !== "BR" ? iso : null);
      });
      box.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") setHover(null); });
      box.addEventListener("click", function (e) {
        if (M.arrastou) { M.arrastou = false; return; }
        var iso = paisDe(e.target);
        if (iso === "BR") { ctx.irParaBrasil(); return; }
        if (iso) alternarFixo(iso); else if (M.fixo) { M.fixo = null; render(); }
      });
      // arrastar para mover o mapa aproximado (mouse, toque ou caneta); sem captura de ponteiro, para o clique continuar no país certo
      box.addEventListener("pointerdown", function (e) {
        if (!M.svg || M.vb.w >= M.base.w - 1 || (e.pointerType === "mouse" && e.button !== 0)) return;
        var x0 = e.clientX, y0 = e.clientY, vx = M.vb.x, vy = M.vb.y, mov = false;
        var larg = M.svg.clientWidth || 1;
        function mover(ev) {
          var dx = ev.clientX - x0, dy = ev.clientY - y0;
          if (!mov && Math.abs(dx) + Math.abs(dy) < 5) return;
          mov = true; M.arrastou = true;
          M.vb.x = vx - dx * M.vb.w / larg; M.vb.y = vy - dy * M.vb.w / larg;
          limitarVB(); aplicarVB();
        }
        function fim() {
          document.removeEventListener("pointermove", mover); document.removeEventListener("pointerup", fim); document.removeEventListener("pointercancel", fim);
          if (mov) setTimeout(function () { M.arrastou = false; }, 0);
        }
        document.addEventListener("pointermove", mover); document.addEventListener("pointerup", fim); document.addEventListener("pointercancel", fim);
      });
      // pinça no touchpad (ctrl + roda) aproxima em torno do cursor
      box.addEventListener("wheel", function (e) {
        if (!(e.ctrlKey || e.metaKey) || !M.svg) return;
        e.preventDefault();
        var r = M.svg.getBoundingClientRect();
        zoomar(e.deltaY < 0 ? 1.25 : 0.8, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }, { passive: false });
    }

    function aplicarVB() {
      if (!M.svg) return;
      M.svg.setAttribute("viewBox", M.vb.x.toFixed(1) + " " + M.vb.y.toFixed(1) + " " + M.vb.w.toFixed(1) + " " + M.vb.h.toFixed(1));
      var box = $("mundiBox"), z = M.vb.w < M.base.w - 1;
      box.classList.toggle("zoom", z);
      var rs = $("mzReset"); if (rs) rs.disabled = !z;
      var mn = $("mzMenos"); if (mn) mn.disabled = !z;
      var mx = $("mzMais"); if (mx) mx.disabled = M.vb.w <= M.base.w / 8 + 1;
    }
    function limitarVB() {
      M.vb.x = clamp(M.vb.x, M.base.x, M.base.x + M.base.w - M.vb.w);
      M.vb.y = clamp(M.vb.y, M.base.y, M.base.y + M.base.h - M.vb.h);
    }
    function zoomar(k, fx, fy) {
      if (!M.base) return;
      var nw = clamp(M.vb.w / k, M.base.w / 8, M.base.w), nh = nw * M.base.h / M.base.w;
      M.vb.x += (M.vb.w - nw) * (fx === undefined ? 0.5 : fx);
      M.vb.y += (M.vb.h - nh) * (fy === undefined ? 0.5 : fy);
      M.vb.w = nw; M.vb.h = nh;
      limitarVB(); aplicarVB();
    }
    function resetarZoom() {
      if (!M.base) return;
      M.vb = { x: M.base.x, y: M.base.y, w: M.base.w, h: M.base.h }; aplicarVB();
    }

    // ---------------------------------------------------------------- dados
    function regsAtuais() {
      if (DEMO) {
        var t = ctx.demoT();
        if (!M.regsDemo || M.regsDemoT !== t) {
          M.regsDemo = ctx.D.gerarExterior({ cidades: M.refRegs || {} }, t, P.paisDe); M.regsDemoT = t;
        }
        return M.regsDemo;
      }
      return M.regs;
    }
    function calcular() {
      var ao = regsAtuais();
      M.regsVivos = ao;
      M.agg = X.agregar(ao);
      M.aggRef = X.agregar(M.refRegs || {});
    }
    function nLidas() { return DEMO ? P.CIDADES.length : Object.keys(M.regs).length; }

    // visão do país no turno escolhido: { l, b, v (visão usada), usaRef, vv (ao vivo), vr (1º turno) }
    function visaoPais(iso) {
      var a = M.agg && M.agg[iso], r = M.aggRef && M.aggRef[iso];
      var vv = X.visao(a), vr = X.visao(r);
      var usaRef = modo() === "1t" || !vv.temVotos;
      var v = usaRef ? vr : vv;
      return { l: v.lider, b: v.faixa, v: v, usaRef: usaRef, vv: vv, vr: vr, a: a, r: r };
    }

    // ---------------------------------------------------------------- render
    function pintarMapa() {
      if (!M.svg) return;
      var m = modo();
      M.svg.querySelectorAll("[data-pais]").forEach(function (el) {
        var iso = el.getAttribute("data-pais");
        if (iso === "BR") return;
        var a = M.agg[iso], x = a ? X.visao(m === "1t" ? M.aggRef[iso] : a) : null;
        if (x && x.lider) { el.dataset.l = x.lider; el.dataset.b = String(Math.max(1, x.faixa)); }
        else { delete el.dataset.l; delete el.dataset.b; }
        el.classList.toggle("sel", M.fixo === iso);
      });
    }

    function linhaCartao(cls, nome, pct, votos) {
      return '<div class="lin ' + cls + '"><span class="pt"></span><span>' + esc(nome) + '</span><b>' + C.fmtPct(pct) + '</b><span class="v">' + C.fmtInt(votos) + ' votos</span></div>';
    }

    function listaCidades(iso, usaRef) {
      var fonte = usaRef ? (M.aggRef[iso] && M.aggRef[iso].cidades) : (M.agg[iso] && M.agg[iso].cidades);
      var itens = (fonte || []).map(function (c) { return { c: c, v: X.visao(c.reg) }; });
      itens.sort(function (a, b) { return (b.v.vv - a.v.vv) || a.c.nome.localeCompare(b.c.nome, "pt-BR"); });
      var h = '<div class="cartao-cidades"><p class="cartao-cid-tit">Cidades <small>' + itens.length + '</small></p><ul>';
      itens.forEach(function (i) {
        h += '<li><span class="rk-pt' + (i.v.lider ? " c" + i.v.lider : "") + '"></span><span class="cid-nome">' + esc(i.c.nome) + '</span>' +
          (!i.v.temVotos ? '<b class="mut">—</b>'
            : usaRef ? '<b class="mut">' + C.fmtPct(i.v.p13) + " × " + C.fmtPct(i.v.p22) + '</b>'
            : (i.v.lider ? '<b class="c' + i.v.lider + '">' + esc(C.PRES[i.v.lider].curto) + " +" + d2(i.v.margemPP) + '</b>' : '<b class="mut">—</b>')) + '</li>';
      });
      return h + "</ul></div>";
    }

    function cartaoPais(iso) {
      var x = visaoPais(iso), a = x.a;
      if (!a) return cartaoVazio();
      var vv = x.vv, ref = x.vr, live = vv.temVotos, m = modo();
      var h = '<h3><small>Exterior' + (a.nCid > 1 ? " · " + a.nCid + " cidades" : " · 1 cidade") + '</small>' + esc(a.nome) + '</h3>';
      // ---- 2º turno (bloco principal)
      h += '<section class="turno-bloco"><p class="turno-cab">' + C.selo2(live) + (live ? "" : ' <span class="mut">ainda sem votos apurados</span>') + '</p>';
      if (live) {
        var sum = vv.p13 + vv.p22 || 1;
        h += '<div class="mini-barra"><span class="a" style="width:' + (100 * vv.p13 / sum).toFixed(2) + '%"></span><span class="b" style="width:' + (100 * vv.p22 / sum).toFixed(2) + '%"></span></div>';
        h += linhaCartao("c13", "Lula", vv.p13, vv.v13) + linhaCartao("c22", "Flávio Bolsonaro", vv.p22, vv.v22);
        h += '<div class="cartao-info">';
        h += vv.lider
          ? '<span>Vantagem: <span class="c' + vv.lider + '">' + esc(nomePres(vv.lider)) + ' +' + d2(vv.margemPP) + ' p.p.</span> (' + C.fmtInt(vv.margemVotos) + ' votos)</span>'
          : '<span>Votos idênticos até aqui.</span>';
        h += '<span>Urnas apuradas: <b>' + C.fmtPct(vv.pst) + '</b> (' + C.fmtInt(vv.s) + ' de ' + C.fmtInt(vv.st) + ' seções)</span>';
        if (!DEMO && a.nLidas < a.nCid) h += '<span class="mut">Atenção: só ' + a.nLidas + ' de ' + a.nCid + ' cidades lidas até agora; os totais podem estar incompletos.</span>';
        h += '</div>';
      } else {
        h += '<div class="mini-barra vazia"><span class="a"></span><span class="b"></span></div>';
        h += '<p class="cartao-vazio" style="margin-top:10px">Aguardando a apuração do 2º turno neste país.</p>';
      }
      h += '</section>';
      // ---- 1º turno (caixa de referência)
      h += ctx.ref1tAbre() + '<p class="turno-cab">' + C.selo1() + (m === "1t" ? ' <span class="mut">cor do mapa agora</span>' : "") + '</p>';
      if (ref.temVotos) {
        var o = Math.max(0, 100 - ref.p13 - ref.p22);
        h += '<div class="mini-barra"><span class="a" style="width:' + ref.p13.toFixed(2) + '%"></span><span class="o" style="width:' + o.toFixed(2) + '%"></span><span class="b" style="width:' + ref.p22.toFixed(2) + '%"></span></div>';
        h += linhaCartao("c13", "Lula", ref.p13, ref.v13) + linhaCartao("c22", "Flávio Bolsonaro", ref.p22, ref.v22);
        h += '<div class="cartao-info">';
        if (o > 0.005) h += '<span class="mut">Demais candidatos: ' + C.fmtPct(o) + ' dos votos válidos.</span>';
        h += '<span class="mut">Seções: ' + C.fmtInt(ref.st) + '</span>';
        if (live) h += '<span class="mut">Variação do 2º turno sobre o 1º: Lula ' + C.fmtSinal(vv.p13 - ref.p13) + ' p.p. · Flávio ' + C.fmtSinal(vv.p22 - ref.p22) + ' p.p.</span>';
        h += '</div>';
      } else {
        h += '<p class="cartao-vazio" style="margin-top:8px">Sem votos de brasileiros neste país no 1º turno.</p>';
      }
      h += '</details>';
      if (ref.eleitorado > 0) h += '<p class="cartao-info"><span class="mut">Eleitorado: ' + C.fmtInt(ref.eleitorado) + '</span></p>';
      h += listaCidades(iso, x.usaRef);
      return h;
    }

    function cartaoVazio() {
      var l13 = 0, l22 = 0, n2 = 0, r13 = 0, r22 = 0, n1 = 0;
      Object.keys(M.agg || {}).forEach(function (iso) {
        var x = visaoPais(iso);
        if (x.vv.temVotos) { n2++; if (x.vv.lider === "13") l13++; else if (x.vv.lider === "22") l22++; }
        if (x.vr.temVotos) { n1++; if (x.vr.lider === "13") r13++; else if (x.vr.lider === "22") r22++; }
      });
      var tot = ctx.totalExterior();
      var h = '<h3><small>Exterior</small>Escolha um país</h3><p class="cartao-vazio" style="margin-top:10px">Passe o mouse (ou toque) em um país do mapa, ou escolha na lista. Países pequenos aparecem como círculos. Dá para aproximar o mapa com os botões + e −.</p>';
      h += '<section class="turno-bloco"><p class="turno-cab">' + C.selo2(n2 > 0) + '</p>' + (n2 > 0
        ? '<p class="cartao-info" style="border:0;padding:0;margin-top:8px"><span>Em <b>' + n2 + '</b> países já há votos apurados.</span>' + (modo() === "2t" ? '<span><span class="c13">Lula lidera em ' + l13 + '</span> · <span class="c22">Flávio lidera em ' + l22 + '</span></span>' : '') + '</p>'
        : '<p class="cartao-info" style="border:0;padding:0;margin-top:8px"><span class="mut">Nenhum país tem votos apurados ainda.</span></p>');
      if (tot && !tot.ref) h += '<p class="cartao-info"><span class="mut">Total do Exterior: <span class="c13">Lula ' + C.fmtPct(tot.p13) + '</span> · <span class="c22">Flávio ' + C.fmtPct(tot.p22) + '</span></span></p>';
      h += '</section>';
      h += ctx.ref1tAbre() + '<p class="turno-cab">' + C.selo1() + '</p>' + (n1 > 0
        ? '<p class="cartao-info" style="border:0;padding:0;margin-top:8px"><span>Em <b>' + n1 + '</b> países houve votos.</span></p>'
        : '<p class="cartao-info" style="border:0;padding:0;margin-top:8px"><span class="mut">Sem dados do 1º turno.</span></p>');
      if (tot && tot.ref) h += '<p class="cartao-info"><span class="mut">Total do Exterior: <span class="c13">Lula ' + C.fmtPct(tot.p13) + '</span> · <span class="c22">Flávio ' + C.fmtPct(tot.p22) + '</span></span></p>';
      h += '</details>';
      return h;
    }

    function renderCartao() {
      var iso = M.hover || M.fixo;
      ctx.setHtml($("cartaoPais"), iso ? cartaoPais(iso) : cartaoVazio());
    }

    function renderRanking() {
      var ol = $("rankPaises"); if (!ol) return;
      var m = modo();
      var itens = X.ranking(m === "1t" ? M.aggRef : M.agg, M.aggRef);
      var algum = itens.some(function (i) { return i.v.lider; });
      var maxN = M.todos ? itens.length : 15;
      ctx.setHtml($("rankPaisNota"), m === "1t" ? C.selo1() + (algum ? " Lula × Flávio, em % dos votos válidos" : " sem dados") : (algum ? "por votos válidos" : "sem votos ainda"));
      ctx.setHtml(ol, itens.slice(0, maxN).map(function (i) {
        var sel = M.fixo === i.iso, v = i.v;
        return '<li><button type="button" class="rank-lin' + (sel ? " sel" : "") + '" data-pais="' + i.iso + '"' + (sel ? ' aria-current="true"' : "") + '>' +
          '<span class="rk-pt' + (v.lider ? " c" + v.lider : "") + '"></span><span class="rk-nome">' + esc(i.nome) + '</span>' +
          (!v.lider ? '<b class="mut">—</b>' : m === "1t" ? '<b class="mut">' + C.fmtPct(v.p13) + " × " + C.fmtPct(v.p22) + "</b>"
            : '<b class="c' + v.lider + '">' + esc(C.PRES[v.lider].curto) + " +" + d2(v.margemPP) + "</b>") + "</button></li>";
      }).join(""));
      var bt = $("rankPaisMais");
      if (bt) { bt.hidden = itens.length <= 15; bt.textContent = M.todos ? "Mostrar só os 15 primeiros" : "Mostrar todos os " + itens.length + " países"; }
    }

    function renderStatus() {
      var n = nLidas(), tot = P.CIDADES.length, txt;
      if (M.erro) txt = M.erro;
      else if (DEMO) txt = "Dados de demonstração para as " + tot + " cidades.";
      else if (modo() === "1t") txt = "1º turno (04/10): resultado final em " + tot + " cidades.";
      else if (!n) txt = M.lendo ? "Lendo as " + tot + " cidades do TSE…" : "Aguardando as cidades do TSE…";
      else {
        var hh = M.ult ? new Date(M.ult) : null;
        txt = n + " de " + tot + " cidades lidas" + (M.lendo ? " (atualizando…)" : "") +
          (hh ? " · atualizado às " + ("0" + hh.getHours()).slice(-2) + ":" + ("0" + hh.getMinutes()).slice(-2) : "") +
          (M.falhas && !M.lendo ? " · " + M.falhas + " falharam, mantendo o último dado" : "");
      }
      ctx.setTxt($("mundiEstado"), txt);
    }

    function render() {
      if (!M.ativo || !M.svgOk) { renderStatus(); return; }
      calcular();
      pintarMapa();
      renderCartao();
      renderRanking();
      renderStatus();
      ctx.setHtml($("legTurnoMundi"), modo() === "1t" ? C.selo1() + " cores do 1º turno" : C.selo2(true) + " cores do 2º turno");
      ctx.setTxt($("mapaSub"), modo() === "2t"
        ? "Cada país leva a cor de quem está à frente entre os brasileiros que votaram lá; quanto mais intensa, maior a vantagem. Cinza: ainda sem votos apurados. Países sem brasileiros votando ficam em cinza bem claro."
        : "Resultado final do 1º turno (04/10) no exterior, colorido pelo mais votado entre Lula e Flávio em cada país. Os demais candidatos não entram na cor.");
    }
    function agendarRender() {
      if (M.renderT) return;
      M.renderT = setTimeout(function () { M.renderT = null; render(); }, 350);
    }

    function setHover(iso) { if (M.hover === iso) return; M.hover = iso; if (M.svgOk) renderCartao(); }
    function alternarFixo(iso) {
      M.fixo = M.fixo === iso ? null : iso;
      render();
      if (M.fixo && window.matchMedia && window.matchMedia("(max-width: 1023px)").matches) {
        $("cartaoPais").scrollIntoView({ block: "nearest", behavior: ctx.reduz() ? "auto" : "smooth" });
      }
    }

    // ---------------------------------------------------------------- leitura (rede)
    function lerTudo() {
      if (DEMO || M.lendo) return Promise.resolve();
      M.lendo = true; agendarRender();
      var ok = 0, falhou = 0;
      return X.lerEmLotes(P.CIDADES, function (c) { return ctx.buscarUrl(X.urlCidade(ctx.ele2, c.cd)); }, LOTE, function (c, d, err) {
        if (err || !d) { falhou++; return; }
        ok++;
        var cg = C.carimboGeracao(d), ant = M.cg[c.cd];
        if (ant && cg && cg < ant) return;             // resposta mais velha do que a que já temos
        M.cg[c.cd] = cg; M.regs[c.cd] = X.registroDe(d);
        agendarRender();
      }).then(function () {
        M.lendo = false; M.ult = Date.now(); M.falhas = falhou;
        render();
      }, function () { M.lendo = false; });
    }
    function cicloLeitura() {
      clearTimeout(M.timer); M.timer = null;
      if (!M.ativo || DEMO) return;
      M.timer = setTimeout(function () {
        if (M.ativo && !document.hidden && modo() === "2t") lerTudo().then(cicloLeitura, cicloLeitura); else cicloLeitura();
      }, CICLO_MS + Math.floor(Math.random() * 1500));
    }
    function leituraSeVelha() {
      if (M.ativo && !DEMO && modo() === "2t" && !M.lendo && Date.now() - M.ult > 60000) lerTudo();
    }
    document.addEventListener("visibilitychange", function () { if (!document.hidden) leituraSeVelha(); });

    // ---------------------------------------------------------------- abrir / fechar
    function abrir() {
      if (M.ativo) { render(); return; }
      M.ativo = true;
      renderStatus();
      garantirDados().then(function () {
        if (!M.ativo) return;
        if (M.erro) { renderStatus(); return; }
        aplicarVB(); render();
        if (!DEMO && modo() === "2t") lerTudo();
        cicloLeitura();
      });
    }
    function fechar() {
      M.ativo = false; clearTimeout(M.timer); M.timer = null;
    }
    function modoMudou() { if (M.ativo) { render(); leituraSeVelha(); } }

    // ---------------------------------------------------------------- montagem fixa (legenda, botões)
    function construirLegenda() {
      function esc5(cls) {
        var h = '<span class="leg-esc ' + cls + '">';
        for (var i = 1; i <= 5; i++) h += '<i data-b="' + i + '" title="' + esc(C.FAIXAS_TEXTO[i]) + '"></i>';
        return h + "</span>";
      }
      $("legendaMundi").innerHTML =
        '<div class="leg-turno" id="legTurnoMundi"></div>' +
        '<div class="leg-linha"><span class="leg-nome" style="color:var(--c13)">Lula à frente</span>' + esc5("s13") + '<span class="leg-rot">vantagem: de menos de 2 a mais de 20 pontos percentuais</span></div>' +
        '<div class="leg-linha"><span class="leg-nome" style="color:var(--c22)">Flávio à frente</span>' + esc5("s22") + '<span class="leg-rot">mesma escala</span></div>' +
        '<div class="leg-linha"><span class="leg-nome">Sem votos</span><span class="leg-esc vazio"><i></i></span><span class="leg-rot">ainda não apurado (ou empate exato)</span></div>' +
        '<div class="leg-linha"><span class="leg-nome">Sem brasileiros</span><span class="leg-esc sem"><i></i></span><span class="leg-rot">país sem local de votação</span></div>';
    }
    function montar() {
      construirLegenda();
      $("mzMais").addEventListener("click", function () { zoomar(1.6); });
      $("mzMenos").addEventListener("click", function () { zoomar(1 / 1.6); });
      $("mzReset").addEventListener("click", resetarZoom);
      $("rankPaises").addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("button[data-pais]");
        if (b) { e.stopPropagation(); alternarFixo(b.dataset.pais); }
      });
      $("rankPaisMais").addEventListener("click", function () { M.todos = !M.todos; renderRanking(); });
      document.addEventListener("click", function (e) {
        if (M.fixo && M.ativo && !e.target.closest("#mundiGrade, #ctlOnde, #ctlMapa")) { M.fixo = null; render(); }
      });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && M.fixo && M.ativo) { M.fixo = null; render(); } });
      ctx.setHtml($("cartaoPais"), "");
    }
    montar();

    return { abrir: abrir, fechar: fechar, render: render, modoMudou: modoMudou, estado: M };
  }

  window.Mundi = { criar: criar };
})();
