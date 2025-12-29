"use strict";

// ====================
// Utilitários
// ====================
const STORAGE_PREFIX = "sigma_exam_v1";
function byId(id){ return document.getElementById(id); }
function qq(selector, el=document){ return Array.from(el.querySelectorAll(selector)); }
function nowISO(){ return new Date().toISOString(); }
function downloadJSON(obj, filename="results.json"){
  const blob = new Blob([JSON.stringify(obj,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ====================
// Estado global
// ====================
const App = {
  exam: null,
  questions: [],
  answers: {},
  marked: {},
  currentIndex:0,
  running:false,
  timeLeft:0,
  timerId:null
};

// ====================
// Elementos DOM
// ====================
const el = {
  tabsList: byId("tabs-list"),
  progress: byId("progress"),
  questionWrapper: byId("question-wrapper"),
  timer: byId("timer"),
  prev: byId("prev"),
  next: byId("next"),
  mark: byId("mark"),
  clear: byId("clear"),
  submit: byId("submit"),
  restoreBanner: byId("restore-banner"),
  exportResults: byId("export-results"),
  helpModal: byId("help-modal")
};

// ====================
// Carregar JSON automaticamente
// ====================
async function loadExamJSON(){
  // aqui você pode trocar para fetch("/exam.json") se estiver no servidor
  const sampleExam = {
    meta:{title:"Prova Sigma — Exemplo"},
    timeLimit:600,
    questions:[
      {id:1,text:"Em uma PA: a1=5, r=3. Soma dos 10 primeiros termos?",options:["155","185","205","225","245"],correct:"B",explanation:"S_n = n*(2a1+(n-1)r)/2 = 10*(10+27)/2 = 185"},
      {id:2,text:"Cubo aresta 6 cm: distância entre vértices opostos?",options:["6√2","6√3","12","12√2","12√3"],correct:"B",explanation:"Diagonal = a√3 = 6√3"},
      {id:3,text:"Quantos números de 3 algarismos distintos usando {1,2,3,4,5}?",options:["60","75","100","125","150"],correct:"A",explanation:"5*4*3=60"},
      {id:4,text:"Triângulo retângulo: hipotenusa 13, cateto 5. Área?",options:["30","32,5","60","65","78"],correct:"A",explanation:"Outro cateto 12, área=5*12/2=30"},
      {id:5,text:"log2(x)=3, log2(y)=5. log2(x^2/y)?",options:["1","2","3","4","5"],correct:"A",explanation:"2*3-5=1"}
    ]
  };
  App.exam = sampleExam;
  App.questions = sampleExam.questions.map(q=>({...q,_options:q.options.slice()}));
  App.answers={}; App.marked={}; App.questions.forEach(q=>{App.answers[q.id]=null;App.marked[q.id]=false;});
  App.timeLeft = sampleExam.timeLimit;
  renderTabs();
  showQuestion(0);
  startTimer(App.timeLeft);
}

// ====================
// Render Tabs e Questão
// ====================
function renderTabs(){
  el.tabsList.innerHTML="";
  App.questions.forEach((q,idx)=>{
    const btn=document.createElement("button");
    btn.className="small tab-btn"; btn.type="button"; btn.id=`tab-${q.id}`;
    btn.textContent=idx+1; btn.title=`Questão ${idx+1}`;
    btn.addEventListener("click",()=>showQuestion(idx));
    el.tabsList.appendChild(btn);
  });
  updateProgress();
}

function renderQuestionCard(q,idx){
  const userAnswer = App.answers[q.id]??null;
  const marked = App.marked[q.id]?" (Marcada)":"";
  const optionsHtml = q._options.map((opt,i)=>{
    const letter=String.fromCharCode(65+i);
    const selected=userAnswer===letter?"selected":"";
    return `<div class="option ${selected}" role="button" tabindex="0" data-letter="${letter}"><div class="option-letter">${letter})</div><div class="option-text">${opt}</div></div>`;
  }).join("\n");
  return `<article class="question-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h2>Questão ${idx+1}${marked}</h2><div class="muted">ID:${q.id}</div></div><p class="question-text">${q.text}</p><div class="options-container">${optionsHtml}</div></article>`;
}

function showQuestion(idx){
  if(idx<0)idx=0;if(idx>=App.questions.length)idx=App.questions.length-1;
  App.currentIndex=idx;
  el.questionWrapper.innerHTML=renderQuestionCard(App.questions[idx],idx);
  qq(".option",el.questionWrapper).forEach(optEl=>{
    optEl.onclick=()=>setAnswer(App.questions[idx].id,optEl.dataset.letter);
  });
  updateTabHighlight();
  updateProgress();
}

function updateTabHighlight(){
  App.questions.forEach((q,idx)=>{
    const btn=byId(`tab-${q.id}`);
    if(!btn)return;
    btn.classList.toggle("active",idx===App.currentIndex);
    btn.classList.toggle("answered",!!App.answers[q.id]);
    btn.classList.toggle("marked",!!App.marked[q.id]);
  });
}

function updateProgress(){
  const total = App.questions.length||1;
  const answered = Object.values(App.answers).filter(v=>v!==null).length;
  const pct = Math.round((answered/total)*100);
  el.progress.style.width=pct+"%";
}

// ====================
// Responder / Marcar / Limpar
// ====================
function setAnswer(qid,letter){ App.answers[qid]=letter; showQuestion(App.currentIndex); }
function clearAnswer(){ App.answers[App.questions[App.currentIndex].id]=null; showQuestion(App.currentIndex); }
function toggleMark(){ const q=App.questions[App.currentIndex]; App.marked[q.id]=!App.marked[q.id]; showQuestion(App.currentIndex); }

// ====================
// Timer
// ====================
function startTimer(seconds){
  if(App.timerId) clearInterval(App.timerId);
  App.timeLeft=seconds;
  updateTimerDisplay();
  App.timerId=setInterval(()=>{
    App.timeLeft--; updateTimerDisplay();
    if(App.timeLeft<=0){ clearInterval(App.timerId); finishExam(); }
  },1000);
}

function updateTimerDisplay(){
  const m=Math.floor(App.timeLeft/60);
  const s=App.timeLeft%60;
  el.timer.textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

// ====================
// Resultados
// ====================
function calculateResults(){
  let correct=0,incorrect=0,blank=0;
  App.questions.forEach(q=>{
    const ans=App.answers[q.id];
    if(ans===null) blank++;
    else if(ans===q.correct) correct++;
    else incorrect++;
  });
  return {correct,incorrect,blank,total:App.questions.length,score:correct};
}

function showResults(){
  const r=calculateResults();
  const details=App.questions.map((q,idx)=>{
    const user=App.answers[q.id]??null;
    const status=user===q.correct?"Correta":(user===null?"Em branco":"Incorreta");
    return `<div style="padding:8px;border-radius:8px;margin-bottom:6px;background:#fff">
      <div style="display:flex;justify-content:space-between"><strong>Questão ${idx+1}</strong><span>${status}</span></div>
      <div style="margin-top:6px"><small>Resposta: ${user??"-"} • Correta: ${q.correct}</small></div>
      ${q.explanation?`<div style="margin-top:8px;color:#333"><strong>Explicação:</strong> ${q.explanation}</div>`:""}
    </div>`;
  }).join("");
  el.results.innerHTML=`<h3>Resumo</h3><p><strong>Acertos:</strong> ${r.correct}/${r.total}</p><p><strong>Erros:</strong> ${r.incorrect}</p><p><strong>Em branco:</strong> ${r.blank}</p><hr>${details}`;
  el.results.hidden=false;
  clearInterval(App.timerId);
}

// ====================
// Eventos UI
// ====================
function bindUI(){
  el.prev.addEventListener("click",()=>showQuestion(App.currentIndex-1));
  el.next.addEventListener("click",()=>showQuestion(App.currentIndex+1));
  el.mark.addEventListener("click",toggleMark);
  el.clear.addEventListener("click",clearAnswer);
  el.submit.addEventListener("click",showResults);
  el.exportResults.addEventListener("click",()=>downloadJSON({exam:App.exam,answers:App.answers,results:calculateResults()},"sigma_results.json"));
  document.addEventListener("keydown",(ev)=>{
    if(["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) return;
    if(ev.key==="ArrowLeft"){ showQuestion(App.currentIndex-1); ev.preventDefault(); }
    if(ev.key==="ArrowRight"){ showQuestion(App.currentIndex+1); ev.preventDefault(); }
    if(/^[1-5]$/.test(ev.key)){ 
      const idx=Number(ev.key)-1; 
      const q=App.questions[App.currentIndex]; 
      setAnswer(q.id,String.fromCharCode(65+idx));
    }
    if(ev.key.toLowerCase()==="m"){ toggleMark(); ev.preventDefault(); }
    if(ev.key.toLowerCase()==="c"){ clearAnswer(); ev.preventDefault(); }
    if(ev.key.toLowerCase()==="s"){ showResults(); ev.preventDefault(); }
    if(ev.key==="?"){ el.helpModal.style.display=el.helpModal.style.display==="none"?"block":"none"; ev.preventDefault(); }
  });
}

// ====================
// Inicialização
// ====================
bindUI();
loadExamJSON();