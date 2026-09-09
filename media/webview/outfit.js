import {
  activeIn,
  applyToSlot,
  clearSlot,
  loadModelExpressions,
  outfitEntryNames
} from './model-expressions.js';

/**
 * Outfit switching.
 *
 * A thin naming layer over model-expressions.js: on disk an outfit is just an
 * `.exp3.json` like any other, so the loading and per-frame work is shared.
 * What this module adds is the *slot* — an outfit persists until changed, while
 * a face may be temporary — and a vocabulary the rest of the webview can read.
 *
 * See model-expressions.js for how the two are told apart, given that the file
 * format does not distinguish them.
 */

/** Loads the list for a model. Shared with the expression popup. */
export const loadOutfits = loadModelExpressions;

/** Entries that are not facial expressions — the wearable ones. */
export const outfitNames = outfitEntryNames;

/** The outfit currently worn, or null for the model's default. */
export function activeOutfit() {
  return activeIn('outfit');
}

/** Wears one outfit, replacing any current one. */
export function setOutfit(name) {
  return applyToSlot('outfit', name);
}

/** Drops back to whatever the moc itself specifies. */
export function clearOutfit() {
  clearSlot('outfit');
}

/**
 * From the name an author gave a costume to a key the message files translate.
 *
 * Costume names are Chinese or Japanese far more often than English, and a
 * Vietnamese or English user cannot read `睡衣` in a menu. Only common
 * garments are covered; anything else shows as the author wrote it. Order
 * matters where one name contains another (`school uniform` before
 * `uniform`).
 */
const GLOSSARY = [
  [/常服|便服|私服|普段着|casual|normal/i, 'casual'],
  [/睡衣|寝巻|パジャマ|pajama|pyjama|sleepwear/i, 'pajamas'],
  [/毛衣|セーター|sweater|knit/i, 'sweater'],
  [/内衣|下着|underwear|lingerie/i, 'underwear'],
  [/校服|学生服|セーラー|school/i, 'schoolUniform'],
  [/制服|uniform/i, 'uniform'],
  [/泳装|泳衣|水着|swimsuit|bikini/i, 'swimsuit'],
  [/婚纱|ウェディング|wedding/i, 'weddingDress'],
  [/旗袍|チャイナ|qipao|cheongsam/i, 'qipao'],
  [/女仆|メイド|maid/i, 'maid'],
  [/浴衣|yukata/i, 'yukata'],
  [/和服|着物|kimono/i, 'kimono'],
  [/外套|コート|coat|jacket/i, 'coat']
];

/** The `outfits.*` message key for a costume name, or null when unknown. */
export function outfitGlossaryKey(name) {
  for (const [pattern, key] of GLOSSARY) {
    if (pattern.test(name)) return key;
  }
  return null;
}
