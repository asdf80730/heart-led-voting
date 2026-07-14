

# GitHub Pages＋GAS 線上投票系統正式規格（省 Token 優化版）

> 本版以「集中定義、避免重複、保留原意」為原則。  
> 「【本次修訂】」為已納入的修改；「【待後續處理】」為已列入但尚未完成的程式修改。

---

## 0. 全域規則

### 0.1 安全原則

- 前端只負責顯示、互動、LIFF 登入及呼叫 API。
- 所有權限、狀態、截止日期、黑名單、選項數量、票數及投票結果，均由 GAS 後端判斷。
- 前端隱藏或停用按鈕不屬於安全控管。
- 不信任前端傳入的 User ID、顯示名稱、黑名單狀態、票數或權限。
- 所有需要權限的 API 都必須重新驗證 ID Token。
- 發生資料異常時必須拒絕操作，不猜測、不自動修正、不靜默套用不明值。

### 0.2 鎖定原則

下列操作必須使用 `LockService`：

- 初始化。
- 新增使用者。
- 產生投票 ID。
- 新增投票。
- 新增選項。
- 新增或更新投票紀錄。

取得鎖定後必須：

1. 重新讀取最新設定及資料。
2. 重新驗證權限、狀態、截止日期及限制。
3. 重新檢查重複、數量及資料一致性。
4. 完成寫入或更新。
5. 使用 `finally` 釋放鎖定。

不得使用鎖定前讀取的舊資料直接寫入。

### 0.3 日期原則

- 截止日期格式為 `YYYY-MM-DD`，不記錄時間。
- 空白代表無截止限制。
- 截止日當天仍可投票。
- 超過截止日不可投票、修改投票或新增選項。
- 日期判斷及格式化必須使用 `系統設定.TIMEZONE`。
- 不得使用使用者手機日期或時區。

---

# 一、系統架構

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
| 前端 | GitHub Pages | LIFF、登入、畫面、API 呼叫 |
| 身分驗證 | LINE LIFF ID Token | 識別使用者 |
| 後端 | GAS | Token 驗證、權限、投票邏輯 |
| 資料庫 | Google 試算表 | 設定、使用者、投票、紀錄 |
| 管理介面 | 試算表及 GAS 編輯器 | 維護資料、新增投票 |

GAS 僅提供 API，不提供前端 HTML。

---

# 二、設定與密鑰

## 2.1 GitHub Pages 公開設定

```text
LIFF_ID
GAS_API_URL
```

可出現在公開 Repository。

## 2.2 GAS Script Properties

```text
CHANNEL_ID
SPREADSHEET_ID
```

| 設定 | 用途 |
|---|---|
| `CHANNEL_ID` | LINE Verify ID Token API 的 `client_id` |
| `SPREADSHEET_ID` | 指定 Google 試算表 |

## 2.3 禁止使用

```text
API_SECRET
CHANNEL_SECRET
CHANNEL_ACCESS_TOKEN
DEFAULT_VOTE_STATUS
```

真正秘密不得放在 GitHub Pages、`index.html`、前端 JavaScript、公開 Repository 或前端設定檔。

---

# 三、LIFF 與認證

## 3.1 Endpoint URL

LIFF Endpoint URL 必須是 GitHub Pages：

```text
https://帳號.github.io/專案名稱/
```

不得使用 GAS Web App URL。

執行 `liff.init()` 的頁面必須是 Endpoint URL 或其下層路徑。

## 3.2 登入流程

```text
載入 GitHub Pages
→ liff.init()
→ 判斷登入狀態
→ 未登入則 liff.login()
→ liff.getIDToken()
→ 傳送 ID Token 至 GAS
→ GAS 呼叫 LINE Verify ID Token API
→ 取得經驗證的 LINE User ID
→ 查詢或建立使用者
→ 回傳權限狀態
```

前端不得以自行傳入的 User ID 作為授權依據。

## 3.3 顯示名稱

`liff.getProfile()` 或前端顯示名稱只能：

- 作為新使用者建立時的輔助資料。
- 不得作為授權依據。
- 不得覆蓋既有顯示名稱。

---

# 四、前端規格

## 4.1 前端功能

