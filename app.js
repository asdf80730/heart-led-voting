'use strict';

/*
 * 本檔案採用省 Token 的精簡排版方式：
 * 只壓縮排版，不刪除主要功能；
 * 保留基本可讀性與重要註解；
 * 不將程式完全壓成一行。
 */

const state={idToken:'',session:null,votes:[],currentVote:null,operationBusy:false};

document.addEventListener('DOMContentLoaded',()=>{
  綁定事件_();
  初始化LIFF_();
});

/* =========================================================
 * 事件
 * ========================================================= */

function 綁定事件_(){
  // 依使用者要求，維持省 Token 編排。
  綁定元素事件_('retry-button','click',重新登入_);
  綁定元素事件_('refresh-button','click',載入投票列表_);

  綁定元素事件_('back-list-button','click',()=>{
    state.currentVote=null;
    state.operationBusy=false;
    移除新增選項區塊_();
    顯示訊息_('');
    顯示畫面_('vote-list-view');
  });

  綁定元素事件_('submit-vote-button','click',送出投票_);
  綁定元素事件_('add-option-button','click',顯示新增選項_);
  綁定元素事件_('print-button','click',列印投票_);
}

function 綁定元素事件_(id,eventName,handler){
  const element=document.getElementById(id);
  if(element)element.addEventListener(eventName,handler);
}

/**
 * 錯誤頁面的「重新整理」按鈕：
 * 清除目前登入狀態，登出 LIFF，再重新登入以取得新的 ID Token。
 */
function 重新登入_(){
  state.idToken='';
  state.session=null;
  state.currentVote=null;
  state.operationBusy=false;

  try{
    if(!window.liff){
      window.location.reload();
      return;
    }

    if(liff.isLoggedIn())liff.logout();
    liff.login({redirectUri:window.location.href});
  }catch(error){
    frontLog_('liff.relogin.failed',{message:error.message});
    window.location.reload();
  }
}

/* =========================================================
 * LIFF 初始化
 * ========================================================= */

async function 初始化LIFF_(){
  try{
    顯示畫面_('loading-view');

    if(!window.APP_CONFIG||!APP_CONFIG.LIFF_ID)
      throw new Error('尚未設定 LIFF_ID');

    if(!APP_CONFIG.GAS_API_URL)
      throw new Error('尚未設定 GAS_API_URL');

    if(!window.liff)
      throw new Error('LIFF SDK 載入失敗');

    await liff.init({liffId:APP_CONFIG.LIFF_ID});

    if(!liff.isLoggedIn()){
      liff.login();
      return;
    }

    state.idToken=liff.getIDToken();

    if(!state.idToken)
      throw new Error('無法取得 LINE ID Token');

    frontLog_('bootstrap.start',{});

    const session=await apiRequest_('bootstrap',{});

    state.session=session;
    state.votes=Array.isArray(session.votes)?session.votes:[];
    state.currentVote=null;
    state.operationBusy=false;

    更新系統及使用者資訊_(session);

    const user=session.user||{};

    if(!user.authorized){
      顯示未授權畫面_(user);
      return;
    }

    renderVoteList_(state.votes);
    顯示畫面_('vote-list-view');

    frontLog_('bootstrap.completed',{voteCount:state.votes.length});
  }catch(error){
    frontLog_('bootstrap.failed',{message:error.message});
    顯示錯誤_(error.message||'初始化失敗');
  }
}

function 更新系統及使用者資訊_(data){
  const systemNameElement=document.getElementById('system-name');
  const userInfoElement=document.getElementById('user-info');

  /*
   * getVotes 可能沒有回傳 user。
   * 因此優先使用本次資料，沒有時沿用 bootstrap 的使用者資料。
   */
  const sessionUser=state.session&&state.session.user;
  const user=data&&data.user||sessionUser||{};

  if(systemNameElement)
    systemNameElement.textContent=
      data&&data.systemName||
      state.session&&state.session.systemName||
      '線上投票系統';

  if(userInfoElement)
    userInfoElement.textContent=
      '使用者：'+(user.displayName||user.userId||'')+
      '｜狀態：'+(user.status||'');
}

