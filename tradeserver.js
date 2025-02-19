const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
const port = 3002;

// Connect to Data Server
const dataWS = new WebSocket('ws://localhost:3001');
let balance = 0;

dataWS.on('message', (data) => {
  const msg = JSON.parse(data);
  
  if (msg.type === 'balance') {
    balance = msg.data.balance;
  }
});

// Trade Endpoint
app.post('/trade', (req, res) => {
  const { symbol, amount } = req.body;
  
  if (amount > balance) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // Forward trade to Data Server
  dataWS.send(JSON.stringify({
    type: 'trade',
    symbol,
    amount,
    contract_type: 'CALL'
  }));

  res.json({ status: 'Trade executed' });
});

app.listen(port, () => console.log(`Trade Server on ${port}`));