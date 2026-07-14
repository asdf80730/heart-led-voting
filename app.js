'use strict';

const state={
  idToken:'',
  session:null,
  votes:[],
  activeVotes:[],
  closedVotes:[],
  listMode:'active',
  searchText:'',
  currentVote:null,
  operationBusy:false
};

document.addEventListener('DOMContentLoaded',()=>{
  綁定事件_();
  初始化LIFF_();
});

/* =========================================================
 * 事件
 * ========================================================= */

function 綁定事件_(){
  綁定元素事件_('retry-button','click',重新登入_);
  綁定元素事件_('refresh-button','click',載入投票列表_);
  綁定元素事件_('submit-vote-button','click',送出投票_);
  綁定元素事件_('add-option-button','click',顯示新增選項_);
  綁定元素事件_('print-button','click',列印投票_);

  綁定元素事件_('active-votes-tab','click',()=>{
    state.listMode='active';
    更新投票分頁_();
  });

  綁定元素事件_('closed-votes-tab','click',()=>{
    state.listMode='closed';
    更新投票分頁_();
  });

  綁定元素事件_('vote-search-input','input',event=>{
    state.searchText=event.target.value.trim();
    更新投票分頁_();
  });

  綁定元素事件_('back-list-button','click',()=>{
    state.currentVote=null;
    state.operationBusy=false;
    移除新增選項區塊_();
    顯示訊息_('');
    更新投票分頁_();
    顯示畫面_('vote-list-view');
  });
}

function 綁定元素事件_(id,eventName,handler){
  const element=document.getElementById(id);
  if(element)element.addEventListener(eventName,handler);
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

    const session=await apiRequest_('bootstrap',{});

    state.session=session;
    設定投票資料_(session&&session.votes);
    更新系統及使用者資訊_(session);

    const user=session&&session.user||{};

    if(!user.authorized){
      顯示未授權畫面_(user);
      return;
    }

    更新投票分頁_();
    顯示畫面_('vote-list-view');

    frontLog_('bootstrap.completed',{
      voteCount:state.votes.length,
      activeCount:state.activeVotes.length,
      closedCount:state.closedVotes.length
    });
  }catch(error){
    frontLog_('bootstrap.failed',{message:error.message});
    顯示錯誤_(error.message||'初始化失敗');
  }
}

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

function 更新系統及使用者資訊_(data){
  const systemName=document.getElementById('system-name');
  const userInfo=document.getElementById('user-info');
  const oldUser=state.session&&state.session.user;
  const user=data&&data.user||oldUser||{};

  if(systemName)
    systemName.textContent=
      data&&data.systemName||
      state.session&&state.session.systemName||
      '線上投票系統';

  if(userInfo)
    userInfo.textContent=
      '使用者：'+(user.displayName||user.userId||'')+
      '｜狀態：'+(user.status||'');
}

function 顯示未授權畫面_(user){
  const id=user&&user.userId||'';
  const unauthorized=document.getElementById(
    'unauthorized-user-id'
  );
  const disabled=document.getElementById(
    'disabled-user-id'
  );

  if(unauthorized)
    unauthorized.textContent='LINE User ID：'+id;

  if(disabled)
    disabled.textContent='LINE User ID：'+id;

  顯示畫面_(
    user&&user.status==='停用'
      ?'disabled-view'
      :'unauthorized-view'
  );
}

/* =========================================================
 * API
 * ========================================================= */

async function apiRequest_(action,payload){
  const requestId=建立RequestId_();
  const start=performance.now();

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
      body:new URLSearchParams({
        payload:JSON.stringify(body)
      })
    });

    const result=await response.json();

    frontLog_('api.request.completed',{
      requestId,
      action,
      httpStatus:response.status,
      ok:result.ok,
      durationMs:Math.round(performance.now()-start)
    });

    if(!response.ok)
      throw new Error('API HTTP 錯誤：'+response.status);

    if(!result.ok)
      throw new Error(
        result.error&&result.error.message||
        'API 操作失敗'
      );

    return result.data;
  }catch(error){
    frontLog_('api.request.failed',{
      requestId,
      action,
      durationMs:Math.round(performance.now()-start),
      message:error.message
    });
    throw error;
  }
}

function 建立RequestId_(){
  if(window.crypto&&
    typeof window.crypto.randomUUID==='function'
  )
    return window.crypto.randomUUID();

  return Date.now().toString(36)+'-'+
    Math.random().toString(36).slice(2);
}

function frontLog_(event,data){
  console.info(
    '[投票系統]',
    event,
    JSON.stringify(data||{})
  );
}