function 顯示未授權畫面_(user){
  const userIdElement=document.getElementById('unauthorized-user-id');
  const disabledUserIdElement=document.getElementById('disabled-user-id');
  const userId=user.userId||'';

  if(userIdElement)userIdElement.textContent='LINE User ID：'+userId;
  if(disabledUserIdElement)disabledUserIdElement.textContent='LINE User ID：'+userId;

  顯示畫面_(user.status==='停用'?'disabled-view':'unauthorized-view');
}

/* =========================================================
 * API 與 Log
 * ========================================================= */

async function apiRequest_(action,payload){
  const requestId=建立RequestId_();
  const startTime=performance.now();

  const body={
    action,
    idToken:state.idToken,
    requestId,
    payload:payload||{}
  };

  frontLog_('api.request.start',{requestId,action});

  try{
    const response=await fetch(APP_CONFIG.GAS_API_URL,{
      method:'POST',
      body:new URLSearchParams({payload:JSON.stringify(body)})
    });

    const result=await response.json();
    const durationMs=Math.round(performance.now()-startTime);

    frontLog_('api.request.completed',{
      requestId,
      action,
      httpStatus:response.status,
      ok:result.ok,
      durationMs,
      serverMs:result.meta?result.meta.durationMs||null:null
    });

    if(!response.ok)
      throw new Error('API HTTP 錯誤：'+response.status);

    if(!result.ok)
      throw new Error(
        result.error&&result.error.message
          ?result.error.message
          :'API 操作失敗'
      );

    return result.data;
  }catch(error){
    frontLog_('api.request.failed',{
      requestId,
      action,
      durationMs:Math.round(performance.now()-startTime),
      message:error.message
    });
    throw error;
  }
}

function 建立RequestId_(){
  if(window.crypto&&typeof window.crypto.randomUUID==='function')
    return window.crypto.randomUUID();

  return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
}

function frontLog_(event,data){
  const record={
    source:'frontend',
    event,
    time:new Date().toISOString(),
    data:data||{}
  };

  console.info('[投票系統]',event,JSON.stringify(record.data));
}

/* =========================================================
 * 投票列表
 * ========================================================= */

async function 載入投票列表_(){
  try{
    state.currentVote=null;
    state.operationBusy=false;
    移除新增選項區塊_();
    顯示畫面_('loading-view');

    const data=await apiRequest_('getVotes',{});

    state.votes=Array.isArray(data.votes)?data.votes:[];

    /*
     * getVotes 可能只回傳 votes。
     * 合併資料時保留 bootstrap 的 user 與 systemName，
     * 避免首頁重新整理後顯示「使用者：｜狀態：」。
     */
    state.session=Object.assign({},state.session||{},data,{
      user:data.user||
        state.session&&state.session.user||
        {}
    });

    更新系統及使用者資訊_(state.session);
    renderVoteList_(state.votes);
    顯示畫面_('vote-list-view');
  }catch(error){
    顯示錯誤_(error.message);
  }
}

function renderVoteList_(votes){
  const container=document.getElementById('vote-list');
  if(!container)return;

  container.innerHTML='';

  if(!votes.length){
    container.innerHTML='<div class="message">目前沒有啟用中的投票。</div>';
    return;
  }

  votes.forEach(vote=>{
    const item=document.createElement('article');
    item.className='vote-item';

    const title=document.createElement('h3');
    title.innerHTML=vote.markdownHtml||escapeHtml_(vote.id);

    const meta=document.createElement('p');
    meta.textContent=
      (vote.id||'')+'｜'+
      (vote.multiSelect?'複選':'單選')+
      '｜截止日期：'+(vote.deadline||'無');

    const button=document.createElement('button');
    button.className='button';
    button.type='button';
    button.textContent='查看投票';
    button.addEventListener('click',()=>載入單筆投票_(vote.id));

    item.append(title,meta,button);
    container.appendChild(item);
  });
}

/* =========================================================
 * 單筆投票
 * ========================================================= */

