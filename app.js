'use strict';

const state = {
  idToken: '',
  session: null,
  votes: [],
  currentVote: null
};

document.addEventListener('DOMContentLoaded', function () {
  綁定事件_();
  初始化LIFF_();
});

/* =========================================================
 * 事件
 * ========================================================= */

function 綁定事件_() {
  綁定元素事件_('retry-button', 'click', function () {
    window.location.reload();
  });

  綁定元素事件_('refresh-button', 'click', 載入投票列表_);

  綁定元素事件_('back-list-button', 'click', function () {
    顯示畫面_('vote-list-view');
  });

  綁定元素事件_('submit-vote-button', 'click', 送出投票_);
  綁定元素事件_('add-option-button', 'click', 顯示新增選項_);
  綁定元素事件_('print-button', 'click', 列印投票_);
}

function 綁定元素事件_(id, eventName, handler) {
  const element = document.getElementById(id);

  if (element) {
    element.addEventListener(eventName, handler);
  }
}

/* =========================================================
 * LIFF 初始化
 * ========================================================= */

async function 初始化LIFF_() {
  try {
    顯示畫面_('loading-view');

    if (!window.APP_CONFIG || !APP_CONFIG.LIFF_ID) {
      throw new Error('尚未設定 LIFF_ID');
    }

    if (!APP_CONFIG.GAS_API_URL) {
      throw new Error('尚未設定 GAS_API_URL');
    }

    if (!window.liff) {
      throw new Error('LIFF SDK 載入失敗');
    }

    await liff.init({
      liffId: APP_CONFIG.LIFF_ID
    });

    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    state.idToken = liff.getIDToken();

    if (!state.idToken) {
      throw new Error('無法取得 LINE ID Token');
    }

    frontLog_('bootstrap.start', {});

    const session = await apiRequest_('bootstrap', {});

    state.session = session;
    state.votes = Array.isArray(session.votes)
      ? session.votes
      : [];

    更新系統及使用者資訊_(session);

    const user = session.user || {};

    if (!user.authorized) {
      顯示未授權畫面_(user);
      return;
    }

    renderVoteList_(state.votes);
    顯示畫面_('vote-list-view');

    frontLog_('bootstrap.completed', {
      voteCount: state.votes.length
    });
  } catch (error) {
    frontLog_('bootstrap.failed', {
      message: error.message
    });

    顯示錯誤_(error.message || '初始化失敗');
  }
}

function 更新系統及使用者資訊_(data) {
  const systemNameElement =
    document.getElementById('system-name');

  const userInfoElement =
    document.getElementById('user-info');

  const user = data.user || {};

  if (systemNameElement) {
    systemNameElement.textContent =
      data.systemName || '線上投票系統';
  }

  if (userInfoElement) {
    userInfoElement.textContent =
      '使用者：' +
      (user.displayName || user.userId || '') +
      '｜狀態：' +
      (user.status || '');
  }
}

function 顯示未授權畫面_(user) {
  const userIdElement =
    document.getElementById('unauthorized-user-id');

  const disabledUserIdElement =
    document.getElementById('disabled-user-id');

  const userId = user.userId || '';

  if (userIdElement) {
    userIdElement.textContent =
      'LINE User ID：' + userId;
  }

  if (disabledUserIdElement) {
    disabledUserIdElement.textContent =
      'LINE User ID：' + userId;
  }

  顯示畫面_(
    user.status === '停用'
      ? 'disabled-view'
      : 'unauthorized-view'
  );
}

/* =========================================================
 * API 與 Log
 * ========================================================= */

async function apiRequest_(action, payload) {
  const requestId = 建立RequestId_();
  const startTime = performance.now();

  const body = {
    action: action,
    idToken: state.idToken,
    requestId: requestId,
    payload: payload || {}
  };

  frontLog_('api.request.start', {
    requestId: requestId,
    action: action
  });

  try {
    const response = await fetch(
      APP_CONFIG.GAS_API_URL,
      {
        method: 'POST',
        body: new URLSearchParams({
          payload: JSON.stringify(body)
        })
      }
    );

    const result = await response.json();

    const durationMs = Math.round(
      performance.now() - startTime
    );

    frontLog_('api.request.completed', {
      requestId: requestId,
      action: action,
      httpStatus: response.status,
      ok: result.ok,
      durationMs: durationMs,
      serverMs: result.meta
        ? result.meta.durationMs || null
        : null
    });

    if (!response.ok) {
      throw new Error(
        'API HTTP 錯誤：' + response.status
      );
    }

    if (!result.ok) {
      throw new Error(
        result.error && result.error.message
          ? result.error.message
          : 'API 操作失敗'
      );
    }

    return result.data;
  } catch (error) {
    const durationMs = Math.round(
      performance.now() - startTime
    );

    frontLog_('api.request.failed', {
      requestId: requestId,
      action: action,
      durationMs: durationMs,
      message: error.message
    });

    throw error;
  }
}

