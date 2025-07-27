# Crypto Crash Game MVP Backend

A real-time multiplayer crypto crash game backend built with Node.js, Express, MongoDB, and Socket.IO.

## Features

- **Real-time multiplayer gameplay** using WebSockets
- **Provably fair crash points** using SHA256 algorithm
- **Crypto wallet system** with BTC and ETH support
- **Live price feeds** from CoinGecko API (cached for 10 seconds)
- **RESTful API** for game operations
- **Database persistence** with MongoDB
- **Transaction history** and player statistics

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: MongoDB + Mongoose
- **Real-time**: Socket.IO
- **External APIs**: CoinGecko for crypto prices
- **Security**: Helmet, CORS, Rate limiting

<!-- ## Project Structure

```
crypto-crash/
├── models/
│   ├── Player.js          # Player model with wallet
│   ├── GameRound.js       # Game round with bets and cashouts
│   └── Transaction.js     # Transaction history
├── services/
│   ├── GameEngine.js      # Core game logic and round management
│   └── SocketHandler.js   # WebSocket event handling
├── routes/
│   ├── auth.js           # Authentication endpoints (placeholder)
│   ├── user.js           # Player management
│   └── game.js           # Game operations
├── utils/
│   ├── crashPoint.js     # Provably fair crash point generation
│   ├── priceFetcher.js   # CoinGecko API wrapper with caching
│   └── logger.js         # Logging utility
├── middleware/
│   └── errorHandler.js   # Global error handling
├── database/
│   └── connection.js     # MongoDB connection setup
├── scripts/
│   └── seed.js           # Database seeding script
├── server.js             # Main server file
├── .env                  # Environment configuration 
└── README.md
```
-->
## Installation & Setup

### 1. Prerequisites

- Node.js (v18 or higher)
- MongoDB (running locally or MongoDB Atlas)
- npm or yarn package manager

### 2. Clone and Install

```bash
git clone <repository-url>
cd crypto-crash
npm install
```

### 3. Environment Configuration

Copy the `.env` file and configure your settings:

```bash
cp .env .env.local
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/crypto-crash-game

# Security
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Game Settings
GAME_ROUND_DURATION_MS=10000
MULTIPLIER_TICK_MS=100
MAX_CRASH_POINT=13.0

# External APIs
COINGECKO_API_URL=https://api.coingecko.com/api/v3
PRICE_CACHE_DURATION_MS=10000
```

### 4. Database Setup

Make sure MongoDB is running, then seed the database with test data:

```bash
npm run seed
```

### 5. Start the Server

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### User Management

#### Create Player
```bash
curl -X POST http://localhost:3000/api/user \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Player"}'
```

#### Get Player Details
```bash
curl http://localhost:3000/api/user/{playerId}
```

#### Get Player Wallet
```bash
curl http://localhost:3000/api/user/{playerId}/wallet
```

#### List All Players
```bash
curl http://localhost:3000/api/user
```

### Game Operations

#### Place Bet
```bash
curl -X POST http://localhost:3000/api/game/bet \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "player_id_here",
    "usdAmount": 10.50,
    "currency": "BTC"
  }'
```

#### Cash Out
```bash
curl -X POST http://localhost:3000/api/game/cashout \
  -H "Content-Type: application/json" \
  -d '{"playerId": "player_id_here"}'
```

#### Get Game Status
```bash
curl http://localhost:3000/api/game/status
```

#### Get Round History
```bash
curl http://localhost:3000/api/game/rounds?limit=10&offset=0
```

#### Get Specific Round
```bash
curl http://localhost:3000/api/game/rounds/{roundNumber}
```

## WebSocket Events

### Client → Server Events

#### Authenticate
```javascript
socket.emit('authenticate', {
  playerId: 'player_id_here',
  playerName: 'Player Name'
});
```

#### Place Bet
```javascript
socket.emit('place_bet', {
  usdAmount: 10.50,
  currency: 'BTC'
});
```

