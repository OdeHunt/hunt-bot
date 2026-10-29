
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const { criarTabuleiro } = require('./tabuleiro');
const impostor = require('./impostor/impostor');
const jogoImpostor = require('./impostor/jogo');
const {
  partidas,
  iniciarPartida,
  verificarPalavra,
  usarDica,
  ehRanked
} = require('./jogo');

const bot = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const arquivoPontuacoes = path.join(__dirname, 'pontuacoes.json');
const arquivoConfrontos = path.join(__dirname, 'confrontos.json');

// Desafios ficam isolados das partidas casuais e Ranked.
const desafios = new Map();
const convites = new Map();

// Um jogador só pode participar de um desafio ativo por vez.
// Isso também permite identificar o desafio quando /t é usado em DM.
const desafioPorUsuario = new Map();
const convitesPorUsuario = new Map();

const TEMPO_CONVITE = 2 * 60 * 1000;
const TENTATIVAS_DESAFIO = 6;

bot.once(Events.ClientReady, client => {
  console.log(`Bot conectado: ${client.user.tag}`);
});

// ==================================================
// PALAVRAS
// ==================================================

function carregarListaValida(ranked = false) {
  const arquivo = path.join(
    __dirname,
    ranked ? 'palavras-ranked.txt' : 'palavras.txt'
  );

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

  return ranked ? unicas.slice(0, 4000) : unicas;
}

function escolherPalavraDesafio() {
  const palavras = carregarListaValida(false);

  if (palavras.length < 2) {
    throw new Error(
      'O arquivo palavras.txt precisa ter pelo menos duas palavras válidas.'
    );
  }

  return palavras[Math.floor(Math.random() * palavras.length)];
}

function limiteTentativas(modo) {
  if (modo === 'quarteto') return 9;
  if (modo === 'dueto') return 7;
  return 6;
}

function modoVisual(modo) {
  if (modo.startsWith('quarteto')) return 'quarteto';
  if (modo.startsWith('dueto')) return 'dueto';
  return 'termo';
}

function chaveRanked(canalId, usuarioId) {
  return `ranked:${canalId}:${usuarioId}`;
}

function encontrarPartida(canalId, usuarioId) {
  const ranked = partidas.get(chaveRanked(canalId, usuarioId));

  if (ranked) return ranked;

  return partidas.get(canalId) || null;
}

// ==================================================
// PONTUAÇÃO RANKED
// ==================================================

function carregarPontuacoes() {
  try {
    if (!fs.existsSync(arquivoPontuacoes)) return {};

    return JSON.parse(
      fs.readFileSync(arquivoPontuacoes, 'utf8')
    );
  } catch (erro) {
    console.error('Erro ao carregar pontuações:', erro);
    return {};
  }
}

function salvarPontuacoes(pontuacoes) {
  fs.writeFileSync(
    arquivoPontuacoes,
    JSON.stringify(pontuacoes, null, 2),
    'utf8'
  );
}

function pontosPorAcerto(tentativas) {
  const tabela = [100, 80, 60, 40, 30, 20, 10, 5, 0];

  return tabela[
    Math.min(Math.max(tentativas - 1, 0), tabela.length - 1)
  ];
}

function calcularPontuacao(partida) {
  let pontos = 0;

  for (const tabuleiro of partida.tabuleiros) {
    const acertou = tabuleiro.tentativas.some(
      tentativa => tentativa.cores.every(cor => cor === 'certa')
    );

    if (acertou) {
      pontos += pontosPorAcerto(tabuleiro.tentativas.length);
    }
  }

  return pontos;
}

function registrarPontuacao(partida) {
  if (!ehRanked(partida.modo) || partida.pontuacaoRegistrada) return;
  if (!partida.donoId) return;

  const pontuacoes = carregarPontuacoes();

  if (!pontuacoes[partida.donoId]) {
    pontuacoes[partida.donoId] = {
      pontos: 0,
      partidas: 0,
      vitorias: 0
    };
  }

  const jogador = pontuacoes[partida.donoId];

  jogador.pontos += calcularPontuacao(partida);
  jogador.partidas += 1;

  const venceu = partida.tabuleiros.some(tabuleiro =>
    tabuleiro.tentativas.some(
      tentativa => tentativa.cores.every(cor => cor === 'certa')
    )
  );

  if (venceu) jogador.vitorias += 1;

  partida.pontuacaoRegistrada = true;

  salvarPontuacoes(pontuacoes);
}

async function mostrarRanking(interaction) {
  const pontuacoes = carregarPontuacoes();

  const ranking = Object.entries(pontuacoes)
    .sort((a, b) => (b[1].pontos || 0) - (a[1].pontos || 0))
    .slice(0, 10);

  if (!ranking.length) {
    return interaction.reply({
      content: 'Ainda não há pontuações no ranking.',
      ephemeral: true
    });
  }

  const linhas = await Promise.all(
    ranking.map(async ([id, dados], indice) => {
      let nome = `<@${id}>`;

      try {
        const usuario = await bot.users.fetch(id);
        nome = usuario.username;
      } catch {}

      return `**${indice + 1}.** ${nome} — ${dados.pontos || 0} pontos`;
    })
  );

  return interaction.reply({
    content: `🏆 **Ranking global do Termo**\n\n${linhas.join('\n')}`
  });
}