async function 載入單筆投票_(voteId){
  try{
    state.operationBusy=false;
    移除新增選項區塊_();
    顯示畫面_('loading-view');

    frontLog_('vote.load.start',{voteId});

    const data=await apiRequest_('getVote',{voteId});

    if(!data||!data.vote)
      throw new Error('後端未回傳有效投票資料');

    state.currentVote=data.vote;
    renderVoteDetail_(state.currentVote);
    顯示畫面_('vote-detail-view');

    frontLog_('vote.load.completed',{
      voteId,
      optionCount:Array.isArray(data.vote.options)
        ?data.vote.options.length
        :0
    });
  }catch(error){
    顯示錯誤_(error.message);
  }
}

function renderVoteDetail_(vote,preservedIndexes){
  const detail=document.getElementById('vote-detail');
  const formArea=document.getElementById('vote-form-area');

  if(!detail||!formArea)return;

  const myRecord=vote.myRecord||{
    hasVoted:false,
    selectedIndexes:[],
    snapshots:[],
    createdAt:'',
    updatedAt:''
  };

  const selectedIndexes=Array.isArray(preservedIndexes)
    ?preservedIndexes
    :Array.isArray(myRecord.selectedIndexes)
      ?myRecord.selectedIndexes
      :[];

  const counts=Array.isArray(vote.counts)?vote.counts:[];
  const options=Array.isArray(vote.options)?vote.options:[];

  const canVote=
    vote.closed!==true&&
    vote.canVote!==false&&
    vote.blacklisted!==true;

  const voteStatusHtml=myRecord.hasVoted
    ?`
      <div class="my-vote-status voted">
        ✅ 你已經投過票<br>
        <small>
          首次投票：${escapeHtml_(myRecord.createdAt)}<br>
          最後修改：${escapeHtml_(myRecord.updatedAt)}
        </small>
      </div>
    `
    :`
      <div class="my-vote-status not-voted">⭕ 你尚未投票</div>
    `;

  const statusHtml=vote.closed
    ?'<span class="badge closed">已截止</span>'
    :'<span class="badge">投票進行中</span>';

  const permissionHtml=vote.blacklisted
    ?`
      <p class="form-message error-text">
        你目前被列入本投票黑名單，只能查看及列印，不能投票或新增選項。
      </p>
    `
    :'';

  detail.innerHTML=`
    <h2>${escapeHtml_(vote.id)}</h2>
    <div class="markdown-content">${vote.markdownHtml||''}</div>
    ${voteStatusHtml}
    <div class="vote-meta">
      <span class="badge">${vote.multiSelect?'複選':'單選'}</span>
      ${statusHtml}
      <span>截止日期：${escapeHtml_(vote.deadline||'無')}</span>
      <span>投票人數：${escapeHtml_(vote.voterCount||0)}</span>
    </div>
    ${permissionHtml}
  `;

  formArea.innerHTML='';

  const form=document.createElement('div');
  form.className='vote-options';

  options.forEach((option,index)=>{
    const optionNumber=index+1;
    const count=Number(counts[index]||0);
    const label=document.createElement('label');
    const input=document.createElement('input');
    const optionLabel=document.createElement('span');
    const countElement=document.createElement('span');

    label.className='vote-option';

    input.type=vote.multiSelect?'checkbox':'radio';
    input.name='vote-option';
    input.value=String(optionNumber);
    input.dataset.snapshot=String(option);
    input.checked=selectedIndexes.indexOf(optionNumber)!==-1;
    input.disabled=!canVote;

    optionLabel.className='vote-option-label';
    optionLabel.textContent=option;

    countElement.className='vote-option-count';
    countElement.textContent=count+' 票';

    label.append(input,optionLabel,countElement);
    form.appendChild(label);
  });

  formArea.appendChild(form);

  const submitButton=document.getElementById('submit-vote-button');
  const addOptionButton=document.getElementById('add-option-button');

  if(submitButton)
    submitButton.textContent=myRecord.hasVoted?'修改投票':'送出投票';

  if(addOptionButton)addOptionButton.disabled=!canVote;

  同步投票操作狀態_();
  顯示訊息_('');
}

/* =========================================================
 * 投票送出
 * ========================================================= */

