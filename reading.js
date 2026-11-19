'use strict';
const readingLink=new URLSearchParams(location.hash.slice(1)).get('read');
let readingKey, canRead=false, readingRequest=0, savedResult;
const sessionVotes=new Map();
function questionnaireRatings(){
 const ratings=new Map();
 const cutoff=Date.now()-research.feedbackWindowDays*86400000;
 const votes=[...sessionVotes.values()].filter(v=>v.openedAt>cutoff).sort((a,b)=>b.openedAt-a.openedAt);
 for(const vote of votes){
  if(!ratings.has(vote.id))ratings.set(vote.id,[]);
  ratings.get(vote.id).push(vote.label);
 }
 return ratings;
}
function bindReadingFeedback(card){
 const panel=root.querySelector('.content-feedback-panel');
 panel.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  const status=panel.querySelector('[data-exercise-status]');
  if(button.hasAttribute('data-exercise-complete')){
   card.completed=true;button.disabled=true;button.textContent='已标记完成';status.textContent='本页已记录完成';return;
  }
  const label=button.dataset.contentFeedback;
  if(label===undefined)return;
  card.feedback=label;
  if(label==='有帮助'||label==='没帮助')sessionVotes.set(card.cardId,{id:card.id,label,openedAt:card.openedAt});
  else sessionVotes.delete(card.cardId);
  for(const option of panel.querySelectorAll('[data-content-feedback]')){
   const selected=Boolean(label)&&label===option.dataset.contentFeedback;
   option.classList.toggle('active',selected);option.setAttribute('aria-pressed',String(selected));
  }
  status.textContent=label?'本页已记录反馈':'评价已撤销';
 });
}
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
  const html=renderPartnerArticle({...item,duration:card.duration||item.duration,feedback:card.feedback,completed:card.completed});
  const record=root.querySelector('.survey-record-page');
  savedResult={nodes:[...root.childNodes],scroll:record.scrollTop,cardId:card.cardId};
  if(!forward)history.pushState({trial,view:'reading',cardId:card.cardId},'');
  page='reading';root.innerHTML=html;root.scrollTop=0;
  card.openedAt??=Date.now();bindReadingFeedback(card);
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
