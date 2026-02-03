# Security Test Fixtures

This directory contains test files for security testing. These files are intentionally crafted to test the application's security defenses.

## Files

### malformed-sql-injection.jsonl
Contains SQL injection attempts in JSONL format to test input sanitization.

### json-bomb.jsonl
Contains deeply nested JSON objects to test for JSON bomb/billion laughs attacks.

### oversized-session.jsonl
100MB file to test handling of oversized uploads and prevent DoS attacks.

### path-traversal.txt
Used to test path traversal attacks in file upload functionality.

### xss-test.html
Contains XSS payloads to test HTML sanitization.

### malicious.exe
Fake executable file to test file type validation.

## Usage

These files are automatically used by the security.spec.ts test suite. Do not use these files in production environments.

## Safety Note

All files in this directory are safe test fixtures. The "malicious" content is simulated for testing purposes only and does not contain actual malware.
