import { test } from 'vitest';
import { OpenAI } from 'openai';

test('Direct API Test - Check model response format', async () => {
  const openai = new OpenAI({
    baseURL: 'http://127.0.0.1:3000/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
  });

  console.log('=== Testing direct API call to new-api ===');

  const response = await openai.chat.completions.create({
    model: 'MiniMax-M2.1',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that responds in JSON format.',
      },
      {
        role: 'user',
        content: 'Return a JSON object with fields: elementId, description, method, arguments (as array), and twoStep (boolean).',
      },
    ],
    response_format: { type: 'json_object' },
  });

  console.log('=== Full Response ===');
  console.log(JSON.stringify(response, null, 2));

  console.log('\n=== Message Content ===');
  console.log(response.choices[0]?.message?.content);

  // Try to parse the JSON
  const content = response.choices[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(content);
    console.log('\n=== Parsed JSON ===');
    console.log(JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.error('Failed to parse JSON:', e);
  }
}, 30000);
