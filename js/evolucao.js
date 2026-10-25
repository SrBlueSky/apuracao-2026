/* evolucao.js — lógica PURA da aba "Evolução" (sem DOM, sem rede): monta a série "% de votos válidos
 * × % de urnas apuradas" a cada totalização nova do TSE, valida o que vem do localStorage e calcula
 * a geometria dos gráficos (escalas, ticks, caminhos SVG). Tudo finito: nada de NaN/Infinity.
 *
 * Ponto da série: { k: "dd/mm/aaaa hh:mm:ss" (totalização do TSE), x: % de urnas apuradas,
 *                   a: % válidos de A (Lula, 13), b: % válidos de B (Flávio, 22),
 *                   va, vb: votos de cada um, dif: va - vb (com sinal: > 0 = Lula à frente) }
 *
 * UMD: window.Evolucao no navegador; require() no Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Evolucao = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CHAVE = "apuracao2026_evolucao-6258";   // 6258 = código do 2º turno de Presidente no TSE
  var MAX_PONTOS = 600;

  function fin(x) { return typeof x === "number" && isFinite(x); }

  // "25/10/2026" + "17:42:11" -> 20261025174211 (comparável); inválido -> 0
  function carimbo(dt, ht) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dt || "").trim());
    var h = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(ht || "").trim());
    if (!m || !h) return 0;
    return Number(m[3] + m[2] + m[1] + h[1] + h[2] + (h[3] || "00"));
  }
  function carimboDeChave(k) {
    var p = String(k || "").split(" ");
    return carimbo(p[0], p[1]);
  }

  // d = saída de ApuracaoCore.disputa (visaoNacional(...).d); raw = arquivo adaptado do TSE (tem dt/ht).
  // Devolve null quando ainda não há votos ou não há carimbo de totalização.
  function ponto(raw, d) {
    if (!raw || !d || !d.temVotos) return null;
    if (!raw.dt || !raw.ht) return null;
    var k = String(raw.dt) + " " + String(raw.ht);
    if (!carimboDeChave(k)) return null;
    var p = { k: k, x: d.pst, a: d.a.pct, b: d.b.pct, va: d.a.vap, vb: d.b.vap, dif: d.a.vap - d.b.vap };
    return valido(p) ? p : null;
  }

  function valido(p) {
    return !!p && typeof p.k === "string" && fin(p.x) && fin(p.a) && fin(p.b) && fin(p.va) && fin(p.vb) && fin(p.dif) &&
      p.x >= 0 && p.x <= 100 && p.a >= 0 && p.a <= 100 && p.b >= 0 && p.b <= 100;
  }

  // Acrescenta p à série SÓ se for uma totalização nova (carimbo diferente e não mais antigo que o último).
  // Devolve true se acrescentou. Muta a série.
  function adicionar(serie, p) {
    if (!valido(p)) return false;
    var ult = serie[serie.length - 1];
    if (ult) {
      if (ult.k === p.k) return false;
      if (carimboDeChave(p.k) < carimboDeChave(ult.k)) return false;
    }
    serie.push(p);
    if (serie.length > MAX_PONTOS) serie.splice(0, serie.length - MAX_PONTOS);
    return true;
  }

  // Lê o que veio do localStorage (texto JSON): descarta lixo, mantém ordem e unicidade.
  function lerSerie(texto) {
    var out = [];
    try {
      var arr = JSON.parse(texto);
      if (!Array.isArray(arr)) return out;
      arr.forEach(function (p) { if (valido(p)) adicionar(out, p); });
    } catch (e) { /* texto inválido: série vazia */ }
    return out;
  }

  // Série da demonstração, determinística: refaz D.gerar(PT, t_i) para t_i de 0 até tAtual.
  // (Não acumula nada: a demo reinicia sozinha e o eixo X nunca pode andar para trás.)
  function serieDemo(D, C, PT, tAtual, passos) {
    var out = [];
    if (!(tAtual > 0)) return out;
    var n = Math.max(2, passos || 30);
    for (var i = 1; i <= n; i++) {
      var t = tAtual * i / n;
      var g = D.gerar(PT, t);
      var d = C.visaoNacional(g.br, PT).d;
      var p = ponto(g.br, d);
      if (p) adicionar(out, p);
    }
    return out;
  }

  // ---- geometria ----
  // Ticks "redondos" entre min e max (passo 1, 2, 5, 10...).
  function ticks(min, max, alvo) {
    if (!fin(min) || !fin(max) || max <= min) return [];
    var bruto = (max - min) / Math.max(2, alvo || 5);
    var pot = Math.pow(10, Math.floor(Math.log(bruto) / Math.LN10));
    var f = bruto / pot, passo = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pot;
    var out = [], v = Math.ceil(min / passo - 1e-9) * passo;
    for (var i = 0; i < 200 && v <= max + 1e-9; i++, v += passo) out.push(Math.round(v * 1e6) / 1e6 + 0);   // + 0 troca -0 por 0
    return out;
  }

  // Faixa do eixo Y em % (sempre inclui 50 e uma folga), limitada a 0..100.
  function faixaPct(serie) {
    var lo = 50, hi = 50;
    serie.forEach(function (p) { lo = Math.min(lo, p.a, p.b); hi = Math.max(hi, p.a, p.b); });
    lo = Math.max(0, Math.floor((lo - 2) / 2) * 2);
    hi = Math.min(100, Math.ceil((hi + 2) / 2) * 2);
    if (hi - lo < 8) { var m = (hi + lo) / 2; lo = Math.max(0, m - 4); hi = Math.min(100, m + 4); }
    return { min: lo, max: hi };
  }

  // Limite do eixo X (urnas apuradas). Acompanha o avanço da apuração: no começo, um eixo fixo
  // de 0 a 100% espremeria todas as totalizações na borda esquerda (no celular, num risco de
  // poucos pixels). Só aceita um limite em que o último traço do eixo caia exatamente nele,
  // para a ponta do gráfico nunca ficar sem rótulo.
  function eixoX(serie) {
    var max = 0;
    (serie || []).forEach(function (p) { if (fin(p && p.x)) max = Math.max(max, p.x); });
    if (!fin(max) || max < 0) max = 0;
    var cands = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 100];
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (c < max) continue;
      var t = ticks(0, c, 5);
      if (t.length >= 3 && t.length <= 7 && Math.abs(t[t.length - 1] - c) < 1e-9) return c;
    }
    return 100;
  }

  // Faixa do eixo Y da diferença em votos (simétrica em torno do 0).
  function faixaDif(serie) {
    var m = 0;
    serie.forEach(function (p) { m = Math.max(m, Math.abs(p.dif)); });
    if (m < 1) m = 1;
    var t = ticks(-m, m, 4), passo = t.length > 1 ? t[1] - t[0] : m;
    var lim = Math.ceil(m / passo) * passo;
    return { min: -lim, max: lim };
  }

  // Caminho SVG "M x y L x y..." de uma série. fx/fy convertem valor -> pixel.
  function caminho(pts, fx, fy) {
    var partes = [];
    pts.forEach(function (p, i) {
      var x = fx(p), y = fy(p);
      if (!fin(x) || !fin(y)) return;
      partes.push((partes.length ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2));
    });
    return partes.join("");
  }

  // Escala linear valor -> pixel.
  function escala(d0, d1, r0, r1) {
    var span = d1 - d0;
    return function (v) { return span === 0 ? (r0 + r1) / 2 : r0 + (v - d0) * (r1 - r0) / span; };
  }

  return {
    CHAVE: CHAVE, MAX_PONTOS: MAX_PONTOS,
    carimbo: carimbo, ponto: ponto, valido: valido, adicionar: adicionar, lerSerie: lerSerie,
    serieDemo: serieDemo, ticks: ticks, faixaPct: faixaPct, faixaDif: faixaDif, eixoX: eixoX,
    caminho: caminho, escala: escala
  };
});
