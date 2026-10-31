
const { iniciarPartida } = require('./jogo');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const salas = new Map();

// Tempo máximo para iniciar a partida: 10 minutos.
const TEMPO_MAXIMO_LOBBY = 10 * 60 * 1000;

// Inicia o modo normal.
async function iniciarComando(interaction, modo = 'normal') {
  return criarSala(interaction, modo);
}

// Inicia o modo clássico.
async function iniciarComandoClassico(interaction) {
  return criarSala(interaction, 'classico');
}

// Cria uma sala de espera.
async function criarSala(interaction, modo) {
  const id = interaction.id;

  const sala = {
    id,
    modo,
    criador: interaction.user.id,
    jogadores: [interaction.user.id],
    canalId: interaction.channelId,
    mensagemId: null,
    iniciada: false,
    encerrada: false,
    temporizador: null,
    criadaEm: Date.now()
  };

  salas.set(id, sala);

  try {
    await interaction.reply({
      embeds: [criarEmbedSala(sala)],
      components: [criarBotoesSala(id)]
    });

    const mensagem = await interaction.fetchReply();
    sala.mensagemId = mensagem.id;

    iniciarTemporizadorLobby(interaction.client, sala);
  } catch (erro) {
    salas.delete(id);
    console.error('Erro ao criar sala do Impostor:', erro);
    throw erro;
  }
}

// Controla o tempo máximo do lobby.
function iniciarTemporizadorLobby(client, sala) {
  if (sala.temporizador) {
    clearTimeout(sala.temporizador);
  }

  const tempoDecorrido = Date.now() - sala.criadaEm;

  const tempoRestante = Math.max(
    0,
    TEMPO_MAXIMO_LOBBY - tempoDecorrido
  );

  sala.temporizador = setTimeout(async () => {
    const salaAtual = salas.get(sala.id);

    if (
      !salaAtual ||
      salaAtual.iniciada ||
      salaAtual.encerrada
    ) {
      return;
    }

    salaAtual.encerrada = true;
    salas.delete(salaAtual.id);

    await encerrarLobby(client, salaAtual);
  }, tempoRestante);

  if (typeof sala.temporizador.unref === 'function') {
    sala.temporizador.unref();
  }
}

// Processa os botões do lobby.
async function processarBotao(interaction) {
  const [acao, id] = interaction.customId.split(':');

  const sala = salas.get(id);

  if (!sala || sala.encerrada) {
    return interaction.reply({
      content:
        '❌ Essa sala não existe mais ou o tempo para iniciar acabou.',
      ephemeral: true
    });
  }

  if (sala.iniciada) {
    return interaction.reply({
      content: '❌ Essa partida já começou.',
      ephemeral: true
    });
  }

  // Entrar na sala.
  if (acao === 'impostor_entrar') {
    if (sala.jogadores.includes(interaction.user.id)) {
      return interaction.reply({
        content: 'Você já está participando dessa partida!',
        ephemeral: true
      });
    }

    sala.jogadores.push(interaction.user.id);

    await interaction.reply({
      content: '✅ Você entrou na partida do Impostor!',
      ephemeral: true
    });

    await atualizarSala(interaction, sala);
    return;
  }

  // Iniciar a partida.
  if (acao === 'impostor_iniciar') {
    if (interaction.user.id !== sala.criador) {
      return interaction.reply({
        content:
          'Somente quem criou a sala pode iniciar a partida.',
        ephemeral: true
      });
    }

    if (sala.jogadores.length < 3) {
      return interaction.reply({
        content:
          'São necessários pelo menos 3 jogadores para começar.',
        ephemeral: true
      });
    }

    if (sala.temporizador) {
      clearTimeout(sala.temporizador);
      sala.temporizador = null;
    }

    sala.iniciada = true;

    await interaction.update({
      content:
        '⏳ Preparando a partida e enviando as palavras por mensagem privada...',
      embeds: [],
      components: []
    });

    try {
      await iniciarPartida(sala, interaction);

      salas.delete(id);
    } catch (erro) {
      sala.iniciada = false;

      console.error('Erro ao iniciar o Impostor:', erro);

      await interaction.followUp({
        content:
          `❌ Não foi possível iniciar a partida.\n${erro.message}`,
        ephemeral: true
      }).catch(() => {});

      const tempoDecorrido = Date.now() - sala.criadaEm;

      const tempoRestante =
        TEMPO_MAXIMO_LOBBY - tempoDecorrido;

      if (tempoRestante <= 0) {
        sala.encerrada = true;
        salas.delete(id);

        await encerrarLobby(interaction.client, sala);
        return;
      }

      iniciarTemporizadorLobby(interaction.client, sala);

      const canal = await interaction.client.channels
        .fetch(sala.canalId)
        .catch(() => null);

      const mensagem = canal && sala.mensagemId
        ? await canal.messages
            .fetch(sala.mensagemId)
            .catch(() => null)
        : null;

      if (mensagem) {
        await mensagem.edit({
          content: null,
          embeds: [criarEmbedSala(sala)],
          components: [criarBotoesSala(sala.id)]
        }).catch(() => {});
      }
    }

    return;
  }
}

