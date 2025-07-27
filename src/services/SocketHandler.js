import jwt from 'jsonwebtoken';
import { getQuery } from '../database/connection.js';
import logger from '../utils/logger.js';

export class SocketHandler {
  constructor(io, gameEngine) {
    this.io = io;
    this.gameEngine = gameEngine;
    this.connectedUsers = new Map();
  }

  initialize() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await getQuery('SELECT id, username FROM users WHERE id = ?', [decoded.userId]);
        
        if (!user) {
          return next(new Error('User not found'));
        }

        socket.userId = user.id;
        socket.username = user.username;
        next();
      } catch (error) {
        logger.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });

    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  handleConnection(socket) {
    const userId = socket.userId;
    const username = socket.username;

    logger.info(`User connected: ${username} (${userId})`);

    // Store connection
    this.connectedUsers.set(userId, {
      socketId: socket.id,
      username,
      connectedAt: Date.now()
    });

    // Send current game state
    socket.emit('game_state', this.gameEngine.getCurrentGameState());

    // Handle place bet
    socket.on('place_bet', async (data) => {
      try {
        const { amount } = data;
        const result = await this.gameEngine.placeBet(userId, amount, socket.id);
        socket.emit('bet_placed_success', result);
      } catch (error) {
        socket.emit('bet_error', { error: error.message });
      }
    });

    // Handle cash out
    socket.on('cash_out', async () => {
      try {
        const result = await this.gameEngine.cashOut(userId, socket.id);
        socket.emit('cash_out_success', result);
      } catch (error) {
        socket.emit('cash_out_error', { error: error.message });
      }
    });

    // Handle chat messages
    socket.on('chat_message', (data) => {
      const { message } = data;
      if (message && message.trim().length > 0 && message.length <= 500) {
        this.io.emit('chat_message', {
          userId,
          username,
          message: message.trim(),
          timestamp: Date.now()
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${username} (${userId})`);
      this.connectedUsers.delete(userId);
    });

    // Handle request for game history
    socket.on('get_game_history', async () => {
      try {
        const history = await this.getGameHistory(userId);
        socket.emit('game_history', history);
      } catch (error) {
        socket.emit('error', { error: 'Failed to load game history' });
      }
    });
  }

  async getGameHistory(userId, limit = 50) {
    try {
      const history = await allQuery(`
        SELECT 
          gr.round_id,
          gr.crash_point,
          gr.start_time,
          gr.end_time,
          b.bet_amount,
          b.cash_out_at,
          b.cash_out_amount,
          b.profit,
          b.status
        FROM game_rounds gr
        LEFT JOIN bets b ON gr.round_id = b.round_id AND b.user_id = ?
        WHERE gr.status = 'crashed'
        ORDER BY gr.start_time DESC
        LIMIT ?
      `, [userId, limit]);

      return history;
    } catch (error) {
      logger.error('Error fetching game history:', error);
      throw error;
    }
  }

  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  getConnectedUsers() {
    return Array.from(this.connectedUsers.values());
  }
}