/* =========================================================
 * 投票分類、截止判斷與搜尋
 * ========================================================= */

function 設定投票資料_(votes){
  state.votes=Array.isArray(votes)?votes:[];

  state.activeVotes=state.votes.filter(
    vote=>!是否已截止_(vote)
  );

  state.closedVotes=state.votes.filter(
    vote=>是否已截止_(vote)
  );
}

function 是否已截止_(vote){
  if(!vote)return true;

  if(
    vote.closed===true||
    vote.closed==='true'||
    vote.status==='已截止'||
    vote.status==='截止'
  )
    return true;

  const value=String(vote.deadline||'').trim();

  if(!value)return false;

  /*
   * YYYY-MM-DD 與 YYYY/MM/DD 視為當地日期的
   * 23:59:59 前有效，避免 UTC 轉換造成提前截止。
   */
  const date=value.match(
    /^(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})$/
  );

  if(date){
    const end=new Date(
      Number(date[1]),
      Number(date[2])-1,
      Number(date[3]),
      23,59,59,999
    );

    return Date.now()>end.getTime();
  }

  const timestamp=Date.parse(value);

  return !Number.isNaN(timestamp)&&
    Date.now()>timestamp;
}

function 搜尋投票_(votes){
  const keyword=state.searchText.toLowerCase();

  if(!keyword)return votes;

  return votes.filter(vote=>{
    const text=[
      vote.id,
      vote.markdown,
      vote.title,
      vote.subject,
      vote.name,
      清除Markdown格式_(vote.markdownHtml||'')
    ].join(' ').toLowerCase();

    return text.includes(keyword);
  });
}

function 更新投票分頁_(){
  const source=state.listMode==='closed'
    ?state.closedVotes
    :state.activeVotes;

  renderVoteList_(搜尋投票_(source));
  更新分頁樣式_();
}

function 更新分頁樣式_(){
  const active=document.getElementById(
    'active-votes-tab'
  );
  const closed=document.getElementById(
    'closed-votes-tab'
  );

  if(active)
    active.classList.toggle(
      'active',
      state.listMode==='active'
    );

  if(closed)
    closed.classList.toggle(
      'active',
      state.listMode==='closed'
    );
}

/* =========================================================
 * 首頁投票列表
 * ========================================================= */

async function 載入投票列表_(){
  try{
    state.currentVote=null;
    state.operationBusy=false;
    移除新增選項區塊_();
    顯示畫面_('loading-view');

    const data=await apiRequest_('getVotes',{});

    設定投票資料_(data&&data.votes);

    state.session=Object.assign(
      {},
      state.session||{},
      data||{},
      {
        user:data&&data.user||
          state.session&&state.session.user||
          {}
      }
    );

    更新系統及使用者資訊_(state.session);
    更新投票分頁_();
    顯示畫面_('vote-list-view');

    frontLog_('vote.list.loaded',{
      activeCount:state.activeVotes.length,
      closedCount:state.closedVotes.length
    });
  }catch(error){
    顯示錯誤_(error.message);
  }
}

function renderVoteList_(votes){
  const container=document.getElementById('vote-list');
  if(!container)return;

  container.innerHTML='';

  if(!votes.length){
    container.innerHTML=
      '<div class="message">'+
      (state.listMode==='closed'
        ?'目前沒有已截止的投票。'
        :'目前沒有進行中的投票。')+
      '</div>';
    return;
  }

  votes.forEach(vote=>{
    const item=document.createElement('article');
    const title=document.createElement('h3');
    const meta=document.createElement('p');
    const button=document.createElement('button');

    item.className='vote-item';
    title.textContent=取得首頁題目_(vote);

    meta.textContent=
      (vote.id||'')+'｜'+
      (vote.multiSelect?'複選':'單選')+
      '｜截止日期：'+(vote.deadline||'無');

    button.className='button';
    button.type='button';
    button.textContent='查看投票';
    button.addEventListener(
      'click',
      ()=>載入單筆投票_(vote.id)
    );

    item.append(title,meta,button);
    container.appendChild(item);
  });
}

function 取得首頁題目_(vote){
  const source=
    vote.markdown||
    vote.title||
    vote.subject||
    vote.name||
    vote.markdownHtml||
    vote.id||
    '';

  const firstLine=String(source)
    .replace(/\r\n/g,'\n')
    .replace(/\r/g,'\n')
    .split('\n')
    .map(line=>line.trim())
    .find(Boolean)||'';

  return 清除Markdown格式_(firstLine);
}

