# Third-Party Notices

Anime Companion bundles or interfaces with the following third-party assets and SDKs. Each block lists the source, the applicable license/terms, and the attribution required.

---

## Live2D Cubism Core SDK

- **Files**: `media/lib/live2dcubismcore.min.js`, `media/lib/cubism4.min.js`, `media/lib/pixi.min.js` (bundles `pixi-live2d-display`)
- **Owner**: Live2D Inc.
- **License**: Live2D Proprietary Software License Agreement — distributed under the [Live2D SDK Release License](https://www.live2d.com/en/sdk/license/). Free for individuals and small-scale enterprises (annual sales below the threshold defined by Live2D Inc.). Above the threshold a Publication License Agreement is required.
- **Attribution**: © Live2D Inc. All rights reserved. "Live2D" and "Cubism" are trademarks of Live2D Inc.

## Live2D Sample Models — Hiyori, Haru, Mao, Miara

- **Files**:
  - `media/live2d/Hiyori/` — bundled in the .vsix (default model).
  - `Haru`, `Mao`, `Miara` — fetched on first selection from the `models-v1` GitHub Release tag (zip per model).
- **Owner**: Live2D Inc.
- **License**: [Free Material License Agreement](https://www.live2d.com/en/learn/sample/) + Sample Data Terms.
  - Commercial use permitted for general users / small-scale enterprises (per the per-year revenue threshold set by Live2D Inc. — verify current limit before crossing).
  - Erotic / violent / discriminatory contexts prohibited.
  - Re-distribution allowed only as part of an end product.
- **Attribution**: "Hiyori", "Haru", "Mao", "Miara" © Live2D Inc. — used under the Free Material License.

## VOICEVOX — Shikoku Metan voice

- **Files**: `media/audio/ja/*.mp3` (rendered audio clips)
- **Engine**: [VOICEVOX](https://voicevox.hiroshiba.jp/) by Hiroshiba Kazuyuki — engine output may be used for commercial and non-commercial purposes per [VOICEVOX terms](https://voicevox.hiroshiba.jp/term/).
- **Voice character**: 四国めたん (Shikoku Metan) — see [official profile](https://voicevox.hiroshiba.jp/dormitory/shikoku_metan/). Free for commercial use **only when the credit `VOICEVOX:四国めたん` is displayed**. Without credit a paid license is required.
- **Attribution (REQUIRED)**: `VOICEVOX:四国めたん` — shown in this file, the README, and the extension's About / Output channel.

---

## License of this extension's own code

The Anime Companion source code, configuration, and bundled assets that are not listed above are released under the [MIT License](./LICENSE). Third-party assets retain their original licenses.

If you are an upstream rights holder and find content here that should not be redistributed, please open an issue at https://github.com/xShiroeNguyenx/anime-companion-vscode/issues — we will remove it promptly.
