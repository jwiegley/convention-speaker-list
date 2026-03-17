// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = '3999';
process.env.REDIS_URL = 'redis://localhost:6379';

// Increase test timeout for integration tests
jest.setTimeout(10000);

// Mock logger to reduce noise in tests
jest.mock('./src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
  },
}));

// Clean up after tests
afterAll(async () => {
  // Close any open handles
  await new Promise((resolve) => setTimeout(resolve, 500));
});
