
const fs = require('fs');
const path = require('path');

const caminhoPalavras = path.join(__dirname, 'palavras.json');

function carregarPalavras() {
  const conteudo = fs.readFileSync(caminhoPalavras, 'utf8');
  const palavras = JSON.parse(conteudo);

  if (!Array.isArray(palavras) || palavras.length === 0) {
    throw new Error('O arquivo palavras.json está vazio ou inválido.');
  }

  for (const par of palavras) {
    if (
      typeof par.normal !== 'string' ||
      typeof par.impostor !== 'string' ||
      !par.normal.trim() ||
      !par.impostor.trim()
    ) {
      throw new Error('Existe um par de palavras inválido no palavras.json.');
    }
  }

  return palavras;
}

function sortearItem(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

async function iniciarPartida(sala, interaction) {
  if (!sala || sala.jogadores.length < 3) {
    throw new Error('São necessários pelo menos 3 jogadores.');
  }

  const palavras = carregarPalavras();
  const par = sortearItem(palavras);
  const impostorId = sortearItem(sala.jogadores);

  const partida = {
    id: sala.id,
    canalId: sala.canalId,
    jogadores: [...sala.jogadores],
    impostorId,
    palavraNormal: par.normal,
    palavraImpostor: par.impostor,
    eliminados: [],
    rodada: 1,
    fase: 'palavras',
    respostas: new Map(),
    votos: new Map()
  };

  // Guarda a partida ativa para continuar o jogo depois.
  partidas.set(sala.id, partida);

  const falhas = [];

  for (const jogadorId of partida.jogadores) {
    try {
      const usuario = await interaction.client.users.fetch(jogadorId);
      const eImpostor = jogadorId === impostorId;
      const palavra = eImpostor
        ? par.impostor
        : par.normal;

      await usuario.send(
        `🕵️ **JOGO DO IMPOSTOR**\n\n` +
        `Sua palavra é: **${palavra}**\n\n` +
        `Não mostre esta mensagem aos outros jogadores. ` +
        `Descubra quem recebeu uma palavra diferente!`
      );
    } catch (erro) {
      falhas.push(jogadorId);
    }
  }

  if (falhas.length > 0) {
    partidas.delete(sala.id);

    throw new Error(
      'Não consegui enviar mensagem privada para todos os jogadores. ' +
      'Peça para todos permitirem mensagens diretas do servidor e tente novamente.'
    );
  }

  const canal = await interaction.client.channels.fetch(sala.canalId);

  await canal.send(
    `🕵️ **A partida do Impostor começou!**\n\n` +
    `👥 Jogadores: **${partida.jogadores.length}**\n` +
    `📩 As palavras foram enviadas por mensagem privada.\n\n` +
    `Preparem-se para descobrir quem é o impostor!`
  );

  partida.fase = 'perguntas';

  return partida;
}

const partidas = new Map();

module.exports = {
  iniciarPartida,
  partidas
};
