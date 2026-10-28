
const { createCanvas } = require('canvas');

function criarTabuleiro(tabuleiros, modo = 'termo') {
  const tamanho = 42;
  const espaco = 5;
  const margem = 18;
  const topo = 42;

  const limite =
    modo === 'quarteto' ? 9 :
    modo === 'dueto' ? 7 : 6;

  const larguraGrade = 5 * tamanho + 4 * espaco;
  const alturaGrade = limite * tamanho + (limite - 1) * espaco;

  const quantidade = tabuleiros.length;
  const colunas = quantidade === 4 ? 2 : quantidade;
  const linhas = quantidade === 4 ? 2 : 1;

  const largura = margem * 2 +
    colunas * larguraGrade + (colunas - 1) * 18;

  const altura = topo + margem +
    linhas * alturaGrade + (linhas - 1) * 22;

  const canvas = createCanvas(largura, altura);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#6f5c61';
  ctx.fillRect(0, 0, largura, altura);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(modo.toUpperCase(), largura / 2, 28);

  const cores = {
    certa: '#3aa394',
    presente: '#d3ad42',
    errada: '#514348',
    dica: '#3978b8'
  };

  tabuleiros.forEach((tabuleiro, indice) => {
    const coluna = indice % colunas;
    const linha = Math.floor(indice / colunas);

    const inicioX = margem + coluna * (larguraGrade + 18);
    const inicioY = topo + linha * (alturaGrade + 22);

    for (let l = 0; l < limite; l++) {
      for (let c = 0; c < 5; c++) {
        const x = inicioX + c * (tamanho + espaco);
        const y = inicioY + l * (tamanho + espaco);

        const tentativa = tabuleiro.tentativas[l];
        const dica = tabuleiro.dicas.find(d => d.posicao === c);

        let letra = '';
        let cor = null;

        if (tentativa) {
          letra = tentativa.letras[c];
          cor = tentativa.cores[c];
        } else if (dica) {
          letra = dica.letra;
          cor = 'dica';
        }

        ctx.fillStyle = cor ? cores[cor] : '#6f5c61';

        if (cor) {
          ctx.fillRect(x, y, tamanho, tamanho);
        }

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, tamanho, tamanho);

        if (letra) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 22px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(letra, x + tamanho / 2, y + 28);
        }
      }
    }
  });

  return canvas.toBuffer('image/png');
}

module.exports = { criarTabuleiro };
