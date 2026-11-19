// SQLite CURRENT_TIMESTAMP has no suffix but is UTC. Pure dates are not instants.
(function (root) {
  function instant(value) {
    if (value instanceof Date || typeof value === 'number') return new Date(value);
    const text = String(value || '').trim();
    return new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)
      ? text.replace(' ', 'T') + 'Z' : text);
  }
  function format(value) {
    if (!value) return '--';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
    const time = instant(value).getTime();
    if (!Number.isFinite(time)) return '--';
    return new Date(time + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  }
  function date(value = new Date()) { return format(value).slice(0, 10); }
  function inDateRange(value, from, to) {
    if (!from && !to) return true;
    if (!value) return false;
    const day = date(value);
    return day !== '--' && (!from || day >= from) && (!to || day <= to);
  }
  const api = { instant, format, date, inDateRange };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BeijingTime = api;
})(globalThis);

const {research,choices,relations,catalog,questions:frozenQuestions}=window.previewInstrument;
const RULE_VERSION = '2C-b-local-E1-v1';

const safetyFields = [
  ['nssi_thoughts', 'nssi', 'since_reminder', 80],
  ['nssi_urge', 'nssi', 'now', 60],
  ['nssi_behavior', 'nssi', 'since_reminder', '是'],
  ['suicide_thoughts', 'suicide', 'since_reminder', 80],
  ['suicide_urge', 'suicide', 'now', 60],
  ['suicide_attempt', 'suicide', 'since_reminder', '是'],
];
function inspectSafety(answers, ruleVersion, previousReminderAt) {
  if (ruleVersion !== RULE_VERSION) {
    return { safetyStatus: 'unknown', alert: null, safetyEvidence: [] };
  }
  const evidence = [];
  for (const [id, channel, timeWindow, threshold] of safetyFields) {
    const value = answers[id];
    const behavior = threshold === '是';
    if (behavior ? value !== threshold : !(Number.isFinite(value) && value >= threshold && value <= 100)) continue;
    const title = frozenQuestions.find((q) => q.id === id).title;
    evidence.push({
      id, title, channel, timeWindow, value, alert: behavior ? 'urgent' : 'high',
      ...(timeWindow === 'since_reminder' && { previousReminderAt }),
    });
  }
  const complete = safetyFields.every(([id]) => Object.hasOwn(answers, id));
  return {
    safetyStatus: evidence.length ? 'triggered' : complete ? 'clear' : 'unknown',
    alert: evidence.some((e) => e.alert === 'urgent') ? 'urgent' : evidence.length ? 'high' : null,
    safetyEvidence: evidence,
  };
}
function validateAnswers(questions, raw) {
  const answers = {};
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { answers, errors: [{ code: 'INVALID_ANSWERS' }] };
  }
  const keys = new Set(questions.flatMap((q) => [q.id, ...(q.noteOptions ? [q.id + '_note'] : [])]));
  if (Object.keys(raw).some((key) => !keys.has(key))) errors.push({ code: 'UNKNOWN_FIELD' });
  for (const q of questions) {
    // Controllers precede their dependants in the frozen instrument.
    if (!isQuestionVisible(q, answers)) continue;
    const value = raw[q.id];
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) {
      errors.push({ questionId: q.id, code: 'REQUIRED' });
      continue;
    }
    const selected = q.type === 'multi' && Array.isArray(value) ? value : [value];
    const valid = q.type === 'slider' ? Number.isFinite(value) && value >= 0 && value <= 100
      : (q.type === 'multi' ? Array.isArray(value) : typeof value === 'string') &&
        selected.every((item) => q.options.includes(item)) && new Set(selected).size === selected.length;
    if (!valid) {
      errors.push({ questionId: q.id, code: 'INVALID_VALUE' });
      continue;
    }
    answers[q.id] = q.type === 'multi' ? q.options.filter((v) => value.includes(v)) : value;
    if (q.noteOptions?.some((option) => selected.includes(option))) {
      const noteKey = q.id + '_note';
      if (typeof raw[noteKey] === 'string' && raw[noteKey].trim()) answers[noteKey] = raw[noteKey].trim();
      else errors.push({ questionId: q.id, code: 'OTHER_NOTE_REQUIRED' });
    }
  }
  return { answers, errors };
}
function isQuestionVisible(question, answers) {
  const visibleWhen = question?.visibleWhen;
  if (!visibleWhen) {
    return true;
  }
  const refId = visibleWhen.questionId || visibleWhen.id;
  const refValue = answers?.[refId];
  if (Object.prototype.hasOwnProperty.call(visibleWhen, 'equals')) {
    return refValue === visibleWhen.equals;
  }
  if (Array.isArray(visibleWhen.in)) {
    return visibleWhen.in.includes(refValue);
  }
  return true;
}
const selectable = row => !row.restricted && row.role === 'practice_or_skill_instruction';
function needs(answers) {
  return research.needs.tieOrder.filter(id => answers[id] >= research.needs.minScore)
    .sort((a,b) => answers[b] - answers[a]).slice(0,research.needs.maxNeeds);
}
function normalizeChoices(raw, answers) {
  if (raw === undefined) return {};
  const allowed = needs(answers);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.entries(raw).some(([id,code]) => !allowed.includes(id) || typeof code !== 'string' || !Object.hasOwn(choices[id],code))) {
    throw Object.assign(new Error('请核对本次选择的练习情境'),{statusCode:400});
  }
  return raw;
}
function recommend(answers, selected, catalog, seen, ratings) {
  const candidateIds = needs(answers);
  const items = new Map(catalog.map(item => [item.id,item]));
  const pools = new Map(candidateIds.map(id => [id,[]]));
  for (const row of relations) {
    const pool = pools.get(row.need);
    const item = items.get(row.id);
    if (!pool || !item?.needIds.includes(row.need) || !selectable(row) || seen.has(row.id) ||
        (row.codes.length && !row.codes.includes(selected[row.need]))) continue;
    const labels = (ratings.get(row.id) || []).slice(0,research.feedbackMaximumSamples);
    const helpful = labels.filter(x => x === '有帮助').length;
    const unhelpful = labels.filter(x => x === '没帮助').length;
    const weight = research.weights;
    const score = weight[row.match] + weight.feedbackMax * (helpful-unhelpful)/(helpful+unhelpful+research.feedbackPrior)
      - (labels[0] === '没帮助' && labels[1] === '没帮助' ? weight.consecutiveUnhelpful : 0);
    pool.push({id:item.id,title:item.title,needId:row.need,score,relationId:row.need+':'+row.id,
      explanation:selected[row.need] && row.codes.length ? choices[row.need][selected[row.need]] : null});
  }
  for (const pool of pools.values()) pool.sort((a,b) => b.score-a.score || a.relationId.localeCompare(b.relationId));
  const used = new Set();
  const recommendations = [];
  for (let pass=0;pass<research.maxChoices;pass++) {
    for (const pool of pools.values()) {
      const card = pool.find(c => !used.has(items.get(c.id).workId));
      if (!card) continue;
      used.add(items.get(card.id).workId);
      recommendations.push({...card,eligibleCount:pool.length});
      if (recommendations.length === research.maxChoices) break;
    }
    if (recommendations.length === research.maxChoices) break;
  }
  return {candidateIds,recommendations};
}
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
  function getTodayDateKey() {
    return BeijingTime.date();
  }
  function surveyTimeWindow(row) {
    return row.previousReminderAt
      ? "上次提醒时间（北京时间）：" + BeijingTime.format(row.previousReminderAt)
      : "上次提醒时间未记录。各题的时间范围见题文。";
  }
  function createQuestionnaireAnswers() {
    return Object.fromEntries(
      data.questionnaire.map((question) => [
        question.id,
        Array.isArray(question.value) ? question.value.slice() : question.value ?? "",
      ])
    );
  }
  function createQuestionnaireNotes() {
    return Object.fromEntries(
      data.questionnaire
        .filter((question) => getQuestionnaireNoteTriggers(question).length > 0)
        .map((question) => [question.id, question.note || ""])
    );
  }
  function getQuestionnaireNoteTriggers(question) {
    if (Array.isArray(question?.noteOptions) && question.noteOptions.length) {
      return question.noteOptions.slice();
    }
    if (Array.isArray(question?.options) && question.options.includes("其他")) {
      return ["其他"];
    }
    return [];
  }
  function questionHasOtherOption(question) {
    return getQuestionnaireNoteTriggers(question).length > 0;
  }
  function getQuestionnaireNotePlaceholder(question) {
    const placeholder = String(question?.notePlaceholder || "").trim();
    if (!questionHasOtherOption(question)) {
      return placeholder;
    }
    if (!placeholder || placeholder === "* 请简要描述你在做什么") {
      return "请输入信息";
    }
    return placeholder;
  }
  function shouldShowQuestionnaireNote(question, value) {
    const triggers = getQuestionnaireNoteTriggers(question);
    if (!triggers.length) {
      return false;
    }
    if (question?.type === "single") {
      return triggers.includes(value);
    }
    if (question?.type === "multi") {
      return Array.isArray(value) && value.some((item) => triggers.includes(item));
    }
    return false;
  }
  function isQuestionnaireQuestionVisible(question) {
    const rule = question?.visibleWhen;
    if (!rule?.id) {
      return true;
    }
    const current = state.answers[rule.id];
    if (Object.prototype.hasOwnProperty.call(rule, "equals")) {
      return current === rule.equals;
    }
    if (Array.isArray(rule.in)) {
      return rule.in.includes(current);
    }
    return true;
  }
  function getVisibleQuestionnaireQuestions() {
    return data.questionnaire.filter((question) => isQuestionnaireQuestionVisible(question));
  }
  function validateQuestionnaireAnswers() {
    for (const question of getVisibleQuestionnaireQuestions()) {
      const value = state.answers[question.id];
      const unanswered =
        question.type === "multi"
          ? !Array.isArray(value) || value.length === 0
          : value === "" || value === null || value === undefined;
      if (unanswered) {
        return { valid: false, questionId: question.id, message: `请完成这一题：${getQuestionnaireQuestionTitle(question)}` };
      }
      if (shouldShowQuestionnaireNote(question, value) && !String(state.questionnaireNotes[question.id] || "").trim()) {
        return { valid: false, questionId: question.id, message: "选择“其他”后，请补充具体信息" };
      }
    }
    return { valid: true, questionId: "", message: "" };
  }
  function getQuestionnaireQuestionTitle(question) {
    if (question?.titleBy) {
      const key = state.answers.social_context;
      if (key && question.titleBy[key]) {
        return question.titleBy[key];
      }
    }
    return question.title;
  }
  function evaluateEmaCrisis(answers = state.answers) {
    if (state.surveyMode === "trial" && state.surveyClaim?.versions?.rule !== "2C-b-local-E1-v1") {
      return { active: false, immediate: false };
    }
    const nssiBehavior = answers.nssi_behavior === "是";
    const suicideAttempt = answers.suicide_attempt === "是";
    const nssiUrge = Number(answers.nssi_urge || 0);
    const suicideUrge = Number(answers.suicide_urge || 0);
    const nssiThoughts = Number(answers.nssi_thoughts || 0);
    const suicideThoughts = Number(answers.suicide_thoughts || 0);
    const immediate = nssiBehavior || suicideAttempt;
    const elevated = nssiUrge >= 60 || suicideUrge >= 60 || nssiThoughts >= 80 || suicideThoughts >= 80;
    return {
      active: immediate || elevated,
      immediate,
      elevated,
      copy: window.EMA_CRISIS_COPY || {
        title: "安全优先",
        body: "如果你正在经历自伤或自杀相关的痛苦，请立刻寻求帮助。",
        action: "继续对话支持",
      },
    };
  }
  function getEmaCrisisAnchorQuestionId(answers = state.answers) {
    if (answers.suicide_attempt === "是") return "suicide_attempt";
    if (answers.nssi_behavior === "是") return "nssi_behavior";
    if (Number(answers.suicide_urge || 0) >= 60) return "suicide_urge";
    if (Number(answers.nssi_urge || 0) >= 60) return "nssi_urge";
    if (Number(answers.suicide_thoughts || 0) >= 80) return "suicide_thoughts";
    if (Number(answers.nssi_thoughts || 0) >= 80) return "nssi_thoughts";
    return "";
  }
  function renderEmaCrisisBanner(crisis) {
    if (!crisis?.active) {
      return "";
    }
    return `
      <div class="ema-crisis-banner ${crisis.immediate ? "is-immediate" : ""}" role="alert" data-ema-crisis-banner="1">
        <strong>${escapeHtml(crisis.copy.title)}</strong>
        <p>${escapeHtml(crisis.copy.body)}</p>

        <div class="ema-crisis-actions">
          <button type="button" class="ema-crisis-call-btn" data-help-resources>查看求助方式</button>
        </div>
      </div>
    `;
  }
  function comparisonControl(q) {
    const old = state.surveyComparison?.get(q.id);
    if (!old || old.value === "" || ![].concat(old.value ?? []).length) return "";
    const answer = escapeHtml([].concat(old.value, old.note || []).join("、"));
    const action = old.signature === surveyQuestionSignature(q)
      ? '<button type="button" data-confirm-answer="' + escapeHtml(q.id) + '">确认沿用这一题</button>'
      : "题义已变，请重新作答。";
    return '<div class="survey-compare">上一份回答：' + answer + " " + action + "</div>";
  }
  function surveyQuestionSignature(q) {
    const fields = [q.type, getQuestionnaireQuestionTitle(q), q.minLabel, q.maxLabel,
      q.options, q.noteOptions, q.noteRequiredWhen, q.visibleWhen, q.polarity, q.riskMetric, q.metricKey];
    return JSON.stringify(fields);
  }
  function updateTrialBranch(controllerId, value) {
    const oldTitles = new Map(getVisibleQuestionnaireQuestions().map(q => [q.id, getQuestionnaireQuestionTitle(q)]));
    state.answers[controllerId] = value;
    let changedTitle = false;
    for (const q of data.questionnaire) {
      const renamed = oldTitles.has(q.id) && oldTitles.get(q.id) !== getQuestionnaireQuestionTitle(q);
      if (renamed || !isQuestionnaireQuestionVisible(q)) {
        state.answers[q.id] = q.type === "multi" ? [] : "";
        state.questionnaireNotes[q.id] = "";
        if (renamed) changedTitle = true;
      }
    }
    return changedTitle;
  }
  function renderQuestionnaire() {
    if (!state.questionnaireStarted) {
      return `
        <section class="page questionnaire-page questionnaire-intro-page">
          <div class="questionnaire-topbar">
            <button class="icon-btn" data-route="home">
              <img src="./assets/icons/返回.svg" alt="返回" />
            </button>
            <strong>EMA 问卷</strong>
            <span class="questionnaire-spacer"></span>
          </div>
          <div class="questionnaire-intro">
            <h2>您好，<br />欢迎进行每日问卷测评！</h2>
            ${state.surveyMode === "trial" ? `<p class="questionnaire-intro-note">今日问卷 · ${getTodayDateKey()}（北京时间）</p>
              <p>${state.surveyScheduleLoading ? "正在查看今日日程…" : state.surveyError ? "日程无法确认" :
                state.surveySchedule ? escapeHtml(state.surveySchedule.templateName) + " · 自 " + escapeHtml(state.surveySchedule.effectiveDate) + " 生效" :
                "今天没有安排问卷。"}</p>` : ""}
            <p class="questionnaire-intro-note">包含情绪认知、情境社交与安全相关条目，约需几分钟。</p>
            <img class="questionnaire-hero" src="./assets/images/问卷调查-插图01.png" alt="问卷插图" />
            <p role="status">${escapeHtml(state.surveyError || state.surveyNotice)}</p>
            <button class="questionnaire-primary" id="start-questionnaire" ${state.surveyBusy || state.surveyScheduleLoading ||
              (state.surveyMode === "trial" && !state.surveySchedule && !state.surveyError) ? "disabled" : ""}>${state.surveyError ? "重新加载问卷" : "开始测评"}</button>
            ${state.surveyMode === "trial" && !state.surveySchedule && !state.surveyError ? '<button id="survey-refresh-intro">重新查看日程</button>' : ""}
          </div>
        </section>
      `;
    }

    const visibleQuestions = getVisibleQuestionnaireQuestions();
    const crisis = evaluateEmaCrisis();
    const crisisAnchorId = getEmaCrisisAnchorQuestionId();
    let lastModule = "";
    let displayIndex = 0;

    return `
      <section class="page questionnaire-page questionnaire-form-page">
        <div class="questionnaire-topbar">
          <button class="icon-btn" data-route="home">
            <img src="./assets/icons/返回.svg" alt="返回" />
          </button>
          <strong>EMA 问卷</strong>
          <span class="questionnaire-spacer"></span>
        </div>
        <div class="questionnaire-form-body">
          <div class="questionnaire-form-intro">
            ${state.surveyMode === "trial" ? `<button type="button" data-help-resources>求助方式</button><p>${escapeHtml(surveyTimeWindow(state.surveyClaim))}</p>` : ""}
            <h2>请根据您的实际情况回答以下问题，<br />感谢您的配合!</h2>
            <img class="questionnaire-corner-fairy" src="./assets/images/Group 2631.png" alt="装饰" />
          </div>
          <fieldset class="survey-fields" ${state.surveyRequest || state.surveyBusy ? "disabled" : ""}>
          ${visibleQuestions
            .map((question) => {
              const moduleHeader =
                question.moduleTitle && question.module !== lastModule
                  ? `<div class="ema-module-header">${escapeHtml(question.moduleTitle)}</div>`
                  : "";
              lastModule = question.module || lastModule;
              displayIndex += 1;
              const crisisBanner =
                crisis.active && question.id === crisisAnchorId ? renderEmaCrisisBanner(crisis) : "";
              return `${moduleHeader}${renderQuestionnaireQuestion(question, displayIndex - 1)}${comparisonControl(question)}${crisisBanner}`;
            })
            .join("")}
          ${
            crisis.active && !crisisAnchorId
              ? renderEmaCrisisBanner(crisis)
              : ""
          }
          ${state.surveyClaim?.exerciseContext ? '<div id="survey-context-options">' + renderContextOptions() + '</div>' : ''}
          </fieldset>
        </div>
        <div class="questionnaire-form-footer">
          ${state.surveyNotice ? `<p role="alert">${escapeHtml(state.surveyNotice)}</p>` : ""}
          ${state.surveyProblem === "expired" ? '<button id="survey-reclaim">重新领取并逐题核对</button>' : ""}
          ${state.surveyProblem === "conflict" || state.surveyProblem === "uncertain" ? '<button id="survey-saved">查看已保存问卷</button>' : ""}
          <button class="questionnaire-primary questionnaire-submit" id="submit-questionnaire" ${state.surveyBusy || ["expired","conflict","unknown"].includes(state.surveyProblem) ? "disabled" : ""}>${state.surveyBusy ? "正在处理…" : state.surveyProblem === "uncertain" ? "重交同一份，取回收据" : "提交问卷"}</button>
        </div>
      </section>
    `;
  }
  function activeContextNeeds() {
    const spec = state.surveyClaim?.exerciseContext?.needs;
    return spec ? spec.tieOrder.filter(id => state.answers[id] >= spec.minScore)
      .sort((a,b) => state.answers[b]-state.answers[a]).slice(0,spec.maxNeeds) : [];
  }
  function renderContextOptions() {
    const ids = activeContextNeeds();
    if (!ids.length) return '';
    return '<div class="ema-question"><h3>想补充一点吗？</h3><p>可以选择更贴近这次感受的情况，帮助匹配练习。也可以直接提交。</p>' +
      ids.map(id => '<p><label>' + escapeHtml(data.questionnaire.find(q => q.id === id).title.replace(/^此刻[：:]\s*/,'')) +
        ' <select style="max-width:100%" data-survey-context="' + escapeHtml(id) + '"><option value="">不补充</option>' +
        Object.entries(state.surveyClaim.exerciseContext.choices[id]).map(([code,label]) =>
          '<option value="' + escapeHtml(code) + '"' + (state.exerciseChoices?.[id] === code ? ' selected' : '') + '>' +
          escapeHtml(label) + '</option>').join('') + '</select></label></p>').join('') + '</div>';
  }
  function renderQuestionnaireQuestion(question, index) {
    const value = state.answers[question.id];
    const title = getQuestionnaireQuestionTitle(question);

    if (question.type === "slider") {
      const rangeValue = value === "" ? 0 : Math.min(100, Math.max(0, Number(value) || 0));
      return `
        <div class="ema-question ema-question-slider" data-question-block="${question.id}">
          <h3><span class="ema-required" aria-hidden="true">*</span>${index + 1}. ${escapeHtml(title)}</h3>
          <div class="questionnaire-range-control">
            <input
              class="questionnaire-range-number"
              type="number"
              min="0"
              max="100"
              step="1"
              value="${value}"
              placeholder="待作答"
              inputmode="numeric"
              data-question-number="${question.id}"
              aria-label="${escapeHtml(title)}当前评分"
            />
            <div class="questionnaire-range-scale">
              <div class="questionnaire-range-meta">
                <span>${escapeHtml(question.minLabel)}</span>
                <span>${escapeHtml(question.maxLabel)}</span>
              </div>
              <div class="questionnaire-range-shell">
                <input
                  class="questionnaire-range-input"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value="${rangeValue}"
                  data-question-range="${question.id}"
                  aria-label="${escapeHtml(title)}当前评分"
                  style="--range-fill:${rangeValue}%;"
                />
              </div>
              <div class="questionnaire-range-marks">
                ${data.questionnaireScaleMarks.map((mark) => `<span>${mark}</span>`).join("")}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    if (question.type === "single") {
      return `
        <div class="ema-question" data-question-block="${question.id}">
          <h3><span class="ema-required" aria-hidden="true">*</span>${index + 1}. ${escapeHtml(title)}</h3>
          <div class="questionnaire-choice-list">
            ${question.options
              .map(
                (option) => `
                  <button
                    type="button"
                    class="questionnaire-choice-item ${value === option ? "active" : ""}"
                    data-question-choice="${question.id}"
                    data-option="${option}"
                  >
                    <span class="choice-marker"></span>
                    <span>${escapeHtml(option)}</span>
                  </button>
                `
              )
              .join("")}
          </div>
          ${
            shouldShowQuestionnaireNote(question, value)
              ? `
                <textarea class="questionnaire-note-input" rows="2" data-question-note="${question.id}" placeholder="${escapeHtml(
                  getQuestionnaireNotePlaceholder(question)
                )}">${escapeHtml(state.questionnaireNotes[question.id] || "")}</textarea>
              `
              : ""
          }
        </div>
      `;
    }

    return `
      <div class="ema-question" data-question-block="${question.id}">
        <h3><span class="ema-required" aria-hidden="true">*</span>${index + 1}. ${escapeHtml(title)}</h3>
        <div class="questionnaire-choice-list">
          ${question.options
            .map((option) => {
              const selected = Array.isArray(value) && value.includes(option);
              return `
                <button
                  type="button"
                  class="questionnaire-choice-item ${selected ? "active" : ""}"
                  data-question-multi="${question.id}"
                  data-option="${option}"
                >
                  <span class="choice-marker"></span>
                  <span>${escapeHtml(option)}</span>
                </button>
              `;
            })
            .join("")}
        </div>
        ${
          shouldShowQuestionnaireNote(question, value)
            ? `
              <textarea class="questionnaire-note-input" rows="2" data-question-note="${question.id}" placeholder="${escapeHtml(
                getQuestionnaireNotePlaceholder(question)
              )}">${escapeHtml(state.questionnaireNotes[question.id] || "")}</textarea>
            `
            : ""
        }
      </div>
    `;
  }
  function syncQuestionnaireSlider(questionId) {
    const context = document.getElementById('survey-context-options');
    if (context && [...context.querySelectorAll('select')].map(s => s.dataset.surveyContext).join() !== activeContextNeeds().join()) {
      context.innerHTML = renderContextOptions();
    }
    const rangeInput = root.querySelector(`[data-question-range="${questionId}"]`);
    const numberInput = root.querySelector(`[data-question-number="${questionId}"]`);
    if (!rangeInput) {
      return;
    }
    const rawValue = state.answers[questionId];
    const value = Math.min(100, Math.max(0, Math.round(Number(rawValue || 0))));
    rangeInput.value = String(value);
    rangeInput.style.setProperty("--range-fill", `${value}%`);
    if (numberInput) {
      numberInput.value = rawValue === "" ? "" : String(value);
    }
  }
  function buildQuestionnaireSubmissionAnswers() {
    if (state.surveyMode === "trial") {
      const answers = {};
      for (const question of getVisibleQuestionnaireQuestions()) {
        const value = state.answers[question.id];
        answers[question.id] = Array.isArray(value) ? [...value] : value;
        if (shouldShowQuestionnaireNote(question, value)) {
          answers[question.id + "_note"] = state.questionnaireNotes[question.id].trim();
        }
      }
      return answers;
    }
    const triggersById = Object.fromEntries(
      data.questionnaire.map((question) => [question.id, getQuestionnaireNoteTriggers(question)])
    );
    return Object.fromEntries(
      getVisibleQuestionnaireQuestions().map((question) => {
        const value = state.answers[question.id];
        const note = (state.questionnaireNotes[question.id] || "").trim();
        const triggers = triggersById[question.id] || [];
        if (question.type === "single") {
          return [
            question.id,
            triggers.includes(value) && note ? `${value}：${note}` : value,
          ];
        }
        if (question.type === "multi") {
          const selected = Array.isArray(value) ? value.slice() : [];
          return [
            question.id,
            selected.map((item) => (triggers.includes(item) && note ? `${item}：${note}` : item)),
          ];
        }
        return [question.id, value];
      })
    );
  }
  function renderSurveyRecord(record) {
    const detail = state.surveyDetail;
    const row = detail?.submission;
    const header = '<section class="page history-detail-page survey-record-page"><nav class="survey-record-nav" aria-label="填写回顾导航"><a href="#/home">回首页</a><a href="#/chat">去对话</a><button type="button" id="survey-back-to-day">历史问卷</button></nav>';
    if (!row || row.source !== record.source || String(row.id) !== record.id) {
      return header + '<p role="status">' + escapeHtml(detail?.error || "正在读取这份问卷…") +
        '</p>' + (detail?.error ? '<button id="survey-reload-record">重试</button>' : '') + '</section>';
    }
    const summary = row.summary;
    const parts = [header, '<div class="survey-review" data-survey-source="' + escapeHtml(row.source) +
      '" data-survey-id="' + escapeHtml(row.id) + '"><header class="survey-review-heading"><span>本次填写</span><h1>谢谢你花时间记录自己的感受。</h1>',
      '<p>' + BeijingTime.format(row.createdAt) + '（北京时间）</p></header>'];
    if (row.source === "trial") {
      if (summary.showSupport === true) parts.push('<aside class="survey-support"><h2>需要帮助时</h2><p>如果此刻想找人陪你，可以联系一个你信任的人，也可以在这里查看求助方式。</p><button type="button" data-help-resources>查看求助方式 <span aria-hidden="true">↗</span></button></aside>');
      if (summary.showSupport == null || summary.complete !== true) parts.push('<p class="survey-review-note" role="status">本次判断未完成，以下仅展示已保存的回答。</p>');
    } else {
      parts.push('<aside class="survey-review-note"><p>这是一份旧版问卷，结果保留当时的记录，不代表你现在的状态。</p>');
      if (summary.legacyEvidenceUnavailable) parts.push('<p>旧算法，依据不可复核。</p>');
      if (summary.legacyScore != null) parts.push('<p>旧版综合评分：' + escapeHtml(summary.legacyScore) + '</p>');
      if (summary.legacyLevel != null) parts.push('<p>旧版等级：' + escapeHtml(({low:"低",medium:"中",high:"高"})[summary.legacyLevel] || summary.legacyLevel) + '</p>');
      parts.push('</aside>');
    }
    if (row.recommendations?.length && (row.source === "legacy" || summary.showSupport === false)) {
      parts.push('<section class="survey-answer-group"><h2>推荐练习</h2>' +
        row.recommendations.map(renderSurveyExerciseCard).join("") + '</section>');
    }
    if (row.partnerMatching && summary.showSupport === false && !row.recommendations?.length)
      parts.push('<p class="survey-review-note">' + escapeHtml(row.emptyReason) + '</p>');
    if (row.source === "trial" && summary.complete === true && summary.showSupport === true) {
      const available = (row.recommendations || []).filter(card => card.cardId && card.available === true);
      if (available.length) parts.push('<details class="survey-answer-group survey-contact"><summary>我也想做个练习</summary>' +
        available.map(renderSurveyExerciseCard).join("") + '</details>');
      else if (row.partnerMatching) parts.push('<p class="survey-review-note">' + escapeHtml(row.emptyReason) + '</p>');
    }
    if (row.source === "trial" && summary.complete === true && summary.showSupport === false) {
      parts.push('<details class="survey-answer-group survey-contact"><summary>我想找人聊聊</summary>' +
        '<p>挑一个你愿意说心里话的人。如果一时不知道怎么开口，可以给对方发一句：</p>' +
        '<blockquote>你现在方便聊一会儿吗？我想找个人说说话。</blockquote>' +
        '<button type="button" data-help-resources>查看其他求助方式</button></details>');
    }
    const answers = (summary.answers || []).filter(item => item.id !== "nssi_method" && !item.id?.endsWith("_note"));
    const feelings = new Set(["anxiety", "stress", "irritability", "sadness", "unease", "emptiness", "loneliness", "dysregulation", "rumination", "self_criticism"]);
    const positives = new Set(["joy", "relaxation"]);
    const renderAnswer = item => {
      const value = Array.isArray(item.value) ? item.value.join("、") : item.value;
      const numeric = typeof value === "number" && Number.isFinite(value);
      return '<div class="history-summary-row"><span>' + escapeHtml(item.title) + '</span><strong>' +
        escapeHtml(value ?? "未记录") + (numeric ? '<small> / 100</small>' : '') + '</strong></div>';
    };
    for (const [title, ids] of [["当时的感受", feelings], ["愉快与放松", positives]]) {
      const items = answers.filter(item => ids.has(item.id));
      if (items.length) parts.push('<section class="survey-answer-group"><h2>' + title + '</h2>' + items.map(renderAnswer).join("") + '</section>');
    }
    const other = answers.filter(item => !feelings.has(item.id) && !positives.has(item.id));
    if (other.length) parts.push('<details class="survey-answer-group survey-other-answers"><summary>查看其他回答 <span>' + other.length + ' 项</span></summary>' + (row.source === "trial" ? '<p class="survey-group-caption">' + escapeHtml(surveyTimeWindow(summary)) + '</p>' : '') + other.map(renderAnswer).join("") + '</details>');
    return parts.join("") + '</div></section>';
  }
  function renderSurveyExerciseCard(card) {
    if (!card.cardId) return '<p>' + escapeHtml(card.title) + '</p>';
    const identity = escapeHtml(card.cardId);
    const info = '<div><h3>' + escapeHtml(card.title) + '</h3><p>' +
      escapeHtml([card.mode === 'article' ? '阅读' : card.mode, card.duration].filter(Boolean).join(" · ")) + '</p>' +
      (card.explanation ? '<p>' + escapeHtml(card.explanation) + '</p>' : '') + '</div>';
    if (card.available !== true) return '<article class="survey-exercise-card" data-survey-card="' + identity +
      '">' + info + '<p role="status">当前不可用</p></article>';
    return '<a class="survey-exercise-card" data-survey-card="' + identity + '" data-survey-open="' + identity +
      '" href="#/content?item=' + encodeURIComponent(card.id) + '&amp;surveyCard=' + encodeURIComponent(card.cardId) +
      '">' + info + '<span class="survey-open-label">打开练习 <span aria-hidden="true">↗</span></span></a>';
  }