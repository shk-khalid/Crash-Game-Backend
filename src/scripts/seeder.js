import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase } from '../database/connection.js';
import Player from '../models/Player.js';
import logger from '../utils/logger.js';

/**
 * Seed the database with test players
 */
async function seedDatabase() {
  try {
    await initializeDatabase();
    logger.info('Connected to database for seeding');

    // Clear existing players (optional - remove this in production)
    await Player.deleteMany({});
    logger.info('Cleared existing players');

    // Create test players
    const testPlayers = [
      {
        name: 'Alice Crypto',
        wallet: {
          BTC: 0.05,  // 0.05 BTC
          ETH: 0.5    // 0.5 ETH
        }
      },
      {
        name: 'Bob Trader',
        wallet: {
          BTC: 0.02,  // 0.02 BTC
          ETH: 0.3    // 0.3 ETH
        }
      },
      {
        name: 'Charlie Whale',
        wallet: {
          BTC: 0.1,   // 0.1 BTC
          ETH: 1.0    // 1.0 ETH
        }
      }
    ];

    const players = await Player.insertMany(testPlayers);
    logger.info('Created test players:');
    
    players.forEach(player => {
      logger.info(`- ${player.name} (${player._id})`);
      logger.info(`  BTC: ${player.wallet.BTC}, ETH: ${player.wallet.ETH}`);
    });

    logger.info('Database seeding completed successfully');
    process.exit(0);

  } catch (error) {
    logger.error('Failed to seed database:', error);
    process.exit(1);
  }
}

// Run seeding
seedDatabase();