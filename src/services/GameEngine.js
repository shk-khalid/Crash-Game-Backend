import { generateCrashPoint, generateSeed } from '../utils/crashPoint.js';
import GameRound from '../models/GameRound.js';
import Player from '../models/Player.js';
import Transaction from '../models/Transaction.js';
import priceFetcher from '../utils/priceFetcher.js';
import logger from '../utils/logger.js';

export class GameEngine {
  constructor(io) {
    this.io = io;
    this.currentRound = null;
    this.roundNumber = 0;
    this.isRunning = false;
    this.gameTimer = null;
    this.multiplierTimer = null;
    this.currentMultiplier = 1.0;
    
    // Game configuration
    this.roundDuration = parseInt(process.env.GAME_ROUND_DURATION_MS) || 10000; // 10 seconds
    this.multiplierTick = parseInt(process.env.MULTIPLIER_TICK_MS) || 100; // 100ms
    this.multiplierIncrement = 0.01;
    this.bettingWindow = 5000; // 5 seconds for betting after round starts
  }

  /**
   * Start the game engine
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Game engine is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting game engine...');
    
    // Get the latest round number from database
    try {
      const latestRound = await GameRound.findOne().sort({ roundNumber: -1 });
      this.roundNumber = latestRound ? latestRound.roundNumber : 0;
      logger.info(`Resuming from round number: ${this.roundNumber}`);
    } catch (error) {
      logger.error('Failed to get latest round number:', error);
      this.roundNumber = 0;
    }

    // Start first round immediately
    this.startNewRound();
  }

  /**
   * Stop the game engine
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    logger.info('Stopping game engine...');

    if (this.gameTimer) {
      clearTimeout(this.gameTimer);
      this.gameTimer = null;
    }

    if (this.multiplierTimer) {
      clearInterval(this.multiplierTimer);
      this.multiplierTimer = null;
    }

    // End current round if active
    if (this.currentRound && this.currentRound.status === 'active') {
      this.endRound();
    }
  }

  /**
   * Start a new game round
   */
  async startNewRound() {
    if (!this.isRunning) return;

    try {
      this.roundNumber++;
      const seed = generateSeed();
      const crashPoint = generateCrashPoint(seed, this.roundNumber);

      // Create new round in database
      this.currentRound = new GameRound({
        roundNumber: this.roundNumber,
        crashPoint,
        seed,
        startTime: new Date(),
        status: 'active'
      });

      await this.currentRound.save();
      logger.info(`Started round ${this.roundNumber} with crash point ${crashPoint}`);

      // Reset multiplier
      this.currentMultiplier = 1.0;

      // Broadcast round start
      this.io.emit('round_start', {
        roundNumber: this.roundNumber,
        startTime: this.currentRound.startTime,
        bettingWindow: this.bettingWindow
      });

      // Start multiplier ticker
      this.startMultiplierTicker();

      // Schedule round end
      this.gameTimer = setTimeout(() => {
        this.endRound();
      }, this.roundDuration);

    } catch (error) {
      logger.error('Failed to start new round:', error);
      // Try to start another round after a delay
      setTimeout(() => this.startNewRound(), 5000);
    }
  }

  /**
   * Start the multiplier ticker
   */
  startMultiplierTicker() {
    this.multiplierTimer = setInterval(() => {
      if (!this.currentRound || this.currentRound.status !== 'active') {
        clearInterval(this.multiplierTimer);
        return;
      }

      // Check if we've reached the crash point
      if (this.currentMultiplier >= this.currentRound.crashPoint) {
        this.endRound();
        return;
      }

      // Increment multiplier
      this.currentMultiplier += this.multiplierIncrement;
      this.currentMultiplier = Math.round(this.currentMultiplier * 100) / 100;

      // Broadcast multiplier update every second (10 ticks)
      if (Math.round(this.currentMultiplier * 100) % 100 === 0) {
        this.io.emit('multiplier_update', {
          roundNumber: this.roundNumber,
          multiplier: this.currentMultiplier,
          crashPoint: this.currentRound.crashPoint
        });
      }

    }, this.multiplierTick);
  }

  /**
   * End the current round
   */
  async endRound() {
    if (!this.currentRound || this.currentRound.status !== 'active') return;

    try {
      // Stop timers
      if (this.gameTimer) {
        clearTimeout(this.gameTimer);
        this.gameTimer = null;
      }
      if (this.multiplierTimer) {
        clearInterval(this.multiplierTimer);
        this.multiplierTimer = null;
      }

      // Update round status
      this.currentRound.status = 'completed';
      this.currentRound.endTime = new Date();
      this.currentRound.finalMultiplier = this.currentMultiplier;
      await this.currentRound.save();

      logger.info(`Round ${this.roundNumber} ended at multiplier ${this.currentMultiplier}x (crash point: ${this.currentRound.crashPoint}x)`);

      // Broadcast round end
      this.io.emit('round_end', {
        roundNumber: this.roundNumber,
        crashPoint: this.currentRound.crashPoint,
        finalMultiplier: this.currentMultiplier,
        endTime: this.currentRound.endTime,
        totalBets: this.currentRound.bets.length,
        totalCashouts: this.currentRound.cashouts.length
      });

      // Schedule next round
      if (this.isRunning) {
        setTimeout(() => this.startNewRound(), 3000); // 3 second break between rounds
      }

    } catch (error) {
      logger.error('Failed to end round:', error);
    }
  }

