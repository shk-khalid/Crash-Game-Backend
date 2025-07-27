import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const transactionSchema = new mongoose.Schema({
    player: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
        required: true,
        index: true,
    },
    round: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GameRound',
        required: true,
        index: true,
    },
    usd: {
    type: Number,
    required: true,
    min: 0
  },
  cryptoAmt: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    enum: ['BTC', 'ETH']
  },
  type: {
    type: String,
    required: true,
    enum: ['bet', 'cashout'],
    index: true
  },
  txHash: {
    type: String,
    required: true,
    unique: true,
    default: () => uuidv4()
  },
  priceAtTime: {
    type: Number,
    required: true,
    min: 0
  },
  multiplier: {
    type: Number,
    min: 1.0
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Create compound indexes for efficient queries
transactionSchema.index({ player: 1, timestamp: -1 });
transactionSchema.index({ round: 1, type: 1 });
transactionSchema.index({ type: 1, timestamp: -1 });

// Static method to create a bet transaction
transactionSchema.statics.createBet = function(playerId, roundId, usd, cryptoAmt, currency, priceAtTime) {
  return new this({
    player: playerId,
    round: roundId,
    usd,
    cryptoAmt,
    currency,
    type: 'bet',
    priceAtTime
  });
};

// Static method to create a cashout transaction
transactionSchema.statics.createCashout = function(playerId, roundId, usd, cryptoAmt, currency, priceAtTime, multiplier) {
  return new this({
    player: playerId,
    round: roundId,
    usd,
    cryptoAmt,
    currency,
    type: 'cashout',
    priceAtTime,
    multiplier
  });
};

// Calculate profit/loss for this transaction
transactionSchema.methods.getProfit = function() {
  if (this.type === 'bet') return -this.usd;
  if (this.type === 'cashout') return this.usd - (this.usd / this.multiplier);
  return 0;
};

export default mongoose.model('Transaction', transactionSchema);