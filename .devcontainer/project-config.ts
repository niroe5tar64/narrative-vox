/**
 * narrative-vox（音声読み上げ原稿生成基盤）の開発環境設定
 *
 * base + (preset) + この設定 がマージされて
 * .devcontainer/devcontainer.json が生成されます
 *
 * NarrativeVox は、
 * - 書籍・記事の耳学習コンテンツ化
 * - VoiceBox 用読み上げ原稿生成
 * - ルビ・発音辞書管理
 * - LLMプロンプト設計
 * を目的としたプロジェクトです。
 *
 * 音声生成・CLI開発を含む preset を使用する場合は、ビルド時に引数で指定：
 *   npx @niroe5tar64/devcontainer init
 */
export const projectConfig = {
  name: "narrative-vox",
};

/**
 * JSON に含める追加フィールド
 * （DevContainerConfig 型には含まれないが、JSON としては有効）
 */
export const projectConfigMetadata = {
  $comment: "NarrativeVox development container configuration",
};
