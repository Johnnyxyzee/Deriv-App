const WebSocket = require('ws');
const express = require('express');
require('dotenv').config();

// 1. Create Express server
const app = express();
const port = 3001;

// 2. Connect to Deriv API
const derivWS = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
let isDerivConnected = false;

derivWS.on('open', () => {
  console.log('✅ Connected to Deriv API');
  derivWS.send(JSON.stringify({ authorize: process.env.DERIV_API_TOKEN }));
});

derivWS.on('message', (data) => {
  const msg = JSON.parse(data);
  
  // 3. Handle balance updates
  if (msg.msg_type === 'balance') {
    console.log('💰 Balance Update:', msg.balance);
  }
  
  // 4. Handle price ticks
  if (msg.msg_type === 'tick') {
    console.log('📈 Tick:', msg.tick.symbol, msg.tick.quote);
  }
});

derivWS.on('error', (err) => {
  console.error('Deriv Connection Error:', err);
});

// 5. Start server
app.listen(port, () => {
  console.log(`🚀 Data Server running on http://localhost:${port}`);
});