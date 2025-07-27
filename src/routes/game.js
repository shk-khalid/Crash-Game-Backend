import express from 'express';
import Player from '../models/Player.js';
import GameRound from '../models/GameRound.js';
import Transaction from '../models/Transaction.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/game/bet - Place a bet
 * Body: { playerId, usdAmount, currency }
 */
router.post('/bet', async (req, res) => {
  try {
    const { playerId, usdAmount, currency } = req.body;

    // Validate input
    if (!playerId || !usdAmount || !currency) {
      return res.status(400).json({ 
        error: 'Missing required fields: playerId, usdAmount, currency' 
      });
    }

    if (typeof usdAmount !== 'number' || usdAmount <= 0) {
      return res.status(400).json({ 
        error: 'USD amount must be a positive number' 
      });
    }

    if (!['BTC', 'ETH'].includes(currency)) {
      return res.status(400).json({ 
        error: 'Currency must be BTC or ETH' 
      });
    }

    // Verify player exists
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Get the game engine from the app (passed via middleware or global)
    const gameEngine = req.app.locals.gameEngine;
    if (!gameEngine) {
      return res.status(500).json({ error: 'Game engine not available' });
    }

    // Place the bet through game engine
    const result = await gameEngine.placeBet(playerId, usdAmount, currency);

    logger.info(`REST API bet placed: Player ${player.name} bet $${usdAmount} ${currency}`);

    res.json({
      success: true,
      message: 'Bet placed successfully',
      ...result
    });

  } catch (error) {
    logger.error('Failed to place bet via REST API:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to place bet' 
    });
  }
});

/**
 * POST /api/game/cashout - Cash out current bet
 * Body: { playerId }
 */
router.post('/cashout', async (req, res) => {
  try {
    const { playerId } = req.body;

    if (!playerId) {
      return res.status(400).json({ 
        error: 'Player ID is required' 
      });
    }

    // Verify player exists
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Get the game engine from the app
    const gameEngine = req.app.locals.gameEngine;
    if (!gameEngine) {
      return res.status(500).json({ error: 'Game engine not available' });
    }

    // Cash out through game engine
    const result = await gameEngine.cashOut(playerId);

    logger.info(`REST API cashout: Player ${player.name} cashed out at ${result.multiplier}x`);

    res.json({
      success: true,
      message: 'Cashed out successfully',
      ...result
    });

  } catch (error) {
    logger.error('Failed to cash out via REST API:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to cash out' 
    });
  }
});

/**
 * GET /api/game/status - Get current game status
 */
router.get('/status', (req, res) => {
  try {
    const gameEngine = req.app.locals.gameEngine;
    if (!gameEngine) {
      return res.status(500).json({ error: 'Game engine not available' });
    }

    const gameState = gameEngine.getCurrentState();
    
    res.json({
      success: true,
      gameState
    });

  } catch (error) {
    logger.error('Failed to get game status:', error);
    res.status(500).json({ error: 'Failed to get game status' });
  }
});

/**
 * GET /api/game/rounds - Get recent game rounds
 */
router.get('/rounds', async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;

    const rounds = await GameRound.find()
      .sort({ roundNumber: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .populate('bets.player', 'name')
      .populate('cashouts.player', 'name');

    const total = await GameRound.countDocuments();

    const roundsData = rounds.map(round => ({
      roundNumber: round.roundNumber,
      crashPoint: round.crashPoint,
      finalMultiplier: round.finalMultiplier,
      status: round.status,
      startTime: round.startTime,
      endTime: round.endTime,
      duration: round.getDuration(),
      totalBetAmount: round.getTotalBetAmount(),
      betsCount: round.bets.length,
      cashoutsCount: round.cashouts.length,
      bets: round.bets.map(bet => ({
        player: bet.player.name,
        usd: bet.usd,
        currency: bet.currency,
        cryptoAmt: bet.cryptoAmt
      })),
      cashouts: round.cashouts.map(cashout => ({
        player: cashout.player.name,
        payout: cashout.payout,
        multiplier: cashout.multiplier
      }))
    }));

    res.json({
      success: true,
      rounds: roundsData,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      }
    });

  } catch (error) {
    logger.error('Failed to get rounds:', error);
    res.status(500).json({ error: 'Failed to get round history' });
  }
});

/**
 * GET /api/game/rounds/:roundNumber - Get specific round details
 */
router.get('/rounds/:roundNumber', async (req, res) => {
  try {
    const { roundNumber } = req.params;

    const round = await GameRound.findOne({ roundNumber: parseInt(roundNumber) })
      .populate('bets.player', 'name wallet')
      .populate('cashouts.player', 'name wallet');

    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    const roundData = {
      roundNumber: round.roundNumber,
      crashPoint: round.crashPoint,
      finalMultiplier: round.finalMultiplier,
      status: round.status,
      startTime: round.startTime,
      endTime: round.endTime,
      duration: round.getDuration(),
      totalBetAmount: round.getTotalBetAmount(),
      seed: round.seed,
      bets: round.bets.map(bet => ({
        player: {
          id: bet.player._id,
          name: bet.player.name
        },
        usd: bet.usd,
        currency: bet.currency,
        cryptoAmt: bet.cryptoAmt,
        timestamp: bet.timestamp
      })),
      cashouts: round.cashouts.map(cashout => ({
        player: {
          id: cashout.player._id,
          name: cashout.player.name
        },
        payout: cashout.payout,
        multiplier: cashout.multiplier,
        timestamp: cashout.timestamp
      }))
    };

    res.json({
      success: true,
      round: roundData
    });

  } catch (error) {
    logger.error('Failed to get round details:', error);
    res.status(500).json({ error: 'Failed to get round details' });
  }
});

export default router;