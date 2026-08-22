# ランプのおやじ ネゴシエーター

曖昧なアプリ／ゲームのアイデアを、AIコーディングエージェントが実装に使える`SPEC.md`へ整理するローカルWebアプリです。

オリジナルの案内キャラクター「ランプのおやじ」が、プロダクトの意味を大きく左右する判断だけを一問ずつ確認します。技術的な実装詳細や安全に補完できるMVP仕様はAIが整理するため、ユーザーは要件定義の専門知識がなくても仕様作成を進められます。

## 解決すること

- アイデアが短く曖昧でも、重要なプロダクト判断を見つける
- 回答済み・承認済みの判断を保持し、同じ論点の再質問を防ぐ
- ユーザー確定事項とAI補完、実装提案、将来候補を混同しない
- 最終SPECの整合性を検証し、修復可能な問題は自動修復する
- APIエラー時も交渉状態を保持し、失敗した処理だけ再試行する

## 基本的な使い方

1. 作りたいアプリやゲームを自由入力します。
2. ランプのおやじが提示する質問へ一問ずつ回答します。
3. AIが補完した内容と、ユーザーが決めた内容を最終確認します。
4. 「その通り！」を選ぶと整合性確認とSPEC生成が始まります。
5. 完成した`SPEC.md`を表示、コピー、またはダウンロードします。

## 主要機能

- OpenAI Responses APIとStructured Outputsによる構造化応答
- 入力言語に合わせた質問・選択肢・SPEC生成
- Question Necessity TestとCompletion Gateによる動的な質問終了判定
- semantic decision domainによる回答済み質問の重複排除
- User Confirmed Decisionsを最優先にしたCanonical Requirements
- AI-Inferred Requirements / Implementation Proposal / Future・Optionalの分類
- SPEC生成後のvalidationと上限付き自動修復
- 最終確認後のcoverage auditとループ防止
- タイムアウト・一時的なAPI失敗時のセッション保持と再試行
- Markdown表示、コピー、`.md`ダウンロード、AI実装用プロンプト

## ローカル開発

必要環境はNode.jsとnpmです。

```powershell
npm install
Copy-Item .env.example .env
```

`.env`へサーバー用のOpenAI APIキーを設定し、起動します。

```powershell
npm run dev
```

ブラウザで[http://localhost:5173](http://localhost:5173)を開きます。ViteフロントエンドとExpress APIは同じ開発コマンドで起動します。

## 環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `OPENAI_API_KEY` | はい | ExpressサーバーからOpenAI APIへ接続するためのキー |
| `OPENAI_MODEL` | いいえ | 使用モデル。未設定時はコード上の既定モデルを使用 |
| `OPENAI_REQUEST_TIMEOUT_MS` | いいえ | フェーズ別設定がないOpenAIリクエストのタイムアウト |
| `AI_USAGE_LIMITS_ENABLED` | いいえ | AI利用制限の有効化。未設定時は`true` |
| `AI_RATE_LIMIT_PER_MINUTE` | いいえ | 1 IPあたりの1分間のAIリクエスト上限。既定値`20` |
| `AI_DAILY_REQUEST_LIMIT_PER_IP` | いいえ | 1 IPあたりの日次AIリクエスト上限。既定値`60` |
| `AI_GLOBAL_DAILY_REQUEST_LIMIT` | いいえ | 全IP合計の日次AIリクエスト上限。既定値`1000` |
| `AI_MAX_REQUESTS_PER_SESSION` | いいえ | 1セッションあたりのAIリクエスト上限。既定値`20` |
| `AI_DAILY_SPEC_LIMIT_PER_IP` | いいえ | 1 IPあたりの日次SPECセッション上限。既定値`3` |

APIキーはブラウザへ渡しません。`.env`と`.env.*`はGit管理対象外で、公開可能な変数名だけを`.env.example`に記載しています。

## AI利用量の安全装置

OpenAI APIを呼ぶ要件定義APIには、IP単位の短時間・日次制限、全IP合計の日次制限、セッション単位の上限、IP単位の日次SPEC作成数制限、同一処理の実行中重複排除があります。SPEC作成数は、そのsessionIdで最初の分析を開始する時点で1件として数え、同じsessionIdの再分析・SPEC修復では重複加算しません。制限値は環境変数を設定しなくても安全な既定値で有効です。開発・テスト時に限り、`AI_USAGE_LIMITS_ENABLED=false`で明示的に無効化できます。

現在の利用量カウンターは単一Node.jsプロセス内のメモリ方式です。サーバー再起動時にリセットされ、複数インスタンス間では共有されません。本番を複数インスタンスで運用する場合は、同じガードの保存層をRedis等の共有ストアへ置き換える必要があります。

## コマンド

```powershell
npm run lint
npm test
npm run smoke:mock
npm run build
```

実API用のスモークテストは有効な`OPENAI_API_KEY`を設定したローカル環境で実行してください。

