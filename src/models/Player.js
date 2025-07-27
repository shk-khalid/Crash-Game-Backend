import mongoose from "mongoose";

const playerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    wallet: {
        BTC: {
            type: Number,
            default: 0.01,
            min: 0,
        },
        ETH: {
            type: Number,
            default: 0.1,
            min: 0,
        }
    },
    totalWins: {
        type: Number,
        default: 0,

    },
    totalLosses: {
        type: Number,
        default: 0,
    },
    createdAt:{
        type: Date,
        default: Date.now,
    },
    lastActive: {
        type: Date,
        default: Date.now,
    }
}, {
    timestamps: true,
});

// update lastActive before every save
playerSchema.pre('save', function (next) {
    this.lastActive = new Date();
    next();
})

// calculate total usd value of wallet
playerSchema.methods.getWalletUSDValue = async function (prices) {
    const btcValue = this.wallet.BTC * (prices.BTC || 0);
    const ethValue = this.wallet.ETH * (prices.ETH || 0);
    return btcValue + ethValue;
}

// check if player has enough balance for a bet
playerSchema.methods.hasSufficientBalance = function (amount, currency) {
    return this.wallet[currency] >= amount;
}

// deduct balance after a bet
playerSchema.methods.deductFromWallet = function (amount, currency) {
    if (!this.hasSufficientBalance(amount, currency)) {
        throw new Error(`Insufficient ${currency} balance`);
    }
    this.wallet[currency] -= amount;
    return this;
}

// add winnings to wallet
playerSchema.methods.addToWallet = function(amount, currency) {
    if (!this.wallet[currency]) {
        throw new Error(`Invalid currency: ${currency}`);
    }
    this.wallet[currency] += amount;
    return this;
}

export default mongoose.model('Player', playerSchema);