## withu voice widget（右下フローティング音声チャット）

Supabase / Vercel / GitHub / WordPress で本番導入できる「script 1行で埋め込み可能」な音声チャットウィジェットです。

### 完成しているもの（Acceptance Criteria対応）

- **GET `/widget.js`**: 1ファイルJSで配布（Shadow DOMでCSS隔離）
- **POST `/api/session`**: session発行（UA/IP/siteId保存 + `userId`(匿名) + `sessionToken`）
- **POST `/api/asr`**: `multipart/form-data` の音声→文字起こし（OpenAI Whisper）
- **POST `/api/chat`**: text→assistantText（OpenAI、履歴はユーザー単位で直近最大30件）
- **POST `/api/logs`**: events保存（Supabase、`sessionToken`必須）
- **POST `/api/tts`**: 将来拡張用（現状は `client_web_speech` を返す）
- **Widget UI**: 右下バブル / パネル / 会話ログ / 状態表示 / Start/Stop / テキストフォールバック / 初回同意
- **状態機械**: `idle → listening → thinking → speaking → idle`（例外はANY→idle）
- **VAD仕様固定**: minSpeech=300ms / silence=700ms / maxSpeech=15s
- **speaking中はVAD完全停止**（マイク処理を止め、誤検知しない）
- **APIキーはクライアント非露出**（Supabase service_role / OpenAIはサーバのみ）
- **ユーザー分離**: 匿名 `userId`（localStorage）で会話/親密度をユーザーごとに分離
- **セッション保護**: `sessionToken` がないと他人が `sessionId` を使ってAPIを呼べない

### 前提（合理的な決め打ち）

- ASRは **OpenAI `whisper-1`** を使用します
- LLMは **`OPENAI_CHAT_MODEL` 未指定なら `gpt-4o-mini`** を使用します
- TTSはクライアントの **Web Speech API** を使用します（非対応端末はテキストのみ）
- レート制限は **メモリMapの簡易実装**です（Serverlessで揮発するが最低限のDoS耐性）

---

## フォルダ構成（主要）

- `app/widget/route.ts`: `/widget`（`/widget.js`にrewrite）でJS配信
- `widget-src/*`: ウィジェット本体（TS）
- `scripts/build-widget.mjs`: widgetを1ファイルへバンドル（esbuild）
- `app/api/*`: API群
- `lib/server/*`: server-only util（Supabase/OpenAI/env/rate limit）
- `supabase/schema.sql`: DBスキーマ

---

## セットアップ（Supabase）

1) Supabaseで新規プロジェクト作成  
2) SQL Editorで `supabase/schema.sql` を実行  
3) Project Settings → API から以下を控える

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`（**絶対にクライアントに出さない**）

---

## セットアップ（Vercel）

GitHubにpush → VercelでImportします。

### 環境変数（Vercel Project Settings → Environment Variables）

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL`（任意、デフォルト `gpt-4o-mini`）

### ビルド

`npm run build` は内部で `npm run build:widget` を先に実行します（Vercelでもそのまま動きます）。

---

## WordPress埋め込み（script 1行）

WordPress側に以下を貼るだけです（`data-site-id` で導入サイト識別）：

```html
<script
  src="https://YOUR-APP.vercel.app/widget.js"
  data-site-id="mirai-aizawa-com"
  data-display-name="Mirai Aizawa"
  data-avatar-url="https://YOUR-CDN/avatars/mirai.png"
  async
></script>
```

### data属性

- **`data-site-id`**: 必須。導入サイト識別（ログやpersona適用のキー）
- **`data-display-name`**: 任意。ヘッダ表示名（未指定ならSupabaseの `site_profiles.display_name`）
- **`data-avatar-url`**: 任意。アバター画像URL（未指定ならSupabaseの `site_profiles.avatar_url`）

---

## Mirai Aizawa の「話し方/スタンス/基本情報」を反映（persona）

`site_profiles.persona_prompt` を編集すると、**サーバ側のsystem promptに合成**されます（クライアントへはそのまま配信されません）。

### 手順

1) Supabase → Table Editor → **`site_profiles`**
2) `site_id = mirai-aizawa-com` の行を開く（※初回 `/api/session` 呼び出しで自動作成されます）
3) 以下を編集