// ==================================================
// HISTÓRICO DE CONFRONTOS
// ==================================================

function carregarConfrontos() {
  try {
    if (!fs.existsSync(arquivoConfrontos)) return {};

    return JSON.parse(
      fs.readFileSync(arquivoConfrontos, 'utf8')
    );
  } catch (erro) {
    console.error('Erro ao carregar confrontos:', erro);
    return {};
  }
}

function salvarConfrontos(dados) {
  fs.writeFileSync(
    arquivoConfrontos,
    JSON.stringify(dados, null, 2),
    'utf8'
  );
}

function chaveConfronto(guildId, id1, id2) {
  const ids = [id1, id2].sort();

  return `${guildId}:${ids[0]}:${ids[1]}`;
}

function registrarResultadoDesafio(desafio, vencedorId = null) {
  if (desafio.historicoRegistrado) return;

  const dados = carregarConfrontos();

  const chave = chaveConfronto(
    desafio.guildId,
    desafio.desafianteId,
    desafio.desafiadoId
  );

  if (!dados[chave]) {
    dados[chave] = {
      guildId: desafio.guildId,
      jogadores: [
        desafio.desafianteId,
        desafio.desafiadoId
      ],
      vitorias: {},
      derrotas: {},
      empates: 0,
      partidas: 0
    };
  }

  const registro = dados[chave];

  for (const id of [
    desafio.desafianteId,
    desafio.desafiadoId
  ]) {
    if (registro.vitorias[id] === undefined) {
      registro.vitorias[id] = 0;
    }

    if (registro.derrotas[id] === undefined) {
      registro.derrotas[id] = 0;
    }
  }

  registro.partidas += 1;

  if (!vencedorId) {
    registro.empates += 1;
  } else {
    const perdedorId =
      vencedorId === desafio.desafianteId
        ? desafio.desafiadoId
        : desafio.desafianteId;

    registro.vitorias[vencedorId] += 1;
    registro.derrotas[perdedorId] += 1;
  }

  desafio.historicoRegistrado = true;
  salvarConfrontos(dados);
}

async function mostrarConfronto(interaction, outroUsuario) {
  if (!interaction.guildId) {
    return interaction.reply({
      content: 'Use este comando dentro do servidor onde vocês jogam.',
      ephemeral: true
    });
  }

  if (outroUsuario.id === interaction.user.id) {
    return interaction.reply({
      content: 'Escolha outro jogador para consultar o confronto.',
      ephemeral: true
    });
  }

  const dados = carregarConfrontos();

  const registro = dados[
    chaveConfronto(
      interaction.guildId,
      interaction.user.id,
      outroUsuario.id
    )
  ];

  if (!registro) {
    return interaction.reply({
      content: `Ainda não há confrontos registrados entre você e ${outroUsuario}.`,
      ephemeral: true
    });
  }

  return interaction.reply({
    content:
      `⚔️ **Histórico de confronto**\n\n` +
      `Você: <@${interaction.user.id}>\n` +
      `Adversário: ${outroUsuario}\n\n` +
      `🏆 Suas vitórias: ${registro.vitorias[interaction.user.id] || 0}\n` +
      `💔 Suas derrotas: ${registro.derrotas[interaction.user.id] || 0}\n` +
      `🤝 Empates: ${registro.empates}\n` +
      `🎮 Total de partidas: ${registro.partidas}`,
    ephemeral: true
  });
}

// ==================================================
// TABULEIROS DAS PARTIDAS NORMAIS
// ==================================================

function montarRespostas(partida) {
  return partida.tabuleiros.map((tabuleiro, indice) => {
    const acertou = tabuleiro.tentativas.some(
      tentativa => tentativa.cores.every(cor => cor === 'certa')
    );

    return `Tabuleiro ${indice + 1}: **${tabuleiro.palavra}** — ${
      acertou ? '✅ Acertou' : '❌ Não acertou'
    }`;
  }).join('\n');
}

async function atualizarTabuleiro(canal, partida, conteudo) {
  try {
    if (!canal && partida.canalId) {
      canal = await bot.channels.fetch(partida.canalId);
    }

    if (!canal) return;

    const buffer = criarTabuleiro(
      partida.tabuleiros,
      modoVisual(partida.modo)
    );

    const arquivo = new AttachmentBuilder(buffer, {
      name: 'tabuleiro.png'
    });

    if (partida.mensagemId) {
      try {
        const mensagem = await canal.messages.fetch(partida.mensagemId);

        await mensagem.edit({
          content: conteudo || '',
          files: [arquivo]
        });

        return;
      } catch {}
    }

    const mensagem = await canal.send({
      content: conteudo || '',
      files: [arquivo]
    });

    partida.mensagemId = mensagem.id;
  } catch (erro) {
    console.error('Erro ao atualizar tabuleiro:', erro);
  }
}

// ==================================================
// FUNÇÕES DO DESAFIO
// ==================================================

function obterDesafioDoJogador(usuarioId) {
  const desafioId = desafioPorUsuario.get(usuarioId);

  if (!desafioId) return null;

  const desafio = desafios.get(desafioId);

  if (!desafio || desafio.finalizado) {
    desafioPorUsuario.delete(usuarioId);
    return null;
  }

  return desafio;
}

