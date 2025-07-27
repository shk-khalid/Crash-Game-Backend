import mongoose from 'mongoose';
import logger from '../utils/logger.js';

export async function initializeDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.error('MONGODB_URI is not defined in environment variables');
    throw new Error('Database connection URI is required');
  } 

  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    logger.info('Database connection established successfully');
  } catch (error) {
    logger.error('Failed to connect to the database', error);
    process.exit(1);
  }
}

/**
 * Get the raw Mongoose connection.
 * Call initializeDatabase() first!
 */

export function getDatabase() {
  if (mongoose.connection.readystate !== 1){
    throw new Error('Database is not connected. Please initialize the database first.');
  }
  return mongoose.connection;
}