import { ProductRecognizer, LISTING_PROMPT, parseModelJson, RecognizerError } from './ProductRecognizer.js';
import { ListingSuggestion } from '../model/ListingSuggestion.js';

/**
 * Google Gemini over REST (generateContent of the Generative Language API).
 * A JSON schema is sent (responseSchema), so the model can only answer the expected fields.
 * The model is configurable (GEMINI_MODEL): the "-latest" aliases keep working when Google retires
 * a version (gemini-2.5-* is no longer offered to new accounts).
 */
export class GeminiRestClient extends ProductRecognizer {
  static BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

  /**
   * @param {object} options
   * @param {string} options.apiKey
   * @param {string} [options.model]
   * @param {number} [options.timeoutMs]
   * @param {typeof fetch} [options.fetchFn]
   */
  constructor({ apiKey, model = 'gemini-flash-lite-latest', timeoutMs = 8000, fetchFn = fetch }) {
    super();
    if (!apiKey) throw new Error('GeminiRestClient needs an API key');
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.fetchFn = fetchFn;
  }

  get name() {
    return 'gemini';
  }

  async recognize({ content, contentType }) {
    const response = await this.fetchFn(`${GeminiRestClient.BASE_URL}/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        contents: [{ parts: [{ text: LISTING_PROMPT }, { inline_data: { mime_type: contentType, data: Buffer.from(content).toString('base64') } }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new RecognizerError(this.name, response.status, body.error?.message);
    return parseModelJson(body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join(''));
  }
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  required: ['recognized', 'product', 'category', 'unit', 'description', 'confidence', 'photoTip'],
  properties: {
    recognized: { type: 'BOOLEAN' },
    product: { type: 'STRING' },
    category: { type: 'STRING', enum: [...ListingSuggestion.CATEGORIES] },
    unit: { type: 'STRING', enum: [...ListingSuggestion.UNITS] },
    description: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
    photoTip: { type: 'STRING' },
  },
};