function 建立RequestId_() {
  if (
    window.crypto &&
    typeof window.crypto.randomUUID === 'function'
  ) {
    return window.crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2)
  );
}

function frontLog_(event, data) {
  const record = {
    source: 'frontend',
    event: event,
    time: new Date().toISOString(),
    data: data || {}
  };

  console.info(
    '[投票系統]',
    event,
    JSON.stringify(record.data)
  );
}

/* =========================================================
 * 投票列表
 * ========================================================= */

async function 載入投票列表_() {
  try {
    顯示畫面_('loading-view');

    const data = await apiRequest_('getVotes', {});

    state.votes = Array.isArray(data.votes)
      ? data.votes
      : [];

    更新系統及使用者資訊_(data);
    renderVoteList_(state.votes);
    顯示畫面_('vote-list-view');
  } catch (error) {
    顯示錯誤_(error.message);
  }
}

function renderVoteList_(votes) {
  const container =
    document.getElementById('vote-list');

  if (!container) {
    return;
  }

  container.innerHTML = '';

  if (!votes.length) {
    container.innerHTML =
      '<div class="message">目前沒有啟用中的投票。</div>';

    return;
  }

  votes.forEach(function (vote) {
    const item = document.createElement('article');
    item.className = 'vote-item';

    const title = document.createElement('h3');
    title.innerHTML =
      vote.markdownHtml || escapeHtml_(vote.id);

    const meta = document.createElement('p');
    meta.textContent =
      (vote.id || '') +
      '｜' +
      (vote.multiSelect ? '複選' : '單選') +
      '｜截止日期：' +
      (vote.deadline || '無');

    const button = document.createElement('button');
    button.className = 'button';
    button.type = 'button';
    button.textContent = '查看投票';

    button.addEventListener('click', function () {
      載入單筆投票_(vote.id);
    });

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(button);
    container.appendChild(item);
  });
}

/* =========================================================
 * 單筆投票
 * ========================================================= */

async function 載入單筆投票_(voteId) {
  try {
    顯示畫面_('loading-view');

    frontLog_('vote.load.start', {
      voteId: voteId
    });

    const data = await apiRequest_(
      'getVote',
      {
        voteId: voteId
      }
    );

    if (!data || !data.vote) {
      throw new Error('後端未回傳有效投票資料');
    }

    state.currentVote = data.vote;

    renderVoteDetail_(state.currentVote);
    顯示畫面_('vote-detail-view');

    frontLog_('vote.load.completed', {
      voteId: voteId,
      optionCount: Array.isArray(data.vote.options)
        ? data.vote.options.length
        : 0
    });
  } catch (error) {
    顯示錯誤_(error.message);
  }
}

