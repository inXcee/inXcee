// Global test setup — runs before any test module is imported
// Sets required environment variables so auth/service.js does not call process.exit(1)
export function setup() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-vitest'
}
