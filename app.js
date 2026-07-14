'use strict';

const state = {
  idToken: '',
  session: null,
  votes: [],
  currentVote: null,
  currentResult: null,
  currentDetails: null
};

document.addEventListener('DOMContentLoaded', function () {
  綁定事件_();
  初始化LIFF_();
});

function 綁定事件_() {
  document
    .getElementById('retry-button')
    .addEventListener('click', function () {
      window.location.reload();
    });

  document
    .getElementById('refresh-button')
    .addEventListener('click', 載入投票列表_);

  document
    .getElementById('back-list-button')
    .addEventListener('click', function () {
      顯示畫面_('vote-list-view');
    });

  document
    .getElementById('back-vote-button')
    .addEventListener('click', function () {
      顯示畫面_('vote-detail-view');
    });

  document
    .getElementById('back-vote-from-details-button')
    .addEventListener('click', function () {
      顯示畫面_('vote-detail-view');
    });

  document
    .getElementById('submit-vote-button')
    .addEventListener('click', 送出投票_);

  document
    .getElementById('add-option-button')
    .addEventListener('click', 顯示新增選項_);

  document
    .getElementById('result-button')
    .addEventListener('click', 載入結果_);

  document
    .getElementById('details-button')
    .addEventListener('click', 載入明細_);

  document
    .getElementById('print-button')
    .addEventListener('click', 列印投票_);
}