function renderVoteDetail_(vote, preservedIndexes) {
  const detail =
    document.getElementById('vote-detail');

  const formArea =
    document.getElementById('vote-form-area');

  if (!detail || !formArea) {
    return;
  }

  const myRecord = vote.myRecord || {
    hasVoted: false,
    selectedIndexes: [],
    snapshots: [],
    createdAt: '',
    updatedAt: ''
  };

  const selectedIndexes = Array.isArray(
    preservedIndexes
  )
    ? preservedIndexes
    : Array.isArray(myRecord.selectedIndexes)
      ? myRecord.selectedIndexes
      : [];

  const counts = Array.isArray(vote.counts)
    ? vote.counts
    : [];

  const options = Array.isArray(vote.options)
    ? vote.options
    : [];

  const canVote =
    vote.closed !== true &&
    vote.canVote !== false &&
    vote.blacklisted !== true;

  const voteStatusHtml = myRecord.hasVoted
    ? `
      <div class="my-vote-status voted">
        ✅ 你已經投過票
        <br>
        <small>
          首次投票：
          ${escapeHtml_(myRecord.createdAt)}
          <br>
          最後修改：
          ${escapeHtml_(myRecord.updatedAt)}
        </small>
      </div>
    `
    : `
      <div class="my-vote-status not-voted">
        ⭕ 你尚未投票
      </div>
    `;

  const statusHtml = vote.closed
    ? '<span class="badge closed">已截止</span>'
    : '<span class="badge">投票進行中</span>';

  const permissionHtml = vote.blacklisted
    ? `
      <p class="form-message error-text">
        你目前被列入本投票黑名單，只能查看及列印，不能投票或新增選項。
      </p>
    `
    : '';

  detail.innerHTML = `
    <h2>${escapeHtml_(vote.id)}</h2>

    <div class="markdown-content">
      ${vote.markdownHtml || ''}
    </div>

    ${voteStatusHtml}

    <div class="vote-meta">
      <span class="badge">
        ${vote.multiSelect ? '複選' : '單選'}
      </span>

      ${statusHtml}

      <span>
        截止日期：
        ${escapeHtml_(vote.deadline || '無')}
      </span>

      <span>
        投票人數：
        ${escapeHtml_(vote.voterCount || 0)}
      </span>
    </div>

    ${permissionHtml}
  `;

  formArea.innerHTML = '';

  const form = document.createElement('div');
  form.className = 'vote-options';

  options.forEach(function (option, index) {
    const optionNumber = index + 1;
    const count = Number(counts[index] || 0);

    const label = document.createElement('label');
    label.className = 'vote-option';

    const input = document.createElement('input');

    input.type = vote.multiSelect
      ? 'checkbox'
      : 'radio';

    input.name = 'vote-option';
    input.value = String(optionNumber);
    input.dataset.snapshot = String(option);
    input.checked =
      selectedIndexes.indexOf(optionNumber) !== -1;
    input.disabled = !canVote;

    const optionLabel =
      document.createElement('span');

    optionLabel.className = 'vote-option-label';
    optionLabel.textContent = option;

    const countElement =
      document.createElement('span');

    countElement.className = 'vote-option-count';
    countElement.textContent = count + ' 票';

    label.appendChild(input);
    label.appendChild(optionLabel);
    label.appendChild(countElement);
    form.appendChild(label);
  });

  formArea.appendChild(form);

  const submitButton =
    document.getElementById('submit-vote-button');

  const addOptionButton =
    document.getElementById('add-option-button');

  if (submitButton) {
    submitButton.disabled = !canVote;
    submitButton.textContent =
      myRecord.hasVoted
        ? '修改投票'
        : '送出投票';
  }

  if (addOptionButton) {
    addOptionButton.disabled = !canVote;
  }

  顯示訊息_('');
}

/* =========================================================
 * 投票送出
 * ========================================================= */

async function 送出投票_() {
  if (!state.currentVote) {
    return;
  }

  const submitButton =
    document.getElementById('submit-vote-button');

  if (
    submitButton &&
    submitButton.disabled
  ) {
    return;
  }

  const voteId = state.currentVote.id;

  const inputs = Array.from(
    document.querySelectorAll(
      '#vote-form-area input[name="vote-option"]:checked'
    )
  );

  const selectedIndexes = inputs.map(function (input) {
    return Number(input.value);
  });

  const snapshots = inputs.map(function (input) {
    return input.dataset.snapshot || '';
  });

  try {
    設定投票操作中_(true);

    if (submitButton) {
      submitButton.textContent = '送出中……';
    }

    顯示訊息_('正在送出投票，請稍候……');

    const data = await apiRequest_(
      'submitVote',
      {
        voteId: voteId,
        selectedIndexes: selectedIndexes,
        snapshots: snapshots
      }
    );

    if (!data || !data.vote) {
      throw new Error(
        '後端未回傳更新後的投票資料'
      );
    }

    // 直接使用 submitVote 回傳資料，不再重新呼叫 getVote
    state.currentVote = data.vote;

    renderVoteDetail_(
      state.currentVote
    );

    顯示訊息_(
      data.message || '投票成功'
    );

    frontLog_('vote.submit.completed', {
      voteId: voteId,
      operation: data.operation || ''
    });
  } catch (error) {
    frontLog_('vote.submit.failed', {
      voteId: voteId,
      message: error.message
    });

    顯示訊息_(
      error.message || '投票失敗',
      true
    );
  } finally {
    設定投票操作中_(false);
  }
}

