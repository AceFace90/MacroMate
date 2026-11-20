// eslint-config-expo bundles the React, React-Hooks and React-Native rule sets
// and the correct parser for JSX. Legacy .eslintrc format (ESLint 8).
module.exports = {
  root: true,
  extends: 'expo',
  ignorePatterns: ['dist/', 'web-build/', 'node_modules/', 'coverage/', 'MacroMate App/'],
  env: {
    node: true,
    browser: true,
  },
};
