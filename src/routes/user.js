import express from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import { runQuery, getQuery } from '../database/connection.js';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await getQuery(`
      SELECT 
        id, username, email, balance, 
        total_wagered, total_won, games_played, 
        created_at
      FROM users 
      WHERE id = ?
    `, [req.userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get additional stats
    const stats = await getQuery(`
      SELECT 
        COUNT(*) as total_bets,
        COUNT(CASE WHEN status = 'cashed_out' THEN 1 END) as successful_cashouts,
        MAX(cash_out_at) as best_multiplier,
        MAX(profit) as biggest_win,
        MIN(profit) as biggest_loss
      FROM bets 
      WHERE user_id = ?
    `, [req.userId]);

    res.json({
      success: true,
      user: {
        ...user,
        stats: stats || {}
      }
    });

  } catch (error) {
    logger.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, [
  body('email').optional().isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    const updates = [];
    const values = [];

    if (email) {
      // Check if email is already taken by another user
      const existingUser = await getQuery(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, req.userId]
      );

      if (existingUser) {
        return res.status(400).json({ error: 'Email already taken' });
      }

      updates.push('email = ?');
      values.push(email);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(new Date().toISOString());
    updates.push('updated_at = ?');
    values.push(req.userId);

    await runQuery(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    logger.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password
router.put('/password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    // Get current password hash
    const user = await getQuery(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await runQuery(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [newPasswordHash, new Date().toISOString(), req.userId]
    );

    logger.info(`Password changed for user ${req.userId}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    logger.error('Error changing password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user balance
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const user = await getQuery(
      'SELECT balance FROM users WHERE id = ?',
      [req.userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      balance: user.balance
    });

  } catch (error) {
    logger.error('Error fetching user balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;