  /**
   * Place a bet for a player
   */
  async placeBet(playerId, usdAmount, currency) {
    if (!this.currentRound) {
      throw new Error('No active round');
    }

    if (!this.currentRound.isBettingAllowed()) {
      throw new Error('Betting window has closed for this round');
    }

    // Validate inputs
    if (usdAmount < 0.01) {
      throw new Error('Minimum bet is $0.01');
    }

    if (!['BTC', 'ETH'].includes(currency)) {
      throw new Error('Invalid currency. Must be BTC or ETH');
    }

    try {
      // Get player and current prices
      const [player, currentPrice] = await Promise.all([
        Player.findById(playerId),
        priceFetcher.getPrice(currency)
      ]);

      if (!player) {
        throw new Error('Player not found');
      }

      // Convert USD to crypto amount
      const cryptoAmount = usdAmount / currentPrice;

      // Check if player has sufficient balance
      if (!player.hasSufficientBalance(cryptoAmount, currency)) {
        throw new Error(`Insufficient ${currency} balance`);
      }

      // Deduct from player's wallet
      player.deductFromWallet(cryptoAmount, currency);
      await player.save();

      // Add bet to round
      this.currentRound.addBet(playerId, usdAmount, cryptoAmount, currency);
      await this.currentRound.save();

      // Create transaction record
      const transaction = Transaction.createBet(
        playerId,
        this.currentRound._id,
        usdAmount,
        cryptoAmount,
        currency,
        currentPrice
      );
      await transaction.save();

      logger.info(`Player ${playerId} bet $${usdAmount} (${cryptoAmount} ${currency}) on round ${this.roundNumber}`);

      // Broadcast bet placed
      this.io.emit('bet_placed', {
        roundNumber: this.roundNumber,
        playerId,
        playerName: player.name,
        usdAmount,
        cryptoAmount,
        currency,
        timestamp: new Date()
      });

      return {
        success: true,
        transactionId: transaction.txHash,
        cryptoAmount,
        currentPrice,
        remainingBalance: player.wallet[currency]
      };

    } catch (error) {
      logger.error('Failed to place bet:', error);
      throw error;
    }
  }

  /**
   * Cash out a player's bet
   */
  async cashOut(playerId) {
    if (!this.currentRound || this.currentRound.status !== 'active') {
      throw new Error('No active round or round has ended');
    }

    if (this.currentMultiplier >= this.currentRound.crashPoint) {
      throw new Error('Round has crashed, cannot cash out');
    }

    try {
      // Find player's bet in current round
      const playerBet = this.currentRound.bets.find(
        bet => bet.player.toString() === playerId.toString()
      );

      if (!playerBet) {
        throw new Error('No bet found for this round');
      }

      // Check if already cashed out
      const existingCashout = this.currentRound.cashouts.find(
        cashout => cashout.player.toString() === playerId.toString()
      );

      if (existingCashout) {
        throw new Error('Already cashed out for this round');
      }

      // Calculate payout
      const cryptoPayout = playerBet.cryptoAmt * this.currentMultiplier;
      const currentPrice = await priceFetcher.getPrice(playerBet.currency);
      const usdPayout = cryptoPayout * currentPrice;

      // Get player and update wallet
      const player = await Player.findById(playerId);
      if (!player) {
        throw new Error('Player not found');
      }

      player.addToWallet(cryptoPayout, playerBet.currency);
      player.totalWins += 1;
      await player.save();

      // Add cashout to round
      this.currentRound.addCashout(playerId, usdPayout, this.currentMultiplier);
      await this.currentRound.save();

      // Create transaction record
      const transaction = Transaction.createCashout(
        playerId,
        this.currentRound._id,
        usdPayout,
        cryptoPayout,
        playerBet.currency,
        currentPrice,
        this.currentMultiplier
      );
      await transaction.save();

      logger.info(`Player ${playerId} cashed out at ${this.currentMultiplier}x for $${usdPayout.toFixed(2)}`);

      // Broadcast cashout
      this.io.emit('player_cashout', {
        roundNumber: this.roundNumber,
        playerId,
        playerName: player.name,
        multiplier: this.currentMultiplier,
        usdPayout: usdPayout.toFixed(2),
        cryptoPayout,
        currency: playerBet.currency,
        timestamp: new Date()
      });

      return {
        success: true,
        transactionId: transaction.txHash,
        multiplier: this.currentMultiplier,
        usdPayout,
        cryptoPayout,
        currency: playerBet.currency,
        newBalance: player.wallet[playerBet.currency]
      };

    } catch (error) {
      logger.error('Failed to cash out:', error);
      throw error;
    }
  }

  /**
   * Get current game state
   */
  getCurrentState() {
    return {
      roundNumber: this.roundNumber,
      currentRound: this.currentRound ? {
        roundNumber: this.currentRound.roundNumber,
        status: this.currentRound.status,
        startTime: this.currentRound.startTime,
        currentMultiplier: this.currentMultiplier,
        betsCount: this.currentRound.bets.length,
        cashoutsCount: this.currentRound.cashouts.length,
        bettingAllowed: this.currentRound.isBettingAllowed()
      } : null,
      isRunning: this.isRunning
    };
  }
}