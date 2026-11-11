# オリジナル版の演出取り込み / Upstream effect integration

## 2026-11-11 追加分2（オリジナル版 v0.12.0〜v0.13.0）

Source: https://github.com/852wa/JIZURA/commit/96c46a5

- 追加分2の855演出（レイアウト180・登場126・静止中の動き50・退場112・装飾130・加工60・背景64・カメラ35・エフェクト69・遷移29）を `src/11p_x2_*.js` として取り込み。
- 字面一には追加分2のスイッチを設けず、通常の演出として扱う。候補はテーマと各演出のチェックで決まる。
- `x2typo…` / `x2kinetic…` / `x2horror…` の演出は文字PV・キネティック・ホラーのセットに属し、それぞれのテーマから使われる。和風の演出（`wa: true`）は和風テーマへ。その他は雰囲気タグで既存テーマの候補に入る。
- 英語版は各演出の英語名（`en`）を表示。あいまい検索は日本語名・英語名のどちらでも見つかる。追加分2の名前によく出る語（線・罫線・点・灯り・紙・折る・和風・墨・斜体）を検索語彙に追加。
- After Effects 版（`ae/`）はオリジナル版 v0.13.0 のものをそのまま取り込み、`ae/data.json` は字面一のソースから再生成（オリジナル版と同一）。AE 単体パネルにはオリジナル版の「追加分2」スイッチが残る。
- 依存処理は `J.isLatinText` のみ取り込み。オリジナル版のその他の変更（字幕読み込み、英字歌詞の改行、飾りの数字を消す等）は取り込んでいない。

Imported the 855 parts of upstream's 追加分2 (v0.12–v0.13) as ordinary parts without a switch; themes and per-part checkboxes choose them. Parts from x2typo / x2kinetic / x2horror packs join those sets; 和風 parts join the Japanese theme; the rest reach themes through their mood tags. English names come from each part's `en`; the fuzzy search matches either language. The After Effects sources are upstream v0.13.0; ae/data.json is regenerated from this edition's sources.

Source: https://github.com/852wa/JIZURA/commit/bae339e

## 2026-09-26

- 文字PV系 50、キネティック 51、ホラー 52：計153演出とホラー用3スタイルを取り込み。
- 文字PV系・キネティックは初期ON、ホラーは初期OFF。演出セットのチェックで切り替え可能。
- 既存テーマには各演出の雰囲気タグに合わせて候補を追加。ホラーテーマを追加し、このテーマでおまかせを実行するとホラーセットも有効化。
- 日本語・英語UI、およびAfter Effectsの対応実装を更新。
- 演出と必要な依存処理の選択的取り込み。オリジナル版全体のマージではありません。

Imported 153 parts (50 typographic, 51 kinetic, 52 horror) and three horror styles. Typographic and kinetic sets default to on; horror defaults to off. Existing themes include matching mood-tagged parts. The new Horror theme enables the horror set when randomizing. Japanese and English UI labels and corresponding After Effects implementations are included. This is a selective effect integration, not a full upstream merge.
