# Scratch Nano


超ミニマルなMarkdownノートアプリ。macOS・Windows・Linux対応（Windows でのみ動作テスト）。


[リリース](https://github.com/hetima/scratch-nano/releases)

## 機能

- **オフライン優先** - クラウド不要、アカウント不要、インターネット不要
- **Markdownベース** - ノートはプレーンな `.md` ファイルで保存
- **プレビューモード** - `.md` ファイルをプレビュー表示
- **Markdownソースモード** - `Cmd+U` で編集モードに切り替え
- **シンタックスハイライト** - GitHubインスパイアの配色で20言語に対応
- **Mermaidダイアグラム** - フェンスコードブロック内でフローチャートやシーケンス図などをレンダリング
- **フォーカスモード** - サイドバーとツールバーがフェードアウトする集中執筆モード（`Cmd+Shift+Enter`）
- **フォルダ** - ドラッグ＆ドロップ対応の折りたたみ式フォルダツリーでノートを整理（オプション）
- **複数フォルダ** - 複数のルートフォルダをクイック切り替えメニューで管理
- **全文検索** - Tantivyによる高速検索。検索フィールドから直接名前を指定して新規ノート作成も可能
- **ピン留め** - よく使うノートをリスト上部にピン留め
- **コードコピーボタン** - フェンスコードブロックにワンクリックコピーボタンを表示
- **自動保存** - ノート切り替え時に自動保存
- **カスタマイズ** - テーマ、フォント、ページ幅、RTLテキスト方向の設定
- **軽量** - ObsidianやNotionの5〜10倍軽量

## スクリーンショット


## インストール

### Windows

[リリース](https://github.com/hetima/scratch-nano/releases)から最新の `.exe` インストーラーをダウンロードして実行してください。WebView2 が必要な場合は自動的にダウンロードされます。

### macOS（未テスト）

1. [リリース](https://github.com/hetima/scratch-nano/releases)から最新の `.dmg` をダウンロード
2. DMG を開いて Scratch をアプリケーションフォルダにドラッグ
3. アプリケーションフォルダから Scratch を起動

### Linux（未テスト）

[リリース](https://github.com/hetima/scratch-nano/releases)から最新の `.AppImage` または `.deb` をダウンロードしてください。

### ソースからビルド

**必要条件:** Node.js 18+、Rust 1.70+

**macOS:** Xcode Command Line Tools · **Windows:** WebView2 Runtime（Windows 11 にはプリインストール済み）

```bash
git clone https://github.com/hetima/scratch-nano.git
cd scratch
pnpm install
pnpm tauri dev      # 開発
pnpm tauri build    # プロダクションビルド
```

## キーボードショートカット

Scratch はマウスなしでも操作できるよう設計されています。まずはこれだけ覚えれば始められます：

| ショートカット      | 操作                         |
| ----------------- | ---------------------------- |
| `Cmd+N`           | 新規ノート                    |
| `Cmd+D`           | ノートを複製                  |
| `Delete`          | ノートを削除                  |
| `Cmd+Backspace`   | ノートを削除                  |
| `Cmd+P`           | コマンドパレット               |
| `Cmd+K`           | リンクの追加・編集             |
| `Cmd+F`           | ノート内検索                  |
| `Cmd+Shift+C`     | コピー＆エクスポートメニュー    |
| `Cmd+U`           | Markdownソース表示切り替え     |
| `Cmd+Shift+Enter` | フォーカスモード切り替え       |
| `Cmd+Shift+F`     | ノート検索                    |
| `Cmd+R`           | 現在のノートを再読み込み       |
| `Cmd+,`           | 設定を開く                    |
| `Cmd+\`           | サイドバー表示切り替え         |
| `Cmd+B/I`         | 太字/斜体                     |
| `Cmd+=/-/0`       | ズームイン/アウト/リセット     |
| `↑/↓`             | ノートの移動                  |

**Windows の場合:** すべてのショートカットで `Cmd` の代わりに `Ctrl` を使用してください。

その他のショートカットや機能はアプリ内でご確認いただけます。コマンドパレット（`Cmd+P` / `Ctrl+P`）から探すか、設定 → ショートカット でフルリファレンスを表示できます。

## ライセンス

[erictli/scratch](https://github.com/erictli/scratch) をベースに開発されました

MIT
