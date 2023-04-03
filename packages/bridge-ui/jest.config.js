/** @type {import('@ts-jest/dist/types').InitialOptionsTsJest} */
export default {
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.svelte$': [
      'svelte-jester',
      {
        preprocess: true,
      },
    ],
  },
  globals: {
    'ts-jest': {
      diagnostics: {
        ignoreCodes: [1343],
      },
      astTransformers: {
        before: [
          {
            path: 'node_modules/ts-jest-mock-import-meta',
          },
        ],
      },
    },
  },
  transformIgnorePatterns: ['node_modules/(?!(svelte-i18n)/)'],
  moduleFileExtensions: ['ts', 'js', 'svelte', 'json'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: [
    'lcov',
    'text',
    'cobertura',
    'json-summary',
    'json',
    'text-summary',
    'json',
  ],
  coverageThreshold: {
    // TODO: bring this coverage back up. Ideally 90%
    global: {
      statements: 81,
      branches: 64,
      functions: 80,
      lines: 80,
    },
  },
  modulePathIgnorePatterns: ['<rootDir>/public/build/'],
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['<rootDir>/node_modules/'],
  coveragePathIgnorePatterns: ['<rootDir>/src/components/'],
  testTimeout: 40 * 1000,
  watchPathIgnorePatterns: ['node_modules'],
  moduleNameMapper: {
    // https://github.com/axios/axios/issues/5101
    axios: 'axios/dist/node/axios.cjs',
  },
};
