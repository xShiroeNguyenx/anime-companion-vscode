<!-- Source of truth: ../README.md — keep sections in sync when editing. -->
<!-- TRANSLATION-REVIEW-NEEDED: taglines, persona descriptions, and reactive bubble examples are idiomatic — please review tone. -->

# 🌸 Anime Companion for VS Code

> **言語**: [English](../README.md) · [Tiếng Việt](README.vi.md) · **日本語**

> VS Code のパネルに住む、かわいい Live2D の相棒。コーディング中の出来事に反応します — エラー、保存、コミット、ビルド、デバッグ、ポモドーロ… **そして今や、あなたとチャットができます**。GitHub Copilot か、お好きな API キー（Anthropic / OpenAI / Gemini / xAI / DeepSeek / OpenRouter / Ollama）で使えます。

> ⚠️ **実験版 — v0.4.x.** これは early-access ビルドです。v1.0 に到達するまで、マイナーバージョン間で API、設定、振る舞いが変わることがあります。バグや感想は [GitHub Issues](https://github.com/xShiroeNguyenx/anime-companion-vscode/issues) で歓迎します。

**現在のバージョン:** v0.5.0

> 🆕 **v0.5.0 の新着**:
> - **🖼️ 背景画像（ワークベンチ）＋ ちゃんとした操作パネル** — エディター・サイドバー・パネルの背景に画像を表示します。「Background」拡張と同じく VS Code のワークベンチをパッチしますが、ここでの主役は分かりにくい JSON 編集ではなく**ビジュアルな操作パネル**です。領域ごとに画像を選び、不透明度 / ぼかし / サイズ / 位置をライブプレビューで調整し、**適用**（ウィンドウをリロード）。ワンクリックの**無効化して元に戻す**、VS Code 更新後の自動再適用、そして `vscode:uninstall` フックでのクリーンアップにより、パッチが残ったままになりません。
> - ⚠️ 背景は**ウィンドウのリロード後**に表示され、**VS Code の更新後は再適用が必要**で、Program Files インストールの場合は一度だけ管理者として実行が必要なことがあります — パネル内で丁寧に説明します。「installation corrupt」警告を抑制する任意のトグルもあります。
>
> **v0.4.3**（Claude アカウント切替の正常動作）、**v0.4.2**（Claude team/SSO 保存 + 🐙 GitHub アカウント切替）、**v0.4.0**（Agent Accounts、💬 Pet Quick Chat）を土台にしています。

![Anime Companion hero](images/01-hero-companion-panel.png)

## 📦 インストール

### VS Code (Microsoft Marketplace)
```bash
code --install-extension shiroenguyen.anime-companion-vscode
```

### Cursor / VSCodium / Theia / Gitpod (Open VSX Registry)
```bash
code --install-extension shiroenguyen.anime-companion-vscode
```
または、[Open VSX ページ](https://open-vsx.org/extension/shiroenguyen/anime-companion-vscode) から `.vsix` をダウンロードして、`code --install-extension <file>` を実行します。

### 手動インストール（VS Code 系のエディター全般）
1. [GitHub Releases](https://github.com/xShiroeNguyenx/anime-companion-vscode/releases) から最新の `.vsix` を取得します。
2. エディターで `Ctrl+Shift+P` → **Extensions: Install from VSIX...** → ダウンロードしたファイルを選択します。

---

## ✨ 機能

### 🖼️ 背景画像（ワークベンチ）— ちゃんとした操作パネル付き

![背景画像の操作パネル](images/13-background-image.png)

- **VS Code の後ろに好きな画像を表示** — エディター・サイドバー・パネル、または**全画面**で1枚をウィンドウ全体に。人気の「Background」拡張と同じくワークベンチをパッチしますが（公開 API がないため）、ここでの主役は分かりにくい JSON 編集ではなく**ビジュアルな操作パネル**です。
- **領域ごと or ウィンドウ全体:**
  - 🪟 **全画面** — 1枚の画像をウィンドウ全体に（エディター + サイドバー + パネル + アクティビティ/ステータスバー）。
  - 📝 **エディター / 📁 サイドバー / 🖥️ パネル** — 各領域の*テキストの背後*に別々の画像、個別に切替。
- **使いやすいコントロール**（領域ごと）：サムネイル付き画像選択、**不透明度** / **ぼかし** / **サイズ**（カバー / 収める / 繰り返し / 引き伸ばし）/ **位置**（3×3）、パネル内の**ライブプレビュー**。
- **正直なライフサイクル** — JSON 専用拡張が隠しがちな点をパネル内に明示：
  - **適用（ウィンドウをリロード）**で反映；**無効化して元に戻す**できれいに復元。
  - VS Code 更新後は自動で再適用；アンインストール時に自動クリーンアップ（`vscode:uninstall` フック）。
  - 「インストールが破損」警告を抑制する任意トグル（`product.json` のチェックサムをパッチ）。
  - リロード / 更新後の再適用 / Program Files なら管理者実行が必要なことの説明あり。
- **多言語** — パネルはメッセージ言語（vi / en / ja）に追従し、変更すると即座に切り替わります。

**クイックスタート:** コマンドパレット → `Background Image: Open Control Panel`（またはコンパニオンの右クリック → **外観 › 🖼️ 背景画像**）→ 画像を選択 → **適用**。

> ⚠️ 背景の変更は**ウィンドウのリロード**が必要で、**VS Code 更新後は再適用**が必要、Program Files インストールでは一度だけ管理者実行が必要なことがあります。パネルが丁寧に説明します。v1 は**デスクトップ版 VS Code stable**対応（Cursor でも動作）。

### 💬 AI Chat Companion

![Chat panel streaming](images/03-chat-panel-streaming.png)

- **コンパニオンと直接チャット**。Live2D キャラクターの隣に開くスライドパネルから利用できます。書いているコードについて質問したり、アイデアを練ったり、新しいフレームワークを学んだり — コンパニオンはアニメ風のペルソナを保ったまま返答します。
- **8 つの LLM プロバイダー対応。デフォルトはキー不要**:
  - 🟢 **GitHub Copilot（デフォルト、API キー不要）** — `vscode.lm` 経由で既存の Copilot サブスクリプションを使用します。Copilot が公開するすべてのモデル（gpt-4o、claude-3.5/3.7-sonnet、gemini-1.5-pro、o1-mini など）に対応します。
  - 🤖 **Anthropic Claude (BYOK)** — claude-opus-4-7、claude-sonnet-4-6、claude-haiku-4-5。
  - 🤖 **OpenAI GPT (BYOK)** — gpt-4o、gpt-4o-mini、o1-mini。
  - 🤖 **Google Gemini (BYOK、無料枠あり)** — gemini-2.5-flash/pro/flash-lite、gemini-2.0-flash。
  - 🆕 **xAI Grok (BYOK)** — grok-2-latest、grok-3、grok-beta。
  - 🆕 **DeepSeek (BYOK)** — deepseek-chat、deepseek-reasoner（chain-of-thought は非表示）。
  - 🆕 **OpenRouter (BYOK)** — 1 つのキーで 100 以上のモデル（Claude、GPT、Llama、Gemini、DeepSeek など。`:free` 枠も含む）にアクセスできるゲートウェイです。
  - 🆕 **Ollama（ローカル、キー不要）** — ローカルの Ollama サーバー（デフォルト `http://localhost:11434`）に接続します。完全オフラインで動作します。任意のモデルを `ollama pull llama3.2` で取得できます。

![Provider picker](images/04-chat-provider-picker.png)

- **安全な BYOK**: API キーは VS Code SecretStorage（OS のキーチェーンで暗号化）に保存されます。webview からキーは見えません。
- **トークン単位のストリーミング**。✨ のスパークルカーソルと、応答待ちの間に表示されるピンクの 3 ドットアニメーション付きです。
- **マルチカンバセーション**: 再起動後も履歴が保持されます。サイドバーで一覧／改名／削除ができ、アクティブな会話はワークスペース単位で固定されます。
- **コンテキスト対応**:
  - 📌 エディターの選択範囲を添付するトグル。
  - 📄 アクティブファイル全体を添付するトグル。
  - `#filename` でワークスペース内のファイルを自動補完。
  - コードを右クリック → 「Ask Companion About Selection」で、選択範囲をステージしてチャットを開きます。

![Context mention](images/05-chat-context-mention.png)

- **センチメントリアクション**: コンパニオンは自分の返答に応じて表情を変えます — 楽しい返答 → `TapBody` + happy ムード、考え中 → `TapHead` + idle、悲しい／エラー → sleepy。
- **返信をワンクリックでコピー**: 完了したアシスタント吹き出しの右下に小さなクリップボードアイコンが表示されます（ストリーミング中は非表示）。クリックするとチェックマークにポップアニメーションで切り替わり、吹き出しが緑にフラッシュします。生のマークダウンソースをコピーするため、返信内のコードブロックの「Copy」ラベルが混入しません。
- **ペルソナ**: プリセットは 4 種（`cute` / `professional` / `tsundere` / `energetic`）。完全にカスタムなシステムプロンプトも設定できます。
- **アバターと名前** は現在の Live2D モデルから取得されます — アシスタントの吹き出しには「Hiyori」や「Miara」が表示され、汎用の「Companion」とは出ません。

**クイックスタート:**
1. Anime Companion パネルを開きます（下部パネル、または `Ctrl+Shift+P` → `Anime Companion: Show`）。
2. 右下の 💬 ボタンでチャットパネルを開きます。
3. デフォルトのプロバイダーは **GitHub Copilot** — VS Code で Copilot にサインイン済みであれば、そのまま質問を打って Send するだけです。
4. BYOK や Ollama を使いたい場合は、⚙ → プロバイダーを変更 → 🔑 をクリックしてキーを貼り付け（または Ollama のエンドポイントを設定）してください。

### 🎭 Live2D Companion

![Live2D models](images/02-live2d-models-gallery.png)

- **Free Material License の Live2D Sample モデル 4 体**: **Hiyori**、**Haru**、**Mao**、**Miara**。Hiyori は `.vsix` に同梱、残り 3 体は初回選択時に遅延ダウンロードされます。
- VS Code の CSP を回避するため、ローカル HTTP サーバー経由で `pixi-live2d-display` + Cubism Core を使ってレンダリングします。
- **パネルのライブリサイズ**: VS Code のパネルを高く／低く／広くドラッグすると、キャラクターがリアルタイムで再フィットします。デフォルトの flex レイアウトでも、コンパニオンを別の場所にドラッグした後でも動作します — アニメーションの揺れを吸収する小さな下部マージンのおかげで、足が切れることはありません。
- Live2D の読み込みに失敗した場合は静止画にフォールバックします。
- PIXI ticker による滑らかな表情ブレンド — ムード遷移がガタつきません。
- `animeCompanion.customModelRoots` または `animeCompanion.customModels` で独自のローカルモデルを追加できます（[MODEL_LICENSE_AUDIT.md](../MODEL_LICENSE_AUDIT.md) を参照）。
- ワークスペースを開いているとき、モデルはワークスペース単位で記憶されます。グローバルモデルに戻すコマンドもあります。

### 🐥 Cursor Chibi

![Cursor chibi](images/07-cursor-chibi.png)

- **エディターのカーソルを追いかけるチビスプライト** を表示できます。`Anime Companion: Toggle Cursor Chibi` コマンド、または `animeCompanion.cursorChase.enabled` 設定で切り替えます。
- `Anime Companion: Tune Cursor Chibi Position` で `Up/Down/Left/Right` とサイズをライブ調整し、グローバル設定に保存できます。
- `Anime Companion: Capture Chibi from Model` で、**レンダリング中の Live2D モデルから直接チビをキャプチャ** できます。拡張機能が透明背景を自動でクロップして縮小し、アクティブなモデルのスプライトとして使います。
- `Anime Companion: Reset Captured Chibi` で、キャプチャ済み PNG を削除して同梱アイコンに戻せます。
- Output / Debug Console への漏れを防ぐため、チビは実際のエディター（`file`、`untitled`、`vscode-userdata`）のみを追跡します。

### 🪪 Agent Accounts (Claude / Codex 認証情報スワップ)

- **複数の Agent CLI ログインを保存して再認証なしで切り替え。** コンパニオンが各 CLI の認証ファイルをスナップショットし、切り替え時にアトミックに復元します — PowerShell のアカウントスワップスクリプトと同じ発想を、Node `fs` でクロスプラットフォーム化してペットの右クリックメニューに統合しました。
- **ツール非依存のバックエンドレジストリ** — 新しい CLI 対応はバックエンドファイル 1 個 (`AccountBackend` インターフェース) + `registerBackend(...)` 1 行で完了。UI 全体 (ポップアップ、パネル、ステータスバー、コマンドパレット) がレジストリ経由で自動的に発見します。
- **同梱バックエンド:**
  - 🤖 **Claude Code** — `~/.claude/.credentials.json` ほかをスナップショット。識別表示 `sub=team · org=09eb97ad · exp=…` で 2 つのアカウントを一目で区別可能。
  - ⚡ **Codex** — `~/.codex/auth.json` をスナップショット。識別表示 `mode=chatgpt · user@example.com · plan=plus` (OAuth `id_token` のペイロードからデコード、トークン本体は読みません)。
- **ツール単位のアクティブ検出** — 「最後の切り替え」を信用せず、各バックエンドの実際の認証ファイルを読んで保存済みスナップショットの署名と照合します。外部 (PowerShell スクリプト等) でスワップしてもステータスバーとパネルに正しく反映されます。複数ツールが同時に "active" — Claude アカウント A *と同時に* Codex アカウント B、のような状態も表現可能。
- **ペットの位置に出るポップアップ** — ペットを右クリック → **Agent ›**:
  - **🔁 クイック切替** — ツールごとにグループ化された一覧 (`🤖 Claude (2)` / `⚡ Codex (1)`)、行をクリックでスワップ。
  - **💾 現在のアカウントを保存** — インラインのツールピッカー (1 ツールなら自動選択) + 名前入力 — すべてペットに紐づく、VS Code QuickPick への中断なし。
  - **👀 アカウントを管理…** — Use / Rename / Delete + ツール別セクションのスタンドアロン Webview パネル。
- **ステータスバー項目** — アクティブなプロファイル名 (複数ツールアクティブ時は「N accounts」+ ツール別ツールチップ) を表示。クリックでクイック切替。
- **アトミックで安全な復元** — 各ファイル `<final>.tmp` + `fs.rename`。復元前にツール単位で 3 件のローリングバックアップ。スナップショットが空/欠落 → 拒否、ライブ認証は上書きされません。
- **再起動ヒント** — スワップごとに、新トークン読み込みのため CLI 再起動を促す情報トーストを表示。プロセスを自動で kill することはしません。

**クイックスタート:**
1. 任意のターミナルで `claude` (または `codex`) にログインして認証ファイルを作成。
2. ペットを右クリック → **Agent → 💾 現在のアカウントを保存…** → 名前を入力 (例: `work`)。
3. ログアウト後 2 つ目のアカウントでログインして別名で繰り返し (例: `personal`)。
4. ペットを右クリック → **Agent → 🔁 クイック切替** → 選択 → 認証ファイルが即時にスワップ。CLI を再起動して新アカウントで使用開始。

### 🪟 Desktop Companion (Windows v1)

![Desktop pet](images/06-desktop-pet-window.png)

- VS Code パネルの中だけでなく、**フローティングのデスクトップウィンドウ** としてコンパニオンを実行できます。
- `animeCompanion.desktopCompanion.enabled` を有効にして、ウィンドウをリロードしてください。
- Desktop Companion がオンのとき、Live2D が二重に動かないように VS Code 側のパネルは自動で隠れます。
- デスクトップペットのバイナリは初回起動時に GitHub Releases から **遅延ダウンロード** されます。ローカルテスト用に `animeCompanion.desktopCompanion.devBinaryPath` で上書きできます。
- `alwaysOnTop`、`clickThrough`、`size`、`position`、`opacity` に対応します。
- v1 は **Windows のみ**。Mac / Linux のバイナリは後のリリースで予定されています。

### 💫 インタラクション

- **シングルクリック** — そっと触る（Surprised）。
- **ダブル／トリプルクリック** — うれしい（Happy）。
- **0.8 秒以上のロングプレス** — Headpat → Shy → Love、ハートエフェクト付き。
- **連打** — 怒ります（"Stop poking me!"）。

### 🔊 音声 + リップシンク（3 言語）

- **日本語 (ja)** — VoiceVox Shikoku Metan、アニメ風の日本語ボイス。
- **ベトナム語 (vi)** — 同梱ボイス + 必要時に extended voice assets を遅延ダウンロード。
- **英語 (en)** — 同梱ボイス + 必要時に extended voice assets を遅延ダウンロード。
- 吹き出しテキストと音声は独立: 音声は `ja` のままで、テキストだけ `vi` / `en` / `ja` に切り替えられます。
- `model.speak()` による自動リップシンク。PIXI Audio プラグインに問題があれば HTML5 Audio にフォールバックします。
- 同梱音声だけで十分なら `animeCompanion.voiceAssets.enableExtended` を無効化できます。

### 🎧 バックグラウンド・アンビエント

![Ambient menu](images/10-ambient-menu.png)

- **3 つのプリセット**: **Lofi**、**Rain**、**Cafe** を内蔵しています。
- アンビエントはコンパニオンの音声とは別ループで再生されます。反応ボイスと BGM を同時に聴けます。
- `off` プリセットで完全に停止、`animeCompanion.ambientVolume` で音量調整できます。
- `animeCompanion.customAmbientTracks` で **カスタムのローカルトラック** を追加できます。

### 🤖 Reactive Engine — コーディング環境に反応

| イベント | 反応 |
|---|---|
| Problems パネルでエラーが増減 | 落ち込んだり褒めたりする吹き出し |
| Save 連打（Ctrl+S 連続） | "Ctrl+S warrior detected! 🛡️" |
| 速いタイピング | "Speed coding mode activated! 💨" |
| `TODO` / `FIXME` / `console.log` の入力 | キーワードごとの Easter egg |
| ユーザー定義のカスタムキーワード | `animeCompanion.customKeywords` 経由のカスタム吹き出し |
| ビルド成功／失敗 | "Build OK! 🎉" / "Broken! 😭" |
| デバッグ開始／停止 | "Detective mode: ON 🕵️" |
| Git ブランチ切り替え | "Switched branch? 🌿" |
| 新しいコミット | "Nice commit! 💪" |
| マージ衝突 | "Merge conflict over there! 😨" |
| 未コミットファイルが多い | "{count} files changed, commit soon!" |
| 30 分連続コーディング | 休憩リマインダー、水を飲もう |
| アイドル／エラー多発／コーディング絶好調 | ムードが `sleepy` / `angry` / `happy` に切り替え |

各チャネルは設定から個別に ON/OFF できます。

### 🏆 アチーブメント

![Achievements](images/09-achievements-panel.png)

- 実績は **全23個**。`save`、`bug fix`、`commit`、`coding time`、`AI chat`、`Pomodoro` の6つの進化チェーンに加えて、4つの secret achievements があります。
- Achievements パネルは companion 上の **evolution tree** 表示になり、rarity (`Common` → `Mythic`) と rarity ごとの unlock effect、各チェーンの tier progression、解除前は hint だけ見える secret lane を表示します。
- 同じパネルに **daily / weekly quest** と **companion memory** も入り、解除した実績や達成した quest を一緒に振り返れます。
- local-first の **reward economy** も入り、achievement / quest から `gems`、`tickets`、cosmetic、voice pack をオフラインのまま獲得できます。
- 実績一覧は companion パネルでも確認でき、パネルが使えない場合は Quick Pick fallback でも見られます。

### 📊 統計
- `save` 回数、`commit` 回数、修正済みエラー数、今日のコーディング時間、累計コーディング時間、AI prompt 数、Pomodoro 集計、quest progress、最近の memory を追跡します。
- **local profile** では level、affinity、top achievement、unlock inventory を見られ、**PNG share card** も export できます。
- クイック表示用のコマンドがあります。

### 🍅 ポモドーロ

![Pomodoro running](images/08-pomodoro-running.png)

- 作業／休憩の自動ループ（デフォルト 25/5 分、設定可能）。
- ステータスバーに集中中は `🔥 23:42`、休憩中は `☕ 04:12` を表示。
- キャラクター上にビジュアルリングをオーバーレイ。
- ステータスバーをクリックですぐに停止できます。

### 🖱️ カスタム右クリックメニュー

![Right-click menu](images/11-rightclick-menu.png)

コンパニオンを右クリックでインラインメニューが開きます — Command Palette を経由する必要はありません。

- 🚀 **Run** — デバッグセッションを再起動または開始
- 🔧 **Git** — `Commit`、`Pull`、`Push`
- 💬 **AI Chat** — `Quick Chat`。パネルモードでは `Open Chat`、`New Conversation`、`Ask About Selection`、`Configure Provider`、`Clear All` も表示
- 🌸 **Appearance** — `Model`、`Capture Chibi`、`Toggle Cursor Chibi`、`Tune Cursor Chibi`、`Reset Position`、`Motion`、`Poke`
- 🔊 **Voice & Sound** — `Voice`、`Messages`、`Ambient`、`Mute` / `Unmute`
- 🍅 **Workflow** — `Start Pomodoro`、`Stop Pomodoro`、`Stats`、`Achievements`、`Quests`、`Profile`、`Share Card`
- 🪪 **Agent** — `アカウントを管理…`、`クイック切替…`、`現在のアカウントを保存…`、`GitHub Account…` (Claude · Codex · GitHub のアカウント切替；ペットの位置に出るポップアップ)
- 🖥️ **Desktop Companion** — `Switch to Desktop` / `Switch to Panel`、デスクトップモード時のみ `Toggle Click-Through`、`Reset Workspace Model`
- ⚙️ **All Settings** — フィルタ済みの Settings UI を開く

### 🌙 Quiet Hours

会議中などに吹き出しをミュートする時間帯を設定できます:

```json
"animeCompanion.quietHours": ["09:00-12:00", "22:00-06:00"]
```

ムードと表情は通常通り更新されます — メッセージだけが沈黙します。

### 🪄 カスタムフレーズとキーワード

独自のセリフを追加:

```json
"animeCompanion.customPhrases.idle": ["水分補給を忘れずに〜"],
"animeCompanion.customPhrases.save": ["きれいなセーブだね！"],
"animeCompanion.customPhrases.error": ["落ち着いて、いける。"]
```

独自のキーワード反応:

```json
"animeCompanion.customKeywords": {
  "refactor": ["きれいなリファクタリング〜"],
  "NOTE": ["新しいメモ出たね！"]
}
```

### 🎵 カスタム・アンビエントトラック

ローカルのオーディオファイルを Ambient メニューに追加できます:

```json
"animeCompanion.customAmbientTracks": [
  {
    "label": "My Lofi",
    "path": "D:/Music/lofi.mp3",
    "description": "Personal focus mix"
  }
]
```

その後、右クリック → **Ambient** から選択できます。音量は共通設定:

```json
"animeCompanion.ambientVolume": 30
```

### 📁 カスタム・ローカルモデル

ローカル Live2D モデルのサブフォルダを含むルートを指定するだけで使えます:

```json
"animeCompanion.customModelRoots": [
  "D:/model"
]
```

直下の各フォルダに `.model3.json` があれば、モデルピッカーに自動で表示されます。

表示名 / 説明 / 特定のモデルファイルをカスタマイズしたい場合は、次のように上書きできます:

```json
"animeCompanion.customModels": {
  "my-model": {
    "name": "My Model",
    "path": "D:/model/MyModel",
    "modelFile": "MyModel.model3.json",
    "description": "Custom local model"
  }
}
```

---

## ⚙️ 設定

![Settings UI](images/12-settings-ui.png)

Settings (`Ctrl+,`) を開いて `Anime Companion` で検索するか、コンパニオンの右クリックメニューから **Settings** をクリックします。

| Setting | デフォルト | 説明 |
|---|---|---|
| `animeCompanion.model` | `hiyori` | アクティブな Live2D モデル。 |
| `animeCompanion.customModelRoots` | `[]` | ローカル Live2D モデルを自動スキャンするルートフォルダ。 |
| `animeCompanion.customModels` | `{}` | ユーザー追加のローカルモデルを宣言。 |
| `animeCompanion.modelDownloadBaseUrl` | GitHub Releases URL | モデル ZIP を遅延ダウンロードするベース URL。 |
| `animeCompanion.voiceLanguage` | `ja` | オーディオ言語: `ja` / `vi` / `en`。 |
| `animeCompanion.messageLanguage` | `vi` | 吹き出しテキスト言語: `vi` / `en` / `ja`。 |
| `animeCompanion.muted` | `false` | 全オーディオをミュート。 |
| `animeCompanion.ambientPreset` | `off` | 現在の Ambient: `off` / `lofi` / `rain` / `cafe`、またはカスタムトラック。 |
| `animeCompanion.ambientVolume` | `30` | Ambient 音量 `0`–`100`。 |
| `animeCompanion.customAmbientTracks` | `[]` | カスタムのローカルアンビエントトラック一覧。 |
| `animeCompanion.characterSize` | `medium` | `small` / `medium` / `large`。 |
| `animeCompanion.showOnStartup` | `true` | VS Code 起動時にパネルを自動表示。 |
| `animeCompanion.messageIntervalMin` / `Max` | `10` / `20` | アイドル吹き出し間隔（秒）。 |
| `animeCompanion.pomodoroWorkTime` / `BreakTime` | `25` / `5` | 作業／休憩時間（分）。 |
| `animeCompanion.breakReminderMinutes` | `30` | 休憩リマインダーを出すまでの連続コーディング時間（分）。 |
| `animeCompanion.cursorChase.enabled` | `false` | エディターのカーソル位置にチビスプライトを表示。 |
| `animeCompanion.cursorChase.size` | `small` | カーソルチビのプリセット: `small` / `medium` / `large`。 |
| `animeCompanion.cursorChase.sizePx` | `0` | サイズをピクセル指定で上書き。`0` = プリセットを使用。 |
| `animeCompanion.cursorChase.offsetX` / `offsetY` | `0` / `0` | カーソルチビの位置をピクセル単位で微調整。 |
| `animeCompanion.reactive.diagnostics` | `true` | エラー／警告に反応。 |
| `animeCompanion.reactive.save` | `true` | 保存に反応。 |
| `animeCompanion.reactive.typing` | `true` | タイピング速度と Easter egg に反応。 |
| `animeCompanion.reactive.git` | `true` | Git 状態をポーリングして反応。 |
| `animeCompanion.quietHours` | `[]` | メッセージをミュートする時間帯。 |
| `animeCompanion.customPhrases.idle` | `[]` | 追加のアイドルフレーズ。 |
| `animeCompanion.customPhrases.save` | `[]` | 追加の保存反応フレーズ。 |
| `animeCompanion.customPhrases.error` | `[]` | 追加のエラー反応フレーズ。 |
| `animeCompanion.customKeywords` | `{}` | キーワード → メッセージ一覧のマップ。 |
| `animeCompanion.desktopCompanion.enabled` | `false` | VS Code パネル内ではなく、フローティングのデスクトップウィンドウとして実行。 |
| `animeCompanion.desktopCompanion.alwaysOnTop` | `true` | デスクトップウィンドウを常に最前面に。 |
| `animeCompanion.desktopCompanion.clickThrough` | `false` | デスクトップウィンドウのクリックを後ろのアプリに透過。 |
| `animeCompanion.desktopCompanion.size` | `medium` | デスクトップウィンドウサイズ: `small` / `medium` / `large`。 |
| `animeCompanion.desktopCompanion.position` | `{ "anchor": "bottom-right" }` | デスクトップウィンドウの初期位置。 |
| `animeCompanion.desktopCompanion.opacity` | `1` | デスクトップウィンドウの不透明度、`0.5`–`1`。 |
| `animeCompanion.desktopCompanion.downloadBaseUrl` | GitHub Releases URL | デスクトップバイナリを遅延ダウンロードするベース URL。 |
| `animeCompanion.desktopCompanion.devBinaryPath` | `""` | テスト用のローカルビルド sidecar への絶対パス。 |
| `animeCompanion.voiceAssets.downloadBaseUrl` | GitHub Releases URL | 拡張ボイスアセット ZIP のベース URL。 |
| `animeCompanion.voiceAssets.enableExtended` | `true` | 同梱ボイスだけでなく拡張ボイスアセットを遅延ダウンロード。 |
| `animeCompanion.chat.provider` | `copilot` | LLM チャットプロバイダー: `copilot` / `anthropic` / `openai` / `gemini` / `xai` / `deepseek` / `openrouter` / `ollama`。Copilot と Ollama はキー不要。 |
| `animeCompanion.chat.ollamaEndpoint` | `http://localhost:11434` | ローカル Ollama サーバーのベース URL。`/api/chat` は含めないでください — 自動で付加されます。 |
| `animeCompanion.chat.model` | `""` | アクティブプロバイダーのモデル ID を上書き。空 = プロバイダーのデフォルトを使用。 |
| `animeCompanion.chat.personaPreset` | `cute` | ペルソナプリセット: `cute` / `professional` / `tsundere` / `energetic`。`systemPrompt` が非空のときは無視。 |
| `animeCompanion.chat.systemPrompt` | `""` | ペルソナプリセットを置き換えるカスタムシステムプロンプト。 |
| `animeCompanion.chat.maxTokens` | `2048` | 1 応答あたりの最大トークン。Gemini 2.5 thinking モデルは ≥ 2048 が必要。 |
| `animeCompanion.chat.temperature` | `0.7` | サンプリング温度（0 = 決定論的、高いほど創造的）。 |
| `animeCompanion.chat.reactionsEnabled` | `true` | チャット応答後にセンチメント駆動の Live2D リアクションを有効化。 |

> ⚠️ **API キーは `settings.json` に保存されません。** 必ず `Anime Companion: Configure Chat Provider (API Key / Endpoint)` コマンドを使ってください — キーは VS Code SecretStorage（暗号化）に保存されます。同じコマンドで Ollama エンドポイントも設定できます。

---

## 🎮 コマンド

Command Palette (`Ctrl+Shift+P`) を開いて `Anime Companion` と入力します:

| コマンド | 説明 |
|---|---|
| `Anime Companion: Show` / `Hide` / `Toggle` | コンパニオンパネルの表示／非表示 |
| `Anime Companion: Change Model` | アクティブモデルのクイックピック（現在のモデルに ✓） |
| `Anime Companion: Reset Workspace Model` | ワークスペース選択を解除してグローバルに戻す |
| `Anime Companion: Change Voice` | ボイス言語のクイックピック |
| `Anime Companion: Change Message Language` | 吹き出しテキスト言語のクイックピック |
| `Anime Companion: Toggle Mute` | ミュートの切り替え |
| `Anime Companion: Toggle Cursor Chibi` | カーソル追従チビスプライトの切り替え |
| `Anime Companion: Tune Cursor Chibi Position` | カーソルチビの位置とサイズをライブ調整 |
| `Anime Companion: Capture Chibi from Model` | レンダリング中のモデルからスプライト PNG をキャプチャ |
| `Anime Companion: Reset Captured Chibi (use bundled icon)` | 現在のモデルのキャプチャを削除 |
| `Anime Companion: Start Pomodoro` / `Stop Pomodoro` | ポモドーロ開始／停止 |
| `Anime Companion: Show Stats` | クイック統計を開く |
| `Anime Companion: Show Achievements` | アチーブメント一覧を表示 |
| `Anime Companion: Show Quests` | デイリー / ウィークリー quest を表示 |
| `Anime Companion: Show Profile` | ローカル profile を表示 |
| `Anime Companion: Export Share Card` | PNG シェアカードを書き出す |
| `Anime Companion: Play Motion` | `TapBody` / `TapHead` / `Idle` をクイック再生 |
| `Anime Companion: Reset Companion Position` | パネルモードでのコンパニオン位置をリセット |
| `Anime Companion: Open Settings` | フィルタ済みの Settings を開く |
| `Anime Companion: Open Chat` | チャットパネルを開き、テキストエリアにフォーカス |
| `Anime Companion: Configure Chat Provider (API Key / Endpoint)` | プロバイダーを選択 → API キーを SecretStorage に保存、または Ollama エンドポイントを設定 |
| `Anime Companion: New Chat Conversation` | 新規会話を作成（空のアクティブがあれば再利用） |
| `Anime Companion: Clear All Chat Conversations` | すべてのチャット履歴を削除（確認モーダルあり） |
| `Anime Companion: Ask Companion About Selection` | エディター選択をステージしてチャットを開く（エディター右クリックメニューにもあります） |

---

## 🛠️ 開発

要件: **Node.js ≥ 18** と **npm**。

```bash
npm install              # 依存関係をインストール
npm run compile          # TypeScript → out/ をビルド
npm run watch            # ウォッチモード
npm run package          # .vsix を作成
npm run package:install  # ビルド + ローカル VS Code に上書きインストール
npm test                 # コンパイル + smoke test
```

または、バージョン bump + パッケージ + インストールを一括で:
```bash
./build-install.sh
```

VS Code 内で `F5` を押すと、拡張をロードした **Extension Development Host** が開きます。

### 構成

```
src/
  extension.ts          activate、ステータスバー、コマンド登録
  companion-view.ts     WebviewViewProvider、アイドル吹き出しタイマー
  companion-message-dispatcher.ts  webview ↔ extension メッセージルーティング
  reactive.ts           ReactiveManager — すべてのイベントフック
  pomodoro.ts           PomodoroManager
  stats.ts              StatsStore + アチーブメント解除
  models.ts             MODEL_MAP + ワークスペースモデル
  model-downloader.ts   モデル ZIP の遅延ダウンロード／展開
  model-server.ts       モデルアセット用のローカル HTTP サーバー
  git-ops.ts            フィードバック付きの pull/push/commit
  messages.ts           メッセージバンク + i18n + カスタムフレーズ
  cursor-chibi.ts       カーソルチビスプライト管理
  log.ts                Output channel ロガー
  chat/                 AI チャットモジュール (v0.3.0+)
    chat-manager.ts        オーケストレーター: プロバイダールーティング + ストリーミング
    secrets.ts             API キー用 SecretStorage ラッパー
    persona.ts             プリセットのシステムプロンプト
    sentiment.ts           センチメント → Live2D ムード／モーション
    conversation-store.ts  マルチカンバセーションのファイルストア
    context-builder.ts     selection / active file / #mention のパック
    sse-parser.ts          Server-Sent Events パーサー
    llm-provider.ts        インターフェース + ファクトリ
    providers/
      anthropic.ts · openai-compatible.ts · gemini.ts · copilot.ts · ollama.ts

media/
  webview/              ランタイム webview（モジュール化）
    main.js · core.js · interaction.js
    audio.js · expression.js · ui.js
    chat.js · chat.css           チャットパネル UI
    cursor-chibi.css             カーソルチビ調整ウィジェット（独立）
  audio/{ja,vi,en}/     言語ごとの MP3
  messages/             吹き出しテキスト i18n
  live2d/               Cubism モデルアセット
  lib/                  pixi-live2d-display + Cubism core
```

---

## 📚 ドキュメント

- [README.md](../README.md) — 英語版。
- [README.vi.md](README.vi.md) — ベトナム語版。
- [FEATURES.md](../FEATURES.md) — 機能の完全リスト。
- [MODELS.md](../MODELS.md) — 同梱モデル、遅延ダウンロード、カスタムローカルモデル。
- [CHANGELOG.md](../CHANGELOG.md) — バージョン別履歴。
- [PLAN.md](../PLAN.md) — ロードマップ（現スプリント、短期、中期、ビジョン）。
- [PLAN_v0.3.1.md](PLAN_v0.3.1.md) — v0.3.1 実装計画 + v0.4.0 への先送り作業。
- [CHECKLIST.md](../CHECKLIST.md) — タスクごとの進捗。
- [DECISIONS.md](../DECISIONS.md) — アーキテクチャと技術的決定。
- [MODEL_LICENSE_AUDIT.md](../MODEL_LICENSE_AUDIT.md) — モデルとオーディオのライセンス／再配布に関するメモ。

---

## 📜 ライセンス

[MIT License](../LICENSE).

Live2D Cubism SDK、Live2D モデル、VoiceVox オーディオ、ElevenLabs 生成の拡張ボイスアセットには、それぞれ独自のライセンスがあります。再配布権が明確でないモデルは拡張機能に同梱されません。`animeCompanion.customModelRoots` または `animeCompanion.customModels` で持ち込んでください — [MODEL_LICENSE_AUDIT.md](../MODEL_LICENSE_AUDIT.md) を参照してください。

---

## 💖 クレジット

- **Live2D Cubism Core SDK** — Live2D Inc.
- **同梱／標準モデル:** Hiyori、Haru、Mao、Miara（Live2D Sample）。
- **ユーザー追加のローカルモデル:** `animeCompanion.customModelRoots` または `animeCompanion.customModels` で追加する際のライセンスは、ユーザーの責任となります。
- **オーディオ:** `ja` は VoiceVox (Shikoku Metan)、`vi` / `en` は同梱オーディオに加えて ElevenLabs の拡張ボイスアセットを使用します。

Made with 🌸 by [xShiroeNguyenx](https://github.com/xShiroeNguyenx).
