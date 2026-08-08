/* quiz.js — the two feedback-loop widgets every lesson in this workspace uses.
   No dependencies, no build step. Include with <script src="../assets/quiz.js" defer></script>.

   Retrieval practice (.quiz)
   --------------------------
   <div class="quiz" data-why="Why the right answer is right.">
     <p class="q">The question?</p>
     <ul class="opts">
       <li><button data-correct>Right answer here</button></li>
       <li><button>Wrong answer here</button></li>
     </ul>
     <p class="why"></p>
   </div>

   Ordering practice (.order)
   --------------------------
   <div class="order" data-why="...">
     <p class="q">Click the hops in the order they happen.</p>
     <ul class="opts">
       <li><button data-pos="2">Second thing</button></li>
       <li><button data-pos="1">First thing</button></li>
     </ul>
     <p class="progress"></p>
     <p class="why"></p>
   </div>

   A [data-score] element anywhere on the page shows "n of m" as questions are answered.
*/

(function () {
  "use strict";

  var answered = 0;
  var total = 0;
  var correct = 0;

  function updateScore() {
    document.querySelectorAll("[data-score]").forEach(function (el) {
      el.textContent = answered
        ? correct + " of " + answered + " right (" + total + " on this page)"
        : total + " checks on this page — none answered yet";
    });
  }

  function reveal(box, text) {
    var why = box.querySelector(".why");
    if (!why) return;
    if (text && !why.textContent.trim()) why.textContent = text;
    why.classList.add("show");
  }

  /* ── retrieval practice ─────────────────────────────────────────── */

  document.querySelectorAll(".quiz").forEach(function (box) {
    var buttons = Array.prototype.slice.call(box.querySelectorAll(".opts button"));
    if (!buttons.length) return;
    total += 1;

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (box.dataset.done) return;
        box.dataset.done = "1";
        var right = btn.hasAttribute("data-correct");

        buttons.forEach(function (b) {
          b.disabled = true;
          if (b.hasAttribute("data-correct")) b.dataset.state = "right";
        });
        if (!right) btn.dataset.state = "wrong";

        answered += 1;
        if (right) correct += 1;
        reveal(box, box.dataset.why || "");
        updateScore();
      });
    });
  });

  /* ── ordering practice ──────────────────────────────────────────── */

  document.querySelectorAll(".order").forEach(function (box) {
    var buttons = Array.prototype.slice.call(box.querySelectorAll(".opts button"));
    if (!buttons.length) return;
    total += 1;

    var expected = 1;
    var slipped = false;
    var count = buttons.length;
    var progress = box.querySelector(".progress");

    function say() {
      if (!progress) return;
      progress.textContent =
        expected > count
          ? "complete — " + (slipped ? "with a wrong turn along the way" : "first time, no wrong turns")
          : expected - 1 + " of " + count + " in order";
    }
    say();

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (expected > count) return;
        var pos = parseInt(btn.dataset.pos, 10);

        if (pos === expected) {
          btn.dataset.state = "right";
          btn.disabled = true;
          expected += 1;
          if (expected > count) {
            answered += 1;
            if (!slipped) correct += 1;
            reveal(box, box.dataset.why || "");
            updateScore();
          }
        } else {
          slipped = true;
          btn.dataset.state = "wrong";
          setTimeout(function () {
            delete btn.dataset.state;
          }, 700);
        }
        say();
      });
    });
  });

  updateScore();
})();
