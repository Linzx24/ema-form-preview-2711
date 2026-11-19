'use strict';
// Indices refer to the original paragraphs after the repeated article title is removed.
const exerciseWorksheets = new Map([
  ['emotion-b7670a21de3f5189', { paragraphs: 6, fields: [1, 2, 3, 4, 5] }],
  ['emotion-f615edeb008b9308', { paragraphs: 8, fields: [1, 4, 5, 6, 7] }],
  ['emotion-36c1f7406d6dad57', { paragraphs: 5, fields: [1, 2, 3, 4] }],
]);

function attachExerciseWorksheet(root, itemId, drafts) {
  const sheet = exerciseWorksheets.get(itemId);
  if (!sheet) return;
  const body = root.querySelector('.content-trial-article-body');
  if (!body || body.children.length !== sheet.paragraphs) return;
  const prompts = Array.from(body.children);
  for (const index of sheet.fields) {
    const prompt = prompts[index];
    prompt.id = 'exercise-prompt-' + index;
    const key = itemId + ':' + index;
    const field = document.createElement('textarea');
    field.className = 'exercise-written-answer';
    field.setAttribute('aria-labelledby', prompt.id);
    field.autocomplete = 'off';
    field.rows = 3;
    field.placeholder = '在这里写下你的想法';
    field.value = drafts.get(key) || '';
    field.addEventListener('input', () => {
      if (field.value) drafts.set(key, field.value);
      else drafts.delete(key);
    });
    prompt.after(field);
  }
}
