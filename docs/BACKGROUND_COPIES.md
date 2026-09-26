# 背景カットのコピー素材 / Background copy sources

背景タブの「行とカット」にある素材選択、またはカットの詳細編集から選択できます。

- **前景をコピー（素材のみ）**：同じフレームで前景が使用している元画像・動画を参照します。前景側の配置・モーション・クロマキー・不透明度などの加工は含めません。
- **前景をコピー（演出含む）**：前景の配置・モーション・加工・不透明度・カット間の繋ぎを含む透過の描画結果を参照します。
- **歌詞のコピー**：同じフレームの歌詞の配置・モーション・装飾・エフェクトを含む描画結果を参照します。背景・前景の素材や操作用の枠は含めません。

コピーした結果に背景カットの配置・演出・登場・退場・カット間の繋ぎを追加できます。コピー元が表示されていない時刻は透明になります。動画は前景の再生位置・ループ設定に従います。素材を複製するのではなくフレームごとに描画するため、コピー元の編集は即時反映されます。設定はプロジェクトに保存され、ブラウザーの動画書き出しにも適用されます。

## English

Choose a source in a background cut's asset selector or detail editor:

- **Copy foreground (source only)** uses the source image or the current video frame, without foreground placement, motion, chroma key, or opacity.
- **Copy foreground (with effects)** uses the rendered transparent foreground, including placement, motion, processing, opacity, and transitions.
- **Copy lyrics** uses the current rendered lyrics and their effects, without foreground/background media or editor controls.

Background placement and effects are applied on top of the copied result. Missing source frames are transparent. Videos follow the foreground's playback and loop settings. Copies update live, are saved with the project, and are included in browser video exports.
