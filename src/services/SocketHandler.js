import logger from '../utils/logger.js';

export class SocketHandler {
  constructor(io, gameEngine) {
    this.io = io;
    this.gameEngine = gameEngine;
    this.connectedPlayers = new Map();
  }

  /**
   * Initialize socket event handlers
   */
  initialize() {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Handle player authentication/identification
      socket.on('authenticate', (data) => {
        this.handleAuthentication(socket, data);
      });

      // Handle bet placement
      socket.on('place_bet', (data) => {
        this.handlePlaceBet(socket, data);
      });

      // Handle cashout request
      socket.on('cashout_request', (data) => {
        this.handleCashoutRequest(socket, data);
      });

      // Handle game state request
      socket.on('get_game_state', () => {
        this.handleGameStateRequest(socket);
      });

      // Handle player wallet request
      socket.on('get_wallet', (data) => {
        this.handleWalletRequest(socket, data);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnection(socket);
      });

      // Send current game state on connection
      this.sendGameState(socket);
    });

    logger.info('Socket handlers initialized');
  }

  /**
   * Handle player authentication
   */
  handleAuthentication(socket, data) {
    try {
      const { playerId, playerName } = data;
      
      if (!playerId) {
        socket.emit('error', { message: 'Player ID is required' });
        return;
      }

      // Store player info for this socket
      this.connectedPlayers.set(socket.id, { playerId, playerName });
      socket.playerId = playerId;
      socket.playerName = playerName;

      socket.emit('authenticated', { 
        success: true, 
        playerId, 
        playerName 
      });

      logger.info(`Player authenticated: ${playerName} (${playerId})`);

    } catch (error) {
      logger.error('Authentication error:', error);
      socket.emit('error', { message: 'Authentication failed' });
    }
  }

  /**
   * Handle bet placement through socket
   */
  async handlePlaceBet(socket, data) {
    try {
      if (!socket.playerId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { usdAmount, currency } = data;

      if (!usdAmount || !currency) {
        socket.emit('error', { message: 'USD amount and currency are required' });
        return;
      }

      const result = await this.gameEngine.placeBet(socket.playerId, usdAmount, currency);
      
      socket.emit('bet_placed_success', {
        ...result,
        roundNumber: this.gameEngine.roundNumber
      });

    } catch (error) {
      logger.error('Socket bet placement error:', error);
      socket.emit('bet_placed_error', { message: error.message });
    }
  }

  /**
   * Handle cashout request through socket
   */
  async handleCashoutRequest(socket, data) {
    try {
      if (!socket.playerId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const result = await this.gameEngine.cashOut(socket.playerId);
      
      socket.emit('cashout_success', {
        ...result,
        roundNumber: this.gameEngine.roundNumber
      });

    } catch (error) {
      logger.error('Socket cashout error:', error);
      socket.emit('cashout_error', { message: error.message });
    }
  }

  /**
   * Handle game state request
   */
  handleGameStateRequest(socket) {
    this.sendGameState(socket);
  }

  /**
   * Handle wallet request
   */
  async handleWalletRequest(socket, data) {
    try {
      const { playerId } = data;
      
      if (!playerId) {
        socket.emit('error', { message: 'Player ID is required' });
        return;
      }

      // This would typically fetch from database and calculate USD values
      // For now, just emit a placeholder response
      socket.emit('wallet_data', {
        playerId,
        wallet: { BTC: 0, ETH: 0 },
        usdValue: 0
      });

    } catch (error) {
      logger.error('Wallet request error:', error);
      socket.emit('error', { message: 'Failed to get wallet data' });
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnection(socket) {
    const playerInfo = this.connectedPlayers.get(socket.id);
    
    if (playerInfo) {
      logger.info(`Player disconnected: ${playerInfo.playerName} (${playerInfo.playerId})`);
      this.connectedPlayers.delete(socket.id);
    } else {
      logger.info(`Client disconnected: ${socket.id}`);
    }
  }

  /**
   * Send current game state to a socket
   */
  sendGameState(socket) {
    const gameState = this.gameEngine.getCurrentState();
    socket.emit('game_state', gameState);
  }

  /**
   * Broadcast game state to all connected clients
   */
  broadcastGameState() {
    const gameState = this.gameEngine.getCurrentState();
    this.io.emit('game_state', gameState);
  }

  /**
   * Get connected players count
   */
  getConnectedPlayersCount() {
    return this.connectedPlayers.size;
  }

  /**
   * Get list of connected players
   */
  getConnectedPlayersList() {
    return Array.from(this.connectedPlayers.values());
  }
}