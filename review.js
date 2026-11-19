'use strict';
const root=document.getElementById('screen');
const data={questionnaire:frozenQuestions,questionnaireScaleMarks:[0,20,40,60,80,100]};
const state={surveyMode:'trial',surveyBusy:false,surveyError:'',surveyNotice:'',questionnaireStarted:false,
  surveySchedule:{templateName:'EMA 问卷',effectiveDate:getTodayDateKey()},
  surveyClaim:{versions:{rule:RULE_VERSION},previousReminderAt:null,exerciseContext:{needs:research.needs,choices}},
  answers:createQuestionnaireAnswers(),questionnaireNotes:createQuestionnaireNotes(),exerciseChoices:{}};
const dialog=document.getElementById('dialog');
function tell(title,message){
 dialog.querySelector('h2').textContent=title;dialog.querySelector('p').textContent=message;dialog.showModal();
}
document.getElementById('close-dialog').onclick=()=>dialog.close();
let page='intro', counter=0;
function show(){
 if(page==='result'){
  const row=state.surveyDetail.submission;
  root.innerHTML=renderSurveyRecord({source:'trial',id:String(row.id)});
  const nav=root.querySelector('.survey-record-nav');nav.replaceChildren();
  const back=document.createElement('button');back.id='again';back.textContent='重新试填';nav.append(back);
 }else{
  state.questionnaireStarted=page==='form';root.innerHTML=renderQuestionnaire();
  if(page==='intro')root.querySelector('.questionnaire-intro [role=status]').textContent='甲方试填 · 请使用虚构答案。填写后可查看回顾和推荐，答案仅在本页使用。';
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
  state.surveyNotice=check.message;refreshForm();const el=root.querySelector('[data-question-block="'+check.questionId+'"]');el?.scrollIntoView({block:'center'});return;
 }
 const result=validateAnswers(frozenQuestions,buildQuestionnaireSubmissionAnswers());
 if(result.errors.length){tell('请核对问卷','还有未完成或无效的回答。');return}
 const answers=result.answers;
 const choice=normalizeChoices(Object.fromEntries(activeContextNeeds().filter(id=>state.exerciseChoices[id]).map(id=>[id,state.exerciseChoices[id]])),answers);
 const matched=recommend(answers,choice,catalog,new Set(),new Map());
 const safety=inspectSafety(answers,RULE_VERSION,null);
 const items=frozenQuestions.filter(q=>Object.hasOwn(answers,q.id)&&q.id!=='nssi_method').map(q=>({id:q.id,title:q.titleBy?.[answers.social_context]||q.title,value:answers[q.id]}));
 const id=++counter;
 state.surveyDetail={submission:{id,source:'trial',createdAt:new Date().toISOString(),partnerMatching:true,
  summary:{complete:true,showSupport:safety.safetyStatus==='triggered',previousReminderAt:null,answers:items},
  recommendations:matched.recommendations.map((r,i)=>{const item=catalog.find(x=>x.id===r.id);return {...r,mode:item.mode,duration:item.duration,cardId:id+':'+i,available:true}})}};
 page='result';show();root.scrollTop=0;
}
root.addEventListener('input',e=>{
 const t=e.target,id=t.dataset.questionRange||t.dataset.questionNumber;
 if(id){const v=t.value;state.answers[id]=v===''?'':Math.max(0,Math.min(100,Math.round(Number(v))));syncQuestionnaireSlider(id);updateSafety()}
 if(t.dataset.questionNote)state.questionnaireNotes[t.dataset.questionNote]=t.value;
});
root.addEventListener('change',e=>{if(e.target.dataset.surveyContext)state.exerciseChoices[e.target.dataset.surveyContext]=e.target.value});
root.addEventListener('click',e=>{
 const b=e.target.closest('button,a,input');if(!b)return;
 if(b.id==='start-questionnaire'){page='form';state.surveyNotice='';show();return}
 if(b.id==='submit-questionnaire'){submit();return}
 if(b.id==='again'){state.answers=createQuestionnaireAnswers();state.questionnaireNotes=createQuestionnaireNotes();state.exerciseChoices={};state.surveyDetail=null;state.surveyNotice='';page='form';show();return}
 if(b.hasAttribute('data-help-resources')){tell('求助资源','当前没有已确认的可用资源。');return}
 if(b.dataset.route==='chat'){tell('对话支持','此公开试填页仅供查看问卷和推荐，未连接聊天服务。');return}
 if(b.dataset.route==='home'){if(page==='intro')tell('问卷试填','点击“开始测评”即可体验手机端问卷。');else{page='intro';show()}return}
 if(b.id==='back-to-answers'){history.back();return}
 if(b.dataset.surveyOpen){e.preventDefault();
  const r=state.surveyDetail.submission.recommendations.find(c=>c.cardId===b.dataset.surveyOpen);
  if(r?.available)openReading(r);return
 }
 const single=b.dataset.questionChoice,multi=b.dataset.questionMulti;
 if(single||multi){const id=single||multi,v=b.dataset.option,old=state.answers[id],next=single?v:old.includes(v)?old.filter(x=>x!==v):[...old,v];
 updateTrialBranch(id,next);if(!shouldShowQuestionnaireNote(data.questionnaire.find(q=>q.id===id),next))state.questionnaireNotes[id]='';state.surveyNotice='';refreshForm();return}
 if(b.dataset.questionRange&&state.answers[b.dataset.questionRange]===''){state.answers[b.dataset.questionRange]=Number(b.value);syncQuestionnaireSlider(b.dataset.questionRange);updateSafety()}
});
show();
