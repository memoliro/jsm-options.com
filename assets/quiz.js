(function () {
  function parseAnswers(form) {
    var raw = form.getAttribute('data-answers');
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    var tag = document.getElementById(form.getAttribute('data-answers-id') || 'quizAnswers');
    if (tag && tag.textContent) {
      try { return JSON.parse(tag.textContent); } catch (e) {}
    }
    if (window.JSM_QUIZ_ANSWERS) return window.JSM_QUIZ_ANSWERS;
    return null;
  }

  function copy(obj) {
    return {
      perfect: obj.perfect || "Perfect score — you've got this page down.",
      good: obj.good || 'Solid work. Read the notes above, then keep going.',
      retry: obj.retry || 'No worries. Skim the explanations and try once more.'
    };
  }

  function initForm(form) {
    if (form.getAttribute('data-quiz-bound') === '1') return;
    var ANSWERS = parseAnswers(form);
    if (!ANSWERS) return;
    form.setAttribute('data-quiz-bound', '1');

    var resultId = form.getAttribute('data-result') || 'quizResult';
    var result = document.getElementById(resultId) || form.parentNode.querySelector('.quiz-result');
    var scoreEl = result && (result.querySelector('.quiz-score') || document.getElementById('quizScore'));
    var msgEl = result && (result.querySelector('[data-quiz-msg]') || document.getElementById('quizScoreMsg'));
    var retryBtn = result && (result.querySelector('[data-quiz-retry]') || document.getElementById('quizRetry'));
    var submitBtn = form.querySelector('.quiz-submit');
    var msgs = copy(window.JSM_QUIZ_MSGS || {});

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var names = Object.keys(ANSWERS);
      var correctCount = 0;

      names.forEach(function (name) {
        var qWrap = form.querySelector('[data-name="' + name + '"]');
        if (!qWrap) return;
        var checked = form.querySelector('input[name="' + name + '"]:checked');
        var explainEl = qWrap.querySelector('.quiz-explain');
        var isCorrect = !!checked && checked.value === ANSWERS[name].correct;

        qWrap.classList.remove('is-correct', 'is-incorrect');
        qWrap.classList.add(isCorrect ? 'is-correct' : 'is-incorrect');
        if (isCorrect) correctCount++;

        if (explainEl) {
          var prefix = isCorrect ? 'Correct — ' : (checked ? 'Not quite — ' : 'Skipped — ');
          if (form.getAttribute('data-lang') === 'tr') {
            prefix = isCorrect ? 'Doğru — ' : (checked ? 'Pek değil — ' : 'Boş bırakıldı — ');
          }
          explainEl.textContent = prefix + ANSWERS[name].explain;
          explainEl.hidden = false;
        }

        Array.prototype.forEach.call(form.querySelectorAll('input[name="' + name + '"]'), function (input) {
          input.disabled = true;
        });
      });

      var total = names.length;
      var pct = total ? Math.round((correctCount / total) * 100) : 0;
      if (scoreEl) scoreEl.textContent = correctCount + ' / ' + total + ' (' + pct + '%)';
      if (msgEl) {
        msgEl.textContent = pct === 100 ? msgs.perfect : (pct >= 67 ? msgs.good : msgs.retry);
      }
      if (result) result.hidden = false;
      if (submitBtn) submitBtn.hidden = true;
      if (result && result.scrollIntoView) result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        form.reset();
        Array.prototype.forEach.call(form.querySelectorAll('input'), function (input) { input.disabled = false; });
        Array.prototype.forEach.call(form.querySelectorAll('.quiz-q'), function (q) { q.classList.remove('is-correct', 'is-incorrect'); });
        Array.prototype.forEach.call(form.querySelectorAll('.quiz-explain'), function (el) { el.hidden = true; });
        if (result) result.hidden = true;
        if (submitBtn) submitBtn.hidden = false;
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }

  function init() {
    var forms = document.querySelectorAll('form.quiz-form, form#quizForm');
    Array.prototype.forEach.call(forms, initForm);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
