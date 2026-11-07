require('dotenv').config(); // MUST BE LINE 1
const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = "enterprise_level_6_secret_key_2026";

// Stable CORS integration for HTTP traffic
app.use(cors({ 
    origin: true,
    credentials: true
}));
app.use(express.json());

// --- PRODUCTION DATABASE INTEGRATION ---
const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:root1234@localhost:5432/postgres';

const sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: process.env.DATABASE_URL ? {
        ssl: {
            require: true,
            rejectUnauthorized: false // Bypasses self-signed certificate blocks on cloud providers
        }
    } : {}
});

// Database Schemas
const User = sequelize.define('User', {
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false }
});

const Account = sequelize.define('Account', {
    balance: { type: DataTypes.FLOAT, defaultValue: 100.00 }
});

User.hasOne(Account, { foreignKey: 'userId', onDelete: 'CASCADE' });
Account.belongsTo(User, { foreignKey: 'userId' });

// Create the unified servers
const server = http.createServer(app);
const io = new Server(server, {
    cors: { 
        origin: true, // Automatically accepts connections from your Vercel link safely
        methods: ["GET", "POST"],
        credentials: true
    }
});

// --- HTTP ROUTE HANDLERS ---
app.post('/api/signup', async (req, res) => {
    try {
        const { name, password } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({ name, password: hashedPassword });
        await Account.create({ userId: user.id });

        res.status(201).json({ message: "Registration successful." });
    } catch (err) {
        res.status(400).json({ error: "Username already exists inside database registry." });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { name, password } = req.body;
        const user = await User.findOne({ where: { name } });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid credentials." });
        }

        const token = jwt.sign({ userId: user.id, name: user.name }, JWT_SECRET, { expiresIn: '1h' });
        res.status(200).json({ token });
    } catch (err) {
        res.status(500).json({ error: "Internal authentication logic crash." });
    }
});

// --- WEBSOCKET LIFECYCLE ---
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Session verification rejected. Passport missing."));
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error("Session expired or tampered with."));
        socket.user = decoded;
        next();
    });
});

const onlineRegistry = {};

io.on('connection', async (socket) => {
    const name = socket.user.name;
    const userId = socket.user.userId;
    onlineRegistry[name] = socket.id;

    try {
        const ledgerRow = await Account.findOne({ where: { userId } });
        socket.emit('balance state', ledgerRow ? ledgerRow.balance : 0.00);
    } catch (e) {
        console.error("Failed fetching connection balance state:", e);
    }

    socket.on('submit transaction', async (payload) => {
        try {
            const { targetUser, amountStr } = payload;
            const amount = parseFloat(amountStr);

            if (isNaN(amount) || amount <= 0 || targetUser === name) {
                return socket.emit('alert error', "Illegal transaction constraints.");
            }

            const senderBalanceRow = await Account.findOne({ where: { userId } });
            const receiverProfile = await User.findOne({ where: { name: targetUser } });

            if (!receiverProfile) return socket.emit('alert error', "Target account not registered.");
            if (senderBalanceRow.balance < amount) return socket.emit('alert error', "Insufficient ledger assets.");

            const receiverBalanceRow = await Account.findOne({ where: { userId: receiverProfile.id } });

            senderBalanceRow.balance -= amount;
            receiverBalanceRow.balance += amount;

            await senderBalanceRow.save();
            await receiverBalanceRow.save();

            socket.emit('balance state', senderBalanceRow.balance);
            socket.emit('alert success', `Transferred $${amount.toFixed(2)} cleanly to ${targetUser}.`);

            const targetSocketId = onlineRegistry[targetUser];
            if (targetSocketId) {
                io.to(targetSocketId).emit('balance state', receiverBalanceRow.balance);
                io.to(targetSocketId).emit('push dispatch', `💰 You received $${amount.toFixed(2)} from ${name}!`);
            }
        } catch (err) {
            socket.emit('alert error', "Database relational write execution failure.");
        }
    });

    socket.on('disconnect', () => { delete onlineRegistry[name]; });
});

// Explicit startup initialization handler with connection logs
async function startServer() {
    try {
        await sequelize.authenticate(); // Verify link to cloud PostgreSQL
        console.log('⚡ Connected securely to cloud PostgreSQL infrastructure.');
        
        await sequelize.sync(); // Build tables cleanly
        
        server.listen(PORT, () => {
            console.log(`💎 Cloud cluster server running cleanly on port ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed initializing server cluster engine:', error);
        process.exit(1); // Safely exit if database credentials fail
    }
}

startServer();