前端負責：

- LIFF 初始化及登入。
- 取得 ID Token。
- 顯示載入、未授權及停用畫面。
- 顯示啟用中的投票。
- 顯示題目、選項、票數、投票人數及截止狀態。
- 送出及修改投票。
- 新增選項。
- 顯示結果及錯誤訊息。
- 執行列印。

## 4.2 單筆投票頁面

每次進入單筆投票頁面都必須呼叫：

```text
getVote
```

不得以舊結果快取取代 API 查詢。

頁面必須顯示：

- 系統名稱。
- 投票 ID。
- Markdown 題目。
- 所有有效選項。
- 單選或複選狀態。
- 截止日期及是否已截止。
- 各選項目前票數。
- 投票人數。
- 自己的投票紀錄。

票數顯示於各選項右側；票數由後端提供，前端不得自行計算。

## 4.3 投票操作狀態【本次修訂】

送出或修改投票時：

1. 顯示處理中訊息。
2. 停用送出按鈕及選項控制項。
3. 防止重複點擊及重複提交。
4. 成功後顯示成功訊息。
5. 失敗後顯示明確錯誤。
6. 最後恢復操作狀態。

## 4.4 投票後流程【本次修訂】

```text
送出投票
→ submitVote
→ 後端完成寫入
→ 成功後重新呼叫 getVote
→ 取得最新票數、投票人數及個人紀錄
→ 重新渲染頁面
```

`submitVote` 可以回傳最新 `vote` 作為輔助資料，但不得取代成功後的 `getVote`。

## 4.5 新增選項後狀態

新增選項成功後，不得清除尚未送出的勾選內容。可採用：

1. 重新繪製前保存並恢復勾選。
2. 只更新選項 DOM。
3. 重新載入後恢復勾選。

新增選項不得自動改變使用者尚未送出的選擇。

## 4.6 Markdown 安全

題目顯示前必須：

1. Escape HTML 特殊字元。
2. 只轉換允許的 Markdown。
3. 禁止任意 HTML、`script`、事件處理器及危險連結。

允許：

```text
# 標題
## 標題
### 標題
**粗體**
*斜體*
`程式碼`
```

---

# 五、GAS API

## 5.1 API 入口

```javascript
function doGet(e) {
  return 處理API請求_(e, 'GET');
}

function doPost(e) {
  return 處理API請求_(e, 'POST');
}
```

兩者均回傳 JSON，不回傳 `HtmlService`。

## 5.2 API 回應格式

