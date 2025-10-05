const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Servidor de teste funcionando!');
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor de teste rodando na porta ${PORT}`);
});