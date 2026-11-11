/* Display names for effect-specific detail parameters (shared by all layouts). */
(() => {
'use strict';
const names = {};
for(const line of `
accentIdx|アクセントの位置|Accent position
accentN|アクセントの個数|Accent count
cls|分類|Category
ctx|描画領域|Drawing context
cx|中心の横位置|Center X
cy|中心の縦位置|Center Y
diag|対角線|Diagonal
dims|寸法|Dimensions
fl|左側の補助値|Left factor
fm|中央の補助値|Middle factor
fo|外側の補助値|Outer factor
fr|右側の補助値|Right factor
fulc|支点|Fulcrum
fx|演出|Effects
g1|第一の間隔|First gap
g2|第二の間隔|Second gap
glass|ガラス|Glass
grade|濃淡|Gradation
guide|ガイド|Guide
guides|ガイド一覧|Guides
hc|見出し色|Heading color
id|種類|Type
key|識別名|Identifier
kicker|小見出し|Subheading
lab|ラベル設定|Label settings
lam|光の強さ|Light amount
link|連結|Connection
main|主な要素|Main element
marquee|スクロール文字|Marquee
mods|変化設定|Modifiers
motion|動きの強さ|Motion amount
name|名前|Name
nl|行数の補助値|Line count factor
pen|筆の太さ|Pen width
pick|選択方式|Selection mode
piece|断片|Piece
plus|追加量|Additional amount
rim|縁|Rim
schemes|配色一覧|Color schemes
scr|画面の設定|Screen settings
seg|分割数|Segment count
sep|区切り|Separator
shots|連続表示数|Shot count
sign|看板|Sign
slash|斜線|Slash
sleeve|覆い|Sleeve
sq|正方形|Square
stack|重ね方|Stacking
stagger|時間差|Delay
sweep|掃く動き|Sweep
table|表|Table
tag|タグ|Tag
tail|末尾|Tail
take|取り出す個数|Item limit
tc|文字色の補助値|Text color factor
tie|連結部分|Tie
tombo|トンボ|Crop marks
tread|足跡|Tread
tube|筒|Tube
tune|調整値|Adjustment
turb|乱流の強さ|Turbulence
under|下線|Underline
vcols|縦書きの列|Vertical columns
vol|量|Amount
was|前の状態|Previous state
wedge|くさび|Wedge
win|窓|Window
zip|開閉の強さ|Opening amount
drawing|独自描画|Custom drawing
note|ルビ・注釈|Ruby / note
fonts|役割別フォント|Font roles
fontParams|レイアウト内フォント|Layout fonts
effectStyle|質感・色ずれ|Texture / color shift
independentPhases|登場・退場を独立して適用|Independent entrance / exit
display|見出し用|Display
body|本文用|Body
serif|明朝体用|Serif
mono|等幅文字用|Monospace
texture|質感の強さ|Texture amount
grain|粒子ノイズ|Film grain
paper|紙の質感|Paper texture
scan|走査線|Scan lines
ghost|色ずれの倍率|Color shift multiplier
glow|光のにじみ|Glow
useGrad|グラデーションを使う|Use gradient
glitch|グリッチの強さ|Glitch amount
chroma|色ずれの強さ|Color shift amount
koma|動きの更新回数（毎秒）|Animation steps per second
right|右側に配置|Place on right
low|下側に配置|Place lower
corner|角に配置|Place in corner
big|大きく表示|Large display
mode|表示方式|Display mode
from|開始値|Starting value
to|終了値|Ending value
v|バリエーション|Variation
r|回転・変化量|Rotation / variation
n|個数|Count
sx|横方向倍率|Horizontal scale
sy|縦方向倍率|Vertical scale
ox|横方向オフセット|Horizontal offset
oy|縦方向オフセット|Vertical offset
dx|横方向の移動量|Horizontal displacement
dy|縦方向の移動量|Vertical displacement
x|横位置|Horizontal position
y|縦位置|Vertical position
s|サイズ倍率|Size multiplier
fs|文字サイズ|Font size
ang|角度|Angle
rot|回転角度|Rotation angle
rotAmp|回転の振幅|Rotation amplitude
rots|回転角度一覧|Rotation angles
amp|強度|Strength
spd|速度|Speed
freq|周波数|Frequency
phase|位相|Phase
ph|位相差|Phase offset
seed|乱数シード|Random seed
track|字間|Letter spacing
gap|間隔|Gap
pad|余白|Padding
margin|余白|Margin
cols|列数|Column count
rows|行数|Row count
rowsN|行数|Row count
col|列|Column
row|行|Row
dir|向き|Direction
align|整列|Alignment
orient|方向|Orientation
vertical|縦書き|Vertical text
vert|縦方向|Vertical
vertNote|注釈を縦書きにする|Vertical annotation
rtl|右から左へ|Right to left
tate|縦書き|Vertical text
unit|文字のまとまり|Text unit
units|文字単位の設定|Text units
chunks|歌詞のまとまり|Lyric chunks
msgs|メッセージ一覧|Messages
text|テキスト|Text
lines|行一覧|Lines
line|線|Line
widths|幅の一覧|Widths
fontBig|大きい文字のフォント|Large text font
fontSmall|小さい文字のフォント|Small text font
fontB|補助文字のフォント|Secondary font
fontC|中央文字のフォント|Center font
fontH|見出しのフォント|Heading font
fontL|ラベルのフォント|Label font
bigFont|大きい文字のフォント|Large text font
capFont|キャプションのフォント|Caption font
edgeFont|縁の文字のフォント|Edge font
fillFont|塗り文字のフォント|Fill font
markFont|マークのフォント|Mark font
numFont|数字のフォント|Number font
sealFont|印章のフォント|Seal font
tileFont|タイル文字のフォント|Tile font
font|フォント|Font
sf|補助文字サイズ|Secondary font size
hf|見出し文字サイズ|Heading font size
nf|数字の文字サイズ|Number font size
gf|背景文字サイズ|Background font size
qf|引用文字サイズ|Quote font size
rf|ルビ文字サイズ|Ruby font size
df|見出し文字サイズ|Display font size
fb|太字フォント|Bold font
fc|中央文字サイズ|Center font size
fg|文字色|Text color
bg|背景色|Background color
sub|補助文字色|Secondary color
accent|アクセント|Accent
accent2|アクセント色2|Accent color 2
ink|装飾色|Decoration color
dim|背景文字色|Background text color
ghostA|色ずれA|Color shift A
ghostB|色ずれB|Color shift B
grad|グラデーション|Gradient
swap|色の入れ替え|Swap colors
fill|塗りつぶし|Fill
fillMode|塗り方式|Fill mode
outline|輪郭線|Outline
outlineK|輪郭線の倍率|Outline multiplier
shadow|影|Shadow
shape|図形|Shape
small|小さく表示|Small display
smallK|小文字の倍率|Small text multiplier
smalls|小文字一覧|Small text items
wide|横に広げる|Wide
thin|細い線|Thin lines
tilt|傾き|Tilt
tilts|傾き一覧|Tilts
slant|斜めの傾き|Slant
lean|文字の傾き|Text lean
stretch|伸縮|Stretch
squash|つぶれ具合|Squash
ratio|比率|Ratio
asp|縦横比|Aspect ratio
anchor|基準点|Anchor
center|中央に配置|Center placement
centre|中央点|Center point
inner|内側の量|Inner amount
outer|外側の量|Outer amount
edge|縁の量|Edge amount
pos|位置|Position
place|配置|Placement
side|側面|Side
side0|開始側|Starting side
top|上側に配置|Place on top
up|上方向|Upward
back|背面|Back
front|前面|Front
start|開始|Start
end|終了|End
first|先頭|First
last|末尾|Last
at|出現位置|Appearance position
pause|停止時間|Pause duration
period|周期|Period
rate|変化率|Rate
tempo|テンポ|Tempo
speed|速度|Speed
step|段階|Step
span|範囲|Span
spread|広がり|Spread
travel|移動距離|Travel distance
orbit|周回|Orbit
radius|半径|Radius
arc|弧の量|Arc amount
arm|腕の長さ|Arm length
angle|角度|Angle
half|半分にする|Half
flip|反転|Flip
flips|反転設定一覧|Flip settings
rev|逆方向|Reverse
inv|反転|Invert
dbl|二重にする|Double
two|二つ表示|Two items
alt|交互に表示|Alternating
order|順序|Order
idx|項目番号|Item index
num|数字|Number
num0|開始番号|Starting number
count|個数|Count
cnt|個数|Count
per|一組の個数|Items per group
perCol|一列の個数|Items per column
every|繰り返し間隔|Repeat interval
len|長さ|Length
life|寿命|Lifetime
peak|ピーク|Peak
peaks|ピーク一覧|Peaks
copies|複製数|Copy count
copy|複製|Copy
extra|追加要素|Extra element
extras|追加要素一覧|Extra elements
ant|予兆|Anticipation
acc|加速度|Acceleration
jitter|揺れ|Jitter
jit|揺れの量|Jitter amount
jerk|急な動き|Jerking motion
wob|揺れ幅|Wobble
breathe|呼吸する動き|Breathing
sway|左右の揺れ|Sway
swing|振り子の動き|Swing
spin|回転|Spin
turn|旋回|Turn
twist|ねじれ|Twist
swirl|渦|Swirl
ripple|波紋|Ripple
wave|波|Wave
rise|上昇|Rise
fall|落下|Fall
drift|漂い|Drift
hop|跳ねる動き|Hop
kick|跳ね返り|Kick
knock|衝撃|Impact
burst|放射|Burst
explode|爆発|Explosion
shoot|飛び出し|Launch
shrink|縮小|Shrink
grow|拡大|Grow
lift|持ち上げ|Lift
sink|沈み込み|Sink
roll|転がり|Roll
rpm|回転速度|Rotation speed
pitch|縦回転|Pitch
yaw|横回転|Yaw
persp|遠近感|Perspective
dist|距離|Distance
strength|強さ|Strength
clear|透明化|Clear
crop|切り抜き|Crop
split|分割|Split
slice|スライス|Slice
slices|スライス数|Slice count
tile|タイル|Tile
cell|セルサイズ|Cell size
grid|格子|Grid
stripe|縞模様|Stripes
band|帯|Band
bar|バー|Bar
box|囲み|Box
frame|枠|Frame
round|丸み|Roundness
sharp|鋭さ|Sharpness
blur|ぼかし|Blur
flicker|明滅|Flicker
flash|閃光|Flash
flick|ちらつき|Flick
beam|光線|Beam
leak|光漏れ|Light leak
fog|霧|Fog
mist|もや|Mist
dust|ほこり|Dust
motes|浮遊粒子|Floating particles
spark|火花|Spark
debris|破片|Debris
stains|汚れ|Stains
scratch|ひっかき傷|Scratch
dark|暗さ|Darkness
red|赤み|Red tint
tint|色味|Tint
tone|色調|Tone
shade|陰影|Shade
opacity|不透明度|Opacity
bgText|背景文字|Background text
header|ヘッダー|Header
head|見出し|Heading
cap|キャプション|Caption
caps|大文字表示|Uppercase
label|ラベル|Label
labels|ラベル一覧|Labels
legend|凡例|Legend
info|情報|Information
desc|説明|Description
meta|補助情報|Metadata
attrib|出典|Attribution
quote|引用|Quote
word|単語|Word
letter|文字|Letter
latin|アルファベット|Latin letters
condensed|文字を縦長にする|Condensed text
seal|印章|Seal
stamp|スタンプ|Stamp
stampAng|スタンプの角度|Stamp angle
mark|マーク|Mark
marks|マーク一覧|Marks
markC|マーク色|Mark color
lineC|線の色|Line color
rule|罫線|Rule
rules|罫線一覧|Rules
rail|レール|Rail
rails|レール一覧|Rails
rings|リング数|Ring count
dots|点の数|Dot count
dot|点|Dot
ticks|目盛り|Ticks
spikes|突起|Spikes
lobes|曲線の山数|Curve lobes
pips|小さな点|Pips
pin|ピン|Pin
pinch|くびれ|Pinch
spot|スポット|Spot
fold|折り目|Fold
pleats|ひだ|Pleats
cloth|布地|Cloth
stitch|縫い目|Stitch
thread|糸|Thread
tape|テープ|Tape
trim|縁取り|Trim
tear|裂け目|Tear
torn|破れ|Torn
drape|垂れ下がり|Drape
trail|残像|Trail
tracks|軌跡|Tracks
flow|流れ|Flow
wind|風|Wind
rain|雨|Rain
drops|しずく|Drops
drips|垂れ|Drips
sun|太陽|Sun
mount|山|Mountain
floor|床面|Floor
shell|殻|Shell
plate|プレート|Plate
panel|パネル|Panel
page|ページ|Page
page0|開始ページ|Starting page
folio|ページ番号|Page number
serial|通し番号|Serial number
issue|号数|Issue number
mast|題字|Masthead
books|本の設定|Books
covers|表紙|Covers
rack|棚|Rack
posts|柱|Posts
doors|扉|Doors
lamps|照明|Lights
cat|猫|Cat
cats|猫の一覧|Cats
eye|目|Eye
face|顔|Face
hand|手|Hand
mainHand|主な手|Main hand
handle|ハンドル|Handle
joint|関節|Joint
art|絵柄|Artwork
img|画像|Image
hero|主役|Hero
emblem|紋章|Emblem
motif|模様|Motif
scene|シーン|Scene
style|表示スタイル|Display style
variant|バリエーション|Variant
rowStyle|行の表示方式|Row style
look|見た目|Appearance
reveal|出現|Reveal
peek|のぞき見|Peek
chase|追いかける動き|Chase
pulls|引く力|Pulls
prompt|入力ガイド|Prompt
sugg|候補文字|Suggested text
wrong|誤った文字|Wrong text
decoys|偽文字|Decoy text
clue|ヒント|Clue
bug|乱れ|Distortion
codes|コード文字|Code text
nums|数字一覧|Numbers
price|価格表示|Price display
score|スコア|Score
rank|順位|Rank
rk|順位の設定|Rank settings
val|値|Value
value|値|Value
level|段階|Level
lvl|段階|Level
day|日|Day
days|日数|Days
month|月|Month
mon|月表示|Month display
hour|時|Hour
hr|時刻|Hour
second|秒|Second
beat|拍|Beat
hz|振動数|Frequency
fin|終端|Ending
app|適用量|Application amount
act|動作|Action
assemble|組み立て|Assembly
barrier|遮蔽|Occlusion
bgSwitch|背景の切り替え頻度|Background change frequency
bias|抽選傾向|Selection bias
layout|レイアウト|Layout
enter|登場|Entrance
exit|退場|Exit
hud|補助情報表示|HUD
onTwos|コマ打ち|Stepped animation
density|密度|Density
dens|密度|Density
decor|装飾|Decoration
deco|飾り|Ornament
indent|字下げ|Indent
gut|段間|Column gutter
colOff|列のずれ|Column offset
cutY|切り替えの縦位置|Vertical cut position
tabY|タブの縦位置|Tab vertical position
w1|第一の幅|First width
w2|第二の幅|Second width
dw|幅の変化量|Width change
hgt|高さ|Height
sh|縦方向の補助倍率|Height modifier
th|厚み|Thickness
lo|下限|Lower bound
hi|上限|Upper bound
frac|割合|Fraction
sgn|向きの符号|Direction sign
off|オフセット|Offset
offs|オフセット一覧|Offsets
ol|外側の幅|Outer width
sp|間隔|Spacing
q|変化率|Change ratio
p|進行度|Progress
t|時間|Time
u|横方向の補助値|Horizontal factor
vx|横方向の速度|Horizontal velocity
vy|縦方向の速度|Vertical velocity
z|奥行き|Depth
xs|横位置の一覧|Horizontal positions
cam0|カメラの初期状態|Initial camera state
c0|初期色|Initial color
s0|初期倍率|Initial scale
a0|初期角度|Initial angle
l0|初期長さ|Initial length
self|自身の表示量|Self display amount
path|経路|Path
D|奥行きの補助値|Depth factor
L|長さの補助値|Length factor
N|個数の補助値|Count factor
R|半径の補助値|Radius factor
S|倍率の補助値|Scale factor
dr|鍵穴の大きさ|Keyhole size
pass|通り過ぎる影|Passing shadow
door|扉|Door
open|開き具合|Openness
wr|違う行の位置|Odd line position
kind|種類|Kind
gi|違う字の位置|Odd glyph position
n0|最初の階|Start floor
stop|止まる位置|Stop point
lag|遅れ|Lag
rip|波紋の強さ|Ripple strength
odd|食い違い|Mismatch
drip|しずくの量|Drips
hh|時|Hours
mm|分|Minutes
z0|雑音の開始位置|Noise start
zw|雑音の幅|Noise width
gl|ちらつき|Glitch amount
moths|虫の数|Moths
rotA|上片の傾き|Upper piece tilt
rotB|下片の傾き|Lower piece tilt
knob|取っ手|Door knob
duty|隙間の比率|Gap ratio
ss|秒|Seconds
stick|針の引っかかり|Hand sticking
roman|ローマ数字|Roman numerals
climb|上る向き|Climbing
hot|強調の位置|Highlighted item
rollers|ローラー|Rollers
rod|棒|Rod
mag|拡大率|Magnification
riser|蹴込み板|Risers
crease|折り目|Crease
sag|たわみ|Sag
clip|洗濯ばさみ|Clips
deep|奥行きの深さ|Depth amount
how|入り方|Entry style
al|揃え|Alignment
steps|段数|Steps
cyc|繰り返し回数|Cycles
hl|強調の形|Highlight style
pre|前の行数|Rows before
post|後の行数|Rows after
h0|開始の時|Start hour
m0|開始の分|Start minute
nT|見出しの数|Tab count
foot|脚注|Footer
tick|目盛り|Tick marks
hd|見出しの色|Header colour
full|全面|Full width
chk|チェック|Check mark
code|記号|Code
strike|消し方|Strike style
pg|ページ番号|Page number
ln|行番号|Line number
arrow|矢印|Arrow
pic|図の種類|Picture type
tr|字間|Tracking
stub|半券の種類|Stub type
cite|出典|Citation
scn|場面番号|Scene number
io|屋内・屋外|Interior / exterior
time|時間帯|Time of day
vo|声の種類|Voice type
trans|場面転換|Transition label
s1|第一の数値|First value
nb|帯の数|Band count
ring|輪|Ring
shift|ずれ|Shift
fontS|補助の書体|Secondary font
sides|辺の数|Sides
hy|横の分割|Horizontal split
fills|塗りの数|Filled cells
ya|縦の分割位置|Vertical split position
xa|横の分割位置|Horizontal split position
mir|反転|Mirror
stag|ずらし|Stagger
ord|順番|Order
sz|大きさ|Size
circ|円|Circle
fh|横の反転|Flip horizontally
fv|縦の反転|Flip vertically
spiral|渦巻き|Spiral
hub|中心の軸|Hub
qx|横の象限|Horizontal quadrant
qy|縦の象限|Vertical quadrant
pulse|脈動|Pulse
trend|傾向|Trend
area|塗り|Area fill
drop|下降|Drop
rest|残りの割合|Remainder
ex|切り出す扇|Exploded slice
hole|中の穴|Hole
orb|円の枠|Circle frame
tabs|タブの数|Tab count
ctl|ボタンの種類|Window controls
card|カード|Card
bw|枠の太さ|Border width
px|ピンの位置|Pin position
la|緯度|Latitude
sheets|紙の枚数|Sheets
s2|第二の数値|Second value
legs|脚|Legs
sky|天気|Weather
cells|目盛りの数|Cells
bolt|稲妻|Bolt
icon|アイコン|Icon
who|発信者|Caller
max|最大値|Maximum
sv|強調する列|Highlighted column
data|データの量|Data amount
steam|湯気の数|Steam wisps
neck|襟の形|Neckline
hang|ハンガー|Hanger
ul|下線の形|Underline style
doodle|落書き|Doodle
check|チェック|Check mark
ui|画面の種類|Screen type
ruled|罫線|Ruled lines
arcs|音の弧の数|Sound arcs
pull|開く引き出し|Open drawer
votes|票数|Votes
ns|縞の数|Stripes
turns|巻き数|Turns
rungs|横木|Rungs
star|星の形|Star shape
pv|回転の軸|Pivot
arrows|矢印|Arrows
road|道の色|Road colour
play|演奏|Playing
stems|符の棒|Note stems
sig|拍子記号|Time signature
ov|重なりの量|Overlap
move|移動|Movement
un|未読部分の表示|Unsung style
clock|時計|Clock
blink|点滅|Blink
wl|波長|Wavelength
bits|ビット表示|Bits
marker|目印|Marker
streaks|筋|Streaks
ground|地面|Ground
total|全体の量|Total
sync|揃い方|Sync
cross|十字|Cross
lead|行間|Leading
ext|延長線|Extension lines
other|もう一方の形|Other style
jp|和文の扱い|Japanese setting
axis|軸|Axis
tall|縦長|Tall
block|塊の色|Block colour
em|全角枠|Em box
base|基線の色|Baseline colour
multi|複数|Multiple
bars|骨の数|Bars
pat|柄|Pattern
tiers|段数|Tiers
cord|紐の色|Cord colour
hasRed|赤字|Red lettering
stars|星|Stars
knot|結び方|Knot
strands|水引の本数|Strands
ribs|骨の本数|Ribs
tassel|房|Tassel
sk|傾き|Slant
reg|トンボ|Registration marks
bow|反り|Bow
one|一枚|Single sheet
left|左側|Left side
mid|中央|Middle
ar|縦横比|Aspect ratio
flipY|上下反転|Flip vertically
horiz|横向き|Horizontal
ab|周波数比|Frequency ratio
keep|残す数|Kept
birds|鳥の数|Birds
x1|第一の位置|First position
x2|第二の位置|Second position
ball|玉|Ball
nA|歯の数|Teeth
what|表示の種類|Display kind
fps|コマ数|Frames per second
ax|軸|Axis
sg|向き|Direction
cw|回転の向き|Rotation direction
inw|内向き|Inward
` .trim().split('\n')){const [key,ja,en]=line.split('|');names[key]=[ja,en];}
J.detailFieldNames=names;
J.detailFieldLabel=key=>{
 if(names[key])return J.mediaLabel(...names[key]);
 if(/^\d+$/.test(key))return J.mediaLabel(`項目 ${Number(key)+1}`,`Item ${Number(key)+1}`);
 if(/^[a-z]$/.test(key))return J.mediaLabel(`補助値 ${key.toUpperCase()}`,`${key.toUpperCase()} factor`);
 const words=key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ');
 return J.mediaLabel(`補助設定（${words}）`,words.charAt(0).toUpperCase()+words.slice(1));
};
})();
