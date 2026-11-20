  function getArticleBodyParagraphs(item) {
    const bodyText = String(item.articleBody || item.description || "")
      .replace(/\r\n/g, "\n")
      .trim();
    if (!bodyText) {
      return [];
    }
    return bodyText
      .split(/\n{2,}|\n/g)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
  }
  function getArticleBodyBlocks(item) {
    return getArticleBodyParagraphs(item).map((paragraph) => {
      const imageMatch = paragraph.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imageMatch) {
        return {
          type: "image",
          alt: imageMatch[1] || item.title || "图片",
          url: "",
        };
      }
      return {
        type: "paragraph",
        text: paragraph,
      };
    });
  }
  function renderArticleBodyBlock(block) {
    if (block.type === "image" && block.url) {
      return `
        <figure class="content-article-image">
          <img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" loading="lazy" />
        </figure>
      `;
    }
    return `<p>${escapeHtml(block.text || "")}</p>`;
  }
  function renderTrialArticleBody(blocks) {
    const meta = [], body = [];
    const numbered = /^(?:[(（](\d{1,3})[)）]|(\d{1,3})[.．、](?!\d)|第((?:\d{1,3}|[一二三四五六七八九]?十[一二三四五六七八九]?|[一二三四五六七八九]))步|步骤\s*((?:\d{1,3}|[一二三四五六七八九]?十[一二三四五六七八九]?|[一二三四五六七八九])))\s*[：:、]?\s*(.+)$/u;
    const breathingCue = /^(?:请找一个舒适的坐姿|吸(?:一口|气)|屏住呼吸|吐(?:一口|气)|呼气|重复这个循环)/u;
    const step = (number, text) => `<p class="reading-step"><span class="step-number">${escapeHtml(String(number))}</span><span>${escapeHtml(text)}</span></p>`;
    const prompt = text => `<blockquote class="reading-prompt">${escapeHtml(text)}</blockquote>`;
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (block.type !== "paragraph") { body.push(renderArticleBodyBlock(block)); continue; }
      const text = block.text.trim();
      const property = i < 6 && /^(适用于|时间|材料|工具|使用技术)\s*[：:]\s*(.{1,90})$/u.exec(text);
      if (property) {
        meta.push(`<div><dt>${escapeHtml(property[1])}</dt><dd>${escapeHtml(property[2])}</dd></div>`);
        continue;
      }
      const match = numbered.exec(text);
      if (match) {
        let number = match.slice(1,5).find(Boolean);
        if (!/^\d+$/.test(number)) {
          const digits = "零一二三四五六七八九";
          const [tens, ones] = number.split("十");
          number = ones === undefined ? digits.indexOf(tens) : (digits.indexOf(tens) || 1) * 10 + digits.indexOf(ones);
        }
        const discussion = /练习讨论\s*[：:]\s*(.+)$/u.exec(match[5]);
        body.push(step(number, discussion ? match[5].slice(0,discussion.index).trim() : match[5]));
        if (discussion) body.push("<h2>练习讨论</h2>", prompt(discussion[1]));
        continue;
      }
      if (breathingCue.test(text)) {
        let end = i + 1;
        while (end < blocks.length && blocks[end].type === "paragraph" && breathingCue.test(blocks[end].text)) end++;
        if (end - i >= 3) {
          for (let n = i; n < end; n++) body.push(step(n - i + 1, blocks[n].text));
          i = end - 1;
          continue;
        }
      }
      const heading = /^#{1,3}\s+(.+)$/.exec(text) || /^([^\n：:。！？!?]{1,15})\s*[：:]$/u.exec(text)
        || /^(练习步骤|详细步骤|练习讨论|核心内涵|小贴士|练习反馈示例|应对技巧)$/u.exec(text);
      if (heading) body.push(`<h2>${escapeHtml(heading[1])}</h2>`);
      else if ((text.length <= 120 && /[?？]$/u.test(text)) || /^[“「『].*[”」』]$/u.test(text)) body.push(prompt(text));
      else body.push(`<p>${escapeHtml(text)}</p>`);
    }
    return (meta.length ? `<dl class="reading-meta">${meta.join("")}</dl>` : "") + body.join("");
  }
  function selectReadingDuration(button) {
    const value = button.getAttribute("aria-pressed") === "true" ? "" : button.value;
    for (const option of button.parentElement.querySelectorAll("[data-content-duration]")) {
      option.setAttribute("aria-pressed", String(option.value === value));
    }
    return value;
  }
  function renderContentFeedbackPanel(item) {
    const selected = item.feedback || "";
    const duration = item.durationFeedback || "";
    const note = item.jot || "";
    return `
      <div class="content-feedback-panel">
        <button data-exercise-complete ${item.completed ? "disabled" : ""}>${item.completed ? "已标记完成" : "标记练习已完成"}</button>
        <p class="content-completion-note">是否完成，由你自己决定</p>
        ${item.mode === "article" ? `
          <div class="content-reading-options">
            <fieldset class="reading-duration">
              <legend>大约阅读了多久（可选）</legend>
              <div class="duration-choices">
                ${["少于5分钟", "5–10分钟", "10–20分钟", "20分钟以上"].map(option =>
                  `<button type="button" data-content-duration="${escapeHtml(item.id)}" value="${option}" aria-pressed="${duration === option}">${option}</button>`).join("")}
              </div>
            </fieldset>
            <label>随手记（可选）
              <textarea rows="3" data-content-note="${escapeHtml(item.id)}" placeholder="写下刚才想到的内容">${escapeHtml(note)}</textarea>
            </label>
          </div>
        ` : ""}
        <strong>这次练习对你有帮助吗？</strong>
        <div>
          ${["有帮助", "一般", "没帮助", ""]
            .map(
              (label) => `
                <button type="button" class="${selected && selected === label ? "active" : ""}" ${!label && !selected ? "hidden" : ""} data-content-feedback="${label}" data-content-id="${item.id}" aria-pressed="${Boolean(selected) && selected === label}">${label || "撤销评价"}</button>
              `
            )
            .join("")}
        </div>
        <span role="status" data-exercise-status></span>
      </div>
    `;
  }
