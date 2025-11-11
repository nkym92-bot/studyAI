let apiKey = localStorage.getItem("openai_key");
const apiInput = document.getElementById("apiKeyInput");
if (apiKey) apiInput.value = apiKey;
apiInput.addEventListener("change", () => {
  apiKey = apiInput.value.trim();
  localStorage.setItem("openai_key", apiKey);
});

const quizArea = document.getElementById("quizArea");
const bar = document.getElementById("bar");
let questions = [], currentIndex = 0, correctCount = 0, totalQuestions = 0;
let userAnswers = [], timer = null, timeLeft = 0, mode = "practice";
let wrongQuestions = [];

async function loadQuestions() {
  const res = await fetch("data/questions.json");
  return await res.json();
}

// === 開始 ===
document.getElementById("startBtn").onclick = async () => {
  mode = document.getElementById("mode").value;
  const domain = document.getElementById("domain").value;
  const keyword = document.getElementById("filterKeyword").value.trim();
  const count = parseInt(document.getElementById("count").value);
  const minutes = parseInt(document.getElementById("minutes").value);

  if (mode === "generate") {
    await handleAIGeneration(domain, keyword, count);
  } else {
    const all = await loadQuestions();
    questions = all.filter(q => {
      const domainMatch = domain === "all" || q.domain === domain;
      const keywordMatch = !keyword || (q.question + q.tags?.join(",")).includes(keyword);
      return domainMatch && keywordMatch;
    });
    if (!questions.length) return alert("条件に一致する問題が見つかりません。");
    questions = questions.sort(() => Math.random() - 0.5).slice(0, count);
  }

  totalQuestions = questions.length;
  currentIndex = 0; correctCount = 0; userAnswers = []; wrongQuestions = [];
  timeLeft = minutes * 60;

  clearInterval(timer);
  timer = setInterval(() => { if (--timeLeft <= 0) endQuiz(); }, 1000);
  showQuestion();
};

// === AI出題モード処理 ===
async function handleAIGeneration(domain, keyword, count) {
  if (!apiKey) return alert("OpenAI APIキーを入力してください。");

  // 前回生成済みがある場合
  const saved = localStorage.getItem("ai_generated_questions");
  if (saved) {
    const reuse = confirm("📦 前回のAI生成問題があります。再利用しますか？");
    if (reuse) {
      questions = JSON.parse(saved);
      return;
    }
  }

  quizArea.innerHTML = `<div class="question-card"><p>🧠 AIが問題と解説を生成しています... (${domain})</p></div>`;

  const msg = [
    {
      role: "system",
      content: "あなたはITIL4の認定講師です。出力は必ず有効なJSON配列形式にしてください。"
    },
    {
      role: "user",
      content:
        `ITIL4の${domain === "all" ? "全般" : domain}に関する${count}問の4択問題を日本語で作成してください。
        各問題には必ず「解説（explanation）」を含めてください。
        出力形式は以下のJSON構造に限定：
        [
          {"question":"...","choices":["A","B","C","D"],"answerIndex":0,"explanation":"...","domain":"${domain}"}
        ]
        解説は短く明確に。タグや余計な文は不要です。`
    }
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: msg,
      temperature: 0.7
    })
  });

  const data = await res.json();
  let content = data.choices?.[0]?.message?.content;
  try {
    questions = JSON.parse(content.match(/\[.*\]/s)[0]);
    localStorage.setItem("ai_generated_questions", JSON.stringify(questions));
  } catch {
    alert("⚠️ AI出題の解析に失敗しました。再試行してください。");
    questions = [];
  }
}

