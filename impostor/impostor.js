
const { iniciarPartida, partidas } = require('./jogo');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const salas = new Map();

async function iniciarComando(interaction) {
  const id = interaction.id;

  const embed = new EmbedBuilder()
    .setColor(0xff6a00)
    .setTitle('🕵️ JOGO DO IMPOSTOR')
    .setDescription(
      '**Uma pessoa recebeu uma palavra diferente...**\n\n' +
      'Entre na sala para participar. Quando houver jogadores suficientes, ' +
      'o criador poderá iniciar a partida!'
    )
    .addFields(
      { name: '👥 Jogadores', value: '1', inline: true },
      { name: '🎮 Mínimo', value: '3 jogadores', inline: true },
      { name: '📋 Status', value: 'Aguardando jogadores', inline: false }
    );

  const botoes = new ActionRowBuilder().addComponents(
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

  const sala = {
    id,
    criador: interaction.user.id,
    jogadores: [interaction.user.id],
    canalId: interaction.channelId,
    mensagemId: null,
    iniciada: false
  };

  salas.set(id, sala);

  await interaction.reply({
    embeds: [embed],
    components: [botoes]
  });

  const mensagem = await interaction.fetchReply();
  sala.mensagemId = mensagem.id;
}

async function processarBotao(interaction) {
  const [acao, id] = interaction.customId.split(':');
  const sala = salas.get(id);

  if (!sala) {
    return interaction.reply({
      content: '❌ Essa sala não existe mais ou o bot foi reiniciado.',
      ephemeral: true
    });
  }

  if (sala.iniciada) {
    return interaction.reply({
      content: '❌ Essa partida já começou.',
      ephemeral: true
    });
  }

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

  if (acao === 'impostor_iniciar') {
    if (interaction.user.id !== sala.criador) {
      return interaction.reply({
        content: 'Somente quem criou a sala pode iniciar a partida.',
        ephemeral: true
      });
    }

    if (sala.jogadores.length < 3) {
      return interaction.reply({
        content: 'São necessários pelo menos 3 jogadores para começar.',
        ephemeral: true
      });
    }

    sala.iniciada = true;

    await interaction.update({
      content: '⏳ Preparando a partida e enviando as palavras por mensagem privada...',
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
          `❌ Não foi possível iniciar a partida.\n` +
          `${erro.message}`,
        ephemeral: true
      }).catch(() => {});

      // Reabre o lobby caso a inicialização falhe.
      const canal = await interaction.client.channels
        .fetch(sala.canalId)
        .catch(() => null);

      if (canal && sala.mensagemId) {
        const mensagem = await canal.messages
          .fetch(sala.mensagemId)
          .catch(() => null);

        if (mensagem) {
          await mensagem.edit({
            content: null,
            embeds: [criarEmbedSala(sala)],
            components: [criarBotoesSala(sala.id)]
          }).catch(() => {});
        }
      }
    }

    return;
  }
}

function criarEmbedSala(sala) {
  return new EmbedBuilder()
    .setColor(0xff6a00)
    .setTitle('🕵️ JOGO DO IMPOSTOR')
    .setDescription(
      '**Uma pessoa recebeu uma palavra diferente...**\n\n' +
      'Entre na sala para participar. O criador poderá iniciar ' +
      'quando houver pelo menos 3 jogadores.'
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
        name: '📋 Participantes',
        value: sala.jogadores
          .map((jogadorId, i) => `${i + 1}. <@${jogadorId}>`)
          .join('\n'),
        inline: false
      }
    );
}

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

async function atualizarSala(interaction, sala) {
  const embed = criarEmbedSala(sala);
  const canal = await interaction.client.channels
    .fetch(sala.canalId)
    .catch(() => null);

  if (!canal) return;

  const mensagem = await canal.messages
    .fetch(sala.mensagemId)
    .catch(() => null);

  if (mensagem) {
    await mensagem.edit({
      embeds: [embed],
      components: [criarBotoesSala(sala.id)]
    });
  }
}

module.exports = {
  iniciarComando,
  processarBotao
};
