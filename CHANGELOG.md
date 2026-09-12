# Changelog

Tài liệu này theo format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
extension áp dụng [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.1] - 2026-09-12

### Fixed — 🚶 She shows the right character when several windows are open

- **With two or three VS Code windows each on a different model, the one standing in your editor could be the wrong character.** The panel renders whichever model the window resolves — and a window with a folder open can pin its own, stored in workspace state. The wander asked plain configuration instead, which cannot see that pin, so a pinned window requested frames for the *globally* configured model while the panel photographed the character actually on screen. Those pixels were then filed under the other model's name, in a frame cache every window on the machine shares — so the wrong character persisted, across restarts, for every window. The wander now resolves the model through exactly the call the view uses ([src/wander.ts](src/wander.ts)).
  - **The panel refuses to be misquoted.** A capture request naming a model the webview is not showing is rejected instead of honoured, which closes the same hole during the moment a view is reloading after a switch ([media/webview/main.js](media/webview/main.js)).
  - **Late frames are dropped, not written.** A capture takes about a second, and if the model changes inside it the returning frames are discarded rather than allowed to overwrite a correct cache entry ([src/wander.ts](src/wander.ts)).
  - **Switching models now clears her frames.** This was wired up but never called, so after a switch she could keep standing in the editor as the previous character while the panel already showed the new one. Covers the workspace pin too, which fires no configuration event ([src/extension.ts](src/extension.ts)).
  - **Frames cached before this fix are discarded on upgrade.** A file may hold a different character than its name claims and there is no way to tell by looking, so the whole cache is recaptured once.

### Fixed — 🚶 The wander sprite stops twitching

- **The character standing in the editor no longer jumps between frames.** Two separate causes, both in the capture:
  - **Every frame is now cropped to one shared box.** Each was previously trimmed to its own opaque bounds, and since her silhouette changes as she breathes, the box changed size from frame to frame — so the decoration re-centred her inside it and she twitched a few pixels on every swap. The union of all four poses' bounds is now used for all of them, which is what actually holds her still ([media/webview/main.js](media/webview/main.js)).
  - **The cut between poses is now a dissolve.** A decoration's image cannot be transitioned — swapping it replaces the DOM element, and a new element renders at its final style, so no CSS would ever animate the change. The cross-fade is therefore baked into the pixels: three blended images are generated between each pair of poses and the cycle wraps, turning the existing "show each image in turn" loop into a fade. Frames are held proportionally shorter so the poses still land at the same spacing ([src/wander.ts](src/wander.ts)).
- **Cached frames from 0.6.0 are recaptured once, and swept.** The old files are hard cuts cropped to their own bounds, so reusing them would leave the twitch in place for anyone upgrading; they are now ignored by name and deleted from global storage.

### Changed

- **She shrinks into the floor on her way out of the panel, instead of simply fading.** A plain opacity fade said only that she was gone; getting smaller first says where she went — down and away, on her way to the editor. The shrink runs over 700ms rather than the old 420, because at the shorter length a departure reads as a blink. Applied to the canvas alone, so the drag pads, speech bubble and quickchat panel do not ride along with it, and as a display transform only, so the model never needs refitting ([media/webview/main.js](media/webview/main.js)).
- **One decoration type per frame is created once and reused,** rather than built and disposed on every swap — the dissolve raised the swap rate roughly fourfold, and the style depends only on the box size ([src/wander.ts](src/wander.ts)).
- **The frame cache keeps three models, not every model you have ever tried.** One set is sixteen PNGs, just under a megabyte, and trying characters out is a two-click operation — so previewing a hundred of them used to leave a hundred sets on disk forever, around a hundred megabytes of characters nobody would look at again. The least recently *used* set is now evicted past three, counting reuse and not just capture, so the model you actually work with is not thrown away by an afternoon of browsing. The set in use is never evicted, and sets are only ever removed whole ([src/wander.ts](src/wander.ts)).
- **Frames are captured at 450px rather than 560.** One message now carries sixteen PNGs instead of four, and a blend compresses worse than a pose; 450 is still comfortably above the ~300px she is drawn at, which is all the cap has to guarantee ([media/webview/main.js](media/webview/main.js)).

## [0.6.0] - 2026-09-10

### Added — 🚶 She wanders into your code

- **Left alone for a few minutes, the companion steps out of her panel and turns up at the bottom-left of the editor.** She fades out of the panel, appears standing in the corner of the code for ten seconds, then goes home. Typing, moving the cursor or switching files brings her back at once — she visits the gaps, never the work ([src/wander.ts](src/wander.ts)).
  - **She is drawn from frames of her own idle animation.** VS Code gives an extension no way to float live content over a text editor; the one sanctioned channel is a text decoration holding a still image. So four frames are captured from the running Live2D model a beat apart and cycled slowly — enough movement to read as breathing rather than as a photograph pasted into the window. The capture happens once per model and is kept on disk.
  - **The panel is never hidden while she is away.** Toggling the view would tear the webview down and reloading the model on the way back would stall visibly; instead the character inside the panel fades and the panel itself stays exactly where it is, so her return is instant.
  - **She holds the corner while you scroll.** A decoration has to hang off a line of the document, so the anchor is recomputed as the viewport moves and she appears to stay put in the corner while the text runs past behind her. Scrolling counts as reading, not activity, so she is not chased away by it.
- **New settings** — `animeCompanion.wander.enabled` (default on), `animeCompanion.wander.idleMinutes` (3), `animeCompanion.wander.staySeconds` (10) and `animeCompanion.wander.sizePx` (300).

## [0.5.9] - 2026-09-10

### Added — 🌱 She does things when you are not looking

- **Between interactions the companion now acts on her own.** Every 40 to 90 seconds she performs one small unprompted beat — a yawn, a stretch, a look around the room, a curious head tilt, a hum, a glance over at you and away again, or a moment of daydreaming — instead of looping one idle animation forever. What it adds is not animation but *decisions*: a loop is a video, and something that chooses is a person. Where the model ships a hand-drawn motion that matches (a group called `打哈欠` really is a yawn) that motion plays; otherwise the beat is a mood preset plus a gaze nudge, which every rig can do ([media/webview/idle-life.js](media/webview/idle-life.js)).
  - **It happens in the gaps, not over you.** Any touch on the model pushes the next beat 25 seconds out, and nothing plays while a panel, a menu or the chat is open, or while the tab is hidden.
  - **It fits the hour and the mood.** Between 22:00 and 05:00 the yawns and eye-rubs become much more likely; while the host reports a `happy` mood the bored fidgets fall away and the cheerful ones rise. Weights rather than rules, so the order stays unpredictable, and the last two beats are excluded from the next draw — seeing the same gesture twice in a row is what gives a timer away.
- **New setting `animeCompanion.idleLife.enabled`** (default on).

### Added — 🫳 Pull her, and she springs back

- **Dragging now pulls the character herself out of place, and lets her go home again.** Press and drag and she stretches after the cursor — a little over half its travel, capped so she can never be thrown off the panel. **Stop with the button still down and she stays exactly where you are holding her**, breathing and swaying as normal but not drifting back. Let go and a spring pulls her home in about nine tenths of a second, overshooting slightly so she rebounds into place rather than gliding to a halt. The drawing moves through the sprite pivot rather than its x/y, which the layout owns and rewrites on every resize, so pulling her about never fights with the panel fitting her in ([media/webview/sway.js](media/webview/sway.js)).
- **New setting `animeCompanion.dragMode`** — `character` (default) for the above, or `panel` for the previous behaviour, where a drag moved the whole companion container and left it at the new spot.
- **The lean and the trailing hair come along with it.** She leans against the direction she is pulled, and because the lean is written into the body-angle parameters that the model's **own physics rig** takes as input, her hair and skirt trail behind on their own — no new animation, just the simulation every Live2D model already ships. Let go and the lean springs back through upright, overshoots by around ten degrees, and settles through three diminishing swings the way a person recovers their balance. The spring is deliberately soft: a stiffer one of the same amplitude swung at nearly 4 Hz, which reads as a buzz rather than a body, so it is tuned to about 2 Hz — a full swing every half second — and settles in three quarters of a second ([media/webview/sway.js](media/webview/sway.js)).
  - While your hand moves, the lean follows *speed*, so a fast carry leans harder than a slow one. **Stop with the button still down and she stays pulled over**, held at an angle set by how far she has been carried, until you let go — a hold keeps the pose instead of letting her stand up out of your grip. (Speed alone could not do this: almost everyone slows down before stopping, so reading the final speed would drop a long, hard drag back to almost upright the moment the hand eased off.)
  - The values are added on the `afterMotionUpdate` event, the one point in the model's update that is after the idle motion and before physics. Writing them any later (a plain ticker callback) tilts the body while the hair stays put, which is the one thing the feature exists to avoid; adding rather than setting leaves the breathing sway intact underneath.
- **New setting `animeCompanion.dragMomentum.enabled`** (default on). Panel mode only — in the Desktop Companion the OS owns the window drag and the webview never sees the movement.

## [0.5.8] - 2026-09-10

### Added — 👉 Hints that point at the press-and-hold spots

- **Left alone for a while, the companion shows how to use the hold gestures.** After about a minute with no interaction, a small pill appears beside the character with a dashed arrow and a pulsing ring on the exact spot to hold — "hold here a moment and I'll change outfits" pointing at the body, then "hold here a moment to see my expressions & motions" pointing at the head, staying up for 40 seconds (any touch on the model dismisses it sooner) and alternating again about a minute after the previous one fades. The arrow is thick and glowing, its dashes march toward the spot and the whole arrow nudges in that direction, while the spot itself breathes with a soft glow, rippling rings and a blinking dot — so the eye lands where the finger should before the text is read. The pill is placed out in the margin beside the character — measured from the model's edge rather than its centre line, flipping sides only when the other margin can actually hold it clear, and pinned to the panel edge when neither can, so at worst it covers the outer edge of the hair instead of sitting across the face. Clicking the pill opens that panel directly. A hint rests for the rest of the session once the user performs that hold (or clicks the pill), and comes back on the next load; a hint is skipped when the model has nothing to point at (no outfits, or no expressions and motions), and none appear while a panel, menu or the chat is open ([media/webview/hints.js](media/webview/hints.js), [media/companion.css](media/companion.css), [media/webview/interaction.js](media/webview/interaction.js)).
- **New setting `animeCompanion.hints.enabled`** (default on) to turn the hints off, read by the panel and the Desktop Companion alike. Listed under Model & Appearance in the settings page.
- **i18n** — `hints.holdBody`, `hints.holdHead` across en/vi/ja.

### Added — 🖐️ The character answers where you point