async function 初始化LIFF_() {
  try {
    顯示畫面_('loading-view');

    if (!window.APP_CONFIG || !APP_CONFIG.LIFF_ID) {
      throw new Error('尚未設定 LIFF_ID');
    }

    if (!APP_CONFIG.GAS_API_URL) {
      throw new Error('尚未設定 GAS_API_URL');
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

    const response = await apiRequest_('getSession', {});

    state.session = response;

    document.getElementById('system-name').textContent =
      response.user && response.user.displayName
        ? '線上投票系統'
        : '線上投票系統';

    document.getElementById('user-info').textContent =
      '使用者：' +
      (response.user.displayName || response.user.userId) +
      '｜狀態：' +
      response.user.status;

    if (!response.user.authorized) {
      document.getElementById('unauthorized-user-id').textContent =
        'LINE User ID：' + response.user.userId;

      顯示畫面_(
        response.user.status === '停用'
          ? 'disabled-view'
          : 'unauthorized-view'
      );

      return;
    }

    await 載入投票列表_();
  } catch (error) {
    顯示錯誤_(error.message || '初始化失敗');
  }
}

async function apiRequest_(action, payload) {
  const body = {
    action: action,
    idToken: state.idToken,
    payload: payload || {}
  };

  const response = await fetch(APP_CONFIG.GAS_API_URL, {
    method: 'POST',
    body: new URLSearchParams({
      payload: JSON.stringify(body)
    })
  });

  if (!response.ok) {
    throw new Error('API HTTP 錯誤：' + response.status);
  }

  const result = await response.json();

  if (!result.ok) {
    throw new Error(
      result.error && result.error.message
        ? result.error.message
        : 'API 操作失敗'
    );
  }

  return result.data;
}

async function 載入投票列表_() {
  try {
    顯示畫面_('loading-view');

    const data = await apiRequest_('getVotes', {});

    state.votes = data.votes || [];
    document.getElementById('system-name').textContent =
      data.systemName || '線上投票系統';

    renderVoteList_(state.votes);
    顯示畫面_('vote-list-view');
  } catch (error) {
    顯示錯誤_(error.message);
  }
}

function renderVoteList_(votes) {
  const container = document.getElementById('vote-list');
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
    title.innerHTML = vote.markdownHtml || escapeHtml_(vote.id);

    const meta = document.createElement('p');
    meta.textContent =
      vote.id +
      '｜' +
      (vote.multiSelect ? '複選' : '單選') +
      '｜截止日期：' +
      (vote.deadline || '無');

    const button = document.createElement('button');
    button.className = 'button';
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

async function 載入單筆投票_(voteId) {
  try {
    顯示畫面_('loading-view');

    const data = await apiRequest_('getVote', {
      voteId: voteId
    });

    state.currentVote = data.vote;

    renderVoteDetail_(data.vote);
    顯示畫面_('vote-detail-view');
  } catch (error) {
    顯示錯誤_(error.message);
  }
}

function renderVoteDetail_(vote) {
  const detail = document.getElementById('vote-detail');

  detail.innerHTML = `
    <h2>${escapeHtml_(vote.id)}</h2>
    <div class="markdown-content">
      ${vote.markdownHtml || ''}
    </div>

    <div class="vote-meta">
      <span class="badge">${vote.multiSelect ? '複選' : '單選'}</span>
      ${
        vote.closed
          ? '<span class="badge closed">已截止</span>'
          : '<span class="badge">投票進行中</span>'
      }
      <span>截止日期：${escapeHtml_(vote.deadline || '無')}</span>
    </div>
  `;

  const formArea = document.getElementById('vote-form-area');
  formArea.innerHTML = '';

  const form = document.createElement('div');

  vote.options.forEach(function (option, index) {
    const label = document.createElement('label');
    label.className = 'vote-option';

    const input = document.createElement('input');
    input.type = vote.multiSelect ? 'checkbox' : 'radio';
    input.name = 'vote-option';
    input.value = String(index + 1);
    input.dataset.snapshot = option;

    if (vote.closed) {
      input.disabled = true;
    }

    label.appendChild(input);
    label.appendChild(document.createTextNode(option));
    form.appendChild(label);
  });

  formArea.appendChild(form);

  document.getElementById('submit-vote-button').disabled =
    Boolean(vote.closed);

  document.getElementById('add-option-button').disabled =
    Boolean(vote.closed);
}

async function 送出投票_() {
  if (!state.currentVote) {
    return;
  }

  try {
    const inputs = Array.from(
      document.querySelectorAll(
        '#vote-form-area input[name="vote-option"]:checked'
      )
    );

    const selectedIndexes = inputs.map(function (input) {
      return Number(input.value);
    });

    const snapshots = inputs.map(function (input) {
      return input.dataset.snapshot;
    });

    const data = await apiRequest_('submitVote', {
      voteId: state.currentVote.id,
      selectedIndexes: selectedIndexes,
      snapshots: snapshots
    });

    顯示訊息_(data.message);
  } catch (error) {
    顯示訊息_(error.message, true);
  }
}

function 顯示新增選項_() {
  if (document.getElementById('new-option-box')) {
    return;
  }

  const box = document.createElement('div');
  box.id = 'new-option-box';
  box.className = 'add-option-box';

  box.innerHTML = `
    <input
      id="new-option-input"
      type="text"
      maxlength="200"
      placeholder="請輸入新選項"
    >
    <button id="save-option-button" class="button">
      儲存
    </button>
  `;

  document
    .getElementById('vote-form-area')
    .appendChild(box);

  document
    .getElementById('save-option-button')
    .addEventListener('click', 新增選項_);
}

async function 新增選項_() {
  const input = document.getElementById('new-option-input');
  const optionText = input.value.trim();

  if (!optionText) {
    顯示訊息_('請輸入選項內容', true);
    return;
  }

  try {
    const data = await apiRequest_('addOption', {
      voteId: state.currentVote.id,
      optionText: optionText
    });

    state.currentVote.options = data.options;
    renderVoteDetail_(state.currentVote);
    顯示訊息_('新增選項成功');
  } catch (error) {
    顯示訊息_(error.message, true);
  }
}

async function 載入結果_() {
  try {
    const data = await apiRequest_('getResult', {
      voteId: state.currentVote.id
    });

    state.currentResult = data;
    renderResult_(data);
    顯示畫面_('result-view');
  } catch (error) {
    顯示訊息_(error.message, true);
  }
}

function renderResult_(result) {
  const container = document.getElementById('result-content');
  const max = Math.max.apply(null, result.counts.concat([1]));

  let html = `
    <h2>投票結果：${escapeHtml_(result.voteId)}</h2>
    <div>${result.questionHtml || ''}</div>
    <p>投票人數：${result.voterCount}</p>
  `;

  result.options.forEach(function (option, index) {
    const count = result.counts[index] || 0;
    const width = Math.round((count / max) * 100);

    html += `
      <div class="result-row">
        <div class="result-label">
          ${index + 1}. ${escapeHtml_(option)}
        </div>
        <div class="result-bar-area">
          <div class="result-bar">
            <span style="width:${width}%"></span>
          </div>
        </div>
        <strong>${count}</strong>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function 載入明細_() {
  try {
    const data = await apiRequest_('getDetails', {
      voteId: state.currentVote.id
    });

    state.currentDetails = data;
    renderDetails_(data);
    顯示畫面_('details-view');
  } catch (error) {
    顯示訊息_(error.message, true);
  }
}

function renderDetails_(data) {
  const container = document.getElementById('details-content');

  let html = `
    <h2>投票明細：${escapeHtml_(data.voteId)}</h2>
    <table class="details-table">
      <thead>
        <tr>
          <th>投票者</th>
          <th>選擇內容</th>
          <th>首次投票時間</th>
          <th>最後修改時間</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.details.forEach(function (item) {
    html += `
      <tr>
        <td>${escapeHtml_(item.displayName)}</td>
        <td>${item.snapshots.map(escapeHtml_).join('<br>')}</td>
        <td>${escapeHtml_(item.createdAt)}</td>
        <td>${escapeHtml_(item.updatedAt)}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

async function 列印投票_() {
  try {
    const data = await apiRequest_('getPrintData', {
      voteId: state.currentVote.id
    });

    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      throw new Error('瀏覽器阻擋了列印視窗');
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="zh-Hant">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml_(data.vote.id)}</title>
        <style>
          body {
            font-family: sans-serif;
            padding: 24px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            padding: 8px;
            border: 1px solid #aaa;
            text-align: left;
          }
          .bar {
            height: 10px;
            background: #ddd;
          }
          .bar span {
            display: block;
            height: 100%;
            background: #1261a0;
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml_(data.systemName)}</h1>
        <h2>${escapeHtml_(data.vote.id)}</h2>
        <div>${data.vote.markdownHtml || ''}</div>
        <p>截止日期：${escapeHtml_(data.vote.deadline || '無')}</p>
        <p>投票人數：${data.result.voterCount}</p>

        <h2>結果</h2>
        <table>
          <thead>
            <tr>
              <th>選項</th>
              <th>票數</th>
            </tr>
          </thead>
          <tbody>
            ${data.result.options.map(function (option, index) {
              return `
                <tr>
                  <td>${index + 1}. ${escapeHtml_(option)}</td>
                  <td>${data.result.counts[index] || 0}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <h2>明細</h2>
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
            ${data.details.map(function (item) {
              return `
                <tr>
                  <td>${escapeHtml_(item.displayName)}</td>
                  <td>${item.snapshots.map(escapeHtml_).join('<br>')}</td>
                  <td>${escapeHtml_(item.createdAt)}</td>
                  <td>${escapeHtml_(item.updatedAt)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    顯示訊息_(error.message, true);
  }
}

function 顯示畫面_(id) {
  document.querySelectorAll('.view').forEach(function (view) {
    view.classList.add('hidden');
  });

  document.getElementById(id).classList.remove('hidden');
}

function 顯示錯誤_(message) {
  document.getElementById('error-message').textContent =
    message || '系統發生錯誤';

  顯示畫面_('error-view');
}

function 顯示訊息_(message, isError) {
  const element = document.getElementById('vote-message');

  element.textContent = message || '';
  element.classList.toggle('error-text', Boolean(isError));
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
