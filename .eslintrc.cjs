module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
    ecmaVersion: 2020,
  },
  env: {
    node: true,
    es2020: true,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: [
    'out/',
    'node_modules/',
    'media/',
  ],
  overrides: [
    {
      files: ['src/test/**/*.ts'],
      env: {
        mocha: true,
      },
    },
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
