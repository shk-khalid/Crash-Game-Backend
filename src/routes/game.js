import express from 'express';
import { allQuery, getQuery } from '../database/connection.js';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get game statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await getQuery(`
      SELECT 
        COUNT(*) as total_rounds,
        AVG(crash_point) as avg_crash_point,
        MIN(crash_point) as min_crash_point,
        MAX(crash_point) as max_crash_point
      FROM game_rounds 
      WHERE status = 'crashed' AND DATE(start_time) = DATE('now')
    `);

    const userStats = await getQuery(`
      SELECT 
        COUNT(*) as total_bets,
        SUM(bet_amount) as total_wagered,
        SUM(CASE WHEN status = 'cashed_out' THEN cash_out_amount ELSE 0 END) as total_won,
        SUM(profit) as total_profit
      FROM bets 
      WHERE user_id = ? AND DATE(placed_at) = DATE('now')
    `, [req.userId]);

    res.json({
      success: true,
      stats: {
        daily: stats,
        user: userStats
      }
    });

  } catch (error) {
    logger.error('Error fetching game stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent games
router.get('/recent', authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    
    const recentGames = await allQuery(`
      SELECT 
        round_id,
        crash_point,
        start_time,
        end_time,
        (SELECT COUNT(*) FROM bets WHERE round_id = gr.round_id) as total_bets,
        (SELECT SUM(bet_amount) FROM bets WHERE round_id = gr.round_id) as total_wagered
      FROM game_rounds gr
      WHERE status = 'crashed'
      ORDER BY start_time DESC
      LIMIT ?
    `, [limit]);

    res.json({
      success: true,
      games: recentGames
    });

  } catch (error) {
    logger.error('Error fetching recent games:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's betting history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const history = await allQuery(`
      SELECT 
        b.bet_id,
        b.round_id,
        b.bet_amount,
        b.cash_out_at,
        b.cash_out_amount,
        b.profit,
        b.status,
        b.placed_at,
        b.cashed_out_at,
        gr.crash_point,
        gr.start_time as round_start_time
      FROM bets b
      JOIN game_rounds gr ON b.round_id = gr.round_id
      WHERE b.user_id = ?
      ORDER BY b.placed_at DESC
      LIMIT ? OFFSET ?
    `, [req.userId, limit, offset]);

    const totalCount = await getQuery(
      'SELECT COUNT(*) as count FROM bets WHERE user_id = ?',
      [req.userId]
    );

    res.json({
      success: true,
      history,
      pagination: {
        total: totalCount.count,
        limit,
        offset,
        hasMore: totalCount.count > offset + limit
      }
    });

  } catch (error) {
    logger.error('Error fetching betting history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get leaderboard
router.get('/leaderboard', authenticateToken, async (req, res) => {
  try {
    const period = req.query.period || 'daily'; // daily, weekly, monthly, all_time
    
    let dateFilter = '';
    switch (period) {
      case 'daily':
        dateFilter = "AND DATE(b.placed_at) = DATE('now')";
        break;
      case 'weekly':
        dateFilter = "AND DATE(b.placed_at) >= DATE('now', '-7 days')";
        break;
      case 'monthly':
        dateFilter = "AND DATE(b.placed_at) >= DATE('now', '-30 days')";
        break;
      default:
        dateFilter = '';
    }

    const leaderboard = await allQuery(`
      SELECT 
        u.username,
        COUNT(b.id) as total_bets,
        SUM(b.bet_amount) as total_wagered,
        SUM(CASE WHEN b.status = 'cashed_out' THEN b.cash_out_amount ELSE 0 END) as total_won,
        SUM(b.profit) as net_profit,
        CASE 
          WHEN SUM(b.bet_amount) > 0 
          THEN ROUND((SUM(CASE WHEN b.status = 'cashed_out' THEN b.cash_out_amount ELSE 0 END) / SUM(b.bet_amount)) * 100, 2)
          ELSE 0 
        END as win_rate
      FROM users u
      JOIN bets b ON u.id = b.user_id
      WHERE 1=1 ${dateFilter}
      GROUP BY u.id, u.username
      HAVING total_bets >= 10
      ORDER BY net_profit DESC
      LIMIT 50
    `);

    res.json({
      success: true,
      leaderboard,
      period
    });

  } catch (error) {
    logger.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;