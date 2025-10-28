let table;
let questions = [];
let pool = [];
let quiz = [];
let state = 'start'; // 'start' | 'asking' | 'result'
let current = 0;
let score = 0;
let selected = -1;
let showFeedback = false;
let feedbackText = '';
let confetti = [];
let fireworks = []; // 新增：火箭/煙火陣列
let optionRects = [];
let startBtn;
let resultNumericScore = 0; // 新增：結果數字分數（每題25分）
let resultPct = 0; // 新增：結果百分比

function preload() {
  // 不使用 loadTable，改用 fetch 以取得更清楚的錯誤回報
  // preload 保留空白（fetch 在 setup 觸發以便處理錯誤與 UI）
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont('Arial');

  // 以 fetch 載入 CSV，成功後會將 questions 填好並設 tableLoaded = true
  loadCSVWithFetch();

  startBtn = createButton('開始測驗');
  styleButton(startBtn);
  positionStartBtn();

  startBtn.mousePressed(() => {
    if (!tableLoaded || questions.length === 0) {
      alert('questions.csv 尚未載入或為空。請確認檔案位置並以 HTTP 伺服器開啟（如 python -m http.server 或 Live Server）。');
      return;
    }
    startBtn.hide();
    initQuiz();
  });
}

let tableLoaded = false;

function loadCSVWithFetch() {
  tableLoaded = false;
  fetch('questions.csv', {cache: "no-store"})
    .then(resp => {
      if (!resp.ok) {
        throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
      }
      return resp.text();
    })
    .then(txt => {
      parseCSVText(txt);
      tableLoaded = true;
      console.log('questions.csv 解析完成，題數:', questions.length);
    })
    .catch(err => {
      console.error('fetch questions.csv 失敗：', err);
      // 在畫面上顯示明確錯誤（方便除錯）
      createLoadErrorOverlay(err);
    });
}

function createLoadErrorOverlay(err) {
  // 只建立一次 overlay
  if (document.getElementById('csvLoadErrorOverlay')) return;
  const div = document.createElement('div');
  div.id = 'csvLoadErrorOverlay';
  div.style.position = 'fixed';
  div.style.left = '10px';
  div.style.top = '10px';
  div.style.right = '10px';
  div.style.padding = '12px';
  div.style.background = 'rgba(255,240,240,0.95)';
  div.style.color = '#900';
  div.style.border = '1px solid #f66';
  div.style.zIndex = 9999;
  div.style.fontFamily = 'Arial, sans-serif';
  div.innerText = '載入 questions.csv 失敗：' + err + '\n請確認 questions.csv 位於專案資料夾並以 HTTP 伺服器啟動（不要用 file://）。';
  const btn = document.createElement('button');
  btn.innerText = '重新嘗試';
  btn.style.marginLeft = '12px';
  btn.onclick = () => { div.remove(); loadCSVWithFetch(); };
  div.appendChild(btn);
  document.body.appendChild(div);
}

/* 取代原先 parseTable 的實作，直接將 CSV 文字解析成 questions 陣列 */
function parseCSVText(text) {
  questions = [];
  if (!text || text.trim().length === 0) return;

  const rows = csvToRows(text);
  if (rows.length === 0) return;

  // header 資訊
  const header = rows.shift().map(h => h.trim());
  const idx = {
    question: header.indexOf('question'),
    optionA: header.indexOf('optionA'),
    optionB: header.indexOf('optionB'),
    optionC: header.indexOf('optionC'),
    optionD: header.indexOf('optionD'),
    answer: header.indexOf('answer'),
    feedback: header.indexOf('feedback')
  };

  for (let r of rows) {
    // skip empty rows
    if (r.length === 0) continue;
    // 安全取值（若長度不足則使用空字串）
    const get = (i) => (i >= 0 && i < r.length) ? (r[i] || '').trim() : '';
    const q = {
      question: get(idx.question),
      options: [
        get(idx.optionA),
        get(idx.optionB),
        get(idx.optionC),
        get(idx.optionD)
      ],
      answer: (get(idx.answer) || '').toUpperCase(),
      feedback: get(idx.feedback) || ''
    };
    // 簡單驗證：至少需有題目與答案
    if (q.question && q.answer) questions.push(q);
  }
}

