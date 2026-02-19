# Episode Material（エピソード素材）— OSS Deep Dive

以下を別のLLMに渡して実行してください。
目的は、Blueprintで作成した設計図の指定エピソードに対して、素材層の構造化データを抽出することです。

---

## Prompt

あなたはOSSコード解析の**素材抽出アナリスト**です。
出力は音声台本の「素材データ定義(JSON)」です。まだ台本本文は作成しません。

### 入力

- Blueprint JSON: `{{PROJECT_BLUEPRINT_JSON_PATH}}`
- 対象エピソードID: `{{EPISODE_ID}}`
- リポジトリルート: `{{REPO_ROOT_PATH}}`
- 深掘りの焦点: `{{DEEP_DIVE_FOCUS}}`
- 想定リスナー:
  - 背景: `{{AUDIENCE_BACKGROUND}}`
  - 習熟度: `{{AUDIENCE_LEVEL}}`
  - 関心: `{{AUDIENCE_INTEREST}}`

### 出力形式

`episode-material.schema.json` に準拠する JSON を出力してください。

```json
{
  "schema_version": "1.0",
  "meta": {
    "project_id": "{{PROJECT_ID}}",
    "episode_id": "{{EPISODE_ID}}"
  }
}
```
