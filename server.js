const express = require('express'); // Import express
const app = express();
const port = process.env.PORT || 3000; // Define the port

const WebSocket = require('ws');
require('dotenv').config();

const API_URL = 'wss://ws.binaryws.com/websockets/v3?app_id=1089'; // Replace with your app id
const API_TOKEN = process.env.DERIV_API_TOKEN;

console.log('Starting script...'); // Debugging log
console.log('API Token:', API_TOKEN); // Debugging log

// Serve static file (e.g, HTML, CSS, JS)
app.use(express.static('public'));

// Create a route for the homepage
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Start the server
const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

// Create a web server
const wss = new WebSocket.Server({ server });

let ws;
let accounts = [2]; // Store the list of accounts
let currentAccount = null; // Track the current selected account 
let tradeCount = 0;
let currentStake; // Initial stake
let currentStake1;
let tradesStopped = false;


// Connect to Deriv API
const connectToDeriv = async () => {
    console.log('Connecting to Deriv API...'); // Debugging log
    ws = new WebSocket(API_URL);

    ws.on('open', () => {
        console.log('Connected to Deriv API'); // Debugging log

        // Step 1: Authenticate with the API token
        ws.send(JSON.stringify({
            authorize: API_TOKEN
        }));
    });

    let tradeCount = 0;
    let consecutiveNon4or5Trades = 0;
    let lastSymbolDigit = null;
    let lastSymbolQuote = null;
    let activeSubscriptions = new Map(); // Track symbol → subscription ID
    let lastBalance = null;
    let balance = 0;
    let lastCount = null;
    let isSub = false;
    let myTimer;
    let lastTickProcessedTime = 0;

    ws.on('message', (data) => {
        const response = JSON.parse(data);
        console.log('Response:', response); // Debugging log

        if (response.authorize) {
            console.log('Authentication successful!'); // Debugging log
            accounts = response.authorize.account_list; // Store the list of accounts
            console.log('Available accounts:', accounts);

            // Set the default account (e.g., the first account in the list)
            if (accounts.length > 2) {
                currentAccount = accounts[2].loginid;
            } else if (accounts.length > 0) {
                currentAccount = accounts[2].loginid; // Fallback to the first account
                
            } else {
                console.error('No accounts available.');
            }

            console.log('Selected account:', currentAccount);

            // Step 2: Fetch balance of the selected account
            fetchBalance(ws, currentAccount);
        }

        if (response.balance) {
            balance = response.balance.balance;
            // Step 4: Handle account balance response
            console.log('Account Balance:', response.balance); // Debugging log

            // Broadcast the balance data to all connected clients
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    console.log('Sending balance to client:', response.balance);
                    client.send(JSON.stringify({
                        balance: response.balance.balance,
                        currency: response.balance.currency,
                        account: currentAccount
                    }));
                }
            });
        }

        if (response.error) {
            console.error('API Error:', response.error); // Debugging log
        }
        if (response.subscription) {
            // Store the subscription ID for the symbol
            const symbol = response.echo_req.ticks;
            activeSubscriptions.set(symbol, response.subscription.id);
        }
	if (response.msg_type === 'tick' || response.msg_type === 'ticks') {  // Handle both tick and ticks
        isSub = true;
        const ticks = response.msg_type === 'tick' ? [response.tick] : response.ticks; // Normalize to array
        ticks.forEach(tick => { // Process each tick
            
	    const symbol = tick.symbol;
            const quoteStr =  tick.quote.toString();
            const currentSymbolDigit = quoteStr.slice(-1); 
	    const quoteStr1 =  tick.quote.toString();
            const currentSymbolQuote = quoteStr1;

            if (tradesStopped === false ) { // Only trade on digit change
                lastSymbolDigit = currentSymbolDigit;
		lastSymbolQuote = currentSymbolQuote;
                console.log("New price for", tick.symbol, ":", tick.quote);

		console.log( 'Last Digit is:', lastSymbolDigit, 'Current Digit is: ', currentSymbolDigit);
                
		
    		if (openSimultaneousTrades(ws, tick.symbol, currentStake, 1)) {
                	tradeCount++;
  		        tradesStopped = true;
		}
		tradesStopped = true;

                

                console.log("Current Stake:", currentStake);

                

                if (tradeCount > 10 && consecutiveNon4or5Trades >= 1000) {

                    console.log("Stopping trades after 10 non-4 or 5 trades.");
                    tradesStopped = true;
                    tradeCount = 0;
                    consecutiveNon4or5Trades = 0;
		    const subscriptionId = activeSubscriptions.get(symbol);
    		    if (subscriptionId && ws.readyState === WebSocket.OPEN) {
        	        // Send forget request for the specific subscription ID
        	        ws.send(JSON.stringify({
            	     	    forget: subscriptionId
        	        }));
        	        activeSubscriptions.delete(symbol);
        	        
    		    }
                }
		const subscriptionId = activeSubscriptions.get(symbol);
    		    if (subscriptionId && ws.readyState === WebSocket.OPEN) {
        	        // Send forget request for the specific subscription ID
        	        ws.send(JSON.stringify({
            	     	    forget: subscriptionId
        	        }));
        	        activeSubscriptions.delete(symbol);
        	        
    		    }
                lastCount = tradeCount;
            }
	    
        });
      }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error); // Debugging log
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed'); // Debugging log
    });
};




