
const fs = require('fs');
const path = require('path');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder
} = require('discord.js');

const caminhoPalavras = path.join(__dirname, 'palavras.json');
const partidas = new Map();

const PERGUNTAS = [
  'O que você associa a essa palavra?',
  'Em que situação você encontraria isso?',
  'O que torna isso interessante?',
  'Se pudesse descrever isso com uma característica, qual seria?',
  'Onde você normalmente encontraria isso?',
  'O que vem à sua cabeça quando pensa nisso?',
  'Isso é mais comum em qual situação?',
  'Que tipo de pessoa costuma gostar disso?',
  'Qual é a primeira coisa que você lembra sobre isso?',
  'Se tivesse que explicar isso sem dizer o nome, o que falaria?'
];

function carregarPalavras() {
  const palavras = JSON.parse(fs.readFileSync(caminhoPalavras, 'utf8'));

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

function jogadoresAtivos(partida) {
  return partida.jogadores.filter(
    id => !partida.eliminados.includes(id)
  );
}

async function obterCanal(partida, client) {
  const canal = await client.channels.fetch(partida.canalId);

  if (!canal || !canal.isTextBased()) {
    throw new Error('Não consegui acessar o canal da partida.');
  }

  return canal;
}

async function iniciarPartida(sala, interaction) {
  if (!sala || sala.jogadores.length < 3) {
    throw new Error('São necessários pelo menos 3 jogadores.');
  }

  const par = sortearItem(carregarPalavras());
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
    fase: 'perguntas',
    respostas: new Map(),
    votos: new Map(),
    jogadoresPerguntados: [],
    perguntaAtual: null,
    votosRecebidos: new Map(),
    paginaVotacao: 0,
    alvosVotacao: [],
    mensagemVotacaoId: null
  };

  partidas.set(partida.id, partida);

  const falhas = [];

  for (const jogadorId of partida.jogadores) {
    try {
      const usuario = await interaction.client.users.fetch(jogadorId);
      const palavra = jogadorId === impostorId
        ? par.impostor
        : par.normal;

      await usuario.send(
        `🕵️ **JOGO DO IMPOSTOR**\n\n` +
        `Sua palavra é: **${palavra}**\n\n` +
        'Guarde essa palavra em segredo.'
      );
    } catch {
      falhas.push(jogadorId);
    }
  }

  if (falhas.length > 0) {
    partidas.delete(partida.id);
    throw new Error(
      `Não consegui enviar mensagem privada para ${falhas.length} jogador(es). ` +
      'Todos precisam permitir mensagens diretas do bot.'
    );
  }

  const canal = await obterCanal(partida, interaction.client);

  await canal.send(
    `🕵️ **A partida do Impostor começou!**\n\n` +
    `👥 Jogadores: **${partida.jogadores.length}**\n` +
    '📩 Todos receberam suas palavras por mensagem privada.\n\n' +
    'A primeira rodada de perguntas vai começar!'
  );

  await iniciarRodada(partida, interaction.client);
  return partida;
}

async function iniciarRodada(partida, client) {
  if (!partidas.has(partida.id)) return;

  const ativos = jogadoresAtivos(partida);

  if (ativos.length <= 2) {
    await verificarVitoria(partida, client);
    return;
  }

  partida.fase = 'perguntas';
  partida.respostas = new Map();
  partida.votos = new Map();
  partida.votosRecebidos = new Map();
  partida.jogadoresPerguntados = [];

  const quantidadePerguntas = Math.max(
    1,
    Math.min(ativos.length - 2, Math.ceil(ativos.length / 2))
  );

  const selecionados = [...ativos];

  for (let i = selecionados.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selecionados[i], selecionados[j]] = [selecionados[j], selecionados[i]];
  }

  partida.jogadoresPerguntados = selecionados.slice(0, quantidadePerguntas);
  partida.perguntaAtual = sortearItem(PERGUNTAS);

  const canal = await obterCanal(partida, client);

  await canal.send(
    `❓ **Rodada ${partida.rodada}**\n\n` +
    `O bot selecionou **${partida.jogadoresPerguntados.length} jogador(es)** ` +
    'para responder perguntas em privado.'
  );

  for (const jogadorId of partida.jogadoresPerguntados) {
    try {
      await enviarPergunta(
        partida,
        client,
        jogadorId,
        partida.perguntaAtual
      );
    } catch {
      await canal.send(
        `⚠️ Não consegui enviar a pergunta para <@${jogadorId}>. ` +
        'Verifiquem se essa pessoa permite mensagens privadas do bot.'
      );
    }
  }
}

