/**
 * Runs the real webview in Electron to exercise outfit and expression switching.
 *
 * The extension's own smoke test mocks the VS Code API and never loads a
 * webview, so it cannot see whether a chosen entry reaches the model. This
 * boots the same scripts the extension injects, against a real model served
 * over HTTP the way `model-server.ts` serves it, and reports what the Cubism
 * core ends up holding.
 *
 * Usage: electron scripts/outfit-harness.js <model directory> <model3 filename>
 */
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { app, BrowserWindow } = require('electron');

const root = path.resolve(__dirname, '..');
const modelDir = process.argv[process.argv.length - 2];
const modelFile = process.argv[process.argv.length - 1];

app.commandLine.appendSwitch('enable-unsafe-swiftshader');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.moc3': 'application/octet-stream'
};

/** Serves the model folder and the extension's media folder. */
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = url.startsWith('/media/')
        ? path.join(root, url.slice(1))
        : path.join(modelDir, url.slice(1));
      fs.readFile(file, (error, data) => {
        if (error) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function pageHtml(port, expressionMap) {
  const base = `http://127.0.0.1:${port}`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${base}/media/companion.css">
<style>body{margin:0;background:#1e1e1e;height:100vh}
.character-wrapper{position:relative;width:100%;height:100vh}</style>
</head><body>
  <div class="character-wrapper" id="characterWrapper">
    <canvas id="live2dCanvas" style="display:none"></canvas>
    <img id="fallbackImg" style="display:none">
    <div class="loading" id="loading"></div>
    <span class="status-dot"></span><span class="status-text"></span>
  </div>
  <script>
    // The webview talks to the extension through this; here it only needs to
    // not throw.
    window.acquireVsCodeApi = () => ({ postMessage() {}, getState() {}, setState() {} });
    window.__MODEL_URL__ = "${base}/${modelFile}";
    window.__MODEL_ID__ = "harness";
    window.__VISIBLE_MODELS__ = [];
    window.__ACHIEVEMENTS__ = {};
    window.__WEBVIEW_STRINGS__ = {};
    window.__AMBIENT_TRACKS__ = [];
    window.__EXPRESSION_MAP__ = ${JSON.stringify(expressionMap)};
  </script>
  <script src="${base}/media/lib/live2dcubismcore.min.js"></script>
  <script src="${base}/media/lib/pixi.min.js"></script>
  <script src="${base}/media/lib/cubism4.min.js"></script>
  <script type="module" src="${base}/media/webview/main.js"></script>
</body></html>`;
}

async function main() {
  const port = await startServer();
  const base = `http://127.0.0.1:${port}`;

  // The map is read by the page at load time, so decide it before booting:
  // map the second and third entries, leaving other moods on their presets so
  // the fallback path is covered too.
  const settings = JSON.parse(fs.readFileSync(path.join(modelDir, modelFile), 'utf8'));
  const declared = settings?.FileReferences?.Expressions ?? [];
  // Map moods onto entries that are actually faces; a costume there is exactly
  // what the code under test is supposed to refuse.
  const faceish = declared.filter((entry) => /^exp/i.test(entry.File.split('/').pop()));
  const expressionMap =
    faceish.length >= 2 ? { happy: faceish[1].Name, angry: faceish[0].Name } : {};
  console.log('declared expressions:', declared.length, '| map:', JSON.stringify(expressionMap));

  const win = new BrowserWindow({ width: 900, height: 800, show: false });
  win.webContents.on('console-message', (...args) => {
    const details = args[0];
    const message =
      details && typeof details === 'object' ? details.message : `${args[1]} ${args[2]}`;
    if (/Expression|outfit|face|FATAL/i.test(message)) console.log('  [page]', message);
  });

  await win.loadURL(
    `data:text/html;base64,${Buffer.from(pageHtml(port, expressionMap)).toString('base64')}`
  );
  await sleep(9000);

  const IMPORTS = `
    const me = await import('${base}/media/webview/model-expressions.js');
    const expr = await import('${base}/media/webview/expression.js');
    const outfit = await import('${base}/media/webview/outfit.js');
    const core = await import('${base}/media/webview/core.js');
  `;

  const report = await win.webContents.executeJavaScript(`(async () => {
    ${IMPORTS}
    const out = { modelLoaded: Boolean(core.state.model) };
    if (!out.modelLoaded) return out;

    const model = core.state.model.internalModel.coreModel;
    out.names = me.expressionNames();
    // The split is the point: a costume must not appear under Biểu cảm.
    out.faces = me.faceNames();
    out.outfits = me.outfitEntryNames();
    if (out.names.length === 0) return out;

    // A costume in the face slot is refused outright, so a bad expressionMap
    // cannot dress the character up every time it feels happy.
    if (out.outfits.length > 0) {
      out.costumeIntoFaceSlot = await me.applyToSlot('face', out.outfits[0]);
    }

    // An outfit and a face must coexist: picking a face cannot undress the
    // model, which is the whole reason they live in separate slots.
    if (out.outfits.length > 0) await outfit.setOutfit(out.outfits[0]);
    if (out.faces.length > 0) await expr.setModelExpression(out.faces[0]);
    out.bothSlots = { outfit: outfit.activeOutfit(), face: expr.activeModelExpression() };

    // Blend handling. Seed a parameter the entry touches, tick, and see whether
    // the write composed with the seed (Add/Multiply) or replaced it
    // (Overwrite) — getting this wrong is what makes a smile fight lip-sync.
    const entryUrl = '${base}/' + ${JSON.stringify(
      declared.length > 0 ? declared[0].File : ''
    )};
    const raw = await (await fetch(entryUrl)).json();
    const first = raw.Parameters.find((p) => p.Value !== 0) ?? raw.Parameters[0];
    out.probe = { id: first.Id, value: first.Value, blend: first.Blend ?? 'Add' };

    outfit.clearOutfit();
    if (out.faces.length > 0) await expr.setModelExpression(out.faces[0]);
    else await outfit.setOutfit(out.outfits[0]);
    model.setParameterValueById(first.Id, 0);
    me.updateModelExpressionTick();
    out.afterTick = model.getParameterValueById(first.Id);

    return out;
  })()`);

  console.log('\nREPORT', JSON.stringify(report, null, 1));

  if (report.modelLoaded) {
    for (const [label, action, panelClass, optionClass] of [
      ['outfit    ', 'change-outfit', 'companion-outfit-panel', 'companion-outfit-option'],
      ['expression', 'change-expression', 'companion-expression-panel', 'companion-expression-option']
    ]) {
      const clicked = await win.webContents.executeJavaScript(`(() => {
        const item = document.querySelector('[data-action="${action}"]');
        if (!item) return { found: false };
        item.click();
        const panel = document.querySelector('.${panelClass}');
        return {
          found: true,
          shown: panel?.classList.contains('show') ?? false,
          options: [...(panel?.querySelectorAll('.${optionClass}') ?? [])].map((b) => b.textContent.trim()),
          empty: panel?.querySelector('.companion-outfit-empty')?.textContent.trim() ?? null
        };
      })()`);
      console.log('MENU', label, JSON.stringify(clicked));
    }

    // The mood path: a mapped mood should reach the model's file, an unmapped
    // one should fall back to the built-in preset and leave the slot empty.
    const mood = await win.webContents.executeJavaScript(`(async () => {
      ${IMPORTS}
      expr.setExpression('happy', null);
      await new Promise((r) => setTimeout(r, 150));
      const happy = expr.activeModelExpression();
      expr.setExpression('sleepy', null);
      await new Promise((r) => setTimeout(r, 150));
      return { happyMapsTo: happy, sleepyFallsBack: expr.activeModelExpression() };
    })()`);
    console.log('MOOD', JSON.stringify(mood));

    await win.webContents.executeJavaScript(`(async () => {
      ${IMPORTS}
      const names = me.expressionNames();
      if (names.length > 0) await outfit.setOutfit(names[0]);
      document.querySelector('[data-action="change-expression"]')?.click();
    })()`);
    await sleep(2500);
    fs.mkdirSync(path.join(root, '.harness'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.harness', 'panels.png'),
      (await win.webContents.capturePage()).toPNG()
    );
    console.log('screenshot written');
  }
  app.exit(report.modelLoaded ? 0 : 1);
}

app.whenReady().then(() =>
  main().catch((error) => {
    console.error('FAIL', error);
    app.exit(1);
  })
);
