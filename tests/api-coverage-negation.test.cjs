const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectApiIntegration } = require('../gsd-core/bin/lib/api-coverage.cjs');

test('detectApiIntegration ignores negated prose describing absent external APIs', () => {
  const negatedProse1 = 'No REST API integration is included in this phase.';
  const res1 = detectApiIntegration(negatedProse1);
  assert.strictEqual(
    res1.detected,
    false,
    'sentence-starter negation ("No REST API integration...") must not trigger detection'
  );

  const negatedProse2 = 'This phase operates entirely offline without calling any external REST API.';
  const res2 = detectApiIntegration(negatedProse2);
  assert.strictEqual(
    res2.detected,
    false,
    'prepositional negation ("without calling any external REST API...") must not trigger detection'
  );

  const positiveProse = 'This phase will integrate the GitHub REST API to manage pull requests.';
  const res3 = detectApiIntegration(positiveProse);
  assert.strictEqual(
    res3.detected,
    true,
    'positive integration prose must still trigger detection'
  );
});