- **`display_name`**: 例 `Mirai Aizawa`
- **`avatar_url`**: アバター画像URL
- **`tts_voice_hint`**: 任意（例 `ja-JP` / `Google 日本語` など。端末依存）
- **`persona_prompt`**: 口調/世界観/NG/短さ など

### persona_prompt テンプレ（そのまま貼って編集）

```
あなたは「Mirai Aizawa」というバーチャルモデルです。
あなたは丁寧でフレンドリー、落ち着いたトーンで話します。
返答は短く、基本は3〜5文以内。必要なら箇条書きを使います。

話し方:
- 一人称は「私」
- 語尾は柔らかく（〜です/〜だよ/〜かな）
- 相手を否定せず、安心感を与える

振る舞い:
- 個人情報（住所/電話/メール等）を聞かない、入力を促さない
- 危険行為や不正依頼は断る
- 医療/法律/投資は一般情報に留め、専門家相談を促す

サイトの目的:
- mirai-aizawa.com の訪問者と会話し、コンテンツ案内やファン向け交流をする
```

### tts_voice_hint の選び方（任意）

ブラウザConsoleで以下を実行し、`name` か `lang` を `tts_voice_hint` に入れます：

```js
speechSynthesis.getVoices().map(v => ({ name: v.name, lang: v.lang }))
```

---

## 親密度（AI判定＋後退あり）

- 親密度は **ユーザー別（匿名 `userId`）** に保存され、他ユーザーには影響しません
- 親密度の増減は `/api/chat` のたびに **AIが `intimacyDelta(-20..20)` を判定**します
- **不快/攻撃/スパム/ハラスメント等は減点**し、必要なら後退します（Lvダウンあり）
- **ブレ抑制**: AIの `confidence` に応じて変動を0に寄せ、さらにルールベースと混ぜて平滑化します

---

## ローカル動作確認

### 1) 依存関係

```bash
cd withu
npm i
```

### 2) 環境変数

`.env.local` を作成して `env.example` を参考に設定します。

### 3) 起動

```bash
npm run dev
```

### 4) 確認

- `http://localhost:3000/healthz`
- `http://localhost:3000/widget.js`
- トップページで右下にウィジェットが出る（`data-site-id="self-test"`）

---

## 動作確認チェックリスト（ローカル → Vercel → WordPress）

### ローカル

- [ ] `GET /healthz` が `{"ok":true}` を返す
- [ ] `GET /widget.js` が JS を返す（Networkで200）
- [ ] 初回パネル表示で「同意」UIが出る
- [ ] 同意後、Startでマイク許可ダイアログが出る
- [ ] しゃべる→無音で自動送信（VAD区切り）
- [ ] 返答が表示され、読み上げ（Web Speech）が始まる
- [ ] **speaking中にVADが動かない**（誤検知/自動送信しない）
- [ ] Stopで安全にidleへ戻る（UI操作可能）

### Vercel（本番）

- [ ] 環境変数が全て設定されている（Supabase/OpenAI）
- [ ] `https://YOUR-APP.vercel.app/healthz` OK
- [ ] `https://YOUR-APP.vercel.app/widget.js` OK
- [ ] 音声→ASR→LLM→TTS の一連が成立
- [ ] Supabaseの `sessions/messages/events` に保存されている
- [ ] `data-site-id` が `sessions.site_id` / events に反映されている
- [ ] `sessionToken` なしの `/api/chat` `/api/logs` `/api/asr` `/api/tts` が弾かれる（セッション保護）

### WordPress

- [ ] 記事/固定ページに script 1行を貼るだけで右下にバブルが出る
- [ ] テーマのCSSの影響を受けない（Shadow DOMで隔離）
- [ ] 端末差分（iOS/Android/PC）で最低限動く

---

## トラブルシュート（最低限）

- **iOS/Safari**: 音声はユーザー操作（Start押下）後でないと許可/再生が動かないことがあります
- **Web Speech非対応**: TTSは再生されません（テキストログのみ）
- **マイク拒否**: 音声開始できないため、テキスト入力フォールバックを使用してください
- **`/widget.js` が404**: `npm run build:widget` が実行されているか確認（Vercelでは `build` が自動で実行）

---

## ログ保持/削除（運用メモ）

会話ログ・イベントログには個人情報が含まれる可能性があります。  
本番運用では **保持期間（例: 30/90日）** と **削除手順（管理API/手動SQL）** を設計してください（本リポジトリでは未実装）。

