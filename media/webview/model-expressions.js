import { state, debugLog } from './core.js';

/**
 * The expression files a model ships with, as both outfits and faces.
 *
 * Live2D draws no line between the two: `model3.json` lists `.exp3.json` files,
 * and each is a named set of parameter values. Whether one is "pyjamas" or
 * "smiling" depends only on which parameters it touches — so this module reads
 * them all, sorts each into a face or an outfit by what it drives, and lets the
 * two popups list only their own kind.
 *
 * Two entries can therefore be active at once: an outfit and a face. They are
 * held in separate slots and applied in order, so choosing a face never takes
 * the clothes off.
 *
 * Deliberately not using the library's `model.expression()`: that hands control
 * to Cubism's ExpressionManager, which writes the same parameters every frame
 * and would fight `updateExpressionTick()` in expression.js — the two would
 * take turns winning and the model would flicker. Applying from our own ticker
 * keeps one owner per parameter.
 */

/**
 * Parameter ids that belong to a face, by Cubism's own naming convention.
 *
 * The convention is what makes this reliable: Cubism Editor generates these
 * names, and every model in the wild follows them for eyes, brows, mouth and
 * cheeks. Garment switches get author-invented names instead (`ParamC1`,
 * `ParamSkirtTr`), because the editor has no notion of clothing to name.
 */
const FACE_PARAMETER = /^Param(Eye|Brow|Mouth|Cheek|Tere|Tongue|Face)/i;

/**
 * How much of a file must be facial for it to count as an expression.
 *
 * Measured rather than guessed: across the models to hand, author-drawn faces
 * run about 82% facial parameters while tool-written outfit switches are 0%.
 * The gap is wide enough that anything past half is unambiguous.
 */
const FACE_RATIO = 0.5;

/**
 * Display names (cdi3.json) that read as clothing, in the languages models are
 * authored in. Used only when a model ships no outfit files: the switches then
 * live in parameters, and the display name is the only thing that says what a
 * parameter dresses the model in.
 */
const CLOTHING_NAME =
  /常服|便服|私服|睡衣|毛衣|内衣|内裤|胖次|制服|校服|泳装|泳衣|水着|婚纱|旗袍|女仆|浴衣|和服|外套|夹克|衬衫|裙|裤|袜|鞋|帽|眼镜|围巾|披风|服装|衣装|换装|衣服|outfit|cloth|costume|dress|skirt|pajama|pyjama|sweater|uniform|swimsuit|bikini|coat|jacket|shirt|\bhat\b|glasses|socks|shoes|scarf|cape|maid|kimono|yukata/i;
/**
 * Names that mean an adjustment or a pose state rather than a garment on/off —
 * `裙子切换` (skirt lifted) and `毛衣挤压` (sweater squeeze) mention clothes
 * but are not outfits.
 */
const NOT_A_GARMENT =
  /切换|拖拽|挤压|调整|物理|摇|晃|揺れ|压|掀|drag|squeeze|adjust|physics|sway|swing|lift|press/i;
/** Ids costume switches tend to get from Cubism Editor: `ParamC0`, `ParamC1`… */
const COSTUME_ID = /^ParamC\d+$/i;

/** Entries from model3.json: `{ name, url, parameters, isFace }`. */
let available = [];

/**
 * What each slot is holding.
 *
 * Two slots rather than one list because the features have different
 * lifetimes: an outfit stays until changed, a face is often temporary (a poke
 * reaction lasting two seconds). Keeping them apart means clearing one cannot
 * disturb the other.
 */
const slots = {
  outfit: { name: null, parameters: null },
  face: { name: null, parameters: null }
};

/** Order matters: a face is applied over an outfit, never under it. */
const SLOT_ORDER = ['outfit', 'face'];

/**
 * Loads and classifies every expression the model declares.
 */
