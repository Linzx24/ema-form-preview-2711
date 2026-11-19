'use strict';
const root=document.getElementById('screen');
const data={questionnaire:frozenQuestions,questionnaireScaleMarks:[0,20,40,60,80,100]};
const state={surveyMode:'trial',surveyBusy:false,surveyError:'',surveyNotice:'',questionnaireStarted:false,
  surveyClaim:{versions:{rule:RULE_VERSION},previousReminderAt:null},
  answers:createQuestionnaireAnswers(),questionnaireNotes:createQuestionnaireNotes()};
const dialog=document.getElementById('dialog');
function tell(title,message){
 dialog.querySelector('h2').textContent=title;dialog.querySelector('p').textContent=message;dialog.showModal();
}
document.getElementById('close-dialog').onclick=()=>dialog.close();
let page='intro', counter=0;
let trial=crypto.randomUUID(), formScroll=0;
function navigate(view){
 history.pushState({trial,view},'');
 page=view;show();
}
history.replaceState({trial,view:page},'');
window.addEventListener('popstate',e=>{
 ++readingRequest;
 if(page==='form')formScroll=root.querySelector('.questionnaire-form-body').scrollTop;
 const target=e.state?.trial===trial?e.state.view:'intro';
 if(target==='result'&&page==='reading'){restoreResult();return}
 savedResult=null;
 if(target==='reading'&&state.surveyDetail){
  if(page!=='result'){page='result';show()}
  const card=state.surveyDetail.submission.recommendations.find(x=>x.cardId===e.state.cardId);
  if(card){openReading(card,true);return}
 }
 page=target==='intro'?'intro':target==='result'&&state.surveyDetail?'result':'form';
 if(target!==page||e.state?.trial!==trial)history.replaceState({trial,view:page},'');
 show();
});
function show(){
 if(page==='result'){
  const row=state.surveyDetail.submission;
  root.innerHTML=renderSurveyRecord({source:'trial',id:String(row.id)});
  const nav=root.querySelector('.survey-record-nav');nav.replaceChildren();
  const back=document.createElement('button');back.id='again';back.textContent='重新试填';nav.append(back);
 }else{
  state.questionnaireStarted=page==='form';root.innerHTML=renderQuestionnaire();
  if(page==='intro')root.querySelector('.questionnaire-intro [role=status]').textContent=canRead
   ?'提交后可查看本次回答，并阅读符合条件的推荐练习。'
   :'可以试填并查看推荐名称。阅读正文需要发送方提供的完整试填链接。';
  if(page==='form')root.querySelector('.questionnaire-form-body').scrollTop=formScroll;
 }
}
function refreshForm(){
 const top=root.querySelector('.questionnaire-form-body')?.scrollTop||0;
 show();root.querySelector('.questionnaire-form-body').scrollTop=top;
}
function updateSafety(){
 const old=root.querySelector('[data-ema-crisis-banner]'),anchor=getEmaCrisisAnchorQuestionId();
 const target=anchor&&root.querySelector('[data-question-block="'+anchor+'"]');
 if(old&&target?.nextElementSibling===old && old.classList.contains('is-immediate')===evaluateEmaCrisis().immediate)return;
 old?.remove();if(target)target.insertAdjacentHTML('afterend',renderEmaCrisisBanner(evaluateEmaCrisis()));
}
function submit(){
 const check=validateQuestionnaireAnswers();
 if(!check.valid){
  root.querySelector('#missing-answer')?.remove();
  root.querySelector('[aria-invalid="true"]')?.removeAttribute('aria-invalid');
  const el=root.querySelector('[data-question-block="'+check.questionId+'"]');
  const field=el.querySelector('textarea')||el.querySelector('input,button');
  const note=document.createElement('p');note.id='missing-answer';note.setAttribute('role','alert');note.textContent=check.message;
  el.querySelector('h3').after(note);field.setAttribute('aria-invalid','true');
  field.focus({preventScroll:true});el.scrollIntoView({block:'center'});return;
 }
 const result=validateAnswers(frozenQuestions,buildQuestionnaireSubmissionAnswers());
 if(result.errors.length){tell('请核对问卷','还有未完成或无效的回答。');return}
 const answers=result.answers;
 const matched=recommend(answers,{},catalog,new Set(),questionnaireRatings());
 const safety=inspectSafety(answers,RULE_VERSION,null);
 const items=frozenQuestions.filter(q=>Object.hasOwn(answers,q.id)&&q.id!=='nssi_method').map(q=>({id:q.id,title:q.titleBy?.[answers.social_context]||q.title,value:answers[q.id]}));
 const id=++counter;
 state.surveyDetail={submission:{id,source:'trial',createdAt:new Date().toISOString(),partnerMatching:true,
  emptyReason:matched.candidateIds.length ? '这次填写的分项已达到匹配门槛，暂无可直接推荐的基础练习。' :
   '这次十项感受中最高为 '+Math.max(...research.needs.tieOrder.map(id=>answers[id]))+' 分。单项达到 '+research.needs.minScore+' 分才会匹配练习。',
  summary:{complete:true,showSupport:safety.safetyStatus==='triggered',previousReminderAt:null,answers:items},
  recommendations:matched.recommendations.map((r,i)=>{const item=catalog.find(x=>x.id===r.id);return {...r,mode:item.mode,duration:item.duration,cardId:id+':'+i,available:true}})}};
 formScroll=root.querySelector('.questionnaire-form-body').scrollTop;navigate('result');root.scrollTop=0;
}
root.addEventListener('input',e=>{
 if(page!=='form')return;
 state.surveyDetail=null;
 const t=e.target,id=t.dataset.questionRange||t.dataset.questionNumber;
 const block=t.closest('[data-question-block]');
 if(t.value.trim() && block?.querySelector('#missing-answer')){
  block.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid');block.querySelector('#missing-answer').remove();
 }
 if(id){const v=t.value;state.answers[id]=v===''?'':Math.max(0,Math.min(100,Math.round(Number(v))));syncQuestionnaireSlider(id);updateSafety()}
 if(t.dataset.questionNote)state.questionnaireNotes[t.dataset.questionNote]=t.value;
});
root.addEventListener('click',e=>{
 const b=e.target.closest('button,a,input');if(!b)return;
 if(b.id==='start-questionnaire'){state.surveyNotice='';navigate('form');return}
 if(b.id==='submit-questionnaire'){submit();return}
 if(b.id==='again'){trial=crypto.randomUUID();formScroll=0;state.answers=createQuestionnaireAnswers();state.questionnaireNotes=createQuestionnaireNotes();state.surveyDetail=null;state.surveyNotice='';history.pushState({trial,view:'intro'},'');navigate('form');return}
 if(b.hasAttribute('data-help-resources')){tell('可以怎样求助','如果此刻想找人陪你，可以联系一个你信任的人。可以直接发一句：“你现在方便聊一会儿吗？我想找个人说说话。”这份试填页没有接入项目的求助资源目录，也不会通知任何人。');return}
 if(b.dataset.route==='chat'){tell('对话支持','此公开试填页仅供查看问卷和推荐，未连接聊天服务。');return}
 if(b.dataset.route==='home'){history.back();return}
 if(b.id==='back-to-answers'){history.back();return}
 if(b.dataset.surveyOpen){e.preventDefault();
  const r=state.surveyDetail.submission.recommendations.find(c=>c.cardId===b.dataset.surveyOpen);
  if(r?.available)openReading(r);return
 }
 const single=b.dataset.questionChoice,multi=b.dataset.questionMulti;
 if(single||multi){const id=single||multi,v=b.dataset.option,old=state.answers[id],next=single?v:old.includes(v)?old.filter(x=>x!==v):[...old,v];
 state.surveyDetail=null;updateTrialBranch(id,next);if(!shouldShowQuestionnaireNote(data.questionnaire.find(q=>q.id===id),next))state.questionnaireNotes[id]='';state.surveyNotice='';refreshForm();
 const buttons=root.querySelectorAll('[data-question-block="'+id+'"] button');
 Array.from(buttons).find(x=>x.dataset.option===v)?.focus({preventScroll:true});return}
 if(b.dataset.questionRange&&state.answers[b.dataset.questionRange]===''){state.surveyDetail=null;state.answers[b.dataset.questionRange]=Number(b.value);syncQuestionnaireSlider(b.dataset.questionRange);updateSafety();const block=b.closest('[data-question-block]');block.querySelector('#missing-answer')?.remove();block.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid')}
});
checkReadingLink().then(ok=>{canRead=ok;show()});
