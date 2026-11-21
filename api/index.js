/*
 * Vercel function. vercel.json sends every path here, so /hlr, /hlr/{msisdn} and /health all work as on the Node server.
 */
const { handleRequest } = require('../src/fake-hlr');

module.exports = (request, response) => handleRequest(request, response);
