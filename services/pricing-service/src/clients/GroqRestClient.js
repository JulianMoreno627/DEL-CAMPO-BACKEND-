import { ProductRecognizer, LISTING_PROMPT, parseModelJson, RecognizerError } from './ProductRecognizer.js';

/**
 * Groq over REST (OpenAI-compatible chat completions endpoint) with a vision model.
 * It is the fallback when Gemini fails or uses up its free quota. JSON mode is requested and the
 * answer is normalized by ListingSuggestion. The model is configurable (GROQ_MODEL), because Groq
 * changes its vision models often.
 */
export class GroqRestClient extends ProductRecognizer {
  static URL = 'https://api.groq.com/openai/v1/chat/completions';

  /**
   * @param {object} options
   * @param {string} options.apiKey
   * @param {string} [options.model]
   * @param {number} [options.timeoutMs]
   * @param {typeof fetch} [options.fetchFn]
   */
  constructor({ apiKey, model = 'qwen/qwen3.8-27b', timeoutMs = 8000, fetchFn = fetch }) {
    super();
    if (!apiKey) throw new Error('GroqRestClient needs an API key');
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.fetchFn = fetchFn;
  }

  get name() {
    return 'groq';
  }

  async recognize({ content, contentType }) {
    const image = `data:${contentType};base64,${Buffer.from(content).toString('base64')}`;
    const response = await this.fetchFn(GroqRestClient.URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [{ type: 'text', text: LISTING_PROMPT }, { type: 'image_url', image_url: { url: image } }] }],
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new RecognizerError(this.name, response.status, body.error?.message);
    return parseModelJson(body.choices?.[0]?.message?.content);
  }
}
