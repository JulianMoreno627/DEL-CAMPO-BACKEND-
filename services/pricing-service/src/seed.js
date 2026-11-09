import { MarketPrice } from './model/MarketPrice.js';

/**
 * Initial prices: the same illustrative values the project used before the migration
 * (COP per kg or unit). They are NOT official SIPSA data: they are saved with source "DEMO"
 * and only when market_price is empty, so a real source can replace them later.
 */
const DEMO_PRICES = [
  ['papa criolla', 4000, 1300, 'kg'],
  ['arveja', 6500, 2200, 'kg'],
  ['lechuga', 2000, 600, 'unidad'],
  ['cebolla larga', 2800, 900, 'kg'],
  ['mora', 8000, 2800, 'kg'],
  ['tomate de árbol', 5000, 1700, 'kg'],
  ['fresa', 11000, 4000, 'kg'],
  ['zanahoria', 2500, 800, 'kg'],
];

export const demoPrices = () => DEMO_PRICES.map(([product, marketPrice, middlemanPrice, unit]) =>
  new MarketPrice({ product, marketPrice, middlemanPrice, unit, source: 'DEMO' }));
