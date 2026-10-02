/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  testRegex: "(test|src)/.*\\.spec\\.ts$",
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json", diagnostics: false }] },
  moduleFileExtensions: ["ts", "js", "json"],
  globalSetup: "<rootDir>/test/helpers/global-setup.ts",
  setupFiles: ["<rootDir>/test/helpers/env.ts"],
  testTimeout: 30000,
  // All specs share one database and one process.
  maxWorkers: 1,
  collectCoverageFrom: ["src/**/*.ts", "!src/main.ts", "!src/**/*.spec.ts", "!src/**/*.module.ts"],
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary", "text", "lcov"],
};
