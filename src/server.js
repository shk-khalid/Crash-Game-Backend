import 'module-alias/register.js'
import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import logger from './utils/logger.js'

import { initializeDatabase } from './database/connection.js'
import authRoutes from './routes/auth.js'
import gameRoutes from './routes/game.js'
import userRoutes from './routes/user.js'
import { GameEngine } from './services/GameEngine.js'
import { SocketHandler } from './services/SocketHandler.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST']
  }
})

// Security
app.use(helmet())
app.use(
  cors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000']
  })
)
app.use(
  rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: 'Too many requests from this IP'
  })
)

// Body parsers
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/health', (req, res) =>
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
)

// API routes
app.use('/api/auth', authRoutes)
app.use('/api/game', gameRoutes)
app.use('/api/user', userRoutes)

// Error handler (last)
app.use(errorHandler)

// Initialize everything
const gameEngine = new GameEngine(io)
const socketHandler = new SocketHandler(io, gameEngine)

async function startServer() {
  try {
    await initializeDatabase()
    logger.info('Database initialized successfully')

    gameEngine.start()
    logger.info('Game engine started')

    socketHandler.initialize()
    logger.info('Socket handlers initialized')

    const PORT = process.env.PORT || 3000
    server.listen(PORT, () =>
      logger.info(`Server running on port ${PORT}`)
    )
  } catch (err) {
    logger.error('Failed to start server:', err)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down')
  gameEngine.stop()
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
})

startServer()