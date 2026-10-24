/* apuracao-core.js — lógica PURA (sem DOM, sem rede) do site de apuração do 2º turno de 2026.
 * UMD: window.ApuracaoCore no navegador; require() no Node (testes em site/tests/).
 *
 * decodificarJws e adaptarFormato2026 vêm de app-android/assets/www/js/monitorLogic.js
 * (copiados, não editados lá). A adaptação aqui foi ESTENDIDA: além do que o original traz,
 * guarda o partido (sg), o vice (vice/viceSg) e a ordem original do TSE (ord) de cada candidato.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ApuracaoCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CICLO = "ele2026";
  var ELE = { pres1: 6257, pres2: 6258, gov1: 6259, gov2: 6260 };

  // 25/10/2026, 17h em Brasília. O Brasil não tem horário de verão desde 2019: BRT = UTC-3 => 20h UTC.
  var INICIO_DIVULGACAO_MS = Date.UTC(2026, 9, 25, 20, 0, 0);

  var UFS = ("ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to zz").split(" ");
  var UFS_GOV = ["am", "rn", "df", "es", "ac", "to"];

  var UF_INFO = {
    ac: { nome: "Acre", cod: "12", regiao: "Norte" },
    al: { nome: "Alagoas", cod: "27", regiao: "Nordeste" },
    am: { nome: "Amazonas", cod: "13", regiao: "Norte" },
    ap: { nome: "Amapá", cod: "16", regiao: "Norte" },
    ba: { nome: "Bahia", cod: "29", regiao: "Nordeste" },
    ce: { nome: "Ceará", cod: "23", regiao: "Nordeste" },
    df: { nome: "Distrito Federal", cod: "53", regiao: "Centro-Oeste" },
    es: { nome: "Espírito Santo", cod: "32", regiao: "Sudeste" },
    go: { nome: "Goiás", cod: "52", regiao: "Centro-Oeste" },
    ma: { nome: "Maranhão", cod: "21", regiao: "Nordeste" },
    mg: { nome: "Minas Gerais", cod: "31", regiao: "Sudeste" },
    ms: { nome: "Mato Grosso do Sul", cod: "50", regiao: "Centro-Oeste" },
    mt: { nome: "Mato Grosso", cod: "51", regiao: "Centro-Oeste" },
    pa: { nome: "Pará", cod: "15", regiao: "Norte" },
    pb: { nome: "Paraíba", cod: "25", regiao: "Nordeste" },
    pe: { nome: "Pernambuco", cod: "26", regiao: "Nordeste" },
    pi: { nome: "Piauí", cod: "22", regiao: "Nordeste" },
    pr: { nome: "Paraná", cod: "41", regiao: "Sul" },
    rj: { nome: "Rio de Janeiro", cod: "33", regiao: "Sudeste" },
    rn: { nome: "Rio Grande do Norte", cod: "24", regiao: "Nordeste" },
    ro: { nome: "Rondônia", cod: "11", regiao: "Norte" },
    rr: { nome: "Roraima", cod: "14", regiao: "Norte" },
    rs: { nome: "Rio Grande do Sul", cod: "43", regiao: "Sul" },
    sc: { nome: "Santa Catarina", cod: "42", regiao: "Sul" },
    se: { nome: "Sergipe", cod: "28", regiao: "Nordeste" },
    sp: { nome: "São Paulo", cod: "35", regiao: "Sudeste" },
    to: { nome: "Tocantins", cod: "17", regiao: "Norte" },
    zz: { nome: "Exterior", cod: null, regiao: "Exterior" }
  };
  var REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul", "Exterior"];

  // Presidente — identidade fixa; a COR é sempre pelo número (nunca pelo ranking).
  var PRES = {
    "13": { n: "13", nome: "Lula", curto: "Lula", completo: "Luiz Inácio Lula da Silva", sg: "PT",
      vice: "Geraldo Alckmin", viceSg: "PSB", sqcand: "280002542548", cor: "c13" },
    "22": { n: "22", nome: "Flávio Bolsonaro", curto: "Flávio", completo: "Flávio Nantes Bolsonaro", sg: "PL",
      vice: "Alfredo Gaspar", viceSg: "PL", sqcand: "280002551544", cor: "c22" }
  };
  var PRES_NUMS = ["13", "22"];

  // Governadores do 2º turno. A ordem [A, B] é a da lista do TSE no arquivo zerado; define a cor
  // (A = teal, B = âmbar), estável mesmo que o TSE reordene depois.
  var GOV = {
    am: { secoes: 8157, cand: [
      { n: "55", nome: "Omar Aziz", sg: "PSD", vice: "Alessandra Campelo", viceSg: "PSD", sqcand: "40002532272" },
      { n: "22", nome: "Professora Maria do Carmo", sg: "PL", vice: "Coronel Anibal", viceSg: "PL", sqcand: "40002541626" }] },
    rn: { secoes: 8115, cand: [
      { n: "13", nome: "Cadu de Lula", sg: "PT", vice: "Larissa", viceSg: "PSB", sqcand: "200002534001" },
      { n: "44", nome: "Allyson", sg: "UNIÃO", vice: "Hermano", viceSg: "MDB", sqcand: "200002535255" }] },
    df: { secoes: 6969, cand: [
      { n: "11", nome: "Celina Leão", sg: "PP", vice: "Gustavo Rocha", viceSg: "REPUBLICANOS", sqcand: "70002553055" },
      { n: "13", nome: "Leandro Grass", sg: "PT", vice: "Dora Gomes", viceSg: "PV", sqcand: "70002552496" }] },
    es: { secoes: 9844, cand: [
      { n: "10", nome: "Lorenzo Pazolini", sg: "REPUBLICANOS", vice: "Eliane Leal", viceSg: "PL", sqcand: "80002552682" },
      { n: "15", nome: "Ricardo Ferraço", sg: "MDB", vice: "Camillo Neves", viceSg: "PP", sqcand: "80002552172" }] },
    ac: { secoes: 2270, cand: [
      { n: "11", nome: "Mailza Assis", sg: "PP", vice: "Jéssica Sales", viceSg: "MDB", sqcand: "10002544107" },
      { n: "10", nome: "Alan Rick", sg: "REPUBLICANOS", vice: "Ricardo Leite", viceSg: "REPUBLICANOS", sqcand: "10002532492" }] },
    to: { secoes: 4384, cand: [
      { n: "45", nome: "Vicentinho Júnior", sg: "PSDB", vice: "Amélio Cayres", viceSg: "MDB", sqcand: "270002544544" },
      { n: "44", nome: "Professora Dorinha", sg: "UNIÃO", vice: "Atos Gomes", viceSg: "REPUBLICANOS", sqcand: "270002544599" }] }
  };

  // ---------- URLs ----------
  function pad(num, len) { var s = String(num); while (s.length < len) s = "0" + s; return s; }

  function urlDados(ele, cargo, uf) {
    return "https://resultados.tse.jus.br/oficial/" + CICLO + "/" + ele + "/dados/" +
      uf + "/" + uf + "-c" + pad(cargo, 4) + "-e" + pad(ele, 6) + "-u.jws";
  }

  function urlFoto(ele, uf, sqcand) {
    if (!sqcand) return null;
    return "https://resultados.tse.jus.br/oficial/" + CICLO + "/" + ele + "/fotos/" + uf + "/" + sqcand + ".jpeg";
  }

  // ---------- JWS (copiado de monitorLogic.js) ----------
  function decodificarJws(texto) {
    var partes = String(texto).trim().split(".");
    if (partes.length !== 3) throw new Error("JWS inválido");
    var b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder("utf-8").decode(bytes));
  }

  // Formato de 2026 -> formato plano (mesmos nomes do monitorLogic.js: s = seções totalizadas,
  // st = total de seções, e = eleitorado, c = comparecimento...). Extras: cand[].sg/vice/viceSg/ord.
  function adaptarFormato2026(p) {
    if (!p || !p.carg) return p;
    var carg = p.carg[0] || {}, s = p.s || {}, e = p.e || {}, v = p.v || {};
    var cand = [], ord = 0;
    (carg.agr || []).forEach(function (a) {
      (a.par || []).forEach(function (pa) {
        (pa.cand || []).forEach(function (c) {
          var vs = (c.vs && c.vs[0]) || {};
          cand.push({
            n: c.n, nm: c.nmu || c.nm, sqcand: c.sqcand, vap: c.vap, pvap: c.pvap, e: c.e, st: c.st, dvt: c.dvt,
            cc: a.com, sg: pa.sg, vice: vs.nmu || vs.nm || "", viceSg: vs.sgp || "", ord: ord++
          });
        });
      });
    });
    return {
      ele: p.ele, dg: p.dg, hg: p.hg, dt: p.dt, ht: p.ht,
      s: s.st, st: s.ts, pst: s.pst,
      e: e.te, ea: e.est, c: e.c, pc: e.pc, a: e.a, pa: e.pa,
      tv: v.tv, vv: v.vv, vnom: v.vnom, vb: v.vb, pvb: v.pvb, tvn: v.tvn, ptvn: v.ptvn,
      vn: v.vn, van: v.van, vansj: v.vansj,
      nv: carg.nv !== undefined && carg.nv !== null ? parseInt(carg.nv, 10) : undefined,
      cand: cand
    };
  }

  // ---------- números e formatação (pt-BR, sem Intl para ser idêntico em qualquer ambiente) ----------
  // "1.234" ou "1234" -> inteiro; qualquer coisa inválida -> null
  function n(d, k) {
    if (!d) return null;
    var v = d[k];
    if (v === undefined || v === null) return null;
    var i = parseInt(String(v).replace(/\./g, ""), 10);
    return isNaN(i) ? null : i;
  }

  function num(v, padrao) {
    if (typeof v === "number") return isFinite(v) ? v : (padrao || 0);
    var i = parseInt(String(v === undefined || v === null ? "" : v).replace(/\./g, ""), 10);
    return isNaN(i) ? (padrao || 0) : i;
  }

  // "45,16" -> 45.16 ; inválido -> null
  function pctDeString(v) {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    var x = parseFloat(String(v).replace(",", "."));
    return isNaN(x) ? null : x;
  }

  function fmtInt(x) {
    if (typeof x !== "number" || !isFinite(x)) return "—";
    var s = String(Math.abs(Math.trunc(x)));
    var out = "";
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ".";
      out += s[i];
    }
    return (x < 0 ? "-" : "") + out;
  }

  function fmtDec(x, casas) {
    if (typeof x !== "number" || !isFinite(x)) return "—";
    if (casas === undefined) casas = 2;
    var neg = x < 0 && Math.abs(x) >= Math.pow(10, -casas) / 2;
    var f = Math.pow(10, casas);
    var r = Math.round(Math.abs(x) * f) / f;
    var partes = r.toFixed(casas).split(".");
    var inteiro = fmtInt(Number(partes[0]));
    return (neg ? "-" : "") + inteiro + (casas > 0 ? "," + partes[1] : "");
  }

  function fmtPct(x, casas) { var s = fmtDec(x, casas === undefined ? 2 : casas); return s === "—" ? s : s + "%"; }

  // diferença com sinal: "+1,25" / "-0,40" / "0,00"
  function fmtSinal(x, casas) {
    if (typeof x !== "number" || !isFinite(x)) return "—";
    var s = fmtDec(Math.abs(x), casas === undefined ? 2 : casas);
    var zero = Number(s.replace(/\./g, "").replace(",", ".")) === 0;
    if (zero) return s;
    return (x > 0 ? "+" : "−") + s;
  }

  function escapeHtml(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var PARTICULAS = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1 };

  function nomeBonito(nome) {
    return String(nome || "").trim().split(/\s+/).filter(Boolean).map(function (p, i) {
      var min = p.toLocaleLowerCase("pt-BR");
      if (i > 0 && PARTICULAS[min]) return min;
      return min.charAt(0).toLocaleUpperCase("pt-BR") + min.slice(1);
    }).join(" ");
  }

  function iniciais(nome) {
    var partes = String(nome || "").trim().split(/\s+/).filter(function (p) { return p && !PARTICULAS[p.toLowerCase()]; });
    if (!partes.length) return "??";
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  // ---------- datas ----------
  // "25/10/2026" + "17:42:11" -> 20261025174211 (comparável); inválido -> 0
  function carimboNum(data, hora) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(data || "").trim());
    var h = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(hora || "").trim());
    if (!m || !h) return 0;
    return Number(m[3] + m[2] + m[1] + h[1] + h[2] + (h[3] || "00"));
  }

  function carimboGeracao(d) { return d ? carimboNum(d.dg, d.hg) : 0; }

  // Texto da última atualização do TSE: usa dt/ht (totalização) quando existirem; senão dg/hg
  // (geração do arquivo), dizendo isso. Nunca devolve string vazia/undefined.
  function atualizacaoTexto(d) {
    if (!d) return { tipo: "nenhuma", curto: "—", longo: "Aguardando o TSE" };
    function curtoDe(data, hora) {
      var m = /^(\d{2})\/(\d{2})\/\d{4}$/.exec(String(data || ""));
      var hh = String(hora || "").slice(0, 8);
      return m ? m[1] + "/" + m[2] + " às " + hh : "";
    }
    var tot = curtoDe(d.dt, d.ht);
    if (d.ht && tot) return { tipo: "totalizacao", curto: tot, longo: "Última totalização do TSE: " + tot };
    var ger = curtoDe(d.dg, d.hg);
    if (ger) return { tipo: "geracao", curto: ger, longo: "Arquivo do TSE gerado em " + ger + " (ainda sem totalização)" };
    return { tipo: "nenhuma", curto: "—", longo: "Aguardando o TSE" };
  }

  // Contagem regressiva até 17h de 25/10/2026 (Brasília), independente do fuso de quem vê.
  function contagem(agoraMs) {
    var resta = INICIO_DIVULGACAO_MS - agoraMs;
    if (!(resta > 0)) return { iniciou: true, restanteMs: 0, dias: 0, horas: 0, minutos: 0, segundos: 0 };
    var s = Math.floor(resta / 1000);
    return {
      iniciou: false, restanteMs: resta,
      dias: Math.floor(s / 86400), horas: Math.floor((s % 86400) / 3600),
      minutos: Math.floor((s % 3600) / 60), segundos: s % 60
    };
  }

  // ---------- candidatos e disputas ----------
  function acharCand(d, numero) {
    var lista = (d && d.cand) || [];
    for (var i = 0; i < lista.length; i++) if (String(lista[i].n) === String(numero)) return lista[i];
    return null;
  }

  // Eleito SOMENTE se o TSE marcou a situação exatamente "Eleito"/"Eleita". O campo "e" NÃO
  // serve: no 1º turno real (6257) ele veio "s" também para quem foi ao 2º turno (st "2º turno").
  function tseMarcouEleito(c) {
    if (!c) return false;
    return /^eleit[oa]$/i.test(String(c.st || "").trim());
  }

  // Referência do 1º turno -> { "<n>": {vap, pct} , vv, ... }
  function refPresidente(pt, uf) {
    var r = pt && pt.presidente && pt.presidente[uf];
    if (!r) return null;
    var out = { vv: num(r.vv), eleitorado: num(r.eleitorado), comparecimento: num(r.comparecimento), pc: pctDeString(r.pc) };
    PRES_NUMS.forEach(function (k) {
      out[k] = { vap: num(r[k] && r[k].vap), pct: pctDeString(r[k] && r[k].pvap) || 0 };
    });
    out.outros = Math.max(0, 100 - out["13"].pct - out["22"].pct);
    return out;
  }

  function refGovernador(pt, uf, nums) {
    var lista = pt && pt.governador && pt.governador[uf];
    if (!lista) return null;
    var out = {}, soma = 0;
    nums.forEach(function (k) {
      var c = null;
      for (var i = 0; i < lista.length; i++) if (String(lista[i].n) === String(k)) c = lista[i];
      out[k] = c ? { vap: num(c.vap), pct: pctDeString(c.pvap) || 0, nm: c.nm } : { vap: 0, pct: 0, nm: "" };
      soma += out[k].pct;
    });
    out.outros = Math.max(0, 100 - soma);
    return out;
  }

  // Resumo de uma disputa de 2 candidatos. `nums` = [A, B] (números). d pode ser null.
  // Todos os valores numéricos são finitos (0 quando não há dados). Nunca calcula "vitória":
  // `eleito` só vem do que o TSE marcou.
  function disputa(d, nums) {
    var A = nums[0], B = nums[1];
    var ca = acharCand(d, A), cb = acharCand(d, B);
    var vv = num(d && d.vv);
    var va = num(ca && ca.vap), vb = num(cb && cb.vap);
    var temVotos = vv > 0 && (va + vb) > 0;
    var pa = 0, pb = 0;
    if (temVotos) {
      var ta = pctDeString(ca && ca.pvap), tb = pctDeString(cb && cb.pvap);
      pa = ta !== null ? ta : 100 * va / vv;
      pb = tb !== null ? tb : 100 * vb / vv;
    }
    var secTot = num(d && d.st), secApur = num(d && d.s);
    var pst = pctDeString(d && d.pst);
    if (pst === null) pst = secTot > 0 ? 100 * secApur / secTot : 0;
    pst = Math.max(0, Math.min(100, pst));
    var lider = null;
    if (temVotos && va !== vb) lider = va > vb ? A : B;
    var eleito = null;
    if (tseMarcouEleito(ca)) eleito = A; else if (tseMarcouEleito(cb)) eleito = B;
    return {
      temDados: !!d, temVotos: temVotos, vv: vv, secTot: secTot, secApur: secApur, pst: pst,
      a: { n: A, vap: va, pct: pa, eleito: eleito === A },
      b: { n: B, vap: vb, pct: pb, eleito: eleito === B },
      lider: lider,
      empate: temVotos && va === vb,
      margemVotos: Math.abs(va - vb),
      margemPP: temVotos ? Math.abs(pa - pb) : 0,
      difPP: temVotos ? pa - pb : 0,          // com sinal: > 0 = A à frente
      eleito: eleito,
      atualizacao: atualizacaoTexto(d)
    };
  }

  // Faixas de intensidade do mapa (pontos percentuais de vantagem): 0 = sem líder
  function faixaMargem(pp) {
    if (typeof pp !== "number" || !isFinite(pp) || pp <= 0) return 0;
    if (pp < 2) return 1;
    if (pp < 5) return 2;
    if (pp < 10) return 3;
    if (pp < 20) return 4;
    return 5;
  }
  var FAIXAS_TEXTO = ["", "menos de 2 p.p.", "2 a 5 p.p.", "5 a 10 p.p.", "10 a 20 p.p.", "mais de 20 p.p."];

  // Visão de uma UF (Presidente): live + referência do 1º turno + variação
  function visaoUF(d, uf, pt) {
    var disp = disputa(d, PRES_NUMS);
    var ref = refPresidente(pt, uf);
    var out = {
      uf: uf, info: UF_INFO[uf] || { nome: uf.toUpperCase(), regiao: "" },
      d: disp, ref: ref,
      faixa: disp.temVotos ? faixaMargem(disp.margemPP) : 0,
      refMargemPP: ref ? Math.abs(ref["13"].pct - ref["22"].pct) : 0,
      refLider: ref && ref["13"].vap !== ref["22"].vap ? (ref["13"].vap > ref["22"].vap ? "13" : "22") : null,
      var13: null, var22: null,
      eleitorado: ref ? ref.eleitorado : num(d && d.e)
    };
    if (disp.temVotos && ref) {
      out.var13 = disp.a.pct - ref["13"].pct;
      out.var22 = disp.b.pct - ref["22"].pct;
    }
    return out;
  }

  // Visão de um governador
  function visaoGov(d, uf, pt) {
    var cfg = GOV[uf];
    var nums = cfg ? cfg.cand.map(function (c) { return c.n; }) : [];
    if (d && d.cand && d.cand.length) {
      // completa com a ordem do TSE se algum número esperado não existir no arquivo
      var presentes = d.cand.map(function (c) { return String(c.n); });
      var falta = nums.some(function (k) { return presentes.indexOf(k) < 0; });
      if (!cfg || falta) {
        nums = d.cand.slice().sort(function (x, y) { return x.ord - y.ord; }).slice(0, 2).map(function (c) { return String(c.n); });
      }
    }
    if (nums.length < 2) nums = ["", ""];
    var disp = disputa(d, nums);
    return { uf: uf, info: UF_INFO[uf], nums: nums, d: disp, ref: refGovernador(pt, uf, nums) };
  }

  // Números gerais (nacional): comparecimento, abstenção, brancos, nulos + referência do 1º turno
  function visaoNumeros(d, pt) {
    var ref = refPresidente(pt, "br");
    var te = num(d && d.e) || (ref ? ref.eleitorado : 0);
    var c = num(d && d.c);
    var est = num(d && d.ea);
    var tem = c > 0;
    var tv = num(d && d.tv) || c;
    var vb = num(d && d.vb), tvn = num(d && d.tvn);
    var pcTse = pctDeString(d && d.pc);
    var pc = tem ? (pcTse !== null ? pcTse : (est > 0 ? 100 * c / est : 0)) : 0;
    var a = num(d && d.a);
    var paTse = pctDeString(d && d.pa);
    var pa = tem ? (paTse !== null ? paTse : (est > 0 ? 100 * a / est : 0)) : 0;
    var out = {
      temDados: tem, eleitorado: te, comparecimento: c, pc: pc, abstencao: a, pa: pa,
      brancos: vb, pvb: tem && tv > 0 ? 100 * vb / tv : 0,
      nulos: tvn, ptvn: tem && tv > 0 ? 100 * tvn / tv : 0,
      ref: null
    };
    if (ref && ref.comparecimento > 0) {
      var pcRef = ref.pc !== null ? ref.pc : 100 * ref.comparecimento / ref.eleitorado;
      out.ref = {
        pc: pcRef, pa: 100 - pcRef,
        comparecimento: ref.comparecimento, abstencao: Math.max(0, ref.eleitorado - ref.comparecimento),
        // o arquivo do 1º turno guardado não separa brancos de nulos: só a soma (comparecimento - válidos)
        pbn: 100 * Math.max(0, ref.comparecimento - ref.vv) / ref.comparecimento,
        bn: Math.max(0, ref.comparecimento - ref.vv)
      };
      out.pbn = tem && tv > 0 ? 100 * (vb + tvn) / tv : 0;
      out.dPc = tem ? pc - pcRef : null;
      out.dPa = tem ? pa - out.ref.pa : null;
      out.dPbn = tem ? out.pbn - out.ref.pbn : null;
    } else {
      out.pbn = tem && tv > 0 ? 100 * (vb + tvn) / tv : 0;
    }
    return out;
  }

  // Ordenação das UFs. visoes: [{uf, info, d, ref, ...}] (saída de visaoUF)
  function ordenarUFs(visoes, criterio) {
    var arr = visoes.slice();
    function nome(a, b) { return a.info.nome.localeCompare(b.info.nome, "pt-BR"); }
    var cmp;
    switch (criterio) {
      case "margem": cmp = function (a, b) {
        var ta = a.d.temVotos, tb = b.d.temVotos;
        if (ta !== tb) return ta ? -1 : 1;
        if (!ta) return (b.refMargemPP - a.refMargemPP) || nome(a, b);
        return (b.d.margemPP - a.d.margemPP) || nome(a, b);
      }; break;
      case "lula": cmp = function (a, b) { return pctOrdem(b, "13") - pctOrdem(a, "13") || nome(a, b); }; break;
      case "flavio": cmp = function (a, b) { return pctOrdem(b, "22") - pctOrdem(a, "22") || nome(a, b); }; break;
      case "apuracao": cmp = function (a, b) { return (b.d.pst - a.d.pst) || nome(a, b); }; break;
      case "eleitorado": cmp = function (a, b) { return (b.eleitorado - a.eleitorado) || nome(a, b); }; break;
      default: cmp = nome;
    }
    return arr.sort(cmp);
  }
  // % usado na ordenação: ao vivo se houver votos, senão referência (para a ordem não "pular")
  function pctOrdem(v, k) {
    if (v.d.temVotos) return k === "13" ? v.d.a.pct : v.d.b.pct;
    return v.ref ? v.ref[k].pct - 1000 : -2000; // sem votos: depois dos que têm
  }

  // Total nacional a partir do arquivo br (usado pelo hero)
  function visaoNacional(d, pt) {
    var disp = disputa(d, PRES_NUMS);
    return { d: disp, ref: refPresidente(pt, "br") };
  }

  // Modo do hero: "vivo" (vv > 0) | "aguardando" (depois das 17h, sem votos) | "antes" (antes das 17h)
  function modoHero(disp, agoraMs) {
    if (disp && disp.temVotos) return "vivo";
    return agoraMs >= INICIO_DIVULGACAO_MS ? "aguardando" : "antes";
  }

  return {
    CICLO: CICLO, ELE: ELE, INICIO_DIVULGACAO_MS: INICIO_DIVULGACAO_MS,
    UFS: UFS, UFS_GOV: UFS_GOV, UF_INFO: UF_INFO, REGIOES: REGIOES,
    PRES: PRES, PRES_NUMS: PRES_NUMS, GOV: GOV, FAIXAS_TEXTO: FAIXAS_TEXTO,
    urlDados: urlDados, urlFoto: urlFoto,
    decodificarJws: decodificarJws, adaptarFormato2026: adaptarFormato2026,
    n: n, num: num, pctDeString: pctDeString,
    fmtInt: fmtInt, fmtDec: fmtDec, fmtPct: fmtPct, fmtSinal: fmtSinal,
    escapeHtml: escapeHtml, nomeBonito: nomeBonito, iniciais: iniciais,
    carimboNum: carimboNum, carimboGeracao: carimboGeracao, atualizacaoTexto: atualizacaoTexto,
    contagem: contagem, acharCand: acharCand, tseMarcouEleito: tseMarcouEleito,
    refPresidente: refPresidente, refGovernador: refGovernador,
    disputa: disputa, faixaMargem: faixaMargem,
    visaoUF: visaoUF, visaoGov: visaoGov, visaoNumeros: visaoNumeros, visaoNacional: visaoNacional,
    ordenarUFs: ordenarUFs, modoHero: modoHero
  };
});