async function enviarPergunta(partida, client, jogadorId, pergunta) {
  const usuario = await client.users.fetch(jogadorId);

  const botoes = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`impostor_responder:${partida.id}:${jogadorId}`)
      .setLabel('Responder pergunta')
      .setStyle(ButtonStyle.Primary)
  );

  await usuario.send({
    content:
      `❓ **Pergunta da rodada ${partida.rodada}**\n\n` +
      `${pergunta}\n\n` +
      'Sua resposta será publicada quando todos os selecionados responderem.',
    components: [botoes]
  });
}

async function abrirFormularioResposta(interaction, partidaId, jogadorId) {
  const partida = partidas.get(partidaId);

  if (interaction.user.id !== jogadorId) {
    return interaction.reply({
      content: 'Esse botão pertence a outro jogador.',
      ephemeral: true
    });
  }

  if (
    !partida ||
    partida.fase !== 'perguntas' ||
    !partida.jogadoresPerguntados.includes(jogadorId) ||
    partida.respostas.has(jogadorId)
  ) {
    return interaction.reply({
      content: 'Você não pode responder a essa pergunta agora.',
      ephemeral: true
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`impostor_resposta:${partidaId}:${jogadorId}`)
    .setTitle('Sua resposta');

  const campo = new TextInputBuilder()
    .setCustomId('resposta')
    .setLabel('Digite sua resposta')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(300)
    .setPlaceholder('Escreva sua resposta aqui...');

  modal.addComponents(
    new ActionRowBuilder().addComponents(campo)
  );

  await interaction.showModal(modal);
}

async function salvarResposta(interaction) {
  const [, partidaId, jogadorId] = interaction.customId.split(':');
  const partida = partidas.get(partidaId);

  if (
    !partida ||
    partida.fase !== 'perguntas' ||
    !partida.jogadoresPerguntados.includes(jogadorId)
  ) {
    return interaction.reply({
      content: 'Essa rodada já terminou ou você não foi selecionado.',
      ephemeral: true
    });
  }

  if (interaction.user.id !== jogadorId) {
    return interaction.reply({
      content: 'Você não pode enviar a resposta de outro jogador.',
      ephemeral: true
    });
  }

  if (partida.respostas.has(jogadorId)) {
    return interaction.reply({
      content: 'Sua resposta já foi registrada.',
      ephemeral: true
    });
  }

  const resposta = interaction.fields.getTextInputValue('resposta').trim();

  if (!resposta) {
    return interaction.reply({
      content: 'Digite uma resposta antes de enviar.',
      ephemeral: true
    });
  }

  partida.respostas.set(jogadorId, resposta);

  await interaction.reply({
    content: '✅ Sua resposta foi registrada!',
    ephemeral: true
  });

  const todosResponderam = partida.jogadoresPerguntados.every(
    id => partida.respostas.has(id)
  );

  if (todosResponderam) {
    await revelarRespostas(partida, interaction.client);
  }
}

async function revelarRespostas(partida, client) {
  if (partida.fase !== 'perguntas') return;

  partida.fase = 'revelando';

  const canal = await obterCanal(partida, client);
  let texto = `📢 **Respostas da rodada ${partida.rodada}**\n\n`;

  for (const jogadorId of partida.jogadoresPerguntados) {
    const resposta = partida.respostas.get(jogadorId) || 'Sem resposta';
    texto += `**<@${jogadorId}>:** ${resposta}\n`;
  }

  await canal.send(texto);
  await canal.send('💬 **Discussão:** vocês têm 3 segundos para conversar.');

  await new Promise(resolve => setTimeout(resolve, 3000));

  if (!partidas.has(partida.id) || partida.fase !== 'revelando') return;

  await iniciarVotacao(partida, client);
}

function contarVotos(partida) {
  const contagem = new Map();

  for (const alvoId of partida.votos.values()) {
    contagem.set(alvoId, (contagem.get(alvoId) || 0) + 1);
  }

  return contagem;
}

function criarComponentesVotacao(partida) {
  const ativos = jogadoresAtivos(partida);
  const alvos = partida.alvosVotacao.filter(id => ativos.includes(id));
  const paginas = Math.max(1, Math.ceil(alvos.length / 25));

  partida.paginaVotacao = Math.min(partida.paginaVotacao, paginas - 1);

  const inicio = partida.paginaVotacao * 25;
  const alvosPagina = alvos.slice(inicio, inicio + 25);
  const contagem = contarVotos(partida);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`impostor_votar:${partida.id}`)
    .setPlaceholder('Escolha em quem votar')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      alvosPagina.map(id => ({
        label: `Votar em ${id}`.slice(0, 100),
        description: `${contagem.get(id) || 0} voto(s) recebido(s)`,
        value: id
      }))
    );

  const linhas = [new ActionRowBuilder().addComponents(menu)];

  if (paginas > 1) {
    const navegacao = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`impostor_pagina:${partida.id}:anterior`)
        .setLabel('Página anterior')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(partida.paginaVotacao === 0),
      new ButtonBuilder()
        .setCustomId(`impostor_pagina:${partida.id}:proxima`)
        .setLabel('Próxima página')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(partida.paginaVotacao >= paginas - 1)
    );

    linhas.push(navegacao);
  }

  return linhas;
}

