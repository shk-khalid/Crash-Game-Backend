import crypto from 'crypto';

/**
 * Generate a provably fair crash point using SHA256
 * @param {string} seed - Random seed for the round
 * @param {number} roundNumber - Current round number
 * @returns {number} Crash point between 1.0 and 13.0
 */
export function generateCrashPoint(seed, roundNumber) {
  try {
    const input = `${seed}-${roundNumber}`;
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    
    // Use first 6 characters of hash for randomness
    const randomValue = parseInt(hash.slice(0, 6), 16);
    
    // Generate crash point between 1.0 and 13.0
    const maxCrashPoint = parseFloat(process.env.MAX_CRASH_POINT) || 13.0;
    const crashPoint = (randomValue % (maxCrashPoint * 10 - 10)) / 10 + 1.0;
    
    // Round to 2 decimal places
    return Math.round(crashPoint * 100) / 100;
  } catch (error) {
    console.error('Error generating crash point:', error);
    return 2.0; // Fallback crash point
  }
}

/**
 * Generate a random seed for a game round
 * @returns {string} Random seed
 */
export function generateSeed() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify crash point using seed and round number
 * @param {string} seed - The seed used
 * @param {number} roundNumber - Round number
 * @param {number} crashPoint - Claimed crash point
 * @returns {boolean} True if crash point is valid
 */
export function verifyCrashPoint(seed, roundNumber, crashPoint) {
  const calculatedCrashPoint = generateCrashPoint(seed, roundNumber);
  return Math.abs(calculatedCrashPoint - crashPoint) < 0.01;
}