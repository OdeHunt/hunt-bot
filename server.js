const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.status(200).send('HUNT Bot está hospedado.');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor HTTP ativo na porta ${PORT}`);
});

require('./index');
