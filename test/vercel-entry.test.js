// The Vercel entry: after vercel.json's rewrite the function sees /api/index?__path=..., and must answer as for the original path.
process.env.HLR_FAKE_API_KEY = 'test-key';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { restoreOriginalUrl, decideReply } = require('../src/fake-hlr');


test('puts back the path and keeps the caller\'s query values', () => {
  assert.equal(restoreOriginalUrl('/api/index?__path=hlr&msisdn=919876543211'), '/hlr?msisdn=919876543211');
  assert.equal(restoreOriginalUrl('/api/index?msisdn=919876543211&__path=hlr'), '/hlr?msisdn=919876543211');
  assert.equal(restoreOriginalUrl('/api/index?__path=hlr%2F919876543212'), '/hlr/919876543212');
  assert.equal(restoreOriginalUrl('/api/index?__path=health'), '/health');
  assert.equal(restoreOriginalUrl('/api/index?__path='), '/');
  assert.equal(restoreOriginalUrl('/hlr?msisdn=1'), '/hlr?msisdn=1');
});

test('a rewritten lookup gets the same answer as a direct one', () => {
  const headers = { 'x-api-key': 'test-key' };

  assert.equal(decideReply({ path: restoreOriginalUrl('/api/index?__path=hlr&msisdn=919876543211'), headers, rawBody: '' }).body.result.state, 'active');
  assert.equal(decideReply({ path: restoreOriginalUrl('/api/index?__path=hlr/919876543213'), headers, rawBody: '' }).body.result.state, 'invalid');
  assert.equal(decideReply({ path: restoreOriginalUrl('/api/index?__path=hlr&msisdn=919876543214'), headers, rawBody: '' }).status, 500);
});