function textoPainelVotacao(partida) {
  const ativos = jogadoresAtivos(partida);
  const contagem = contarVotos(partida);
  const votaram = [...partida.votos.keys()];
  const paginas = Math.max(1, Math.ceil(partida.alvosVotacao.length / 25));

  let texto =
    `🗳️ **VOTAÇÃO PÚBLICA — Rodada ${partida.rodada}**\n\n` +
    'Escolham no menu abaixo quem vocês querem eliminar.\n' +
    'Os votos e os participantes que já votaram ficam visíveis para todos.\n\n' +
    `**Votos recebidos (${votaram.length}/${ativos.length}):**\n`;

  for (const id of partida.alvosVotacao) {
    texto += `• <@${id}>: **${contagem.get(id) || 0}** voto(s)\n`;
  }

  texto += '\n**Já votaram:** ';
  texto += votaram.length
    ? votaram.map(id => `<@${id}>`).join(', ')
    : 'Ninguém ainda';

  texto += `\n\nPágina **${partida.paginaVotacao + 1}/${paginas}**`;

  return texto;
}

async function iniciarVotacao(partida, client, alvosRestritos = null) {
  if (!partidas.has(partida.id)) return;

  const ativos = jogadoresAtivos(partida);

  if (ativos.length <= 2) {
    await verificarVitoria(partida, client);
    return;
  }

  partida.fase = 'votacao';
  partida.votos = new Map();
  partida.votosRecebidos = new Map();
  partida.alvosVotacao = alvosRestritos
    ? alvosRestritos.filter(id => ativos.includes(id))
    : [...ativos];
  partida.paginaVotacao = 0;

  const canal = await obterCanal(partida, client);

  const mensagem = await canal.send({
    content: textoPainelVotacao(partida),
    components: criarComponentesVotacao(partida)
  });

  partida.mensagemVotacaoId = mensagem.id;
}

async function atualizarPainelVotacao(partida, client) {
  if (!partida.mensagemVotacaoId) return;

  const canal = await obterCanal(partida, client);
  const mensagem = await canal.messages.fetch(partida.mensagemVotacaoId);

  await mensagem.edit({
    content: textoPainelVotacao(partida),
    components: criarComponentesVotacao(partida)
  });
}

async function processarSelecaoVoto(interaction) {
  const [, partidaId] = interaction.customId.split(':');
  const partida = partidas.get(partidaId);

  if (!partida || partida.fase !== 'votacao') {
    return interaction.reply({
      content: 'Essa votação já terminou.',
      ephemeral: true
    });
  }

  const eleitorId = interaction.user.id;
  const alvoId = interaction.values[0];
  const ativos = jogadoresAtivos(partida);

  if (!ativos.includes(eleitorId)) {
    return interaction.reply({
      content: 'Você não está mais participando da partida.',
      ephemeral: true
    });
  }

  if (partida.votos.has(eleitorId)) {
    return interaction.reply({
      content: 'Você já votou nesta votação.',
      ephemeral: true
    });
  }

  if (!partida.alvosVotacao.includes(alvoId) || !ativos.includes(alvoId)) {
    return interaction.reply({
      content: 'Esse jogador não pode receber votos nesta votação.',
      ephemeral: true
    });
  }

  partida.votos.set(eleitorId, alvoId);

  await interaction.deferUpdate();
  await atualizarPainelVotacao(partida, interaction.client);

  if (ativos.every(id => partida.votos.has(id))) {
    await concluirVotacao(partida, interaction.client);
  }
}