function criarTabuleiroDesafio(palavra) {
  return {
    palavra,
    tentativas: [],
    terminou: false,
    dicas: []
  };
}

function obterTabuleirosDesafio(desafio, usuarioId) {
  const jogador = desafio.jogadores[usuarioId];

  return Array.isArray(jogador) ? jogador : [jogador];
}

function jogadorAcertouDesafio(desafio, usuarioId) {
  const tabuleiros = obterTabuleirosDesafio(desafio, usuarioId);

  return tabuleiros.every(tabuleiro =>
    tabuleiro.tentativas.some(
      tentativa => tentativa.cores.every(cor => cor === 'certa')
    )
  );
}

function limparDesafio(desafio) {
  desafioPorUsuario.delete(desafio.desafianteId);
  desafioPorUsuario.delete(desafio.desafiadoId);
  desafios.delete(desafio.id);
}



async function apagarMensagensPrivadasDesafio(desafio) {
  // 1. Apaga as mensagens normais enviadas pelo bot nas DMs.
  for (const usuarioId of [
    desafio.desafianteId,
    desafio.desafiadoId
  ]) {
    try {
      const usuario = await bot.users.fetch(usuarioId);
      const dm = await usuario.createDM();

      let antesDe;

      while (true) {
        const opcoes = { limit: 100 };

        if (antesDe) {
          opcoes.before = antesDe;
        }

        const mensagens = await dm.messages.fetch(opcoes);

        if (mensagens.size === 0) break;

        // Guarda o ID mais antigo antes de apagar as mensagens.
        const ultimaMensagemId = mensagens.last().id;

        const mensagensDoBot = mensagens.filter(
          mensagem => mensagem.author.id === bot.user.id
        );

        for (const mensagem of mensagensDoBot.values()) {
          try {
            await mensagem.delete();
          } catch (erro) {
            console.error(
              `Falha ao apagar mensagem da DM ${usuarioId}:`,
              erro.message
            );
          }
        }

        antesDe = ultimaMensagemId;

        if (mensagens.size < 100) break;
      }
    } catch (erro) {
      console.error(
        `Falha ao limpar as mensagens normais da DM ${usuarioId}:`,
        erro.message
      );
    }
  }

  // 2. Tenta apagar as respostas privadas dos comandos /t.
  // Elas podem não aparecer na lista normal de mensagens da DM.
  for (const interacao of desafio.interacoesPrivadas || []) {
    try {
      await interacao.deleteReply();
    } catch (erro) {
      console.error(
        'Não foi possível apagar uma resposta privada de interação:',
        erro.message
      );
    }
  }
}



async function atualizarTabuleiroPrivado(usuarioId, desafio) {
  const tabuleiros = obterTabuleirosDesafio(desafio, usuarioId);

  const adversarioId = usuarioId === desafio.desafianteId
    ? desafio.desafiadoId
    : desafio.desafianteId;

  const modo = desafio.modo || 'termo';
  const limite = limiteTentativas(modo);

  const usuario = await bot.users.fetch(usuarioId);
  const dm = await usuario.createDM();

  const buffer = criarTabuleiro(tabuleiros, modoVisual(modo));

  const arquivo = new AttachmentBuilder(buffer, {
    name: 'seu-tabuleiro.png'
  });

  const restantes = tabuleiros.map(tabuleiro =>
    Math.max(0, limite - tabuleiro.tentativas.length)
  );

  const terminou = tabuleiros.every(tabuleiro => tabuleiro.terminou);

  const status = terminou
    ? '\nSua parte do desafio terminou. Aguarde o resultado.'
    : `\nTentativas restantes por tabuleiro: **${restantes.join(', ')}**.`;

  const nomeModo = modo === 'dueto'
    ? 'Dueto'
    : modo === 'quarteto'
      ? 'Quarteto'
      : 'X1';

  const conteudo =
    `⚔️ **Seu desafio de Termo ${nomeModo}**\n` +
    `Adversário: <@${adversarioId}>\n` +
    `Envie \`/t tentativa:PALAVRA\` nesta conversa privada.` +
    status;

  if (desafio.mensagensPrivadas[usuarioId]) {
    try {
      const mensagem = await dm.messages.fetch(
        desafio.mensagensPrivadas[usuarioId]
      );

      await mensagem.edit({
        content: conteudo,
        files: [arquivo]
      });

      return;
    } catch {}
  }

  const mensagem = await dm.send({
    content: conteudo,
    files: [arquivo]
  });

  desafio.mensagensPrivadas[usuarioId] = mensagem.id;
}

async function atualizarTabuleirosDesafio(desafio) {
  for (const usuarioId of [
    desafio.desafianteId,
    desafio.desafiadoId
  ]) {
    try {
      await atualizarTabuleiroPrivado(usuarioId, desafio);
    } catch (erro) {
      console.error(
        `Não foi possível atualizar o tabuleiro privado de ${usuarioId}:`,
        erro
      );
    }
  }
}

async function anunciarNoCanal(desafio, texto) {
  try {
    const canal = await bot.channels.fetch(desafio.canalId);

    if (canal && canal.isTextBased()) {
      await canal.send(texto);
    }
  } catch (erro) {
    console.error('Não foi possível anunciar o resultado:', erro);
  }
}

