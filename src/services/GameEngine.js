import { v4 as uuidv4 } from 'uuid';
import { runQuery, getQuery, allQuery } from '../database/connection.js';
import logger from '../utils/logger.js';

export class GameEngine {
  constructor(io) {
    this.io = io;
    this.currentRound = null;
    this.gameState = 'waiting'; // waiting, betting, running, crashed
    this.multiplier = 1.0;
    this.crashPoint = 0;
    this.startTime = null;
    this.bettingTimer = null;
    this.gameTimer = null;
    this.activeBets = new Map();
    
    // Game configuration
    this.BETTING_TIME = 10000; // 10 seconds
    this.MULTIPLIER_INCREMENT = 0.01;
    this.UPDATE_INTERVAL = 100; // 100ms
    this.MIN_MULTIPLIER = 1.0;
    this.MAX_MULTIPLIER = parseFloat(process.env.MAX_MULTIPLIER) || 100.0;
    this.HOUSE_EDGE = parseFloat(process.env.HOUSE_EDGE) || 0.01;
  }

  start() {
    logger.info('Game engine starting...');
    this.startNewRound();
  }

  stop() {
    logger.info('Game engine stopping...');
    if (this.bettingTimer) clearTimeout(this.bettingTimer);
    if (this.gameTimer) clearInterval(this.gameTimer);
  }

  async startNewRound() {
    try {
      // Generate new round
      const roundId = uuidv4();
      this.crashPoint = this.generateCrashPoint();
      this.currentRound = roundId;
      this.gameState = 'betting';
      this.multiplier = 1.0;
      this.activeBets.clear();

      // Save round to database
      await runQuery(
        'INSERT INTO game_rounds (round_id, crash_point, start_time, status) VALUES (?, ?, ?, ?)',
        [roundId, this.crashPoint, new Date().toISOString(), 'waiting']
      );

      logger.info(`New round started: ${roundId}, crash point: ${this.crashPoint}`);

      // Broadcast new round to all clients
      this.io.emit('round_started', {
        roundId,
        bettingTime: this.BETTING_TIME,
        timestamp: Date.now()
      });

      // Start betting countdown
      this.bettingTimer = setTimeout(() => {
        this.startGameRound();
      }, this.BETTING_TIME);

    } catch (error) {
      logger.error('Error starting new round:', error);
      setTimeout(() => this.startNewRound(), 5000);
    }
  }

  async startGameRound() {
    try {
      this.gameState = 'running';
      this.startTime = Date.now();
      
      // Update round status in database
      await runQuery(
        'UPDATE game_rounds SET status = ? WHERE round_id = ?',
        ['running', this.currentRound]
      );

      this.io.emit('round_running', {
        roundId: this.currentRound,
        timestamp: this.startTime
      });

      // Start multiplier updates
      this.gameTimer = setInterval(() => {
        this.updateMultiplier();
      }, this.UPDATE_INTERVAL);

    } catch (error) {
      logger.error('Error starting game round:', error);
    }
  }

  updateMultiplier() {
    if (this.gameState !== 'running') return;

    const elapsed = Date.now() - this.startTime;
    this.multiplier = 1 + (elapsed / 1000) * 0.1; // Adjust growth rate as needed

    // Check if crash point reached
    if (this.multiplier >= this.crashPoint) {
      this.crashGame();
      return;
    }

    // Broadcast multiplier update
    this.io.emit('multiplier_update', {
      roundId: this.currentRound,
      multiplier: parseFloat(this.multiplier.toFixed(2)),
      timestamp: Date.now()
    });
  }

  async crashGame() {
    try {
      this.gameState = 'crashed';
      clearInterval(this.gameTimer);

      // Update round status
      await runQuery(
        'UPDATE game_rounds SET status = ?, end_time = ? WHERE round_id = ?',
        ['crashed', new Date().toISOString(), this.currentRound]
      );

      // Process all active bets
      await this.processActiveBets();

      // Broadcast crash
      this.io.emit('round_crashed', {
        roundId: this.currentRound,
        crashPoint: this.crashPoint,
        timestamp: Date.now()
      });

      logger.info(`Round ${this.currentRound} crashed at ${this.crashPoint}x`);

      // Wait 5 seconds before starting new round
      setTimeout(() => {
        this.startNewRound();
      }, 5000);

    } catch (error) {
      logger.error('Error crashing game:', error);
    }
  }

