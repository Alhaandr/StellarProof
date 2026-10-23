/**
 * Global Jest setup – executed once per test file after the test framework
 * is installed (see jest.config.ts `setupFilesAfterEnv`).
 *
 * Kept intentionally minimal: only environment guards that the shared test
 * suites rely on. Test-specific wiring belongs in the individual suites.
 */
import mongoose from 'mongoose';

// Silence the Mongoose `strictQuery` deprecation warning in test output.
mongoose.set('strictQuery', true);

// Suites that boot mongodb-memory-server (or wait on RPC polling) can exceed
// the default 5s timeout on slow CI runners.
jest.setTimeout(60_000);
