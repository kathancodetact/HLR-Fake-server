/*
 * Vercel function. vercel.json rewrites every path here; the shared handler puts the caller's original path back (see
 * restoreOriginalUrl in src/fake-hlr.js), so /hlr, /hlr/{msisdn} and /health work as on the Node server.
 */
const { handleRequest } = require('../src/fake-hlr');

module.exports = (request, response) => handleRequest(request, response);
