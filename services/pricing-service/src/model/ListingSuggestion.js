/**
 * Listing suggested by the AI from a photo. The answer of a language model is never trusted as is:
 * it is normalized to the values the platform accepts (the same units as the product editor of the
 * frontend, known categories, length limits of the fields).
 */
export class ListingSuggestion {
  static UNITS = Object.freeze(['kg', 'libra', 'unidad', 'docena', 'bulto', 'canastilla', 'atado']);
  static CATEGORIES = Object.freeze(['tubers', 'vegetables', 'fruits', 'grains', 'herbs', 'dairy', 'other']);
  static MAX_PRODUCT = 60;
  static MAX_DESCRIPTION = 300;
  static MAX_PHOTO_TIP = 160;

  /**
   * @param {object} raw answer of the AI (already parsed JSON)
   * @param {string} provider which AI answered
   */
  constructor(raw, provider) {
    const data = raw && typeof raw === 'object' ? raw : {};
    const product = clean(data.product, ListingSuggestion.MAX_PRODUCT);
    this.recognized = data.recognized !== false && product.length > 0;
    this.product = this.recognized ? capitalize(product) : '';
    this.category = this.recognized && ListingSuggestion.CATEGORIES.includes(data.category) ? data.category : 'other';
    this.unit = ListingSuggestion.UNITS.includes(data.unit) ? data.unit : 'kg';
    this.description = this.recognized ? clean(data.description, ListingSuggestion.MAX_DESCRIPTION) : '';
    const confidence = Number(data.confidence);
    this.confidence = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0;
    this.photoTip = clean(data.photoTip, ListingSuggestion.MAX_PHOTO_TIP);
    this.provider = provider;
  }
}

/** Plain text on one line, cut at a word boundary (ending in "…") when it is longer than max. */
function clean(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

const capitalize = (text) => text.charAt(0).toLocaleUpperCase('es-CO') + text.slice(1);
