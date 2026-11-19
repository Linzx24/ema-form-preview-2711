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
    const isSectionHeading = text.length > 0 && text.length <= 18 && !/[。！？!?，,；;：:]$/.test(text);
    if (isSectionHeading) {
      return `<h2>${escapeHtml(text)}</h2>`;
    }
    return `<p>${escapeHtml(text)}</p>`;
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
                <span>${escapeHtml(item.duration || "时长未填写")}</span>
                <span>${escapeHtml(item.type || "文章")}</span>
              </div>
            </header>
            <article class="content-trial-article-panel">
              <div class="content-article-scroll content-trial-article-body">
                ${trialArticleBodyHtml}
              </div>

            </article>
          </section>
        `;
      }
