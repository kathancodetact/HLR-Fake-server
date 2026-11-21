// Run with: npm test
process.env.HLR_FAKE_API_KEY = 'test-key';
process.env.HLR_FAKE_DELAY_MS = '300';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { decideReply, handleRequest } = require('../src/fake-hlr');

const KEY = { 'x-api-key': 'test-key' };
const reply = (path, headers = KEY, rawBody = '') => decideReply({ path, headers, rawBody });

test('each last digit gives its scenario', () => {
  assert.equal(reply('/hlr?msisdn=919876543211').body.result.state, 'active');
  assert.equal(reply('/hlr?msisdn=919876543212').body.result.state, 'absent');
  assert.equal(reply('/hlr?msisdn=919876543213').body.result.state, 'invalid');
  assert.equal(reply('/hlr?msisdn=919876543214').status, 500);
  assert.equal(reply('/hlr?msisdn=919876543215').status, 429);
  assert.equal(reply('/hlr?msisdn=919876543215').headers['Retry-After'], '2');
  assert.equal(reply('/hlr?msisdn=919876543216').delayMs, 300);
  assert.deepEqual(reply('/hlr?msisdn=919876543217').body, { unexpected: 'format', items: [] });
  assert.equal(reply('/hlr?msisdn=919876543210').body.result.state, 'active');
});

test('reads the number from the path, a JSON body or a form body, and drops a leading +', () => {
  assert.equal(reply('/hlr/919876543213').body.result.msisdn, '919876543213');
  assert.equal(reply('/hlr', { ...KEY, 'content-type': 'application/json' }, '{"msisdn":"919876543212"}').body.result.state, 'absent');
  assert.equal(reply('/hlr', { ...KEY, 'content-type': 'application/x-www-form-urlencoded' }, 'msisdn=919876543213').body.result.state, 'invalid');
  assert.equal(reply('/hlr?msisdn=%2B919876543211').body.result.msisdn, '919876543211');
});

test('refuses a missing or wrong key, a missing number and an unknown path', () => {
  assert.equal(reply('/hlr?msisdn=919876543211', {}).status, 401);
  assert.equal(reply('/hlr?msisdn=919876543211', { 'x-api-key': 'wrong' }).status, 401);
  assert.equal(reply('/hlr').status, 400);
  assert.equal(reply('/other').status, 404);
  assert.equal(reply('/health', {}).status, 200);
});

let server;
let origin;

before(async () => {
  server = http.createServer((request, response) => handleRequest(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('over HTTP: answers a GET, a JSON POST, and the slow number only after the delay', async () => {
  const get = await fetch(`${origin}/hlr?msisdn=919876543211`, { headers: KEY });
  assert.equal(get.status, 200);
  assert.equal((await get.json()).result.state, 'active');

  const post = await fetch(`${origin}/hlr`, { method: 'POST', headers: { ...KEY, 'content-type': 'application/json' }, body: '{"msisdn":"919876543213"}' });
  assert.equal((await post.json()).result.state, 'invalid');

  const startedAt = Date.now();
  const slow = await fetch(`${origin}/hlr/919876543216`, { headers: KEY });
  assert.equal(slow.status, 200);
  assert.ok(Date.now() - startedAt >= 280, 'the slow number answers only after the delay');
});