async function terminarDesafio(desafio, vencedorId = null, motivo = '') {
  if (desafio.finalizado) return;

  desafio.finalizado = true;

  registrarResultadoDesafio(desafio, vencedorId);

  let resultado;

  if (!vencedorId) {
    resultado =
      `🤝 **Desafio empatado!** <@${desafio.desafianteId}> e ` +
      `<@${desafio.desafiadoId}> não acertaram suas palavras.`;
  } else {
    const perdedorId =
      vencedorId === desafio.desafianteId
        ? desafio.desafiadoId
        : desafio.desafianteId;

    resultado =
      `🏆 **<@${vencedorId}> venceu o desafio contra <@${perdedorId}>!**`;
  }

  
  if (motivo) resultado += `\n${motivo}`;

  const palavrasDesafiante = obterTabuleirosDesafio(
  desafio,
  desafio.desafianteId
).map(tabuleiro => tabuleiro.palavra);

const palavrasDesafiado = obterTabuleirosDesafio(
  desafio,
  desafio.desafiadoId
).map(tabuleiro => tabuleiro.palavra);

resultado +=
  `\n\n🔤 **Palavras do desafio:**\n` +
  `<@${desafio.desafianteId}>: **${palavrasDesafiante.join(', ')}**\n` +
  `<@${desafio.desafiadoId}>: **${palavrasDesafiado.join(', ')}**`;

  await anunciarNoCanal(desafio, resultado);


  // Tenta enviar o resultado final e a resposta de cada jogador por DM.
  for (const usuarioId of [
    desafio.desafianteId,
    desafio.desafiadoId
  ]) {
    try {
     const usuario = await bot.users.fetch(usuarioId);

const tabuleiros = obterTabuleirosDesafio(desafio, usuarioId);

const buffer = criarTabuleiro(
  tabuleiros,
  modoVisual(desafio.modo || 'termo')
);
     
const adversarioId =
  usuarioId === desafio.desafianteId
    ? desafio.desafiadoId
    : desafio.desafianteId;

const palavrasAdversario = obterTabuleirosDesafio(
  desafio,
  adversarioId
).map(tabuleiro => tabuleiro.palavra);

const minhasPalavras = tabuleiros.map(tabuleiro => tabuleiro.palavra);

const mensagemFinal = await usuario.send({
  content:
    `🏁 **Desafio finalizado**\n${resultado}\n\n` +
    `🔤 Suas palavras eram: **${minhasPalavras.join(', ')}**\n` +
    `⚔️ Palavras do adversário: **${palavrasAdversario.join(', ')}**`,
  files: [
    new AttachmentBuilder(buffer, {
      name: 'tabuleiro-final.png'
    })
  ]
});


      // Apaga o tabuleiro antigo, mantendo a mensagem final.
      const mensagemAntigaId = desafio.mensagensPrivadas[usuarioId];

      if (mensagemAntigaId) {
        try {
          const dm = await usuario.createDM();
          const mensagemAntiga = await dm.messages.fetch(mensagemAntigaId);

          await mensagemAntiga.delete();
        } catch (erro) {
          console.error(
            `Não foi possível apagar o tabuleiro antigo de ${usuarioId}:`,
            erro.message
          );
        }
      }


    } catch (erro) {
      console.error(
        `Não foi possível enviar o resultado privado para ${usuarioId}:`,
        erro.message
      );
    }
  }

  limparDesafio(desafio);

  // Aguarda 30 segundos para os jogadores lerem o resultado.
setTimeout(() => {
  apagarMensagensPrivadasDesafio(desafio).catch(erro => {
    console.error('Erro ao limpar as mensagens do desafio:', erro);
  });
}, 30 * 1000);
}

async function iniciarDesafio(interaction, alvo, modo = 'termo') {
  if (!interaction.guildId || !interaction.channelId) {
    return interaction.reply({
      content: 'Você precisa iniciar o desafio dentro de um servidor.',
      ephemeral: true
    });
  }

  if (alvo.bot) {
    return interaction.reply({
      content: 'Você não pode desafiar um bot.',
      ephemeral: true
    });
  }

  if (alvo.id === interaction.user.id) {
    return interaction.reply({
      content: 'Você não pode desafiar a si mesmo.',
      ephemeral: true
    });
  }

  if (
    obterDesafioDoJogador(interaction.user.id) ||
    obterDesafioDoJogador(alvo.id) ||
    convitesPorUsuario.has(interaction.user.id) ||
    convitesPorUsuario.has(alvo.id)
  ) {
    return interaction.reply({
      content: 'Um de vocês já está participando de um desafio ou tem um convite pendente.',
      ephemeral: true
    });
  }

  const idConvite = `${interaction.guildId}:${interaction.user.id}:${alvo.id}:${Date.now()}`;

  const convite = {
    id: idConvite,
    guildId: interaction.guildId,
    canalId: interaction.channelId,
    desafianteId: interaction.user.id,
    desafiadoId: alvo.id,
    modo,
    expirado: false,
    timeout: null
  };

  const botoes = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`desafio_aceitar:${idConvite}`)
      .setLabel('Aceitar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`desafio_recusar:${idConvite}`)
      .setLabel('Recusar')
      .setStyle(ButtonStyle.Danger)
  );

  convites.set(idConvite, convite);
  convitesPorUsuario.set(interaction.user.id, idConvite);
  convitesPorUsuario.set(alvo.id, idConvite);

  await interaction.reply({
    content:
  `⚔️ ${alvo}, você foi desafiado por ${interaction.user} para uma partida de Termo ${modo === 'dueto' ? 'Dueto' : modo === 'quarteto' ? 'Quarteto' : 'X1'}!\n` +
  (modo === 'termo'
    ? 'Cada jogador terá uma palavra diferente e seis tentativas. '
    : `Cada jogador terá ${modo === 'dueto' ? 'dois tabuleiros e sete tentativas por tabuleiro' : 'quatro tabuleiros e nove tentativas por tabuleiro'}. `) +
  `Você tem dois minutos para aceitar ou recusar.`,
    components: [botoes]
  });

  const mensagem = await interaction.fetchReply();

  convite.timeout = setTimeout(async () => {
    if (!convites.has(idConvite)) return;

    convite.expirado = true;
    convites.delete(idConvite);
    convitesPorUsuario.delete(convite.desafianteId);
    convitesPorUsuario.delete(convite.desafiadoId);

    try {
      await mensagem.edit({
        content: '⌛ O convite para o desafio expirou.',
        components: []
      });
    } catch {}
  }, TEMPO_CONVITE);
}

