import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── CONFIG — REPLACE THESE ───────────────────────────────────────────────────
const SUPABASE_URL = "https://fthnowykgzelourpuldx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0aG5vd3lrZ3plbG91cnB1bGR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MDc1NDUsImV4cCI6MjA5MjA4MzU0NX0.RV3-cs2b-4EYYGQtVMWYZbl8hdcf6IHliac54yQELY8";
const ADMIN_PIN         = "4321"; // 👈 Change to your PIN

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── FIXED DECKS (permanent, no database needed for structure) ────────────────
const FIXED_DECKS = [
  { id: "danish",   name: "Danish",   icon: "🇩🇰", color: "#f43f5e", desc: "Dansk sprog og kultur" },
  { id: "english",  name: "English",  icon: "🇬🇧", color: "#60a5fa", desc: "English language skills" },
  { id: "math",     name: "Math",     icon: "📐", color: "#f59e0b", desc: "Numbers and calculations" },
  { id: "training", name: "Training", icon: "💪", color: "#4ade80", desc: "Skills and practice" },
  { id: "other",    name: "Other",    icon: "💡", color: "#a78bfa", desc: "Everything else" },
];

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const LEVELS = [
  { level:1, name:"Seedling",    icon:"🌱", xpRequired:0,    color:"#4ade80" },
  { level:2, name:"Explorer",   icon:"🧭", xpRequired:100,  color:"#60a5fa" },
  { level:3, name:"Adventurer", icon:"⚔️", xpRequired:250,  color:"#a78bfa" },
  { level:4, name:"Champion",   icon:"🏆", xpRequired:500,  color:"#f59e0b" },
  { level:5, name:"Legend",     icon:"👑", xpRequired:1000, color:"#f43f5e" },
  { level:6, name:"Grandmaster",icon:"🌟", xpRequired:2000, color:"#ec4899" },
];

const BADGES = [
  { id:"first",    name:"First Blood",   icon:"🎯", desc:"First correct answer",    ok:s=>s.totalCorrect>=1 },
  { id:"s3",       name:"On Fire",        icon:"🔥", desc:"3 correct in a row",      ok:s=>s.bestStreak>=3 },
  { id:"s5",       name:"Unstoppable",    icon:"⚡", desc:"5 correct in a row",      ok:s=>s.bestStreak>=5 },
  { id:"s10",      name:"Legend Run",     icon:"🌪️",desc:"10 in a row",             ok:s=>s.bestStreak>=10 },
  { id:"lv2",      name:"Rising Star",    icon:"⭐", desc:"Reach Level 2",           ok:s=>s.level>=2 },
  { id:"lv5",      name:"Scholar",        icon:"🎓", desc:"Reach Level 5",           ok:s=>s.level>=5 },
  { id:"acc80",    name:"Sharp Mind",     icon:"🧠", desc:"80%+ accuracy (5+ answered)", ok:s=>s.totalAnswered>=5&&s.totalCorrect/s.totalAnswered>=0.8 },
  { id:"q10",      name:"Dedicated",      icon:"💪", desc:"Answer 10 questions",     ok:s=>s.totalAnswered>=10 },
  { id:"q50",      name:"Legend",         icon:"👑", desc:"Answer 50 questions",     ok:s=>s.totalAnswered>=50 },
  { id:"q100",     name:"Grandmaster",    icon:"🌟", desc:"Answer 100 questions",    ok:s=>s.totalAnswered>=100 },
];

const HIT  = ["Nailed it! 🎉","Boom! 💥","On fire! 🔥","Genius! 🧠","Perfect! ✨","Crushing it! 💪","Fantastisk! 🇩🇰","Outstanding! 🌟"];
const MISS = ["Almost! 😅","Keep going! 💙","Learn & grow 📚","So close! 😤","Mistakes = Growth 🌱"];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const getLvl   = xp => { let c=LEVELS[0]; LEVELS.forEach(l=>{if(xp>=l.xpRequired)c=l;}); return c; };
const getNext  = xp => LEVELS.find(l=>l.xpRequired>xp)||null;
const xpProg   = xp => { const n=getNext(xp); if(!n)return null; const c=getLvl(xp); return{needed:n.xpRequired-xp,pct:Math.round(((xp-c.xpRequired)/(n.xpRequired-c.xpRequired))*100)}; };
const sanitize = s  => s.toLowerCase().replace(/æ/g,"ae").replace(/ø/g,"oe").replace(/å/g,"aa").replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"").slice(0,40);
const rand     = arr=> arr[Math.floor(Math.random()*arr.length)];

