# GitHub Pages＋GAS 線上投票系統正式完整規格表

## 一、系統架構

```text
LINE LIFF
   ↓
GitHub Pages 前端
   ↓ HTTPS API
Google Apps Script 後端
   ↓
Google 試算表
```

| 元件 | 技術 | 職責 |
|---|---|---|
| 前端 | GitHub Pages | LIFF 初始化、登入、畫面顯示、呼叫 API |
| 身分驗證 | LINE LIFF ID Token | 識別使用者 |
| 後端 | Google Apps Script | 驗證 Token、權限判斷、投票邏輯 |
| 資料庫 | Google 試算表 | 儲存系統設定、使用者、投票及紀錄 |
| 管理介面 | Google 試算表及 GAS 編輯器 | 管理者維護資料及新增投票 |

Google Apps Script 不再提供前端 HTML，而是作為 API 後端使用。LINE 官方支援使用 Verify ID Token API 驗證 LIFF 取得的 ID Token。[ref:1,2]

---

# 二、認證與密鑰規格

## 2.1 前端公開設定

GitHub Pages 前端可以放置：

```text
LIFF_ID
GAS_API_URL
```

這些不是秘密資料。

## 2.2 GAS Script Properties

GAS 僅需保存：

```text
CHANNEL_ID
SPREADSHEET_ID
```

| 設定 | 用途 |
|---|---|
| `CHANNEL_ID` | 傳送至 LINE 官方 Token 驗證 API |
| `SPREADSHEET_ID` | 指定資料試算表 |

## 2.3 不使用的密鑰

本系統不使用：

```text
API_SECRET
CHANNEL_SECRET
CHANNEL_ACCESS_TOKEN
```

### `API_SECRET`

`API_SECRET` 是自行設計的 API 密鑰，不是 LIFF 或 GAS 的必要設定。本系統不採用。

### `CHANNEL_SECRET`

本系統不自行驗證 JWT 簽章，而是由 GAS 將下列資料交給 LINE 官方驗證：

```text
id_token
client_id：CHANNEL_ID
```

因此不保存 `CHANNEL_SECRET`。[ref:1,2]

### 重要限制

任何真正的秘密都不得放在：

- GitHub Pages。
- `index.html`。
- 公開 GitHub Repository。
- 前端 JavaScript。

---

# 三、LIFF 設定

## 3.1 LIFF Endpoint URL

LIFF Endpoint URL 必須設定為 GitHub Pages 實際網址：

```text
https://帳號.github.io/專案名稱/
```

不得設定為 GAS Web App URL：

```text
https://script.google.com/macros/s/部署ID/exec
```

目前執行 `liff.init()` 的頁面必須與 LIFF Endpoint URL 相同，或位於其下層路徑。

## 3.2 前端登入流程

```text
載入 GitHub Pages
→ 執行 liff.init()
→ 判斷是否登入
→ 未登入時執行 liff.login()
→ 使用 liff.getIDToken() 取得 ID Token
→ 傳送 ID Token 至 GAS
→ GAS 向 LINE 官方驗證
→ 回傳使用者權限狀態
```

前端不可使用自行傳入的 LINE User ID 作為權限依據。

## 3.3 GAS 驗證流程

```text
收到 ID Token
→ 呼叫 LINE Verify ID Token API
→ 使用 CHANNEL_ID 驗證
→ 取得經驗證的 LINE User ID
→ 查詢使用者工作表
→ 建立或判斷使用者狀態
```

`liff.getProfile()` 或前端自行傳送的顯示名稱不可作為後端授權依據。

---

# 四、前端規格

## 4.1 前端負責功能

- LIFF 初始化。
- LINE 登入。
- 取得 ID Token。
- 顯示登入載入畫面。
- 顯示未授權畫面。
- 顯示停用畫面。
- 顯示啟用中的投票。
- 顯示投票題目及選項。
- 送出投票。
- 修改投票。
- 新增投票選項。
- 顯示結果及明細。
- 執行瀏覽器列印。
- 顯示錯誤訊息。

## 4.2 前端不可自行決定

以下內容必須由後端判斷：

- 使用者是否存在。
- 使用者是否啟用。
- 投票是否啟用。
- 是否已截止。
- 使用者是否在黑名單。
- 是否超過選項上限。
- 投票是否成功。

前端隱藏按鈕不能視為安全控管。

---

# 五、Google Apps Script 後端規格

## 5.1 GAS Web App