async function aceitarDesafio(interaction, idConvite) {
  const convite = convites.get(idConvite);

  if (!convite || convite.expirado) {
    return interaction.reply({
      content: 'Esse convite já expirou ou não existe mais.',
      ephemeral: true
    });
  }

  if (interaction.user.id !== convite.desafiadoId) {
    return interaction.reply({
      content: 'Somente a pessoa desafiada pode responder a esse convite.',
      ephemeral: true
    });
  }

  if (
    obterDesafioDoJogador(convite.desafianteId) ||
    obterDesafioDoJogador(convite.desafiadoId)
  ) {
    convites.delete(idConvite);
    clearTimeout(convite.timeout);
    convitesPorUsuario.delete(convite.desafianteId);
    convitesPorUsuario.delete(convite.desafiadoId);

    return interaction.update({
      content: 'O desafio não pôde começar porque um dos jogadores já está em outra partida.',
      components: []
    });
  }

  // Confirma que os dois jogadores podem receber mensagens privadas antes de iniciar.
  let usuarioDesafiante;
  let usuarioDesafiado;

  try {
    usuarioDesafiante = await bot.users.fetch(convite.desafianteId);
    usuarioDesafiado = await bot.users.fetch(convite.desafiadoId);

    await usuarioDesafiante.createDM();
    await usuarioDesafiado.createDM();
  } catch {
    convites.delete(idConvite);
    clearTimeout(convite.timeout);
    convitesPorUsuario.delete(convite.desafianteId);
    convitesPorUsuario.delete(convite.desafiadoId);

    return interaction.update({
      content:
        'Não foi possível iniciar o desafio porque um dos jogadores não permite mensagens privadas do bot. ' +
        'Ativem as mensagens privadas do servidor e tentem novamente.',
      components: []
    });
  }

 

const modo = convite.modo || 'termo';

const quantidadeTabuleiros =
  modo === 'quarteto' ? 4 :
  modo === 'dueto' ? 2 : 1;

let palavras1 = [];
let palavras2 = [];

try {
    const lista = carregarListaValida(false);
  const palavrasDisponiveis = [...lista];

  if (palavrasDisponiveis.length < quantidadeTabuleiros * 2) {
    throw new Error(
      `São necessárias pelo menos ${quantidadeTabuleiros * 2} palavras diferentes no arquivo palavras.txt.`
    );
  }

  for (let i = palavrasDisponiveis.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [palavrasDisponiveis[i], palavrasDisponiveis[j]] =
      [palavrasDisponiveis[j], palavrasDisponiveis[i]];
  }

  palavras1 = palavrasDisponiveis.slice(0, quantidadeTabuleiros);
  palavras2 = palavrasDisponiveis.slice(
    quantidadeTabuleiros,
    quantidadeTabuleiros * 2
  );
} catch (erro) {
  convites.delete(idConvite);
  clearTimeout(convite.timeout);
  convitesPorUsuario.delete(convite.desafianteId);
  convitesPorUsuario.delete(convite.desafiadoId);

  return interaction.update({
    content: `Não foi possível iniciar o desafio: ${erro.message}`,
    components: []
  });
}


  clearTimeout(convite.timeout);
  convites.delete(idConvite);
  convitesPorUsuario.delete(convite.desafianteId);
  convitesPorUsuario.delete(convite.desafiadoId);

  
const desafio = {
  id: idConvite,
  guildId: convite.guildId,
  canalId: convite.canalId,
  desafianteId: convite.desafianteId,
  desafiadoId: convite.desafiadoId,
  modo: convite.modo || 'termo',
  jogadores: {
    [convite.desafianteId]: palavras1.map(criarTabuleiroDesafio),
    [convite.desafiadoId]: palavras2.map(criarTabuleiroDesafio)
  },
  mensagensPrivadas: {},
  interacoesPrivadas: [],
  finalizado: false,
  historicoRegistrado: false
};

  desafios.set(desafio.id, desafio);
  desafioPorUsuario.set(desafio.desafianteId, desafio.id);
  desafioPorUsuario.set(desafio.desafiadoId, desafio.id);

  await interaction.update({
    content:
      `⚔️ Desafio aceito! <@${desafio.desafiadoId}> enfrentará ` +
      `<@${desafio.desafianteId}>.\n` +
      `Cada jogador recebeu ${modo === 'quarteto' ? 'quatro palavras' : modo === 'dueto' ? 'duas palavras' : 'uma palavra'} por mensagem privada. ` +
      `O desafio não vale pontos Ranked.`,
    components: []
  });

  try {
    await atualizarTabuleirosDesafio(desafio);
  } catch (erro) {
    console.error('Erro ao iniciar os tabuleiros privados:', erro);

    await terminarDesafio(
      desafio,
      null,
      'O desafio foi cancelado porque não foi possível entregar um dos tabuleiros privados.'
    );
  }
}

