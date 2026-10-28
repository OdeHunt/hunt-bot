
const fs = require('fs');
const path = require('path');

const arquivoDicionario = path.join(__dirname, 'pt_BR.dic');
const arquivoSaida = path.join(__dirname, 'palavras.txt');

if (!fs.existsSync(arquivoDicionario)) {
  console.error('Não encontrei o arquivo pt_BR.dic!');
  process.exit(1);
}

const conteudo = fs.readFileSync(arquivoDicionario, 'utf8');

const palavras = conteudo
  .split(/\r?\n/)
  .slice(1) // Ignora a primeira linha, que costuma indicar a quantidade de entradas
  .map(linha => linha.trim().split(/\s+/)[0])
  .map(palavra => palavra.split('/')[0])
  .map(palavra =>
    palavra.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  )
  .map(palavra => palavra.toUpperCase())
  .filter(palavra => /^[A-Z]{5}$/.test(palavra));

const palavrasUnicas = [...new Set(palavras)].sort();

if (palavrasUnicas.length === 0) {
  console.error(
    'Nenhuma palavra foi encontrada. Verifique o conteúdo do pt_BR.dic.'
  );
  process.exit(1);
}

fs.writeFileSync(
  arquivoSaida,
  palavrasUnicas.join('\n') + '\n',
  'utf8'
);

console.log(
  `Sucesso! ${palavrasUnicas.length} palavras de cinco letras foram salvas em palavras.txt.`
);