// === 問題表示 ===
function showQuestion() {
  const q = questions[currentIndex];
  quizArea.innerHTML = `
    <div class="question-card">
      <p><strong>Q${currentIndex + 1}/${totalQuestions}:</strong> ${q.question}
        <span class="tag">${q.domain}</span></p>
      <div class="choices">
        ${q.choices.map((c, i) => `<div class="choice" data-index="${i}">${c}</div>`).join("")}
      </div>
      <div class="button-row">
        <button id="checkBtn">${mode==="practice"?"答え合わせ":"次へ"}</button>
        ${mode==="practice"?`<button id="aiHintBtn">💡 ヒント</button>`:""}
      </div>
      <div id="exp" class="explanation"></div>
    </div>
  `;
  document.querySelectorAll(".choice").forEach(el => el.addEventListener("click", () => selectChoice(el)));
  document.getElementById("checkBtn").onclick = () => checkAnswer(q);
  if (mode === "practice") document.getElementById("aiHintBtn").onclick = () => getAIHint(q);
}

function selectChoice(el) {
  document.querySelectorAll(".choice").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
}

function getSelectedIndex() {
  const selected = document.querySelector(".choice.selected");
  return selected ? parseInt(selected.dataset.index) : null;
}

function checkAnswer(q) {
  const idx = getSelectedIndex();
  if (idx === null) return alert("選択してください。");
  userAnswers[currentIndex] = idx;
  const div = document.getElementById("exp");
  const selectedChoice = document.querySelector(".choice.selected");

  if (idx === q.answerIndex) {
    correctCount++;
    div.textContent = `✅ 正解！ ${q.explanation}`;
    selectedChoice.classList.add("correct");
  } else {
    div.textContent = `❌ 不正解。正答: ${q.choices[q.answerIndex]} → ${q.explanation}`;
    wrongQuestions.push(q);
  }

  setTimeout(() => nextQuestion(), 2000);
  updateProgress();
}

function nextQuestion() {
  currentIndex++;
  if (currentIndex >= totalQuestions) endQuiz();
  else showQuestion();
}

function updateProgress() {
  bar.style.width = `${((currentIndex + 1) / totalQuestions) * 100}%`;
}

async function endQuiz() {
  clearInterval(timer);
  correctCount = questions.filter((q, i) => userAnswers[i] === q.answerIndex).length;
  const score = Math.round((correctCount / totalQuestions) * 100);

  quizArea.innerHTML = `
    <div class="question-card">
      <h2>🎓 結果</h2>
      <p>正答率：${score}%（${correctCount}/${totalQuestions}）</p>
      <button id="retryWrongBtn" ${wrongQuestions.length ? "" : "disabled"}>🔁 間違えた問題だけ再挑戦</button>
      <p id="aiResult">AI評価を取得中...</p>
      <button onclick="location.reload()">🔄 最初から</button>
    </div>
  `;

  if (!apiKey) return;
  const messages = [
    { role: "system", content: "あなたはITIL4講師です。" },
    { role: "user", content:
        `モード:${mode}\nスコア:${score}%\n誤答:${wrongQuestions.length}件\n` +
        (wrongQuestions.length
          ? wrongQuestions.slice(0, 5).map(q => `・${q.question}`).join("\n")
          : "全問正解") +
        "\n受験者へのアドバイスを3行で簡潔に出力。"
    }
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-4o-mini", messages })
  });
  const data = await res.json();
  document.getElementById("aiResult").textContent =
    data.choices?.[0]?.message?.content || "⚠️ AI評価取得に失敗しました。";

  document.getElementById("retryWrongBtn").onclick = retryWrong;
}

function retryWrong() {
  questions = wrongQuestions;
  totalQuestions = questions.length;
  currentIndex = 0;
  correctCount = 0;
  userAnswers = [];
  wrongQuestions = [];
  showQuestion();
}

async function getAIHint(q) {
  if (!apiKey) return alert("APIキーを入力してください。");
  const msg = [
    { role: "system", content: "あなたはITIL4講師です。答えを明かさずヒントを2行で出力。" },
    { role: "user", content: `問題:${q.question}\n選択肢:${q.choices.join(" / ")}` }
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: msg })
  });
  const data = await res.json();
  document.getElementById("exp").textContent =
    data.choices?.[0]?.message?.content || "ヒント取得失敗。";
}
