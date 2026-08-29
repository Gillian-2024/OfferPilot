import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractAndParse } from '../../src/utils/jsonExtract.js';

// Minimal Zod-compatible schema for testing (no external deps).
function makeObjectSchema(requiredKeys) {
  return {
    safeParse(obj) {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return { success: false, error: { message: 'not an object', issues: [{ path: [], message: 'expected object' }] } };
      }
      const missing = requiredKeys.filter(k => !(k in obj));
      if (missing.length) {
        return { success: false, error: { message: 'validation failed', issues: missing.map(k => ({ path: [k], message: 'Required field missing' })) } };
      }
      return { success: true, data: obj };
    },
  };
}

const stringSchema = makeObjectSchema(['result']);
const fullSchema = makeObjectSchema(['name', 'age']);
const nestSchema = makeObjectSchema(['nested']);

describe('jsonExtract', () => {
  describe('cleanForJson (via extractAndParse)', () => {
    it('parses clean JSON directly', () => {
      const result = extractAndParse('{"name": "test", "age": 25}', fullSchema);
      assert.strictEqual(result.name, 'test');
      assert.strictEqual(result.age, 25);
    });

    it('strips markdown code fences (with json tag)', () => {
      const result = extractAndParse('```json\n{"result": "ok"}\n```', stringSchema);
      assert.strictEqual(result.result, 'ok');
    });

    it('strips markdown code fences (without lang tag)', () => {
      const result = extractAndParse('```\n{"result": "ok"}\n```', stringSchema);
      assert.strictEqual(result.result, 'ok');
    });

    it('extracts JSON from surrounding text', () => {
      const result = extractAndParse('Here is the data: {"result": "world"} end.', stringSchema);
      assert.strictEqual(result.result, 'world');
    });

    it('removes trailing commas before closing brackets', () => {
      const result = extractAndParse('{"result": "trailing",}', stringSchema);
      assert.strictEqual(result.result, 'trailing');
    });

    it('handles nested objects with trailing comma', () => {
      const deepSchema = makeObjectSchema(['data']);
      const result = extractAndParse('{"data": {"a": 1,},}', deepSchema);
      assert.strictEqual(result.data.a, 1);
    });
  });

  describe('retry logic', () => {
    it('succeeds on first try for well-formed JSON', () => {
      const result = extractAndParse('{"result": "first"}', stringSchema);
      assert.strictEqual(result.result, 'first');
    });

    it('retries with aggressive extraction when first parse fails', () => {
      const result = extractAndParse('Some garbage { "result": "ok" } more garbage here', stringSchema);
      assert.strictEqual(result.result, 'ok');
    });

    it('skips retry for natural language (no JSON delimiters)', () => {
      assert.throws(
        () => extractAndParse('I cannot do that right now. Please provide more info.', stringSchema),
        /尝试/
      );
    });

    it('throws descriptive error when all retries exhausted on malformed JSON', () => {
      assert.throws(
        () => extractAndParse('{"result": "value"', stringSchema), // missing closing brace
        /尝试/
      );
    });
  });

  describe('edge cases', () => {
    it('rejects empty input with specific message', () => {
      assert.throws(
        () => extractAndParse('', stringSchema),
        /空文本/
      );
    });

    it('rejects whitespace-only input', () => {
      assert.throws(
        () => extractAndParse('   \n  ', stringSchema),
        /空文本/
      );
    });

    it('handles deep nesting in surrounding text', () => {
      const result = extractAndParse(
        'Prefix { "nested": { "deep": { "value": 42 } } } Suffix',
        nestSchema
      );
      assert.strictEqual(result.nested.deep.value, 42);
    });
  });

  describe('maxRetries override', () => {
    it('respects maxRetries=0 for single attempt', () => {
      const result = extractAndParse('{"result": "zero"}', stringSchema);
      assert.strictEqual(result.result, 'zero');
    });

    it('works with explicit maxRetries=2', () => {
      const result = extractAndParse('{"result": "two"}', stringSchema, 2);
      assert.strictEqual(result.result, 'two');
    });
  });
});
