# 窄競品複查：純草稿／自動結算

日期：2026-07-28

## 結論

Gate 1 提案原本主張「找不到同時滿足單人 roguelike run、戰鬥全自動、瀏覽器即玩的作品」。這項主張已被 **Siegelock** 反駁，不能再沿用。

選題不因此自動失效，但差異化必須從「瀏覽器純草稿 autobattler」縮窄為：

> 玩家先讀取完全公開的敵方腳本，再把有限張「條件指令」排成優先序並一次提交；戰鬥全程不可介入，結果可由 seed 與指令序列逐 tick 重播。

若 Gate 2 認為這個「編排條件指令」仍不足以形成記憶點，應停止專案，而不是退回泛用 deckbuilder。

## 直接競品

| 作品 | 瀏覽器 | 單人 run | 戰鬥零輸入 | 與本作的重疊 | 保留區隔 |
|---|---:|---:|---:|---|---|
| [Siegelock](https://serab.itch.io/siegelock) | 是 | 是 | 配置後觀看 | roguelike deckbuilder、autobattler、HTML5；直接反駁原市場空白 | 本作無戰鬥抽牌或逐張拖牌；每戰只提交一份有優先序的條件腳本，敵方腳本完全公開 |
| [Roguelike Autobattler](https://laitheis.itch.io/roguelike-autobattler) | 是 | 未完整說明 | 是 | HTML5 roguelike autobattler 原型 | 未標示 deckbuilding；本作以條件指令草稿與可重播時間線為核心 |
| [Slayer of Armies](https://bangergames.itch.io/slayer-of-armies) | 是 | 是 | 是 | HTML5、招募與升級、單位永久死亡 | 軍隊管理而非條件腳本；本作不做大量單位或 60 場內容 |
| [Warlords: Deckbuilding Autobattler](https://store.steampowered.com/app/4937370/Warlords_Deckbuilding_Autobattler/) | 否 | 是 | 配置後觀看 | 草稿卡包、部署、分支地圖與自動結算，結構高度接近 | 規模遠大且是戰場部署；本作鎖定 4 格條件腳本與 15–20 分鐘短 run |

itch.io 的 HTML5 Auto Battler 分類已有數百項結果，因此「瀏覽器 autobattler 稀缺」也不能作為主張。分類本身將 auto battler 定義為戰前配置、戰鬥無玩家介入，正是成熟類型語彙，不是本作獨創。

## 從競品回饋導出的設計紅線

Siegelock 玩家回饋揭露三個可直接利用的風險：

1. 能把牌組削到固定 5–7 張、每戰重播同一手牌時，策略會快速收斂。
2. 觸發鏈若沒有事件預算，容易出現無限循環與軟鎖。
3. 若一個組合能過度放大數值，表面上的卡池多樣性不等於實際 build 多樣性。

因此本作規格採用：

- 每張指令每戰只有有限 charge，任何事件最多觸發一張指令。
- 4 個腳本槽位固定，不用刪牌把牌庫壓縮成固定循環。
- 敵方腳本與關卡修正會改變每戰的最佳排序。
- Balance 報告必須量測 build signature 重複率，不能只看勝率。

## 可反駁的 Gate 2 差異化命題

截至本次複查，找到的近似作品都以單位部署、逐張拖牌、背包配置或軍隊管理為主要輸入；尚未找到把「公開敵方事件腳本 → 四格條件指令優先序 → 一次提交 → 可逐 tick 重播」作為唯一核心操作的瀏覽器 roguelike。

這不是「無人做過」的強宣稱，而是目前的窄定位。只要找到一款核心循環實質相同的既有作品，Gate 2 就必須重新評估。