- **Resting the cursor on a part of the character now gets a reaction from that part.** The head gets a shy, pleased look; the chest or the skirt gets a flustered one and the gaze flicks away; the body gets a small pleased answer; a hand waves back where the model has a hand motion to play. Only a **pause** counts — about half a second on the same part, so a cursor crossing the model on its way elsewhere fires nothing — and each part then rests about nine seconds, so hovering is never a loop. Nothing reacts while a panel, the chat or the radial menu is open, or during a drag, an Alt-rotate or a press-and-hold ([media/webview/hover.js](media/webview/hover.js), [media/webview/interaction.js](media/webview/interaction.js)).
- **A caption says, in her own voice, what the part invites** — "hold here a moment and I will change outfits for you~" over the body, "hold here a moment, I will show you my faces" over the head, and a flustered refusal over the parts she would rather you left alone. The press-and-hold gestures are discoverable by pointing at them rather than only by waiting for an idle hint, and because the line is spoken rather than labelled, reading it is part of the character instead of an interruption from the interface. The caption sits **beside** the character rather than over it, on whichever side has room (under the model when neither side does), on an opaque dark pill: over hair and fabric the text could not be read, and the parts most worth labelling are exactly the ones with the busiest background.
- **Every part has a cursor of its own, drawn in the heart cursor's family.** The pink arrow tip and tail stay — that is what makes it the companion's pointer — and the icon in the middle changes with the part underneath: a **comb** over the hair, a **dress** over the body, a **barred heart** over the chest and a **barred bow** over the skirt, an **open hand** over hers. So the pointer says what a part does before the caption has to, and the two refusals read as refusals at a glance. The parts themselves are cut from the **drawn** figure — the union of the model's visible meshes, measured through the library's own hit-test transforms — rather than from the Live2D canvas, whose transparent margins had left the arm zones hanging in empty air beside the character. The cursors are inline SVG in [media/companion.css](media/companion.css), generated by [scripts/gen-cursors.js](scripts/gen-cursors.js) which also writes a preview page for checking them at native size.
- **An outline shows what is touchable.** The part under the cursor is traced with a soft dashed outline for a couple of seconds. It only guides while the model is new (the first two minutes of a session), then stops, since by then it is only in the way.
- **Three gestures the cursor can perform on a part, not just rest on it.** **Tickling** — scrub the cursor back and forth across the waist or body and she laughs; it counts direction reversals rather than distance, so a straight sweep across the model never triggers it, and it unlocks the secret **Ticklish**. **Stroking her hair** — move slowly and repeatedly across the head, the way a hand actually pats someone; every stroke counts toward the new **Head Pat Chain** (Gentle Hands 25 / Hair Whisperer 100 / Keeper of Silk 500), while the bubble and hearts are rate-limited so a minute of petting is not a minute of bubbles. **Taking her hand** — once she has noticed the cursor resting on an arm, a small deliberate move takes the offered hand and plays the model's hand motion if it has one. Each has its own cooldown, and all three go quiet behind an open panel ([media/webview/hover.js](media/webview/hover.js), [src/stats.ts](src/stats.ts), [src/companion-message-dispatcher.ts](src/companion-message-dispatcher.ts)).
- **New setting `animeCompanion.hoverReactions.enabled`** (default on) to turn all of it off, read by the panel and the Desktop Companion alike. Listed under Model & Appearance in the settings page.
- **i18n** — `hover.head`, `hover.chest`, `hover.body`, `hover.skirt`, `hover.arm`, `bubbles.tickle`, `bubbles.hairPet`, `bubbles.handshake` across en/vi/ja.

### Changed — 🏆 Achievements in the two side columns

- **Achievements now open as the same two side columns as Outfit / Expression / Motion / Model** instead of a centered card over the character: achievements on the left (one lane per chain, then the secret ones, with tier and rarity chips, status and the ☆ Showcase toggle), quests and memories on the right, the character in full view between them. Like the other side panels it stays open until the **×** (or Esc) — a showcase can be toggled and compared without reopening — and a showcase toggle or an unlock pushed by the host redraws the columns in place, keeping each column's scroll position. The cards are shrunk to the column and tinted sakura like the other rows; unlocked cards go green, the showcased one carries the pink ring ([media/webview/interaction.js](media/webview/interaction.js), [media/companion.css](media/companion.css)). The old centered card and its CSS are gone.
- **i18n** — `panels.questsEmpty` across en/vi/ja.

## [0.5.7] - 2026-09-09

### Changed — 🌸 Markdown editor header slimmed down

- The editor header is now toolbar-sized — 30 px tall instead of a banner: 4 px vertical padding, a 13 px flower, an 11.5 px title, 22 px round buttons and a compact Save, with a 1 px rule and a softer shadow. The Toast UI formatting toolbar under it is scaled to the same ~30 px (its icons are a fixed sprite, so the bar is zoomed as a whole). Same look, less of it, so the document gets the room ([media/webview/markdown-editor.css](media/webview/markdown-editor.css)).

### Fixed

- **A showcased achievement no longer crushes the chat panel.** In the split chat layout the companion container becomes a flex row; the bubble and status bar were hidden there but the showcase pill was not, and its non-shrinking content width ("Sovereign of Stamina · LEGENDARY") pushed the chat panel down to a sliver. The pill now hides while chat is open, like the bubble; the view header keeps showing the showcased title ([media/webview/chat.css](media/webview/chat.css)).

### Added — ⚙️ A settings page of the companion's own

- **Right-click › Settings (and `Anime Companion: Open Settings`) now opens a themed settings panel instead of the native Settings UI filtered to the extension.** The native list shows our ~80 keys alphabetically under one heading; the panel reads the very same schema from package.json — nothing is declared twice — and lays it out in sections (Model & Appearance, Voice & Sound, Messages & Reactions, Pomodoro, Cursor Chibi, AI Chat, Desktop Companion, Other) with a search box, a control per type (switch, segmented picker or dropdown for enums, slider + number, text, a JSON editor with validation for lists and maps), the default value and a ↺ reset on every item, and a note when a workspace overrides a value. Writes go to user settings exactly as the native UI would, values update in place as they change, and the page re-localizes live with `messageLanguage` ([src/settings-panel.ts](src/settings-panel.ts), [media/webview/settings-panel.js](media/webview/settings-panel.js), [media/webview/settings-panel.css](media/webview/settings-panel.css)).
  - The Background Image section hands off to its own control panel; VS Code's Settings UI and `settings.json` stay one click away in the header for anything unusual.
  - Setting titles are derived from the keys and descriptions come from package.json, so they read in English whatever the message language; the page chrome (sections, buttons, notes) is localized — `settingsPanel.*` across en/vi/ja.

### Added — 🎡 Radial right-click menu

- **Right-click now fans the menu out on a ring around the cursor** instead of dropping a vertical list: nine icons (Run, the seven categories, Settings) on a circle, the hovered entry's name in a pill at the centre. Picking a category replaces the ring with that category's entries and turns the centre pill into a **↩ back** button — one ring deep on purpose, since the panel is ~330 px wide and a second, outer ring would not fit. A second right-click, a click outside, or Esc closes it; choosing an entry closes it too ([media/webview/radial-menu.js](media/webview/radial-menu.js), [media/companion.css](media/companion.css)). Near an edge the ring's centre is pulled inward so the whole ring stays on screen, and a small window (the desktop pet) gets a smaller ring.
  - Purely a shell: every entry carries the same action id the list menu uses and runs through the same dispatcher, so Mute / Unmute and the look-at check read their live state exactly as before ([media/webview/interaction.js](media/webview/interaction.js)).
- **New setting `animeCompanion.menuStyle`** — `radial` (default) or `list` for the classic vertical menu. Read by the panel and the Desktop Companion alike ([src/companion-view.ts](src/companion-view.ts), [src/desktop-pet-bridge.ts](src/desktop-pet-bridge.ts), [desktop-pet/web/index.html](desktop-pet/web/index.html)).
- **i18n** — `menu.radialTitle`, `menu.radialBack` across en/vi/ja.

### Changed — ↔️ Side columns: the model picker joins them, close button at the bottom, full titles

- **Change Model now opens as the same two side columns as Outfit / Expression / Motion** (Appearance › Model): the list is split evenly across the two columns with the current model highlighted, and picking one switches immediately as before. The old centred model card and its styles are gone ([media/webview/interaction.js](media/webview/interaction.js), [media/companion.css](media/companion.css)).
- **Each column is now header / scrolling body / footer.** Only the body scrolls, so the **×** — moved from the header to the **bottom of the right column** — stays in reach however long the list is; the left footer holds an equal-height spacer so both columns keep the same layout. Titles have the whole column width and wrap on a narrow column instead of being cut to "Mot…".
- **A clicked motion row shows it.** Motions have no state to reflect, so the row itself lights up, pulses twice and stays highlighted as "last motion played" until another is chosen, with a small bubble naming it (`bubbles.motionPlayed`). Before, a click on a motion left the list looking untouched, which read as "didn't work" ([media/webview/interaction.js](media/webview/interaction.js), [media/companion.css](media/companion.css)).
- **A model switch announces what the model ships** — one bubble with the outfit / expression / motion counts and a nudge to press and hold, shown once per model (remembered in webview state, so a reload of the same model stays quiet). It is **held for nine seconds**: `showBubble()` gained a `holdMs` option, and an ordinary bubble arriving during a hold — the greeting the host sends four seconds after a render — now waits its turn instead of replacing the held one a moment after it appeared ([media/webview/ui.js](media/webview/ui.js)). The host's own "Switched to model …" bubble is gone; it was unlocalized and only competed for the same stage. `bubbles.modelInventory` across en/vi/ja.
- **The view header shows the model's name** — "🌸 Anime Companion: Hiyori" instead of "Anime Companion: Anime Companion"; the title follows every model switch and still yields to a showcased achievement ([src/companion-view.ts](src/companion-view.ts)).

## [0.5.6] - 2026-09-09

### Changed — ↔️ Outfit, Expression and Motion open beside the character, not over it

- **The three lists (and the press-and-hold panel) are now two slim columns at the sides of the character instead of a card centred over it.** With eleven motions listed, the old popup hid the very model it was meant to dress; the columns leave the middle free, so the effect of a row is visible the moment it is chosen ([media/webview/interaction.js](media/webview/interaction.js), [media/companion.css](media/companion.css)). The two columns come from one 3-track grid, so they are always the same width and height, with the title centred in both. A single list (Outfit, Expression or Motion from the Appearance menu, or a hold on the body) is split evenly, first half left and second half right, under the same title on each side; a hold on the **head** puts the model's **expressions on the left and motions on the right**.
  - **The panel stays open across choices** — comparing two outfits means clicking twice — and closes only with the **×** in the right column or **Esc**. Nothing closes on an outside click any more. Choosing a row redraws the active highlight in place.
  - Columns are `clamp(84px, 30%, 150px)` wide and stop 44 px above the bottom edge so the status row and chat button stay reachable. They scroll without a visible scrollbar, are drawn as mostly see-through sakura glass in the speech bubble's tint (the editor background shows through, so the columns read as an overlay rather than a wall), and rows are see-through too at 8 px / 6.5 px with theme-following text, so a column of eleven motions reads as a list rather than a stack of cards.
- **i18n** — `panels.sideClose` across en/vi/ja.

## [0.5.5] - 2026-09-09

### Added — 👗 Outfits & 😊 Expressions loaded straight from the model's own files

