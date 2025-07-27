import mongoose from "mongoose";

const betSchema = new mongoose.Schema({
    player: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
        required: true,
    },
    usd: {
        type: Number,
        required: true,
        min: 0.01,
    },
    cryptoAmount: {
        type: Number,
        required: true,
        min: 0,
    },
    currency: {
        type: String,
        enum: ['BTC', 'ETH'],
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    }
});

const cashoutSchema = new mongoose.Schema({
    player: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
        required: true,
    },
    payout: {
        type: Number,
        required: true,
        min: 0.01,
    },
    multiplier: {
        type: Number,
        required: true,
        min: 1.0,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

const gameRoundSchema = new mongoose.Schema({
    roundNumber: {
        type: Number,
        required: true,
        unique: true,
        index: true,
    },
    crashPoint: {
        type: Number,
        required: true,
        min: 1.0,
    },
    seed: {
        type: String,
        required: true,
    },
    startTime: {
        type: Date,
        default: Date.now,
    },
    endTime: {
        type: Date,
    },
    status: {
        type: String,
        enum: ['waiting', 'active', 'crashed', 'completed'],
        default: 'waiting',
    },
    bets: [betSchema],
    cashouts: [cashoutSchema],
    finalMultiplier: {
        type: Number,
        default: 1.0,
    },
}, { 
    timestamps: true,
});

// Calculate total bet amount for the round
gameRoundSchema.methods.getTotalBetAmount = function() {
  return this.bets.reduce((total, bet) => total + bet.usd, 0);
};

// Get round duration in milliseconds
gameRoundSchema.methods.getDuration = function() {
  if (!this.endTime) return null;
  return this.endTime.getTime() - this.startTime.getTime();
};

// Check if betting is still allowed (within first 5 seconds)
gameRoundSchema.methods.isBettingAllowed = function() {
  if (this.status !== 'active') return false;
  const timeSinceStart = Date.now() - this.startTime.getTime();
  return timeSinceStart <= 5000; // 5 seconds betting window
};

// Add a bet to the round
gameRoundSchema.methods.addBet = function(playerId, usd, cryptoAmt, currency) {
  this.bets.push({
    player: playerId,
    usd,
    cryptoAmt,
    currency,
    timestamp: new Date()
  });
  return this;
};

// Add a cashout to the round
gameRoundSchema.methods.addCashout = function(playerId, payout, multiplier) {
  this.cashouts.push({
    player: playerId,
    payout,
    multiplier,
    timestamp: new Date()
  });
  return this;
};

export default mongoose.model('GameRound', gameRoundSchema);