// Encerra um lobby que atingiu o limite de tempo.
async function encerrarLobby(client, sala) {
  const canal = await client.channels
    .fetch(sala.canalId)
    .catch(() => null);

  if (!canal) return;

  const mensagem = await canal.messages
    .fetch(sala.mensagemId)
    .catch(() => null);

  if (!mensagem) return;

  const nomeModo = sala.modo === 'classico'
    ? 'IMPOSTOR CLÁSSICO'
    : 'JOGO DO IMPOSTOR';

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(`⌛ ${nomeModo} — LOBBY ENCERRADO`)
    .setDescription(
      'O tempo de 10 minutos acabou e a partida não foi iniciada.\n\n' +
      'Crie uma nova sala para jogar novamente.'
    )
    .addFields({
      name: '👥 Jogadores que estavam na sala',
      value: String(sala.jogadores.length),
      inline: true
    });

  await mensagem.edit({
    content: null,
    embeds: [embed],
    components: []
  }).catch(() => {});
}

// Cria o embed da sala.
function criarEmbedSala(sala) {
  const tempoRestante = Math.max(
    0,
    TEMPO_MAXIMO_LOBBY - (Date.now() - sala.criadaEm)
  );

  const minutos = Math.floor(tempoRestante / 60000);

  const segundos = Math.floor(
    (tempoRestante % 60000) / 1000
  );

  const classico = sala.modo === 'classico';

  return new EmbedBuilder()
    .setColor(0xff6a00)
    .setTitle(
      classico
        ? '🕵️ IMPOSTOR CLÁSSICO'
        : '🕵️ JOGO DO IMPOSTOR'
    )
    .setDescription(
      (
        classico
          ? '**Todos recebem a mesma palavra, menos o impostor.**'
          : '**Uma pessoa recebeu uma palavra diferente...**'
      ) +
      '\n\nEntre na sala para participar. O criador poderá iniciar ' +
      'quando houver pelo menos 3 jogadores.\n\n' +
      `⏳ **Tempo para iniciar:** ${minutos}:` +
      String(segundos).padStart(2, '0')
    )
    .addFields(
      {
        name: '👥 Jogadores',
        value: String(sala.jogadores.length),
        inline: true
      },
      {
        name: '🎮 Mínimo',
        value: '3 jogadores',
        inline: true
      },
      {
        name: '🎲 Modo',
        value: classico ? 'Clássico' : 'Normal',
        inline: true
      },
      {
        name: '📋 Participantes',
        value: sala.jogadores
          .map(
            (jogadorId, i) =>
              `${i + 1}. <@${jogadorId}>`
          )
          .join('\n'),
        inline: false
      }
    );
}

// Cria os botões da sala.
function criarBotoesSala(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`impostor_entrar:${id}`)
      .setLabel('Participar')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`impostor_iniciar:${id}`)
      .setLabel('Iniciar partida')
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Primary)
  );
}

// Atualiza a mensagem do lobby.
async function atualizarSala(interaction, sala) {
  const canal = await interaction.client.channels
    .fetch(sala.canalId)
    .catch(() => null);

  if (!canal) return;

  const mensagem = await canal.messages
    .fetch(sala.mensagemId)
    .catch(() => null);

  if (mensagem) {
    await mensagem.edit({
      embeds: [criarEmbedSala(sala)],
      components: [criarBotoesSala(sala.id)]
    }).catch(() => {});
  }
}

// Exportações do módulo.
module.exports = {
  iniciarComando,
  iniciarComandoClassico,
  processarBotao
};

// Diagnóstico das exportações.
console.log('[IMPOSTOR] Módulo carregado:', {
  arquivo: __filename,
  exportacoes: Object.keys(module.exports),
  tipoClassico: typeof module.exports.iniciarComandoClassico
});