- **The companion now reads every expression file (`.exp3.json`) a Live2D model declares in its `model3.json` and offers them from the right-click menu — no configuration needed.** New [media/webview/model-expressions.js](media/webview/model-expressions.js) fetches the list (and each file) right after the model loads — not awaited, so a loaded model is never held back by a menu the user may not open — and sorts every entry into one of two kinds by *what parameters it drives*: an entry that is mostly eyes / brows / mouth / cheeks (`ParamEye*`, `ParamBrow*`, `ParamMouth*`, `ParamCheek*`, …) is a **facial expression**; everything else (author-named garment switches such as `ParamC1`, `ParamSkirtTr`) is an **outfit**. Live2D itself draws no line between the two — both are just `.exp3.json` in the same list — so this classification is what keeps a model's pyjamas out of the expression list. Entries whose file can't be read stay listed (as outfits, the conservative choice) and are retried on first use.
  - **👗 Outfit popup** (right-click › Appearance › **Outfit**) — lists the model's wearable entries plus a **Default** row that goes back to whatever the `.moc3` itself specifies ([media/webview/outfit.js](media/webview/outfit.js), [media/webview/interaction.js](media/webview/interaction.js), [media/companion.css](media/companion.css)). An outfit stays on until you change it — picking an expression or a mood change never takes the clothes off.
  - **😊 Expression popup** (Appearance › **Expression**) — shows one of the character's own drawn faces directly, bypassing the mood system; **Default** hands control back to the moods. A model with no expression files, or whose files all turned out to be costumes, gets a one-line explanation instead of an empty panel.
  - **Outfits from the model's parameters when it ships no outfit files** — many game-exported models hold one costume switch per outfit in the moc (`ParamC0` 常服, `ParamC1` 睡衣, `ParamC2` 毛衣, `ParamC3` 内衣…) and flip them from their own motions, with nothing under `Expressions`. When no `.exp3.json` outfit is found, the loader reads `cdi3.json` (the model's DisplayInfo), takes parameters whose id (`ParamC<n>`) or display name reads as clothing — skipping adjustment / pose switches such as `裙子切换` or `毛衣挤压` — and offers each as an outfit. Ids that differ only by a trailing number are one wardrobe: choosing one overwrites the others to their minimum, exactly what the author's motions do. The outfit worn by default is not listed twice; the **Default** row is it. Common names are translated through a small glossary (`睡衣` → Pajamas / Đồ ngủ / パジャマ, …) with the author's name kept as the tooltip; unknown names show as written (`outfits.*` strings, en/vi/ja).
  - **Default really restores the default** — clearing an outfit now writes the moc's default value back for every parameter the outfit overwrote. Previously the slot merely stopped writing and the last costume stayed on, because nothing else in the pipeline touches costume switches.
  - **Two slots, re-applied every frame** — outfit and face live in separate slots and are written from the PIXI ticker *after* the built-in mood presets (so the model author's file wins where both claim a parameter), honouring each parameter's blend mode — `Add` / `Multiply` for drawn faces so a smile rides on top of lip-sync, `Overwrite` for garment switches so an outfit is cleanly on or off. Deliberately *not* using Cubism's `ExpressionManager`, which writes the same parameters every frame and would fight the existing mood blending (flicker).
- **New setting `animeCompanion.expressionMap`** — lets the companion's *moods* use the model's own drawn faces instead of the built-in parameter presets. Keys are moods (`neutral`, `happy`, `shy`, `angry`, `surprised`, `sleepy`, `love`, `focus`), values are expression names from the model — either one flat map shared by every model (`{ "happy": "exp_02" }`) or a map keyed by model id (`{ "mao": { "happy": "exp_02" } }`; a per-model entry replaces the shared map for that model). Only entries classified as faces are accepted, so a mis-mapped costume can't dress the character up every time it feels happy; unmapped moods keep the preset; a mapped mood clears the model face again when its duration ends ([media/webview/expression.js](media/webview/expression.js), [src/companion-view.ts](src/companion-view.ts)). The same map flows through the Desktop Companion init payload so the setting behaves identically in both host modes ([src/desktop-pet-bridge.ts](src/desktop-pet-bridge.ts), [desktop-pet/web/index.html](desktop-pet/web/index.html)). Models usually name these `exp_01`, `exp_02`… so the mapping is made by eye — preview each one in the Expression popup first.
- **Dev harness** — `npx electron scripts/outfit-harness.js <model dir> <model3 file>` boots the real webview scripts in Electron against a model served over HTTP (the way `model-server.ts` serves it) and reports classification, face/outfit slot coexistence, blend handling, mood mapping and menu wiring, plus a screenshot ([scripts/outfit-harness.js](scripts/outfit-harness.js)). Electron is not a project dependency. Output lands in `.harness/`, now git-ignored.
- **i18n** — new `menu.outfit` / `menu.expression`, `bubbles.changeOutfit` / `outfitDefault` / `outfitChanged` / `outfitFailed` / `changeExpression` / `expressionDefault` / `expressionChanged` / `expressionFailed`, and `panels.outfit*` / `panels.expression*` strings across en/vi/ja.

### Added — ☝️ Press and hold the model: body → Outfit, head → Expression & Motion

- **One gesture reaches the model's wardrobe and its own expressions and motions — no right-click needed.** Hold the model past the 0.8 s headpat and, at **≈ 1.6 s**, a panel opens where the press landed: on the **body**, the **Outfit** popup; on the **head**, a combined **Expression & Motion** panel listing the model's own faces and motion groups — the same two lists the Appearance popups show, side by side ([media/webview/interaction.js](media/webview/interaction.js), [media/companion.css](media/companion.css)). Head vs body comes from the model's own hit areas when it declares them (`Head` / `Body` in the Cubism samples), else from where in the model's box the press landed (top 35 % = head). Headpat, poke and drag are untouched: a drag or Alt-rotate cancels the pending panel, and releasing during the headpat cooldown does too.
  - **The release never acts on the panel.** A hold ends with a pointerup whose click would otherwise land in the outside-click handler and close what just opened — or, with the panel under the finger, pick whatever row is there. The release is caught on the window itself (not only through PIXI, which reports a release over the panel's DOM as `pointerupoutside`), and for 300 ms after it the panels ignore clicks; then a normal tap chooses a row.
- **i18n** — `panels.holdTitle` across en/vi/ja.

### Changed — 🎬 Motions are discovered from the model instead of three hard-coded names

- **Models whose motion groups aren't called `Idle` / `TapBody` / `TapHead` now animate.** The webview used to request exactly those three names — what the Cubism sample models ship — and pixi-live2d-display looks a group up by exact name, so on a model with groups like `待机` (idle), `摸头` (head pat) or `打哈欠` (yawn) every request was a silent no-op and, worse, the idle loop never started: the library only auto-plays its `groups.idle`, which still said `Idle`. The character stood frozen in the moc's rest pose (arms hanging) with only breathing, blinking and physics moving. New [media/webview/motions.js](media/webview/motions.js) reads the real group list from the loaded model once per load, **picks the idle group by name** (`Idle`, `idle`, `standby`, `loop`, `default`, `待机`, `待機`, `常态`, `アイドル`, …) and points the library's idle at it, so the model's own idle loops again.
  - **Reactions resolve onto real groups** — `TapHead` (headpat) → a group whose name reads as head / hair / pat (`摸头`, `なでなで`, …); `TapBody` (poke, click, right-click, Pomodoro break) → a body / touch / poke group, else a random one from the remaining groups. Groups whose names suggest content gated by an affection meter in the model's original game (skirt / chest / `诱惑` / `好感` …) are **never** picked automatically — they stay one click away in the Motion popup — as do groups whose names mention clothing (`衣` / `服` / outfit / dress …): a motion that switches the model into its sweater leaves it there, since no idle writes costume parameters back. A group the model really has under the requested name is always used as is, so the sample models behave as before for the groups they ship; the one visible difference is that a headpat on a model **without** a `TapHead` group (Hiyori ships only `Idle` + `TapBody`) now plays its `TapBody` instead of nothing ([media/webview/ui.js](media/webview/ui.js), [media/webview/interaction.js](media/webview/interaction.js), [media/webview/main.js](media/webview/main.js)).
  - **Motion popup lists what the model has** (Appearance › Motion) — rebuilt on open from the discovered groups, in the model's own names, with the detected idle marked; a model with no motions says so instead of showing three dead buttons.
  - **Expression popup points to Motion** when a model has no `.exp3.json` at all but does ship motions — on many game-exported models the "expressions" (yawn, rub eyes, …) are motions, not expression files.
- **i18n** — `panels.motionEmpty`, `panels.motionCount`, `panels.expressionMotionsHint` across en/vi/ja; the Vietnamese Appearance labels `menu.toggleCursorChibi` / `tuneCursorChibi` / `focusFollow` shortened to two words (Chibi Cursor / Chỉnh Chibi / Dõi chuột) so the menu no longer wraps.

## [0.5.4] - 2026-06-24

### Added — 🔄 Alt + drag to rotate the Live2D model (pseudo-3D head/body turn)

- **Hold Alt and drag the model with the left mouse button to turn its head and body toward where you drag** — a 2.5D "look toward" gesture, not a flat image spin. New [media/webview/rotation.js](media/webview/rotation.js) steers pixi-live2d-display's **focus controller** from the drag delta: drag right → look right, drag down → look down. The controller turns the head (`ParamAngleX/Y/Z`), body (`ParamBodyAngleX`) and eyes (`ParamEyeBallX/Y`). Releasing the mouse (or Alt) eases the pose smoothly back to idle.
  - **Survives the idle motion** — the focus controller applies its angles *inside the model's own update loop, right after the motion and expression managers run* (`…afterMotionUpdate → expression → updateFocus()…`), layering the turn on top of the idle head-sway instead of being overwritten by it. (An earlier attempt that wrote the angle params on `app.ticker` got clobbered every frame by the idle motion — the head/body wouldn't turn.)
  - **Separated from the existing gestures** — Alt+drag never triggers headpat (long-press), poke/click, or the move-drag (window/panel reposition); the trailing `pointerup` is suppressed so a rotate never registers as a poke ([media/webview/interaction.js](media/webview/interaction.js)). Works on the model and from transparent canvas areas, in both Panel and Desktop modes.
  - **Cursor feedback** — the pointer becomes a "grabbing" hand while rotating ([media/companion.css](media/companion.css)).
  - **Note** — this is a head/body turn bounded by each model's rig (~±30°), inherent to Live2D; it is not a true 360° 3D rotation.

### Added — 👀 "Auto look-at cursor" toggle (hands-free follow)

- **A new right-click menu toggle (Appearance › Auto look-at cursor) makes the companion's head and eyes follow your mouse automatically while it hovers over the companion — no Alt needed.** It steers the same focus controller (eased, hover-driven); the icon shows ✅ when on, and moving the cursor off the companion recenters the gaze ([media/webview/rotation.js](media/webview/rotation.js), [media/webview/interaction.js](media/webview/interaction.js)). Manual **Alt + drag** still works and takes precedence while held.
- **Persisted** — backed by the new `animeCompanion.focusFollow.enabled` setting, written from the menu and re-injected on reload so the choice sticks ([src/companion-message-dispatcher.ts](src/companion-message-dispatcher.ts), [src/companion-view.ts](src/companion-view.ts)); also flows through the Desktop Companion init payload ([src/desktop-pet-bridge.ts](src/desktop-pet-bridge.ts)).
- **"You're making me dizzy" reaction** — whipping the cursor back and forth fast while following (4 quick horizontal reversals in a row) makes the model complain, hold its gaze forward for a beat, and react (bubble + surprised face + sound), with a 6s cooldown so it can't spam — interacting more, not just a passive follow ([media/webview/rotation.js](media/webview/rotation.js)).
- **i18n** — new `menu.focusFollow` + `bubbles.focusFollow*` / `bubbles.followDizzy` strings across en/vi/ja.

## [0.5.3] - 2026-06-22

### Added — 🔗 Add a background image straight from a URL (Google Drive / Dropbox)

- **You can now paste an image link into the Background control panel instead of only picking a local file.** Each region card (Fullscreen / Editor / Sidebar / Panel) gets a URL box + **Add URL** button next to the existing picker ([media/webview/background-panel.js](media/webview/background-panel.js), [media/webview/background-panel.css](media/webview/background-panel.css)). The extension downloads the image, saves it into global storage exactly like a picked file, and updates `animeCompanion.background.{region}.image` — so the existing apply/encode/patch pipeline is unchanged and **Apply (reload window)** works the same.
  - **Share-link normalization** ([src/background/image-url.ts](src/background/image-url.ts)) — Google Drive share links (`/file/d/<id>/view`, `open?id=<id>`, `uc?id=<id>`) and Dropbox links are rewritten to direct-download URLs automatically, so you can paste the link you get from the *Share* dialog (set it to **Anyone with the link**).
  - **Safe download** — fetched over the built-in `https`/`http` client with redirect-following (Google Drive → `googleusercontent`), a 20s timeout, and a ~2.4 MB cap (the image is embedded into a VS Code startup file, so it must stay small). The real image type is sniffed from magic bytes (png/jpg/webp/gif/bmp/svg) rather than trusting `Content-Type`, and an HTML response (a not-publicly-shared Drive file) is reported as a clear error instead of being saved.
  - **Inline feedback** — per-region loading state and error text live in the panel and survive its live re-renders (e.g. while dragging a slider).
- **i18n** — new `webview.backgroundPanel.url*` strings across en/vi/ja.

## [0.5.2] - 2026-06-13

### Added — 🎨 Custom theme (accent) colour for the Markdown editor

- **Recolour the 🌸 Markdown editor's pink chrome to any colour you like.** A round colour swatch + a **↺ reset** button now sit in the editor header next to the theme toggle ([src/markdown/markdown-editor-panel.ts](src/markdown/markdown-editor-panel.ts), [media/webview/markdown-editor.js](media/webview/markdown-editor.js), [media/webview/markdown-editor.css](media/webview/markdown-editor.css)). The choice is remembered across files and windows (`globalState` key `animeCompanion.markdownEditor.accentColor`); reset clears it so the default sakura pink comes back.
  - **One colour drives the whole accent.** The editor chrome is now refactored onto a single accent variable (`--ac-accent` / `--ac-accent-rgb`) — the header gradient, Save button, theme buttons, toolbar hover/active, borders, links, blockquote, caret, selection, and the scrollbar all derive from it. The deeper/lighter shades and a readable ink colour are derived automatically from the picked colour so text on the accent stays legible. **The page background is intentionally left alone — it keeps following dark/light mode.**
- **i18n** — new `webview.markdownEditor.accentColor` / `accentReset` strings across en/vi/ja.

### Changed — Slim scrollbars in the Markdown editor

- **The Markdown editor now uses a slim, accent-coloured scrollbar instead of the chunky default bar.** The webview shell no longer scrolls (`html, body { overflow: hidden }`) so scrolling happens inside the Toast UI panes, which use a thin scrollbar (`scrollbar-width: thin` + accent `scrollbar-color`, plus auto-hiding `::-webkit-scrollbar` rules where the platform honours them) ([media/webview/markdown-editor.css](media/webview/markdown-editor.css), [media/webview/markdown-editor.js](media/webview/markdown-editor.js)). This also resolves the earlier near-black scrollbar in the live-preview pane. (Note: on Windows, the OS may still draw native up/down arrow buttons on the thin bar — that's an OS-level scrollbar style, not removable from inside the webview.)

## [0.5.1] - 2026-06-10

### Added — 🌸 Markdown WYSIWYG editor in its own window

- **Open any `.md` file in a full-size, cute WYSIWYG editor and edit it in place — written straight back to the file.** A 🌸 flower button on the editor title bar (and a pulsing 🌸 status-bar item) shows whenever a Markdown file is active; clicking it opens the file in a dedicated Toast UI Editor tab (`ViewColumn.Active` — a full tab, not a split) where you both see the rendered document and edit it like a rich-text editor (à la CKEditor).
  - **Editor panel** ([src/markdown/markdown-editor-panel.ts](src/markdown/markdown-editor-panel.ts), [media/webview/markdown-editor.js](media/webview/markdown-editor.js), [media/webview/markdown-editor.css](media/webview/markdown-editor.css)) — one window per file URI (re-opening reveals the existing one). Saves through a `WorkspaceEdit` + `document.save()` so a normal editor tab for the same file stays in sync, and pulls in external edits when the panel has no pending changes.
  - **Safe by construction** — the WYSIWYG round-trip normalizes Markdown on save, so the editor **only writes when you actually edit**: merely previewing a file leaves it byte-for-byte, with a one-time reformat warning the first time you type.
  - **🌗 Dark / Light toggle** — a theme button in the header flips the editor between a plum-dark and a pink-cream light theme; the choice is remembered across files and windows (`globalState`).
  - **Anime Companion styling** — pink/sakura gradient header with a bobbing 🌸, a candy Save button, themed Toast UI chrome (toolbar/links/headings/code/selection in pink), and Mochiy Pop One / Nunito fonts.
  - **Status bar** ([src/markdown/markdown-status-bar.ts](src/markdown/markdown-status-bar.ts)) — gentle 🌸/💮 pulse only while a `.md` editor is active; hides and stops its timer otherwise.
  - **Library** — Toast UI Editor vendored as a self-contained UMD bundle ([media/vendor/toastui/](media/vendor/toastui/)), no bundler required.
- **i18n** — new `webview.markdownEditor.*` strings across en/vi/ja.

## [0.5.0] - 2026-06-09

### Added — 🖼️ Background Image (workbench) with a friendly control panel

- **Put a background image behind the editor, sidebar, and panel — driven by a visual control panel instead of hand-edited JSON.** Like the popular "Background" extension, this works by patching VS Code's `workbench.desktop.main.js` (there is no public API for a workbench background), but the focus here is the **control panel** that makes the whole lifecycle obvious — picking images, tuning per region, applying, and cleanly restoring. v1 targets desktop **VS Code stable**.
  - **Patch engine + lifecycle** ([src/background/background-patch-manager.ts](src/background/background-patch-manager.ts), [src/background/patch-generator.ts](src/background/patch-generator.ts), [src/background/workbench-locator.ts](src/background/workbench-locator.ts)) — locates the workbench file (`require.main` → `vscode.env.appRoot` fallback), backs up the pristine content per VS Code version, strips any old block, appends a uniquely-marked block (`// anime-companion-background-*`, distinct from other extensions so they can coexist), and writes atomically via tmp+rename. **Re-applies automatically after a VS Code update** (marker gone → re-patch on activate, gated by a cheap input signature so unchanged setups don't re-encode), handles **EACCES** on protected installs (Program Files) with an actionable message instead of crashing, and never throws into `activate()`.
  - **Clean uninstall** ([src/background/uninstall.ts](src/background/uninstall.ts)) — a `vscode:uninstall` Node hook strips the patch from the workbench file when the extension is removed, so VS Code is left clean. (Best-effort: doesn't fire on a hard kill; the in-app **Disable & Restore** is the other path.)
  - **Dedicated control panel** ([src/background/background-panel.ts](src/background/background-panel.ts), [media/webview/background-panel.js](media/webview/background-panel.js), [media/webview/background-panel.css](media/webview/background-panel.css)) — one card per region (**Fullscreen / Editor / Sidebar / Panel** — Fullscreen puts a single image behind the whole window) with image picker + thumbnail, opacity / blur / sizing / position controls, an in-panel live preview, a master enable toggle, **Apply (reloads window)**, **Disable & Restore**, an opt-in "silence the installation-corrupt warning" toggle (patches `product.json` checksums), and a "how this works" lifecycle explainer. Picked images are copied into global storage and embedded as data-URIs.
  - **Settings** — `animeCompanion.background.*` (master `enabled` / `patchChecksums` + per-region `enabled` / `image` / `opacity` / `blur` / `size` / `position`). Best configured through the panel, not by hand.
  - **Commands** — `Background Image: Open Control Panel` / `Apply` / `Disable & Restore`; also reachable from the companion right-click menu (Appearance › 🖼️ Background Image).
- **i18n** — new `webview.backgroundPanel.*` strings and a `menu.background` entry across en/vi/ja.

## [0.4.3] - 2026-06-02

### Fixed — Claude account swap left the account broken (load forever → logged out)

- **Swapping Claude accounts restored only the OAuth tokens, not the account binding — so every swap left Claude spinning and then forced a re-login.** Claude's identity is split across two files: `~/.claude/.credentials.json` (the tokens, which the swap handled) and the home-level `~/.claude.json`, whose `oauthAccount` holds the **organizationUuid** and account identity. `organizationUuid` exists *only* in `~/.claude.json`, so restoring the new account's token while that file still advertised the previous account's org produced a mismatch on every API call ("loads forever → kicked out → must log in again"). The Claude backend now captures `oauthAccount` + `userID` into a snapshot sidecar (`.claude-account.json`) on save and **merges** them back into `~/.claude.json` on switch — preserving everything else in that file (projects, MCP servers, caches), backing it up first, and writing atomically ([src/agent-profiles/backends/claude-backend.ts](src/agent-profiles/backends/claude-backend.ts), [src/agent-profiles/credential-fs.ts](src/agent-profiles/credential-fs.ts)). **Existing saved Claude profiles must be re-saved once** to capture the binding — older snapshots lack the sidecar and the swap stays inert for them.
- **Stale OAuth refresh tokens after a swap.** Claude rotates refresh tokens as the live session refreshes, so a profile captured earlier could hold an already-dead token by the time you switched back to it. Switching away from an account now re-snapshots its *current* live credentials into its own profile first (guarded so a manual CLI re-login can't corrupt the saved profile), keeping it restorable ([src/agent-profiles/profile-manager.ts](src/agent-profiles/profile-manager.ts)). For that guard — and live-active detection — to survive rotation, the account **signature is now derived from the stable `organizationUuid`** (read from the account binding) instead of a refresh-token hash, which itself drifts on every rotation ([src/agent-profiles/backends/claude-backend.ts](src/agent-profiles/backends/claude-backend.ts)). The saved-profile label now shows the account email too.
- **Dropped phantom whitelist entries** (`claude.json`, `config.json`, `.config.json`) — no such files exist inside `~/.claude`, and `claude.json` in particular implied the home-level `~/.claude.json` was being handled when it wasn't.

## [0.4.2] - 2026-06-02

### Fixed — Saving Claude team/SSO accounts

- **Claude accounts without a top-level `organizationUuid` could not be saved or detected as active.** Team/SSO logins (and logins that nest the org id inside the `claudeAiOauth` blob) were silently treated as "no account", so *Save current as…* and the live-active check skipped them ([src/agent-profiles/backends/claude-backend.ts](src/agent-profiles/backends/claude-backend.ts)). Identity reading now: reads the org id from the oauth blob when it's absent at the top level; and when there's no org at all, derives a stable account signature from a SHA-256 hash of the **refresh** token (more stable than the access token, which rotates on every refresh), falling back to the subscription type. Org-less accounts stay identifiable instead of being dropped.

### Changed — Backend abstraction for non-file accounts

- **`AccountBackend` now supports two flavours uniformly** ([src/agent-profiles/backends/account-backend.ts](src/agent-profiles/backends/account-backend.ts), [src/agent-profiles/profile-manager.ts](src/agent-profiles/profile-manager.ts)): *file-based* backends (Claude, Codex) that describe a `homeDir` + whitelist and let the manager drive the file copy, and *custom* backends that own their own `isAvailable`/`readLiveIdentity`/`snapshot`/`restore`. The manager drives both through capability wrappers, so a non-file (e.g. auth-based) account can ride alongside the file-swap profiles.
- **Clearer errors when a CLI isn't logged in** — *Save* now reports "No `<tool>` credentials found. Log in to `<tool>` first." instead of a raw missing-path message.

## [0.4.1] - 2026-05-30

### Added — GitHub account swap (Agent Accounts)

- **Switch which signed-in GitHub account the extension uses for Copilot, from the same Agent Accounts surfaces — globally.** GitHub accounts in VS Code's account menu are authenticated *into VS Code* (tokens in the OS keychain), so unlike the Claude/Codex file-swap this is **auth-based**: it picks which signed-in account the extension's own sessions use via `vscode.authentication.getSession({ account })`. It does **not** change git commit identity or what other extensions use — VS Code has no global "active account".
  - **Single source of truth** ([src/github-account-service.ts](src/github-account-service.ts)) — `GitHubAccountService` lists accounts (`getAccounts('github')`), stores the chosen account in **`globalState['agentProfiles.githubAccountPreference']`** (global, per the user's choice), switches/adds/clears, re-applies on activation, and emits change events. The previous per-workspace Copilot preference is migrated up to global on first run.
  - **Surfaced everywhere the CLI accounts are** — a 🐙 GitHub section in the Agent Accounts panel (Use / Use VS Code default / Add account, with a "global · only affects this extension/Copilot" note) ([src/agent-profiles/profile-panel.ts](src/agent-profiles/profile-panel.ts)); the unified status-bar quick-switch ([src/agent-profiles/profile-manager.ts](src/agent-profiles/profile-manager.ts)); a new command `Anime Companion: Agent Accounts — Switch GitHub Account…`; and pet right-click → **Agent › GitHub Account…**.
  - **Chat stays in sync** — `ChatManager` delegates its Copilot-account logic to the shared service ([src/chat/chat-manager.ts](src/chat/chat-manager.ts)), and any GitHub switch (from any surface) refreshes the chat panel snapshot.

### Changed

- **GitHub Copilot account preference moved from per-workspace to global** (`workspaceState` → `globalState`), with a one-time migration of any existing choice — so the chosen GitHub account applies across every workspace.

### Fixed

- **`npm test` (smoke test) was broken since v0.4.0** — the mocked `vscode` lacked `EventEmitter`, which `AgentProfileManager` constructs at activation, so activation threw. Completed the mock (`EventEmitter`, `authentication`, `QuickPickItemKind`, `workspaceState`, and a fallback-aware `globalState.get`) so activation is validated again.

## [0.4.0] - 2026-05-28

### Added — Agent Accounts (multi-CLI credential swap)

- **Save and switch between multiple agent CLI accounts without re-logging-in.** Snapshot the credential files of a logged-in CLI tool (Claude Code, Codex), then swap accounts later with one click. Mirrors the spirit of the PowerShell `Switch-ClaudeAccount.ps1` script users had been running externally — same atomic file-swap idea, ported to TypeScript / Node `fs` so it works cross-platform (no shell-out, no Windows-only dependency) and integrates with the companion's UX.
  - **Tool-agnostic backend registry** ([src/agent-profiles/backends/account-backend.ts](src/agent-profiles/backends/account-backend.ts)) — `AccountBackend` interface defines `homeDir()`, a whitelist of credential files, a sentinel file, and `readIdentity()`. New backends register through `registerBackend(...)` in [src/extension.ts](src/extension.ts). Adding a future CLI (Antigravity, Gemini CLI, …) is a single new file + one register line — manager, panel, status bar, popups, status bar all dispatch through the registry.
  - **Claude backend** ([src/agent-profiles/backends/claude-backend.ts](src/agent-profiles/backends/claude-backend.ts)) — `~/.claude/`, whitelist `{.credentials.json, settings.json, settings.local.json, claude.json, config.json, .config.json}`. Identity = `organizationUuid` + `claudeAiOauth.subscriptionType` → displayed as `sub=team · org=09eb97ad · exp=…`.
  - **Codex backend** ([src/agent-profiles/backends/codex-backend.ts](src/agent-profiles/backends/codex-backend.ts)) — `~/.codex/`, whitelist `{auth.json}` only (the rest is sessions/sqlite/cache, irrelevant for account swap). Identity = `tokens.account_id`; display text decodes the OAuth `id_token` JWT (no verification, payload only) to surface `email` + `chatgpt_plan_type` — e.g. `mode=chatgpt · user@example.com · plan=plus`.
  - **Cross-platform atomic swap** ([src/agent-profiles/credential-fs.ts](src/agent-profiles/credential-fs.ts)) — `snapshotDir(src, dest, whitelist)` + `restoreDir(src, dest, whitelist)`. Restore writes each file via `<final>.tmp` → `fs.rename` so a half-finished swap can't leave the CLI in a torn state. Rolling 3-backup retention per tool (`.backup-<toolId>-<ts>/`) before every restore.
  - **Profile data model** ([src/agent-profiles/types.ts](src/agent-profiles/types.ts), [src/agent-profiles/profile-store.ts](src/agent-profiles/profile-store.ts)) — `AgentProfile { id, name, tool, claudeSnapshot, createdAt, updatedAt }` lives in `context.globalState['agentProfiles.store']`. Snapshots live under `context.globalStorageUri/agent-profiles/<id>/snapshot/`. Old profiles (saved before the `tool` field existed) migrate transparently to `tool: 'claude'` on first read.
  - **Per-tool active detection** ([src/agent-profiles/profile-manager.ts](src/agent-profiles/profile-manager.ts)) — instead of trusting the last `useProfile` call as ground truth, `detectActiveIds()` reads the live credential of every registered backend's `homeDir()` and matches its `signature` against each saved snapshot. So external swaps (e.g. running the PowerShell script outside the extension) are reflected correctly. Multiple tools can be "active" simultaneously — one per registered backend — and the status bar / panel / quick-switch all show that correctly.
  - **In-webview popups** ([media/webview/interaction.js](media/webview/interaction.js), [media/companion.css](media/companion.css)) — right-click pet → **Agent ›**:
    - **🔁 Đổi nhanh** opens a popup at the model with profiles grouped by tool section (`🤖 Claude (2)` / `⚡ Codex (1)`), each row showing identity text. Click → swap, info toast confirms.
    - **💾 Lưu hồ sơ hiện tại** opens a popup at the model with inline tool picker (auto-selected if only 1 logged-in CLI; tool buttons if ≥2) + name input. No VS Code QuickPick interruption — the entire flow stays attached to the pet.
    - **👀 Quản lý hồ sơ…** opens the full standalone webview panel ([src/agent-profiles/profile-panel.ts](src/agent-profiles/profile-panel.ts)) with tool-section grouping, identity preview, Use / Rename / Delete actions, and a "Save current" button.
  - **Status bar item** ([src/extension.ts](src/extension.ts) `AgentProfileStatusBar`, `Right, 99`) — shows the active profile's name; if multiple tools are active, shows `N accounts` with a per-tool tooltip. Click → quick-switch.
  - **5 command-palette commands** — `Anime Companion: Agent Accounts — Manage… / Save Current As… / List / Quick Switch… / Delete…`.
  - **Restart hint** — every swap shows an info toast reminding the user to restart any running CLI session so it reloads the new token. The extension does not detect or kill CLI processes.
- **i18n** — new keys (`menu.agentCategory`, `menu.agentList/Switch/Save`, `panels.agentSwitchTitle/SaveTitle/NamePlaceholder/Cancel/SaveBtn/Loading/Empty/PickTool/NoTool`) added across en/vi/ja.

### Added — Pet Quick Chat (roadmap §4.2)

- **Right-click pet → 💬 Quick Chat → input overlay → streaming reply in speech bubble.** Lets the user ask the companion a one-shot question without opening the full chat panel. Tailored for Desktop Companion mode where the chat panel isn't on-screen, but works identically in panel mode.
  - **Input overlay** ([media/webview/ui.js](media/webview/ui.js), [media/companion.css](media/companion.css)) — pink-themed `companion-quickchat-panel` sits above the character; 2-row textarea (400 char cap), Send + Cancel buttons. Enter sends, Shift+Enter newline, Esc cancels.
  - **Transient reply** — `ChatManager.sendQuickChat()` ([src/chat/chat-manager.ts](src/chat/chat-manager.ts)) is a new code path that does **not** touch `ConversationStore`, **not** broadcast `chat:*` events to the panel, and runs on an independent abort/in-flight guard (`_quickAbort`/`_quickInFlight`) so it can't be cancelled by panel chat traffic and vice-versa. Default `maxTokens: 200` (speech-bubble fits ~600 visible chars before the tail-keep window kicks in). Caller drives the bubble through 4 callbacks (`onDelta`, `onEnd`, `onError`).
  - **Streaming bubble** ([media/webview/ui.js](media/webview/ui.js)) — new `startBubbleStream`/`appendBubbleStream`/`finishBubbleStream`/`errorBubbleStream`. While streaming, the bubble suppresses the usual 6s auto-dismiss + sets a `bubbleStreaming` flag so reactive bubble calls (idle phrases, save praises) yield the surface instead of clobbering the reply. End-of-stream starts a 12s dismiss timer with **click-to-pin**: clicking the bubble before the timer fires cancels the timer and keeps the reply visible until the next right-click. CSS pulse `✨` while streaming, pink border when pinned.
  - **WS-bridge-safe** — works through `window.__VS_CODE_BRIDGE__` in Desktop mode (Tauri WebSocket) and through `acquireVsCodeApi()` in Panel mode (VS Code postMessage). No transport-specific code.
  - **New message protocol** — webview → host: `pet:chat:request {prompt, requestId, maxTokens}` / `pet:chat:cancel`. Host → webview: `pet:chat:delta {requestId, delta}` / `pet:chat:end {requestId, text}` / `pet:chat:error {requestId, message, aborted}`. Dispatcher handlers in [src/companion-message-dispatcher.ts](src/companion-message-dispatcher.ts). `maxTokens` server-side capped at 1024 so a stray client can't burn an entire context window through this surface.
- **i18n** — `menu.chatQuick` and `bubbles.quickChatThinking` added to all 3 message files (en/vi/ja).

### Fixed

- **Desktop Quick Chat bubble overflow** ([media/companion.css](media/companion.css)) — a long quick-chat reply made the speech bubble taller than the small Tauri desktop window and clipped off the top of the screen. `.bubble-text` now caps at `max-height: 40vh` with `overflow-y: auto` + `overflow-wrap: anywhere` so the bubble stays inside the window and scrolls internally for long replies.
- **Desktop Quick Chat panel clipped at top** ([media/companion.css](media/companion.css)) — the default `bottom: calc(100% - 20px)` anchor placed the quick-chat panel's bottom edge near the top of the `character-wrapper`, then grew the panel upward off the Tauri window. Desktop mode now `position: fixed`-pins the panel to `top: 8px` of the viewport (with a higher-specificity override on the `.quickchat-compact` rule so it wins the cascade); history scrolls inside the panel at `max-height: 28vh`. Pet right-click → Quick Chat now always renders fully inside the window.
- **Stale bubble overlapping reopened Quick Chat panel** ([media/webview/ui.js](media/webview/ui.js)) — a previous reply's bubble (still inside its 12s auto-dismiss window, or pinned) overlapped the freshly-opened Quick Chat panel and looked like a layout bug. `showQuickChatPanel()` now calls a new exported `forceDismissBubble()` first to nuke any lingering bubble state before showing the input.
- **`finishBubbleStream` click-handler leak** ([media/webview/ui.js](media/webview/ui.js)) — each stream finish attached a fresh `click` listener (pin/unpin handler) on the bubble element without removing the previous one. Over many replies, listeners piled up and a single click toggled pin state multiple times. Listeners are now tracked through a module-level `bubbleClickHandler` and removed before attaching the next one (and on hard dismiss / force dismiss).

### Notes

- Reuses the panel chat's persona system prompt (`resolveSystemPrompt(panelModelName)`) so the pet replies with the same character voice as the chat panel. Quick chat ignores conversation history — every Quick Chat is a fresh turn (matches the "transient" intent from the roadmap).
- Sentiment-driven Live2D reaction (`_reactToReply`) runs on the final accumulated text, just like panel chat replies — pet's expression/mood still tracks reply tone.
- The PowerShell `Switch-ClaudeAccount.ps1` script users were running externally remains compatible — it touches the same `~/.claude/.credentials.json` the extension does. The extension's per-tool `detectActiveIds()` reads the live credential, so external swaps via that script are reflected in the status bar / panel without re-running anything in the extension. Profiles saved via the PS script (under `~/.claude/account-profiles/`) are stored independently of the extension's snapshots (`globalStorage/.../agent-profiles/<id>/`); no automatic import — re-save through the extension to register a profile here.

## [0.3.3] - 2026-05-25

### Changed

- **Right-click menu reorganization** ([media/webview/interaction.js](media/webview/interaction.js)) — the companion's in-webview context menu is now grouped into 6 functional submenus instead of a single flat "Settings ›" list per roadmap v0.4.0 §4.1: 💬 **AI Chat** (Open Chat · New Conversation · Ask About Selection · Configure Provider · Clear All) · 🌸 **Appearance** (Model · Capture Chibi · Cursor Chibi toggle/tune · Reset Position · Motion · Poke) · 🔊 **Voice & Sound** (Voice · Messages · Ambient · Mute) · 🍅 **Workflow** (Start/Stop Pomodoro · Stats · Achievements) · 🔧 **Git** (Commit · Pull · Push · Run) · 🖥️ **Desktop** (Switch Desktop/Panel · Click-Through · Reset Workspace Model). Top level now keeps only `All Settings` as the quick action below the category list. Implementation is now data-driven (single `categories` array) so adding/removing items is one entry instead of HTML+handler+i18n in three places.

### Added

- **AI Chat entries reachable from the companion's right-click menu** — previously the chat commands (`animeCompanion.chat.open`, `.newConversation`, `.askSelection`, `.setApiKey`, `.clearHistory`) were only in the Command Palette and the editor context menu. They now appear under the companion's **AI Chat ›** submenu so the pet itself can launch a conversation without leaving the mouse.
- **Cursor Chibi controls in the right-click menu** — `Capture Chibi`, `Toggle Cursor Chibi`, `Tune Cursor Chibi`, and `Reset Position` were previously only command-palette accessible. They are now grouped under **Appearance ›**.
- **i18n keys for new menu labels** ([media/messages/{en,vi,ja}.json](media/messages/)) — `menu.chatCategory`, `menu.appearanceCategory`, `menu.voiceCategory`, `menu.workflowCategory`, `menu.gitCategory`, `menu.desktopCategory`, `menu.allSettings`, plus per-item keys (`menu.chatOpen`, `menu.startPomodoro`, `menu.stopPomodoro`, `menu.switchToDesktop`, `menu.switchToPanel`, `menu.clickThrough`, `menu.resetWorkspaceModel`, etc.). Vietnamese and Japanese menu strings translated; previously several entries were left as English ("Model", "Voice", "Messages") in vi.json/ja.json — now properly localized.

### Fixed

- **`animeCompanion.toggleDesktopClickThrough` command was declared in `package.json` but never registered** ([src/extension.ts](src/extension.ts)) — invoking it from the Command Palette since v0.1.x silently did nothing. Handler now reads `desktopCompanion.clickThrough`, flips it, and shows an info toast. Refuses with a hint message if the user is still in Panel mode (the setting only takes effect when Desktop Companion is enabled).
- **Menu label fit + Vietnamese glyph rendering** ([media/messages/{en,vi,ja}.json](media/messages/), [media/companion.css](media/companion.css)) — shortened the top-level `Desktop Companion` label to `Desktop` across EN / VI / JA, tightened several Vietnamese menu labels (`Chat AI`, `Âm thanh`, `Quy trình`, `Cài đặt`) to avoid wrapping in narrow panels, and added a Vietnamese-only rounded font fallback for the context menu so accented characters render cleanly without losing the current cute visual tone.

## [0.3.2] - 2026-05-25

### Added

- **Dynamic Gemini model list** ([src/chat/chat-manager.ts](src/chat/chat-manager.ts)) — when the active provider is Gemini and an API key is stored, the chat panel now calls `GET https://generativelanguage.googleapis.com/v1beta/models` and populates the model dropdown with whatever the key actually supports. Result is cached in-memory for 5 minutes (per-provider, `_modelListCache`) and invalidated on provider switch. Filter keeps only models whose `supportedGenerationMethods` include `generateContent` / `streamGenerateContent`; drops the deprecated `gemini-1.*` family; sorts newest version first. The hardcoded `PROVIDER_INFO.modelExamples` for Gemini stays as fallback when the key is missing or the API call fails. Cache helper is generic (`_fetchProviderModels(providerId, apiKey)`) so OpenAI/OpenRouter listing can plug in later without restructuring.
- **Roleplay actions render as emoji icons** ([media/webview/chat.js](media/webview/chat.js), [media/webview/chat.css](media/webview/chat.css)) — anime-companion personas often emit narrative actions like `*blushes softly and smiles warmly*` or `*ôm chặt anh*`. The minimal webview markdown previously showed these as raw asterisked text. Now `renderInlineCode()` runs a single regex pass that detects both inline `` `code` `` and `*action*` blocks (action must start with a letter to avoid swallowing `**bold**` or bullet-list asterisks) and substitutes each action with a single representative emoji via `ROLEPLAY_ACTION_EMOJI` — ~25 keyword clusters covering EN + VI verbs (hug/ôm → 🤗, blush/đỏ mặt → ☺️, kiss/hôn → 😘, headpat → 🫳, wink/nháy mắt → 😉, pout/phụng phịu → 😤, cry/khóc → 🥺, sigh/thở dài → 😮‍💨, think/nghĩ → 🤔, wave/vẫy → 👋, etc.). Unmatched actions fall back to 🌸. The emoji span carries `title={original action}` so hovering still surfaces the model's exact wording for debugging or curiosity. CSS class `.chat-roleplay-emoji` bumps font-size to `1.15em` with `cursor: help`.

### Fixed

- **Chat provider & model selection survives reload + Q&A turns** ([src/chat/chat-manager.ts](src/chat/chat-manager.ts)) — picking "Google Gemini" + `gemini-2.5-pro` in the panel header and then sending a message could leave the dropdown reset to GitHub Copilot on the next snapshot, even though the API call itself used the right provider. Root cause was that `sendSnapshot()` re-read `cfg.get('chat.provider')` and any scope/persistence hiccup on the workspace-target write surfaced as the dropdown silently snapping back to the default. Fix introduces a durable layer: `workspaceState` keys `chat.providerSelection` and `chat.modelSelection` are written first in `setProvider()` / `setModel()` (synchronous, never fails), then the VS Code config is mirrored inside a `try/catch` (best-effort, still editable from Settings UI). New `_resolveActiveProvider()` / `_resolveActiveModel()` helpers read workspaceState first, fall back to cfg, then to the provider's default — every snapshot, every send, every new-conversation call goes through them so the user's choice is the source of truth instead of a derived computation.

### Changed

- **Cute persona — bolder waifu tone, language-aware addressing** ([src/chat/persona.ts](src/chat/persona.ts)) — `cute` preset rewritten to be "warm, affectionate, playful, slightly clingy, with a bold waifu vibe". Explicit per-language guidance for self-reference and the user's address form: Vietnamese → "em"/"bé" for self + "anh"/"Onii-chan" for the user; English → "Onii-chan"/"big bro"; Japanese → "Onii-chan"/"anata". Soft-flirty allowed but explicitly blocked from explicit/sexual/rude content. Companion stays in character (no "as an AI" breaks). Other presets (`professional`, `tsundere`, `energetic`) untouched.
- **`package.json` setting descriptions** — `chat.provider` and `chat.model` descriptions now mention that the chat-panel-driven write lands in the workspace `.vscode/settings.json` when a workspace is open, so users editing settings.json directly know which scope owns the value.

## [0.3.1] - 2026-05-25

### Added — 4 new chat providers + tri-lingual docs

- **xAI Grok (BYOK)** — OpenAI-compatible endpoint `https://api.x.ai/v1`. Default model `grok-2-latest`. Examples: `grok-2-latest`, `grok-2`, `grok-3`, `grok-beta`. Key prefix `xai-…` from console.x.ai.
- **DeepSeek (BYOK)** — OpenAI-compatible endpoint `https://api.deepseek.com/v1`. Models `deepseek-chat`, `deepseek-reasoner`. Key prefix `sk-…` from platform.deepseek.com. Reasoner chain-of-thought (`reasoning_content`) is intentionally NOT rendered in the chat bubble — only the final answer streams to the user, matching the UX of Gemini 2.5 thinking models.
- **OpenRouter (BYOK)** — gateway to 100+ models via `https://openrouter.ai/api/v1`. Default `openrouter/auto`. Examples include `anthropic/claude-3.5-sonnet`, `openai/gpt-4o`, `meta-llama/llama-3.3-70b-instruct`, `google/gemini-2.0-flash-exp:free` (no-cost free-tier suffix). Sends `HTTP-Referer` + `X-Title` headers for proper attribution on the OpenRouter dashboard. Key prefix `sk-or-v1-…` from openrouter.ai/keys.
- **Ollama (local, no API key)** — talks to a local Ollama server. Streams via NDJSON (newline-delimited JSON) on `POST /api/chat`, not SSE. Reads endpoint live from the new `animeCompanion.chat.ollamaEndpoint` setting (default `http://localhost:11434`) so the user can change hosts without reloading the window. Maps `prompt_eval_count` + `eval_count` from the final chunk into our `StreamUsage`. Connection failure → friendly error pointing at the configured endpoint, `ollama serve`, and `ollama pull <model>`.
- **`OpenAICompatibleProvider` abstraction** ([src/chat/providers/openai-compatible.ts](src/chat/providers/openai-compatible.ts)) — single class drives OpenAI + xAI + DeepSeek + OpenRouter from per-instance config (`baseUrl`, `defaultModel`, optional `extraHeaders` for OpenRouter attribution headers). Eliminates 3× duplication of fetch + SSE parsing.
- **`animeCompanion.chat.ollamaEndpoint`** setting — string, default `http://localhost:11434`. Validated and normalized (trailing `/` stripped) when set via the `Configure Chat Provider` command.
- **Tri-lingual documentation** — README now ships in 3 languages with a language switcher at the top of each file:
  - [README.md](README.md) (root) — **English**, the source of truth for marketplace listing.
  - [docs/README.vi.md](docs/README.vi.md) — **Tiếng Việt**.
  - [docs/README.ja.md](docs/README.ja.md) — **日本語**.
- **Screenshot manifest** ([docs/images/README.md](docs/images/README.md)) — listing 12 screenshots with capture specs (hero, chat panel streaming, provider picker showing all 8 entries, `#mention` autocomplete, desktop pet, cursor chibi, Pomodoro, achievements, ambient menu, right-click menu, settings UI). Marketplace listing includes inline image references; broken-image icons are acceptable until shots land.
- **Copy-reply button on every assistant message** ([media/webview/chat.js](media/webview/chat.js), [media/webview/chat.css](media/webview/chat.css)) — small clipboard icon at the bottom-right of finalised assistant bubbles. Hidden during streaming so an in-flight reply can't be copied half-formed. On click the icon swaps to a checkmark with a `cubic-bezier(0.34, 1.56, 0.64, 1)` pop animation and the bubble flashes green; reverts after 1.4 s. Failure shows red. The button copies the raw markdown source (stored in `dataset.copySource`) rather than `innerText`, so code-block "Copy" labels don't leak into the clipboard.

### Changed

- **`Set Chat API Key (BYOK)` → `Configure Chat Provider (API Key / Endpoint)`** — command title renamed to reflect that it now also configures the Ollama endpoint. The command id `animeCompanion.chat.setApiKey` is unchanged, so any existing keybindings keep working.
- **`runSetApiKeyCommand`** ([src/chat/chat-manager.ts](src/chat/chat-manager.ts)) — filter changed from `p.requiresApiKey` to `p.id !== 'copilot'` so Ollama appears in the QuickPick. When the user picks Ollama, the flow branches to an InputBox prompting for the endpoint URL (validated with `^https?://.+`) and saves to `chat.ollamaEndpoint` via `ConfigurationTarget.Global`.
- **`ProviderId` type** ([src/chat/secrets.ts](src/chat/secrets.ts)) — extended from 4 to 8 ids. `needsKey()` refactored to a Set check (`NO_KEY_PROVIDERS = {copilot, ollama}`). `hasAny()` now iterates the explicit `BYOK_PROVIDERS` list so adding non-BYOK providers later is safe.
- **`package.json`** — `chat.provider` enum + `enumDescriptions` extended to 8 ids; new `chat.ollamaEndpoint` setting; `files` array adds `"docs/images/**"` so screenshots ship in the VSIX (marketplace listing renders them reliably regardless of GitHub fetch behavior); command title renamed as above.

### Fixed

- **Live2D model now resizes live with the panel** ([media/webview/interaction.js](media/webview/interaction.js)). Two issues fixed:
  - `fitModel()` was scaling to `getLocalBounds()`, which under-counts physics-driven parts (hair sway, skirt, breathing). With the panel made short, the actual rendered character overflowed and the feet got clipped. Switched to `internalModel.originalWidth/Height` (the Live2D-designed canvas — authoritative full extent) and added a small bottom padding (`max(6, h * 0.02)`) so animation sway no longer pokes past the panel edge.
  - After the user dragged the companion, the container was pinned with `position: fixed` + explicit pixel `width`/`height`. The wrapper inside then had frozen dimensions, so the existing `ResizeObserver` on the wrapper never fired when the parent panel was resized — the model size froze. Added a window-level `resize` listener AND a body-level `ResizeObserver` that re-sync the pinned container's `width`/`height` to its parent and explicitly refit the model. Clamps `left`/`top` so the companion stays inside the viewport after shrink. No-op for the default flex layout (unpinned case still works via the wrapper observer).

### Removed

- `src/chat/providers/openai.ts` — replaced by an `OpenAICompatibleProvider` instance with `baseUrl: 'https://api.openai.com/v1'` registered directly in [src/chat/llm-provider.ts](src/chat/llm-provider.ts). No public-facing change.

### Verified (no change needed)

- `package.json` `description` was already English — no rewrite required.

### Notes

- **Deferred to v0.4.0** (see [docs/PLAN_v0.3.1.md](docs/PLAN_v0.3.1.md) §4): chat directly from the desktop-pet right-click menu via speech-bubble response, and the right-click menu functional-area reorganization (AI Chat / Appearance / Voice & Sound / Workflow / Git Shortcuts / Desktop Companion submenus).
- **README sync convention**: English is the source of truth. The two non-EN files carry a `<!-- Source of truth: ../README.md -->` header comment; the JA file additionally carries a `<!-- TRANSLATION-REVIEW-NEEDED -->` marker since auto-translation may sound stiff in idiom-heavy sections (taglines, persona). Update all three when editing.

## [0.3.0] - 2026-05-13

### Added — AI Chat Companion (BYOK + Copilot)

Bản này biến companion từ một mascot thuần reactive thành **chat assistant** ngay trong VS Code panel. Trò chuyện với companion qua một panel slide-in tích hợp cạnh Live2D character, hỏi về code đang viết, lấy ý tưởng, học framework mới — companion vẫn giữ persona anime trong khi trả lời.

- **4 LLM provider hỗ trợ**:
  - **GitHub Copilot (mặc định, không cần API key)** — route qua `vscode.lm.selectChatModels({ vendor: 'copilot' })`. Dùng subscription Copilot có sẵn của user; first call sẽ trigger consent dialog của VS Code. Hỗ trợ mọi model Copilot expose (gpt-4o, claude-3.5/3.7-sonnet, gemini-1.5-pro, o1-mini…).
  - **Anthropic Claude (BYOK)** — `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`. Streaming qua SSE.
  - **OpenAI GPT (BYOK)** — `gpt-4o`, `gpt-4o-mini`, `o1-mini`. Streaming qua SSE với `stream_options.include_usage` cho token counting realtime.
  - **Google Gemini (BYOK, có free tier)** — `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-lite`, `gemini-2.0-flash`. Streaming qua `:streamGenerateContent?alt=sse`. Skip thinking parts (`thought: true`) cho 2.5 series.
- **BYOK an toàn**: API keys lưu trong `vscode.ExtensionContext.secrets` (OS keychain encrypted at rest). Webview không bao giờ thấy key — request body build ở extension host. Command `Set Chat API Key` cho QuickPick chọn provider + InputBox masked. Không có field nào trong `settings.json` lưu key.
- **Streaming token-by-token** với sparkle caret ✨ + thinking dots animation 3 chấm hồng khi đợi chunk đầu tiên — "thoughts coming out" experience.
- **Multi-conversation history**: persist mỗi conversation vào 1 file JSON dưới `globalStorageUri/chat-history/<id>.json` (atomic rename khi save). Sidebar liệt kê conversations, mỗi item có rename ✎ / delete 🗑 (driven bằng `showInputBox` / `showWarningMessage` của VS Code, không phải `prompt`/`confirm` browser — đó là cách hoạt động trong webview). Active conversation pinned per-workspace qua `workspaceState`. Empty conversations tự được dọn khi tạo mới để sidebar không phình.
- **Context awareness**:
  - **Selection toggle (📌)**: chip toggle icon ngay cạnh Send. Click → gửi editor selection hiện tại kèm prompt.
  - **Active file toggle (📄)**: kèm toàn bộ file đang mở (cap 12k chars, có truncation marker).
  - **`#file` mention**: gõ `#` trong textarea → autocomplete dropdown tìm file qua `vscode.workspace.findFiles`. Arrow Up/Down + Tab/Enter để chọn. Mention tự được resolve khi gửi.
  - **Right-click "Ask Companion About Selection"**: command palette + editor context menu. Stage selection vào chip vàng, mở panel, focus textarea.
- **Persona system**: 4 preset prompt (`cute`, `professional`, `tsundere`, `energetic`) inject `{modelName}` của Live2D character đang dùng. Override hoàn toàn bằng `chat.systemPrompt` setting.
- **Live2D reactions theo sentiment**: heuristic regex EN+VI chia mood ra `happy`/`sad`/`thinking`/`excited`/`neutral` sau khi stream xong → trigger `setMood` + `playMotion` (TapBody / TapHead) → character thật sự visibly phản ứng với câu trả lời. Toggle `chat.reactionsEnabled` (default `true`).
- **Avatar + identity**: assistant avatar dùng captured chibi PNG của Live2D model hiện tại (`globalStorageUri/cursor-chibi/{modelId}.png`), fallback `media/character.png`. Display name là tên Live2D model thật ("Hiyori", "Miara"…) chứ không phải "Companion" generic.
- **UI tinh chỉnh**:
  - **Split layout**: character bên trái, chat panel bên phải (clamp 80px–160px–20% cho character column). Character mood/motion animations luôn nhìn thấy được trong khi chat. Không media query để tránh stack dọc bất ngờ.
  - **Header 1 hàng + gear ⚙ toggle**: provider/model picker mặc định ẩn để chat log có thêm chiều cao. Click gear mở/đóng (vscode.getState persist).
  - **Custom AI model combo dropdown**: thay `<datalist>` (yêu cầu gõ mới hiện) bằng combo widget click-to-expand, hỗ trợ keyboard navigation, populate động cho Copilot từ `vscode.lm`.
  - **Anime pink pastel theme**: gradient hồng cho assistant bubble, lavender cho user bubble, soft shadow, rounded 14px với tail flatten, entrance animation cubic-bezier mềm. Pure custom — không phụ thuộc VS Code theme.
- **Token usage display**: trong status bar dưới: tokens per turn + Σ accumulated cho conversation hiện tại. Reset khi switch conversation.
- **Setting schema mới**: `chat.provider`, `chat.model`, `chat.personaPreset`, `chat.systemPrompt`, `chat.maxTokens` (default 2048, đủ cho Gemini 2.5 thinking), `chat.temperature`, `chat.reactionsEnabled`.
- **Commands mới**:
  - `Anime Companion: Open Chat`
  - `Anime Companion: Set Chat API Key (BYOK)`
  - `Anime Companion: New Chat Conversation`
  - `Anime Companion: Clear All Chat Conversations`
  - `Anime Companion: Ask Companion About Selection` (cũng có ở editor right-click menu)

### Changed
- Default `chat.provider` là `copilot` cho mọi user mới — mọi VS Code user đều có account GitHub, không cần xin key để bắt đầu chat. Một-time migration trên upgrade clear global `chat.provider` override để fallback về default Copilot (giữ nguyên workspace-level setting).
- `runSetApiKeyCommand` không còn auto-switch provider sau khi save key. User phải proactively chọn provider qua dropdown — tránh bị bất ngờ chuyển sang BYOK provider chỉ vì paste key thử.
- `files` array trong `package.json`: `out/*.js` → `out/**/*.js` để include `out/chat/**` nested directories.

### Architecture
- **CSS isolation**: cursor chibi tuning UI (orb widget) tách hẳn class prefix từ `chat-*` sang `chibi-orb-*` + có file CSS riêng `media/webview/cursor-chibi.css`. Chat panel và cursor chibi giờ không thể accidentally share CSS rule.
- **3 file CSS độc lập theo prefix**:
  - `media/companion.css` — Live2D character, idle bubble, status bar
  - `media/webview/chat.css` — chat panel UI (header, sidebar, messages, form)
  - `media/webview/cursor-chibi.css` — cursor chibi position tuning widget
- **Webview message protocol mới** (`chat:*`): `chat:send`, `chat:cancel`, `chat:snapshot`, `chat:userMessage`, `chat:assistantStart/Delta/End`, `chat:setProvider`, `chat:setModel`, `chat:setApiKey`, `chat:newConversation`, `chat:loadConversation`, `chat:requestRename`, `chat:requestDelete`, `chat:requestFiles`, `chat:stagedSelection`, `chat:clearStagedSelection`.
- **`src/chat/` module mới**: `secrets.ts`, `persona.ts`, `llm-provider.ts`, `providers/{anthropic,openai,gemini,copilot}.ts`, `sse-parser.ts`, `chat-manager.ts`, `conversation-store.ts`, `context-builder.ts`, `sentiment.ts`.
- **Resource roots mở rộng**: webview localResourceRoots giờ bao `globalStorageUri/cursor-chibi/` cho chibi avatar trong chat.

### Notes
- Toàn bộ feature chat đã được iterate qua 16 patch builds nội bộ (0.2.0 → 0.2.16) trước khi consolidate thành 0.3.0 cho marketplace.
- Desktop Companion mode chưa có chat UI ở phiên bản này — bridge dùng bootstrap HTML khác. Chat commands (set key, etc.) vẫn hoạt động qua Command Palette. Tích hợp đầy đủ Desktop ↔ chat để v0.4.x.

## [0.1.50] - 2026-05-11

### Changed
- Đồng bộ tài liệu public và nội bộ cho trạng thái hiện tại của repo: `README.md`, `CHECKLIST.md`, `PUBLIC_RELEASE_GUIDE.md`.
- README giờ phản ánh đúng các tính năng đã ship gần đây quanh **Cursor Chibi**, **capture/reset chibi**, extended **voice assets**, command list và settings list cho `0.1.50`.

### Notes
- Đây là bản release-prep / documentation sync để gói phát hành `0.1.50` khớp với code và workflow publish hiện tại.

## [0.1.49] - 2026-05-08

### Added
- **Capture Chibi from Model**: command `Anime Companion: Capture Chibi from Model` snapshot canvas Live2D đang render → auto-crop transparent borders → resize tối đa 96px (giữ aspect ratio) → save vào `globalStorage/cursor-chibi/{modelId}.png`. Cursor chibi tự đổi sprite ngay (không cần reload). 1 file/model — switch model là chibi đổi theo.
- Command `Anime Companion: Reset Captured Chibi` để xoá PNG đã capture của model hiện tại, fallback về icon bundled.

### Changed
- `cursor-chibi.ts`: decoration CSS dùng `background-size: contain` + `background-position: center` thay vì stretch sang square — captured chibi portrait giữ đúng aspect ratio, không bị méo.
- Resize captured ảnh xuống ≤96px max dim trước khi save (VS Code icon decoration scale chuẩn hơn khi source PNG nhỏ).

## [0.1.48] - 2026-05-08

### Added
- **Tune Cursor Chibi Size**: extend command tune position thêm options `+ Bigger` / `− Smaller` (step 2px) trong cùng quick-pick. Reset all clear cả x, y, size.
- Config mới `animeCompanion.cursorChase.sizePx` (numeric, 0 = dùng enum small/medium/large; >0 = override exact px). Min 1px, max 64px.

### Fixed
- Chibi không co được dưới ~24px do VS Code có CSS `min-width/min-height` ngầm cho decoration `before` element. Override bằng inline `!important` (`min-width: 0`, `max-width: ${sizePx}px`, `background-size: contain`).

## [0.1.47] - 2026-05-08

### Added
- **Tune Cursor Chibi Position**: command interactive mở quick-pick cho phép nhích chibi 4px theo Up/Down/Left/Right realtime, lặp đến khi user chọn Done. Settings (`cursorChase.offsetX`, `cursorChase.offsetY`) lưu Global, persist qua reload.
- Config mới `animeCompanion.cursorChase.offsetX/offsetY` (default 0) — pixel offset cộng thêm vào base position auto-centered.

## [0.1.46] - 2026-05-08

### Fixed
- **Auto-show panel sau reload không hoạt động**: root cause là `setContext('animeCompanion.visible', true)` được gọi async sau setTimeout 1.5s, nhưng VS Code đã evaluate `when` clause cho view container trước đó. Fix bằng cách gọi `setContext` **synchronous** ngay khi register webview view provider, để view xuất hiện trong panel container ngay từ đầu. Companion giờ tự hiện đúng sau mọi reload window / restart VS Code.

## [0.1.45] - 2026-05-08

### Added
- Webview helper `playLine(key)` trong `media/webview/audio.js` — convenience wrapper cho `playAudio(`${key}.mp3`)` để thêm câu thoại mới chỉ cần 1 dòng code.

### Fixed
- **Cursor chibi leak vào OUTPUT panel / debug console**: VS Code coi các panel này là TextEditor nên `onDidChangeTextEditorSelection` fire kéo chibi theo, gây ra 2 chibi cùng lúc trên màn hình. Fix bằng cách filter `editor.document.uri.scheme` chỉ áp dụng cho `file`, `untitled`, `vscode-userdata`, đồng thời clear decoration từ visible editors khác khi switch.
- `animeCompanion.toggle` (click WhiteAngel ở status bar): bỏ `live2dView.toggleVisibility` (throw trên một số VS Code build) → tự flip `setContext` + focus.

## [0.1.41 - 0.1.44] - 2026-05-08

### Added (0.1.41)
- **ElevenLabs Voice Pipeline** (build-time + lazy-load):
  - Per-language config: `media/voice/en.json`, `media/voice/vi.json` chứa `voiceId`, `modelId`, `voiceSettings`, danh sách `lines`.
  - Script `scripts/generate-voice-assets.js` gọi ElevenLabs TTS API → MP3 ra `dist/voice-assets/{lang}/`. Idempotent qua hash cache, support flag `--lang`, `--key`, `--force`. JSON config tolerate `//` comment.
  - Script `scripts/pack-voice-assets.js` đóng gói thành `{lang}.zip`.
  - Workflow `.github/workflows/voice-assets-release.yml` (manual dispatch) build + upload zips lên GitHub release tag (default `audio-v1`).
  - Class `src/voice-asset-downloader.ts` lazy-load `{lang}.zip` runtime, cache theo extension version trong `globalStorage`. Fallback về `media/audio/{lang}/` bundled khi download fail.
  - Config mới: `voiceAssets.downloadBaseUrl`, `voiceAssets.enableExtended`.
  - Script diagnostic `scripts/list-elevenlabs-voices.js` in ra mọi voice mà API key dùng được + category (`[premade]` / `[generated]` / `[professional]`).

### Changed
- `package.json`: thêm `media/voice/**` vào `files` để JSON config ship trong VSIX, MP3 chỉ lazy-load.
- `companion-view.ts`: trước render webview HTML, gọi `voiceAssetDownloader.ensureLanguageAudio(lang)` cho en/vi, swap `__AUDIO_BASE_URL__` sang cache dir nếu có. `localResourceRoots` mở rộng để webview load được file MP3 cache.

### Notes
- 4 line bundled (`headpat`, `spam`, `poke`, `help`) trong `media/audio/{lang}/` được giữ làm offline fallback. Pipeline mới chỉ ảnh hưởng en/vi; ja vẫn dùng VOICEVOX MP3 bundled.

## [0.1.40] - 2026-05-06

### Added
- Desktop Companion sidecar giờ được lazy-download thật ở runtime từ `animeCompanion.desktopCompanion.downloadBaseUrl` khi máy user chưa có binary cache.
- Có progress notification trong lúc tải Desktop Companion, rồi hiện thông báo khi download/extract xong và chuẩn bị launch.

### Changed
- Desktop Companion sidecar cache theo version extension trong `globalStorage`, để update version không bị dùng lẫn binary cũ.
- Ưu tiên resolve binary theo thứ tự: `devBinaryPath` -> binary đã cache -> local build fallback, giúp bản publish dùng lazy-download còn dev local vẫn test nhanh được.

### Fixed
- Bản publish không còn phụ thuộc vào việc ship sẵn `desktop-pet/target/release/anime-companion-pet.exe` trong `.vsix`.
- `desktopCompanion.downloadBaseUrl` giờ phản ánh đúng behavior runtime thay vì chỉ là setting placeholder.

## [0.1.39] - 2026-05-06

### Fixed
- Packaging/publish flow: bỏ yêu cầu ship `desktop-pet/target/release/anime-companion-pet.exe` trong `.vsix`, tránh việc GitHub Actions release fail khi CI checkout source nhưng không có local Windows sidecar artifact.
- VSIX allowlist tiếp tục giữ gói extension gọn, trong khi Desktop Companion sidecar vẫn được phát hành riêng qua GitHub Release `desktop-pet-v1`.

## [0.1.38] - 2026-05-06

### Added
- Desktop Companion mode (Windows v1): companion có thể chạy thành cửa sổ desktop nổi riêng qua setting `animeCompanion.desktopCompanion.enabled`, dùng Tauri sidecar + WebSocket bridge để tái sử dụng reactive engine hiện có.
- Bộ setting mới cho Desktop Companion: `alwaysOnTop`, `clickThrough`, `size`, `position`, `opacity`, `downloadBaseUrl`, `devBinaryPath`.
- Binary desktop companion được lazy-download từ GitHub Releases ở lần bật đầu tiên; hỗ trợ override binary local cho flow dev/test.
- Command `Anime Companion: Reset Companion Position` để reset vị trí companion trong panel mode.

### Changed
- Public package / docs được cập nhật để phản ánh trạng thái hiện tại ở `v0.1.38`, thay vì snapshot cũ `v0.1.27`.
- Tên setting public được chuẩn hoá sang namespace `animeCompanion.desktopCompanion.*`; extension vẫn migrate/fallback từ legacy key `animeCompanion.desktopPet.*`.
- Panel mode và Desktop Companion mode được tách mutually-exclusive để tránh chạy 2 instance Live2D cùng lúc.

### Notes
- Desktop Companion v1 hiện ship binary chính thức cho Windows. Trên Mac/Linux, extension vẫn có thể chạy bridge để debug nhưng chưa có binary release chính thức.

## [0.1.27] - 2026-05-05

### Added
- Ambient background audio ngay trong companion với 3 preset built-in: `lofi`, `rain`, `cafe`, có thể bật/tắt nhanh từ menu chuột phải.
- Hỗ trợ `animeCompanion.ambientVolume` để chỉnh âm lượng ambient riêng với phần voice/reaction audio.
- Hỗ trợ `animeCompanion.customAmbientTracks` để user thêm track local của riêng mình vào Ambient panel.

### Changed
- README được cập nhật để phản ánh flow sử dụng ambient/background music và các setting liên quan.

## [0.1.26] - 2026-05-04

### Added
- Auto-scan local model roots qua `animeCompanion.customModelRoots`. User chỉ cần trỏ tới một thư mục gốc như `D:/model`, extension sẽ tự quét các thư mục con chứa `.model3.json` và thêm chúng vào model picker.
- Hỗ trợ override chi tiết từng model local qua `animeCompanion.customModels` để đổi tên hiển thị, mô tả, hoặc file `.model3.json`.

### Changed
- Dọn flow publish: loại 6 model không có quyền redistribute rõ ràng khỏi `media/live2d/` và khỏi đường build asset mặc định. Repo/public package giờ chỉ còn 4 model sample an toàn hơn: Hiyori, Haru, Mao, Miara.
- README, MODELS.md và license notes được cập nhật theo flow custom local model mới.

### Fixed
- Ổn định việc đổi model trong webview bằng cách cleanup model / PIXI app cũ trước khi load model mới, giảm lỗi khi switch qua lại giữa các model local.

## [0.1.25] - 2026-05-02

### Fixed
- Extension activation failed silently on Cursor / VSCodium / Open VSX installs because `node_modules/**` was excluded from the vsix, so `require('adm-zip')` in [src/model-downloader.ts](src/model-downloader.ts) hit MODULE_NOT_FOUND. `.vscodeignore` updated to allow vsce to ship production dependencies. `@types/adm-zip` moved to `devDependencies` (no need to ship type definitions at runtime).

## [0.1.24] - 2026-05-01

First Marketplace release.

### Added
- **Lazy-load Live2D models**: chỉ Hiyori bundled trong .vsix (~8 MB). 3 model Live2D Sample khác (Haru, Mao, Miara) download on-demand từ GitHub Release. Setting `animeCompanion.experimentalModels` bật thêm 6 model gated.
- **Achievements panel**: command `Anime Companion: Show Achievements` hiển thị 7 achievement với trạng thái lock/unlock.
- **Stats dashboard**: command `Anime Companion: Show Stats` cho saves / commits / errors fixed / coding time today / all-time.
- **Per-workspace model**: chọn model lưu trong `workspaceState`, fallback về setting global. Thêm command `Reset Workspace Model`.
- **Live2D motion picker**: submenu "Motion" trong right-click + command `Play Motion`.
- **Pomodoro visual ring**: SVG progress ring overlay trên character (đỏ work, vàng break).
- **Custom Pomodoro interval per workspace**: hỗ trợ override `pomodoroWorkTime`/`pomodoroBreakTime` qua `.vscode/settings.json`.
- **Sound cue khác nhau cho Pomodoro work/break**: work giữ `poke.mp3`, break dùng `headpat.mp3`.
- Persistent stats store ([src/stats.ts](src/stats.ts)) với daily rollover, capped 60s gap khi accumulate coding time.

### Changed
- `ReactiveManager` không còn giữ counter trong RAM — toàn bộ chuyển sang `StatsStore` (globalState).
- Bộ context menu mở rộng: thêm Motion, Achievements, Stats.

## [0.1.20]

### Added
- Custom user phrases (`animeCompanion.customPhrases.idle/save/error`).
- Per-language reactive messages: `media/messages/{vi,en,ja}.json`.
- Custom keyword reactions (`animeCompanion.customKeywords`).

## [0.1.19]

### Added
- Reactive toggles per-channel (`reactive.diagnostics` / `reactive.save` / `reactive.typing` / `reactive.git`).
- Quiet hours setting để mute message theo khung giờ.

## [0.1.18]

### Changed
- Tách `extension.ts` thành module: `companion-view.ts`, `models.ts`, `model-server.ts`, `pomodoro.ts`, `messages.ts`, `git-ops.ts`.
- Bật `tsconfig.strict: true`.

## [0.1.16]

### Added
- Custom right-click menu trên character (10 mục): Run, Commit, Pull, Push, Model, Voice, Mute, Poke, Pomodoro, Settings.
- Inline picker panel trên character cho Model / Voice / Message language.

## [0.1.10]

### Added
- Reactive engine: react theo diagnostics, save, typing speed, build, debug, git.
- Mood system 4 trạng thái (idle/happy/angry/sleepy).
- Achievement primitive: `save50/100`, `error_fix_10/50`, `coding_1h/3h`, `commit10`.
- Easter eggs cho `TODO` / `FIXME` / `console.log`.

## [0.1.5]

### Added
- 7 Live2D model: Hiyori, Cheshire, Ice Girl, Tsubaki, White Angel, Vivian, Changli.
- Multilingual voice: `ja` (VoiceVox), `vi`, `en` (Google TTS).
- Lipsync qua `model.speak()` + fallback HTML5 Audio.
- Pomodoro Manager với countdown trên status bar.

## [0.1.0]

### Added
- Initial release: Live2D companion view qua local HTTP server bypass CSP.
- Single click / multi click / long-press / spam click interactions.
- Status bar item.