async function processarPaginaVotacao(interaction) {
  const [, partidaId, direcao] = interaction.customId.split(':');
  const partida = partidas.get(partidaId);

  if (!partida || partida.fase !== 'votacao') {
    return interaction.reply({
      content: 'Essa votação já terminou.',
      ephemeral: true
    });
  }

  if (direcao === 'anterior') {
    partida.paginaVotacao = Math.max(0, partida.paginaVotacao - 1);
  } else {
    const paginas = Math.max(1, Math.ceil(partida.alvosVotacao.length / 25));
    partida.paginaVotacao = Math.min(paginas - 1, partida.paginaVotacao + 1);
  }

  await interaction.deferUpdate();
  await atualizarPainelVotacao(partida, interaction.client);
}

async function concluirVotacao(partida, client) {
  if (partida.fase !== 'votacao') return;

  const contagem = contarVotos(partida);
  const maiorNumero = Math.max(0, ...contagem.values());

  if (maiorNumero === 0) {
    await iniciarVotacao(partida, client);
    return;
  }

  const maisVotados = [...contagem.entries()]
    .filter(([, votos]) => votos === maiorNumero)
    .map(([id]) => id);

  const canal = await obterCanal(partida, client);

  if (maisVotados.length > 1) {
    await canal.send(
      `⚖️ **Empate na votação!**\n\n` +
      `Os jogadores empatados foram: ${maisVotados.map(id => `<@${id}>`).join(', ')}.\n` +
      'Vamos votar novamente apenas entre eles.'
    );

    await iniciarVotacao(partida, client, maisVotados);
    return;
  }

  const eliminadoId = maisVotados[0];
  partida.eliminados.push(eliminadoId);
  partida.fase = 'resultado';

  await canal.send(
    `🔴 **<@${eliminadoId}> foi eliminado!**\n\n` +
    `Recebeu **${maiorNumero} voto(s)**.\n` +
    `Votos registrados: ${[...partida.votos.entries()]
      .map(([eleitor, alvo]) => `<@${eleitor}> → <@${alvo}>`)
      .join('\n')}`
  );

  if (eliminadoId === partida.impostorId) {
    await encerrarPartida(partida, client, 'inocentes');
    return;
  }

  const ativos = jogadoresAtivos(partida);

  if (ativos.length <= 2) {
    await encerrarPartida(partida, client, 'impostor');
    return;
  }

  partida.rodada += 1;
  await iniciarRodada(partida, client);
}

async function verificarVitoria(partida, client) {
  const ativos = jogadoresAtivos(partida);

  if (!ativos.includes(partida.impostorId)) {
    await encerrarPartida(partida, client, 'inocentes');
    return;
  }

  if (ativos.length <= 2) {
    await encerrarPartida(partida, client, 'impostor');
  }
}

async function encerrarPartida(partida, client, motivo) {
  if (!partidas.has(partida.id)) return;

  const canal = await obterCanal(partida, client);
  let resultado;

  if (motivo === 'inocentes') {
    resultado =
      '🎉 **Os inocentes venceram!** O impostor foi eliminado.';
  } else {
    resultado =
      '🕵️ **O impostor venceu!** Restaram apenas o impostor e mais um jogador.';
  }

  await canal.send(
    `🏁 **Fim de jogo!**\n\n${resultado}\n\n` +
    `O impostor era <@${partida.impostorId}>.\n` +
    `Palavra dos inocentes: **${partida.palavraNormal}**\n` +
    `Palavra do impostor: **${partida.palavraImpostor}**`
  );

  partidas.delete(partida.id);
}

module.exports = {
  iniciarPartida,
  partidas,
  enviarPergunta,
  abrirFormularioResposta,
  salvarResposta,
  iniciarRodada,
  revelarRespostas,
  encerrarPartida,
  jogadoresAtivos,
  processarSelecaoVoto,
  processarPaginaVotacao
};