async function 送出投票_(){
  if(!state.currentVote)return;

  const submitButton=document.getElementById('submit-vote-button');

  if(submitButton&&submitButton.disabled)return;

  const voteId=state.currentVote.id;
  const inputs=Array.from(document.querySelectorAll(
    '#vote-form-area input[name="vote-option"]:checked'
  ));

  const selectedIndexes=inputs.map(input=>Number(input.value));
  const snapshots=inputs.map(input=>input.dataset.snapshot||'');

  try{
    設定投票操作中_(true);

    if(submitButton)submitButton.textContent='送出中……';

    顯示訊息_('正在送出投票，請稍候……');

    const data=await apiRequest_('submitVote',{
      voteId,
      selectedIndexes,
      snapshots
    });

    if(!data||!data.vote)
      throw new Error('後端未回傳更新後的投票資料');

    // 直接使用 submitVote 回傳資料，不再重新呼叫 getVote。
    state.currentVote=data.vote;
    renderVoteDetail_(state.currentVote);
    顯示訊息_(data.message||'投票成功');

    frontLog_('vote.submit.completed',{
      voteId,
      operation:data.operation||''
    });
  }catch(error){
    frontLog_('vote.submit.failed',{voteId,message:error.message});
    顯示訊息_(error.message||'投票失敗',true);
  }finally{
    設定投票操作中_(false);
  }
}

function 設定投票操作中_(isBusy){
  state.operationBusy=Boolean(isBusy);
  同步投票操作狀態_();
}

function 同步投票操作狀態_(){
  const vote=state.currentVote;
  const isBusy=state.operationBusy;

  const submitButton=document.getElementById('submit-vote-button');
  const addOptionButton=document.getElementById('add-option-button');
  const printButton=document.getElementById('print-button');

  const canVote=Boolean(
    vote&&
    vote.closed!==true&&
    vote.canVote!==false&&
    vote.blacklisted!==true
  );

  const canAddOption=Boolean(
    vote&&
    vote.closed!==true&&
    vote.canAddOption!==false&&
    vote.blacklisted!==true
  );

  if(submitButton){
    submitButton.disabled=isBusy||!canVote;

    if(isBusy)submitButton.textContent='處理中，請稍候……';
    else if(vote)
      submitButton.textContent=
        vote.myRecord&&vote.myRecord.hasVoted
          ?'修改投票'
          :'送出投票';
  }

  if(addOptionButton)addOptionButton.disabled=isBusy||!canAddOption;
  if(printButton)printButton.disabled=isBusy||!vote;

  document.querySelectorAll(
    '#vote-form-area input[name="vote-option"]'
  ).forEach(input=>{
    input.disabled=isBusy||!canVote;
  });

  const saveButton=document.getElementById('save-option-button');
  if(saveButton)saveButton.disabled=isBusy||!canAddOption;
}

async function 重新載入目前投票_(voteId){
  const data=await apiRequest_('getVote',{voteId});

  if(!data||!data.vote)
    throw new Error('後端未回傳有效投票資料');

  state.currentVote=data.vote;
  renderVoteDetail_(state.currentVote);
}

/* =========================================================
 * 新增選項
 * ========================================================= */

function 顯示新增選項_(){
  if(!state.currentVote)return;

  const vote=state.currentVote;
  const canAddOption=
    state.operationBusy!==true&&
    vote.closed!==true&&
    vote.canAddOption!==false&&
    vote.blacklisted!==true;

  if(!canAddOption){
    顯示訊息_('目前無法新增選項',true);
    return;
  }

  if(document.getElementById('new-option-box'))return;

  const box=document.createElement('div');
  box.id='new-option-box';
  box.className='add-option-box';

  const input=document.createElement('input');
  input.id='new-option-input';
  input.type='text';
  input.maxLength=200;
  input.placeholder='請輸入新選項';

  const saveButton=document.createElement('button');
  saveButton.id='save-option-button';
  saveButton.className='button';
  saveButton.type='button';
  saveButton.textContent='儲存';
  saveButton.addEventListener('click',新增選項_);

  box.append(input,saveButton);

  const formArea=document.getElementById('vote-form-area');

  if(formArea){
    formArea.appendChild(box);
    input.focus();
    同步投票操作狀態_();
  }
}