  async placeBet(userId, amount, socketId) {
    try {
      if (this.gameState !== 'betting') {
        throw new Error('Betting is not active');
      }

      if (amount < parseFloat(process.env.MIN_BET_AMOUNT) || 
          amount > parseFloat(process.env.MAX_BET_AMOUNT)) {
        throw new Error('Invalid bet amount');
      }

      // Check if user already has a bet in this round
      if (this.activeBets.has(userId)) {
        throw new Error('You already have a bet in this round');
      }

      // Check user balance
      const user = await getQuery('SELECT balance FROM users WHERE id = ?', [userId]);
      if (!user || user.balance < amount) {
        throw new Error('Insufficient balance');
      }

      // Deduct balance and create bet
      const betId = uuidv4();
      
      await runQuery('BEGIN TRANSACTION');
      
      await runQuery(
        'UPDATE users SET balance = balance - ? WHERE id = ?',
        [amount, userId]
      );

      await runQuery(
        'INSERT INTO bets (bet_id, user_id, round_id, bet_amount, status) VALUES (?, ?, ?, ?, ?)',
        [betId, userId, this.currentRound, amount, 'active']
      );

      await runQuery('COMMIT');

      // Add to active bets
      this.activeBets.set(userId, {
        betId,
        amount,
        socketId,
        cashedOut: false
      });

      // Broadcast bet placed
      this.io.emit('bet_placed', {
        userId,
        betId,
        amount,
        roundId: this.currentRound
      });

      return { success: true, betId };

    } catch (error) {
      await runQuery('ROLLBACK');
      throw error;
    }
  }

  async cashOut(userId, socketId) {
    try {
      if (this.gameState !== 'running') {
        throw new Error('Cannot cash out now');
      }

      const bet = this.activeBets.get(userId);
      if (!bet || bet.cashedOut) {
        throw new Error('No active bet found');
      }

      const cashOutMultiplier = this.multiplier;
      const cashOutAmount = bet.amount * cashOutMultiplier;
      const profit = cashOutAmount - bet.amount;

      // Mark as cashed out
      bet.cashedOut = true;
      bet.cashOutMultiplier = cashOutMultiplier;
      bet.cashOutAmount = cashOutAmount;

      await runQuery('BEGIN TRANSACTION');

      // Update user balance
      await runQuery(
        'UPDATE users SET balance = balance + ?, total_won = total_won + ? WHERE id = ?',
        [cashOutAmount, profit, userId]
      );

      // Update bet record
      await runQuery(
        'UPDATE bets SET status = ?, cash_out_at = ?, cash_out_amount = ?, profit = ?, cashed_out_at = ? WHERE bet_id = ?',
        ['cashed_out', cashOutMultiplier, cashOutAmount, profit, new Date().toISOString(), bet.betId]
      );

      await runQuery('COMMIT');

      // Broadcast cash out
      this.io.emit('user_cashed_out', {
        userId,
        betId: bet.betId,
        multiplier: cashOutMultiplier,
        amount: cashOutAmount,
        profit,
        roundId: this.currentRound
      });

      return { 
        success: true, 
        multiplier: cashOutMultiplier,
        amount: cashOutAmount,
        profit 
      };

    } catch (error) {
      await runQuery('ROLLBACK');
      throw error;
    }
  }

  async processActiveBets() {
    try {
      await runQuery('BEGIN TRANSACTION');

      for (const [userId, bet] of this.activeBets) {
        if (!bet.cashedOut) {
          // Mark bet as lost
          await runQuery(
            'UPDATE bets SET status = ?, profit = ? WHERE bet_id = ?',
            ['lost', -bet.amount, bet.betId]
          );
        }
      }

      await runQuery('COMMIT');
    } catch (error) {
      await runQuery('ROLLBACK');
      logger.error('Error processing active bets:', error);
    }
  }

  generateCrashPoint() {
    // Use provably fair algorithm to generate crash point
    // This is a simplified version - in production, use cryptographic randomness
    const houseEdge = this.HOUSE_EDGE;
    const random = Math.random();
    
    // Calculate crash point with house edge
    const crashPoint = Math.max(
      this.MIN_MULTIPLIER,
      Math.min(
        this.MAX_MULTIPLIER,
        (1 / (1 - random * (1 - houseEdge)))
      )
    );

    return parseFloat(crashPoint.toFixed(2));
  }

  getCurrentGameState() {
    return {
      roundId: this.currentRound,
      state: this.gameState,
      multiplier: parseFloat(this.multiplier.toFixed(2)),
      crashPoint: this.gameState === 'crashed' ? this.crashPoint : null,
      activeBets: Array.from(this.activeBets.entries()).map(([userId, bet]) => ({
        userId,
        amount: bet.amount,
        cashedOut: bet.cashedOut,
        cashOutMultiplier: bet.cashOutMultiplier
      }))
    };
  }
}