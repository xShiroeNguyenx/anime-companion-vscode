// Tests media/webview/focus-pace.js against a stand-in for pixi-live2d-display's
// focus controller: the same chase (top speed 40/7.5 per second, eased), so the
// slower clock shows as a slower turn. Run by `npm test`.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

/** The library's FocusController.update, as in cubism4.min.js. */
function controller() {
  return {
    targetX: 0, targetY: 0, x: 0, y: 0, vx: 0, vy: 0,
    focus(x, y) { this.targetX = x; this.targetY = y; },
    update(t) {
      const e = this.targetX - this.x, i = this.targetY - this.y;
      if (Math.abs(e) < 0.01 && Math.abs(i) < 0.01) return;
      const s = Math.hypot(e, i), r = 5.333333333333333 / (1e3 / t);
      let a = r * (e / s) - this.vx, o = r * (i / s) - this.vy;
      const n = Math.hypot(a, o), l = 0.006666666666666667 * r * t;
      if (n > l) { a *= l / n; o *= l / n; }
      this.vx += a; this.vy += o;
      const h = Math.hypot(this.vx, this.vy), u = 0.5 * (Math.sqrt(l * l + 8 * l * s) - l);
      if (h > u) { this.vx *= u / h; this.vy *= u / h; }
      this.x += this.vx; this.y += this.vy;
    },
  };
}

/** Milliseconds for the head to get 90% of the way to a full turn, at 60 fps. */
function settle(fc) {
  fc.focus(1, 0);
  for (let ms = 0; ms < 10000; ms += 1000 / 60) {
    fc.update(1000 / 60);
    if (fc.x >= 0.9) return ms;
  }
  return Infinity;
}

(async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'webview', 'focus-pace.js'), 'utf8');
  const { paceFocus, FOCUS_PACE } = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(source));

  const plain = settle(controller());
  const fc = controller();
  assert.strictEqual(paceFocus({ internalModel: { focusController: fc } }), true);
  const paced = settle(fc);
  assert.ok(paced > plain * 2, `paced turn ${paced} ms should be well over twice the library's ${plain} ms`);
  assert.ok(paced < 1500, `paced turn ${paced} ms should still be under a second and a half`);

  // Applying again (a model reload) changes the pace, never stacks it.
  const again = controller();
  const model = { internalModel: { focusController: again } };
  paceFocus(model);
  paceFocus(model);
  assert.strictEqual(Math.round(settle(again)), Math.round(paced));

  assert.strictEqual(paceFocus({}), false);
  assert.strictEqual(paceFocus(null), false);
  assert.ok(FOCUS_PACE > 0 && FOCUS_PACE < 1);
  console.log(`focus-pace: library ${Math.round(plain)} ms -> paced ${Math.round(paced)} ms to 90% of a turn — ok`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
