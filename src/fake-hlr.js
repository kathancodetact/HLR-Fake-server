/*
 * Fake HLR provider: answers like a real HLR API, so HLR lookups can be tested without a provider account or cost.
 * The answer depends on the number's last digit, so every scenario can be repeated on demand.
 *
 * Settings (environment variables):
 *   HLR_FAKE_API_KEY   the x-api-key value callers must send, default "fake-hlr-key"
 *   HLR_FAKE_DELAY_MS  delay for numbers ending in 6, default 15000 (longer than YeloConnect's 10 second limit)
 */
const API_KEY = process.env.HLR_FAKE_API_KEY || 'fake-hlr-key';
const DELAY_MS = Number(process.env.HLR_FAKE_DELAY_MS || 15000);
const MAX_BODY_BYTES = 16 * 1024;

/** The provider's usual JSON answer for one number. */
function answer(msisdn, state) {
  return {
    status: 'ok',
    result: {
      msisdn,
      state,
      network: state === 'active' ? 'Airtel' : null,
      country: 'IN',
      mcc: '404',
      mnc: state === 'active' ? '10' : null,
      ported: false,
      reference: `fake-${Date.now()}`
    }
  };
}

/** Picks the scenario from the number's last digit. */
function scenarioFor(msisdn) {
  switch (msisdn.slice(-1)) {
    case '1': return { status: 200, body: answer(msisdn, 'active') };
    case '2': return { status: 200, body: answer(msisdn, 'absent') };
    case '3': return { status: 200, body: answer(msisdn, 'invalid') };
    case '4': return { status: 500, body: { status: 'error', message: 'Internal provider error' } };
    case '5': return { status: 429, body: { status: 'error', message: 'Too many requests' }, headers: { 'Retry-After': '2' } };
    case '6': return { status: 200, body: answer(msisdn, 'active'), delayMs: DELAY_MS };
    case '7': return { status: 200, body: { unexpected: 'format', items: [] } };
    default: return { status: 200, body: answer(msisdn, 'active') };
  }
}

/** Reads the number from the path (/hlr/{msisdn}), the msisdn query value, or an msisdn JSON or form body value. */
function readNumber(url, rawBody, contentType) {
  const fromPath = url.pathname.startsWith('/hlr/') ? decodeURIComponent(url.pathname.slice('/hlr/'.length)) : '';

  if (fromPath) return fromPath;

  const fromQuery = url.searchParams.get('msisdn');

  if (fromQuery) return fromQuery;
  if (!rawBody) return '';

  if (String(contentType).includes('application/json')) {
    try {
      return String(JSON.parse(rawBody).msisdn || '');
    } catch {
      return '';
    }
  }

  return new URLSearchParams(rawBody).get('msisdn') || '';
}

/**
 * Decides the reply for one request. Pure: no network, no timers, so it is easy to test.
 * @returns {{ status: number, body: object, headers?: object, delayMs?: number }}
 */
function decideReply({ path, headers, rawBody }) {
  const url = new URL(path, 'http://fake-hlr.local');

  if (url.pathname === '/' || url.pathname === '/health') {
    return { status: 200, body: { status: 'ok', service: 'fake-hlr-provider', usage: 'GET /hlr?msisdn=919876543211 with header x-api-key' } };
  }

  if (url.pathname !== '/hlr' && !/^\/hlr\/[^/]+$/.test(url.pathname)) {
    return { status: 404, body: { status: 'error', message: 'Use /hlr or /hlr/{msisdn}' } };
  }

  if (headers['x-api-key'] !== API_KEY) {
    return { status: 401, body: { status: 'error', message: 'Missing or wrong x-api-key' } };
  }

  const msisdn = readNumber(url, rawBody, headers['content-type']).replace(/^\+/, '');

  if (!/^\d+$/.test(msisdn)) {
    return { status: 400, body: { status: 'error', message: 'msisdn is required' } };
  }

  return scenarioFor(msisdn);
}

/** Reads the request body as text. Vercel may have parsed it already (req.body); a plain Node server has not. */
async function readRawBody(request) {
  const parsed = request.body;

  if (typeof parsed === 'string') return parsed;
  if (Buffer.isBuffer(parsed)) return parsed.toString('utf8');

  if (parsed && typeof parsed === 'object') {
    return String(request.headers['content-type']).includes('application/json')
      ? JSON.stringify(parsed)
      : new URLSearchParams(parsed).toString();
  }

  let raw = '';

  for await (const chunk of request) {
    raw += chunk;

    if (raw.length > MAX_BODY_BYTES) throw new Error('Body too large');
  }

  return raw;
}

function send(response, status, body, headers = {}) {
  if (response.writableEnded) return;

  // no-store: every answer is decided per request, so Vercel's edge must never serve a cached one.
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(body));
}

/**
 * Vercel's rewrite (vercel.json) sends every path to one entry and passes the path the caller asked for as "__path"; this puts it
 * back, keeping the caller's own query values. A URL without "__path" (Render, local) is returned as it is.
 * Example: "/api/index?__path=hlr%2F919876543212&x=1" → "/hlr/919876543212?x=1".
 */
function restoreOriginalUrl(receivedUrl) {
  const url = new URL(receivedUrl || '/', 'http://fake-hlr.local');

  if (!url.searchParams.has('__path')) return receivedUrl || '/';

  const path = url.searchParams.get('__path') || '';

  url.searchParams.delete('__path');

  const query = url.searchParams.toString();

  return `/${path.replace(/^\/+/, '')}${query ? `?${query}` : ''}`;
}

/** The request handler, shared by the Node server (Render, local) and the Vercel function. */
async function handleRequest(request, response) {
  request.url = restoreOriginalUrl(request.url);

  let rawBody = '';

  try {
    rawBody = await readRawBody(request);
  } catch {
    send(response, 413, { status: 'error', message: 'Body too large' });

    return;
  }

  const reply = decideReply({ path: request.url, headers: request.headers, rawBody });

  console.log(`${new Date().toISOString()} ${request.method} ${request.url} -> ${reply.status}${reply.delayMs ? ` after ${reply.delayMs}ms` : ''}`);

  if (!reply.delayMs) {
    send(response, reply.status, reply.body, reply.headers);

    return;
  }

  // The slow scenario: keep the connection open, and stop waiting if the caller gives up first.
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      send(response, reply.status, reply.body, reply.headers);
      resolve();
    }, reply.delayMs);

    response.on('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

module.exports = { decideReply, handleRequest, restoreOriginalUrl, API_KEY, DELAY_MS };