/* CSV to rows - 支援雙引號包住欄位與內部雙引號轉義（RFC4180 類似） */
function csvToRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // 如果在引號中且下個字元也是引號，視為 escaped quote
      if (inQuotes && text[i + 1] === '"') {
        cell += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      // handle CRLF
      if (ch === '\r' && text[i + 1] === '\n') { /* skip, will handle at \n */ }
      row.push(cell);
      cell = '';
      // 若 row 只有一空欄且為 header 前的空行，忽略
      // 檢查是否為真正的空列
      const isEmptyRow = row.every(c => c === '');
      if (!isEmptyRow) rows.push(row);
      row = [];
      // skip potential following \n when we've seen \r
      continue;
    }

    // 其他情況直接累加字元
    cell += ch;
  }
  // 最後一個 cell/row
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    const isEmptyRow = row.every(c => c === '');
    if (!isEmptyRow) rows.push(row);
  }
  return rows;
}

function draw() {
  // 馬卡龍漸層背景
  drawPastelBackground();

  drawDecor();

  if (state === 'start') {
    drawStartScreen();
  } else if (state === 'asking') {
    drawQuestion();
    if (showFeedback) {
      drawFeedback();
    }
  } else if (state === 'result') {
    drawResult();
  }

  // 先更新並繪製 fireworks（會在爆炸時產生 confetti）
  if (fireworks.length) updateAndCleanFireworks();
  // 再更新並繪製 confetti（確保 confetti 顯示在畫面最上層）
  if (confetti.length) updateAndCleanConfetti();
}

function drawPastelBackground() {
  // 淡馬卡龍漸層
  for (let y = 0; y < height; y++) {
    let t = y / height;
    let c1 = color(255, 242, 230); // 乳白
    let c2 = color(235, 250, 240); // 薄薄的薄荷
    let c3 = color(245, 235, 255); // 淡紫
    let c = lerpColor(lerpColor(c1, c2, t), c3, t * 0.6);
    stroke(red(c), green(c), blue(c), 220);
    line(0, y, width, y);
  }
}

function drawStartScreen() {
  fill(60, 80);
  textAlign(CENTER, CENTER);
  textSize(min(48, width * 0.05));
  fill(60);
  text('多選題測驗系統', width/2, height/2 - 80);
  textSize(min(18, width * 0.02));
  fill(90);
  text('由 CSV 題庫隨機抽出最多 5 題，並於每次測驗出 5 題', width/2, height/2 - 40);
}

function parseTable() {
  questions = [];
  if (!table) return;
  for (let r = 0; r < table.getRowCount(); r++) {
    let row = table.getRow(r);
    let q = {
      question: row.get('question'),
      options: [
        row.get('optionA'),
        row.get('optionB'),
        row.get('optionC'),
        row.get('optionD')
      ],
      answer: row.get('answer'), // e.g. "A"
      feedback: row.get('feedback') || ''
    };
    questions.push(q);
  }
}

function initQuiz() {
  // 改成每次測驗出 5 題（若題庫不足則全部採用）
  let poolSize = min(5, questions.length);
  pool = shuffleArray(questions).slice(0, poolSize);
  let quizSize = min(5, pool.length); // 改為 5 題
  quiz = shuffleArray(pool).slice(0, quizSize);
  current = 0;
  score = 0;
  selected = -1;
  showFeedback = false;
  feedbackText = '';
  confetti = [];
  fireworks = []; // 新增：每次測驗前清空煙火
  state = 'asking';
}

