// For tests that start a server on a random port and call it with fetch.
// Node's fetch refuses some ports (like 5060 and 5061); on some machines the random ports come from a range that
// includes them, so a test would now and then fail with "bad port". This starts the server again until the port is fine.
export const BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110,
  111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061,
  6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

// app = an express app (or anything with .listen). Returns the running server.
export async function listen(app, { maxTries = 50 } = {}) {
  for (let attempt = 0; attempt < maxTries; attempt += 1) {
    const server = await new Promise((resolve, reject) => {
      const started = app.listen(0, () => resolve(started));
      started.once('error', reject);
    });
    if (!BAD_PORTS.has(server.address().port)) return server;
    await new Promise((resolve) => server.close(resolve));
  }
  throw new Error('Could not get a usable test port');
}
