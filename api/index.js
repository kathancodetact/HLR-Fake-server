/*
 * Vercel function. vercel.json rewrites every path here and passes the path the caller asked for as "__path", because after a
 * rewrite the function sees "/api/index" instead of "/hlr/...". It is put back first, so /hlr, /hlr/{msisdn} and /health work as on
 * the Node server, with the caller's own query values (for example msisdn) kept.
 */
const { handleRequest } = require('../src/fake-hlr');

/** Turns "/api/index?__path=hlr/919876543211&msisdn=1" back into "/hlr/919876543211?msisdn=1". */
function restoreOriginalUrl(rewrittenUrl) {
  const url = new URL(rewrittenUrl, 'http://vercel.local');

  if (!url.searchParams.has('__path')) return rewrittenUrl;

  const path = url.searchParams.get('__path') || '';

  url.searchParams.delete('__path');

  const query = url.searchParams.toString();

  return `/${path.replace(/^\/+/, '')}${query ? `?${query}` : ''}`;
}

module.exports = (request, response) => {
  request.url = restoreOriginalUrl(request.url);

  return handleRequest(request, response);
};

module.exports.restoreOriginalUrl = restoreOriginalUrl;
