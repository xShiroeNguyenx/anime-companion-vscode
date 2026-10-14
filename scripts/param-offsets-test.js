// Tests media/webview/param-offsets.js against a stand-in for the Cubism
// update loop (pixi-live2d-display's Cubism4InternalModel.update): motion,
// afterMotionUpdate, saveParameters, ..., loadParameters — with the
// framework's clamping setter. Run by `npm test`.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

/** One parameter with the rig's limits, and the framework's save/load. */
function fakeModel({ min = -30, max = 30, animate = null } = {}) {
  let value = 0;
  let saved = 0;
  const handlers = {};
  const core = {
    getParameterValueById: () => value,
    setParameterValueById: (_id, v) => { value = Math.min(max, Math.max(min, v)); },
    addParameterValueById: (_id, v) => { value = Math.min(max, Math.max(min, value + v)); },
  };
  const internal = {
    coreModel: core,
    on(event, fn) { (handlers[event] ||= []).push(fn); },
    emit(event) { (handlers[event] || []).forEach((fn) => fn()); },
    /** One frame; `animate(frame)` is the idle motion's value, or null if it leaves the parameter alone. */
    frame(n) {
      internal.emit('beforeMotionUpdate');
      if (animate) core.setParameterValueById('ParamAngleZ', animate(n));
      internal.emit('afterMotionUpdate');
      saved = value;
      const drawn = value;
      value = saved; // loadParameters
      return drawn;
    },
  };
  return internal;
}

(async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'media', 'webview', 'param-offsets.js'), 'utf8');
  const { addTransientParameter, bindTransientParameters, multiplyTransientParameter } = await import(
    'data:text/javascript;charset=utf-8,' + encodeURIComponent(source)
  );
  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });

  test('a plain add compounds on a parameter the motion leaves alone (the bug)', () => {
    const model = fakeModel();
    model.on('afterMotionUpdate', () => model.coreModel.addParameterValueById('ParamAngleZ', 11));
    let drawn = 0;
    for (let i = 0; i < 120; i++) drawn = model.frame(i);
    assert.strictEqual(drawn, 30, 'stuck at the rig limit');
  });

  test('a transient add shows the offset each frame and nothing more', () => {
    const model = fakeModel();
    bindTransientParameters(model);
    let tilt = 11;
    model.on('afterMotionUpdate', () => addTransientParameter(model, 'ParamAngleZ', tilt));
    for (let i = 0; i < 120; i++) assert.strictEqual(model.frame(i), 11);
    tilt = 0;
    assert.strictEqual(model.frame(120), 0, 'back upright once the beat ends');
  });

  test('on top of an animated parameter, the motion value plus the offset', () => {
    const model = fakeModel({ animate: (n) => Math.sin(n / 10) * 5 });
    bindTransientParameters(model);
    model.on('afterMotionUpdate', () => addTransientParameter(model, 'ParamAngleZ', 7));
    for (let i = 0; i < 60; i++) assert.ok(Math.abs(model.frame(i) - (Math.sin(i / 10) * 5 + 7)) < 1e-9);
  });

  test('clamping at the limit still returns to the true value', () => {
    const model = fakeModel({ max: 30 });
    model.coreModel.setParameterValueById('ParamAngleZ', 25);
    bindTransientParameters(model);
    let delta = 20;
    model.on('afterMotionUpdate', () => addTransientParameter(model, 'ParamAngleZ', delta));
    assert.strictEqual(model.frame(0), 30);
    delta = 0;
    assert.strictEqual(model.frame(1), 25, 'not 30 - 20 = 10');
  });

  test('two offsets on one parameter unwind together', () => {
    const model = fakeModel();
    bindTransientParameters(model);
    let on = true;
    model.on('afterMotionUpdate', () => {
      if (!on) return;
      addTransientParameter(model, 'ParamAngleZ', 4);
      addTransientParameter(model, 'ParamAngleZ', -9);
    });
    for (let i = 0; i < 30; i++) assert.strictEqual(model.frame(i), -5);
    on = false;
    assert.strictEqual(model.frame(30), 0);
  });

  test('a plain multiply runs away on a parameter the motion leaves alone (the bug)', () => {
    const model = fakeModel({ min: 0, max: 1 });
    model.coreModel.setParameterValueById('ParamAngleZ', 0.5);
    model.on('afterMotionUpdate', () => {
      const core = model.coreModel;
      core.setParameterValueById('ParamAngleZ', core.getParameterValueById('ParamAngleZ') * 1.2);
    });
    let drawn = 0;
    for (let i = 0; i < 60; i++) drawn = model.frame(i);
    assert.strictEqual(drawn, 1, 'pinned at the limit');
  });

  test('a transient multiply scales the same base every frame', () => {
    const model = fakeModel({ min: 0, max: 1 });
    model.coreModel.setParameterValueById('ParamAngleZ', 0.5);
    bindTransientParameters(model);
    let factor = 1.2;
    model.on('afterMotionUpdate', () => multiplyTransientParameter(model, 'ParamAngleZ', factor));
    for (let i = 0; i < 60; i++) assert.ok(Math.abs(model.frame(i) - 0.6) < 1e-9);
    factor = 1;
    assert.strictEqual(model.frame(60), 0.5, 'clearing the face restores the value');
  });

  test('binding twice does not undo twice', () => {
    const model = fakeModel();
    bindTransientParameters(model);
    bindTransientParameters(model);
    let delta = 6;
    model.on('afterMotionUpdate', () => addTransientParameter(model, 'ParamAngleZ', delta));
    model.frame(0);
    delta = 0;
    assert.strictEqual(model.frame(1), 0);
  });

  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      fn();
    } catch (err) {
      failed++;
      console.error(`[param-offsets-test] FAIL ${name}\n  ${err && err.message}`);
    }
  }
  if (failed) {
    console.error(`[param-offsets-test] ${failed} of ${tests.length} failed`);
    process.exit(1);
  }
  console.log(`[param-offsets-test] ${tests.length} passed.`);
})();
