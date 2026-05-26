# Scratch Nano


超ミニマルなMarkdownノートアプリ。

現状プレビューリリース版です。不測の事態に備え、使用するファイルのバックアップと取ってお使いください。

[ダウンロード](https://github.com/hetima/scratch-nano/releases)

## 機能

余計な機能を排除して軽快動作する Markdown アプリです。プレビューと編集は別ペインで行います。ルートフォルダを複数登録できて切り替えながら作業できます。Obsidian の保管庫を登録して検索専用として使用するなど補助的位置づけで役立つのではないかと思います。とはいえ最低限の機能は備えています。Notational Velocity にインスパイアされた検索欄から直接新規ファイルを作成する機能や、ワンクリックでフレーズをコピーできる独自機能など備えています。

- 完全オフライン（ソフトウェアアップデートを除く）
- コードブロックのシンタックスハイライト、コピーボタン
- 複数フォルダ
- Tantivy による全文インデックス検索
- よく使うノートをリスト上部にピン留め
- ノート切り替え時に自動保存
- ライト・ダークモード対応


### copy: Link 機能

環境設定でこの機能をオンにすると `copy:xxx` という形式の文章を書くとプレビューモードでリンクになって、クリックすると内容をコピーできます。半角スペースを含めたい場合は `copy:"xxx xxx"` あるいは `copy:[zzz zzz]` で囲ってください。



## スクリーンショット

![screen01](https://raw.githubusercontent.com/hetima/scratch-nano/main/assets/screen01.jpg)

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

| ショートカット      | 操作                         |
| ----------------- | ---------------------------- |
| `Cmd+N`           | ノート検索                    |
| `Cmd+D`           | ノートを複製                  |
| `Delete`          | ノートを削除                  |
| `Cmd+Backspace`   | ノートを削除                  |
| `Cmd+P`           | コマンドパレット               |
| `Cmd+K`           | リンクの追加・編集             |
| `Cmd+F`           | ノート内検索                  |
| `Cmd+U`           | Markdownソース表示切り替え     |
| `Cmd+Shift+F`     | ノート検索                    |
| `Cmd+R`           | 現在のノートを再読み込み       |
| `Cmd+,`           | 環境設定を開く                    |
| `Cmd+\`           | サイドバー表示切り替え         |
| `Cmd+=/-/0`       | ズームイン/アウト/リセット     |
| `↑/↓`             | ノートの移動                  |

**Windows の場合:** すべてのショートカットで `Cmd` の代わりに `Ctrl` を使用してください。


## ライセンス

このソフトウェアは [erictli/scratch](https://github.com/erictli/scratch) をベースに開発されました

MIT License
