
require('dotenv').config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType
} = require('discord.js');

const comandos = [
  
  new SlashCommandBuilder()
    .setName('impostor')
    .setDescription('Comandos do jogo Impostor')
    .addSubcommand(subcommand =>
      subcommand
        .setName('jogar')
        .setDescription('Inicia uma partida do Impostor no modo normal')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('classico')
        .setDescription('Inicia uma partida do Impostor no modo clássico')
    ),


  new SlashCommandBuilder()
    .setName('termo')
    .setDescription('Comandos do jogo Termo')

    .addSubcommand(subcommand =>
      subcommand
        .setName('jogar')
        .setDescription('Inicia o Termo normal')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('dueto')
        .setDescription('Inicia o Termo com dois tabuleiros')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('quarteto')
        .setDescription('Inicia o Termo com quatro tabuleiros')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ranked')
        .setDescription('Inicia uma partida Ranked individual')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('dueto-ranked')
        .setDescription('Inicia o Dueto Ranked individual')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('quarteto-ranked')
        .setDescription('Inicia o Quarteto Ranked individual')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('placar')
        .setDescription('Mostra o ranking global do Termo')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('dica')
        .setDescription('Revela uma letra no tabuleiro')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('encerrar')
        .setDescription('Encerra sua partida ou a partida normal do canal')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('desafio')
        .setDescription('Desafia outro membro para uma partida X1 privada')
        .addUserOption(option =>
          option
            .setName('jogador')
            .setDescription('Membro que você quer desafiar')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('desafio-dueto')
        .setDescription('Desafia outro membro para um Dueto privado')
        .addUserOption(option =>
          option
            .setName('jogador')
            .setDescription('Membro que você quer desafiar')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('desafio-quarteto')
        .setDescription('Desafia outro membro para um Quarteto privado')
        .addUserOption(option =>
          option
            .setName('jogador')
            .setDescription('Membro que você quer desafiar')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('confronto')
        .setDescription('Consulta seu histórico contra outro jogador')
        .addUserOption(option =>
          option
            .setName('jogador')
            .setDescription('Jogador para consultar o histórico')
            .setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName('t')
    .setDescription('Enviar uma tentativa de palavra')
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM
    )
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall
    )
    .addStringOption(option =>
      option
        .setName('tentativa')
        .setDescription('Sua palavra de cinco letras')
        .setRequired(true)
        .setMinLength(5)
        .setMaxLength(5)
    )
].map(comando => comando.toJSON());

const rest = new REST({ version: '10' })
  .setToken(process.env.DISCORD_TOKEN);

async function registrar() {
  const appId = '1564367068873232435';

  await rest.put(
    Routes.applicationCommands(appId),
    { body: comandos }
  );

  console.log('Comandos globais registrados com sucesso!');
}

registrar().catch(console.error);