function drawQuestion() {
  let q = quiz[current];
  if (!q) return;
  textAlign(LEFT, TOP);
  fill(70);
  textSize(min(22, width * 0.028));
  text('題目 ' + (current + 1) + ' / ' + quiz.length, width * 0.04, height * 0.03);
  textSize(min(28, width * 0.04));
  fill(60);
  text(q.question, width * 0.04, height * 0.08, width * 0.92);

  // 畫選項（響應式）
  optionRects = [];
  let startY = height * 0.25;
  let gap = min(24, height * 0.03);
  let h = min(80, height * 0.11);
  let w = width * 0.92;
  let x = width * 0.04;
  for (let i = 0; i < q.options.length; i++) {
    let y = startY + i * (h + gap);
    let isHover = mouseX > x && mouseX < x + w && mouseY > y && mouseY < y + h;
    // 馬卡龍色選項背景
    let bg;
    if (selected === i) bg = color(200, 255, 230); // 淡綠
    else if (isHover) bg = color(255, 245, 220); // 淡桃
    else {
      // 依 index 微調顏色
      if (i % 4 === 0) bg = color(246, 240, 255); // 淡紫
      else if (i % 4 === 1) bg = color(235, 250, 240); // 薄荷
      else if (i % 4 === 2) bg = color(255, 245, 220); // 淡桃
      else bg = color(255, 250, 235); // 乳白
    }
    fill(bg);
    stroke(200);
    strokeWeight(1);
    rect(x, y, w, h, 12);
    fill(60);
    noStroke();
    textSize(min(18, width * 0.02));
    textAlign(LEFT, CENTER);
    let label = String.fromCharCode(65 + i) + '. ';
    text(label + q.options[i], x + 16, y + h / 2);
    optionRects.push({x, y, w, h});
  }

  // 下一題回饋文字
  if (showFeedback) {
    fill(80);
    textSize(min(18, width * 0.018));
    textAlign(LEFT, TOP);
    text(feedbackText, x, startY + q.options.length * (h + gap) + 20);
  }
}

function drawFeedback() {
  let q = quiz[current];
  if (!q) return;
  let correctIndex = q.answer.toUpperCase().charCodeAt(0) - 65;
  let r = optionRects[correctIndex];
  if (r) {
    noFill();
    stroke(255, 165, 140); // 馬卡龍珊瑚色框
    strokeWeight(4);
    rect(r.x, r.y, r.w, r.h, 12);
  }
}

function mousePressed() {
  if (state !== 'asking') return;
  if (!optionRects) return;
  for (let i = 0; i < optionRects.length; i++) {
    let r = optionRects[i];
    if (mouseX > r.x && mouseX < r.x + r.w && mouseY > r.y && mouseY < r.y + r.h) {
      handleAnswer(i);
      break;
    }
  }
}

function handleAnswer(i) {
  if (showFeedback) return; // 已選過
  selected = i;
  let q = quiz[current];
  let chosenLabel = String.fromCharCode(65 + i);
  let correctLabel = q.answer.toUpperCase();
  if (chosenLabel === correctLabel) {
    score++;
    feedbackText = '答對！' + (q.feedback ? '　' + q.feedback : '');
    for (let k = 0; k < 20; k++) confetti.push(new Particle(mouseX, mouseY));
  } else {
    feedbackText = '答錯。正確答案：' + correctLabel + '.　' + (q.feedback ? q.feedback : '');
  }
  showFeedback = true;

  setTimeout(() => {
    current++;
    selected = -1;
    showFeedback = false;
    feedbackText = '';
    if (current >= quiz.length) {
      showResult();
    }
  }, 1200);
}

function showResult() {
  state = 'result';
  createRestartButton();

  // 總分固定 100 分，動態計算每題分數
  const totalPoints = 100;
  const perQuestion = quiz.length > 0 ? (totalPoints / quiz.length) : 0;
  resultNumericScore = Math.round(score * perQuestion);
  resultPct = totalPoints > 0 ? (resultNumericScore / totalPoints) * 100 : 0;

  // 結果卡中心，用於定位效果
  let cardW = min(900, width * 0.8);
  let cardH = min(500, height * 0.7);
  let cx = width/2;
  let cy = height * 0.12 + cardH * 0.5;

  // 常規碎花噴發（視覺補充）
  emitConfettiAt(cx, cy - 40, 120);

  // 90% 以上（含 90）顯示煙火效果
  if (resultPct >= 90) {
    emitFireworksAt(width * 0.5, height * 0.6, 6);
  }

  // 0 分顯示紅色爆炸
  if (resultNumericScore === 0) {
    emitRedExplosionAt(cx, cy + 60, 120);
  }

  console.log('結果數字分數:', resultNumericScore, '百分比:', resultPct);
}

// 新增：發射多個煙火火箭（在指定區域往上發射並爆炸成彩色碎片）
function emitFireworksAt(x, baseY, count = 4) {
  for (let i = 0; i < count; i++) {
    const fx = x + random(-width*0.2, width*0.2);
    const fy = baseY + random(20, 80);
    fireworks.push(new FireworkRocket(fx, fy));
  }
}

