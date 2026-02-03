/**
 * Generate large test fixtures for performance testing
 * Run with: node generate-fixtures.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generate a large session with 1000+ messages
function generateLargeSession() {
  const sessionPath = path.join(__dirname, 'large-session.jsonl');
  const stream = fs.createWriteStream(sessionPath);

  // Write summary
  stream.write(JSON.stringify({
    type: 'summary',
    summary: 'Large Session with 1000+ Messages',
    leafUuid: 'large-session-uuid'
  }) + '\n');

  const messageCount = 1000;
  const startTime = new Date('2026-01-01T00:00:00.000Z').getTime();

  for (let i = 0; i < messageCount; i++) {
    const timestamp = new Date(startTime + i * 60000).toISOString();

    // User message
    stream.write(JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: `User message ${i + 1}: This is a test message for performance testing. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`
      },
      uuid: `msg-user-${i}`,
      timestamp,
      sessionId: 'large-session-123',
      cwd: '/test/project'
    }) + '\n');

    // Assistant message
    stream.write(JSON.stringify({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: `Assistant response ${i + 1}: This is a detailed response to your question. Here's some code:\n\`\`\`javascript\nfunction example${i}() {\n  console.log("Example ${i}");\n  return ${i};\n}\n\`\`\`\n\nAnd some more explanation about the code above. This helps test rendering performance with mixed content.`
          }
        ],
        usage: {
          input_tokens: 50 + Math.floor(Math.random() * 100),
          output_tokens: 100 + Math.floor(Math.random() * 200)
        }
      },
      uuid: `msg-assistant-${i}`,
      timestamp: new Date(startTime + i * 60000 + 5000).toISOString()
    }) + '\n');
  }

  stream.end();
  console.log(`✓ Generated large session with ${messageCount * 2} messages: ${sessionPath}`);
}

// Generate 100 small sessions
function generateMultipleSessions() {
  const multiSessionDir = path.join(__dirname, 'multi-sessions', 'projects', 'test-project');
  fs.mkdirSync(multiSessionDir, { recursive: true });

  const sessionCount = 100;
  const indexEntries = [];

  for (let i = 0; i < sessionCount; i++) {
    const sessionId = `session-${String(i + 1).padStart(3, '0')}`;
    const sessionPath = path.join(multiSessionDir, `${sessionId}.jsonl`);
    const stream = fs.createWriteStream(sessionPath);

    // Write summary
    stream.write(JSON.stringify({
      type: 'summary',
      summary: `Test Session ${i + 1}`,
      leafUuid: `uuid-${sessionId}`
    }) + '\n');

    // Write 5-10 messages per session
    const messageCount = 5 + Math.floor(Math.random() * 6);
    const startTime = new Date('2026-01-01T00:00:00.000Z').getTime() + i * 3600000;

    for (let j = 0; j < messageCount; j++) {
      const timestamp = new Date(startTime + j * 60000).toISOString();

      // User message
      stream.write(JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: `Message ${j + 1} in session ${i + 1}`
        },
        uuid: `${sessionId}-user-${j}`,
        timestamp,
        sessionId,
        cwd: '/test/project'
      }) + '\n');

      // Assistant message
      stream.write(JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `Response ${j + 1} for session ${i + 1}`
            }
          ],
          usage: {
            input_tokens: 20,
            output_tokens: 30
          }
        },
        uuid: `${sessionId}-assistant-${j}`,
        timestamp: new Date(startTime + j * 60000 + 2000).toISOString()
      }) + '\n');
    }

    stream.end();

    // Add to index
    indexEntries.push({
      sessionId,
      fullPath: `/mock/path/${sessionId}.jsonl`,
      fileMtime: startTime,
      firstPrompt: `Message 1 in session ${i + 1}`,
      summary: `Test Session ${i + 1}`,
      messageCount: messageCount * 2
    });
  }

  // Write sessions index
  const indexPath = path.join(multiSessionDir, 'sessions-index.json');
  fs.writeFileSync(indexPath, JSON.stringify({
    version: 1,
    entries: indexEntries
  }, null, 2));

  console.log(`✓ Generated ${sessionCount} sessions in: ${multiSessionDir}`);
  console.log(`✓ Created sessions index: ${indexPath}`);
}

// Generate test files for concurrent upload test
function generateTestFiles() {
  const testFilesDir = path.join(__dirname, '../test-files');
  fs.mkdirSync(testFilesDir, { recursive: true });

  // Generate 10 small text files
  for (let i = 1; i <= 10; i++) {
    const filePath = path.join(testFilesDir, `test-file-${i}.txt`);
    const content = `Test File ${i}\n${'='.repeat(50)}\n\n` +
      `This is test file number ${i}.\n`.repeat(50) +
      `\nEnd of test file ${i}\n`;
    fs.writeFileSync(filePath, content);
  }

  console.log(`✓ Generated 10 test files in: ${testFilesDir}`);
}

// Generate session with various content types
function generateMixedContentSession() {
  const sessionPath = path.join(__dirname, 'mixed-content-session.jsonl');
  const stream = fs.createWriteStream(sessionPath);

  // Write summary
  stream.write(JSON.stringify({
    type: 'summary',
    summary: 'Mixed Content Session',
    leafUuid: 'mixed-content-uuid'
  }) + '\n');

  const startTime = new Date('2026-01-15T10:00:00.000Z').getTime();

  // Message with code
  stream.write(JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: 'Show me a complex algorithm'
    },
    uuid: 'mixed-msg-1',
    timestamp: new Date(startTime).toISOString(),
    sessionId: 'mixed-content-123'
  }) + '\n');

  stream.write(JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Here is a complex sorting algorithm:\n\n```python\ndef quicksort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[len(arr) // 2]\n    left = [x for x in arr if x < pivot]\n    middle = [x for x in arr if x == pivot]\n    right = [x for x in arr if x > pivot]\n    return quicksort(left) + middle + quicksort(right)\n\nresult = quicksort([3, 6, 8, 10, 1, 2, 1])\nprint(result)\n```\n\nThis algorithm has O(n log n) average time complexity.'
        }
      ],
      usage: { input_tokens: 15, output_tokens: 150 }
    },
    uuid: 'mixed-msg-2',
    timestamp: new Date(startTime + 5000).toISOString()
  }) + '\n');

  // Message with thinking
  stream.write(JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: 'Explain quantum computing'
    },
    uuid: 'mixed-msg-3',
    timestamp: new Date(startTime + 60000).toISOString(),
    sessionId: 'mixed-content-123'
  }) + '\n');

  stream.write(JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'thinking',
          thinking: 'This is a complex topic. I should break it down into: 1) Basic principles, 2) Qubits vs classical bits, 3) Quantum superposition, 4) Entanglement, 5) Current applications.'
        },
        {
          type: 'text',
          text: 'Quantum computing is a revolutionary technology that leverages quantum mechanics principles...\n\n**Key Concepts:**\n1. Qubits\n2. Superposition\n3. Entanglement\n\nLet me explain each in detail...'
        }
      ],
      usage: { input_tokens: 20, output_tokens: 200 }
    },
    uuid: 'mixed-msg-4',
    timestamp: new Date(startTime + 70000).toISOString()
  }) + '\n');

  stream.end();
  console.log(`✓ Generated mixed content session: ${sessionPath}`);
}

// Main execution
console.log('Generating performance test fixtures...\n');

try {
  generateLargeSession();
  generateMultipleSessions();
  generateTestFiles();
  generateMixedContentSession();

  console.log('\n✅ All fixtures generated successfully!');
  console.log('\nGenerated fixtures:');
  console.log('  - large-session.jsonl (1000+ messages)');
  console.log('  - multi-sessions/ (100 sessions)');
  console.log('  - test-files/ (10 test files)');
  console.log('  - mixed-content-session.jsonl');
} catch (error) {
  console.error('❌ Error generating fixtures:', error);
  process.exit(1);
}
