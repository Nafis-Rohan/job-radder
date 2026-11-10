import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { listen, BAD_PORTS } from '../listen.js';

test('the port list holds the ports that fetch refuses', () => {
  for (const port of [5060, 5061, 6000, 6665, 10080]) assert.equal(BAD_PORTS.has(port), true, String(port));
  assert.equal(BAD_PORTS.has(3000), false);
});

test('listen returns a running server on a port that fetch accepts', async () => {
  const server = await listen(http.createServer((req, res) => res.end('ok')));
  try {
    const { port } = server.address();
    assert.equal(BAD_PORTS.has(port), false);
    assert.equal(await (await fetch(`http://localhost:${port}/`)).text(), 'ok');
  } finally {
    server.close();
  }
});

test('listen starts again when the first port is a refused one', async () => {
  let starts = 0;
  const app = {
    listen(port, callback) {
      starts += 1;
      const server = http.createServer((req, res) => res.end('ok'));
      // the first server pretends to sit on a refused port
      if (starts === 1) {
        const real = server.address.bind(server);
        server.address = () => ({ ...real(), port: 5060 });
      }
      return server.listen(port, callback);
    },
  };
  const server = await listen(app);
  try {
    assert.equal(starts, 2);
    assert.equal(BAD_PORTS.has(server.address().port), false);
  } finally {
    server.close();
  }
});

test('listen gives up with a clear error when every port is refused', async () => {
  const app = {
    listen(port, callback) {
      const server = http.createServer();
      server.address = () => ({ port: 5060 });
      return server.listen(port, callback);
    },
  };
  await assert.rejects(listen(app, { maxTries: 3 }), /usable test port/);
});