async function 新增選項_(){
  if(!state.currentVote)return;

  const input=document.getElementById('new-option-input');
  const saveButton=document.getElementById('save-option-button');

  if(!input||!saveButton)return;

  const optionText=input.value.trim();

  if(!optionText){
    顯示訊息_('請輸入選項內容',true);
    return;
  }

  if(saveButton.disabled)return;

  const voteId=state.currentVote.id;
  const preservedIndexes=取得目前勾選行號_();

  try{
    設定投票操作中_(true);
    saveButton.disabled=true;
    saveButton.textContent='新增中……';
    顯示訊息_('正在新增選項，請稍候……');

    const data=await apiRequest_('addOption',{
      voteId,
      optionText
    });

    if(!data||!Array.isArray(data.options))
      throw new Error('後端未回傳更新後的選項');

    // 保留原有票數，新增選項的票數從 0 開始。
    const oldCounts=Array.isArray(state.currentVote.counts)
      ?state.currentVote.counts
      :[];

    state.currentVote=Object.assign({},state.currentVote,{
      options:data.options,
      counts:data.options.map((_,index)=>oldCounts[index]||0)
    });

    renderVoteDetail_(state.currentVote,preservedIndexes);
    移除新增選項區塊_();
    顯示訊息_('新增選項成功');

    frontLog_('option.add.completed',{
      voteId,
      optionCount:data.options.length
    });
  }catch(error){
    frontLog_('option.add.failed',{voteId,message:error.message});
    顯示訊息_(error.message||'新增選項失敗',true);
  }finally{
    設定投票操作中_(false);

    const currentSaveButton=
      document.getElementById('save-option-button');

    if(currentSaveButton)currentSaveButton.textContent='新增選項';
    同步投票操作狀態_();
  }
}

function 取得目前勾選行號_(){
  return Array.from(document.querySelectorAll(
    '#vote-form-area input[name="vote-option"]:checked'
  )).map(input=>Number(input.value));
}

function 移除新增選項區塊_(){
  const box=document.getElementById('new-option-box');
  if(box)box.remove();
}

/* =========================================================
 * 列印
 * ========================================================= */

async function 列印投票_(){
  if(!state.currentVote||state.operationBusy)return;

  let printWindow=null;

  try{
    printWindow=window.open('','_blank');

    if(!printWindow)
      throw new Error('瀏覽器阻擋了列印視窗');

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

    設定投票操作中_(true);

    const data=await apiRequest_('getPrintData',{
      voteId:state.currentVote.id
    });

    printWindow.document.open();
    printWindow.document.write(建立列印HTML_(data));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();

    frontLog_('print.completed',{voteId:state.currentVote.id});
  }catch(error){
    if(printWindow&&!printWindow.closed)printWindow.close();

    frontLog_('print.failed',{
      voteId:state.currentVote?state.currentVote.id:'',
      message:error.message
    });

    顯示訊息_(error.message,true);
  }finally{
    設定投票操作中_(false);
  }
}

