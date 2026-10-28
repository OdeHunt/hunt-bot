
const fs = require('fs');
const path = require('path');

const entrada = path.join(__dirname, '20k.txt');
const saida = path.join(__dirname, 'palavras.txt');

if (!fs.existsSync(entrada)) {
  console.error('Não encontrei o arquivo 20k.txt na pasta do projeto.');
  process.exit(1);
}

const palavras = fs.readFileSync(entrada, 'utf8')
  .split(/\r?\n/)
  .map(p => p.trim().toUpperCase())
  .map(p => p.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  .filter(p => /^[A-Z]{5}$/.test(p));

const unicas = [...new Set(palavras)].slice(0, 2000);

if (unicas.length === 0) {
  console.error('Nenhuma palavra de cinco letras foi encontrada.');
  process.exit(1);
}

fs.writeFileSync(saida, unicas.join('\n') + '\n', 'utf8');

console.log(`${unicas.length} palavras de cinco letras salvas em palavras.txt.`);