function parseCSV(text, deckId) {
  const t = text.replace(/^\uFEFF/,"").replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  const lines = t.trim().split("\n");
  const headers = lines[0].split(",").map(h=>h.trim().toLowerCase().replace(/æ/g,"ae").replace(/ø/g,"oe").replace(/å/g,"aa").replace(/[\s_'"]/g,""));
  const out = [];
  for(let i=1;i<lines.length;i++){
    const raw=lines[i]; const vals=[]; let cur=""; let inQ=false;
    for(let c=0;c<raw.length;c++){
      if(raw[c]==='"'){inQ=!inQ;continue;}
      if(raw[c]===','&&!inQ){vals.push(cur.trim());cur="";continue;}
      cur+=raw[c];
    }
    vals.push(cur.trim());
    if(vals.length<5)continue;
    const r={}; headers.forEach((h,i)=>r[h]=vals[i]||"");
    const q={
      deck_id:     deckId,
      question:    r.question||r.q||r.spoergsmaal||"",
      option_a:    r.optiona||r.a||"",
      option_b:    r.optionb||r.b||"",
      option_c:    r.optionc||r.c||"",
      option_d:    r.optiond||r.d||"",
      correct:     (r.correctanswer||r.correct||r.svar||"A").toUpperCase().trim(),
      explanation: r.explanation||r.forklaring||"",
      media_url:   r.medialink||r.media||r.mediaurl||null,
      category:    r.category||r.kategori||"General",
    };
    if(q.question&&q.option_a)out.push(q);
  }
  return out;
}

// ─── DEFAULT STATS ────────────────────────────────────────────────────────────
const DEFAULT_STATS = {
  xp:0, level:1, totalCorrect:0, totalAnswered:0,
  currentStreak:0, bestStreak:0, earnedBadges:[],
  todayAnswered:0, dailyGoal:10, deckStats:{},
};

// ═════════════════════════════════════════════════════════════════════════════
//  ROOT APP
// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen]   = useState("splash");
  const [user,   setUser]     = useState(null);
  const [stats,  setStats]    = useState(DEFAULT_STATS);
  const [lb,     setLb]       = useState([]);
  const [activeDeck, setAD]   = useState(null);   // { id, name, icon, color }
  const [questions,  setQs]   = useState([]);
  const [loadingQ,   setLQ]   = useState(false);
  const [newBadges,  setNB]   = useState([]);
  const [isAdmin,    setAdm]  = useState(()=>sessionStorage.getItem("lq_adm")==="1");

  /* ── db helpers ── */
  const savePlayer = useCallback(async(id, uname, s) => {
    await supabase.from("players").upsert({
      id, username:uname, xp:s.xp, level:s.level,
      total_correct:s.totalCorrect, total_answered:s.totalAnswered,
      current_streak:s.currentStreak, best_streak:s.bestStreak,
      earned_badges:s.earnedBadges, today_answered:s.todayAnswered,
      daily_goal:s.dailyGoal, deck_stats:s.deckStats,
      updated_at:new Date().toISOString(),
    });
  },[]);

  const loadPlayer = useCallback(async(id) => {
    const{data}=await supabase.from("players").select("*").eq("id",id).single();
    if(data) setStats({
      xp:           data.xp||0,
      level:        data.level||1,
      totalCorrect: data.total_correct||0,
      totalAnswered:data.total_answered||0,
      currentStreak:data.current_streak||0,
      bestStreak:   data.best_streak||0,
      earnedBadges: data.earned_badges||[],
      todayAnswered:data.today_answered||0,
      dailyGoal:    data.daily_goal||10,
      deckStats:    data.deck_stats||{},
    });
  },[]);

  const loadQuestions = useCallback(async(deckId=null) => {
    setLQ(true);
    let q = supabase.from("questions").select("*");
    if(deckId) q = q.eq("deck_id", deckId);
    const{data}=await q.order("created_at",{ascending:false});
    if(data) setQs(data);
    setLQ(false);
  },[]);

  const loadLB = useCallback(async() => {
    const{data}=await supabase.from("players")
      .select("username,xp,level,total_correct,total_answered,best_streak")
      .order("xp",{ascending:false}).limit(25);
    if(data) setLb(data);
  },[]);

  /* ── answer handler ── */
  const answer = useCallback((correct, deckId) => {
    if(!user) return;
    setStats(prev => {
      const streak   = correct ? prev.currentStreak+1 : 0;
      const xpGain   = correct ? 10 + Math.min(streak,10)*2 : 0;
      const xp       = prev.xp + xpGain;
      const level    = getLvl(xp).level;
      const ds       = prev.deckStats||{};
      const dk       = ds[deckId]||{correct:0,answered:0,total:0};
      const deckStats= {...ds,[deckId]:{correct:dk.correct+(correct?1:0),answered:dk.answered+1,total:dk.total}};
      const next = {
        ...prev, xp, level,
        totalCorrect:  prev.totalCorrect+(correct?1:0),
        totalAnswered: prev.totalAnswered+1,
        currentStreak: streak,
        bestStreak:    Math.max(prev.bestStreak,streak),
        todayAnswered: prev.todayAnswered+1,
        deckStats,
      };
      // badge check
      const earned = BADGES.filter(b=>!prev.earnedBadges.includes(b.id)&&b.ok(next));
      if(earned.length){
        next.earnedBadges=[...prev.earnedBadges,...earned.map(b=>b.id)];
        setNB(earned); setTimeout(()=>setNB([]),3500);
      }
      savePlayer(user.id, user.username, next);
      return next;
    });
  },[user,savePlayer]);

  /* ── login ── */
  const login = async(username) => {
    const id = sanitize(username);
    const{data}=await supabase.from("players").select("id").eq("id",id).single();
    if(!data){
      await supabase.from("players").insert({
        id,username,xp:0,level:1,total_correct:0,total_answered:0,
        current_streak:0,best_streak:0,earned_badges:[],
        today_answered:0,daily_goal:10,deck_stats:{},
      });
    } else { await loadPlayer(id); }
    const u={id,username};
    localStorage.setItem("lq_u",JSON.stringify(u));
    setUser(u); setScreen("home");
  };

  useEffect(()=>{
    const s=localStorage.getItem("lq_u");
    if(s){const u=JSON.parse(s);setUser(u);loadPlayer(u.id);setTimeout(()=>setScreen("home"),1600);}
    else setTimeout(()=>setScreen("login"),1600);
  },[]);

  /* ── admin ── */
  const tryPin=(pin)=>{
    if(pin===ADMIN_PIN){sessionStorage.setItem("lq_adm","1");setAdm(true);return true;}
    return false;
  };
  const lockAdmin=()=>{sessionStorage.removeItem("lq_adm");setAdm(false);};

  const playDeck=(deck)=>{setAD(deck);loadQuestions(deck.id);setScreen("play");};
  const playAll =()=>{setAD(null);loadQuestions();setScreen("play");};

  const lvl  = getLvl(stats.xp);
  const xp   = xpProg(stats.xp);
  const acc  = stats.totalAnswered>0?Math.round((stats.totalCorrect/stats.totalAnswered)*100):0;

  // count questions per deck from deckStats
  const deckCounts = stats.deckStats||{};

  return(
    <div id="app">
      <style>{CSS}</style>

      {/* Badge toasts */}
      {newBadges.map((b,i)=>(
        <div key={b.id} className="badge-toast" style={{top:60+i*68}}>
          <span style={{fontSize:28}}>{b.icon}</span>
          <div><div style={{fontSize:11,opacity:.7,fontWeight:700}}>BADGE UNLOCKED</div><div style={{fontWeight:900,fontSize:14}}>{b.name}</div></div>
        </div>
      ))}

      {screen==="splash" && <Splash/>}
      {screen==="login"  && <Login  onLogin={login}/>}
      {screen==="home"   && <Home   stats={stats} lvl={lvl} xp={xp} acc={acc} user={user} playDeck={playDeck} playAll={playAll} deckCounts={deckCounts} setScreen={setScreen}/>}
      {screen==="play"   && <Play   questions={questions} answer={answer} stats={stats} loading={loadingQ} activeDeck={activeDeck} setScreen={setScreen}/>}
      {screen==="rank"   && <Rank   lb={lb} loadLB={loadLB} user={user} setScreen={setScreen}/>}
      {screen==="status" && <Status stats={stats} lvl={lvl} xp={xp} acc={acc} setScreen={setScreen}/>}
      {screen==="manage" && <Manage questions={questions} loadQuestions={loadQuestions} user={user} isAdmin={isAdmin} tryPin={tryPin} lockAdmin={lockAdmin} setScreen={setScreen}/>}

      {!["splash","login","play"].includes(screen)&&(
        <nav>
          {[["home","🏠","Home"],["play","⚡","Play"],["rank","🏆","Rank"],["status","📊","Status"],["manage","⚙️","Manage"]].map(([s,ic,lb])=>(
            <button key={s} className={`nav-btn${screen===s?" active":""}`} onClick={()=>s==="play"?playAll():setScreen(s)}>
              <span>{ic}</span><span>{lb}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

// ─── GLOBAL CSS ───────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  html,body{background:#0b0b16;overscroll-behavior:none;}
  #app{font-family:'Nunito',sans-serif;background:#0b0b16;min-height:100dvh;color:#fff;max-width:430px;margin:0 auto;position:relative;overflow-x:hidden;}
  ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#2a2a45;border-radius:4px}
  input,textarea,button{font-family:'Nunito',sans-serif;}
  input,textarea{outline:none;color:#fff;}
  @keyframes pop{0%{transform:scale(.4) translateX(-50%);opacity:0}70%{transform:scale(1.1) translateX(-50%)}100%{transform:scale(1) translateX(-50%);opacity:1}}
  @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
  @keyframes slideUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
  @keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
  @keyframes xpUp{0%{transform:translateY(0) translateX(-50%);opacity:1}100%{transform:translateY(-50px) translateX(-50%);opacity:0}}
  @keyframes glow{0%,100%{box-shadow:0 0 12px rgba(74,222,128,.3)}50%{box-shadow:0 0 28px rgba(74,222,128,.8)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fillBar{from{width:0%}to{width:var(--w)}}
  .pop{animation:pop .4s cubic-bezier(.175,.885,.32,1.275) both}
  .su{animation:slideUp .3s ease both}
  .shake{animation:shake .4s ease}
  .float{animation:floatY 3s ease-in-out infinite}
  .pulse{animation:pulse 2s ease infinite}
  .spin{animation:spin 1s linear infinite}
  .btn{cursor:pointer;border:none;outline:none;transition:transform .12s,opacity .12s;-webkit-user-select:none;user-select:none;}
  .btn:active{transform:scale(.93);}
  .badge-toast{position:fixed;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#f59e0b,#f43f5e);border-radius:16px;padding:12px 20px;z-index:9999;animation:pop .4s ease both;display:flex;align-items:center;gap:10px;box-shadow:0 8px 28px rgba(245,158,11,.5);min-width:220px;max-width:380px;}
  nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;background:#111120;border-top:1.5px solid #1e1e35;display:flex;justify-content:space-around;padding:6px 0 max(10px, env(safe-area-inset-bottom));z-index:100;}
  .nav-btn{display:flex;flex-direction:column;align-items:center;gap:2px;background:none;border:none;cursor:pointer;padding:4px 10px;border-radius:10px;transition:background .2s;}
  .nav-btn span:first-child{font-size:20px;}
  .nav-btn span:last-child{font-size:10px;font-weight:700;color:#555;}
  .nav-btn.active{background:rgba(74,222,128,.1);}
  .nav-btn.active span:last-child{color:#4ade80;}
  .screen{padding:18px 16px calc(80px + env(safe-area-inset-bottom));overflow-y:auto;height:100dvh;}
  .card{background:#1a1a2e;border-radius:18px;border:1.5px solid #22223a;padding:16px;}
  .card-sm{background:#1a1a2e;border-radius:14px;border:1.5px solid #22223a;padding:13px;}
  .xp-bar-wrap{background:#ffffff14;border-radius:99px;height:10px;overflow:hidden;}
  .xp-bar{height:100%;border-radius:99px;transition:width .7s cubic-bezier(.4,0,.2,1);}
  .tag{display:inline-flex;align-items:center;gap:4px;background:#ffffff0f;border-radius:99px;padding:3px 10px;font-size:11px;font-weight:700;color:#aaa;}
  .input{width:100%;background:#12121e;border:2px solid #22223a;border-radius:12px;padding:12px 14px;font-size:15px;font-weight:700;transition:border-color .2s;}
  .input:focus{border-color:#4ade8066;}
  .textarea{width:100%;background:#12121e;border:2px solid #22223a;border-radius:12px;padding:12px 14px;font-size:13px;resize:vertical;min-height:100px;}
  .primary-btn{width:100%;background:linear-gradient(135deg,#4ade80,#22d3ee);border-radius:14px;padding:15px;font-size:17px;font-weight:900;color:#0b0b16;box-shadow:0 6px 24px rgba(74,222,128,.35);}
  .ghost-btn{width:100%;background:#1a1a2e;border:1.5px solid #22223a;border-radius:14px;padding:13px;font-size:14px;font-weight:700;color:#aaa;}
  .danger-btn{background:#f43f5e22;border:1.5px solid #f43f5e55;border-radius:10px;padding:7px 12px;font-size:12px;font-weight:800;color:#f43f5e;}
  .section-label{font-size:11px;font-weight:800;color:#666;letter-spacing:.06em;margin-bottom:6px;text-transform:uppercase;}
  .h1{font-size:22px;font-weight:900;}
  .h2{font-size:18px;font-weight:900;}
  .muted{color:#888;font-size:12px;}
  .green{color:#4ade80;}
  .gold{color:#f59e0b;}
`;

// ─── SPLASH ───────────────────────────────────────────────────────────────────
function Splash(){
  return(
    <div style={{height:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(160deg,#0b0b16,#12122a)"}}>
      <div style={{fontSize:72}} className="float">🧠</div>
      <div style={{fontSize:32,fontWeight:900,background:"linear-gradient(135deg,#4ade80,#60a5fa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginTop:14}}>LearnQuest</div>
      <div style={{fontSize:13,color:"#555",marginTop:6}}>Loading your adventure…</div>
      <div style={{width:36,height:36,border:"4px solid #1e1e33",borderTopColor:"#4ade80",borderRadius:"50%",marginTop:28}} className="spin"/>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({onLogin}){
  const[name,setName]=useState("");const[busy,setBusy]=useState(false);const[err,setErr]=useState("");
  const go=async()=>{
    if(name.trim().length<2){setErr("Minimum 2 characters");return;}
    setBusy(true);await onLogin(name.trim());setBusy(false);
  };
  return(
    <div style={{height:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px"}}>
      <div style={{fontSize:68,marginBottom:16}} className="float">🎮</div>
      <div style={{fontSize:30,fontWeight:900,background:"linear-gradient(135deg,#4ade80,#60a5fa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:6}}>LearnQuest</div>
      <div style={{fontSize:13,color:"#888",marginBottom:32,textAlign:"center"}}>Learn together. Compete together. 🏆</div>
      <div style={{width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:12}}>
        <div>
          <div className="section-label">Your Nickname</div>
          <input className="input" value={name} onChange={e=>{setName(e.target.value);setErr("");}}
            onKeyDown={e=>e.key==="Enter"&&go()} placeholder="e.g. Søren, Lars, Åse…"/>
          {err&&<div style={{fontSize:12,color:"#f43f5e",marginTop:5,fontWeight:700}}>{err}</div>}
        </div>
        <button className="btn primary-btn pulse" onClick={go} disabled={busy} style={{opacity:busy?.7:1}}>
          {busy?"Joining…":"🚀 Let's Go!"}
        </button>
        <div style={{fontSize:12,color:"#555",textAlign:"center"}}>No password needed · Progress auto-saves</div>
      </div>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function Home({stats,lvl,xp,acc,user,playDeck,playAll,deckCounts,setScreen}){
  const daily=Math.min(100,Math.round((stats.todayAnswered/stats.dailyGoal)*100));
  return(
    <div className="screen">
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div>
          <div style={{fontSize:12,color:"#666",fontWeight:700}}>WELCOME BACK 👋</div>
          <div style={{fontSize:24,fontWeight:900,background:"linear-gradient(135deg,#4ade80,#60a5fa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{user?.username}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:18,fontWeight:900,color:lvl.color}}>{lvl.icon} Lv.{lvl.level}</div>
          <div style={{fontSize:11,color:"#888",fontWeight:700}}>{stats.xp} XP</div>
        </div>
      </div>

      {/* XP Card */}
      <div className="card" style={{background:`linear-gradient(135deg,${lvl.color}18,${lvl.color}0a)`,border:`1.5px solid ${lvl.color}44`,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div><div style={{fontWeight:900,fontSize:15}}>{lvl.icon} {lvl.name}</div><div style={{fontSize:12,color:"#aaa"}}>Level {lvl.level}</div></div>
          {xp?<div style={{fontSize:12,color:lvl.color,fontWeight:800}}>{xp.needed} XP to go</div>:<div style={{fontSize:12,color:"#f59e0b",fontWeight:800}}>MAX!</div>}
        </div>
        <div className="xp-bar-wrap">
          <div className="xp-bar" style={{width:`${xp?xp.pct:100}%`,background:`linear-gradient(90deg,${lvl.color},#fff)`}}/>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
        {[["🎯",`${acc}%`,"Accuracy"],["🔥",stats.currentStreak,"Streak"],["✅",stats.totalCorrect,"Correct"]].map(([ic,v,lb])=>(
          <div key={lb} className="card-sm" style={{textAlign:"center"}}>
            <div style={{fontSize:18}}>{ic}</div>
            <div style={{fontSize:19,fontWeight:900}}>{v}</div>
            <div style={{fontSize:10,color:"#888",fontWeight:700}}>{lb}</div>
          </div>
        ))}
      </div>

      {/* Daily Goal */}
      <div className="card-sm" style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
          <span style={{fontWeight:800,fontSize:13}}>📅 Daily Goal</span>
          <span style={{fontSize:13,fontWeight:800,color:"#4ade80"}}>{stats.todayAnswered}/{stats.dailyGoal}</span>
        </div>
        <div className="xp-bar-wrap">
          <div className="xp-bar" style={{width:`${daily}%`,background:"linear-gradient(90deg,#4ade80,#22d3ee)"}}/>
        </div>
        <div style={{fontSize:11,color:"#888",marginTop:5}}>{daily>=100?"🎉 Daily goal complete!":` ${stats.dailyGoal-stats.todayAnswered} more to reach your goal`}</div>
      </div>

      {/* Play All */}
      <button className="btn primary-btn pulse" onClick={playAll} style={{marginBottom:14}}>⚡ PLAY — MIX ALL DECKS</button>

      {/* Decks */}
      <div className="section-label">YOUR DECKS</div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:8}}>
        {FIXED_DECKS.map(d=>{
          const ds=deckCounts[d.id]||{correct:0,answered:0,total:0};
          const pct=ds.answered>0?Math.round((ds.correct/ds.answered)*100):null;
          return(
            <button key={d.id} className="btn" onClick={()=>playDeck(d)}
              style={{background:"#1a1a2e",border:`1.5px solid ${d.color}33`,borderRadius:16,padding:"13px 15px",display:"flex",alignItems:"center",gap:13,textAlign:"left",width:"100%"}}>
              <div style={{width:44,height:44,borderRadius:12,background:`${d.color}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,border:`1.5px solid ${d.color}44`,flexShrink:0}}>{d.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:900,fontSize:15}}>{d.name}</div>
                <div style={{fontSize:11,color:"#888",marginTop:1}}>{d.desc}</div>
                {ds.answered>0&&(
                  <div style={{marginTop:6}}>
                    <div className="xp-bar-wrap" style={{height:5}}>
                      <div className="xp-bar" style={{width:`${pct}%`,background:d.color}}/>
                    </div>
                    <div style={{fontSize:10,color:"#888",marginTop:3}}>{pct}% accuracy · {ds.answered} played</div>
                  </div>
                )}
              </div>
              <div style={{fontSize:20,color:d.color,flexShrink:0}}>▶</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── PLAY ─────────────────────────────────────────────────────────────────────
function Play({questions,answer,stats,loading,activeDeck,setScreen}){
  const[qi,setQi]       = useState(null);
  const[sel,setSel]     = useState(null);
  const[done,setDone]   = useState(false);
  const[msg,setMsg]     = useState("");
  const[shake,setShake] = useState(false);
  const[xpShow,setXPS]  = useState(false);
  const[xpVal,setXPV]   = useState(0);
  const[ses,setSes]     = useState({c:0,w:0,streak:0});
  const[qn,setQn]       = useState(0);
  const used            = useRef([]);
  const SESSION         = 5;

  useEffect(()=>{
    if(questions.length>0&&qi===null){const i=Math.floor(Math.random()*questions.length);used.current=[i];setQi(i);}
  },[questions]);

  const reset=()=>{setDone(false);setQn(0);setSes({c:0,w:0,streak:0});setSel(null);setMsg("");used.current=[];
    const i=Math.floor(Math.random()*questions.length);used.current=[i];setQi(i);};

  if(loading||qi===null) return(
    <div style={{height:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:40,height:40,border:"4px solid #1e1e33",borderTopColor:"#4ade80",borderRadius:"50%"}} className="spin"/>
      <div style={{color:"#888",marginTop:14,fontSize:14}}>Loading{activeDeck?` ${activeDeck.name}`:""}…</div>
    </div>
  );
  if(questions.length===0) return(
    <div style={{height:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:28,textAlign:"center"}}>
      <div style={{fontSize:56,marginBottom:12}}>📭</div>
      <div style={{fontSize:18,fontWeight:900,marginBottom:8}}>No Questions Here!</div>
      <div style={{fontSize:13,color:"#888",marginBottom:20}}>Go to Manage → add questions to this deck.</div>
      <button className="btn primary-btn" onClick={()=>setScreen("manage")} style={{maxWidth:240}}>⚙️ Go to Manage</button>
    </div>
  );

  const q=questions[qi];
  const opts=[["A",q.option_a],["B",q.option_b],["C",q.option_c],["D",q.option_d]];
  const answered=sel!==null;

  const pick=(letter)=>{
    if(answered)return;
    setSel(letter);
    const ok=letter===q.correct;
    answer(ok, q.deck_id||activeDeck?.id||"other");
    const gain=ok?(10+Math.min(ses.streak,10)*2):0;
    if(gain>0){setXPV(gain);setXPS(true);setTimeout(()=>setXPS(false),1300);}
    if(ok){setMsg(rand(HIT));setSes(p=>({...p,c:p.c+1,streak:p.streak+1}));}
    else{setMsg(rand(MISS));setShake(true);setTimeout(()=>setShake(false),450);setSes(p=>({...p,w:p.w+1,streak:0}));}
  };

  const next=()=>{
    if(qn+1>=SESSION){setDone(true);return;}
    setQn(n=>n+1);setSel(null);setMsg("");
    let ni;let t=0;do{ni=Math.floor(Math.random()*questions.length);t++;}while(used.current.includes(ni)&&t<30);
    used.current.push(ni);setQi(ni);
  };

  if(done){
    const pct=Math.round((ses.c/SESSION)*100);
    return(
      <div style={{height:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
        <div style={{fontSize:72,marginBottom:12}} className="pop">{pct>=80?"🏆":pct>=60?"⭐":"💪"}</div>
        <div style={{fontSize:24,fontWeight:900,marginBottom:4}}>Round Done!</div>
        {activeDeck&&<div style={{fontSize:13,color:"#888",marginBottom:6}}>{activeDeck.icon} {activeDeck.name}</div>}
        <div style={{fontSize:44,fontWeight:900,color:"#4ade80",marginBottom:16}}>{pct}%</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%",maxWidth:320,marginBottom:20}}>
          {[["✅",ses.c,"Correct"],["❌",ses.w,"Wrong"]].map(([ic,v,l])=>(
            <div key={l} className="card" style={{textAlign:"center"}}>
              <div style={{fontSize:22}}>{ic}</div><div style={{fontSize:24,fontWeight:900}}>{v}</div>
              <div style={{fontSize:11,color:"#888",fontWeight:700}}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,width:"100%",maxWidth:320}}>
          <button className="btn primary-btn" onClick={reset}>⚡ Play Again</button>
          <button className="btn ghost-btn" onClick={()=>setScreen("home")}>🏠 Home</button>
        </div>
      </div>
    );
  }

  const C={
    correct:{bg:"#4ade8018",bd:"#4ade80",tx:"#4ade80"},
    wrong:  {bg:"#f43f5e18",bd:"#f43f5e",tx:"#f43f5e"},
    normal: {bg:"#1a1a2e",  bd:"#22223a",tx:"#fff"},
    dim:    {bg:"#1a1a2e66",bd:"#22223a55",tx:"#444"},
  };

  return(
    <div style={{height:"100dvh",display:"flex",flexDirection:"column",padding:"14px 16px calc(16px + env(safe-area-inset-bottom))"}}>
      {/* Top bar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexShrink:0}}>
        <button className="btn" onClick={()=>setScreen("home")} style={{background:"#1a1a2e",border:"1.5px solid #22223a",borderRadius:10,padding:"7px 13px",fontSize:13,fontWeight:700,color:"#aaa"}}>✕</button>
        <div style={{textAlign:"center"}}>
          {activeDeck&&<div style={{fontSize:10,color:"#888",fontWeight:700,marginBottom:3}}>{activeDeck.icon} {activeDeck.name}</div>}
          <div style={{display:"flex",gap:5}}>
            {Array.from({length:SESSION}).map((_,i)=>(
              <div key={i} style={{width:22,height:6,borderRadius:99,background:i<qn?"#4ade80":i===qn?"#60a5fa":"#22223a",transition:"background .3s"}}/>
            ))}
          </div>
        </div>
        <div style={{fontSize:13,fontWeight:800,color:"#f59e0b"}}>🔥{stats.currentStreak}</div>
      </div>

      {/* XP pop */}
      {xpShow&&<div style={{position:"fixed",top:"28%",left:"50%",fontSize:26,fontWeight:900,color:"#4ade80",zIndex:999,animation:"xpUp 1.3s ease forwards",pointerEvents:"none",whiteSpace:"nowrap"}}>+{xpVal} XP ⚡</div>}

      {/* Media */}
      {q.media_url&&(
        <div style={{marginBottom:12,borderRadius:14,overflow:"hidden",border:"1.5px solid #22223a",flexShrink:0}}>
          {/\.(jpg|jpeg|png|gif|webp)/i.test(q.media_url)&&<img src={q.media_url} alt="" style={{width:"100%",maxHeight:160,objectFit:"cover"}}/>}
          {/\.(mp4|webm)/i.test(q.media_url)&&<video src={q.media_url} controls style={{width:"100%",maxHeight:160}}/>}
          {/\.(mp3|wav|ogg)/i.test(q.media_url)&&<audio src={q.media_url} controls style={{width:"100%"}}/>}
        </div>
      )}

      {/* Question */}
      <div className={`card${shake?" shake":""}`} style={{marginBottom:12,flexShrink:0}}>
        <div style={{fontSize:10,color:"#888",fontWeight:700,marginBottom:5,textTransform:"uppercase"}}>{q.category||"Question"} · {qn+1}/{SESSION}</div>
        <div style={{fontSize:16,fontWeight:800,lineHeight:1.55}}>{q.question}</div>
      </div>

      {/* Options */}
      <div style={{display:"flex",flexDirection:"column",gap:8,flex:1}}>
        {opts.map(([letter,text])=>{
          let s=C.normal;
          if(answered){if(letter===q.correct)s=C.correct;else if(letter===sel)s=C.wrong;else s=C.dim;}
          return(
            <button key={letter} className="btn" onClick={()=>pick(letter)}
              style={{background:s.bg,border:`2px solid ${s.bd}`,borderRadius:14,padding:"12px 14px",display:"flex",alignItems:"center",gap:11,textAlign:"left",width:"100%",...(answered&&letter===q.correct?{animation:"glow 1s ease"}:{})}}>
              <span style={{width:30,height:30,borderRadius:8,background:answered?`${s.bd}28`:"#22223a",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:s.tx,flexShrink:0}}>{letter}</span>
              <span style={{fontSize:14,fontWeight:700,color:s.tx,flex:1,textAlign:"left"}}>{text}</span>
              {answered&&letter===q.correct&&<span style={{fontSize:16,flexShrink:0}}>✅</span>}
              {answered&&letter===sel&&letter!==q.correct&&<span style={{fontSize:16,flexShrink:0}}>❌</span>}
            </button>
          );
        })}
      </div>

      {/* Feedback */}
      {answered&&(
        <div style={{marginTop:10,flexShrink:0}} className="su">
          <div style={{background:sel===q.correct?"#4ade8018":"#f43f5e18",border:`1.5px solid ${sel===q.correct?"#4ade80":"#f43f5e"}`,borderRadius:14,padding:13,marginBottom:10}}>
            <div style={{fontWeight:900,fontSize:14,color:sel===q.correct?"#4ade80":"#f43f5e",marginBottom:q.explanation?3:0}}>{msg}</div>
            {q.explanation&&<div style={{fontSize:12,color:"#ccc",lineHeight:1.5}}>💡 {q.explanation}</div>}
          </div>
          <button className="btn primary-btn" onClick={next}>{qn+1>=SESSION?"🏆 See Results":"➡️ Next"}</button>
        </div>
      )}
    </div>
  );
}

// ─── RANK ─────────────────────────────────────────────────────────────────────
function Rank({lb,loadLB,user,setScreen}){
  const[busy,setBusy]=useState(true);
  useEffect(()=>{(async()=>{setBusy(true);await loadLB();setBusy(false);})();},[]);
  const medals=["🥇","🥈","🥉"];
  return(
    <div className="screen">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div className="h1">🏆 Leaderboard</div>
        <button className="btn" onClick={()=>{setBusy(true);loadLB().then(()=>setBusy(false));}} style={{background:"#1a1a2e",border:"1.5px solid #22223a",borderRadius:10,padding:"7px 12px",fontSize:12,fontWeight:800,color:"#60a5fa"}}>↺ Refresh</button>
      </div>
      {busy?(
        <div style={{display:"flex",justifyContent:"center",paddingTop:48}}><div style={{width:34,height:34,border:"4px solid #1e1e33",borderTopColor:"#4ade80",borderRadius:"50%"}} className="spin"/></div>
      ):lb.length===0?(
        <div style={{textAlign:"center",color:"#888",paddingTop:48,fontSize:14}}>No players yet — be the first! 🚀</div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:9}}>
          {lb.map((p,i)=>{
            const me=sanitize(p.username||"")===user?.id;
            const lv=getLvl(p.xp||0);
            return(
              <div key={p.username+i} className="su" style={{background:me?"linear-gradient(135deg,#4ade8012,#22d3ee0a)":"#1a1a2e",border:`1.5px solid ${me?"#4ade8055":"#22223a"}`,borderRadius:15,padding:"13px 15px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:i<3?26:15,fontWeight:900,minWidth:32,textAlign:"center",color:i<3?"#fff":"#888"}}>{i<3?medals[i]:`#${i+1}`}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:900,fontSize:14,display:"flex",alignItems:"center",gap:6}}>{p.username}{me&&<span style={{fontSize:10,color:"#4ade80",fontWeight:700}}>(you)</span>}</div>
                  <div style={{fontSize:11,color:"#888"}}>{lv.icon} {lv.name} · {p.total_answered||0} answered · 🏆 {p.best_streak||0} streak</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:17,fontWeight:900,color:"#f59e0b"}}>{p.xp||0}</div>
                  <div style={{fontSize:10,color:"#888",fontWeight:700}}>XP</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── STATUS ───────────────────────────────────────────────────────────────────
function Status({stats,lvl,xp,acc,setScreen}){
  const bars=[
    {label:"Accuracy",     value:acc,      max:100, color:"#4ade80", suffix:"%"},
    {label:"Daily Goal",   value:Math.min(stats.todayAnswered,stats.dailyGoal), max:stats.dailyGoal, color:"#22d3ee", suffix:`/${stats.dailyGoal}`},
  ];
  return(
    <div className="screen">
      <div className="h1" style={{marginBottom:18}}>📊 Your Status</div>

      {/* Level card */}
      <div className="card" style={{background:`linear-gradient(135deg,${lvl.color}18,${lvl.color}0a)`,border:`1.5px solid ${lvl.color}44`,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div>
            <div style={{fontSize:13,color:"#aaa",fontWeight:700}}>CURRENT LEVEL</div>
            <div style={{fontSize:22,fontWeight:900,marginTop:2}}>{lvl.icon} {lvl.name}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:28,fontWeight:900,color:"#f59e0b"}}>{stats.xp}</div>
            <div style={{fontSize:11,color:"#888",fontWeight:700}}>TOTAL XP</div>
          </div>
        </div>
        <div className="xp-bar-wrap" style={{height:12,marginBottom:6}}>
          <div className="xp-bar" style={{width:`${xp?xp.pct:100}%`,background:`linear-gradient(90deg,${lvl.color},#fff)`}}/>
        </div>
        {xp?<div style={{fontSize:12,color:lvl.color,fontWeight:700,textAlign:"right"}}>{xp.needed} XP to Level {lvl.level+1}</div>
           :<div style={{fontSize:13,color:"#f59e0b",fontWeight:800,textAlign:"right"}}>🌟 MAX LEVEL!</div>}
      </div>

      {/* Stat grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        {[
          ["🎯",`${acc}%`,       "Accuracy",       acc>=80?"#4ade80":acc>=50?"#f59e0b":"#f43f5e"],
          ["⚡", stats.currentStreak, "Current Streak", "#60a5fa"],
          ["🏆", stats.bestStreak,    "Best Streak",    "#f59e0b"],
          ["✅", stats.totalCorrect,  "Total Correct",  "#4ade80"],
          ["📝", stats.totalAnswered, "Total Answered", "#a78bfa"],
          ["🏅", stats.earnedBadges?.length||0, "Badges", "#f59e0b"],
        ].map(([ic,v,lb,col])=>(
          <div key={lb} className="card-sm">
            <div style={{fontSize:20}}>{ic}</div>
            <div style={{fontSize:22,fontWeight:900,color:col,marginTop:2}}>{v}</div>
            <div style={{fontSize:11,color:"#888",fontWeight:700,marginTop:1}}>{lb}</div>
          </div>
        ))}
      </div>

      {/* Progress bars */}
      <div className="card" style={{marginBottom:12}}>
        {bars.map(b=>(
          <div key={b.label} style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontWeight:800,fontSize:13}}>{b.label}</span>
              <span style={{fontSize:13,fontWeight:800,color:b.color}}>{b.value}{b.suffix}</span>
            </div>
            <div className="xp-bar-wrap" style={{height:10}}>
              <div className="xp-bar" style={{width:`${Math.min(100,Math.round((b.value/b.max)*100))}%`,background:b.color}}/>
            </div>
          </div>
        ))}
      </div>

      {/* Per-deck */}
      <div className="card" style={{marginBottom:12}}>
        <div style={{fontWeight:900,fontSize:15,marginBottom:14}}>🗂️ Per-Deck Accuracy</div>
        {FIXED_DECKS.map(d=>{
          const ds=stats.deckStats?.[d.id]||{correct:0,answered:0};
          const pct=ds.answered>0?Math.round((ds.correct/ds.answered)*100):null;
          return(
            <div key={d.id} style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,alignItems:"center"}}>
                <span style={{fontWeight:800,fontSize:13}}>{d.icon} {d.name}</span>
                <span style={{fontSize:12,color:pct!==null?d.color:"#555",fontWeight:700}}>
                  {pct!==null?`${pct}% · ${ds.answered} played`:"Not played yet"}
                </span>
              </div>
              <div className="xp-bar-wrap" style={{height:8}}>
                <div className="xp-bar" style={{width:`${pct||0}%`,background:d.color}}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* Level roadmap */}
      <div className="card" style={{marginBottom:8}}>
        <div style={{fontWeight:900,fontSize:15,marginBottom:14}}>🗺️ Level Roadmap</div>
        {LEVELS.map((l,i)=>{
          const done=stats.xp>=l.xpRequired;
          const cur=lvl.level===l.level;
          return(
            <div key={l.level} style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                <div style={{width:38,height:38,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,background:done?`${l.color}33`:"#22223a",border:`2px solid ${done?l.color:"#22223a"}`,flexShrink:0,...(cur?{animation:"pulse 2s ease infinite"}:{})}}>{done?l.icon:"🔒"}</div>
                {i<LEVELS.length-1&&<div style={{width:2,height:16,background:done?l.color:"#22223a"}}/>}
              </div>
              <div style={{flex:1,paddingBottom:i<LEVELS.length-1?12:0}}>
                <div style={{fontWeight:800,color:done?"#fff":"#555",fontSize:13}}>{l.name}{cur?" ← YOU":""}</div>
                <div style={{fontSize:11,color:done?l.color:"#444"}}>{l.xpRequired} XP</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Badges */}
      <div className="section-label" style={{marginBottom:8,marginTop:4}}>BADGES ({stats.earnedBadges?.length||0}/{BADGES.length})</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {BADGES.map(b=>{
          const e=stats.earnedBadges?.includes(b.id);
          return(
            <div key={b.id} style={{background:e?"#1a1a2e":"#111118",borderRadius:16,padding:16,border:`1.5px solid ${e?"#f59e0b44":"#22223a"}`,textAlign:"center",opacity:e?1:.4,position:"relative"}}>
              {e&&<div style={{position:"absolute",top:7,right:9,fontSize:9,color:"#f59e0b",fontWeight:800}}>✓</div>}
              <div style={{fontSize:34,marginBottom:7,filter:e?"none":"grayscale(1)"}}>{b.icon}</div>
              <div style={{fontSize:12,fontWeight:900,marginBottom:3}}>{b.name}</div>
              <div style={{fontSize:10,color:"#888",lineHeight:1.4}}>{b.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MANAGE ───────────────────────────────────────────────────────────────────
function Manage({questions,loadQuestions,user,isAdmin,tryPin,lockAdmin,setScreen}){
  const[authed,setAuthed]=useState(isAdmin);
  const handlePin=(pin)=>{const ok=tryPin(pin);if(ok)setAuthed(true);return ok;};
  if(!authed)return<PinGate onSuccess={handlePin} onCancel={()=>setScreen("home")}/>;
  return<ManageInner questions={questions} loadQuestions={loadQuestions} user={user} onLock={()=>{lockAdmin();setAuthed(false);}} setScreen={setScreen}/>;
}

function ManageInner({questions,loadQuestions,user,onLock,setScreen}){
  const[tab,setTab]   = useState("add");
  const[toast,setToast]= useState("");
  const showToast=(m)=>{setToast(m);setTimeout(()=>setToast(""),2600);};

  return(
    <div className="screen">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div className="h1">⚙️ Manage</div>
        <button className="btn danger-btn" onClick={onLock}>🔒 Lock</button>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[["add","➕ Add"],["csv","📂 CSV"],["view","📋 View"],["clear","🗑️ Clear"]].map(([t,l])=>(
          <button key={t} className="btn" onClick={()=>setTab(t)}
            style={{flex:1,padding:"9px 4px",borderRadius:11,fontSize:11,fontWeight:800,border:"none",background:tab===t?"#4ade80":"#1a1a2e",color:tab===t?"#0b0b16":"#888"}}>{l}</button>
        ))}
      </div>

      {toast&&<div className="pop" style={{background:toast.startsWith("❌")?"#f43f5e22":"#4ade8022",border:`1.5px solid ${toast.startsWith("❌")?"#f43f5e":"#4ade80"}`,borderRadius:12,padding:"11px 14px",marginBottom:14,textAlign:"center",fontWeight:800,color:toast.startsWith("❌")?"#f43f5e":"#4ade80"}}>{toast}</div>}

      {tab==="add"   && <AddTab   loadQuestions={loadQuestions} user={user} toast={showToast}/>}
      {tab==="csv"   && <CSVTab   loadQuestions={loadQuestions} user={user} toast={showToast}/>}
      {tab==="view"  && <ViewTab  questions={questions} loadQuestions={loadQuestions} toast={showToast}/>}
      {tab==="clear" && <ClearTab loadQuestions={loadQuestions} toast={showToast}/>}
    </div>
  );
}

function AddTab({loadQuestions,user,toast}){
  const E={question:"",option_a:"",option_b:"",option_c:"",option_d:"",correct:"A",explanation:"",media_url:"",category:""};
  const[f,setF]=useState(E);const[deck,setDeck]=useState(FIXED_DECKS[0].id);const[busy,setBusy]=useState(false);
  const upd=k=>e=>setF(p=>({...p,[k]:e.target.value}));
  const save=async()=>{
    if(!f.question||!f.option_a||!f.option_b||!f.option_c||!f.option_d){toast("❌ Fill all required fields");return;}
    setBusy(true);
    const{error}=await supabase.from("questions").insert({...f,deck_id:deck,media_url:f.media_url||null,created_by:user?.id});
    if(error){toast("❌ "+error.message);setBusy(false);return;}
    await loadQuestions(deck);setF(E);setBusy(false);toast("✅ Question added!");
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div>
        <div className="section-label">Deck</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {FIXED_DECKS.map(d=>(
            <button key={d.id} className="btn" onClick={()=>setDeck(d.id)}
              style={{padding:"7px 12px",borderRadius:10,fontSize:12,fontWeight:800,border:`2px solid ${deck===d.id?d.color:"#22223a"}`,background:deck===d.id?`${d.color}22`:"#1a1a2e",color:deck===d.id?d.color:"#888"}}>{d.icon} {d.name}</button>
          ))}
        </div>
      </div>
      {[["question","❓ Question *"],["option_a","A *"],["option_b","B *"],["option_c","C *"],["option_d","D *"],["category","Category"],["explanation","Explanation"],["media_url","Media URL (image/audio/video)"]].map(([k,lb])=>(
        <div key={k}>
          <div className="section-label">{lb}</div>
          <input className="input" value={f[k]} onChange={upd(k)} placeholder={lb}/>
        </div>
      ))}
      <div>
        <div className="section-label">Correct Answer</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
          {["A","B","C","D"].map(l=>(
            <button key={l} className="btn" onClick={()=>setF(p=>({...p,correct:l}))}
              style={{padding:12,borderRadius:11,fontWeight:900,fontSize:15,border:"2px solid",borderColor:f.correct===l?"#4ade80":"#22223a",background:f.correct===l?"#4ade8022":"#1a1a2e",color:f.correct===l?"#4ade80":"#888"}}>{l}</button>
          ))}
        </div>
      </div>
      <button className="btn primary-btn" onClick={save} disabled={busy} style={{marginTop:4,opacity:busy?.7:1}}>{busy?"Saving…":"➕ Add Question"}</button>
    </div>
  );
}

function CSVTab({loadQuestions,user,toast}){
  const[deck,setDeck]   = useState(FIXED_DECKS[0].id);
  const[csv,setCsv]     = useState("");
  const[busy,setBusy]   = useState(false);
  const fileRef         = useRef();


  // fix the above
  const readFile=(e)=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();r.onload=ev=>setCsv(ev.target.result);r.readAsText(f,"UTF-8");
    if(fileRef.current)fileRef.current.value="";
  };

  const doImport=async()=>{
    const rows=parseCSV(csv,deck);
    if(!rows.length){toast("❌ No valid rows found. Check format.");return;}
    setBusy(true);
    const{error}=await supabase.from("questions").insert(rows.map(q=>({...q,created_by:user?.id})));
    if(error){toast("❌ "+error.message);setBusy(false);return;}
    await loadQuestions(deck);setCsv("");setBusy(false);
    toast(`✅ ${rows.length} questions imported into ${FIXED_DECKS.find(d=>d.id===deck)?.name}!`);
  };

  const template=`Question,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Media Link,Category\n"Hvad er Danmarks hovedstad?","Aarhus","Odense","København","Aalborg","C","København er Danmarks hovedstad.","","Geografi"\n"What is 2+2?","3","4","5","6","B","Basic addition!","","Math"\n`;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div>
        <div className="section-label">Target Deck</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {FIXED_DECKS.map(d=>(
            <button key={d.id} className="btn" onClick={()=>setDeck(d.id)}
              style={{padding:"7px 12px",borderRadius:10,fontSize:12,fontWeight:800,border:`2px solid ${deck===d.id?d.color:"#22223a"}`,background:deck===d.id?`${d.color}22`:"#1a1a2e",color:deck===d.id?d.color:"#888"}}>{d.icon} {d.name}</button>
          ))}
        </div>
      </div>
      <div className="card-sm" style={{fontSize:12,color:"#aaa",lineHeight:1.8}}>
        <div style={{fontWeight:800,color:"#60a5fa",marginBottom:4}}>📋 CSV Column Order:</div>
        Question, Option A, Option B, Option C, Option D,<br/>Correct Answer (A/B/C/D), Explanation, Media Link, Category<br/>
        <span style={{color:"#4ade80",fontSize:11}}>✅ Supports æ ø å 🇩🇰</span>
      </div>
      <button className="btn ghost-btn" onClick={()=>{const b=new Blob([template],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="learnquest_template.csv";a.click();}}>⬇️ Download Template CSV</button>
      <button className="btn" onClick={()=>fileRef.current?.click()} style={{background:"#1a1a2e",border:"2px dashed #4ade80",borderRadius:14,padding:13,fontSize:13,fontWeight:800,color:"#4ade80"}}>📁 Upload CSV File</button>
      <input ref={fileRef} type="file" accept=".csv,.txt" onChange={readFile} style={{display:"none"}}/>
      <div>
        <div className="section-label">Or Paste CSV Text</div>
        <textarea className="textarea" value={csv} onChange={e=>setCsv(e.target.value)} placeholder={"Question,Option A,...\n\"Hvad er...\",\"Svar A\",..."} style={{background:"#1a1a2e",border:"1.5px solid #22223a",color:"#fff"}}/>
      </div>
      <button className="btn primary-btn" onClick={doImport} disabled={busy||!csv.trim()} style={{opacity:(busy||!csv.trim())?.5:1}}>{busy?"⏳ Importing…":"📂 Import to Deck"}</button>
    </div>
  );
}

function ViewTab({questions,loadQuestions,toast}){
  const[deck,setDeck]=useState("all");const[del,setDel]=useState(null);
  const filtered=deck==="all"?questions:questions.filter(q=>q.deck_id===deck);
  const remove=async(id)=>{
    setDel(id);
    await supabase.from("questions").delete().eq("id",id);
    await loadQuestions(deck==="all"?null:deck);
    setDel(null);toast("🗑️ Deleted");
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div>
        <div className="section-label">Filter by Deck</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:4}}>
          <button className="btn" onClick={()=>{setDeck("all");loadQuestions();}} style={{padding:"7px 12px",borderRadius:10,fontSize:12,fontWeight:800,border:`2px solid ${deck==="all"?"#4ade80":"#22223a"}`,background:deck==="all"?"#4ade8022":"#1a1a2e",color:deck==="all"?"#4ade80":"#888"}}>All ({questions.length})</button>
          {FIXED_DECKS.map(d=>{const cnt=questions.filter(q=>q.deck_id===d.id).length;return(
            <button key={d.id} className="btn" onClick={()=>{setDeck(d.id);loadQuestions(d.id);}} style={{padding:"7px 12px",borderRadius:10,fontSize:12,fontWeight:800,border:`2px solid ${deck===d.id?d.color:"#22223a"}`,background:deck===d.id?`${d.color}22`:"#1a1a2e",color:deck===d.id?d.color:"#888"}}>{d.icon} {cnt}</button>
          );})}
        </div>
      </div>
      {filtered.length===0&&<div style={{textAlign:"center",color:"#888",padding:24,fontSize:13}}>No questions here yet.</div>}
      {filtered.map((q,i)=>(
        <div key={q.id} className="card-sm" style={{display:"flex",gap:10,alignItems:"flex-start"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:10,color:"#888",fontWeight:700,marginBottom:2}}>{i+1}. {FIXED_DECKS.find(d=>d.id===q.deck_id)?.icon||"❓"} {q.category||"General"}</div>
            <div style={{fontSize:13,fontWeight:700,lineHeight:1.4}}>{q.question}</div>
            <div style={{fontSize:11,color:"#4ade80",marginTop:3}}>✅ {q.correct}: {q[`option_${q.correct?.toLowerCase()}`]}</div>
          </div>
          <button className="btn danger-btn" onClick={()=>remove(q.id)} disabled={del===q.id} style={{flexShrink:0,padding:"6px 10px"}}>{del===q.id?"…":"🗑️"}</button>
        </div>
      ))}
    </div>
  );
}

function ClearTab({loadQuestions,toast}){
  const[confirm,setConfirm]=useState(null);const[busy,setBusy]=useState(false);
  const doClear=async(deckId)=>{
    setBusy(true);
    if(deckId==="ALL"){await supabase.from("questions").delete().neq("id","00000000-0000-0000-0000-000000000000");}
    else{await supabase.from("questions").delete().eq("deck_id",deckId);}
    await loadQuestions();setConfirm(null);setBusy(false);
    toast(`✅ ${deckId==="ALL"?"All questions":"Deck"} cleared!`);
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div className="card-sm" style={{background:"#f43f5e15",border:"1.5px solid #f43f5e44"}}>
        <div style={{fontWeight:800,color:"#f43f5e",fontSize:13,marginBottom:4}}>⚠️ Danger Zone</div>
        <div style={{fontSize:12,color:"#aaa",lineHeight:1.5}}>Deleting questions is permanent and cannot be undone. Each button below clears only that deck's questions.</div>
      </div>
      {FIXED_DECKS.map(d=>(
        <div key={d.id}>
          {confirm===d.id?(
            <div className="card-sm" style={{background:"#f43f5e15",border:"1.5px solid #f43f5e44"}}>
              <div style={{fontSize:13,fontWeight:800,marginBottom:10}}>Delete ALL {d.icon} {d.name} questions?</div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn danger-btn" onClick={()=>doClear(d.id)} disabled={busy} style={{flex:1,padding:"10px"}}>{busy?"…":"Yes, delete all"}</button>
                <button className="btn ghost-btn" onClick={()=>setConfirm(null)} style={{flex:1,padding:"10px",fontSize:13}}>Cancel</button>
              </div>
            </div>
          ):(
            <button className="btn" onClick={()=>setConfirm(d.id)} style={{width:"100%",background:"#1a1a2e",border:"1.5px solid #f43f5e44",borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
              <span style={{fontSize:22}}>{d.icon}</span>
              <div style={{flex:1}}><div style={{fontWeight:800,fontSize:14}}>{d.name}</div><div style={{fontSize:11,color:"#888"}}>Clear all questions in this deck</div></div>
              <span style={{color:"#f43f5e",fontSize:18}}>🗑️</span>
            </button>
          )}
        </div>
      ))}
      <div style={{height:1,background:"#22223a",margin:"4px 0"}}/>
      {confirm==="ALL"?(
        <div className="card-sm" style={{background:"#f43f5e15",border:"1.5px solid #f43f5e"}}>
          <div style={{fontSize:13,fontWeight:800,marginBottom:10,color:"#f43f5e"}}>⚠️ Delete EVERYTHING?</div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn danger-btn" onClick={()=>doClear("ALL")} disabled={busy} style={{flex:1,padding:"10px"}}>{busy?"…":"Yes, delete ALL"}</button>
            <button className="btn ghost-btn" onClick={()=>setConfirm(null)} style={{flex:1,padding:"10px",fontSize:13}}>Cancel</button>
          </div>
        </div>
      ):(
        <button className="btn" onClick={()=>setConfirm("ALL")} style={{background:"#f43f5e22",border:"1.5px solid #f43f5e",borderRadius:14,padding:"12px 16px",fontWeight:900,fontSize:14,color:"#f43f5e"}}>🗑️ Clear ALL Decks (everything)</button>
      )}
    </div>
  );
}

// ─── PIN GATE ─────────────────────────────────────────────────────────────────
function PinGate({onSuccess,onCancel}){
  const[pin,setPin]=useState(["","","",""]);const[err,setErr]=useState(false);
  const refs=[useRef(),useRef(),useRef(),useRef()];
  const press=(i,val)=>{
    if(!/^\d?$/.test(val))return;
    const p=[...pin];p[i]=val;setPin(p);setErr(false);
    if(val&&i<3)refs[i+1].current?.focus();
    if(p.every(d=>d!="")){
      const code=p.join("");
      if(!onSuccess(code)){setErr(true);setPin(["","","",""]);setTimeout(()=>refs[0].current?.focus(),60);}
    }
  };
  return(
    <div style={{height:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px",textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:14}}>🔐</div>
      <div style={{fontSize:20,fontWeight:900,marginBottom:6}}>Admin Access</div>
      <div style={{fontSize:13,color:"#888",marginBottom:28}}>Enter your 4-digit PIN to manage content</div>
      <div style={{display:"flex",gap:12,marginBottom:14}}>
        {pin.map((d,i)=>(
          <input key={i} ref={refs[i]} value={d} onChange={e=>press(i,e.target.value)} maxLength={1} type="password"
            style={{width:54,height:62,background:"#1a1a2e",border:`2px solid ${err?"#f43f5e":"#22223a"}`,borderRadius:14,fontSize:26,fontWeight:900,color:"#fff",textAlign:"center",fontFamily:"inherit",outline:"none"}}/>
        ))}
      </div>
      {err&&<div style={{color:"#f43f5e",fontWeight:800,marginBottom:14,fontSize:13}} className="shake">❌ Wrong PIN — try again</div>}
      <button className="btn ghost-btn" onClick={onCancel} style={{maxWidth:200,marginTop:4}}>Cancel</button>
    </div>
  );
}