const fetchBalance = (ws, account) => {
    console.log('Fetching balance for account:', account);
    ws.send(JSON.stringify({
        balance: 1,
        subscribe: 1,
        account: account // Specify the account to fetch balance for
    }));
};

const openSimultaneousTrades = (ws, symbol = 'R_100', amount = 1, duration = 1) => {
    const barrier_up = 5; // Fixed barrier for "Over" (greater than 5)
    const barrier_down = 4; // Fixed barrier for "Under" (less than 4)

    const trades = [
        {
            contract_type: 'DIGITOVER',
            barrier: barrier_up,
        },
        {
            contract_type: 'DIGITUNDER',
            barrier: barrier_down,
        },
    ];

    trades.forEach(trade => {
        const buyRequest = {
            buy: 1,
            price: amount, // The amount to buy
            parameters: {
                amount: Number(amount), // The stake amount
                basis: 'stake', // Use 'stake' for fixed amounts
                contract_type: trade.contract_type,
                currency: 'USD',
                duration: duration, // Duration in seconds
                duration_unit: 't', // Duration unit (tick)
                symbol: symbol, // The symbol to trade
                barrier: trade.barrier, // The barrier for the contract
            },
        };

        ws.send(JSON.stringify(buyRequest));
        console.log("Sent Buy Request:", buyRequest);
    });
};

// Wait for the server to start before connecting to Deriv API
setTimeout(() => {
    connectToDeriv();
}, 1000); // Wait 1 second to ensure the server is running

// Handle account switching
app.post('/switch-account', express.json(), (req, res) => {
    const { account } = req.body;
    try {
        if (accounts.some(acc => acc.loginid === account)) {
            currentAccount = account;
            console.log('Switched to account:', account);
            res.send({ success: true, message: `Switched to account: ${account}` });
        } else {
            res.status(400).send({ success: false, message: 'Invalid account' });
        }
    } catch (error) {
        console.error("Error switching account:", error);
        res.status(400).send({ success: false, message: 'Error switching account' });
    }
});

app.post('/start-trades', express.json(), (req, res) => {
    const { amount, symbol, duration } = req.body; // Get values from the request body (from client).
    if (!amount || !symbol || !duration) {
        return res.status(400).send({ error: "Missing required parameters." });
    }

    if (!currentAccount) {
        return res.status(400).send({ error: "No account selected." });
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return res.status(500).send({ error: "WebSocket connection not open." });
    }
    try {
        
        currentStake = amount;
	currentStake1 = amount;
        currentAccount = accounts[2].loginid;
        account = accounts[2].loginid;
        tradesStopped = false; // Reset the flag when starting new trades
        
        // Subscribe to ticks for the given symbol
        ws.send(JSON.stringify({
           ticks: symbol,
           subscribe: 1
        }));
        res.send({ message: 'Trade requests sent.' });
    } catch (error) {
        console.error('Error in openSimultaneousTrades:', error);
        res.status(500).send({error: 'Failed to send trade requests.'});
    }
});
app.get('/balance', (req, res) => {
    console.log("Request to /balance received");
    if (!currentAccount) {
        return res.status(400).json({ error: "No account selected." });
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return res.status(500).json({ error: "WebSocket connection not open." });
    }
    ws.send(JSON.stringify({
        balance: 1,
        subscribe: 1,
        account: currentAccount
    }));
    ws.on('message', balanceMessageHandler);
    
    function balanceMessageHandler(event) {
        const response = JSON.parse(event.data)
        if (response.balance){
	    res.json({
		balance: response.balance.balance,
		currency: response.balance.currenct
	    });
	    ws.removeListener('message', balanceMessageHandler);
	} else if (response.error && response.msg_type === 'balance') {
	    console.error("Balance error:", response.error);
	    res.status(500).json({error: response.error.message});
	    ws.removeListener('message', balanceMessageHandler);
	}
    }
});
<<<<<<< HEAD
module.exports.handler = serverless(app);
=======
module.exports.handler = serverless(app);
>>>>>>> 5236044bad09de50356f808895b5a10a1323ef63
