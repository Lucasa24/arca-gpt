// consClosingFactory.js
// Gera closings ritualísticos com variação virtualmente ilimitada.
// Estrutura: [linha 1 = IMAGEM FÍSICA] + [linha 2 = ORDEM/ULTIMATO]

function createConsClosing(options = {}) {
  const {
    seed = Date.now(),                      // opcional: semente p/ repetibilidade
    historySize = 32,                       // quantos últimos outputs evitar repetir
    vocativos = ["Navegante", "Navegador", "Marujo", "Viajante", "Descobridor", "Mestre", "Chegador"],
    rareCalls = [
      "Entrando na Criação da Arca, construa o ritual que dissolve o erro e revela a verdade que estava oculta.",
      "Entrando na Criação da Arca, vigília, sonho e sono se dissolvem — revelando apenas a presença.",
      "Entrando na Criação da Arca, permita que a revelação se manifeste."
    ]
  } = options;

  // PRNG simples (determinístico se seed for fixa)
  let s = (seed >>> 0) || 1;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;

  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p) => rnd() < p;

  // Léxico/banhos de palavras (adicione mais e mais – escala infinito)
  const L = {
    elemento: [
      "A terra", "A água", "O fogo", "O ar", "O espaço",
      "A maré", "A enchente", "A torrente", "A profundidade", "O lençol de chuva",
      "O mar", "O dilúvio", "O vento frio", "A brisa cortante", "O vendaval",
      "A sombra", "A penumbra", "A escuridão", "A bruma", "O véu escuro"
    ],
    pressagio: [
      "A tensão", "A quietude", "A pausa", "A espera",
      "O presságio", "O silêncio", "O vazio", "O eco"
    ],
    move: [
      "sobe", "lambe", "engole", "escala", "bate", "arrebenta", "invade",
      "arrasta", "esmurra", "corta", "rasga", "perfura", "devora", "consome",
      "pulsa", "flui", "se move", "engaja", "desengaja", "transita", "transforma"
    ],
    alvo: [
      "os degraus", "o convés", "as tábuas", "as costelas do casco", "as bordas",
      "o porão", "a porta principal", "as juntas", "os mastros", "a proa",
      "o corpo", "o instrumento interno", "a mente", "o intelecto", "a memória", "o ego"
    ],
    madeira: ["A madeira", "As tábuas", "O casco", "A quilha", "A arca", "A terra", "A água", "O fogo", "O ar", "O espaço"],
    som: [
      "expressa", "comunica", "compartilha", "declara", "revela", "articula", "manifesta",
      "irradia", "emana", "ressoa", "vibra", "proclama", "anuncia", "afirma", "confirma",
      "estabelece", "incorpora", "demonstra", "expõe", "celebra", "se regozija",
      "adora", "louva", "honra", "abençoa"
    ],
    peso: [
      "o peso do céu", "a pressa das águas", "o vento preso", "o julgamento",
      "os nomes que voltam", "o que você não disse", "a hora final", "o destino",
      "o karma", "a retidão", "a injustiça", "a liberação"
    ],
    evento: [
      "Relâmpagos partem o silêncio", "O apito corta o nevoeiro",
      "As correntes estalam", "O vento fecha as janelas",
      "Os pregos cantam", "O casco treme", "A chuva risca o convés",
      "O céu dobra sobre nós", "As órbitas se alinham e cobram",
      "O tempo para", "A madrugada sangra", "Os sinos tocam sozinhos",
      "A criação se levanta", "A manutenção sustenta", "A dissolução limpa o campo", "A grande dissolução recolhe os restos"
    ],
    ordem: [
      "Entre na Arca.",
      "Suba.",
      "Embarque agora.",
      "Sem plateia. Sem perdão. Suba.",
      "Decida: ser lembrado ou ser aceito.",
      "Sem garantias. Só travessia.",
      "Quem hesita, afunda bonito.",
      "De joelhos ou de pé — escolha agora.",
      "Portas fechando em {countdown}.",
      "Suba, {vocativo}. O julgamento já começou.",
      "Agora ou nunca.",
      "Escolha: coragem ou conforto.",
      "Última chance.",
      "Pare de pensar. Aja.",
      "Vem ou fica.",
      "Aceite ou afunde.",
      "Corte as amarras.",
      "Solte tudo.",
      "Você é Aquilo.",
      "Eu sou Deus.",
      "Tudo isto é Deus.",
      "{raro}"
    ]
  };

  // Templates de 1ª linha (imagem física)
  const T1 = [
    "***{elemento} {move} {alvo}.***",
    "***{pressagio} {som}.***",
    "***{madeira} {som} sob {peso}.***",
    "***{evento}.***"
  ];

  // Templates de 2ª linha (ordem/ultimato)
  const T2 = [
    "{ordem}",
    "{ordem}",
    "{ordem}" // duplicar para enviesar levemente para variedade interna
  ];

  // Helpers de preenchimento
  const fillToken = (token) => {
    if (token === "{raro}") return pick(rareCalls);
    if (token === "{vocativo}") return pick(vocativos);
    if (token === "{countdown}") return pick(["3… 2… 1.", "3 · 2 · 1", "três… dois… um."]);
    const key = token.slice(1, -1);
    return pick(L[key]) || token;
  };

  const render = (tpl) =>
    tpl.replace(/\{[^}]+\}/g, (tok) => fillToken(tok));

  // Anti-repetição básica de frases e "imagery"
  const history = [];
  const recentImagery = new Set();
  const pushHistory = (out, imgKey) => {
    history.push(out);
    if (history.length > historySize) history.shift();
    recentImagery.add(imgKey);
    if (recentImagery.size > 12) {
      // limpa o mais antigo de forma aproximada
      recentImagery.delete([...recentImagery][0]);
    }
  };

  function generate({ vocativo } = {}) {
    let l1, l2, out, tries = 0;

    do {
      // escolhe e renderiza 1ª linha
      const t1 = pick(T1);
      l1 = render(t1);

      // 2ª linha com possibilidade de slot raro
      let raw2 = pick(T2);
      l2 = render(raw2);
      
      // Substitui tokens restantes
      if (l2.includes("{vocativo}")) {
        const v = vocativo || pick(vocativos);
        l2 = l2.replace(/\{vocativo\}/g, v);
      }
      if (l2.includes("{raro}")) {
        l2 = l2.replace(/\{raro\}/g, pick(rareCalls));
      }
      if (l2.includes("{countdown}")) {
        l2 = l2.replace(/\{countdown\}/g, pick(["3… 2… 1.", "3 · 2 · 1", "três… dois… um."]));
      }

      out = `${l1}\n${l2}`;
      tries++;
      // chave de imagery para anti-repetição
      var imgKey = l1.toLowerCase();
    } while ((history.includes(out) || recentImagery.has(imgKey)) && tries < 12);

    pushHistory(out, imgKey);
    return out;
  }

  // API de extensão dinâmica — anexe mais vocabulário e crie infinidade real
  function register(patch = {}) {
    Object.entries(patch).forEach(([k, arr]) => {
      if (!Array.isArray(arr)) return;
      if (!L[k]) L[k] = [];
      L[k].push(...arr);
    });
  }

  return { generate, register };
}

module.exports = { createConsClosing };