成功：

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "meta": {}
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
  },
  "meta": {}
}
```

`meta` 可包含 `requestId`、`durationMs` 等非敏感資訊。

不得回傳 Token、秘密、Script Properties、完整黑名單或其他使用者敏感資料。

## 5.3 API 動作

| 動作 | 方法 | 用途 |
|---|---|---|
| `bootstrap` | `POST` | 初始化使用者狀態及投票列表 |
| `getSession` | `POST` | 驗證登入及取得權限 |
| `getVotes` | `POST` | 取得啟用投票 |
| `getVote` | `POST` | 取得單筆投票、結果及自己的紀錄 |
| `submitVote` | `POST` | 新增或更新投票 |
| `addOption` | `POST` | 新增投票選項 |
| `getPrintData` | `POST` | 取得列印結果及完整明細 |

不提供：

```text
getResult
getDetails
```

`getResult` 功能併入 `getVote`；線上明細移除，完整明細僅由 `getPrintData` 提供。

## 5.4 `submitVote` 成功資料

可回傳：

```javascript
{
  voteId: '202607-001',
  operation: 'create',
  message: '投票成功',
  vote: {
    id: '202607-001',
    markdown: '...',
    markdownHtml: '...',
    options: ['方案 A', '方案 B'],
    multiSelect: false,
    deadline: '2026-07-31',
    status: '啟用',
    closed: false,
    counts: [12, 8],
    voterCount: 20,
    myRecord: {
      hasVoted: true,
      selectedIndexes: [1],
      snapshots: ['方案 A'],
      createdAt: '...',
      updatedAt: '...'
    }
  }
}
```

`operation` 僅能是 `create` 或 `update`。

---

# 六、跨來源請求

## 6.1 第一階段

- 查詢及寫入皆可使用 `POST`。
- ID Token 置於 request body。
- 不使用自訂 `Authorization` Header。
- 不使用不必要的自訂 Header。
- 使用簡單格式，實測 LINE 內建瀏覽器、iOS、Android。

可使用：

```javascript
new URLSearchParams({
  payload: JSON.stringify(request)
});
```

後端必須正確解析 `application/x-www-form-urlencoded`。

## 6.2 `+` 解碼

表單解析時，`+` 代表空白，不能被保留為加號：

```javascript
function 解碼表單值_(value) {
  return decodeURIComponent(
    String(value || '').replace(/\+/g, ' ')
  );
}
```

## 6.3 CORS

必須測試：

- GitHub Pages 呼叫 GAS。
- GAS 回傳 JSON。
- 無預檢失敗。
- LINE 內建瀏覽器、iOS、Android 正常。

若直接呼叫不穩定，可使用：

```text
GitHub Pages
→ Cloudflare Worker／Netlify Function／Firebase Functions
→ GAS
```

Proxy 只轉送，不負責權限、投票邏輯、秘密或資料保存。

---

# 七、試算表總則

工作表固定為：

```text
系統設定
使用者
投票
投票紀錄
```

## 7.1 初始化

- 不刪除工作表或資料。
- 不覆蓋既有設定。
- 不重複建立工作表或設定名稱。
- 標題名稱、順序及數量必須完全符合規格。
- 不得有缺少或額外欄位。
- 標題錯誤時停止並顯示錯誤。
- 初始化必須使用鎖定。

> `使用者` 工作表的 `建立時間` 為正式欄位。  
> `投票` 工作表不得包含 `建立時間`、`修改時間`、`新增者`、`新增時間` 等欄位。

禁止出現：

```text
選項上限
API_SECRET
CHANNEL_SECRET
CHANNEL_ACCESS_TOKEN
DEFAULT_VOTE_STATUS
```

---

# 八、`系統設定`

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
| `TIMEZONE` | 日期及時間時區 | `Asia/Taipei` |
| `MAX_OPTIONS` | 所有投票共用選項上限 | `10` |
| `VOTE_ID_FORMAT` | 投票 ID 前綴格式 | `yyyyMM` |
| `SYSTEM_NAME` | 系統名稱 | `線上投票系統` |
| `DEFAULT_MARKDOWN_TITLE` | 新增投票預設題目 | 可空白 |
| `DEFAULT_OPTIONS` | 新增投票預設選項 | 可空白 |
| `DEFAULT_MULTI_SELECT` | 預設是否複選 | `否` |
| `DEFAULT_DEADLINE` | 預設截止日期 | 可空白 |

不得包含：

```text
DEFAULT_VOTE_STATUS
API_SECRET
CHANNEL_SECRET
CHANNEL_ACCESS_TOKEN
```

## 8.3 驗證

- `MAX_OPTIONS`：大於零的整數。
- `DEFAULT_MULTI_SELECT`：只能是 `是` 或 `否`。
- `DEFAULT_DEADLINE`：空白或 `YYYY-MM-DD`。
- `DEFAULT_OPTIONS`：每行一項、去除前後空白、忽略空白行、不得重複、不得超過 `MAX_OPTIONS`。
- `TIMEZONE`：有效時區。
- 必填設定：必須存在且非空白。
- 設定錯誤時停止操作並回傳錯誤。

---

# 九、`使用者`

## 9.1 欄位

```text
LINE User ID
顯示名稱
使用者狀態
備註
建立時間
```

## 9.2 欄位規則

| 欄位 | 建立時 | 後續 |
|---|---|---|
| LINE User ID | 經驗證的 User ID | 不變 |
| 顯示名稱 | 第一次取得 | 管理者維護 |
| 使用者狀態 | `停用` | 管理者維護 |
| 備註 | 系統提示 | 管理者維護 |
| 建立時間 | 程式填入 | 不變 |

新使用者：

```text
LINE User ID：經驗證的 User ID
顯示名稱：第一次取得的名稱；無名稱則使用 LINE User ID
使用者狀態：停用
備註：系統自動建立，請管理者確認
建立時間：程式記錄
```

既有使用者的顯示名稱、備註、建立時間及狀態不得由程式自動改變。

自動建立使用者時，必須在鎖定後重新讀取並確認不存在，才可新增。

---

# 十、使用者權限

## 10.1 未授權或停用使用者

可取得：

- 經驗證的 LINE User ID。
- 顯示名稱。
- 狀態。
- 聯絡管理者提示。

不可取得：

- 投票列表、題目、選項、票數及結果。
- 投票明細及列印資料。
- 黑名單或其他使用者資料。

## 10.2 `bootstrap`

停用或未授權不得直接回傳 `USER_DISABLED`；應回傳：

```javascript
{
  systemName: '線上投票系統',
  user: {
    userId: '經驗證的 LINE User ID',
    displayName: '顯示名稱',
    status: '停用',
    authorized: false
  },
  votes: []
}
```

前端依 `authorized` 及 `status` 顯示畫面。

## 10.3 啟用使用者

可：

- 查詢啟用投票。
- 查看題目、選項、票數、結果。
- 投票及修改自己的投票。
- 新增選項。
- 列印結果及完整明細。

不得取得停用投票、完整黑名單或不必要的其他使用者資料。

---

# 十一、`投票`

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

狀態只能是：

```text
啟用
停用
```

## 11.2 欄位責任

| 欄位 | 維護者 |
|---|---|
| 投票 ID | 程式 |
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

- 程式產生、不得重複。
- 管理者不需輸入。
- 前綴依 `VOTE_ID_FORMAT`。
- 同一前綴取目前最大序號加一。
- 序號至少三位。
- 依投票 ID 由新到舊排列。
- 產生時須鎖定，鎖定後重新讀取投票資料。

---

# 十三、投票選項

## 13.1 格式及限制

- 每行一項。
- 忽略空白行。
- 移除前後空白。
- 不得有完全相同選項。
- 數量不得超過 `MAX_OPTIONS`。
- 使用者只能新增，不能修改或刪除既有選項。
- 新選項附加於最後。
- 不記錄新增者及新增時間。

## 13.2 新增流程

```text
驗證 ID Token
→ 確認使用者啟用
→ 取得鎖定
→ 重新讀取設定及投票
→ 驗證投票啟用、未截止且不在黑名單
→ 重新解析選項
→ 檢查重複及 MAX_OPTIONS
→ 附加選項並寫入
→ finally 釋放鎖定
```

---

# 十四、截止日期與投票狀態

## 14.1 啟用投票

啟用投票可：

- 出現在投票列表。
- 由 `getVote` 查詢。
- 查看題目、選項、票數、投票人數及自己的紀錄。
- 在未截止時投票、修改投票及新增選項。
- 在已截止後查詢、查看結果及列印。

## 14.2 停用投票

停用投票不可：

- 出現在列表。
- 由網址查詢。
- 查看結果或明細。
- 列印。
- 投票、修改投票或新增選項。

## 14.3 新增投票

新增投票狀態固定為：

```text
停用
```

不得使用 `DEFAULT_VOTE_STATUS`。管理者確認後手動改為：

```text
啟用
```

---

# 十五、黑名單

## 15.1 格式

```text
Uxxxxxxxxxxxx
Uyyyyyyyyyyyy
```

每行一個 LINE User ID。

## 15.2 權限

黑名單只適用於單筆投票：

| 功能 | 黑名單使用者 |
|---|---|
| 查看啟用投票、題目、選項、票數及結果 | 可以 |
| 列印結果及明細 | 可以 |
| 投票 | 不可以 |
| 修改投票 | 不可以 |
| 新增選項 | 不可以 |

比對必須使用 LINE 官方驗證取得的 User ID，不得使用前端傳入資料或前端判斷結果。

---

# 十六、`投票紀錄`

## 16.1 欄位

```text
投票紀錄 ID
投票者顯示名稱
選擇的選項行號
選擇的選項內容快照
首次投票時間
最後修改時間
```

## 16.2 紀錄 ID

```text
投票ID::LINEUserID
```

例如：

```text
202607-001::Uxxxxxxxxxxxx
```

## 16.3 規則

- 同一使用者對同一投票只有一筆紀錄。
- 再次投票更新原紀錄。
- 首次投票時間不變。
- 最後修改時間更新。
- 不保留歷史版本。
- 查詢必須比對完整紀錄 ID。
- 新增及更新必須鎖定。
- 不得因重複提交建立第二筆紀錄。

欄位內容：

- 選項行號：JSON 陣列。
- 選項快照：JSON 陣列。
- 顯示名稱：建立或更新當下的後端認證名稱。
- 顯示名稱空白時，後端由紀錄 ID 的 `::` 後方取得 LINE User ID；前端不得自行處理。

---

# 十七、投票資料驗證

後端必須驗證：

- 投票 ID 存在。
- 使用者已啟用。
- 投票狀態為 `啟用`。
- 尚未截止。
- 使用者不在該投票黑名單。
- 選項行號為有效整數且不重複。
- 行號未超過有效選項數。
- 快照數量與行號數量一致。
- 每個行號與對應快照完全一致。
- 單選只能選一項。
- 複選至少選一項。
- 投票選項資料本身沒有異常。

異常時拒絕操作、不寫入、不猜測、不自動修正。

前端範例：

```javascript
{
  voteId: '202607-001',
  selectedIndexes: [1, 3],
  snapshots: ['方案 A', '方案 C']
}
```

後端必須確認：

```text
selectedIndexes[0] 對應 snapshots[0]
selectedIndexes[1] 對應 snapshots[1]
```

若前端載入後選項已新增或變更，必須拒絕並要求重新載入。

---

# 十八、結果與統計

## 18.1 `getVote` 資料

```javascript
{
  id: '202607-001',
  markdown: '...',
  markdownHtml: '...',
  options: ['方案 A', '方案 B'],
  multiSelect: false,
  deadline: '2026-07-31',
  status: '啟用',
  closed: false,
  canVote: true,
  canAddOption: true,
  counts: [12, 8],
  voterCount: 20,
  myRecord: {
    hasVoted: false,
    selectedIndexes: [],
    snapshots: [],
    createdAt: '',
    updatedAt: ''
  }
}
```

## 18.2 統計方式

票數必須依投票紀錄中的：

```text
選擇的選項行號
```

統計，不得依選項文字統計。

原因是快照可能保留舊文字，而新增選項不應改變既有行號意義。

黑名單使用者可查看啟用投票的票數及結果；已截止但仍啟用的投票仍可查詢及統計。

---

# 十九、列印與線上明細

## 19.1 移除線上明細

前端不提供：

- 明細按鈕。
- 明細頁面或表格。
- `getDetails`。
- `載入明細_()`。
- `renderDetails_()`。
- `currentDetails`。
- `detailsCache`。

## 19.2 保留列印

保留：

```text
列印按鈕
getPrintData
window.print()
```

列印內容包括：

- 系統名稱、投票 ID、Markdown 題目。
- 投票選項、各選項票數、投票人數。
- 投票者名稱、選項快照。
- 首次投票時間、最後修改時間。
- 截止日期、投票狀態、是否複選。

## 19.3 列印權限

- 未授權及停用使用者不得取得列印資料。
- 啟用使用者可以取得。
- 黑名單使用者仍可以取得。
- 停用投票不得列印。

## 19.4 列印流程

```text
點擊列印
→ 立即 window.open() 開啟空白視窗
→ 呼叫 getPrintData
→ 寫入完整列印 HTML
→ 關閉 document stream
→ 執行 window.print()
```

不得等待 API 完成後才開視窗。

API 失敗時：

- 關閉空白視窗。
- 原頁面顯示錯誤。
- 不留下空白列印視窗。

每次列印都必須重新呼叫 `getPrintData`，不得使用快取。

---

# 二十、新增投票

管理者執行：

```javascript
新增投票()
```

流程：

```text
取得鎖定
→ 重新讀取並驗證系統設定
→ 重新讀取投票工作表
→ 產生不重複投票 ID
→ 帶入 DEFAULT_MARKDOWN_TITLE
→ 帶入 DEFAULT_OPTIONS
→ 帶入 DEFAULT_MULTI_SELECT
→ 帶入 DEFAULT_DEADLINE
→ 狀態固定為停用
→ 黑名單留白
→ 寫入
→ finally 釋放鎖定
```

不得：

- 使用 `DEFAULT_VOTE_STATUS`。
- 新增欄位。
- 新增個別投票選項上限。
- 覆蓋既有資料。

---

# 二十一、前端狀態與快取

移除：

```javascript
resultCache
detailsCache
currentResult
currentDetails
```

不快取結果、明細或列印資料。

每次進入單筆投票頁面：

```text
getVote
→ 取得最新資料
→ 重新渲染
```

每次投票或修改：

```text
submitVote
→ 成功後 getVote
→ 重新渲染
```

不得只在前端標記已投票，也不得自行增減票數。

---

# 二十二、前端 Log

前端只保留一個全域函式：

```javascript
function frontLog_(event, data) {
  const record = {
    source: 'frontend',
    event,
    time: new Date().toISOString(),
    data: data || {}
  };

  console.info(
    '[投票系統]',
    event,
    JSON.stringify(record.data)
  );
}
```

不得在 `apiRequest_()` 或其他區域重複宣告。

可記錄：

- API 動作。
- Request ID。
- 執行時間及 HTTP 狀態。
- 投票 ID、操作類型、選項數量。

不得記錄：

- 完整 ID Token。
- 任何秘密。
- 不必要的個人敏感資料。

---

# 二十三、主要函式

主要入口：

```javascript
doGet(e)
doPost(e)
初始化系統()
新增投票()
```

等效功能必須包含：

```javascript
驗證IDToken_()
取得或建立使用者_()
建立新使用者_()
取得系統設定_()
驗證系統設定_()
取得投票列表資料_()
取得投票資料_()
儲存投票紀錄_()
新增投票選項_()
取得投票結果_()
取得投票明細_()
取得列印資料_()
建立API回應_()
建立API錯誤_()
```

函式名稱可調整，但不得省略：

- Token 驗證。
- 使用者權限。
- 投票狀態。
- 截止日期。
- 黑名單。
- 選項及快照驗證。
- 投票 ID、紀錄及新增選項鎖定。
- 統一 API 回應。

---

# 二十四、部署流程

## 24.1 GitHub Pages

1. 建立 Repository。
2. 上傳前端。
3. 啟用 GitHub Pages。
4. 取得 HTTPS 網址。
5. 設為 LIFF Endpoint URL。
6. 設定 `LIFF_ID`、`GAS_API_URL`。
7. 確認沒有秘密。
8. 測試載入。

## 24.2 LINE Developers

1. 建立或使用 LINE Login Channel。
2. 建立 LIFF App。
3. 設定 GitHub Pages Endpoint URL。
4. 取得 LIFF ID。
5. 測試 `liff.init()`、`liff.login()` 及 `liff.getIDToken()`。

## 24.3 GAS

1. 建立專案及 `Code.gs`。
2. 準備試算表。
3. 設定 `CHANNEL_ID`、`SPREADSHEET_ID`。
4. 執行 `初始化系統()`。
5. 確認四張工作表及標題正確。
6. 部署 Web App。
7. 設定執行身分及存取權限。
8. 取得 GAS API URL。
9. 填入前端設定。
10. 測試登入、查詢、投票及列印。

---

# 二十五、最終設定總表

## GitHub Pages

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

## 工作表

```text
系統設定
使用者
投票
投票紀錄
```

---

# 二十六、驗收總表

## 26.1 LIFF 與 API

- Endpoint URL 為 GitHub Pages，不是 GAS。
- `liff.init()`、登入及 ID Token 正常。
- LINE 內建瀏覽器、iOS、Android 可使用。
- GitHub Pages 可取得 GAS JSON。
- GET、POST、CORS 及表單空白解析正常。
- Token 失效會拒絕。
- API 符合統一回應格式。

## 26.2 身分與權限

- ID Token 由 LINE 官方驗證。
- 偽造 User ID、顯示名稱無法取得權限。
- 新使用者自動建立且狀態為停用。
- 既有名稱、備註、狀態及建立時間不被程式覆蓋。
- 停用或未授權使用者只能看狀態。
- 啟用使用者可取得啟用投票。
- 停用投票不可查詢。
- 黑名單可查看及列印，但不可投票、修改或新增選項。

## 26.3 工作表

- 四張工作表存在。
- 標題名稱、順序、數量正確。
- 無額外欄位。
- `使用者` 保留 `建立時間`。
- `投票` 不含 `建立時間`、`修改時間`、`新增者`、`新增時間` 或「選項上限」。
- 不存在所有禁止設定。
- 初始化不刪除資料、不覆蓋設定。
- 標題錯誤時停止。

## 26.4 投票與並發

- 新增投票狀態固定為停用。
- 投票 ID 不重複。
- 所有投票使用 `MAX_OPTIONS`。
- 空白及重複選項正確處理。
- 新選項只能附加。
- 並發新增不覆蓋資料。
- 並發投票不建立重複紀錄。
- 首次投票時間不變，修改時間更新。
- 鎖定後重新讀取及驗證。

## 26.5 日期與結果

- 日期格式及時區正確。
- 截止日當天可投票。
- 超過截止日不可投票、修改或新增選項。
- 已截止但啟用投票仍可查詢、查看票數及列印。
- 進入投票頁面必須重新呼叫 `getVote`。
- 票數依選項行號統計。
- 投票後重新呼叫 `getVote`。
- 前端不自行計算票數，也不使用結果快取。

## 26.6 列印與前端狀態

- 不存在線上明細頁面及 `getDetails`。
- `getResult` 已移除。
- `getPrintData` 每次重新取得資料。
- 列印包含規格要求的結果及完整明細。
- 列印前先開啟空白視窗。
- API 失敗會關閉空白視窗並顯示錯誤。
- 投票及新增選項期間顯示處理中。
- 操作期間不能重複提交。
- 新增選項後保留未送出勾選。
- 前端只有一個全域 `frontLog_()`。
- Log 不包含 Token 或秘密。

---

# 二十七、本次正式修訂摘要

1. 停用及未授權使用者由 `bootstrap` 回傳狀態資料，不直接拋錯。
2. 停用及未授權使用者不得取得投票內容。
3. 新增選項必須鎖定後重新讀取資料。
4. 修正並發新增選項覆蓋問題。
5. 修正表單 `+` 與空白解析。
6. 工作表標題檢查欄位數量及額外欄位。
7. `使用者` 工作表保留 `建立時間`。
8. `投票` 工作表不得有建立、修改及新增相關欄位。
9. 移除 `getResult`、`getDetails` 及線上明細。
10. `getVote` 整合票數、投票人數及個人紀錄。
11. 每次進入投票頁面重新查詢。
12. 投票成功後重新呼叫 `getVote`。
13. `submitVote` 可回傳最新 `vote`，但不取代 `getVote`。
14. 投票及新增選項加入處理中及防重複提交。
15. 每次列印重新取得資料。
16. 列印前先開啟空白視窗。
17. 移除結果、明細及列印快取。
18. 新增選項後保留未送出勾選。
19. 前端統一使用單一 `frontLog_()`。
20. 所有日期改以 `系統設定.TIMEZONE` 為正式規則。

---

# 二十八、待後續處理

1. 修改所有寫死的 `Asia/Taipei`。
2. 依本規格修改 GAS 後端。
3. 依本規格修改 GitHub Pages 前端。
4. 移除結果及明細狀態、頁面及按鈕。
5. 將 `getResult` 整合至 `getVote`。
6. 將完整明細保留至 `getPrintData`。
7. 實作投票後重新呼叫 `getVote`。
8. 實作投票及新增選項的處理中狀態與防重複提交。
9. 測試 LINE 內建瀏覽器、iOS、Android。
10. 測試 GitHub Pages、GAS 及 CORS。
11. 測試並發新增選項及並發投票。
12. 測試停用使用者資料隔離。
13. 測試黑名單權限。
14. 測試截止日及時區。
15. 測試列印 API 失敗時關閉空白視窗。
16. 測試錯誤工作表標題及異常資料拒絕操作。