function renderContentBackButton(){return '<button type="button" class="icon-btn" id="back-to-answers" aria-label="返回问卷结果"><img src="./assets/icons/返回.svg" alt="返回问卷"></button>';}
function renderPartnerArticle(item){
const articleCoverUrl="./assets/images/content-image-cover-clean.png",articleBlocks=getArticleBodyBlocks(item);
        const title = String(item.title || "").trim();
        const originalDescription = String(item.description || "").trim();
        const suffix = originalDescription.slice(title.length);
        const description = title && originalDescription.startsWith(title) && (!suffix || /^[\s：:，,。—–-]/u.test(suffix))
          ? suffix.replace(/^[\s：:，,。—–-]+/u, "") : originalDescription;
        const trialArticleBlocks = articleBlocks.filter((block, index) => {
          if (block.type !== "paragraph") return true;
          const text = block.text.replace(/^#{1,3}\s+/, "").trim();
          // Some articles open with the title, a subtitle, then the title again.
          if (index < 3 && text === title) return false;
          return index !== 0 || (text !== originalDescription && text !== description);
        });
        const trialArticleBodyHtml = renderTrialArticleBody(articleBlocks.length ? trialArticleBlocks : [{ type: "paragraph", text: "内容尚未完善" }]);
        return `
          <section class="page content-page content-trial-article-page">
            <div class="content-trial-topbar content-trial-article-topbar">
              ${renderContentBackButton()}
              <div class="content-heading">
                <strong>练习详情</strong>
              </div>
            </div>
            <header class="content-trial-article-header">
              <h1>${escapeHtml(item.title)}</h1>
              ${description ? `<p>${escapeHtml(description)}</p>` : ""}
              ${item.duration ? `<div class="content-trial-article-meta"><span>${escapeHtml(item.duration)}</span></div>` : ""}
            </header>
            <article class="content-trial-article-panel">
              <div class="content-article-scroll content-trial-article-body">
                ${trialArticleBodyHtml}
              </div>
              ${renderContentFeedbackPanel(item)}
            </article>
          </section>
        `;
      }