#### Cash Out
```javascript
socket.emit('cashout_request', {});
```

#### Get Game State
```javascript
socket.emit('get_game_state');
```

### Server → Client Events

#### Game Events
- `round_start` - New round begins
- `multiplier_update` - Multiplier updates (every second)
- `round_end` - Round ends with crash point
- `bet_placed` - Player places bet
- `player_cashout` - Player cashes out

#### Response Events
- `authenticated` - Authentication successful
- `bet_placed_success` / `bet_placed_error` - Bet placement result
- `cashout_success` / `cashout_error` - Cashout result
- `game_state` - Current game state
- `error` - General error messages

### Example WebSocket Usage

```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3000');

// Authenticate
socket.emit('authenticate', {
  playerId: 'your_player_id',
  playerName: 'Your Name'
});

// Listen for game events
socket.on('round_start', (data) => {
  console.log('New round started:', data);
});

socket.on('multiplier_update', (data) => {
  console.log('Multiplier:', data.multiplier);
});

socket.on('round_end', (data) => {
  console.log('Round ended at:', data.crashPoint);
});

// Place a bet
socket.emit('place_bet', {
  usdAmount: 5.00,
  currency: 'BTC'
});

// Cash out
socket.emit('cashout_request', {});
```

## Game Logic

### Crash Point Algorithm

The crash point is generated using a provably fair algorithm:

```javascript
function generateCrashPoint(seed, roundNumber) {
  const input = `${seed}-${roundNumber}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  const randomValue = parseInt(hash.slice(0, 6), 16);
  const crashPoint = (randomValue % 120) / 10 + 1.0;
  return Math.round(crashPoint * 100) / 100;
}
```

### Game Flow

1. **Round Start**: Every 10 seconds, a new round begins
2. **Betting Window**: Players have 5 seconds to place bets
3. **Multiplier Growth**: Multiplier increases by 0.01 every 100ms
4. **Crash**: When multiplier reaches the predetermined crash point, round ends
5. **Payouts**: Players who cashed out before crash receive payouts
6. **Next Round**: After 3-second break, next round starts

### Price Caching

Crypto prices are fetched from CoinGecko and cached for 10 seconds to:
- Reduce API calls
- Ensure consistent pricing during rapid transactions
- Provide fallback prices if API is unavailable

## Testing

### Manual Testing

1. **Start the server**: `npm run dev`
2. **Seed test data**: `npm run seed`
3. **Test API endpoints** using curl or Postman
4. **Connect WebSocket client** to test real-time features

### Test Scenarios

1. **Create players and place bets**
2. **Test cashout at different multipliers**
3. **Verify wallet balances update correctly**
4. **Test error handling** (insufficient funds, betting after window closes)
5. **Monitor real-time events** during game rounds

## Development Notes

### Key Components

- **GameEngine**: Manages round lifecycle, multiplier updates, and game state
- **SocketHandler**: Handles WebSocket connections and real-time events
- **PriceFetcher**: Manages crypto price caching and API calls
- **Models**: MongoDB schemas for players, rounds, and transactions

### Security Features

- Rate limiting on API endpoints
- Input validation and sanitization
- CORS configuration
- Helmet for security headers
- Error handling without exposing sensitive data

### Scalability Considerations

- Database indexing on frequently queried fields
- Connection pooling for MongoDB
- Efficient WebSocket event handling
- Price caching to reduce external API calls

## Troubleshooting

### Common Issues

1. **Database connection fails**
   - Check MongoDB is running
   - Verify MONGODB_URI in .env

2. **WebSocket connections fail**
   - Check CORS_ORIGINS configuration
   - Verify client connects to correct port

3. **Price fetching fails**
   - Check internet connection
   - CoinGecko API might be rate limited
   - Fallback prices will be used

4. **Game rounds not starting**
   - Check server logs for errors
   - Verify game engine initialization

### Logs

The application uses a custom logger that outputs to console with timestamps and log levels. Check server logs for detailed error information.

## License

MIT License - see LICENSE file for details