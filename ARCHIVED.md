# 專案封存與重啟紀錄

日期：2026-07-28  
原狀態：Gate 2 停止
目前狀態：使用者人工覆核後重啟，製作 Vertical Slice

## 為什麼停止

1. 窄競品複查發現 Siegelock 已具備 HTML5、單人 roguelike deckbuilder 與 autobattler，Gate 1 的原市場空白主張失效。
2. 改成「四格條件腳本」後，20,000 局 baseline 與兩輪同 seed 修訂仍未達 Gate 2 門檻。
3. 最終總勝率 11.43%，reactive 為 0%，fortress 6.03%，threshold 0.63%；前三種非 assault 策略實質不可行。
4. 前五組勝場 build 集中 82.32%，顯示四槽、一次性 charge、六回合傷害檢查會強迫玩家採用三攻一功能。

## 保留價值

- `design/competition-audit.md`：失效差異化的反證。
- `design/spec.md`：條件腳本 pivot 的完整規格。
- `sim/prototype.ts`：可重播紙上原型。
- `sim/reports/2026-07-28-gate-2-feasibility.md`：同 seed 前後比較與停止理由。

本 repo 原先保留為工作室研究資產。2026-07-28 使用者明確要求實際製作第一輪遊戲，等同接受已知市場與平衡風險並人工覆核停止決定。

重啟不會把失敗模型原封不動工程化。結構修正方向是讓遭遇具有公開、不同的契約目標（擊破／撐過腳本），使防守與反應指令能直接完成部分遭遇，而非所有 build 都被六回合傷害檢查強迫成三攻一功能。
