/*
 * Node server for Render or a local run: node server.js
 * Render sets PORT; locally it defaults to 9900.
 */
const http = require('node:http');
const { handleRequest } = require('./src/fake-hlr');

const PORT = Number(process.env.PORT || 9900);
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error('Unexpected error', error);

    if (!response.writableEnded) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'error', message: 'Fake server error' }));
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Fake HLR provider listening on http://${HOST}:${PORT}/hlr`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