function 清除Markdown格式_(value){
  const element=document.createElement('div');

  element.innerHTML=String(value==null?'':value);

  return(element.textContent||element.innerText||'')
    .replace(/^\s{0,3}#{1,6}\s+/,'')
    .replace(/^\s{0,3}>\s?/,'')
    .replace(/^\s*[-*+]\s+/,'')
    .replace(/^\s*\d+[.)]\s+/,'')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
    .replace(/`([^`]+)`/g,'$1')
    .replace(/\*\*([^*]+)\*\*/g,'$1')
    .replace(/__([^_]+)__/g,'$1')
    .replace(/~~([^~]+)~~/g,'$1')
    .replace(/\*([^*]+)\*/g,'$1')
    .replace(/_([^_]+)_/g,'$1')
    .replace(/\s+/g,' ')
    .trim();
}

/* =========================================================
 * 單筆投票
 * ========================================================= */

async function 載入單筆投票_(voteId){
  try{
    state.operationBusy=false;
    移除新增選項區塊_();
    顯示畫面_('loading-view');

    const data=await apiRequest_('getVote',{voteId});

    if(!data||!data.vote)
      throw new Error('後端未回傳有效投票資料');

    state.currentVote=data.vote;
    renderVoteDetail_(state.currentVote);
    顯示畫面_('vote-detail-view');
  }catch(error){
    顯示錯誤_(error.message);
  }
}

function renderVoteDetail_(vote,preservedIndexes){
  const detail=document.getElementById('vote-detail');
  const formArea=document.getElementById('vote-form-area');

  if(!detail||!formArea)return;

  const record=vote.myRecord||{
    hasVoted:false,
    selectedIndexes:[],
    createdAt:'',
    updatedAt:''
  };

  const selectedIndexes=
    Array.isArray(preservedIndexes)
      ?preservedIndexes
      :Array.isArray(record.selectedIndexes)
        ?record.selectedIndexes
        :[];

  const options=Array.isArray(vote.options)
    ?vote.options
    :[];

  const counts=Array.isArray(vote.counts)
    ?vote.counts
    :[];

  const closed=是否已截止_(vote);
  const canVote=
    !closed&&
    vote.canVote!==false&&
    vote.blacklisted!==true;

  const status=closed
    ?'<span class="badge closed">已截止</span>'
    :'<span class="badge">投票進行中</span>';

  const recordHtml=record.hasVoted
    ?`
      <div class="my-vote-status voted">
        ✅ 你已經投過票<br>
        <small>
          首次投票：${escapeHtml_(record.createdAt)}<br>
          最後修改：${escapeHtml_(record.updatedAt)}
        </small>
      </div>
    `
    :`
      <div class="my-vote-status not-voted">
        ⭕ 你尚未投票
      </div>
    `;

  const blacklisted=vote.blacklisted
    ?`
      <p class="form-message error-text">
        你目前被列入本投票黑名單，
        只能查看及列印，不能投票或新增選項。
      </p>
    `
    :'';

  detail.innerHTML=`
    <h2>${escapeHtml_(vote.id)}</h2>
    <div class="markdown-content">
      ${vote.markdownHtml||
        escapeHtml_(vote.markdown||'')}
    </div>
    ${recordHtml}
    <div class="vote-meta">
      <span class="badge">
        ${vote.multiSelect?'複選':'單選'}
      </span>
      ${status}
      <span>截止日期：${escapeHtml_(
        vote.deadline||'無'
      )}</span>
      <span>投票人數：${escapeHtml_(
        vote.voterCount||0
      )}</span>
    </div>
    ${blacklisted}
  `;

  formArea.innerHTML='';

  const form=document.createElement('div');
  form.className='vote-options';

  options.forEach((option,index)=>{
    const number=index+1;
    const label=document.createElement('label');
    const input=document.createElement('input');
    const text=document.createElement('span');
    const count=document.createElement('span');

    label.className='vote-option';
    input.type=vote.multiSelect?'checkbox':'radio';
    input.name='vote-option';
    input.value=String(number);
    input.dataset.snapshot=String(option);
    input.checked=selectedIndexes.includes(number);
    input.disabled=!canVote;

    text.className='vote-option-label';
    text.textContent=option;

    count.className='vote-option-count';
    count.textContent=Number(counts[index]||0)+' 票';

    label.append(input,text,count);
    form.appendChild(label);
  });

  formArea.appendChild(form);

  const submit=document.getElementById(
    'submit-vote-button'
  );
  const add=document.getElementById(
    'add-option-button'
  );

  if(submit)
    submit.textContent=record.hasVoted
      ?'修改投票'
      :'送出投票';

  if(add)add.disabled=!canVote;

  同步投票操作狀態_();
  顯示訊息_('');
}

/* =========================================================
 * 投票操作
 * ========================================================= */

async function 送出投票_(){
  if(!state.currentVote)return;

  const submit=document.getElementById(
    'submit-vote-button'
  );

  if(submit&&submit.disabled)return;

  const inputs=Array.from(document.querySelectorAll(
    '#vote-form-area input[name="vote-option"]:checked'
  ));

  const selectedIndexes=inputs.map(
    input=>Number(input.value)
  );

  const snapshots=inputs.map(
    input=>input.dataset.snapshot||''
  );

  const voteId=state.currentVote.id;

  try{
    設定投票操作中_(true);
    顯示訊息_('正在送出投票，請稍候……');

    const data=await apiRequest_('submitVote',{
      voteId,
      selectedIndexes,
      snapshots
    });

    if(!data||!data.vote)
      throw new Error('後端未回傳更新後的投票資料');

    state.currentVote=data.vote;
    renderVoteDetail_(state.currentVote);
    顯示訊息_(data.message||'投票成功');

    frontLog_('vote.submit.completed',{
      voteId,
      operation:data.operation||''
    });
  }catch(error){
    顯示訊息_(error.message||'投票失敗',true);
    frontLog_('vote.submit.failed',{
      voteId,
      message:error.message
    });
  }finally{
    設定投票操作中_(false);
  }
}

function 設定投票操作中_(busy){
  state.operationBusy=Boolean(busy);
  同步投票操作狀態_();
}

function 同步投票操作狀態_(){
  const vote=state.currentVote;
  const busy=state.operationBusy;
  const closed=vote&&是否已截止_(vote);

  const submit=document.getElementById(
    'submit-vote-button'
  );
  const add=document.getElementById(
    'add-option-button'
  );
  const print=document.getElementById(
    'print-button'
  );

  const canVote=Boolean(
    vote&&
    !closed&&
    vote.canVote!==false&&
    vote.blacklisted!==true
  );

  const canAdd=Boolean(
    vote&&
    !closed&&
    vote.canAddOption!==false&&
    vote.blacklisted!==true
  );

  if(submit)
    submit.disabled=busy||!canVote;

  if(add)
    add.disabled=busy||!canAdd;

  if(print)
    print.disabled=busy||!vote;

  document.querySelectorAll(
    '#vote-form-area input[name="vote-option"]'
  ).forEach(input=>{
    input.disabled=busy||!canVote;
  });

  const save=document.getElementById(
    'save-option-button'
  );

  if(save)
    save.disabled=busy||!canAdd;
}

/* =========================================================
 * 新增選項
 * ========================================================= */

function 顯示新增選項_(){
  const vote=state.currentVote;

  if(!vote)return;

  if(
    state.operationBusy||
    是否已截止_(vote)||
    vote.canAddOption===false||
    vote.blacklisted===true
  ){
    顯示訊息_('目前無法新增選項',true);
    return;
  }

  if(document.getElementById('new-option-box'))
    return;

  const box=document.createElement('div');
  const input=document.createElement('input');
  const button=document.createElement('button');

  box.id='new-option-box';
  box.className='add-option-box';

  input.id='new-option-input';
  input.type='text';
  input.maxLength=200;
  input.placeholder='請輸入新選項';

  button.id='save-option-button';
  button.className='button';
  button.type='button';
  button.textContent='儲存';
  button.addEventListener('click',新增選項_);

  box.append(input,button);

  const area=document.getElementById(
    'vote-form-area'
  );

  if(area){
    area.appendChild(box);
    input.focus();
    同步投票操作狀態_();
  }
}

async function 新增選項_(){
  const vote=state.currentVote;
  const input=document.getElementById(
    'new-option-input'
  );
  const button=document.getElementById(
    'save-option-button'
  );

  if(!vote||!input||!button)return;

  const optionText=input.value.trim();

  if(!optionText){
    顯示訊息_('請輸入選項內容',true);
    return;
  }

  if(button.disabled)return;

  const voteId=vote.id;
  const preserved=取得目前勾選行號_();

  try{
    設定投票操作中_(true);
    button.textContent='新增中……';
    顯示訊息_('正在新增選項，請稍候……');

    const data=await apiRequest_('addOption',{
      voteId,
      optionText
    });

    if(!data||!Array.isArray(data.options))
      throw new Error('後端未回傳更新後的選項');

    const oldCounts=Array.isArray(vote.counts)
      ?vote.counts
      :[];

    state.currentVote=Object.assign({},vote,{
      options:data.options,
      counts:data.options.map(
        (_,index)=>oldCounts[index]||0
      )
    });

    renderVoteDetail_(state.currentVote,preserved);
    移除新增選項區塊_();
    顯示訊息_('新增選項成功');
  }catch(error){
    顯示訊息_(error.message||'新增選項失敗',true);
  }finally{
    設定投票操作中_(false);
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

    const styleUrl=new URL(
      'style.css',
      document.baseURI
    ).href;

    printWindow.document.open();
    printWindow.document.write(
      建立列印HTML_(data,styleUrl)
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }catch(error){
    if(printWindow&&!printWindow.closed)
      printWindow.close();

    顯示訊息_(error.message,true);
  }finally{
    設定投票操作中_(false);
  }
}

function 建立列印HTML_(data,styleUrl){
  const vote=data.vote||{};
  const result=data.result||{};
  const details=Array.isArray(data.details)
    ?data.details
    :[];

  const options=Array.isArray(result.options)
    ?result.options
    :Array.isArray(vote.options)
      ?vote.options
      :[];

  const counts=Array.isArray(result.counts)
    ?result.counts
    :[];

  const detailHtml=details.length
    ?details.map(item=>`
      <tr>
        <td>${escapeHtml_(
          item.displayName||item.userId||''
        )}</td>
        <td>${(Array.isArray(item.snapshots)
          ?item.snapshots
          :[]
        ).map(escapeHtml_).join('<br>')}</td>
        <td>${escapeHtml_(item.createdAt||'')}</td>
        <td>${escapeHtml_(item.updatedAt||'')}</td>
      </tr>
    `).join('')
    :`
      <tr>
        <td class="empty-cell" colspan="4">
          目前沒有投票明細
        </td>
      </tr>
    `;

  const resultHtml=options.length
    ?options.map((option,index)=>`
      <tr>
        <td>
          <span class="option-number">${index+1}</span>
          ${escapeHtml_(option)}
        </td>
        <td class="vote-count">
          ${Number(counts[index]||0)} 票
        </td>
      </tr>
    `).join('')
    :`
      <tr>
        <td class="empty-cell" colspan="2">
          目前沒有投票結果
        </td>
      </tr>
    `;

  const systemName=escapeHtml_(
    data.systemName||'線上投票系統'
  );
  const voteId=escapeHtml_(vote.id||'');

  return`
    <!DOCTYPE html>
    <html lang="zh-Hant">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport"
        content="width=device-width,initial-scale=1">
      <title>${voteId}｜${systemName}</title>
      <link rel="stylesheet"
        href="${escapeHtml_(styleUrl)}">
    </head>
    <body class="print-page">
      <main id="print-report-v2">
        <header class="print-report-header">
          <h1>${systemName}</h1>
          <p>投票結果與明細報告</p>
        </header>

        <section class="print-vote-heading">
          <h2>${voteId}</h2>
          <p>投票報告</p>
        </section>

        <div class="print-description">
          ${vote.markdownHtml||''}
        </div>

        <section class="print-summary">
          <div class="print-summary-card">
            <span>投票狀態</span>
            <strong>${escapeHtml_(vote.status||'')}</strong>
          </div>
          <div class="print-summary-card">
            <span>投票方式</span>
            <strong>${vote.multiSelect?'複選':'單選'}</strong>
          </div>
          <div class="print-summary-card">
            <span>截止日期</span>
            <strong>${escapeHtml_(vote.deadline||'無')}</strong>
          </div>
          <div class="print-summary-card">
            <span>投票人數</span>
            <strong>${Number(
              result.voterCount||vote.voterCount||0
            )}</strong>
          </div>
        </section>

        <section class="print-report-section">
          <h2>投票結果</h2>
          <table>
            <thead>
              <tr><th>選項</th><th>票數</th></tr>
            </thead>
            <tbody>${resultHtml}</tbody>
          </table>
        </section>

        <section class="print-report-section">
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
            <tbody>${detailHtml}</tbody>
          </table>
        </section>

        <footer class="print-report-footer">
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
  const element=document.getElementById(
    'error-message'
  );

  if(element)
    element.textContent=message||'系統發生錯誤';

  顯示畫面_('error-view');
}

function 顯示訊息_(message,isError){
  const element=document.getElementById(
    'vote-message'
  );

  if(!element)return;

  element.textContent=message||'';
  element.classList.toggle(
    'error-text',
    Boolean(isError)
  );
}

function escapeHtml_(value){
  return String(value==null?'':value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}
