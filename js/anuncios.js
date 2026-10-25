/* anuncios.js — espaços de publicidade, lidos de anuncios.json (dados, nunca código).
 *
 * Para trocar um patrocinador basta editar e publicar o anuncios.json: o site e o app leem o
 * arquivo ao abrir e de novo a cada 10 minutos, sem precisar de versão nova do app.
 *
 * Cinco espaços, sempre longe dos números da apuração (clique sem querer é proibido pelas regras de
 * redes como o AdSense): "presidente" (faixa no topo da aba Presidente, acima do título), "mapa"
 * (coluna do mapa, abaixo do ranking) e três rodapés independentes, cada um no fim das suas abas:
 * "rodape1" (Presidente e Evolução), "rodape2" (Mapa e Estados) e "rodape3" (Governadores e
 * Notícias). O "rodape" de arquivos antigos vale como "rodape1". Espaço sem anúncio ativo mostra
 * "Anuncie aqui" no site; no app, só aparece anúncio com "mostrarNoApp": true (o convite nunca
 * aparece lá). O site sai do ar na segunda, 26/10/2026, às 5h (Brasília).
 *
 * Formato de cada espaço em anuncios.json (todos os campos de texto opcionais, menos titulo):
 *   { "ativo": true, "mostrarNoApp": false, "anunciante": "Padaria Exemplo",
 *     "titulo": "…", "texto": "…", "botao": "Saiba mais", "link": "https://…",
 *     "imagem": "img/anuncios/arquivo.jpg", "de": "2026-10-25", "ate": "2026-10-31" }
 * Tudo vira texto escapado; links e imagens só https (ou imagem relativa em img/anuncios/).
 *
 * Anúncio "banner": com "banner" (imagem larga, computador) e, opcional, "bannerCelular" (imagem
 * para telas < 1024 px), o anúncio inteiro vira uma imagem clicável (o "link"), com a linha
 * "Patrocinado por …" embaixo. Mesma regra de segurança das imagens.
 *
 * Faixa principal ("presidente"): com 2 ou mais quadros, no computador (>= 1024 px) eles correm
 * numa esteira contínua da direita para a esquerda (pausa com o mouse em cima); no celular, ou com
 * "reduzir movimento" ligado, um quadro por vez, trocando a cada 7 s. No site, depois dos anúncios
 * entram quadros "Anuncie aqui" (espaço disponível): um no celular e, na esteira do computador,
 * cinco (os 4 a mais só existem na esteira). No app o convite nunca aparece.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Anuncios = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CONTATO = "contato@pedrohipolito.com.br";
  var ASSUNTO = "Anúncio no site Apurações";
  var INTERVALO_MS = 10 * 60 * 1000;
  // O site lê o arquivo ao lado dele; o app (file://) lê do site publicado, nesta ordem.
  var URLS_APP = [
    "https://pedrohipolito.com.br/apuracoes/anuncios.json",
    "https://srbluesky.github.io/apuracao-2026/anuncios.json"
  ];

  // Quando o site sai do ar (texto curto do convite e da página Anuncie).
  var PRAZO = "No ar até 26/10, 5h";

  // onde: seletor do elemento de referência (ou lista deles: o espaço aparece em cada um, com id
  // próprio); como: "antes" dele ou "dentro" (no fim); nome/local: o que o convite diz ao anunciante.
  var ESPACOS = {
    presidente: { onde: ["#painel-presidente .hero"], como: "antes", formato: "faixa",
      nome: "Faixa principal", local: "topo da aba Presidente" },
    mapa: { onde: ["#painel-mapa .mapa-lateral"], como: "dentro", formato: "bloco",
      nome: "Coluna do mapa", local: "ao lado do mapa; abaixo dele no celular" },
    rodape1: { onde: ["#painel-presidente", "#painel-evolucao"], como: "dentro", formato: "faixa",
      nome: "Rodapé 1", local: "abas Presidente e Evolução" },
    rodape2: { onde: ["#painel-mapa", "#painel-estados"], como: "dentro", formato: "faixa",
      nome: "Rodapé 2", local: "abas Mapa e Estados" },
    rodape3: { onde: ["#painel-governadores", "#painel-noticias"], como: "dentro", formato: "faixa",
      nome: "Rodapé 3", local: "abas Governadores e Notícias" }
  };

  // Id do elemento de cada lugar: "anuncio-<espaço>" se há um só; com vários, leva o nome da aba
  // (ex. anuncio-rodape1-presidente).
  function idLugar(id, i) {
    var onde = ESPACOS[id].onde;
    if (onde.length === 1) return "anuncio-" + id;
    var m = /#painel-([\w-]+)/.exec(onde[i]);
    return "anuncio-" + id + "-" + (m ? m[1] : i + 1);
  }

  // Configuração de um espaço no anuncios.json; "rodape" (arquivo antigo) vale como "rodape1".
  function configDe(espacos, id) {
    espacos = espacos || {};
    if (id === "rodape1" && espacos.rodape1 == null && espacos.rodape != null) return espacos.rodape;
    return espacos[id];
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function linkSeguro(u) {
    return typeof u === "string" && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : null;
  }

  function imagemSegura(u) {
    if (typeof u !== "string") return null;
    if (/^img\/anuncios\/[A-Za-z0-9._-]+$/.test(u)) return u;
    return linkSeguro(u);
  }

  // "AAAA-MM-DD" -> início (de) ou fim (ate) do dia em Brasília (UTC-3), em ms.
  function diaMs(s, fim) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    if (!m) return NaN;
    var base = Date.UTC(+m[1], +m[2] - 1, +m[3], 3, 0, 0);
    return fim ? base + 86400000 - 1 : base;
  }

  // Anúncio válido para mostrar agora (ou null). Regras: ativo, com título, dentro das datas e,
  // no app, só se mostrarNoApp. A imagem, se inválida, é descartada (o anúncio continua em texto).
  function anuncioValido(a, agoraMs, ehApp) {
    if (!a || typeof a !== "object" || a.ativo !== true) return null;
    if (typeof a.titulo !== "string" || !a.titulo.trim()) return null;
    if (ehApp && a.mostrarNoApp !== true) return null;
    var de = diaMs(a.de, false), ate = diaMs(a.ate, true);
    if (isFinite(de) && agoraMs < de) return null;
    if (isFinite(ate) && agoraMs > ate) return null;
    return {
      anunciante: typeof a.anunciante === "string" ? a.anunciante : "",
      titulo: a.titulo, texto: typeof a.texto === "string" ? a.texto : "",
      botao: typeof a.botao === "string" && a.botao.trim() ? a.botao : "Saiba mais",
      link: linkSeguro(a.link), imagem: imagemSegura(a.imagem),
      banner: imagemSegura(a.banner), bannerCelular: imagemSegura(a.bannerCelular)
    };
  }

  // num/total: numeração discreta "Espaço disponível 2 de 5", mostrada só na esteira do computador.
  function htmlConvite(id, num, total) {
    var esp = id && ESPACOS[id];
    var qual = esp ? '<small class="anuncio-espaco">' + esc(esp.nome + " · " + esp.local) + "</small>" : "";
    var mailto = "mailto:" + CONTATO + "?subject=" + encodeURIComponent(ASSUNTO);
    return '<div class="anuncio-convite">' +
      '<div class="anuncio-txt">' + qual + "<strong>Anuncie aqui</strong>" +
      (num ? '<small class="anuncio-num">Espaço disponível · ' + num + " de " + total + "</small>" : "") +
      "<span>Seu negócio para quem acompanha a apuração ao vivo.</span>" +
      '<p class="vis-contagem" hidden></p>' +
      '<small class="anuncio-prazo">' + PRAZO + "</small></div>" +
      '<a class="anuncio-btn" href="anuncie.html">Ver espaços e preços</a>' +
      '<a class="anuncio-mail" href="' + mailto + '">' + CONTATO + "</a>" +
      '<small class="anuncio-regra">Não aceitamos anúncios de candidatos, partidos ou campanhas.</small>' +
      "</div>";
  }

  // Anúncio "banner": a imagem inteira é o link; "Patrocinado por" fica embaixo.
  function htmlBanner(a) {
    var alt = esc((a.titulo + (a.anunciante ? " — " + a.anunciante : "")));
    var pic = "<picture>" +
      (a.bannerCelular ? '<source media="(max-width: 1023.98px)" srcset="' + esc(a.bannerCelular) + '">' : "") +
      '<img class="anuncio-banner-img" src="' + esc(a.banner) + '" alt="' + alt + '" referrerpolicy="no-referrer"></picture>';
    var corpo = a.link ? '<a class="anuncio-banner-link" href="' + esc(a.link) +
      '" target="_blank" rel="sponsored noopener noreferrer">' + pic + "</a>" : '<span class="anuncio-banner-link">' + pic + "</span>";
    return '<div class="anuncio-banner">' + corpo +
      (a.anunciante ? '<small class="anuncio-regra">Patrocinado por ' + esc(a.anunciante) + "</small>" : "") + "</div>";
  }

  function htmlAnuncio(a) {
    if (a.banner) return htmlBanner(a);
    var img = a.imagem ? '<img class="anuncio-img" src="' + esc(a.imagem) + '" alt="' + esc(a.anunciante || a.titulo) +
      '" loading="lazy" referrerpolicy="no-referrer">' : "";
    var btn = a.link ? '<a class="anuncio-btn" href="' + esc(a.link) + '" target="_blank" rel="sponsored noopener noreferrer">' +
      esc(a.botao) + "</a>" : "";
    return '<div class="anuncio-convite anuncio-pago' + (img ? " com-img" : "") + '">' + img +
      '<div class="anuncio-txt"><strong>' + esc(a.titulo) + "</strong>" +
      (a.texto ? "<span>" + esc(a.texto) + "</span>" : "") +
      (a.anunciante ? '<small class="anuncio-regra">Patrocinado por ' + esc(a.anunciante) + "</small>" : "") +
      "</div>" + btn + "</div>";
  }

  // HTML de um espaço: o(s) anúncio(s) válido(s), senão convite (só no site), senão nada. O espaço
  // aceita um anúncio (objeto) ou vários (lista); com mais de um, eles se revezam (ver girar()).
  // Na faixa principal ("presidente") o convite entra como mais um quadro quando há anúncio ativo
  // (só no site), e com 2+ quadros o espaço vira esteira no computador (ver anuncios.css).
  function htmlEspaco(cfg, agoraMs, ehApp, id) {
    var lista = (Array.isArray(cfg) ? cfg : [cfg]).map(function (a) { return anuncioValido(a, agoraMs, ehApp); })
      .filter(Boolean);
    var quadros = lista.map(htmlAnuncio), extras = 0;
    if (lista.length && !ehApp && id === "presidente") {
      // convite como quadro (vale no celular e no computador) + 4 iguais só para a esteira do computador
      for (var k = 0; k < CONVITES_ESTEIRA; k++) quadros.push(htmlConvite(id, k + 1, CONVITES_ESTEIRA));
      extras = CONVITES_ESTEIRA - 1;
    }
    if (quadros.length === 1) return quadros[0];
    if (quadros.length > 1) {
      var esteira = id === "presidente", n = quadros.length, nv = n - extras; // nv: quadros no celular
      var slides = function (copia) {
        return quadros.map(function (q, i) {
          return '<div class="anuncio-slide' + (copia ? " anuncio-copia" : (i ? "" : " ativo")) +
            (i >= nv ? " anuncio-so-desk" : "") + '">' + q + "</div>";
        }).join("");
      };
      var seta = function (dir) {
        return '<button type="button" class="anuncio-seta anuncio-seta-' + (dir < 0 ? "ant" : "prox") + '" data-dir="' + dir +
          '" aria-label="' + (dir < 0 ? "Anúncio anterior" : "Próximo anúncio") + '"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
          '<path d="' + (dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7") + '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
      };
      // setas e pontinhos clicáveis (o clique é tratado em ligarControles); no computador, na esteira,
      // só as setas aparecem, sobrepostas às laterais da faixa
      var nav = '<div class="anuncio-nav">' + seta(-1) + '<div class="anuncio-pontos" role="group" aria-label="Escolher anúncio">' +
        quadros.slice(0, nv).map(function (q, i) {
          return '<button type="button" class="anuncio-ponto' + (i ? "" : " ativo") + '" data-i="' + i + '" aria-label="Anúncio ' + (i + 1) +
            " de " + nv + '"' + (i ? "" : ' aria-current="true"') + "></button>";
        }).join("") + "</div>" + seta(1) + "</div>";
      if (!esteira) return '<div class="anuncio-carrossel" data-n="' + n + '" role="group" aria-roledescription="carrossel" aria-label="Anúncios">' + slides(false) + nav + "</div>";
      // esteira: o grupo de quadros três vezes (a cópia é inerte), para o laço sem emenda; quem move
      // o trilho é o js (ver moverEsteiras), no ritmo de ESTEIRA_VEL px/s
      return '<div class="anuncio-carrossel anuncio-esteira" data-n="' + n + '" role="group" aria-roledescription="carrossel" aria-label="Anúncios">' +
        '<div class="anuncio-janela"><div class="anuncio-trilho">' + slides(false) +
        '<div class="anuncio-grupo-copia" aria-hidden="true" inert>' + slides(true) + "</div>" +
        '<div class="anuncio-grupo-copia" aria-hidden="true" inert>' + slides(true) + "</div></div></div>" + nav + "</div>";
    }
    return ehApp ? "" : htmlConvite(id);
  }

  var GIRO_MS = 7000;
  // Esteira da faixa principal (computador): largura de cada quadro e vão (px, iguais ao CSS) e
  // velocidade (px/s).
  var ESTEIRA_QUADRO = 600, ESTEIRA_VAO = 24, ESTEIRA_VEL = 40, CONVITES_ESTEIRA = 5;
  var ESTEIRA_PASSO_MS = 400, SWIPE_PX = 40;

  function slidesDoCarrossel(c) {
    return c.querySelectorAll(".anuncio-slide:not(.anuncio-copia):not(.anuncio-so-desk)");
  }

  // Mostra o quadro "prox" (índice, com volta) de um revezamento e reinicia o relógio de 7 s dele.
  function mostrar(c, prox) {
    var slides = slidesDoCarrossel(c), pontos = c.querySelectorAll(".anuncio-ponto");
    if (!slides.length) return;
    var i = Array.prototype.findIndex.call(slides, function (s) { return s.classList.contains("ativo"); });
    prox = ((prox % slides.length) + slides.length) % slides.length;
    if (i >= 0) {
      slides[i].classList.remove("ativo");
      if (pontos[i]) { pontos[i].classList.remove("ativo"); pontos[i].removeAttribute("aria-current"); }
    }
    slides[prox].classList.add("ativo");
    if (pontos[prox]) { pontos[prox].classList.add("ativo"); pontos[prox].setAttribute("aria-current", "true"); }
    c._t = Date.now();
  }

  function indiceAtivo(c) {
    return Array.prototype.findIndex.call(slidesDoCarrossel(c), function (s) { return s.classList.contains("ativo"); });
  }

  // Esteira ligada? (computador e movimento permitido; senão a faixa vira revezamento comum)
  function mqEsteira() {
    return typeof window !== "undefined" && window.matchMedia &&
      window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)").matches;
  }
  function mouseEmCima() {
    return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(any-hover: hover)").matches;
  }

  // Pausa do revezamento: mouse em cima (só onde há mouse; no toque o :hover fica preso depois do
  // toque) ou foco de teclado dentro do carrossel.
  function pausado(c) {
    return (mouseEmCima() && c.matches(":hover")) || !!c.querySelector(":focus-visible");
  }

  // Avança os revezamentos cujos 7 s já passaram (a esteira ligada não usa isto).
  function girar() {
    var agora = Date.now(), esteira = mqEsteira();
    Array.prototype.forEach.call(document.querySelectorAll(".anuncio-carrossel"), function (c) {
      if (esteira && c.classList.contains("anuncio-esteira")) return;
      if (!c._t) { c._t = agora; return; }
      if (pausado(c)) { c._t = agora; return; }
      if (agora - c._t >= GIRO_MS - 250) mostrar(c, indiceAtivo(c) + 1);
    });
  }

  // ---- esteira movida por js: posição x (px) no grupo, que se repete a cada "volta" (n quadros)
  function volta(c) { return (+c.getAttribute("data-n") || 1) * (ESTEIRA_QUADRO + ESTEIRA_VAO); }
  function suave(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // Anda um quadro (dir = 1 avança, -1 volta) com suavização; cliques seguidos somam.
  function passoEsteira(c, dir) {
    var passo = ESTEIRA_QUADRO + ESTEIRA_VAO, x = c._x || 0;
    var alvo = c._anim ? c._anim.para : x;
    irPara(c, alvo + dir * passo);
  }
  function irPara(c, alvo) {
    var x = c._x || 0;
    c._anim = { de: x, para: alvo, t0: null };
  }

  var ultimoQuadro = 0;
  function moverEsteiras(agoraMs) {
    var dt = ultimoQuadro ? Math.min(100, agoraMs - ultimoQuadro) : 0;
    ultimoQuadro = agoraMs;
    var ligada = mqEsteira();
    Array.prototype.forEach.call(document.querySelectorAll(".anuncio-esteira"), function (c) {
      var trilho = c.querySelector(".anuncio-trilho");
      if (!trilho) return;
      if (!ligada) {
        if (c.classList.contains("esteira-js")) { c.classList.remove("esteira-js"); trilho.style.transform = ""; c._anim = null; }
        return;
      }
      c.classList.add("esteira-js");
      var v = volta(c), x = c._x || 0;
      if (c._anim) {
        var a = c._anim;
        if (a.t0 == null) a.t0 = agoraMs;
        var p = Math.min(1, (agoraMs - a.t0) / ESTEIRA_PASSO_MS);
        x = a.de + (a.para - a.de) * suave(p);
        if (p >= 1) { x = a.para; c._anim = null; }
      } else if (dt && !pausado(c)) {
        x += ESTEIRA_VEL * dt / 1000;
      }
      // mantém x em [0, v) (e leva a animação junto, para o laço não dar salto)
      var k = Math.floor(x / v);
      if (k) { x -= k * v; if (c._anim) { c._anim.de -= k * v; c._anim.para -= k * v; } }
      c._x = x;
      trilho.style.transform = "translate3d(" + (-x).toFixed(2) + "px,0,0)";
    });
    requestAnimationFrame(moverEsteiras);
  }

  // Cliques nas setas e pontinhos, swipe no toque e foco por teclado (delegados ao documento: o
  // conteúdo dos espaços é refeito quando o anuncios.json muda).
  function ligarControles() {
    document.addEventListener("click", function (e) {
      if (e.target && e.target.nodeType === 1 && e.target.closest) {
        var b = e.target.closest(".anuncio-seta, .anuncio-ponto");
        if (b) {
          var c = b.closest(".anuncio-carrossel");
          if (!c) return;
          if (b.classList.contains("anuncio-seta")) {
            var dir = +b.getAttribute("data-dir") || 1;
            if (c.classList.contains("anuncio-esteira") && mqEsteira()) passoEsteira(c, dir);
            else mostrar(c, indiceAtivo(c) + dir);
          } else mostrar(c, +b.getAttribute("data-i") || 0);
          return;
        }
        if (swipeFeito && e.target.closest(".anuncio-carrossel")) { e.preventDefault(); e.stopPropagation(); }
      }
    }, true);

    // swipe horizontal (revezamento): limiar de SWIPE_PX, sem confundir com rolagem vertical
    var ini = null;
    document.addEventListener("pointerdown", function (e) {
      swipeFeito = false;
      var c = e.target.closest && e.target.closest(".anuncio-carrossel");
      if (!c || (c.classList.contains("anuncio-esteira") && mqEsteira()) || e.target.closest(".anuncio-nav")) { ini = null; return; }
      ini = { c: c, id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    document.addEventListener("pointerup", function (e) {
      if (!ini || ini.id !== e.pointerId) return;
      var dx = e.clientX - ini.x, dy = e.clientY - ini.y, c = ini.c;
      ini = null;
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        mostrar(c, indiceAtivo(c) + (dx < 0 ? 1 : -1));
        swipeFeito = true; // o clique que o navegador soltaria sobre um link é descartado
        setTimeout(function () { swipeFeito = false; }, 400);
      }
    });
    document.addEventListener("pointercancel", function () { ini = null; });

    // foco de teclado num link da esteira que está fora da janela: traz o quadro para a vista
    document.addEventListener("focusin", function (e) {
      var c = e.target.closest && e.target.closest(".anuncio-esteira");
      if (!c || !mqEsteira()) return;
      var janela = c.querySelector(".anuncio-janela");
      if (janela) janela.scrollLeft = 0;
      var slide = e.target.closest(".anuncio-slide");
      if (!slide || !slide.parentNode || slide.classList.contains("anuncio-copia")) return;
      var passo = ESTEIRA_QUADRO + ESTEIRA_VAO, idx = Array.prototype.indexOf.call(slide.parentNode.children, slide);
      var x = c._x || 0, ini0 = idx * passo, larg = janela ? janela.clientWidth : 0;
      var v = volta(c), rel = (((ini0 - x) % v) + v) % v; // distância do quadro à esquerda da janela
      var d = rel > v - ESTEIRA_QUADRO ? rel - v : rel; // quadro cortado na esquerda: volta um pouco
      if (d < 0 || d + ESTEIRA_QUADRO > larg) irPara(c, x + d);
    });
  }
  var swipeFeito = false;

  // ---------------------------------------------------------------- DOM (só no navegador)
  function ehApp() {
    return !!window.AndroidBridge || /[?&]app=1\b/.test(window.location.search) ||
      document.documentElement.classList.contains("modo-app");
  }

  function aplicar(dados) {
    var app = ehApp(), agora = Date.now(), espacos = (dados && dados.espacos) || {};
    Object.keys(ESPACOS).forEach(function (id) {
      var lugar = ESPACOS[id], miolo = htmlEspaco(configDe(espacos, id), agora, app, id);
      lugar.onde.forEach(function (sel, i) {
        var eid = idLugar(id, i), caixa = document.getElementById(eid);
        if (!miolo) { if (caixa) caixa.remove(); return; }
        if (!caixa) {
          var ref = document.querySelector(sel);
          if (!ref) return;
          caixa = document.createElement(lugar.formato === "faixa" ? "section" : "div");
          caixa.id = eid;
          caixa.className = "anuncio anuncio-" + lugar.formato + " anuncio-" + id;
          caixa.setAttribute("aria-label", "Publicidade");
          if (lugar.como === "antes") ref.parentNode.insertBefore(caixa, ref);
          else ref.appendChild(caixa);
        }
        var classes = /anuncio-esteira/.test(miolo) ? " anuncio-caixa-larga" : /anuncio-banner/.test(miolo) ? " anuncio-caixa-banner" : "";
        var html = (lugar.formato === "faixa" ? '<div class="wrap">' : "") +
          '<div class="anuncio-caixa' + classes + '"><span class="anuncio-rotulo">Publicidade</span>' + miolo + "</div>" +
          (lugar.formato === "faixa" ? "</div>" : "");
        if (caixa._h !== html) { caixa._h = html; caixa.innerHTML = html; }
      });
    });
    if (window.Visitantes) window.Visitantes.preencher();
  }

  function buscar(url) {
    var u = url + (url.indexOf("?") < 0 ? "?" : "&") + "t=" + Math.floor(Date.now() / 300000); // cache de 5 min
    var rede = window.Site && typeof window.Site.urlRede === "function" ? window.Site.urlRede(u) : u;
    return fetch(rede, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // Site: o anuncios.json ao lado da página. App: os endereços publicados, um depois do outro.
  function carregar() {
    var lista = ehApp() ? URLS_APP.slice() : ["anuncios.json"];
    function tentar(i) {
      if (i >= lista.length) return Promise.resolve(null);
      return buscar(lista[i]).catch(function () { return tentar(i + 1); });
    }
    return tentar(0).then(function (dados) {
      if (dados) ultimo = dados;
      aplicar(ultimo);
      // O mesmo arquivo traz outras configurações remotas (ex. o botão de apoio, js/apoio.js).
      if (ultimo) document.dispatchEvent(new CustomEvent("apuracoes:config", { detail: ultimo }));
    });
  }

  var ultimo = null;
  function iniciar() {
    aplicar(null); // convite já na primeira pintura (no site); o arquivo chega logo depois
    carregar();
    setInterval(carregar, INTERVALO_MS);
    ligarControles();
    setInterval(girar, 1000);
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(moverEsteiras);
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
  }

  return { CONTATO: CONTATO, PRAZO: PRAZO, ESPACOS: ESPACOS, idLugar: idLugar, configDe: configDe, URLS_APP: URLS_APP, anuncioValido: anuncioValido,
    htmlEspaco: htmlEspaco, esc: esc, diaMs: diaMs };
});