function 設定投票操作中_(isBusy) {
  const submitButton =
    document.getElementById('submit-vote-button');

  const addOptionButton =
    document.getElementById('add-option-button');

  if (submitButton) {
    submitButton.disabled = isBusy;

    if (isBusy) {
      submitButton.textContent =
        '處理中，請稍候……';
    }
  }

  if (addOptionButton) {
    addOptionButton.disabled = isBusy;
  }

  document
    .querySelectorAll(
      '#vote-form-area input[name="vote-option"]'
    )
    .forEach(function (input) {
      input.disabled = isBusy;
    });
}

async function 重新載入目前投票_(voteId) {
  const data = await apiRequest_(
    'getVote',
    {
      voteId: voteId
    }
  );

  if (!data || !data.vote) {
    throw new Error('後端未回傳有效投票資料');
  }

  state.currentVote = data.vote;
  renderVoteDetail_(state.currentVote);
}

/* =========================================================
 * 新增選項
 * ========================================================= */

function 顯示新增選項_() {
  if (
    document.getElementById('new-option-box')
  ) {
    return;
  }

  const box = document.createElement('div');
  box.id = 'new-option-box';
  box.className = 'add-option-box';

  const input = document.createElement('input');
  input.id = 'new-option-input';
  input.type = 'text';
  input.maxLength = 200;
  input.placeholder = '請輸入新選項';

  const saveButton =
    document.createElement('button');

  saveButton.id = 'save-option-button';
  saveButton.className = 'button';
  saveButton.type = 'button';
  saveButton.textContent = '儲存';

  saveButton.addEventListener('click', 新增選項_);

  box.appendChild(input);
  box.appendChild(saveButton);

  const formArea =
    document.getElementById('vote-form-area');

  if (formArea) {
    formArea.appendChild(box);
    input.focus();
  }
}

async function 新增選項_() {
  if (!state.currentVote) {
    return;
  }

  const input =
    document.getElementById('new-option-input');

  const saveButton =
    document.getElementById('save-option-button');

  if (!input || !saveButton) {
    return;
  }

  const optionText = input.value.trim();

  if (!optionText) {
    顯示訊息_('請輸入選項內容', true);
    return;
  }

  if (saveButton.disabled) {
    return;
  }

  const voteId = state.currentVote.id;
  const preservedIndexes =
    取得目前勾選行號_();

  try {
    設定投票操作中_(true);

    saveButton.disabled = true;
    saveButton.textContent = '新增中……';

    顯示訊息_('正在新增選項，請稍候……');

    const data = await apiRequest_(
      'addOption',
      {
        voteId: voteId,
        optionText: optionText
      }
    );

    if (
      !data ||
      !Array.isArray(data.options)
    ) {
      throw new Error(
        '後端未回傳更新後的選項'
      );
    }

    // 不再呼叫重新載入目前投票
    const oldCounts =
      Array.isArray(state.currentVote.counts)
        ? state.currentVote.counts
        : [];

    state.currentVote = Object.assign(
      {},
      state.currentVote,
      {
        options: data.options,
        counts: data.options.map(function (_, index) {
          return oldCounts[index] || 0;
        })
      }
    );

    renderVoteDetail_(
      state.currentVote,
      preservedIndexes
    );

    input.value = '';

    顯示訊息_('新增選項成功');

    frontLog_('option.add.completed', {
      voteId: voteId,
      optionCount: data.options.length
    });
  } catch (error) {
    frontLog_('option.add.failed', {
      voteId: voteId,
      message: error.message
    });

    顯示訊息_(
      error.message || '新增選項失敗',
      true
    );
  } finally {
    設定投票操作中_(false);

    saveButton.disabled = false;
    saveButton.textContent = '新增選項';
  }
}

function 取得目前勾選行號_() {
  return Array.from(
    document.querySelectorAll(
      '#vote-form-area input[name="vote-option"]:checked'
    )
  ).map(function (input) {
    return Number(input.value);
  });
}

/* =========================================================
 * 列印
 * ========================================================= */

