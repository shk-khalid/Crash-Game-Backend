import express from 'express';
import Player from '../models/Player.js';
import Transaction from '../models/Transaction.js';
import priceFetcher from '../utils/priceFetcher.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/user - Create a new player
 */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    // Check if player with this name already exists
    const existingPlayer = await Player.findOne({ name: name.trim() });
    if (existingPlayer) {
      return res.status(409).json({ error: 'Player with this name already exists' });
    }

    // Create new player with default wallet balances
    const player = new Player({
      name: name.trim(),
      wallet: {
        BTC: 0.01, // Starting balance: 0.01 BTC
        ETH: 0.1   // Starting balance: 0.1 ETH
      }
    });

    await player.save();

    // Get current prices for USD conversion
    const prices = await priceFetcher.getPrices();
    const usdValue = await player.getWalletUSDValue(prices);

    logger.info(`Created new player: ${player.name} (${player._id})`);

    res.status(201).json({
      success: true,
      player: {
        id: player._id,
        name: player.name,
        wallet: player.wallet,
        usdValue: usdValue.toFixed(2),
        totalWins: player.totalWins,
        totalLosses: player.totalLosses,
        createdAt: player.createdAt
      }
    });

  } catch (error) {
    logger.error('Failed to create player:', error);
    res.status(500).json({ error: 'Failed to create player' });
  }
});

/**
 * GET /api/user/:id - Get player details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const player = await Player.findById(id);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Get current prices for USD conversion
    const prices = await priceFetcher.getPrices();
    const usdValue = await player.getWalletUSDValue(prices);

    res.json({
      success: true,
      player: {
        id: player._id,
        name: player.name,
        wallet: player.wallet,
        usdValue: usdValue.toFixed(2),
        totalWins: player.totalWins,
        totalLosses: player.totalLosses,
        createdAt: player.createdAt,
        lastActive: player.lastActive
      }
    });

  } catch (error) {
    logger.error('Failed to get player:', error);
    res.status(500).json({ error: 'Failed to get player details' });
  }
});

/**
 * GET /api/user/:id/wallet - Get player wallet with USD values
 */
router.get('/:id/wallet', async (req, res) => {
  try {
    const { id } = req.params;

    const player = await Player.findById(id);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Get current prices
    const prices = await priceFetcher.getPrices();
    
    // Calculate USD values for each currency
    const walletWithUSD = {
      BTC: {
        amount: player.wallet.BTC,
        price: prices.BTC,
        usdValue: (player.wallet.BTC * prices.BTC).toFixed(2)
      },
      ETH: {
        amount: player.wallet.ETH,
        price: prices.ETH,
        usdValue: (player.wallet.ETH * prices.ETH).toFixed(2)
      }
    };

    const totalUSDValue = await player.getWalletUSDValue(prices);

    res.json({
      success: true,
      playerId: player._id,
      playerName: player.name,
      wallet: walletWithUSD,
      totalUSDValue: totalUSDValue.toFixed(2),
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get wallet:', error);
    res.status(500).json({ error: 'Failed to get wallet details' });
  }
});

/**
 * GET /api/user/:id/transactions - Get player transaction history
 */
router.get('/:id/transactions', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0, type } = req.query;

    const player = await Player.findById(id);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Build query
    const query = { player: id };
    if (type && ['bet', 'cashout'].includes(type)) {
      query.type = type;
    }

    // Get transactions with pagination
    const transactions = await Transaction.find(query)
      .populate('round', 'roundNumber crashPoint')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await Transaction.countDocuments(query);

    res.json({
      success: true,
      playerId: id,
      transactions: transactions.map(tx => ({
        id: tx._id,
        txHash: tx.txHash,
        type: tx.type,
        usd: tx.usd,
        cryptoAmt: tx.cryptoAmt,
        currency: tx.currency,
        priceAtTime: tx.priceAtTime,
        multiplier: tx.multiplier,
        timestamp: tx.timestamp,
        round: tx.round ? {
          roundNumber: tx.round.roundNumber,
          crashPoint: tx.round.crashPoint
        } : null,
        profit: tx.getProfit()
      })),
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      }
    });

  } catch (error) {
    logger.error('Failed to get transactions:', error);
    res.status(500).json({ error: 'Failed to get transaction history' });
  }
});

/**
 * GET /api/user - List all players (for testing)
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const players = await Player.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .select('name wallet totalWins totalLosses createdAt lastActive');

    const total = await Player.countDocuments();

    // Get current prices for USD conversion
    const prices = await priceFetcher.getPrices();

    const playersWithUSD = await Promise.all(
      players.map(async (player) => {
        const usdValue = await player.getWalletUSDValue(prices);
        return {
          id: player._id,
          name: player.name,
          wallet: player.wallet,
          usdValue: usdValue.toFixed(2),
          totalWins: player.totalWins,
          totalLosses: player.totalLosses,
          createdAt: player.createdAt,
          lastActive: player.lastActive
        };
      })
    );

    res.json({
      success: true,
      players: playersWithUSD,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      }
    });

  } catch (error) {
    logger.error('Failed to list players:', error);
    res.status(500).json({ error: 'Failed to list players' });
  }
});

export default router;