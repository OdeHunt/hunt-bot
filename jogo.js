
const fs = require('fs');
const path = require('path');

const partidas = new Map();

const caminhoPalavras = path.join(__dirname, 'palavras.txt');
const caminhoPalavrasRanked = path.join(__dirname, 'palavras-ranked.txt');

function carregarPalavras(ranked = false) {
  const arquivo = ranked
    ? caminhoPalavrasRanked
    : caminhoPalavras;

  if (!fs.existsSync(arquivo)) {
    throw new Error(
      `Arquivo ${path.basename(arquivo)} não encontrado na pasta do Hunt Bot!`
    );
  }

  const conteudo = fs.readFileSync(arquivo, 'utf8');

  const palavras = conteudo
    .split(/\r?\n/)
    .map(palavra => palavra.trim().toUpperCase())
    .map(palavra =>
      palavra.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    )
    .filter(palavra => /^[A-Z]{5}$/.test(palavra));

  const unicas = [...new Set(palavras)];

  // Limita o vocabulário Ranked a 4.000 palavras.
  const resultado = ranked ? unicas.slice(0, 4000) : unicas;

  if (resultado.length < 4) {
    throw new Error(
      `O arquivo ${path.basename(arquivo)} precisa ter pelo menos 4 palavras diferentes de 5 letras.`
    );
  }

  return resultado;
}

function ehRanked(modo) {
  return modo.includes('ranked');
}

function quantidadeTabuleiros(modo) {
  if (modo.startsWith('quarteto')) return 4;
  if (modo.startsWith('dueto')) return 2;
  return 1;
}

function iniciarPartida(chave, modo = 'termo', donoId = null) {
  const quantidade = quantidadeTabuleiros(modo);
  const disponiveis = carregarPalavras(ehRanked(modo));

  if (disponiveis.length < quantidade) {
    throw new Error('Não há palavras suficientes para iniciar a partida.');
  }

  const tabuleiros = [];

  for (let i = 0; i < quantidade; i++) {
    const indice = Math.floor(Math.random() * disponiveis.length);
    const palavra = disponiveis.splice(indice, 1)[0];

    tabuleiros.push({
      palavra,
      tentativas: [],
      terminou: false,
      dicas: []
    });
  }

  const partida = {
    modo,
    donoId,
    tabuleiros,
    dicasRestantes: 2,
    mensagemId: null,
    pontuacaoRegistrada: false
  };

  partidas.set(chave, partida);
  return partida;
}

function verificarPalavra(tentativa, resposta) {
  const letras = tentativa.split('');
  const alvo = resposta.split('');
  const cores = Array(5).fill('errada');

  for (let i = 0; i < 5; i++) {
    if (letras[i] === alvo[i]) {
      cores[i] = 'certa';
      alvo[i] = null;
      letras[i] = null;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (letras[i] === null) continue;

    const posicao = alvo.indexOf(letras[i]);

    if (posicao !== -1) {
      cores[i] = 'presente';
      alvo[posicao] = null;
    }
  }

  return cores;
}

function usarDica(partida) {
  if (partida.dicasRestantes <= 0) {
    return {
      sucesso: false,
      mensagem: 'Você já usou as duas dicas desta partida!'
    };
  }

  const reveladas = [];

  for (const tabuleiro of partida.tabuleiros) {
    if (tabuleiro.terminou) continue;

    const opcoes = [];

    for (let posicao = 0; posicao < 5; posicao++) {
      const jaTemDica = tabuleiro.dicas.some(
        dica => dica.posicao === posicao
      );

      const jaAcertada = tabuleiro.tentativas.some(
        tentativa =>
          tentativa.letras[posicao] === tabuleiro.palavra[posicao] &&
          tentativa.cores[posicao] === 'certa'
      );

      if (!jaTemDica && !jaAcertada) {
        opcoes.push(posicao);
      }
    }

    if (opcoes.length === 0) continue;

    const posicao = opcoes[
      Math.floor(Math.random() * opcoes.length)
    ];

    tabuleiro.dicas.push({
      posicao,
      letra: tabuleiro.palavra[posicao]
    });

    reveladas.push({
      posicao: posicao + 1,
      letra: tabuleiro.palavra[posicao]
    });
  }

  if (reveladas.length === 0) {
    return {
      sucesso: false,
      mensagem: 'Não há letras disponíveis para revelar!'
    };
  }

  partida.dicasRestantes--;

  return {
    sucesso: true,
    mensagem: `💡 Dica utilizada! Restam ${partida.dicasRestantes} dica(s).`,
    reveladas
  };
}

module.exports = {
  partidas,
  iniciarPartida,
  verificarPalavra,
  usarDica,
  ehRanked
};
