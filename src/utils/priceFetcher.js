import axios from 'axios';
import logger from './logger.js';

class PriceFetcher {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = parseInt(process.env.PRICE_CACHE_DURATION_MS) || 10000; // 10 seconds
    this.apiUrl = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
    
    // Fallback prices in case API fails
    this.fallbackPrices = {
      BTC: 45000,
      ETH: 2500
    };
  }

  /**
   * Get current crypto prices with caching
   * @returns {Promise<Object>} Prices object with BTC and ETH
   */
  async getPrices() {
    const cacheKey = 'crypto_prices';
    const cached = this.cache.get(cacheKey);
    
    // Return cached prices if still valid
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      logger.debug('Returning cached prices');
      return cached.data;
    }

    try {
      logger.debug('Fetching fresh prices from CoinGecko');
      const response = await axios.get(`${this.apiUrl}/simple/price`, {
        params: {
          ids: 'bitcoin,ethereum',
          vs_currencies: 'usd'
        },
        timeout: 5000
      });

      const prices = {
        BTC: response.data.bitcoin?.usd || this.fallbackPrices.BTC,
        ETH: response.data.ethereum?.usd || this.fallbackPrices.ETH
      };

      // Cache the prices
      this.cache.set(cacheKey, {
        data: prices,
        timestamp: Date.now()
      });

      logger.info('Updated crypto prices:', prices);
      return prices;

    } catch (error) {
      logger.warn('Failed to fetch prices from CoinGecko, using fallback or cached:', error.message);
      
      // Return cached data even if expired, or fallback prices
      if (cached) {
        return cached.data;
      }
      
      return this.fallbackPrices;
    }
  }

  /**
   * Get price for a specific currency
   * @param {string} currency - BTC or ETH
   * @returns {Promise<number>} Price in USD
   */
  async getPrice(currency) {
    const prices = await this.getPrices();
    return prices[currency] || this.fallbackPrices[currency];
  }

  /**
   * Convert USD to crypto amount
   * @param {number} usdAmount - Amount in USD
   * @param {string} currency - BTC or ETH
   * @returns {Promise<number>} Crypto amount
   */
  async usdToCrypto(usdAmount, currency) {
    const price = await this.getPrice(currency);
    return usdAmount / price;
  }

  /**
   * Convert crypto amount to USD
   * @param {number} cryptoAmount - Amount in crypto
   * @param {string} currency - BTC or ETH
   * @returns {Promise<number>} USD amount
   */
  async cryptoToUsd(cryptoAmount, currency) {
    const price = await this.getPrice(currency);
    return cryptoAmount * price;
  }

  /**
   * Clear price cache (useful for testing)
   */
  clearCache() {
    this.cache.clear();
    logger.debug('Price cache cleared');
  }
}

// Export singleton instance
const priceFetcher = new PriceFetcher();
export default priceFetcher;