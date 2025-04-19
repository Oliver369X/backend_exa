module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['js', 'ts'],
    transform: { '^.+\\.ts$': 'ts-jest' },
  };