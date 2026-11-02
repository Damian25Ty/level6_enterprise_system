import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

function App() {
  // Authentication & Panel Display States
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activeUser, setActiveUser] = useState("");
  const [authError, setAuthError] = useState("");

  // Ledger & Banking States
  const [balance, setBalance] = useState(0.00);
  const [targetUser, setTargetUser] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [incomingAlert, setIncomingAlert] = useState("");
  const [socketInstance, setSocketInstance] = useState(null);

  // --- CONNECT WEBSOCKET PIPELINE SECURELY ---
  const connectToRealTimeEngine = (token, name) => {
    // Connect directly to the backend port, injecting the verified token passport
    const socket = io('http://localhost:5000', {
      auth: { token: token }
    });

    socket.on('connect', () => {
      setIsLoggedIn(true);
      setActiveUser(name);
      setSocketInstance(socket);
      setAuthError("");
    });

    // LISTEN: Balance state streams sent down the track straight from Postgres columns
    socket.on('balance state', (liveBalance) => {
      setBalance(parseFloat(liveBalance) || 0.00);
    });

    // LISTEN: Real-time incoming deposit push dispatches
    socket.on('push dispatch', (alertMsg) => {
      setIncomingAlert(alertMsg);
      // Auto clear alert banner after 5 seconds
      setTimeout(() => setIncomingAlert(""), 5000);
    });

    socket.on('alert success', (successMsg) => {
      alert(successMsg);
      setTargetUser("");
      setTransferAmount("");
    });

    socket.on('alert error', (errorMsg) => {
      alert(errorMsg);
    });

    socket.on('connect_error', (err) => {
      alert(`Access Denied: ${err.message}`);
      handleLogout(socket);
    });
  };

  // --- API HANDLERS (HTTP Fetch) ---
  const handleSignup = () => {
    if (!username.trim() || !password.trim()) {
      alert("Please fill out all credentials.");
      return;
    }
    fetch('http://localhost:5000/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: username, password })
    })
    .then(res => res.json().then(data => ({ status: res.status, body: data })))
    .then(result => {
      if (result.status === 201) {
        alert("Account initialized inside PostgreSQL! Please log in.");
        setPassword("");
      } else {
        setAuthError(result.body.error || "Signup failed.");
      }
    });
  };

  const handleLogin = () => {
    fetch('http://localhost:5000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: username, password })
    })
    .then(res => res.json().then(data => ({ status: res.status, body: data })))
    .then(result => {
      if (result.status === 200) {
        // Kick off our secured bi-directional WebSocket railway track connection
        connectToRealTimeEngine(result.body.token, username);
      } else {
        setAuthError(result.body.error || "Invalid username or password.");
      }
    });
  };

  // --- TRANSMIT: TRANSACTION EVENT ---
  const handleExecuteTransfer = () => {
    if (!socketInstance) return;
    socketInstance.emit('submit transaction', {
      targetUser: targetUser.trim(),
      amountStr: transferAmount
    });
  };

  const handleLogout = (activeSock = socketInstance) => {
    if (activeSock) activeSock.disconnect();
    setIsLoggedIn(false);
    setSocketInstance(null);
    setUsername("");
    setPassword("");
    setBalance(0.00);
    setIncomingAlert("");
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif', maxWidth: '450px', margin: '0 auto', textAlign: 'center' }}>
      <h1>🏆 Enterprise Banking Portal</h1>

      {/* ALERT DISPATCH PUSH BANNER */}
      {incomingAlert && (
        <div style={{ background: '#e3f2fd', borderLeft: '5px solid #2196f3', padding: '12px', margin: '15px 0', fontWeight: 'bold', color: '#0d47a1', borderRadius: '4px' }}>
          {incomingAlert}
        </div>
      )}

      {/* 1. AUTH SCREEN VIEW */}
      {!isLoggedIn ? (
        <div style={{ border: '1px solid #ccc', padding: '25px', borderRadius: '8px', background: '#fafafa' }}>
          <h3>Secure Authentication Gate</h3>
          {authError && <p style={{ color: 'red', fontWeight: 'bold' }}>{authError}</p>}
          
          <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: '85%', padding: '10px', marginBottom: '10px', borderRadius: '4px', border: '1px solid #ccc' }} /><br />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '85%', padding: '10px', marginBottom: '20px', borderRadius: '4px', border: '1px solid #ccc' }} /><br />
          
          <button onClick={handleSignup} style={{ width: '43%', padding: '10px', marginRight: '4%', background: '#757575', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Create Profile</button>
          <button onClick={handleLogin} style={{ width: '43%', padding: '10px', background: '#2e7d32', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Secure Log In</button>
        </div>
      ) : (
        // 2. PRIVACY BANKING DASHBOARD VIEW
        <div>
          <div style={{ border: '1px solid #ccc', padding: '25px', borderRadius: '8px', background: '#f4fbf7', marginBottom: '20px' }}>
            <h2 style={{ margin: '0 0 10px 0' }}>Welcome, {activeUser}!</h2>
            <p style={{ color: 'gray', fontSize: '14px', margin: '0' }}>Active Postgres Account Ledger Balance:</p>
            <h3 style={{ fontSize: '55px', margin: '10px 0', color: '#2e7d32' }}>${balance.toFixed(2)}</h3>
            <button onClick={() => handleLogout()} style={{ padding: '8px 15px', background: '#c62828', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Disconnect Session</button>
          </div>

          <div style={{ border: '1px solid #ccc', padding: '25px', borderRadius: '8px', background: '#fdfdfd', textAlign: 'left' }}>
            <h3 style={{ margin: '0 0 15px 0', textAlign: 'center' }}>Execute Instant Asset Transfer</h3>
            
            <label style={{ fontWeight: 'bold', fontSize: '14px' }}>Beneficiary Username:</label>
            <input type="text" placeholder="Recipient user registry name" value={targetUser} onChange={(e) => setTargetUser(e.target.value)} style={{ width: '92%', padding: '10px', margin: '8px 0 15px 0', borderRadius: '4px', border: '1px solid #ccc' }} /><br />
            
            <label style={{ fontWeight: 'bold', fontSize: '14px' }}>Transaction Amount ($):</label>
            <input type="number" placeholder="0.00" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} style={{ width: '92%', padding: '10px', margin: '8px 0 20px 0', borderRadius: '4px', border: '1px solid #ccc' }} /><br />
            
            <button onClick={handleExecuteTransfer} style={{ width: '100%', padding: '12px', background: '#2e7d32', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>Commit Atomic Transfer</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