async function 列印投票_() {
  if (!state.currentVote) {
    return;
  }

  let printWindow = null;

  try {
    printWindow = window.open('', '_blank');

    if (!printWindow) {
      throw new Error('瀏覽器阻擋了列印視窗');
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="zh-Hant">
      <head>
        <meta charset="UTF-8">
        <title>正在準備列印</title>
      </head>
      <body>
        <p>正在取得最新列印資料，請稍候……</p>
      </body>
      </html>
    `);

    printWindow.document.close();

    const data = await apiRequest_(
      'getPrintData',
      {
        voteId: state.currentVote.id
      }
    );

    printWindow.document.open();
    printWindow.document.write(
      建立列印HTML_(data)
    );
    printWindow.document.close();

    printWindow.focus();
    printWindow.print();

    frontLog_('print.completed', {
      voteId: state.currentVote.id
    });
  } catch (error) {
    if (printWindow && !printWindow.closed) {
      printWindow.close();
    }

    frontLog_('print.failed', {
      voteId: state.currentVote
        ? state.currentVote.id
        : '',
      message: error.message
    });

    顯示訊息_(error.message, true);
  }
}

function 建立列印HTML_(data) {
  const vote = data.vote || {};
  const result = data.result || {};
  const details = Array.isArray(data.details)
    ? data.details
    : [];

  const options = Array.isArray(result.options)
    ? result.options
    : Array.isArray(vote.options)
      ? vote.options
      : [];

  const counts = Array.isArray(result.counts)
    ? result.counts
    : [];

  const detailsHtml = details.map(function (item) {
    const snapshots = Array.isArray(
      item.snapshots
    )
      ? item.snapshots
      : [];

    return `
      <tr>
        <td>${escapeHtml_(
          item.displayName || item.userId || ''
        )}</td>
        <td>
          ${snapshots.map(escapeHtml_).join('<br>')}
        </td>
        <td>${escapeHtml_(
          item.createdAt || ''
        )}</td>
        <td>${escapeHtml_(
          item.updatedAt || ''
        )}</td>
      </tr>
    `;
  }).join('');

  const resultHtml = options.map(function (
    option,
    index
  ) {
    return `
      <tr>
        <td>
          ${index + 1}. ${escapeHtml_(option)}
        </td>
        <td>${Number(counts[index] || 0)} 票</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="zh-Hant">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml_(
        vote.id || '投票結果'
      )}</title>
      <style>
        body {
          color: #202124;
          background: #ffffff;
          font-family:
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            "Noto Sans TC",
            sans-serif;
          line-height: 1.7;
          padding: 24px;
        }

        h1,
        h2 {
          line-height: 1.4;
        }

        table {
          width: 100%;
          margin: 12px 0 24px;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 8px;
          border: 1px solid #bfc7d1;
          text-align: left;
          vertical-align: top;
        }

        th {
          background: #f3f6f9;
        }

        .meta {
          color: #4b5563;
        }

        .markdown-content {
          line-height: 1.8;
        }

        @media print {
          body {
            padding: 0;
          }

          tr,
          h2 {
            break-inside: avoid;
          }
        }
      </style>
    </head>

    <body>
      <h1>${escapeHtml_(
        data.systemName || '線上投票系統'
      )}</h1>

      <h2>${escapeHtml_(vote.id || '')}</h2>

      <div class="markdown-content">
        ${vote.markdownHtml || ''}
      </div>

      <div class="meta">
        <p>投票狀態：${escapeHtml_(
          vote.status || ''
        )}</p>
        <p>投票方式：${
          vote.multiSelect ? '複選' : '單選'
        }</p>
        <p>截止日期：${escapeHtml_(
          vote.deadline || '無'
        )}</p>
        <p>投票人數：${Number(
          result.voterCount || vote.voterCount || 0
        )}</p>
      </div>

      <h2>投票結果</h2>

      <table>
        <thead>
          <tr>
            <th>選項</th>
            <th>票數</th>
          </tr>
        </thead>
        <tbody>
          ${resultHtml}
        </tbody>
      </table>

      <h2>投票明細</h2>

      <table>
        <thead>
          <tr>
            <th>投票者</th>
            <th>選擇內容</th>
            <th>首次投票時間</th>
            <th>最後修改時間</th>
          </tr>
        </thead>
        <tbody>
          ${detailsHtml}
        </tbody>
      </table>
    </body>
    </html>
  `;
}

/* =========================================================
 * 畫面與工具
 * ========================================================= */

function 顯示畫面_(id) {
  document
    .querySelectorAll('.view')
    .forEach(function (view) {
      view.classList.add('hidden');
    });

  const target = document.getElementById(id);

  if (target) {
    target.classList.remove('hidden');
  }
}

function 顯示錯誤_(message) {
  const errorMessage =
    document.getElementById('error-message');

  if (errorMessage) {
    errorMessage.textContent =
      message || '系統發生錯誤';
  }

  顯示畫面_('error-view');
}

function 顯示訊息_(message, isError) {
  const element =
    document.getElementById('vote-message');

  if (!element) {
    return;
  }

  element.textContent = message || '';
  element.classList.toggle(
    'error-text',
    Boolean(isError)
  );
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