async function recusarDesafio(interaction, idConvite) {
  const convite = convites.get(idConvite);

  if (!convite || convite.expirado) {
    return interaction.reply({
      content: 'Esse convite já expirou ou não existe mais.',
      ephemeral: true
    });
  }

  if (interaction.user.id !== convite.desafiadoId) {
    return interaction.reply({
      content: 'Somente a pessoa desafiada pode recusar esse convite.',
      ephemeral: true
    });
  }

  clearTimeout(convite.timeout);
  convites.delete(idConvite);
  convitesPorUsuario.delete(convite.desafianteId);
  convitesPorUsuario.delete(convite.desafiadoId);

  return interaction.update({
    content: `❌ <@${convite.desafiadoId}> recusou o desafio de <@${convite.desafianteId}>.`,
    components: []
  });
}


async function processarTentativaDesafio(interaction, tentativaOriginal) {
  const desafio = obterDesafioDoJogador(interaction.user.id);

  if (!desafio) return false;

  if (!desafio.interacoesPrivadas) {
    desafio.interacoesPrivadas = [];
  }

  desafio.interacoesPrivadas.push(interaction);

  const tabuleiros = Array.isArray(desafio.jogadores[interaction.user.id])
    ? desafio.jogadores[interaction.user.id]
    : [desafio.jogadores[interaction.user.id]];

  const tabuleirosAtivos = tabuleiros.filter(tabuleiro => !tabuleiro.terminou);

  if (tabuleirosAtivos.length === 0) {
    await interaction.reply({
      content: 'Sua parte do desafio já terminou. Aguarde o resultado.',
      ephemeral: true
    });

    return true;
  }

  const tentativa = tentativaOriginal
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (!/^[A-Z]{5}$/.test(tentativa)) {
    await interaction.reply({
      content: 'A palavra precisa ter exatamente cinco letras.',
      ephemeral: true
    });

    return true;
  }

  const palavrasValidas = carregarListaValida(false);

  if (!palavrasValidas.includes(tentativa)) {
    await interaction.reply({
      content: 'Essa palavra não está na lista de palavras válidas.',
      ephemeral: true
    });

    return true;
  }

  const modo = desafio.modo || 'termo';
  const limite = limiteTentativas(modo);
  let acertouAlguma = false;

  for (const tabuleiro of tabuleirosAtivos) {
    const cores = verificarPalavra(tentativa, tabuleiro.palavra);

    tabuleiro.tentativas.push({
      palavra: tentativa,
      letras: tentativa.split(''),
      cores
    });

    const acertou = cores.every(cor => cor === 'certa');

    if (acertou) {
      tabuleiro.terminou = true;
      acertouAlguma = true;
    } else if (tabuleiro.tentativas.length >= limite) {
      tabuleiro.terminou = true;
    }
  }

  const todosAcertados = tabuleiros.every(tabuleiro =>
    tabuleiro.tentativas.some(
      tentativa => tentativa.cores.every(cor => cor === 'certa')
    )
  );

  const todosTerminados = tabuleiros.every(tabuleiro => tabuleiro.terminou);

  const restantes = tabuleiros
    .filter(tabuleiro => !tabuleiro.terminou)
    .map(tabuleiro => limite - tabuleiro.tentativas.length);

  let mensagem;

  if (todosAcertados) {
    mensagem = '🎉 Você descobriu todas as palavras e venceu o desafio!';
  } else if (todosTerminados) {
    mensagem = '❌ Você terminou todas as suas tentativas. Aguarde o resultado do adversário.';
  } else if (acertouAlguma) {
    mensagem = `🎉 Você acertou uma palavra! Ainda precisa descobrir as outras. Tentativas restantes por tabuleiro: ${restantes.join(', ')}.`;
  } else {
    mensagem = `❌ Palavra registrada nos tabuleiros ativos. Tentativas restantes por tabuleiro: ${restantes.join(', ')}.`;
  }

  await interaction.reply({
    content: mensagem,
    ephemeral: true
  });

  await atualizarTabuleirosDesafio(desafio);

  if (todosAcertados) {
    await terminarDesafio(
      desafio,
      interaction.user.id,
      'O jogador descobriu todas as palavras do desafio!'
    );

    return true;
  }

  const adversarioId = interaction.user.id === desafio.desafianteId
    ? desafio.desafiadoId
    : desafio.desafianteId;

  const tabuleirosAdversario = Array.isArray(desafio.jogadores[adversarioId])
    ? desafio.jogadores[adversarioId]
    : [desafio.jogadores[adversarioId]];

  const adversarioTerminou = tabuleirosAdversario.every(
    tabuleiro => tabuleiro.terminou
  );

  if (todosTerminados && adversarioTerminou) {
    await terminarDesafio(
      desafio,
      null,
      'Nenhum dos jogadores conseguiu descobrir todas as palavras do desafio.'
    );
  }

  return true;
}


