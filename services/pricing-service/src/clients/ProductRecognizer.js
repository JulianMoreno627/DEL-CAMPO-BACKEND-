import { ListingSuggestion } from '../model/ListingSuggestion.js';

/**
 * AI that recognizes the product in a photo (interface). The assistant depends on this abstraction:
 * Gemini and Groq are interchangeable implementations, both reached over REST.
 */
export class ProductRecognizer {
  /** Short name of the provider (gemini, groq). */
  get name() {
    throw new Error('Abstract recognizer: implement name');
  }

  /**
   * @param {{content: Buffer, contentType: string}} photo
   * @returns {Promise<object>} raw answer of the AI (parsed JSON); ListingSuggestion normalizes it
   */
  async recognize(_photo) {
    throw new Error('Abstract recognizer: implement recognize()');
  }
}

/** Instructions shared by every provider. The visible texts must be in Spanish (Colombia). */
export const LISTING_PROMPT = `Eres el asistente de "Del Campo", una plataforma colombiana donde campesinos venden directamente lo que cultivan.
Mira la foto que tomó un campesino para publicar su producto y propón los datos del anuncio.
Escribe en español de Colombia, con palabras sencillas y cálidas.
- Si la foto NO muestra un producto agrícola (fruta, verdura, tubérculo, grano, hierba, lácteo o similar), pon recognized en false y deja vacíos los demás textos, salvo photoTip.
- product: nombre común del producto como se conoce en Colombia (máximo 40 caracteres), por ejemplo "Papa criolla", "Tomate de árbol".
- category: una de ${ListingSuggestion.CATEGORIES.join(', ')}.
- unit: la unidad en que normalmente se vende ese producto en Colombia, una de ${ListingSuggestion.UNITS.join(', ')}.
- description: 1 o 2 frases honestas y atractivas (máximo 200 caracteres) sobre lo que SE VE en la foto. No inventes datos que no se ven (no digas "orgánico", "recién cosechado" ni el lugar de origen).
- confidence: qué tan seguro estás del producto, de 0 a 1.
- photoTip: un consejo corto si la foto está oscura, borrosa, lejos o no se ve bien el producto; cadena vacía si la foto está bien.
Responde SOLO con un objeto JSON con las claves recognized, product, category, unit, description, confidence, photoTip.`;

/** Parses the JSON text of a model (some wrap it in ```json fences). */
export function parseModelJson(text) {
  const clean = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error('The AI did not answer valid JSON');
  }
}

/** Error of an AI provider, with the HTTP status (429 = free quota used up). */
export class RecognizerError extends Error {
  constructor(provider, status, detail) {
    super(`${provider} answered ${status}: ${String(detail ?? '').slice(0, 200)}`);
    this.name = 'RecognizerError';
    this.status = status;
  }
}
