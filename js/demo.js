/* demo.js — gera resultados FALSOS e DETERMINÍSTICOS do 2º turno (mesma entrada => mesma saída;
 * sem Math.random e sem relógio), para ver o site "cheio" antes da apuração real.
 * Só é usado com ?demo=1 (ver app.js). Não toca na rede.
 *
 * Os objetos saem NO MESMO FORMATO de ApuracaoCore.adaptarFormato2026 (strings como no TSE),
 * então passam pelo mesmo caminho de renderização dos dados reais.
 * O arquivo nacional (br) é a SOMA das 28 UFs, então o nacional e os estados sempre fecham.
 *
 * UMD: window.ApuracaoDemo no navegador; require() no Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./apuracao-core.js"));
  else root.ApuracaoDemo = factory(root.ApuracaoCore);
})(typeof self !== "undefined" ? self : this, function (C) {
  "use strict";

  var NOME_URNA = { "13": "LULA", "22": "FLAVIO BOLSONARO" };

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function frac(s) { return (hash(s) % 100000) / 100000; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function str(x) { return String(Math.round(x)); }
  function pctStr(x) { return x.toFixed(2).replace(".", ","); }
  function p2(x) { return (x < 10 ? "0" : "") + x; }

  // Progresso (0..1) por tempo decorrido, num ciclo de 3 min: sobe por 150 s, fica 30 s em 100%, reinicia.
  function progressoPorTempo(ms) {
    var ciclo = 180000, x = ((ms % ciclo) + ciclo) % ciclo;
    if (x >= 150000) return 1;
    return clamp(0.03 + 0.97 * (x / 150000), 0, 1);
  }

  // Carimbo fake: 25/10/2026, 17:00 + p * 5 h
  function carimbo(p) {
    var seg = Math.round(17 * 3600 + p * 5 * 3600);
    return p2(Math.floor(seg / 3600)) + ":" + p2(Math.floor((seg % 3600) / 60)) + ":" + p2(seg % 60);
  }

  // Cria o arquivo "adaptado" de uma disputa de 2 candidatos a partir de somas.
  // cands: [{n, nm, sqcand, sg, vice, viceSg, ord, votos}] ; z: totais
  function montar(z, cands, p, marcarEleito) {
    var vv = cands.reduce(function (a, c) { return a + c.votos; }, 0);
    var topo = cands.slice().sort(function (a, b) { return b.votos - a.votos; })[0];
    var fim = marcarEleito && p >= 1 && z.st === z.ts;
    var tem = p > 0;
    return {
      ele: z.ele, dg: "25/10/2026", hg: carimbo(p), dt: tem ? "25/10/2026" : "", ht: tem ? carimbo(p) : "",
      s: str(z.st), st: str(z.ts), pst: pctStr(z.ts > 0 ? 100 * z.st / z.ts : 0),
      e: str(z.eleitorado), ea: str(z.est), c: str(z.c), pc: pctStr(z.est > 0 ? 100 * z.c / z.est : 0),
      a: str(z.est - z.c), pa: pctStr(z.est > 0 ? 100 * (z.est - z.c) / z.est : 0),
      tv: str(z.c), vv: str(vv), vnom: str(vv),
      vb: str(z.vb), pvb: pctStr(z.c > 0 ? 100 * z.vb / z.c : 0),
      tvn: str(z.tvn), ptvn: pctStr(z.c > 0 ? 100 * z.tvn / z.c : 0),
      van: "0", vansj: "0", nv: 1,
      cand: cands.map(function (c) {
        var ganhou = fim && c === topo;
        return {
          n: c.n, nm: c.nm, sqcand: c.sqcand, sg: c.sg, vice: c.vice, viceSg: c.viceSg, ord: c.ord,
          vap: str(c.votos), pvap: pctStr(vv > 0 ? 100 * c.votos / vv : 0),
          e: ganhou ? "s" : "n", st: ganhou ? "Eleito" : ""
        };
      })
    };
  }

  // Resolve tau tal que a média ponderada (por seções) do avanço das unidades seja t.
  function resolverTau(unid, t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    var lo = 0, hi = 1, pesoTot = unid.reduce(function (a, u) { return a + u.ts; }, 0);
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2, soma = 0;
      for (var k = 0; k < unid.length; k++) soma += unid[k].ts * avanco(unid[k], mid);
      if (soma / pesoTot < t) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  function avanco(u, tau) { return clamp((tau - u.atraso) * u.vel, 0, 1); }

  // Parcela final de A entre A e B por unidade; `tilt` é um deslocamento global ajustado p/ o alvo.
  function calibrar(unid, alvo) {
    var lo = -0.4, hi = 0.4;
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2, a = 0, tot = 0;
      for (var k = 0; k < unid.length; k++) {
        a += unid[k].vv * clamp(unid[k].f0 + mid, 0.04, 0.96); tot += unid[k].vv;
      }
      if (a / tot < alvo) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function somar(lista) {
    var z = { st: 0, ts: 0, eleitorado: 0, est: 0, c: 0, vb: 0, tvn: 0 };
    lista.forEach(function (x) { for (var k in z) z[k] += x[k]; });
    return z;
  }

  // Gera tudo. pt = conteúdo de primeiro-turno.json ; t = 0..1 (apuração nacional ponderada por seções).
  function gerar(pt, t) {
    t = clamp(typeof t === "number" && isFinite(t) ? t : 0, 0, 1);
    var pres = C.PRES;

    // ---- Presidente: 28 unidades ----
    var unid = [];
    C.UFS.forEach(function (uf) {
      var ref = C.refPresidente(pt, uf);
      if (!ref) return;
      var base = ref["13"].pct / Math.max(0.0001, ref["13"].pct + ref["22"].pct);
      unid.push({
        uf: uf, ref: ref, ts: Math.max(1, Math.round(ref.eleitorado / 318)), vv: ref.vv,
        f0: base + (frac(uf + "n") - 0.5) * 0.05,
        vies: (frac(uf + "b") - 0.5) * 0.16,
        onda: frac(uf + "w") * 6,
        atraso: frac(uf + "d") * 0.2, vel: 1.25 + frac(uf + "s") * 0.75
      });
    });
    var tilt = calibrar(unid, 0.507);
    var tau = resolverTau(unid, t);
    var ufs = {}, parciais = [];
    unid.forEach(function (u) {
      var p = avanco(u, tau);
      var final = clamp(u.f0 + tilt, 0.04, 0.96);
      var share = clamp(final + u.vies * (1 - p) + (-0.03 + 0.025 * Math.sin(p * 7)) * (1 - p) + Math.sin(p * 11 + u.onda) * 0.015 * (1 - p), 0.03, 0.97);
      var st = p >= 1 ? u.ts : Math.round(u.ts * p);
      var vv = p >= 1 ? u.vv : Math.round(u.vv * p);
      var lula = Math.round(vv * share), flavio = vv - lula;
      var cFinal = Math.round(u.vv / 0.953);
      var vb = Math.round(cFinal * 0.017 * p), tvn = Math.round(cFinal * 0.03 * p);
      var c = vv + vb + tvn;
      var est = p >= 1 ? u.ref.eleitorado : Math.round(u.ref.eleitorado * p);
      if (c > est) est = c;
      var z = { ele: "6258", st: st, ts: u.ts, eleitorado: u.ref.eleitorado, est: est, c: c, vb: vb, tvn: tvn };
      var cs = [
        { n: "22", nm: NOME_URNA["22"], sqcand: pres["22"].sqcand, sg: "PL", vice: "ALFREDO GASPAR", viceSg: "PL", ord: 0, votos: flavio },
        { n: "13", nm: NOME_URNA["13"], sqcand: pres["13"].sqcand, sg: "PT", vice: "GERALDO ALCKMIN", viceSg: "PSB", ord: 1, votos: lula }
      ];
      ufs[u.uf] = { z: z, cs: cs, p: p };
      parciais.push({ st: z.st, ts: z.ts, eleitorado: z.eleitorado, est: z.est, c: z.c, vb: z.vb, tvn: z.tvn });
    });
    // nacional = soma das UFs
    var zb = somar(parciais); zb.ele = "6258";
    var lulaB = 0, flaB = 0;
    Object.keys(ufs).forEach(function (uf) { flaB += ufs[uf].cs[0].votos; lulaB += ufs[uf].cs[1].votos; });
    var pBr = zb.ts > 0 ? zb.st / zb.ts : 0;
    var br = montar(zb, [
      { n: "22", nm: NOME_URNA["22"], sqcand: pres["22"].sqcand, sg: "PL", vice: "ALFREDO GASPAR", viceSg: "PL", ord: 0, votos: flaB },
      { n: "13", nm: NOME_URNA["13"], sqcand: pres["13"].sqcand, sg: "PT", vice: "GERALDO ALCKMIN", viceSg: "PSB", ord: 1, votos: lulaB }
    ], t >= 1 ? 1 : pBr, true);
    var outUfs = {};
    Object.keys(ufs).forEach(function (uf) { outUfs[uf] = montar(ufs[uf].z, ufs[uf].cs, ufs[uf].p, false); });

    // ---- Governadores ----
    var gov = {};
    C.UFS_GOV.forEach(function (uf) {
      var cfg = C.GOV[uf], ref = C.refPresidente(pt, uf), rg = C.refGovernador(pt, uf, cfg.cand.map(function (c) { return c.n; }));
      var a = cfg.cand[0], b = cfg.cand[1];
      var pa = rg ? rg[a.n].pct : 40, pb = rg ? rg[b.n].pct : 40;
      var f0 = clamp(pa / Math.max(0.0001, pa + pb) + (frac(uf + "g") - 0.5) * 0.04, 0.2, 0.8);
      var u = { ts: cfg.secoes, atraso: frac(uf + "gd") * 0.2, vel: 1.25 + frac(uf + "gs") * 0.75 };
      var p = avanco(u, tau);
      var vvFinal = Math.round((ref ? ref.vv : 1000000) * 0.985);
      var vv = p >= 1 ? vvFinal : Math.round(vvFinal * p);
      var share = clamp(f0 + (frac(uf + "gb") - 0.5) * 0.12 * (1 - p) + Math.sin(p * 9 + frac(uf + "gw") * 6) * 0.02 * (1 - p), 0.03, 0.97);
      var va = Math.round(vv * share), vbb = vv - va;
      var cFinal = Math.round(vvFinal / 0.953);
      var vbl = Math.round(cFinal * 0.017 * p), tvn = Math.round(cFinal * 0.03 * p);
      var est = ref ? (p >= 1 ? ref.eleitorado : Math.round(ref.eleitorado * p)) : 0;
      var c = vv + vbl + tvn; if (c > est) est = c;
      var z = { ele: "6260", st: p >= 1 ? cfg.secoes : Math.round(cfg.secoes * p), ts: cfg.secoes,
        eleitorado: ref ? ref.eleitorado : 0, est: est, c: c, vb: vbl, tvn: tvn };
      gov[uf] = montar(z, [
        { n: a.n, nm: a.nome.toUpperCase(), sqcand: a.sqcand, sg: a.sg, vice: a.vice.toUpperCase(), viceSg: a.viceSg, ord: 0, votos: va },
        { n: b.n, nm: b.nome.toUpperCase(), sqcand: b.sqcand, sg: b.sg, vice: b.vice.toUpperCase(), viceSg: b.viceSg, ord: 1, votos: vbb }
      ], p, true);
    });

    return { t: t, br: br, ufs: outUfs, gov: gov };
  }

  return { gerar: gerar, progressoPorTempo: progressoPorTempo, hash: hash };
});
