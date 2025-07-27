import express from 'express';
import logger from '../utils/logger.js';

const router = express.Router();

// Placeholder auth routes - can be expanded later
router.post('/login', (req, res) => {
  logger.info('Login attempt - auth system not implemented');
  res.status(501).json({ 
    error: 'Authentication system not implemented in MVP',
    message: 'Use direct player creation via /api/user endpoint'
  });
});

router.post('/register', (req, res) => {
  logger.info('Register attempt - auth system not implemented');
  res.status(501).json({ 
    error: 'Authentication system not implemented in MVP',
    message: 'Use direct player creation via /api/user endpoint'
  });
});

router.post('/logout', (req, res) => {
  logger.info('Logout attempt - auth system not implemented');
  res.status(501).json({ 
    error: 'Authentication system not implemented in MVP',
    message: 'No session management in MVP'
  });
});

export default router;