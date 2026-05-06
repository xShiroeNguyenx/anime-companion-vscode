// Ad-hoc verification: starts ModelFileServer with route prefixes added in
// Phase A and probes each one. Not wired into `npm test` because it spins up
// a real HTTP server on a random port; meant for manual sanity-checking.
const path = require('path');
const http = require('http');

const { ModelFileServer } = require('../out/model-server.js');

const extensionUri = { fsPath: path.resolve(__dirname, '..') };
const server = new ModelFileServer(extensionUri, []);

function probe(port, urlPath) {
  return new Promise((resolve) => {
    http
      .get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
        res.resume();
        resolve({ status: res.statusCode, contentType: res.headers['content-type'] });
      })
      .on('error', (err) => resolve({ error: err.message }));
  });
}

async function main() {
  const port = await server.start();
  console.log('Server on port', port);

  const checks = [
    { url: '/Hiyori/Hiyori.model3.json', expectStatus: 200 },
    { url: '/audio/ja/poke.mp3', expectStatus: 200 },
    { url: '/audio/en/help.mp3', expectStatus: 200 },
    { url: '/audio/xx/missing.mp3', expectStatus: 404 },
    { url: '/desktop-pet/index.html', expectStatus: 200 },
    { url: '/media/companion.css', expectStatus: 200 },
    { url: '/media/lib/pixi.min.js', expectStatus: 200 },
    { url: '/ambient/nonexistent', expectStatus: 404 },
    { url: '/audio/../../../package.json', expectStatus: 404 },
  ];

  let pass = 0;
  let fail = 0;
  for (const { url, expectStatus } of checks) {
    const result = await probe(port, url);
    const ok = result.status === expectStatus;
    if (ok) pass++; else fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${url}  -> ${JSON.stringify(result)} (expected ${expectStatus})`);
  }

  // Test ambient registration
  const fs = require('fs');
  const tmpFile = path.join(__dirname, '..', 'package.json');
  if (fs.existsSync(tmpFile)) {
    server.registerAmbientTrack('test-track', tmpFile);
    const r = await probe(port, '/ambient/test-track');
    const ok = r.status === 200;
    if (ok) pass++; else fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  /ambient/test-track (registered)  -> ${JSON.stringify(r)}`);
  }

  server.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