// ==================================================
// INTERAÇÕES
// ==================================================

bot.on(Events.InteractionCreate, async interaction => {
  try {

 // Menu de votação pública do Impostor
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith('impostor_votar:')
    ) {
      await jogoImpostor.processarSelecaoVoto(interaction);
      return;
    }

    // Botões de convite do desafio.
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('desafio_aceitar:')) {
        const idConvite = interaction.customId.slice('desafio_aceitar:'.length);
        return await aceitarDesafio(interaction, idConvite);
      }

      if (interaction.customId.startsWith('desafio_recusar:')) {
        const idConvite = interaction.customId.slice('desafio_recusar:'.length);
        return await recusarDesafio(interaction, idConvite);
      }
if (interaction.customId.startsWith('impostor_responder:')) {
  const [, partidaId, jogadorId] = interaction.customId.split(':');

  await jogoImpostor.abrirFormularioResposta(
    interaction,
    partidaId,
    jogadorId
  );

  return;
}

  if (interaction.customId.startsWith('impostor_pagina:')) {
        await jogoImpostor.processarPaginaVotacao(interaction);
        return;
      }

if (interaction.customId.startsWith('impostor_')) {
  await impostor.processarBotao(interaction);
  return;
}

      return;
    }

    if (
  interaction.isModalSubmit() &&
  interaction.customId.startsWith('impostor_resposta:')
) {
  await jogoImpostor.salvarResposta(interaction);
  return;
}

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'impostor') {
       await impostor.iniciarComando(interaction);
        return;
}

    // --------------------------------------------------
    // COMANDO /TERMO
    // --------------------------------------------------

    if (interaction.commandName === 'termo') {
      const subcomando = interaction.options.getSubcommand();

      if (subcomando === 'placar') {
        return await mostrarRanking(interaction);
      }

      if (subcomando === 'confronto') {
        const outroUsuario = interaction.options.getUser('jogador', true);
        return await mostrarConfronto(interaction, outroUsuario);
      }

      
if (['desafio', 'desafio-dueto', 'desafio-quarteto'].includes(subcomando)) {
  const alvo = interaction.options.getUser('jogador', true);

  const modosDesafio = {
    desafio: 'termo',
    'desafio-dueto': 'dueto',
    'desafio-quarteto': 'quarteto'
  };

  return await iniciarDesafio(
    interaction,
    alvo,
    modosDesafio[subcomando]
  );
}


      if (!interaction.guildId || !interaction.channelId) {
        return interaction.reply({
          content: 'Esse comando precisa ser usado dentro de um servidor.',
          ephemeral: true
        });
      }

      if (subcomando === 'encerrar') {
        const canalId = interaction.channelId;
        const partida = encontrarPartida(canalId, interaction.user.id);

        if (!partida) {
          return interaction.reply({
            content: 'Não há uma partida ativa para encerrar.',
            ephemeral: true
          });
        }

        if (
          ehRanked(partida.modo) &&
          partida.donoId !== interaction.user.id
        ) {
          return interaction.reply({
            content: 'Você não pode encerrar a partida Ranked de outra pessoa.',
            ephemeral: true
          });
        }

        partida.tabuleiros.forEach(tabuleiro => {
          tabuleiro.terminou = true;
        });

        await atualizarTabuleiro(
          interaction.channel,
          partida,
          `🛑 Partida encerrada por ${interaction.user}.`
        );

        partidas.delete(
          ehRanked(partida.modo)
            ? chaveRanked(canalId, interaction.user.id)
            : canalId
        );

        return interaction.reply({
          content: 'Partida encerrada.',
          ephemeral: true
        });
      }

      if (subcomando === 'dica') {
        const partida = encontrarPartida(
          interaction.channelId,
          interaction.user.id
        );

        if (!partida) {
          return interaction.reply({
            content: 'Não há uma partida ativa neste canal.',
            ephemeral: true
          });
        }

        if (
          ehRanked(partida.modo) &&
          partida.donoId !== interaction.user.id
        ) {
          return interaction.reply({
            content: 'Você não pode usar dicas na partida Ranked de outra pessoa.',
            ephemeral: true
          });
        }

        const resultado = usarDica(partida);

        if (!resultado.sucesso) {
          return interaction.reply({
            content: resultado.mensagem,
            ephemeral: true
          });
        }

        const texto = resultado.reveladas
          .map(d => `Posição ${d.posicao}: **${d.letra}**`)
          .join('\n');

        await atualizarTabuleiro(
          interaction.channel,
          partida,
          `💡 ${interaction.user} usou uma dica!\n${texto}`
        );

        return interaction.reply({
          content: `${resultado.mensagem}\n${texto}`,
          ephemeral: true
        });
      }

      const modos = {
        jogar: 'termo',
        dueto: 'dueto',
        quarteto: 'quarteto',
        ranked: 'termo-ranked',
        'dueto-ranked': 'dueto-ranked',
        'quarteto-ranked': 'quarteto-ranked'
      };

      const modo = modos[subcomando];

      if (!modo) {
        return interaction.reply({
          content: 'Comando não reconhecido.',
          ephemeral: true
        });
      }

      const ranked = ehRanked(modo);
      const canalId = interaction.channelId;

      const chave = ranked
        ? chaveRanked(canalId, interaction.user.id)
        : canalId;

      if (ranked && partidas.has(chave)) {
        return interaction.reply({
          content: 'Você já tem uma partida Ranked ativa neste canal.',
          ephemeral: true
        });
      }

      if (!ranked && partidas.has(canalId)) {
        return interaction.reply({
          content: 'Já existe uma partida normal neste canal. Termine-a antes de iniciar outra.',
          ephemeral: true
        });
      }

      const partida = iniciarPartida(
        chave,
        modo,
        ranked ? interaction.user.id : null
      );

      partida.canalId = canalId;

      const buffer = criarTabuleiro(
        partida.tabuleiros,
        modoVisual(modo)
      );

      const arquivo = new AttachmentBuilder(buffer, {
        name: 'tabuleiro.png'
      });

      await interaction.reply({
        content:
          `${interaction.user}, partida iniciada! ` +
          `Use \`/t tentativa:PALAVRA\` para jogar. ` +
          `Tentativas por tabuleiro: ${limiteTentativas(modoVisual(modo))}.`,
        files: [arquivo]
      });

      const mensagem = await interaction.fetchReply();
      partida.mensagemId = mensagem.id;

      return;
    }

    // --------------------------------------------------
    // COMANDO /T
    // --------------------------------------------------

    if (interaction.commandName === 't') {
      const tentativa = interaction.options.getString('tentativa', true);

      // O desafio é procurado pelo usuário, funcionando tanto em DM
      // quanto no servidor.
      const desafio = obterDesafioDoJogador(interaction.user.id);

      if (desafio) {
        return await processarTentativaDesafio(interaction, tentativa);
      }

      // Sem desafio ativo, mantém o comportamento original de partidas.
      if (!interaction.guildId || !interaction.channelId) {
        return interaction.reply({
          content: 'Você não tem um desafio ativo para jogar por mensagem privada.',
          ephemeral: true
        });
      }

      const canalId = interaction.channelId;
      const partida = encontrarPartida(canalId, interaction.user.id);

      if (!partida) {
        return interaction.reply({
          content: 'Não há uma partida ativa neste canal.',
          ephemeral: true
        });
      }

      if (
        ehRanked(partida.modo) &&
        partida.donoId !== interaction.user.id
      ) {
        return interaction.reply({
          content: 'Essa partida Ranked pertence a outra pessoa.',
          ephemeral: true
        });
      }

      const palavra = tentativa
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();

      if (!/^[A-Z]{5}$/.test(palavra)) {
        return interaction.reply({
          content: 'A palavra precisa ter exatamente cinco letras.',
          ephemeral: true
        });
      }

      const palavrasValidas = carregarListaValida(ehRanked(partida.modo));

      if (!palavrasValidas.includes(palavra)) {
        return interaction.reply({
          content: 'Essa palavra não está na lista de palavras válidas.',
          ephemeral: true
        });
      }

      
let acertouAlguma = false;

for (const tabuleiro of partida.tabuleiros) {
  if (tabuleiro.terminou) continue;

  const cores = verificarPalavra(palavra, tabuleiro.palavra);

  tabuleiro.tentativas.push({
    palavra,
    letras: palavra.split(''),
    cores
  });

  const acertou = cores.every(cor => cor === 'certa');

  if (acertou) {
    acertouAlguma = true;
  }

  if (
    acertou ||
    tabuleiro.tentativas.length >= limiteTentativas(modoVisual(partida.modo))
  ) {
    tabuleiro.terminou = true;
  }
}


      const todosTerminaram = partida.tabuleiros.every(
        tabuleiro => tabuleiro.terminou
      );

      
      let conteudo = `Tentativa enviada por ${interaction.user}.`;


      if (todosTerminaram) {
        conteudo += `\n\n**Respostas:**\n${montarRespostas(partida)}`;
        registrarPontuacao(partida);

        partidas.delete(
          ehRanked(partida.modo)
            ? chaveRanked(canalId, interaction.user.id)
            : canalId
        );
      }

      await atualizarTabuleiro(interaction.channel, partida, conteudo);

      
return interaction.reply({
  content: acertouAlguma
    ? '🎉 Parabéns! Você acertou a palavra!'
    : 'Tentativa registrada!',
  ephemeral: true
});

    }
  } catch (erro) {
    console.error('Erro ao processar interação:', erro);

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content: 'Ocorreu um erro ao executar esse comando.',
        ephemeral: true
      }).catch(() => {});
    }
  }
});

bot.login(process.env.DISCORD_TOKEN);
