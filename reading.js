'use strict';
const readingLink=new URLSearchParams(location.hash.slice(1)).get('read');
let readingKey, readingRequest=0, savedResult;
function bytesFromBase64(value){
 return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
}
async function openReading(card,forward=false){
 const attempt=++readingRequest;
 try{
  if(!readingLink){tell('打开练习','请使用带有阅读权限的完整试填链接打开。');return}
  readingKey??=crypto.subtle.importKey('raw',bytesFromBase64(readingLink),'AES-GCM',false,['decrypt']);
  const bytes=bytesFromBase64(reviewReadingData[card.id]);
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await readingKey,bytes.slice(12));
  const item=JSON.parse(new TextDecoder().decode(raw));
  if(attempt!==readingRequest||page!=='result'||!state.surveyDetail?.submission.recommendations.includes(card))return;
  if(item.id!==card.id||item.title!==card.title||!item.articleBody)throw Error();
  const html=renderPartnerArticle({...item,duration:card.duration||item.duration});
  const record=root.querySelector('.survey-record-page');
  savedResult={nodes:[...root.childNodes],scroll:record.scrollTop,cardId:card.cardId};
  if(!forward)history.pushState({view:'reading',cardId:card.cardId},'');
  page='reading';root.innerHTML=html;root.scrollTop=0;
  const title=root.querySelector('h1');title.tabIndex=-1;title.focus({preventScroll:true});
 }catch{if(attempt===readingRequest)tell('正文未能打开','请从完整的试填链接进入后再试。')}
}
function restoreResult(){
 if(!savedResult)return;
 const {nodes,scroll,cardId}=savedResult;savedResult=null;page='result';
 root.replaceChildren(...nodes);
 root.querySelector('.survey-record-page').scrollTop=scroll;
 Array.from(root.querySelectorAll('[data-survey-open]')).find(x=>x.dataset.surveyOpen===cardId)?.focus({preventScroll:true});
}
window.addEventListener('popstate',e=>{
 if(page==='reading'){restoreResult();return}
 if(page==='result'&&e.state?.view==='reading'){
   // Reuse the existing history entry when the reader goes forward.
   const card=state.surveyDetail?.submission.recommendations.find(x=>x.cardId===e.state.cardId);
   if(card)openReading(card,true);
 }
});
