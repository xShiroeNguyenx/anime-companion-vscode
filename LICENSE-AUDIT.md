# License Audit — Pre-Marketplace Publication

> Internal record of the asset audit done before publishing to the VS Code Marketplace. Audit date: **2026-05-01**.
>
> ⚠️ This is engineering documentation, not legal advice. The decisions below are conservative defaults; if the project's stance changes, update this file and re-trigger the audit.

## Decision matrix

| Asset | Source | Verdict | Reason |
|---|---|---|---|
| Cubism Core SDK | Live2D Inc. | 🟢 KEEP | SDK Release License — bundling is the intended use for free tier. Add attribution. |
| Hiyori model | Live2D Inc. (sample) | 🟢 KEEP | Free Material License — commercial OK with attribution + non-prohibited content. |
| VoiceVox audio (Shikoku Metan) | hiroshiba.jp | 🟢 KEEP | Engine output free; voice OK with mandatory `VOICEVOX:四国めたん` credit. |
| `chaijun_3` (Cheshire / Azur Lane) | Yostar/Manjuu game asset | 🔴 REMOVE | Proprietary game IP. No fan-use license. Marketplace ToS requires distribution rights. |
| `Changli` (长离 / Wuthering Waves) | Kuro Games game asset | 🔴 REMOVE | [Kuro derivative policy](https://wutheringwaves.kurogames.com/p/en/produce.html) explicitly excludes software / commercial works. |
| `Tsubaki` (椿 / Camellya — WuWa) | shibutani on BOOTH | 🔴 REMOVE | Listing forbids streaming/monetization/resell. Plus Kuro IP issue (#Changli). |
| `WhiteAngel` (曲奇小羊 / Cookie Lamb) | unknown creator | 🔴 REMOVE | No public license terms found. Cannot ship without written permission. |
| `Vivian` (薇薇安) | unknown — possibly HoYoverse-derivative | 🔴 REMOVE | No source / license identified. Risk of unknown IP infringement. |
| `IceGirl` (TianYeLuLu) | TianYeLuLu on BOOTH | 🟡 CONTACT or REMOVE | BOOTH terms allow commercial use with credit, but ban "secondary distribution". Bundling in an extension is closer to redistribution than VTuber use. |

## Effective bundle for Marketplace v1

Only **Hiyori** ships in the `.vsix`. The other 6 model folders that previously fetched lazily from the GitHub Release **must also be removed from the public Release tag `models-v1`** before Marketplace publish — Marketplace ToS attaches to bundle-and-fetch flows when they are presented as part of the extension experience.

Until creators / IP holders give explicit redistribution rights, the lazy-load feature ships disabled (no model in the picker beyond Hiyori), or the picker only offers Hiyori. The `ModelDownloader` code stays in place so it can be re-enabled per-model when a license is secured.

## Required actions before publish

- [ ] Remove all non-Hiyori model folders from local `media/live2d/` working tree (or keep but excluded via `.vscodeignore` — already done).
- [ ] Trim `MODEL_MAP` in [src/models.ts](src/models.ts) so the picker only offers Hiyori. Other entries stay in code, gated behind a setting `animeCompanion.experimentalModels: false` (default), so future re-enable is a one-line flip when licenses arrive.
- [ ] Delete the GitHub Release tag `models-v1` (or replace with a Hiyori-only / empty release) — the public assets there are now dead links.
- [ ] Update default `animeCompanion.modelDownloadBaseUrl` to point to a placeholder, or remove the setting entirely if no model uses it for v1.
- [ ] Add `VOICEVOX:四国めたん` credit to README and the extension's Output channel banner.
- [ ] Add Live2D / Hiyori attribution to README.
- [ ] Add a section in README explaining why only one model is shipped (set expectation).

## Optional follow-up (post v1)

- [ ] Reach out to **TianYeLuLu** ([BOOTH](https://booth.pm/en/items/5975192)) for written permission to bundle IceGirl with credit. If granted, lift IceGirl back into the picker.
- [ ] Identify / contact creators of **Vivian** and **WhiteAngel** if you can locate them.
- [ ] Commission or self-create new models with explicit "VS Code extension distribution OK" license. Could be a community pipeline ("submit your model for inclusion").
- [ ] Re-check Live2D Sample model gallery — additional free-license models exist (Mark, Mao, Wanko, etc.) and can replace removed ones.

## References

- [Live2D SDK License](https://www.live2d.com/en/sdk/license/)
- [Live2D Free Sample Models](https://www.live2d.com/en/learn/sample/)
- [Wuthering Waves Derivative Works Guidelines](https://wutheringwaves.kurogames.com/p/en/produce.html)
- [Ice Girl on BOOTH (TianYeLuLu)](https://booth.pm/en/items/5975192)
- [Camellya 11月椿 on BOOTH](https://booth.pm/ja/items/6313490)
- [VOICEVOX Terms](https://voicevox.hiroshiba.jp/term/)
- [Shikoku Metan profile](https://voicevox.hiroshiba.jp/dormitory/shikoku_metan/)
