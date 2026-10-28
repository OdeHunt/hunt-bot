
const fs = require('fs');
const path = require('path');

const arquivoEntrada = path.join(__dirname, '20k.txt');
const arquivoSaida = path.join(__dirname, 'palavras-ranked.txt');

function normalizarPalavra(palavra) {
  return palavra
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function gerarListaRanked() {
  if (!fs.existsSync(arquivoEntrada)) {
    console.error('ERRO: O arquivo 20k.txt não foi encontrado.');
    console.error('Coloque o arquivo 20k.txt na mesma pasta deste script.');
    process.exit(1);
  }

  const conteudo = fs.readFileSync(arquivoEntrada, 'utf8');

  const palavras = conteudo
    .split(/\r?\n/)
    .map(normalizarPalavra)
    .filter(palavra => /^[A-Z]{5}$/.test(palavra));

  const palavrasUnicas = [...new Set(palavras)].slice(0, 4000);

  if (palavrasUnicas.length < 4) {
    console.error(
      'ERRO: Foram encontradas menos de 4 palavras válidas no 20k.txt.'
    );
    console.error(
      'Confira se o arquivo contém uma palavra por linha.'
    );
    process.exit(1);
  }

  fs.writeFileSync(
    arquivoSaida,
    palavrasUnicas.join('\n') + '\n',
    'utf8'
  );

  console.log('Lista Ranked criada com sucesso!');
  console.log(`Palavras encontradas: ${palavrasUnicas.length}`);
  console.log(`Arquivo gerado: ${arquivoSaida}`);
}

gerarListaRanked();
