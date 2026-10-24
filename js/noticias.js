/* noticias.js — lógica PURA da aba "Notícias" do site público (sem DOM, sem rede): leitura do RSS
 * (sem DOMParser, para rodar também no Node), filtro por termos eleitorais e as listas de links.
 * Por que só a Agência Brasil: quase todos os outros RSS não mandam CORS, e o site público não tem
 * proxy. No app Android a aba usa todos os feeds de config.js via proxy (ver modo-app.js).
 *
 * UMD: window.Noticias no navegador; require() no Node.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Noticias = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FEED_AGENCIA_BRASIL = "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml";

  // Mesmas PALAVRAS de app-android/assets/www/js/config.js (comparadas sem acento e sem caixa).
  var PALAVRAS = ["eleiç", "eleito", "urna", "tse", "tre-", "apura", "voto", "votaç", "lula", "flávio", "bolsonaro",
    "turno", "fraude", "seção", "mesário", "governad", "segundo turno", "tarcísio", "boca de urna", "pesquisa"];

  // Mesmos X_LINKS de config.js.
  var LINKS_X = [
    ["Busca: apuração", "https://x.com/search?q=apura%C3%A7%C3%A3o%20elei%C3%A7%C3%A3o&f=live"],
    ["Busca: urnas / TSE", "https://x.com/search?q=urna%20OR%20urnas%20OR%20TSE%20elei%C3%A7%C3%A3o&f=live"],
    ["Busca: segundo turno", "https://x.com/search?q=%22segundo%20turno%22%20elei%C3%A7%C3%A3o&f=live"],
    ["Busca: Lula / Flávio", "https://x.com/search?q=Lula%20OR%20%22Fl%C3%A1vio%20Bolsonaro%22%20elei%C3%A7%C3%A3o&f=live"],
    ["@TSEjusbr (perfil do TSE)", "https://x.com/TSEjusbr"],
    ["@g1", "https://x.com/g1"],
    ["@folha", "https://x.com/folha"],
    ["@Poder360", "https://x.com/Poder360"],
    ["@CNNBrasil", "https://x.com/CNNBrasil"]
  ];

  var LINKS_VEICULOS = [
    ["g1 — Política", "https://g1.globo.com/politica/"],
    ["Folha — Poder", "https://www1.folha.uol.com.br/poder/"],
    ["Estadão — Política", "https://www.estadao.com.br/politica/"],
    ["UOL — Política", "https://noticias.uol.com.br/politica/"],
    ["Poder360", "https://www.poder360.com.br/"],
    ["CNN Brasil — Política", "https://www.cnnbrasil.com.br/politica/"],
    ["Agência Brasil — Política", "https://agenciabrasil.ebc.com.br/politica"]
  ];

  var LINKS_CHECAGEM = [
    ["Aos Fatos", "https://www.aosfatos.org/"],
    ["Agência Lupa", "https://lupa.uol.com.br/"],
    ["g1 — Fato ou Fake", "https://g1.globo.com/fato-ou-fake/"]
  ];

  var LINKS_OFICIAIS = [
    ["Resultados do TSE", "https://resultados.tse.jus.br"],
    ["Portal do TSE", "https://www.tse.jus.br/"]
  ];

  // minúsculas e sem acentos ("Flávio" -> "flavio"), para comparar termos
  function normalizar(s) {
    return String(s === undefined || s === null ? "" : s).toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function temTermoEleitoral(titulo, palavras) {
    var t = normalizar(titulo);
    return (palavras || PALAVRAS).some(function (p) { return t.indexOf(normalizar(p)) !== -1; });
  }

  function decodificarEntidades(s) {
    return String(s)
      .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(Number(n)); })
      .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  }

  function conteudoTag(bloco, tag) {
    var m = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i").exec(bloco);
    if (!m) return "";
    var v = m[1].trim();
    var cd = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
    return decodificarEntidades(cd ? cd[1] : v).trim();
  }

  // Só aceita links http(s): nada de "javascript:" vindo de um feed.
  function linkSeguro(l) { return /^https?:\/\//i.test(String(l || "").trim()) ? String(l).trim() : ""; }

  // XML do RSS -> [{titulo, link, quando: Date|null, fonte}]
  function parseRss(xml, fonte) {
    var itens = [], re = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi, m;
    var texto = String(xml || "");
    while ((m = re.exec(texto))) {
      var titulo = conteudoTag(m[1], "title").replace(/\s+/g, " ").trim();
      var link = linkSeguro(conteudoTag(m[1], "link"));
      var pub = conteudoTag(m[1], "pubDate");
      var d = pub ? new Date(pub) : null;
      if (d && isNaN(d.getTime())) d = null;
      if (titulo && link) itens.push({ titulo: titulo, link: link, quando: d, fonte: fonte || "" });
    }
    return itens;
  }

  // Filtra pelos termos eleitorais, tira repetidos, ordena do mais novo para o mais antigo, limita.
  function filtrar(itens, palavras, max) {
    var vistos = {}, out = [];
    (itens || []).forEach(function (it) {
      if (!it || !it.titulo || !temTermoEleitoral(it.titulo, palavras)) return;
      var chave = normalizar(it.titulo);
      if (vistos[chave]) return;
      vistos[chave] = true;
      out.push(it);
    });
    out.sort(function (a, b) {
      return (b.quando ? b.quando.getTime() : 0) - (a.quando ? a.quando.getTime() : 0);
    });
    return out.slice(0, max || 12);
  }

  return {
    FEED_AGENCIA_BRASIL: FEED_AGENCIA_BRASIL, PALAVRAS: PALAVRAS,
    LINKS_X: LINKS_X, LINKS_VEICULOS: LINKS_VEICULOS, LINKS_CHECAGEM: LINKS_CHECAGEM, LINKS_OFICIAIS: LINKS_OFICIAIS,
    normalizar: normalizar, temTermoEleitoral: temTermoEleitoral, parseRss: parseRss, filtrar: filtrar
  };
});