export async function loadModelExpressions(modelUrl) {
  available = [];
  clearSlot('outfit');
  clearSlot('face');

  if (!modelUrl) return [];

  try {
    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const settings = await response.json();
    // A missing list and an empty one mean the same thing here, and both
    // still leave the parameter-based outfits below worth looking for.
    const declared = settings?.FileReferences?.Expressions;
    const entries = Array.isArray(declared) ? declared : [];

    const baseUrl = modelUrl.slice(0, modelUrl.lastIndexOf('/') + 1);
    const listed = entries
      .filter((entry) => entry && typeof entry.File === 'string')
      .map((entry, index) => ({
        name:
          typeof entry.Name === 'string' && entry.Name !== ''
            ? entry.Name
            : 'Expression ' + (index + 1),
        url: baseUrl + entry.File,
        parameters: null,
        isFace: false
      }));

    // Fetched up front rather than on demand, because which popup an entry
    // belongs in depends on what is inside it — and a popup cannot list its
    // entries before it knows which are its own. The files are a few hundred
    // bytes each and are read once per model load.
    await Promise.all(
      listed.map(async (entry) => {
        try {
          const file = await fetch(entry.url);
          if (!file.ok) throw new Error('HTTP ' + file.status);
          entry.parameters = readExpression(await file.json());
          entry.isFace = looksLikeFace(entry.parameters);
        } catch (error) {
          // Keep the entry: it is still listed in model3.json, and a failed
          // read is better surfaced as an entry that does nothing than as one
          // that silently vanished. Unclassified entries count as outfits, the
          // more conservative of the two — applying one cannot disturb a face.
          debugLog('Expression unreadable: ' + entry.name);
        }
      })
    );

    available = listed;

    // Models that ship no outfit files often still carry the switches: one
    // parameter per costume (`ParamC0` 常服, `ParamC1` 睡衣…) that the
    // author's own motions flip. Offer those as outfits, so a model with an
    // empty `Expressions` list is not a model with nothing to wear.
    if (!available.some((entry) => !entry.isFace)) {
      available.push(...(await parameterOutfits(settings, baseUrl)));
    }

    const faces = available.filter((entry) => entry.isFace).length;
    debugLog(
      'Model expressions: ' + available.length + ' (' + faces + ' faces, ' +
      (available.length - faces) + ' outfits)'
    );
    return available.map((entry) => entry.name);
  } catch (error) {
    debugLog(
      'Expression list unavailable: ' + (error && error.message ? error.message : String(error))
    );
    return [];
  }
}

/**
 * Names the model declares in model3.json, in file order.
 *
 * Outfits synthesised from parameters are left out: they are not files the
 * author listed, and the Expression popup relies on this to tell "the files
 * are all costumes" apart from "there are no files".
 */
export function expressionNames() {
  return available.filter((entry) => !entry.synthetic).map((entry) => entry.name);
}

/**
 * Names that read as facial expressions.
 *
 * What the expression popup lists. A model shipping only garment switches
 * returns nothing here, which is the honest answer — showing its outfits under
 * "Biểu cảm" would offer the same clothes twice under two different labels.
 */
export function faceNames() {
  return available.filter((entry) => entry.isFace).map((entry) => entry.name);
}

/**
 * Names that do not read as facial expressions.
 *
 * What the outfit popup lists. Everything that is not a face lands here,
 * including entries we could not read — an unknown entry is likelier to be a
 * costume than a face, and mislabelling one as a face would let it fight the
 * mood system for the eyes.
 */
export function outfitEntryNames() {
  return available.filter((entry) => !entry.isFace).map((entry) => entry.name);
}

/** What a slot is currently holding, or null. */
export function activeIn(slot) {
  return slots[slot]?.name ?? null;
}

/**
 * Applies one entry into a slot, fetching its file the first time.
 *
 * Returns false when it could not be applied, so a caller can leave the UI
 * alone rather than showing a selection that did not take.
 */