// FireworkRocket：向上飛行，於到達 apex 或時間到時爆炸成許多 confetti
class FireworkRocket {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.vel = createVector(random(-1.2, 1.2), random(-9.5, -6.5));
    this.acc = createVector(0, 0.12);
    this.age = 0;
    this.exploded = false;
    // 火箭顏色（煙火核心色）
    this.color = color(random(200,255), random(150,255), random(150,255));
    this.size = random(4,6);
  }
  update() {
    if (this.exploded) return;
    this.vel.add(this.acc);
    this.pos.add(this.vel);
    this.age++;
    // 判斷爆炸：速度向下或年齡到達閾值
    if (this.vel.y > -2 || this.age > 60 + random(0,30)) {
      this.explode();
    }
  }
  explode() {
    if (this.exploded) return;
    this.exploded = true;
    // 產生多顆彩色碎片（push 到 confetti）
    const pieces = floor(random(50, 120));
    for (let i = 0; i < pieces; i++) {
      const p = new Particle(this.pos.x, this.pos.y);
      // 讓碎片成為較亮且飛散的顏色
      p.color = color(
        red(this.color) + random(-30,30),
        green(this.color) + random(-30,30),
        blue(this.color) + random(-30,30)
      );
      const speed = random(2, 8);
      const angle = random(TWO_PI);
      p.vel = createVector(cos(angle) * speed, sin(angle) * speed);
      p.acc = createVector(0, 0.08);
      p.size = random(4, 10);
      p.life = 200 + random(40, 120);
      confetti.push(p);
    }
  }
  show() {
    if (this.exploded) return;
    push();
    noStroke();
    fill(this.color);
    ellipse(this.pos.x, this.pos.y, this.size);
    pop();
    // 火箭尾巴（簡單粒子尾）
    for (let i = 0; i < 2; i++) {
      const tx = this.pos.x + random(-3,3);
      const ty = this.pos.y + random(0,6);
      push();
      noStroke();
      fill(255, 220, 180, 120);
      ellipse(tx, ty, random(1,3));
      pop();
    }
  }
}

// 新增：更新並清理 fireworks（火箭）
function updateAndCleanFireworks() {
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const f = fireworks[i];
    f.update();
    f.show();
    if (f.exploded || f.pos.y < -100 || f.age > 200) {
      fireworks.splice(i, 1);
    }
  }
}

// 新增：紅色爆炸（0 分）——較大的紅色碎片與煙霧效果
function emitRedExplosionAt(x, y, count = 80) {
  for (let i = 0; i < count; i++) {
    const p = new Particle(x, y);
    // 紅色調
    const r = random(180, 255);
    const g = random(10, 80);
    const b = random(10, 60);
    p.color = color(r, g, b);
    const speed = random(2, 10);
    const angle = random(TWO_PI);
    p.vel = createVector(cos(angle) * speed, sin(angle) * speed);
    p.acc = createVector(0, 0.12);
    p.size = random(6, 18);
    p.life = 220 + random(20, 120);
    confetti.push(p);
  }
}

function drawResult() {
  // 半透明卡片式顯示結果
  let cardW = min(900, width * 0.8);
  let cardH = min(500, height * 0.7);
  let cx = width/2 - cardW/2;
  let cy = height * 0.12;

  fill(255, 250);
  noStroke();
  rect(cx, cy, cardW, cardH, 20);

  textAlign(CENTER, CENTER);
  fill(60);
  textSize(min(36, width * 0.03));
  text('測驗結果', width/2, cy + 50);
  textSize(min(24, width * 0.02));
  // 顯示總分為 100 的結果（四捨五入）
  text('得分：' + resultNumericScore + ' / 100　(' + nf(resultPct, 0, 1) + '%)', width/2, cy + 110);

  textSize(min(18, width * 0.018));
  let msg = '';
  if (resultNumericScore === 100) msg = '完美！做得很好！';
  else if (resultPct >= 70) msg = '表現不錯，稍加複習可以更好。';
  else msg = '建議再檢視題庫內容並多練習。';
  text(msg, width/2, cy + 150);

  // 顯示題目檢視（簡短）
  textAlign(LEFT, TOP);
  let y = cy + 200;
  for (let i = 0; i < quiz.length; i++) {
    let q = quiz[i];
    textSize(min(16, width * 0.015));
    fill(80);
    let line = (i+1) + '. ' + q.question + '  正確：' + q.answer.toUpperCase();
    text(line, cx + 30, y, cardW - 60, 80);
    y += 60;
  }
}