GAS 部署後取得 API URL：

```text
https://script.google.com/macros/s/部署ID/exec
```

此網址只作為 API 使用，不作為 LIFF Endpoint URL。

## 5.2 API 入口

```javascript
function doGet(e) {
  return 處理API請求_(e, 'GET');
}

function doPost(e) {
  return 處理API請求_(e, 'POST');
}
```

兩者皆回傳 JSON，不回傳 `HtmlService`。

## 5.3 API 統一回應格式

成功：

```json
{
  "ok": true,
  "data": {},
  "error": null
}
```

失敗：

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "錯誤說明"
  }
}
```

## 5.4 建議 API 動作

| 動作 | 方法 | 用途 |
|---|---|---|
| `getSession` | `POST` | 驗證登入及取得權限 |
| `getVotes` | `POST` | 取得啟用中的投票 |
| `getVote` | `POST` | 取得單筆投票 |
| `submitVote` | `POST` | 新增或更新投票 |
| `addOption` | `POST` | 新增選項 |
| `getResult` | `POST` | 取得投票結果 |
| `getDetails` | `POST` | 取得投票明細 |
| `getPrintData` | `POST` | 取得列印資料 |

每個需要權限的 API 都必須重新驗證 ID Token。

---

# 六、跨來源請求規格

GitHub Pages 與 GAS 屬於不同來源，因此必須進行跨來源測試。

## 6.1 第一階段採用方式

- 查詢及寫入均可使用 `POST`。
- 將資料放在 request body。
- ID Token 放在 request body。
- 不使用自訂 `Authorization` Header。
- 不使用不必要的自訂 Header。
- 前端以簡單格式傳送請求。
- 實際測試 LINE 內建瀏覽器、iOS 及 Android。

## 6.2 CORS 驗收

必須確認：

- GitHub Pages 可以呼叫 GAS。
- GAS 可以回傳 JSON。
- 瀏覽器不阻擋回應。
- 不會因預檢請求而失敗。

若直接呼叫 GAS 無法穩定通過跨來源限制，再增加：

```text
GitHub Pages
→ Cloudflare Worker／Netlify Function／Firebase Functions
→ GAS
```

Proxy 只負責跨來源轉送，投票權限及資料邏輯仍由 GAS 執行。

---

# 七、試算表工作表

系統使用四張工作表：

```text
系統設定
使用者
投票
投票紀錄
```

初始化規則：

- 不刪除既有工作表。
- 不刪除既有資料。
- 不覆蓋既有設定。
- 不重複建立工作表。
- 不重複建立設定名稱。
- 標題欄位不符時顯示錯誤並停止。

---

# 八、`系統設定` 工作表

## 8.1 欄位

```text
設定名稱
設定值
說明
是否必填
最後更新時間
```

## 8.2 設定項目

| 設定名稱 | 用途 | 預設值 |
|---|---|---|
| `TIMEZONE` | 日期判斷時區 | `Asia/Taipei` |
| `MAX_OPTIONS` | 所有投票共用的選項上限 | `10` |
| `VOTE_ID_FORMAT` | 投票 ID 格式 | `yyyyMM` |
| `SYSTEM_NAME` | 系統名稱 | `線上投票系統` |
| `DEFAULT_MARKDOWN_TITLE` | 新增投票預設題目 | 可留白 |
| `DEFAULT_OPTIONS` | 新增投票預設選項 | 可留白 |
| `DEFAULT_MULTI_SELECT` | 新增投票預設是否複選 | `否` |
| `DEFAULT_DEADLINE` | 新增投票預設截止日期 | 可留白 |

## 8.3 不包含的設定

不得包含：

```text
DEFAULT_VOTE_STATUS
API_SECRET
CHANNEL_SECRET
```

新增投票的狀態固定由程式設定為：

```text
停用
```

## 8.4 驗證規則

| 設定 | 規則 |
|---|---|
| `MAX_OPTIONS` | 必須是大於零的整數 |
| `DEFAULT_MULTI_SELECT` | 只能是 `是` 或 `否` |
| `DEFAULT_DEADLINE` | 空白或符合 `YYYY-MM-DD` |
| `DEFAULT_OPTIONS` | 每行一個選項，不得超過 `MAX_OPTIONS` |
| `TIMEZONE` | 必須是有效時區 |

設定錯誤時不得猜測或自動套用不明值。

---

# 九、`使用者` 工作表

## 9.1 欄位

```text
LINE User ID
顯示名稱
使用者狀態
備註
建立時間
```

## 9.2 欄位維護責任

| 欄位 | 建立時 | 後續 |
|---|---|---|
| LINE User ID | 程式填入 | 維持原值 |
| 顯示名稱 | 程式第一次填入 | 管理者維護 |
| 使用者狀態 | 固定為停用 | 管理者維護 |
| 備註 | 程式可填入提示 | 管理者維護 |
| 建立時間 | 程式填入 | 維持原值 |

## 9.3 新使用者

使用者不存在時，建立：

```text
LINE User ID：經驗證的 LINE User ID
顯示名稱：第一次取得的 LINE 使用者名稱
使用者狀態：停用
備註：系統自動建立，請管理者確認
建立時間：程式自動記錄
```

若無法取得名稱：

```text
顯示名稱：LINE User ID
```

## 9.4 已存在且啟用

- 狀態維持啟用。
- 顯示名稱不更新。
- 備註不更新。
- 建立時間不更新。
- 允許使用系統。

## 9.5 已存在但停用

- 狀態維持停用。
- 顯示名稱不更新。
- 備註不更新。
- 建立時間不更新。
- 不允許使用系統。

---

# 十、使用者權限

## 10.1 未授權及停用使用者可見內容

- 經後端驗證的 LINE User ID。
- 目前狀態。
- 請聯絡管理者的提示。

## 10.2 不可取得內容

- 投票列表。
- 投票題目。
- 投票選項。
- 結果。
- 明細。
- 列印資料。
- 黑名單。
- 其他使用者資料。

## 10.3 啟用使用者

啟用使用者可以：

- 查詢啟用中的投票。
- 投票。
- 修改自己的投票。
- 新增投票選項。
- 查看結果。
- 查看明細。
- 列印資料。

---

# 十一、`投票` 工作表

## 11.1 欄位

```text
投票 ID／議案編號
Markdown 題目
投票選項
是否複選
截止日期
啟用狀態
黑名單
```

## 11.2 不包含的欄位

不得包含：

```text
建立時間
修改時間
選項上限
新增者
新增時間
```

所有投票共用：

```text
系統設定.MAX_OPTIONS
```

## 11.3 欄位責任

| 欄位 | 維護者 |
|---|---|
| 投票 ID／議案編號 | 程式 |
| Markdown 題目 | 管理者 |
| 投票選項 | 管理者；使用者可新增 |
| 是否複選 | 管理者 |
| 截止日期 | 管理者 |
| 啟用狀態 | 管理者 |
| 黑名單 | 管理者 |

---

# 十二、投票 ID

格式範例：

```text
202607-001
```

規則：

- 程式自動產生。
- 不可重複。
- 管理者不需手動輸入。
- 使用 `LockService` 防止同時產生重複 ID。
- 依投票 ID 由新到舊排列。

---

# 十三、投票題目及選項

## 13.1 Markdown 題目

題目存放於單一儲存格，前端轉換為 HTML 後顯示。

Markdown 轉換後必須清理危險 HTML，避免執行不安全內容。

## 13.2 選項格式

```text
方案 A
方案 B
方案 C
```

規則：

- 每行一個選項。
- 空白行不計算。
- 完全相同的選項不得重複。
- 所有投票共用 `MAX_OPTIONS`。
- 使用者只能新增，不能修改或刪除既有選項。
- 新選項附加於最後。
- 不記錄新增者及新增時間。

## 13.3 新增選項流程

```text
驗證 ID Token
→ 確認使用者啟用
→ 確認投票啟用
→ 確認未截止
→ 確認不在黑名單
→ 讀取 MAX_OPTIONS
→ 取得鎖定
→ 重新讀取最新選項
→ 檢查重複
→ 檢查數量上限
→ 寫入選項
→ 釋放鎖定
```

---

# 十四、截止日期

## 14.1 格式

```text
YYYY-MM-DD
```

例如：

```text
2026-07-31
```

不得記錄時間。

## 14.2 判斷

| 條件 | 結果 |
|---|---|
| 空白 | 無截止限制 |
| 截止日前 | 可投票 |
| 截止日當天 | 可投票 |
| 超過截止日 | 不可投票 |
| 投票停用 | 不可查詢及投票 |

日期由後端依 `TIMEZONE` 判斷，不採用使用者手機日期。

## 14.3 已截止投票

只要狀態為啟用，已截止投票仍可：

- 查詢。
- 查看結果。
- 查看明細。
- 列印。

不可：

- 投票。
- 修改投票。
- 新增選項。

---

# 十五、投票狀態

狀態只有：

```text
啟用
停用
```

新增投票時固定為：

```text
停用
```

管理者檢查完成後，手動改為：

```text
啟用
```

停用投票時：

- 不顯示於列表。
- 不可由網址查詢。
- 不可看結果及明細。
- 不可列印。
- 不可投票。
- 不可新增選項。

---

# 十六、黑名單

## 16.1 格式

```text
Uxxxxxxxxxxxx
Uyyyyyyyyyyyy
```

每行一個 LINE User ID。

## 16.2 規則

黑名單只適用於單筆投票。

| 功能 | 黑名單使用者 |
|---|---|
| 查看啟用投票 | 可以 |
| 查看結果 | 可以 |
| 查看明細 | 可以 |
| 投票 | 不可以 |
| 修改投票 | 不可以 |
| 新增選項 | 不可以 |

---

# 十七、`投票紀錄` 工作表

## 17.1 欄位

```text
投票紀錄 ID
投票者顯示名稱
選擇的選項行號
選擇的選項內容快照
首次投票時間
最後修改時間
```

## 17.2 投票紀錄 ID

```text
投票ID::LINEUserID
```

## 17.3 規則

- 同一使用者對同一投票只保留一筆紀錄。
- 再次投票時更新原紀錄。
- 首次投票時間不變。
- 最後修改時間更新。
- 不保留歷史版本。
- 寫入及更新時使用 `LockService`。

---

# 十八、投票資料驗證

後端必須確認：

- 選項行號為有效整數。
- 選項行號沒有重複。
- 行號未超過有效選項數。
- 選項內容快照數量與行號一致。
- 單選只能選一個選項。
- 複選至少選一個選項。
- 投票者為啟用使用者。
- 投票狀態為啟用。
- 投票尚未截止。
- 投票者不在黑名單。

資料異常時必須拒絕操作並回傳錯誤。

---

# 十九、結果及明細

## 19.1 結果

顯示：

- 系統名稱。
- 投票 ID。
- Markdown 題目。
- 所有有效選項。
- 各選項票數。
- 投票人數。
- 是否複選。
- 截止日期。
- 是否已截止。

## 19.2 明細

顯示：

- 投票者顯示名稱。
- 顯示名稱空白時顯示 LINE User ID。
- 選項內容快照。
- 首次投票時間。
- 最後修改時間。

統計依選項行號計算，不直接依目前選項文字計算。

---

# 二十、列印

第一階段使用：

```javascript
window.print();
```

列印內容包括：

- 系統名稱。
- 投票 ID。
- Markdown 題目。
- 投票選項。
- 各選項票數。
- 投票者名稱。
- 選項快照。
- 首次投票時間。
- 最後修改時間。
- 截止日期。
- 投票狀態。

未授權及停用使用者不得取得列印資料。

---

# 二十一、新增投票

管理者在 GAS 編輯器執行：

```javascript
新增投票()
```

程式流程：

```text
讀取系統設定
→ 驗證設定
→ 鎖定
→ 產生投票 ID
→ 帶入預設題目
→ 帶入預設選項
→ 帶入是否複選
→ 帶入截止日期
→ 狀態固定設為停用
→ 黑名單留白
→ 寫入資料
→ 解除鎖定
```

管理者之後手動確認：

```text
Markdown 題目
投票選項
是否複選
截止日期
黑名單
啟用狀態
```

確認完成後，將狀態改為：

```text
啟用
```

---

# 二十二、主要程式函式

```javascript
doGet(e)
doPost(e)
初始化系統()
新增投票()
```

後端另需具備：

- `驗證IDToken_()`
- `取得使用者資料_()`
- `建立新使用者_()`
- `取得系統設定_()`
- `驗證系統設定_()`
- `取得投票列表_()`
- `取得單筆投票_()`
- `儲存投票紀錄_()`
- `新增投票選項_()`
- `取得投票結果_()`
- `取得投票明細_()`
- `建立API回應_()`
- `建立API錯誤_()`

函式名稱可調整，但權限及驗證邏輯不得省略。

---

# 二十三、並發處理

以下操作必須使用 `LockService`：

- 初始化。
- 產生投票 ID。
- 自動建立使用者。
- 新增投票。
- 新增選項。
- 新增投票紀錄。
- 更新投票紀錄。

取得鎖定後必須重新讀取最新資料，再執行檢查及寫入。

---

# 二十四、部署流程

## 24.1 GitHub Pages

1. 建立 GitHub Repository。
2. 上傳前端檔案。
3. 啟用 GitHub Pages。
4. 取得 HTTPS 網址。
5. 將網址設定為 LIFF Endpoint URL。
6. 將 `LIFF_ID` 及 `GAS_API_URL` 放入前端設定。

## 24.2 LINE Developers

1. 建立或使用 LINE Login Channel。
2. 建立 LIFF App。
3. 設定 GitHub Pages 為 Endpoint URL。
4. 取得 LIFF ID。
5. 確認前端能執行 `liff.init()`。

## 24.3 Google Apps Script

1. 建立 GAS 專案。
2. 建立 `Code.gs`。
3. 執行 `初始化系統()`。
4. 設定 `CHANNEL_ID` 及 `SPREADSHEET_ID`。
5. 部署為 Web App。
6. 取得 GAS API URL。
7. 填入 GitHub Pages 前端設定。
8. 測試登入、查詢、投票及結果。

---

# 二十五、最終設定總表

## GitHub Pages 前端

```text
LIFF_ID
GAS_API_URL
```

## GAS Script Properties

```text
CHANNEL_ID
SPREADSHEET_ID
```

## 不使用

```text
API_SECRET
CHANNEL_SECRET
CHANNEL_ACCESS_TOKEN
DEFAULT_VOTE_STATUS
```

---

# 二十六、驗收項目

## LIFF

- LIFF Endpoint URL 為 GitHub Pages。
- `liff.init()` 正常。
- LINE 內建瀏覽器可登入。
- iOS 可登入。
- Android 可登入。
- 重新整理後登入狀態正常。
- 登入失敗會顯示錯誤。

## 身分及權限

- ID Token 由 LINE 官方驗證。
- 前端偽造 User ID 無法通過。
- 新使用者會自動建立。
- 新使用者狀態為停用。
- 既有顯示名稱不會被更新。
- 既有使用者狀態不會被程式改變。
- 未授權及停用使用者不能取得投票資料。

## 投票

- 新增投票狀態固定為停用。
- 不存在 `DEFAULT_VOTE_STATUS`。
- 投票工作表沒有「選項上限」欄位。
- 所有投票使用 `MAX_OPTIONS`。
- 截止日期格式正確。
- 截止日當天仍可投票。
- 超過截止日不可投票。
- 停用投票不可查詢。
- 黑名單使用者不可投票。
- 已截止但啟用中的投票仍可查看結果。

## API

- GitHub Pages 可取得 GAS JSON。
- GET／POST 請求正常。
- CORS 實機測試通過。
- Token 失效時拒絕操作。
- 並發新增選項不會遺失資料。
- 並發投票不會錯誤覆蓋資料。

---

# 二十七、最終確定結論

1. 前端使用 GitHub Pages。
2. LIFF Endpoint URL 使用 GitHub Pages。
3. GAS 僅作為 API 後端。
4. GAS 不提供 `Index.html`。
5. 前端使用 `liff.getIDToken()` 取得 Token。
6. GAS 使用 LINE 官方 API 驗證 ID Token。
7. 本系統不需要 `API Secret`。
8. 本系統不需要 `Channel Secret`。
9. 本系統不需要 `Channel Access Token`。
10. GAS 僅保存 `CHANNEL_ID` 及 `SPREADSHEET_ID`。
11. 使用者第一次登入時自動建立資料。
12. 新使用者狀態固定為停用。
13. 顯示名稱只在建立時填入。
14. 既有使用者顯示名稱由管理者維護。
15. 程式不得更新既有顯示名稱。
16. 程式不得自動修改既有使用者狀態。
17. `DEFAULT_VOTE_STATUS` 移除。
18. 新增投票固定為停用。
19. `MAX_OPTIONS` 只放在系統設定。
20. 投票工作表不含個別選項上限。
21. 截止日期格式為 `YYYY-MM-DD`。
22. 截止日當天仍可投票。
23. 已截止但啟用中的投票仍可查詢。
24. 未授權及停用使用者不可取得任何投票資料。
25. GAS 與 GitHub Pages 的跨來源請求必須實機驗收。
26. 若直接呼叫 GAS 發生跨來源問題，再增加 API Proxy。