export async function applyToSlot(slot, name) {
  if (!slots[slot]) return false;
  const entry = available.find((candidate) => candidate.name === name);
  if (!entry) return false;
  // A face in the outfit slot would be held permanently and fight the mood
  // system; a costume in the face slot would change clothes on every mood.
  if (slot === 'face' && !entry.isFace) return false;

  // Normally already read at load; this retries an entry whose file was
  // unreachable then, so a transient failure does not disable it for the
  // session.
  if (!entry.parameters) {
    try {
      const response = await fetch(entry.url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      entry.parameters = readExpression(await response.json());
      entry.isFace = looksLikeFace(entry.parameters);
    } catch (error) {
      debugLog(
        'Expression load failed: ' + (error && error.message ? error.message : String(error))
      );
      return false;
    }
  }

  slots[slot].name = name;
  slots[slot].parameters = entry.parameters;
  debugLog(slot + ': ' + name + ' (' + entry.parameters.length + ' params)');
  return true;
}

/** Empties a slot, dropping back to what the moc itself specifies. */
export function clearSlot(slot) {
  if (!slots[slot]) return;
  const parameters = slots[slot].parameters;
  slots[slot].name = null;
  slots[slot].parameters = null;

  // An Overwrite value has nothing underneath to fall back to: no motion or
  // preset writes a costume switch, so once we stop writing it the model would
  // simply keep the last outfit on. Put the moc's own defaults back once.
  if (parameters) {
    restoreDefaults(parameters.filter((entry) => entry.blend === 'Overwrite'));
  }
}

function restoreDefaults(parameters) {
  const core = state.model?.internalModel?.coreModel;
  if (!core || parameters.length === 0) return;
  for (const { id } of parameters) {
    try {
      const index = core.getParameterIndex(id);
      // A stale cdi3 can name a parameter the moc no longer has; the index
      // then points past the table and the default reads as undefined.
      const value = index >= 0 ? core.getParameterDefaultValue(index) : NaN;
      if (Number.isFinite(value)) core.setParameterValueById(id, value);
    } catch {
      // Parameter absent from this model — nothing to restore.
    }
  }
}

/**
 * Applies both slots, once per frame.
 *
 * Re-applied continuously rather than set once because everything else in the
 * pipeline — idle motions, the mood presets, physics — rewrites parameters
 * every frame. A value written once survives only until the next motion sample
 * touches it, which for an idle animation is immediately.
 *
 * Must run after `updateExpressionTick()`: where a mood preset and a model's
 * own expression both claim a parameter, the model's file is the more specific
 * statement and should win.
 */
export function updateModelExpressionTick() {
  const core = state.model?.internalModel?.coreModel;
  if (!core) return;

  for (const slot of SLOT_ORDER) {
    const parameters = slots[slot].parameters;
    if (!parameters) continue;

    for (const { id, value, blend } of parameters) {
      try {
        // Add and Multiply compose with whatever the pipeline already put
        // there, which is what lets a smile ride on top of a talking mouth.
        // Overwrite ignores it, which is what an outfit switch needs.
        if (blend === 'Overwrite') {
          core.setParameterValueById(id, value);
        } else if (blend === 'Multiply') {
          core.multiplyParameterValueById(id, value);
        } else {
          core.addParameterValueById(id, value);
        }
      } catch {
        // Parameter absent from this model — the file came from another one.
      }
    }
  }
}

/**
 * Outfits read from the model's parameters, for a model that ships no outfit
 * files.
 *
 * Game-exported models commonly hold one costume switch per outfit in the moc
 * and flip them from motions, with nothing listed under `Expressions`. The
 * parameter list comes from cdi3.json (the model's DisplayInfo), which is also
 * where the human-readable names live. Each qualifying parameter becomes an
 * entry that overwrites itself to "on"; parameters whose ids differ only by a
 * trailing number (`ParamC0`…`ParamC3`) are treated as one wardrobe, so
 * choosing one turns the rest off — the same thing the author's motions do.
 * The outfit already worn by default is not listed: the "Default" row is it.
 */
async function parameterOutfits(settings, baseUrl) {
  const core = state.model?.internalModel?.coreModel;
  const displayInfo = settings?.FileReferences?.DisplayInfo;
  if (!core || typeof displayInfo !== 'string' || displayInfo === '') return [];

  let cdi;
  try {
    const response = await fetch(baseUrl + displayInfo);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    cdi = await response.json();
  } catch (error) {
    debugLog(
      'DisplayInfo unavailable: ' + (error && error.message ? error.message : String(error))
    );
    return [];
  }

  const candidates = [];
  for (const parameter of Array.isArray(cdi?.Parameters) ? cdi.Parameters : []) {
    if (!parameter || typeof parameter.Id !== 'string') continue;
    const label = typeof parameter.Name === 'string' ? parameter.Name.trim() : '';
    const looksLikeCostume = COSTUME_ID.test(parameter.Id) || CLOTHING_NAME.test(label);
    if (!looksLikeCostume || NOT_A_GARMENT.test(label)) continue;

    let index;
    try {
      index = core.getParameterIndex(parameter.Id);
    } catch {
      continue;
    }
    if (typeof index !== 'number' || index < 0) continue;
    const min = core.getParameterMinimumValue(index);
    const max = core.getParameterMaximumValue(index);
    if (!(max > min)) continue;
    candidates.push({
      id: parameter.Id,
      label: label || parameter.Id,
      min,
      max,
      def: core.getParameterDefaultValue(index),
      family: parameter.Id.replace(/\d+$/, '')
    });
  }
  if (candidates.length === 0) return [];

  const byFamily = new Map();
  for (const candidate of candidates) {
    if (!byFamily.has(candidate.family)) byFamily.set(candidate.family, []);
    byFamily.get(candidate.family).push(candidate);
  }

  const entries = [];
  for (const candidate of candidates) {
    // Already worn: choosing it would change nothing, and "Default" gets back to it.
    if (candidate.def >= candidate.max) continue;
    const siblings = byFamily.get(candidate.family).filter((other) => other !== candidate);
    const parameters = [{ id: candidate.id, value: candidate.max, blend: 'Overwrite' }];
    for (const sibling of siblings) {
      parameters.push({ id: sibling.id, value: sibling.min, blend: 'Overwrite' });
    }
    // Two parameters can share a display name; keep the entries distinguishable.
    const taken = entries.some((entry) => entry.name === candidate.label);
    entries.push({
      name: taken ? candidate.label + ' (' + candidate.id + ')' : candidate.label,
      url: null,
      parameters,
      isFace: false,
      synthetic: true
    });
  }
  debugLog('Parameter outfits: ' + (entries.map((entry) => entry.name).join(', ') || '(none)'));
  return entries;
}

/**
 * Whether a file's parameters describe a face rather than a costume.
 *
 * Live2D gives the two no separate types — both are an `.exp3.json` in the same
 * list — so the only way to tell them apart is what they touch. A file that is
 * mostly eyes, brows and mouth is a face; one that switches `ParamC1` is
 * clothing. Getting this wrong is visible: without it the expression popup
 * lists a model's pyjamas.
 */
function looksLikeFace(parameters) {
  if (!parameters || parameters.length === 0) return false;
  const facial = parameters.filter((entry) => FACE_PARAMETER.test(entry.id)).length;
  return facial / parameters.length > FACE_RATIO;
}

/**
 * Reads an exp3.json into a flat list of parameter writes.
 *
 * Blend mode is carried through rather than flattened because the three modes
 * are not interchangeable: model-authored faces are written as `Add` (offsets
 * from the resting pose) and `Multiply` (an eye closed by scaling its open
 * value to zero), while outfit switches written by a tool are `Overwrite`
 * (the garment is on or it is off). Collapsing them all to Overwrite would
 * make a smile fight the lip-sync; collapsing to Add would leave two outfits
 * half-drawn.
 *
 * `Add` is the default for an entry with no `Blend`, matching Cubism.
 */
function readExpression(document) {
  const list = document?.Parameters;
  if (!Array.isArray(list)) return [];

  const parameters = [];
  for (const entry of list) {
    if (!entry || typeof entry.Id !== 'string') continue;
    const value = Number(entry.Value);
    if (!Number.isFinite(value)) continue;
    parameters.push({
      id: entry.Id,
      value,
      blend: entry.Blend === 'Overwrite' || entry.Blend === 'Multiply' ? entry.Blend : 'Add'
    });
  }
  return parameters;
}
