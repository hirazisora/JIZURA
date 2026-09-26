# オリジナル版の演出取り込み / Upstream effect integration

Source: https://github.com/852wa/JIZURA/commit/bae339e

## 2026-09-26

- 文字PV系 50、キネティック 51、ホラー 52：計153演出とホラー用3スタイルを取り込み。
- 文字PV系・キネティックは初期ON、ホラーは初期OFF。演出セットのチェックで切り替え可能。
- 既存テーマには各演出の雰囲気タグに合わせて候補を追加。ホラーテーマを追加し、このテーマでおまかせを実行するとホラーセットも有効化。
- 日本語・英語UI、およびAfter Effectsの対応実装を更新。
- 演出と必要な依存処理の選択的取り込み。オリジナル版全体のマージではありません。

Imported 153 parts (50 typographic, 51 kinetic, 52 horror) and three horror styles. Typographic and kinetic sets default to on; horror defaults to off. Existing themes include matching mood-tagged parts. The new Horror theme enables the horror set when randomizing. Japanese and English UI labels and corresponding After Effects implementations are included. This is a selective effect integration, not a full upstream merge.
