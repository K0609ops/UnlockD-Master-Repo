const login = async () => {
    const res = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'demo@finverse.app', password: 'password123' })
    });
    
    // We need to get the set-cookie header for the refresh_token
    const setCookie = res.headers.get('set-cookie');
    
    // Actually, login also returns the access_token in the body
    const body = await res.json();
    const token = body.access_token;
    
    const stateRes = await fetch('http://localhost:8000/finance/state', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const state = await stateRes.json();
    console.log("User:", JSON.stringify(state.users[0], null, 2));
    console.log("Account:", JSON.stringify(state.accounts[0], null, 2));
    console.log("Transaction:", JSON.stringify(state.transactions[0], null, 2));
}
login();