function 建立列印HTML_(data){
  const vote=data.vote||{};
  const result=data.result||{};
  const details=Array.isArray(data.details)?data.details:[];

  const options=Array.isArray(result.options)
    ?result.options
    :Array.isArray(vote.options)
      ?vote.options
      :[];

  const counts=Array.isArray(result.counts)?result.counts:[];

  const detailsHtml=details.length
    ?details.map(item=>{
      const snapshots=Array.isArray(item.snapshots)
        ?item.snapshots
        :[];

      return`
        <tr>
          <td>${escapeHtml_(item.displayName||item.userId||'')}</td>
          <td>${snapshots.map(escapeHtml_).join('<br>')}</td>
          <td>${escapeHtml_(item.createdAt||'')}</td>
          <td>${escapeHtml_(item.updatedAt||'')}</td>
        </tr>
      `;
    }).join('')
    :`
      <tr>
        <td class="empty-cell" colspan="4">目前沒有投票明細</td>
      </tr>
    `;

  const resultHtml=options.length
    ?options.map((option,index)=>`
      <tr>
        <td>
          <span class="option-number">${index+1}</span>
          ${escapeHtml_(option)}
        </td>
        <td class="vote-count">${Number(counts[index]||0)} 票</td>
      </tr>
    `).join('')
    :`
      <tr>
        <td class="empty-cell" colspan="2">目前沒有投票結果</td>
      </tr>
    `;

  const systemName=escapeHtml_(
    data.systemName||'線上投票系統'
  );

  const voteId=escapeHtml_(vote.id||'');
  const voteTitle=escapeHtml_(
    vote.title||vote.name||vote.subject||''
  );

  return`
    <!DOCTYPE html>
    <html lang="zh-Hant">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${voteId}｜${systemName}</title>

      <style>
        :root{
          color-scheme:light;
          --primary:#334e68;
          --primary-light:#eaf1f7;
          --text:#263238;
          --muted:#667085;
          --border:#d9e1e8;
          --line:#e7edf2;
          --surface:#ffffff;
          --background:#f5f7fa;
        }

        *{
          box-sizing:border-box;
        }

        body{
          margin:0;
          color:var(--text);
          background:var(--background);
          font-family:
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            "Noto Sans TC",
            "Microsoft JhengHei",
            sans-serif;
          line-height:1.7;
        }

        .page{
          width:min(100% - 32px,1100px);
          margin:32px auto;
        }

        .print-header{
          position:relative;
          overflow:hidden;
          color:#fff;
          background:
            linear-gradient(135deg,#243b53,#486581);
          border-radius:18px;
          padding:32px 36px;
          box-shadow:0 10px 28px rgba(36,59,83,.16);
        }

        .print-header::after{
          content:"";
          position:absolute;
          width:220px;
          height:220px;
          right:-70px;
          top:-100px;
          border:32px solid rgba(255,255,255,.1);
          border-radius:50%;
        }

        .system-name{
          position:relative;
          z-index:1;
          margin:0 0 10px;
          font-size:clamp(24px,4vw,36px);
          font-weight:800;
          letter-spacing:.04em;
        }

        .report-label{
          position:relative;
          z-index:1;
          margin:0;
          color:#d9e8f3;
          font-size:14px;
        }

        .vote-heading{
          margin:24px 0 16px;
        }

        .vote-id{
          margin:0;
          color:var(--primary);
          font-size:clamp(24px,4vw,32px);
          font-weight:800;
          letter-spacing:.03em;
        }

        .vote-title{
          margin:6px 0 0;
          color:var(--muted);
          font-size:16px;
        }

        .markdown-content{
          margin:20px 0;
          padding:20px 22px;
          background:var(--surface);
          border:1px solid var(--border);
          border-left:5px solid var(--primary);
          border-radius:12px;
        }

        .summary{
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:12px;
          margin:20px 0 28px;
        }

        .summary-item{
          min-height:86px;
          padding:14px 16px;
          background:var(--surface);
          border:1px solid var(--border);
          border-radius:12px;
        }

        .summary-label{
          display:block;
          margin-bottom:4px;
          color:var(--muted);
          font-size:13px;
        }

        .summary-value{
          display:block;
          color:var(--text);
          font-size:16px;
          font-weight:700;
        }

        .section{
          margin-top:28px;
          background:var(--surface);
          border:1px solid var(--border);
          border-radius:14px;
          overflow:hidden;
        }

        .section-title{
          display:flex;
          align-items:center;
          gap:10px;
          margin:0;
          padding:16px 20px;
          color:var(--primary);
          background:var(--primary-light);
          font-size:20px;
          font-weight:800;
        }

        .section-title::before{
          content:"";
          width:5px;
          height:22px;
          background:var(--primary);
          border-radius:5px;
        }

        table{
          width:100%;
          border-collapse:collapse;
          font-size:14px;
        }

        th{
          color:#40566d;
          background:#f1f5f8;
          font-weight:800;
          white-space:nowrap;
        }

        th,td{
          padding:13px 16px;
          border-bottom:1px solid var(--line);
          text-align:left;
          vertical-align:top;
        }

        tbody tr:last-child td{
          border-bottom:0;
        }

        tbody tr:nth-child(even){
          background:#fbfcfd;
        }

        tbody tr:hover{
          background:#f2f7fb;
        }

        .option-number{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          width:26px;
          height:26px;
          margin-right:8px;
          color:#fff;
          background:var(--primary);
          border-radius:50%;
          font-size:12px;
          font-weight:800;
        }

        .vote-count{
          color:var(--primary);
          font-weight:800;
          white-space:nowrap;
        }

        .empty-cell{
          padding:24px;
          color:var(--muted);
          text-align:center;
        }

        .print-footer{
          margin-top:24px;
          color:var(--muted);
          font-size:12px;
          text-align:right;
        }

        @media(max-width:720px){
          .page{
            width:min(100% - 20px,1100px);
            margin:16px auto;
          }

          .print-header{
            padding:24px;
            border-radius:14px;
          }

          .summary{
            grid-template-columns:repeat(2,minmax(0,1fr));
          }

          .section{
            overflow-x:auto;
          }

          table{
            min-width:620px;
          }
        }

        @media print{
          @page{
            size:A4;
            margin:14mm;
          }

          body{
            background:#fff;
          }

          .page{
            width:100%;
            margin:0;
          }

          .print-header{
            color:#000;
            background:#fff;
            border:2px solid var(--primary);
            box-shadow:none;
          }

          .print-header::after{
            display:none;
          }

          .report-label{
            color:var(--muted);
          }

          .section{
            break-inside:avoid;
            box-shadow:none;
          }

          .section-title{
            break-after:avoid;
          }

          thead{
            display:table-header-group;
          }

          tr{
            break-inside:avoid;
          }

          .print-footer{
            display:block;
          }
        }
      </style>
    </head>

    <body>
      <main class="page">
        <header class="print-header">
          <h1 class="system-name">${systemName}</h1>
          <p class="report-label">投票結果與明細報告</p>
        </header>

        <section class="vote-heading">
          <h2 class="vote-id">${voteId}</h2>
          ${voteTitle
            ?`<p class="vote-title">${voteTitle}</p>`
            :''
          }
        </section>

        <div class="markdown-content">
          ${vote.markdownHtml||''}
        </div>

        <section class="summary">
          <div class="summary-item">
            <span class="summary-label">投票狀態</span>
            <span class="summary-value">
              ${escapeHtml_(vote.status||'')}
            </span>
          </div>

          <div class="summary-item">
            <span class="summary-label">投票方式</span>
            <span class="summary-value">
              ${vote.multiSelect?'複選':'單選'}
            </span>
          </div>

          <div class="summary-item">
            <span class="summary-label">截止日期</span>
            <span class="summary-value">
              ${escapeHtml_(vote.deadline||'無')}
            </span>
          </div>

          <div class="summary-item">
            <span class="summary-label">投票人數</span>
            <span class="summary-value">
              ${Number(result.voterCount||vote.voterCount||0)}
            </span>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">投票結果</h2>

          <table>
            <thead>
              <tr>
                <th>選項</th>
                <th>票數</th>
              </tr>
            </thead>
            <tbody>${resultHtml}</tbody>
          </table>
        </section>

        <section class="section">
          <h2 class="section-title">投票明細</h2>

          <table>
            <thead>
              <tr>
                <th>投票者</th>
                <th>選擇內容</th>
                <th>首次投票時間</th>
                <th>最後修改時間</th>
              </tr>
            </thead>
            <tbody>${detailsHtml}</tbody>
          </table>
        </section>

        <footer class="print-footer">
          本頁由心之所向線上投票系統產生
        </footer>
      </main>
    </body>
    </html>
  `;
}

/* =========================================================
 * 畫面與工具
 * ========================================================= */

function 顯示畫面_(id){
  document.querySelectorAll('.view').forEach(view=>{
    view.classList.add('hidden');
  });

  const target=document.getElementById(id);
  if(target)target.classList.remove('hidden');
}

function 顯示錯誤_(message){
  const errorMessage=document.getElementById('error-message');

  if(errorMessage)
    errorMessage.textContent=message||'系統發生錯誤';

  顯示畫面_('error-view');
}

function 顯示訊息_(message,isError){
  const element=document.getElementById('vote-message');
  if(!element)return;

  element.textContent=message||'';
  element.classList.toggle('error-text',Boolean(isError));
}

function escapeHtml_(value){
  return String(value==null?'':value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}
