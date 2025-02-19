// Connect to your server using WebSocket
const ws = new WebSocket('ws://localhost:3000');

// DOM elements
const balanceElement = document.getElementById('balance');
const accountListElement = document.getElementById('account-list');

// WebSocket event handlers
ws.onopen = () => {
    console.log('Connected to server');
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Received data:', data); // Debugging: Log received data

    if (data.authorize) {
        // Authentication successful
        console.log('Authentication successful');

        // Fetch account list
        ws.send(JSON.stringify({
            account_list: 1
        }));
    } else if (data.account_list) {
        // Render account buttons
        const accounts = data.account_list;
        accountListElement.innerHTML = '<p>Select Account:</p>';

        accounts.forEach(account => {
            const button = document.createElement('button');
            button.textContent = account.loginid;
            button.addEventListener('click', () => {
                switchAccount(account.loginid);
            });
            accountListElement.appendChild(button);
        });

        // Fetch balance for the first account
        if (accounts.length > 0) {
            fetchBalance(accounts[0].loginid);
        }
    } else if (data.balance) {
        // Update balance
        balanceElement.textContent = `${data.balance.balance} ${data.balance.currency}`;
    } else if (data.error) {
        console.error('Deriv API Error:', data.error);
        balanceElement.textContent = "Error fetching balance.";
    }
};

ws.onerror = (error) => {
    console.error('WebSocket error:', error);
};

ws.onclose = () => {
    console.log('WebSocket connection closed');
};

// Function to fetch balance for a specific account
const fetchBalance = (accountId) => {
    ws.send(JSON.stringify({
        balance: 1,
        account: accountId
    }));
};

// Function to switch accounts
const switchAccount = (accountId) => {
    fetchBalance(accountId);
};