// Retrieval-practice quiz for lessons. Copy into the workspace's assets/ and link it from every lesson.
//   Quiz.mount(el, questions, { lesson: '0003' })
//   question: { q, options: [..], answer: index, why: 'explanation with a <a href>citation</a>', from: '0001' (optional) }
// - `from` marks a spaced-review question from an earlier lesson; it is tagged "Review · lesson 0001".
// - One attempt per question counts toward the score; later clicks only reveal.
// - When every question is answered, a results box appears with text the learner can paste back to the
//   agent. That is the evidence the agent needs to write learning records and pick the next lesson.
// - Quiz.all holds every mounted quiz, so scripts/check.js can lint option lengths and answer positions.
(function (root) {
  const words = s => s.trim().split(/\s+/).length;
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function mount(el, questions, opts = {}) {
    const lesson = opts.lesson || el.dataset.lesson || (location.pathname.match(/(\d{4})-[^/]*\.html$/) || [])[1] || '';
    el.classList.add('quiz');
    Quiz.all.push({ el, lesson, questions });
    const picks = new Array(questions.length).fill(null);
    const score = document.createElement('p'); score.className = 'score';
    const out = document.createElement('div'); out.className = 'quiz-results'; out.hidden = true;
    const upd = () => {
      const n = picks.filter(p => p !== null).length, right = picks.filter((p, i) => p === questions[i].answer).length;
      score.textContent = n ? `Score: ${right} / ${n} answered (of ${questions.length})` : `${questions.length} questions. Answer from memory before scrolling back up.`;
      if (n < questions.length) return;
      const missed = questions.map((qq, i) => picks[i] === qq.answer ? null :
        `- Q${i + 1}${qq.from ? ` (review of ${qq.from})` : ''}: "${qq.q}" I chose "${qq.options[picks[i]]}"; the answer is "${qq.options[qq.answer]}".`).filter(Boolean);
      const text = `Quiz results, lesson ${lesson || document.title}: ${right}/${questions.length} on first try.\n` +
        (missed.length ? `Missed:\n${missed.join('\n')}` : 'No misses.') + '\nPlease update my learning records and suggest what to learn next.';
      out.hidden = false;
      out.innerHTML = `<p><b>Tell your teacher.</b> Paste this back into the chat, so the next lesson starts from what you actually know.</p>
        <textarea readonly rows="${Math.min(10, 3 + missed.length)}">${esc(text)}</textarea><button type="button">Copy results</button>`;
      const ta = out.querySelector('textarea'), b = out.querySelector('button');
      b.onclick = () => { ta.select(); (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).catch(() => document.execCommand('copy')).finally(() => b.textContent = 'Copied'); };
    };
    questions.forEach((qq, qi) => {
      const ws = qq.options.map(words);
      if (Math.max(...ws) !== Math.min(...ws)) console.warn(`quiz Q${qi + 1}: options have ${ws.join('/')} words; make them equal so length gives no clue`);
      const box = document.createElement('div'); box.className = 'q' + (qq.from ? ' review' : '');
      box.innerHTML = `<p>${qq.from ? `<span class="tag">Review · lesson ${esc(qq.from)}</span> ` : ''}${qi + 1}. ${qq.q}</p><div class="opts"></div><div class="why"></div>`;
      const optsEl = box.querySelector('.opts'), why = box.querySelector('.why');
      qq.options.forEach((o, oi) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = o;
        b.onclick = () => {
          if (picks[qi] === null) { picks[qi] = oi; upd(); }
          optsEl.querySelectorAll('button').forEach((x, xi) => { x.classList.toggle('right', xi === qq.answer); x.classList.toggle('wrong', xi === oi && oi !== qq.answer); });
          why.innerHTML = (oi === qq.answer ? '<b>Yes.</b> ' : '<b>Not quite.</b> ') + qq.why; why.classList.add('show');
        };
        optsEl.appendChild(b);
      });
      el.appendChild(box);
    });
    el.appendChild(score); el.appendChild(out); upd();
  }
  const Quiz = { mount, all: [] };
  root.Quiz = Quiz;
})(window);

/* Minimal styles (put them in the workspace's course.css):
.quiz .q{margin:1em 0}.quiz .opts{display:grid;gap:.4em}.quiz button{text-align:left;padding:.5em .8em;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font:inherit}
.quiz button.right{border-color:#2a8a4a;background:#e8f6ec}.quiz button.wrong{border-color:#c0392b;background:#fbeaea}
.quiz .why{display:none;margin-top:.4em;font-size:.95em}.quiz .why.show{display:block}.quiz .tag{font-size:.75em;padding:.1em .5em;border-radius:9px;background:#eef;color:#446}
.quiz-results textarea{width:100%;box-sizing:border-box;font:12px/1.4 ui-monospace,monospace}
*/
