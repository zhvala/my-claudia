# Performance Test Fixtures

This directory contains fixtures for performance testing.

## Setup

Before running performance tests, generate the fixtures:

```bash
node generate-fixtures.js
```

## Generated Fixtures

### 1. Large Session (`large-session.jsonl`)
- Contains 1000+ messages (2000 total: 1000 user + 1000 assistant)
- Used to test import and rendering performance with large datasets
- Each message includes realistic content with code blocks and explanations

### 2. Multiple Sessions (`multi-sessions/`)
- Contains 100 small sessions
- Each session has 5-10 messages
- Used to test batch import and session list performance
- Includes a sessions-index.json for session discovery

### 3. Test Files (`../test-files/`)
- 10 text files for concurrent upload testing
- Each file contains ~50 lines of test content
- Used to test file upload performance and UI responsiveness

### 4. Mixed Content Session (`mixed-content-session.jsonl`)
- Contains messages with various content types:
  - Code blocks
  - Thinking blocks
  - Markdown formatting
- Used to test rendering performance with diverse content

## Performance Benchmarks

The tests expect the following performance thresholds:

- **Large session import**: < 30 seconds
- **Session scan (100 sessions)**: < 10 seconds
- **Batch import (100 sessions)**: < 60 seconds
- **Concurrent file upload (10 files)**: < 5 seconds
- **Common operations**: < 3 seconds
- **Page refresh**: < 5 seconds

## Cleanup

To remove generated fixtures:

```bash
rm -f large-session.jsonl mixed-content-session.jsonl
rm -rf multi-sessions/
rm -f ../test-files/test-file-*.txt
```
