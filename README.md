## withu voice widget（右下フローティング音声チャット）

Supabase / Vercel / GitHub / WordPress で本番導入できる「script 1行で埋め込み可能」な音声チャットウィジェットです。

### 完成しているもの（Acceptance Criteria対応）

- **GET `/widget.js`**: 1ファイルJSで配布（Shadow DOMでCSS隔離）
- **POST `/api/session`**: session発行（UA/IP/siteId保存）
- **POST `/api/asr`**: `multipart/form-data` の音声→文字起こし（OpenAI Whisper）
- **POST `/api/chat`**: text→assistantText（OpenAI、履歴はDBから直近最大30件）
- **POST `/api/logs`**: events保存（Supabase）
- **POST `/api/tts`**: 将来拡張用（現状は `client_web_speech` を返す）
- **Widget UI**: 右下バブル / パネル / 会話ログ / 状態表示 / Start/Stop / テキストフォールバック / 初回同意
- **状態機械**: `idle → listening → thinking → speaking → idle`（例外はANY→idle）
- **VAD仕様固定**: minSpeech=300ms / silence=700ms / maxSpeech=15s
- **speaking中はVAD完全停止**（マイク処理を止め、誤検知しない）
- **APIキーはクライアント非露出**（Supabase service_role / OpenAIはサーバのみ）

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
  data-site-id="self-test"
  async
></script>
```

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

