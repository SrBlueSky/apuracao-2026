/* exterior.js — lógica PURA (sem DOM) do mapa-múndi do voto no exterior: URLs das 186 cidades, registro compacto
 * por cidade, agregação por país, "visão" (líder, margem, faixa de cor) e ordenação do ranking.
 * UMD: window.Exterior no navegador; require() no Node (testes em site/tests/).
 * Depende de apuracao-core.js (ApuracaoCore) e exterior-paises.js (ExteriorPaises).
 *
 * Registro de cidade (o mesmo formato para 1º turno guardado e 2º turno ao vivo):
 *   { v13, v22, vv, s, st, e } = votos de Lula, votos de Flávio, votos válidos,
 *   seções totalizadas, total de seções, eleitorado.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./apuracao-core.js"), require("./exterior-paises.js"));
  else root.Exterior = factory(root.ApuracaoCore, root.ExteriorPaises);
})(typeof self !== "undefined" ? self : this, function (C, P) {
  "use strict";

  function pad6(x) { var s = String(x); while (s.length < 6) s = "0" + s; return s; }

  // https://resultados.tse.jus.br/oficial/ele2026/6258/dados/zz/zz29254-c0001-e006258-u.jws
  function urlCidade(ele, cd) {
    return "https://resultados.tse.jus.br/oficial/" + C.CICLO + "/" + ele + "/dados/zz/zz" + cd + "-c0001-e" + pad6(ele) + "-u.jws";
  }

  function regVazio(st, e) { return { v13: 0, v22: 0, vv: 0, s: 0, st: st || 0, e: e || 0 }; }

  // arquivo já adaptado (ApuracaoCore.adaptarFormato2026) -> registro compacto; null -> null
  function registroDe(d) {
    if (!d) return null;
    var a = C.acharCand(d, "13"), b = C.acharCand(d, "22");
    return {
      v13: C.num(a && a.vap), v22: C.num(b && b.vap), vv: C.num(d.vv),
      s: C.num(d.s), st: C.num(d.st), e: C.num(d.e)
    };
  }

  function soma(dest, r) {
    dest.v13 += r.v13; dest.v22 += r.v22; dest.vv += r.vv; dest.s += r.s; dest.st += r.st; dest.e += r.e;
  }

  // regs: { "<cd5>": registro | null }  ->  { "<ISO2>": { iso, nome, v13, v22, vv, s, st, e, nCid, nLidas, cidades: [{cd, nome, reg}] } }
  // Todo país da tabela aparece (mesmo sem nenhuma cidade lida). Cidades fora da tabela são ignoradas.
  function agregar(regs) {
    var out = {};
    P.CIDADES.forEach(function (c) {
      var a = out[c.pais];
      if (!a) a = out[c.pais] = { iso: c.pais, nome: P.nomePais(c.pais), v13: 0, v22: 0, vv: 0, s: 0, st: 0, e: 0, nCid: 0, nLidas: 0, cidades: [] };
      var r = regs && regs[c.cd] ? regs[c.cd] : null;
      a.nCid++;
      if (r) { a.nLidas++; soma(a, r); }
      a.cidades.push({ cd: c.cd, nome: c.nome, reg: r });
    });
    return out;
  }

  // Total do exterior (soma de todas as cidades lidas)
  function totalGeral(regs) {
    var t = { v13: 0, v22: 0, vv: 0, s: 0, st: 0, e: 0, nCid: 0, nLidas: 0 };
    P.CIDADES.forEach(function (c) {
      t.nCid++;
      var r = regs && regs[c.cd];
      if (r) { t.nLidas++; soma(t, r); }
    });
    return t;
  }

  // Visão de qualquer objeto com { v13, v22, vv, s, st } (país, cidade ou total). Tudo finito; sem votos => zeros e líder null.
  function visao(x) {
    x = x || {};
    var v13 = C.num(x.v13), v22 = C.num(x.v22), vv = C.num(x.vv), s = C.num(x.s), st = C.num(x.st);
    var tem = vv > 0 && (v13 + v22) > 0;
    var p13 = tem ? 100 * v13 / vv : 0, p22 = tem ? 100 * v22 / vv : 0;
    var lider = tem && v13 !== v22 ? (v13 > v22 ? "13" : "22") : null;
    var margemPP = tem ? Math.abs(p13 - p22) : 0;
    var pst = st > 0 ? Math.max(0, Math.min(100, 100 * s / st)) : 0;
    return {
      temVotos: tem, v13: v13, v22: v22, vv: vv, p13: p13, p22: p22, lider: lider,
      margemPP: margemPP, margemVotos: Math.abs(v13 - v22), faixa: lider ? C.faixaMargem(margemPP) : 0,
      s: s, st: st, pst: pst, eleitorado: C.num(x.e)
    };
  }

  // Itens do ranking de países, com a visão do turno escolhido (agg) e a referência do 1º turno (aggRef) como desempate.
  // Ordem: mais votos válidos primeiro; sem votos no turno, pelo 1º turno; depois pelo nome.
  function ranking(agg, aggRef) {
    var itens = Object.keys(agg).map(function (iso) {
      var a = agg[iso], r = aggRef && aggRef[iso];
      return { iso: iso, nome: a.nome, agg: a, v: visao(a), vref: r ? visao(r) : visao(null) };
    });
    itens.sort(function (x, y) {
      return (y.v.vv - x.v.vv) || (y.vref.vv - x.vref.vv) || x.nome.localeCompare(y.nome, "pt-BR");
    });
    return itens;
  }

  // Lê itens com no máximo `limite` buscas em paralelo. buscar(item) devolve Promise; `aoCada(item, valor|null, erro|null)`
  // roda a cada resposta. Uma falha não derruba as outras. Resolve com { ok, falhas } quando todas terminam.
  function lerEmLotes(itens, buscar, limite, aoCada) {
    var i = 0, ok = 0, falhas = 0;
    limite = Math.max(1, limite | 0);
    return new Promise(function (resolve) {
      var ativos = 0;
      function prox() {
        if (i >= itens.length && ativos === 0) { resolve({ ok: ok, falhas: falhas }); return; }
        while (ativos < limite && i < itens.length) {
          (function (item) {
            ativos++;
            var p;
            try { p = Promise.resolve(buscar(item)); } catch (e) { p = Promise.reject(e); }
            p.then(function (v) { ok++; try { aoCada(item, v, null); } catch (e) {} },
              function (e) { falhas++; try { aoCada(item, null, e); } catch (e2) {} })
              .then(function () { ativos--; prox(); });
          })(itens[i++]);
        }
      }
      prox();
    });
  }

  return {
    urlCidade: urlCidade, registroDe: registroDe, regVazio: regVazio, agregar: agregar, totalGeral: totalGeral,
    visao: visao, ranking: ranking, lerEmLotes: lerEmLotes
  };
});
