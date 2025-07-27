# 🎲 Crash Game Backend MVP

A real-time multiplayer crash game backend built with Node.js, Express, Socket.IO, and SQLite. Players place bets and cash out before the multiplier crashes!

## 🚀 Features

### Core Game Mechanics
- **Real-time Multiplier**: Live multiplier updates every 100ms
- **Provably Fair**: Transparent crash point generation
- **Betting System**: Place bets during betting phase (10 seconds)
- **Cash Out**: Cash out anytime during the game round
- **Auto Cash Out**: Optional automatic cash out at specified multiplier

### User Management
- **User Registration & Authentication**: JWT-based auth system
- **User Profiles**: Comprehensive user statistics and history
- **Balance Management**: Real-time balance updates
- **Password Security**: Bcrypt hashing with salt rounds

### Real-time Features
- **Live Game Updates**: Socket.IO for instant updates
- **Chat System**: Real-time chat during games
- **User Presence**: Track connected users
- **Game History**: Live betting history and results

### Statistics & Analytics
- **Game Statistics**: Round statistics and analytics
- **User Statistics**: Personal betting history and performance
- **Leaderboards**: Daily, weekly, monthly, and all-time rankings
- **Profit/Loss Tracking**: Detailed financial tracking

## 🛠️ Tech Stack

- **Backend**: Node.js + Express.js
- **Real-time**: Socket.IO
- **Database**: SQLite3 (easily replaceable with PostgreSQL/MySQL)
- **Authentication**: JWT + Bcrypt
- **Validation**: Joi + Express Validator
- **Logging**: Winston
- **Security**: Helmet, CORS, Rate Limiting

## 📦 Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd crash-game-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Initialize database**
```bash
npm run migrate
```

5. **Start the server**
```bash
# Development
npm run dev

# Production
npm start
```

## 🎮 Game Flow

### 1. Betting Phase (10 seconds)
- Players can place bets
- Multiple bets per user not allowed in same round
- Minimum and maximum bet limits enforced
- Real-time bet updates to all connected clients

### 2. Game Phase
- Multiplier starts at 1.00x and increases over time
- Players can cash out at any point
- Crash point is predetermined using provably fair algorithm
- Real-time multiplier updates every 100ms

### 3. Crash & Payout
- Game crashes at predetermined point
- Players who cashed out before crash receive their winnings
- Players who didn't cash out lose their bet
- 5-second break before next round starts

## 🔌 API Endpoints

### Authentication
```
POST /api/auth/register    - Register new user
POST /api/auth/login       - User login
GET  /api/auth/me          - Get current user info
POST /api/auth/refresh     - Refresh JWT token
```

### Game
```
GET  /api/game/stats       - Game statistics
GET  /api/game/recent      - Recent game rounds
GET  /api/game/history     - User betting history
GET  /api/game/leaderboard - Leaderboards
```

### User
```
GET  /api/user/profile     - User profile
PUT  /api/user/profile     - Update profile
PUT  /api/user/password    - Change password
GET  /api/user/balance     - Current balance
```

## 🔌 Socket Events

### Client to Server
```javascript
// Authentication (on connection)
socket.auth = { token: 'jwt-token' };

// Place bet
socket.emit('place_bet', { amount: 10.50 });

// Cash out
socket.emit('cash_out');

// Send chat message
socket.emit('chat_message', { message: 'Good luck everyone!' });

// Request game history
socket.emit('get_game_history');
```

### Server to Client
```javascript
// Game state updates
socket.on('game_state', (state) => {
  // Current game state
});

// Round events
socket.on('round_started', (data) => {
  // New round started, betting phase begins
});

socket.on('round_running', (data) => {
  // Game phase started, multiplier increasing
});

socket.on('round_crashed', (data) => {
  // Round ended, show results
});

// Multiplier updates
socket.on('multiplier_update', (data) => {
  // Real-time multiplier updates
});

// Betting events
socket.on('bet_placed', (data) => {
  // Someone placed a bet
});

socket.on('user_cashed_out', (data) => {
  // Someone cashed out
});

// Personal events
socket.on('bet_placed_success', (result) => {
  // Your bet was placed successfully
});

socket.on('cash_out_success', (result) => {
  // You cashed out successfully
});

socket.on('bet_error', (error) => {
  // Betting error occurred
});

// Chat
socket.on('chat_message', (data) => {
  // New chat message
});
```

## 🗄️ Database Schema

### Users Table
```sql
- id (PRIMARY KEY)
- username (UNIQUE)
- email (UNIQUE) 
- password_hash
- balance
- total_wagered
- total_won
- games_played
- created_at
- updated_at
```

### Game Rounds Table
```sql
- id (PRIMARY KEY)
- round_id (UNIQUE)
- crash_point
- start_time
- end_time
- status (waiting, running, crashed)
- created_at
```

### Bets Table
```sql
- id (PRIMARY KEY)
- bet_id (UNIQUE)
- user_id (FOREIGN KEY)
- round_id (FOREIGN KEY)
- bet_amount
- cash_out_at
- cash_out_amount
- profit
- status (active, cashed_out, lost)
- placed_at
- cashed_out_at
```

## ⚙️ Configuration

### Environment Variables
```bash
# Server
PORT=3000
NODE_ENV=development

# Security
JWT_SECRET=your-secret-key

# Database
DATABASE_URL=./data/crash_game.db

# Game Settings
MIN_BET_AMOUNT=1
MAX_BET_AMOUNT=1000
HOUSE_EDGE=0.01
MIN_MULTIPLIER=1.0
MAX_MULTIPLIER=100.0

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Game Configuration
- **Betting Time**: 10 seconds per round
- **Multiplier Update**: Every 100ms
- **House Edge**: Configurable (default 1%)
- **Multiplier Range**: 1.0x to 100.0x
- **Break Between Rounds**: 5 seconds

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: Bcrypt with configurable salt rounds
- **Rate Limiting**: Prevent API abuse
- **Input Validation**: Comprehensive request validation
- **CORS Protection**: Configurable cross-origin requests
- **Helmet Security**: Security headers middleware
- **SQL Injection Prevention**: Parameterized queries

## 📊 Monitoring & Logging

- **Winston Logging**: Structured logging with multiple transports
- **Error Tracking**: Comprehensive error handling and logging
- **Performance Monitoring**: Request timing and performance metrics
- **Game Analytics**: Detailed game statistics and user behavior

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 🚀 Deployment

### Production Checklist
- [ ] Set strong JWT_SECRET
- [ ] Configure production database
- [ ] Set up proper logging
- [ ] Configure rate limiting
- [ ] Set up SSL/TLS
- [ ] Configure CORS origins
- [ ] Set up monitoring
- [ ] Configure backups

### Docker Deployment
```dockerfile
# Dockerfile included for containerized deployment
docker build -t crash-game-backend .
docker run -p 3000:3000 crash-game-backend
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Roadmap

- [ ] Add auto cash-out functionality
- [ ] Implement tournament system
- [ ] Add social features (friends, chat rooms)
- [ ] Mobile app API endpoints
- [ ] Advanced analytics dashboard
- [ ] Multi-currency support
- [ ] Referral system
- [ ] VIP levels and rewards

## 📞 Support

For support, email support@crashgame.com or join our Discord server.

---

**⚠️ Disclaimer**: This is a gambling game implementation. Please ensure compliance with local laws and regulations regarding online gambling in your jurisdiction.