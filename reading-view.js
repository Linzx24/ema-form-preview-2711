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
  function renderTrialArticleBodyBlock(block) {
    if (block.type === "image" && block.url) {
      return renderArticleBodyBlock(block);
    }
    const text = String(block.text || "").trim();
    const heading = /^#{1,3}\s+(.+)$/.exec(text);
    if (heading) return `<h2>${escapeHtml(heading[1])}</h2>`;
    return `<p>${escapeHtml(text)}</p>`;
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
            <label>大约阅读了多久（可选）
              <select data-content-duration="${escapeHtml(item.id)}">
                <option value="">不记录</option>
                ${["少于5分钟", "5–10分钟", "10–20分钟", "20分钟以上"].map(option =>
                  `<option value="${escapeHtml(option)}" ${duration === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
              </select>
            </label>
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
        const trialArticleBlocks = articleBlocks.filter((block, index) => {
          if (index !== 0 || block.type !== "paragraph") {
            return true;
          }
          const text = String(block.text || "").trim();
          return text !== String(item.title || "").trim() && text !== String(item.description || "").trim();
        });
        const trialArticleBodyHtml = (trialArticleBlocks.length ? trialArticleBlocks : [{ type: "paragraph", text: "内容尚未完善" }])
          .map(renderTrialArticleBodyBlock)
          .join("");
        return `
          <section class="page content-page content-trial-article-page" style="--trial-article-bg: url(&quot;${escapeHtml(articleCoverUrl)}&quot;);">
            <div class="content-trial-topbar content-trial-article-topbar">
              ${renderContentBackButton()}
              <div class="content-heading">
                <strong>练习详情</strong>
                <span class="therapy-type-tag therapy-type-${escapeHtml(item.tone || "mint")}">${escapeHtml(item.type || "文章")}</span>
              </div>
            </div>
            <header class="content-trial-article-header">
              <span class="content-trial-article-kicker">${escapeHtml("阅读练习")}</span>
              <h1>${escapeHtml(item.title)}</h1>
              <p>${escapeHtml(item.description || "")}</p>
              <div class="content-trial-article-meta">
                ${item.duration ? `<span>${escapeHtml(item.duration)}</span>` : ""}
                <span>${escapeHtml(item.type || "文章")}</span>
              </div>
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
