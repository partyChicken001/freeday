# 哪天有空露營

大家輸入名字、在月曆上勾有空的日期，下方統計哪天最多人有空。不用帳號、不用登入。

- 網頁：GitHub Pages（`index.html`、`config.js`）
- 資料：Google 試算表，透過 Apps Script（`apps-script/Code.gs`）讀寫
- 頁面每 8 秒向試算表抓一次最新資料

## 設定步驟

### 1. 建立試算表後端

1. 到 Google 雲端硬碟新增一個試算表，名稱隨意（例如「露營日期」）。
2. 選單「擴充功能 → Apps Script」。
3. 把編輯器裡原本的程式碼全部刪掉，貼上 `apps-script/Code.gs` 的內容，存檔。
4. 右上角「部署 → 新增部署作業」：
   - 類型選「網頁應用程式」
   - 執行身分：**我**
   - 具有存取權的使用者：**所有人**
5. 按「部署」，第一次會要求授權，照畫面允許（會出現「Google 尚未驗證這個應用程式」，點「進階 → 前往（不安全）」，這是你自己的腳本）。
6. 複製「網頁應用程式網址」（結尾是 `/exec`）。

### 2. 填入網址

打開 `config.js`，把網址貼進去：

```js
window.FREEDAY_API = "https://script.google.com/macros/s/xxxxxxxx/exec";
```

### 3. 放上 GitHub Pages

1. 在 GitHub 建一個 public repo（例如 `camping-days`）。
2. 推上去：
   ```bash
   git init
   git add .
   git commit -m "feat: 哪天有空露營網頁"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/camping-days.git
   git push -u origin main
   ```
3. repo 的「Settings → Pages」，Source 選 `Deploy from a branch`，Branch 選 `main` / `/ (root)`，存檔。
4. 約一分鐘後網址會是 `https://<你的帳號>.github.io/camping-days/`。

### 4. 營位規格（帳數、營位費）

1. 試算表「檔案 → 匯入 → 上傳」`sites.csv`，選「插入新工作表」，工作表改名 `sites`。
2. 「檔案 → 共用 → 發布到網路」，左邊**只選 `sites` 工作表**（不要選整份文件，否則 `people` 也會公開），右邊選「逗號分隔值 (.csv)」，發布。
3. 把網址貼到 `config.js` 的 `FREEDAY_SITES_CSV`。

之後改價格或帳數直接改試算表 `sites` 工作表即可，約 5 分鐘內反映到網頁，不用改程式。欄位依標題名稱對應：`營位名稱(官網)`、`帳數`、`營位費`、`營位大小(cm)`、`型式`、`備註`；營位名稱要跟小路官網訂位表上的寫法一致才對得起來。

## 之後要改 Apps Script

修改程式碼後要「部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選『新版本』→ 部署」，網址才會維持不變並套用新程式。直接「新增部署作業」會產生新網址。

## 注意

- 任何拿到網址的人都能勾選、也能改別人的勾選（點名字切換），適合朋友間使用。
- 想清空或修正資料，直接在試算表 `people` 工作表刪除整列即可。