// 新增：建立重新測驗按鈕（結果頁使用）
function createRestartButton() {
  // 若已存在則先移除
  if (window.__restartBtn && window.__restartBtn.remove) {
    window.__restartBtn.remove();
  }
  const btn = createButton('重新測驗');
  styleButton(btn);
  btn.position((width - 120) / 2, height - 100);
  btn.size(120, 44);
  btn.mousePressed(() => {
    btn.remove();
    window.__restartBtn = null;
    confetti = [];
    fireworks = [];
    initQuiz();
  });
  window.__restartBtn = btn;
}

// 新增：從指定位置噴出碎花（供 showResult 與其他地方呼叫）
function emitConfettiAt(x, y, count = 40, fromTop = false) {
  for (let i = 0; i < count; i++) {
    const p = new Particle(x + random(-20, 20), y + random(-10, 10), fromTop);
    if (fromTop) {
      p.pos.x = x + random(-80, 80);
      p.pos.y = y + random(-200, -10);
      p.vel = createVector(random(-1.5, 1.5), random(1.5, 5));
    } else {
      const angle = random(-PI, 0);
      const speed = random(2, 8);
      p.vel = createVector(cos(angle) * speed, sin(angle) * speed);
    }
    p.size = random(6, 14);
    p.life = 180 + random(30, 100);
    confetti.push(p);
  }
}

// 新增：更新並清理 confetti（從後往前刪除避免索引問題）
function updateAndCleanConfetti() {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const p = confetti[i];
    p.update();
    p.show();
    // 移除條件：生命耗盡或跑離過遠
    if (p.life <= 5 || p.pos.y > height + 400 || p.pos.x < -400 || p.pos.x > width + 400) {
      confetti.splice(i, 1);
    }
  }
}

function drawDecor() {
  // 左上與右下柔和元素
  noStroke();
  fill(255, 235, 245, 80);
  ellipse(width * 0.12, height * 0.1, min(width, height) * 0.25);
  fill(235, 255, 240, 70);
  ellipse(width * 0.85, height * 0.85, min(width, height) * 0.35);
}

/* util & particles */

function shuffleArray(a) {
  let b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    let j = floor(random(i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

class Particle {
  constructor(x, y, fromTop=false) {
    this.pos = createVector(x, y);
    this.vel = createVector(random(-2, 2), random(1, 6));
    if (fromTop) this.pos.y = random(-200, 0), this.vel.y = random(2, 6);
    this.acc = createVector(0, 0.08);
    const palettes = [
      [255, 205, 210], // 粉
      [225, 245, 254], // 淡藍
      [232, 245, 233], // 薄荷
      [255, 243, 224], // 淡黃
      [243, 229, 245]  // 淡紫
    ];
    let p = random(palettes);
    this.color = color(p[0], p[1], p[2]);
    this.size = random(6, 12);
    this.life = 255;
  }
  update() {
    this.vel.add(this.acc);
    this.pos.add(this.vel);
    this.life -= 3;
  }
  show() {
    push();
    rectMode(CENTER);
    noStroke();
    fill(red(this.color), green(this.color), blue(this.color), this.life);
    translate(this.pos.x, this.pos.y);
    rotate((frameCount + this.pos.x) / 40);
    rect(0, 0, this.size, this.size * 0.6, 3);
    pop();
  }
}

function styleButton(btn) {
  if (!btn) return;
  btn.style('font-size', '18px');
  btn.style('padding', '10px 14px');
  btn.style('border-radius', '8px');
  btn.style('background', '#ffffff');
  btn.style('color', '#444444');
  btn.style('box-shadow', '0 4px 10px rgba(0,0,0,0.08)');
  btn.elt.style.cursor = 'pointer';
}

function positionStartBtn() {
  if (!startBtn) return;
  // 若能取得實際寬度可更精準置中，否則使用固定偏移
  let w = startBtn.elt && startBtn.elt.offsetWidth ? startBtn.elt.offsetWidth : 140;
  startBtn.position((width - w) / 2, height/2 + 40);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  positionStartBtn();
}
