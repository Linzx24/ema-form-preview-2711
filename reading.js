'use strict';
const readingLink=new URLSearchParams(location.hash.slice(1)).get('read');
let readingKey, canRead=false, readingRequest=0, savedResult;
function bytesFromBase64(value){
 return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
}
async function decryptArticle(id){
 const bytes=bytesFromBase64(reviewReadingData[id]);
 return crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12)},readingKey,bytes.subarray(12));
}
async function checkReadingLink(){
 if(!/^[\w-]{43}$/.test(readingLink||''))return false;
 try{
  readingKey=await crypto.subtle.importKey('raw',bytesFromBase64(readingLink),'AES-GCM',false,['decrypt']);
  await decryptArticle(Object.keys(reviewReadingData)[0]);
  return true;
 }catch{return false}
}
async function openReading(card,forward=false){
 const attempt=++readingRequest;
 try{
  if(!canRead||page!=='result'||!state.surveyDetail?.submission.recommendations.includes(card))return;
  const raw=await decryptArticle(card.id);
  const item=JSON.parse(new TextDecoder().decode(raw));
  if(attempt!==readingRequest||page!=='result'||!state.surveyDetail?.submission.recommendations.includes(card))return;
  if(item.id!==card.id||item.title!==card.title||!item.articleBody)throw Error();
  const html=renderPartnerArticle({...item,duration:card.duration||item.duration});
  const record=root.querySelector('.survey-record-page');
  savedResult={nodes:[...root.childNodes],scroll:record.scrollTop,cardId:card.cardId};
  if(!forward)history.pushState({trial,view:'reading',cardId:card.cardId},'');
  page='reading';root.innerHTML=html;root.scrollTop=0;
  const title=root.querySelector('h1');title.tabIndex=-1;title.focus({preventScroll:true});
 }catch{if(attempt===readingRequest && page==='result')tell('正文未能打开','本篇练习未能载入，你可以返回查看其他推荐。')}
}
function restoreResult(){
 if(!savedResult)return;
 const {nodes,scroll,cardId}=savedResult;savedResult=null;page='result';
 root.replaceChildren(...nodes);
 root.querySelector('.survey-record-page').scrollTop=scroll;
 Array.from(root.querySelectorAll('[data-survey-open]')).find(x=>x.dataset.surveyOpen===cardId)?.focus({preventScroll:true});
}
