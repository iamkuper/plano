/** Benchmark on a large database: `pnpm bench` (see bench/README.md). */
module.exports = {
  rootDir: "..",
  testEnvironment: "node",
  testRegex: "bench/.*\\.bench\\.ts$",
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json", diagnostics: false }] },
  moduleFileExtensions: ["ts", "js", "json"],
  globalSetup: "<rootDir>/bench/global-setup.ts",
  setupFiles: ["<rootDir>/bench/env.ts"],
  testTimeout: 1_800_000,
  maxWorkers: 1,
};
