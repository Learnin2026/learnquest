import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE CONFIG ─────────────────────────────────────────────────────────
// 👇 REPLACE THESE with your real values from Supabase (Step 3 in the guide)
const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY_HERE";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const BADGES = [
  { id: "first_correct", name: "First Blood", icon: "🎯", desc: "Get your first correct answer", condition: (s) => s.totalCorrect >= 1 },
  { id: "streak_3", name: "On Fire!", icon: "🔥", desc: "3 correct in a row", condition: (s) => s.currentStreak >= 3 },
  { id: "streak_5", name: "Unstoppable", icon: "⚡", desc: "5 correct in a row", condition: (s) => s.currentStreak >= 5 },
  { id: "level_2", name: "Rising Star", icon: "⭐", desc: "Reach Level 2", condition: (s) => s.level >= 2 },
  { id: "level_5", name: "Scholar", icon: "🎓", desc: "Reach Level 5", condition: (s) => s.level >= 5 },
  { id: "accuracy_80", name: "Sharp Mind", icon: "🧠", desc: "80%+ accuracy (min 5 answered)", condition: (s) => s.totalAnswered >= 5 && (s.totalCorrect / s.totalAnswered) >= 0.8 },
  { id: "questions_10", name: "Dedicated", icon: "💪", desc: "Answer 10 questions", condition: (s) => s.totalAnswered >= 10 },
  { id: "questions_50", name: "Legend", icon: "👑", desc: "Answer 50 questions", condition: (s) => s.totalAnswered >= 50 },
];

const LEVELS = [
  { level: 1, name: "Seedling",    icon: "🌱", xpRequired: 0,    color: "#4ade80" },
  { level: 2, name: "Explorer",   icon: "🧭", xpRequired: 100,  color: "#60a5fa" },
  { level: 3, name: "Adventurer", icon: "⚔️", xpRequired: 250,  color: "#a78bfa" },
  { level: 4, name: "Champion",   icon: "🏆", xpRequired: 500,  color: "#f59e0b" },
  { level: 5, name: "Legend",     icon: "👑", xpRequired: 1000, color: "#f43f5e" },
  { level: 6, name: "Grandmaster",icon: "🌟", xpRequired: 2000, color: "#ec4899" },
];

const CORRECT_MSGS = ["Nailed it! 🎉","Boom! 💥","You're on fire! 🔥","Genius! 🧠","Perfect! ✨","Crushing it! 💪","Outstanding! 🌟"];
const WRONG_MSGS   = ["Almost! Keep going 😅","Not quite, but you got this! 💙","Oops! Learn & move on 📚","So close! 😤","Mistakes = Growth 🌱"];

function getLevel(xp) {
  let cur = LEVELS[0];
  for (const l of LEVELS) { if (xp >= l.xpRequired) cur = l; }
  return cur;
}
function getNextLevel(xp) {
  for (const l of LEVELS) { if (xp < l.xpRequired) return l; }
  return null;
}
function xpProgress(xp) {
  const next = getNextLevel(xp);
  if (!next) return null;
  const cur = getLevel(xp);
  return { needed: next.xpRequired - xp, total: next.xpRequired - cur.xpRequired, earned: xp - cur.xpRequired };
}
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[\s_]/g, "").replace(/['"]/g,""));
  const questions = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]; const vals = []; let cur = ""; let inQ = false;
    for (let c = 0; c < raw.length; c++) {
      if (raw[c] === '"') { inQ = !inQ; continue; }
      if (raw[c] === ',' && !inQ) { vals.push(cur.trim()); cur = ""; continue; }
      cur += raw[c];
    }
    vals.push(cur.trim());
    if (vals.length < 5) continue;
    const r = {}; headers.forEach((h,idx) => r[h] = vals[idx]||"");
    questions.push({
      question: r["question"]||r["q"]||"",
      option_a: r["optiona"]||r["a"]||"",
      option_b: r["optionb"]||r["b"]||"",
      option_c: r["optionc"]||r["c"]||"",
      option_d: r["optiond"]||r["d"]||"",
      correct: (r["correctanswer"]||r["correct"]||"A").toUpperCase().trim(),
      explanation: r["explanation"]||"",
      media_url: r["medialink"]||r["media"]||r["mediaurl"]||null,
      category: r["category"]||"General",
    });
  }
  return questions.filter(q => q.question && q.option_a);
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("splash");
  const [user, setUser] = useState(null); // { id, username }
  const [questions, setQuestions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [stats, setStats] = useState({ xp: 0, level: 1, totalCorrect: 0, totalAnswered: 0, currentStreak: 0, bestStreak: 0, earnedBadges: [], todayAnswered: 0, dailyGoal: 10 });
  const [newBadges, setNewBadges] = useState([]);
  const [loadingQ, setLoadingQ] = useState(false);

  // ── Load questions from Supabase
  const loadQuestions = useCallback(async () => {
    setLoadingQ(true);
    const { data } = await supabase.from("questions").select("*").order("created_at", { ascending: false });
    if (data) setQuestions(data);
    setLoadingQ(false);
  }, []);

  // ── Load leaderboard
  const loadLeaderboard = useCallback(async () => {
    const { data } = await supabase.from("players").select("username, xp, level, total_correct, total_answered, earned_badges").order("xp", { ascending: false }).limit(20);
    if (data) setLeaderboard(data);
  }, []);

  // ── Load player stats
  const loadStats = useCallback(async (userId) => {
    const { data } = await supabase.from("players").select("*").eq("id", userId).single();
    if (data) {
      setStats({
        xp: data.xp || 0,
        level: data.level || 1,
        totalCorrect: data.total_correct || 0,
        totalAnswered: data.total_answered || 0,
        currentStreak: data.current_streak || 0,
        bestStreak: data.best_streak || 0,
        earnedBadges: data.earned_badges || [],
        todayAnswered: data.today_answered || 0,
        dailyGoal: data.daily_goal || 10,
      });
    }
  }, []);

  // ── Save stats to Supabase
  const saveStats = useCallback(async (userId, newStats) => {
    await supabase.from("players").upsert({
      id: userId,
      username: user?.username,
      xp: newStats.xp,
      level: newStats.level,
      total_correct: newStats.totalCorrect,
      total_answered: newStats.totalAnswered,
      current_streak: newStats.currentStreak,
      best_streak: newStats.bestStreak,
      earned_badges: newStats.earnedBadges,
      today_answered: newStats.todayAnswered,
      daily_goal: newStats.dailyGoal,
      updated_at: new Date().toISOString(),
    });
  }, [user]);

  // ── Update stats after answering
  const updateStats = useCallback((correct) => {
    if (!user) return;
    setStats(prev => {
      const newStreak = correct ? prev.currentStreak + 1 : 0;
      const newXP = prev.xp + (correct ? (10 + newStreak * 2) : 0);
      const newLevel = getLevel(newXP).level;
      const updated = {
        ...prev, xp: newXP, level: newLevel,
        totalCorrect: prev.totalCorrect + (correct ? 1 : 0),
        totalAnswered: prev.totalAnswered + 1,
        currentStreak: newStreak,
        bestStreak: Math.max(prev.bestStreak, newStreak),
        todayAnswered: prev.todayAnswered + 1,
      };
      const earned = BADGES.filter(b => !prev.earnedBadges.includes(b.id) && b.condition(updated));
      if (earned.length > 0) {
        updated.earnedBadges = [...prev.earnedBadges, ...earned.map(b => b.id)];
        setNewBadges(earned);
        setTimeout(() => setNewBadges([]), 3000);
      }
      saveStats(user.id, updated);
      return updated;
    });
  }, [user, saveStats]);

  useEffect(() => {
    const saved = localStorage.getItem("lq_user");
    if (saved) {
      const u = JSON.parse(saved);
      setUser(u);
      loadStats(u.id);
      loadQuestions();
      setScreen("home");
    } else {
      setTimeout(() => setScreen("login"), 1800);
    }
  }, []);

  const handleLogin = async (username) => {
    const id = username.toLowerCase().replace(/\s/g, "_");
    const { data: existing } = await supabase.from("players").select("*").eq("id", id).single();
    const u = { id, username };
    if (!existing) {
      await supabase.from("players").insert({ id, username, xp: 0, level: 1, total_correct: 0, total_answered: 0, current_streak: 0, best_streak: 0, earned_badges: [], today_answered: 0, daily_goal: 10 });
    } else {
      loadStats(id);
    }
    localStorage.setItem("lq_user", JSON.stringify(u));
    setUser(u);
    loadQuestions();
    setScreen("home");
  };

  const currLevel = getLevel(stats.xp);
  const xpInfo = xpProgress(stats.xp);
  const accuracy = stats.totalAnswered > 0 ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100) : 0;

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", background: "#0b0b16", minHeight: "100vh", color: "#fff", maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#333;border-radius:4px}
        @keyframes pop{0%{transform:scale(0.4);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
        @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
        @keyframes slideUp{from{transform:translateY(28px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
        @keyframes xpFloat{0%{transform:translateY(0);opacity:1}100%{transform:translateY(-60px);opacity:0}}
        @keyframes glow{0%,100%{box-shadow:0 0 16px rgba(74,222,128,.4)}50%{box-shadow:0 0 36px rgba(74,222,128,.9)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .pop{animation:pop .4s cubic-bezier(.175,.885,.32,1.275) forwards}
        .shake{animation:shake .4s ease}
        .slide-up{animation:slideUp .35s ease forwards}
        .btn{cursor:pointer;border:none;outline:none;transition:all .15s}
        .btn:active{transform:scale(.94)}
        input{outline:none}
      `}</style>

      {/* Badge toasts */}
      {newBadges.map((b, i) => (
        <div key={b.id} style={{ position:"fixed", top:72+i*76, left:"50%", transform:"translateX(-50%)", background:"linear-gradient(135deg,#f59e0b,#f43f5e)", borderRadius:16, padding:"12px 22px", zIndex:9999, animation:"pop .4s ease", display:"flex", alignItems:"center", gap:10, boxShadow:"0 8px 32px rgba(245,158,11,.5)", minWidth:230 }}>
          <span style={{fontSize:30}}>{b.icon}</span>
          <div><div style={{fontWeight:900,fontSize:12,opacity:.8}}>BADGE UNLOCKED!</div><div style={{fontWeight:900,fontSize:15}}>{b.name}</div></div>
        </div>
      ))}

      {screen === "splash"    && <SplashScreen />}
      {screen === "login"     && <LoginScreen onLogin={handleLogin} />}
      {screen === "home"      && <HomeScreen stats={stats} currLevel={currLevel} xpInfo={xpInfo} accuracy={accuracy} setScreen={setScreen} questions={questions} user={user} />}
      {screen === "learn"     && <LearnScreen questions={questions} updateStats={updateStats} setScreen={setScreen} stats={stats} loadQuestions={loadQuestions} loadingQ={loadingQ} />}
      {screen === "leaderboard" && <LeaderboardScreen leaderboard={leaderboard} loadLeaderboard={loadLeaderboard} user={user} setScreen={setScreen} />}
      {screen === "admin"     && <AdminScreen questions={questions} setScreen={setScreen} loadQuestions={loadQuestions} user={user} />}
      {screen === "progress"  && <ProgressScreen stats={stats} currLevel={currLevel} xpInfo={xpInfo} accuracy={accuracy} setScreen={setScreen} user={user} />}
      {screen === "badges"    && <BadgesScreen stats={stats} setScreen={setScreen} />}

      {/* Bottom Nav */}
      {!["splash","login","learn"].includes(screen) && (
        <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:"#12121f", borderTop:"2px solid #1e1e33", display:"flex", justifyContent:"space-around", padding:"8px 0 14px", zIndex:100 }}>
          {[["home","🏠","Home"],["learn","⚡","Play"],["leaderboard","🏆","Ranks"],["progress","📊","Stats"],["admin","⚙️","Manage"]].map(([s,icon,label]) => (
            <button key={s} className="btn" onClick={() => setScreen(s)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, background:"none", padding:"4px 10px", borderRadius:10, ...(screen===s?{background:"rgba(74,222,128,.12)"}:{}) }}>
              <span style={{fontSize:22}}>{icon}</span>
              <span style={{fontSize:10,fontWeight:700,color:screen===s?"#4ade80":"#555"}}>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SPLASH ───────────────────────────────────────────────────────────────────
function SplashScreen() {
  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"linear-gradient(160deg,#0b0b16,#12122a)" }}>
      <div style={{ fontSize:80, animation:"float 2s ease-in-out infinite" }}>🧠</div>
      <div style={{ fontSize:36, fontWeight:900, background:"linear-gradient(135deg,#4ade80,#60a5fa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginTop:12 }}>LearnQuest</div>
      <div style={{ fontSize:14, color:"#555", marginTop:8 }}>Loading your adventure...</div>
      <div style={{ width:40, height:40, border:"4px solid #1e1e33", borderTopColor:"#4ade80", borderRadius:"50%", animation:"spin 1s linear infinite", marginTop:32 }} />
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const handle = async () => {
    if (!name.trim() || name.trim().length < 2) { setErr("Name must be at least 2 characters"); return; }
    setLoading(true); setErr("");
    await onLogin(name.trim());
    setLoading(false);
  };
  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:28 }}>
      <div style={{ fontSize:72, marginBottom:16, animation:"float 3s ease-in-out infinite" }}>🎮</div>
      <div style={{ fontSize:32, fontWeight:900, background:"linear-gradient(135deg,#4ade80,#60a5fa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:6 }}>LearnQuest</div>
      <div style={{ fontSize:14, color:"#888", marginBottom:36, textAlign:"center" }}>Compete with friends. Learn together. 🏆</div>
      <div style={{ width:"100%", marginBottom:16 }}>
        <div style={{ fontSize:12, color:"#888", fontWeight:700, marginBottom:6 }}>YOUR NICKNAME</div>
        <input value={name} onChange={e=>{setName(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&handle()}
          placeholder="e.g. SuperLearner99"
          style={{ width:"100%", background:"#1a1a2e", border:"2px solid #2a2a45", borderRadius:14, padding:"14px 18px", fontSize:16, color:"#fff", fontFamily:"inherit", fontWeight:700 }} />
        {err && <div style={{ fontSize:12, color:"#f43f5e", marginTop:6 }}>{err}</div>}
      </div>
      <button className="btn" onClick={handle} disabled={loading}
        style={{ width:"100%", background:"linear-gradient(135deg,#4ade80,#22d3ee)", borderRadius:16, padding:16, fontSize:18, fontWeight:900, color:"#0b0b16", boxShadow:"0 8px 28px rgba(74,222,128,.4)", opacity:loading?0.7:1 }}>
        {loading ? "Joining..." : "🚀 Join & Play"}
      </button>
      <div style={{ fontSize:12, color:"#555", marginTop:16, textAlign:"center" }}>No password needed — just pick a nickname!<br/>Your progress is saved automatically.</div>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeScreen({ stats, currLevel, xpInfo, accuracy, setScreen, questions, user }) {
  const dailyPct = Math.min(100, Math.round((stats.todayAnswered / stats.dailyGoal) * 100));
  return (
    <div style={{ padding:"22px 18px 110px", overflowY:"auto", maxHeight:"100vh" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:12, color:"#666", fontWeight:700 }}>WELCOME BACK 👋</div>
          <div style={{ fontSize:26, fontWeight:900, background:"linear-gradient(135deg,#4ade80,#60a5fa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>{user?.username}</div>
        </div>
        <button className="btn" onClick={()=>setScreen("leaderboard")} style={{ background:"#1a1a2e", border:"1px solid #2a2a45", borderRadius:12, padding:"8px 14px", fontSize:13, fontWeight:800, color:"#f59e0b" }}>🏆 Ranks</button>
      </div>

      {/* Level card */}
      <div style={{ background:`linear-gradient(135deg,${currLevel.color}20,${currLevel.color}10)`, border:`2px solid ${currLevel.color}55`, borderRadius:20, padding:18, marginBottom:14, animation:"float 3s ease-in-out infinite" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <div>
            <div style={{ fontSize:11, color:"#888", fontWeight:700 }}>CURRENT LEVEL</div>
            <div style={{ fontSize:22, fontWeight:900 }}>{currLevel.icon} {currLevel.name}</div>
            <div style={{ fontSize:12, color:"#aaa" }}>Level {currLevel.level} · {stats.xp} XP</div>
          </div>
          <div style={{ fontSize:44 }}>{currLevel.icon}</div>
        </div>
        {xpInfo ? (
          <>
            <div style={{ background:"#ffffff18", borderRadius:99, height:10, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${Math.round((xpInfo.earned/xpInfo.total)*100)}%`, background:`linear-gradient(90deg,${currLevel.color},#fff)`, borderRadius:99, transition:"width .6s ease" }} />
            </div>
            <div style={{ fontSize:11, color:"#aaa", marginTop:5, textAlign:"right" }}>{xpInfo.needed} XP to next level</div>
          </>
        ) : <div style={{ fontSize:13, color:"#f59e0b", fontWeight:800 }}>🌟 MAX LEVEL!</div>}
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
        {[["🎯",`${accuracy}%`,"Accuracy"],["⚡",stats.currentStreak,"Streak"],["✅",stats.totalCorrect,"Correct"]].map(([icon,val,label])=>(
          <div key={label} style={{ background:"#1a1a2e", borderRadius:14, padding:"12px 8px", textAlign:"center", border:"1px solid #2a2a45" }}>
            <div style={{fontSize:18}}>{icon}</div>
            <div style={{fontSize:20,fontWeight:900}}>{val}</div>
            <div style={{fontSize:10,color:"#888",fontWeight:700}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Daily goal */}
      <div style={{ background:"#1a1a2e", borderRadius:16, padding:14, marginBottom:14, border:"1px solid #2a2a45" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <span style={{fontWeight:800,fontSize:13}}>📅 Daily Goal</span>
          <span style={{fontSize:13,color:"#4ade80",fontWeight:700}}>{stats.todayAnswered}/{stats.dailyGoal}</span>
        </div>
        <div style={{ background:"#ffffff11", borderRadius:99, height:11, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${dailyPct}%`, background:"linear-gradient(90deg,#4ade80,#22d3ee)", borderRadius:99, transition:"width .6s ease" }} />
        </div>
        <div style={{ fontSize:11, color:"#888", marginTop:5 }}>{dailyPct>=100?"🎉 Goal complete! Amazing!":` ${stats.dailyGoal-stats.todayAnswered} more to hit your daily goal`}</div>
      </div>

      <button className="btn" onClick={()=>setScreen("learn")} style={{ width:"100%", background:"linear-gradient(135deg,#4ade80,#22d3ee)", borderRadius:18, padding:18, fontSize:19, fontWeight:900, color:"#0b0b16", boxShadow:"0 8px 32px rgba(74,222,128,.4)", animation:"pulse 2s ease infinite", marginBottom:10 }}>
        ⚡ START LEARNING
      </button>
      <div style={{textAlign:"center",fontSize:12,color:"#555"}}>{questions.length} questions available · Shared with your group</div>
    </div>
  );
}

// ─── LEARN ────────────────────────────────────────────────────────────────────
function LearnScreen({ questions, updateStats, setScreen, stats, loadingQ }) {
  const [qIndex, setQIndex] = useState(null);
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [session, setSession] = useState({ correct:0, wrong:0, streak:0 });
  const [xpGained, setXpGained] = useState(0);
  const [showXP, setShowXP] = useState(false);
  const [msg, setMsg] = useState("");
  const [shake, setShake] = useState(false);
  const [done, setDone] = useState(false);
  const [qCount, setQCount] = useState(0);
  const SESSION_LEN = 5;
  const usedRef = useRef([]);

  useEffect(() => {
    if (questions.length > 0 && qIndex === null) {
      const i = Math.floor(Math.random() * questions.length);
      usedRef.current = [i];
      setQIndex(i);
    }
  }, [questions]);

  if (loadingQ || qIndex === null) return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
      <div style={{ width:44, height:44, border:"4px solid #1e1e33", borderTopColor:"#4ade80", borderRadius:"50%", animation:"spin 1s linear infinite" }} />
      <div style={{color:"#888",marginTop:16,fontSize:14}}>Loading questions...</div>
    </div>
  );

  if (questions.length === 0) return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:28, textAlign:"center" }}>
      <div style={{fontSize:64, marginBottom:16}}>📭</div>
      <div style={{fontSize:20, fontWeight:900, marginBottom:8}}>No Questions Yet!</div>
      <div style={{fontSize:14, color:"#888", marginBottom:24}}>Go to Manage tab and upload your CSV to add questions.</div>
      <button className="btn" onClick={()=>setScreen("admin")} style={{ background:"linear-gradient(135deg,#4ade80,#22d3ee)", borderRadius:14, padding:"14px 28px", fontSize:15, fontWeight:900, color:"#0b0b16" }}>⚙️ Add Questions</button>
    </div>
  );

  const q = questions[qIndex];
  const opts = [["A",q.option_a],["B",q.option_b],["C",q.option_c],["D",q.option_d]];

  const handleAnswer = (letter) => {
    if (answered) return;
    setSelected(letter);
    setAnswered(true);
    const correct = letter === q.correct;
    updateStats(correct);
    const gain = correct ? (10 + session.streak * 2) : 0;
    if (gain > 0) { setXpGained(gain); setShowXP(true); setTimeout(()=>setShowXP(false),1400); }
    if (correct) {
      setMsg(CORRECT_MSGS[Math.floor(Math.random()*CORRECT_MSGS.length)]);
      setSession(p=>({...p,correct:p.correct+1,streak:p.streak+1}));
    } else {
      setMsg(WRONG_MSGS[Math.floor(Math.random()*WRONG_MSGS.length)]);
      setShake(true); setTimeout(()=>setShake(false),500);
      setSession(p=>({...p,wrong:p.wrong+1,streak:0}));
    }
  };

  const handleNext = () => {
    if (qCount+1 >= SESSION_LEN) { setDone(true); return; }
    setQCount(c=>c+1); setSelected(null); setAnswered(false); setMsg("");
    let ni; let tries = 0;
    do { ni = Math.floor(Math.random()*questions.length); tries++; } while (usedRef.current.includes(ni) && tries < 20);
    usedRef.current.push(ni); setQIndex(ni);
  };

  const pct = Math.round((session.correct/SESSION_LEN)*100);

  if (done) return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, textAlign:"center" }}>
      <div style={{fontSize:76,marginBottom:14,animation:"pop .5s ease"}}>{pct>=80?"🏆":pct>=60?"⭐":"💪"}</div>
      <div style={{fontSize:26,fontWeight:900,marginBottom:6}}>Round Complete!</div>
      <div style={{fontSize:46,fontWeight:900,color:"#4ade80",marginBottom:4}}>{pct}%</div>
      <div style={{fontSize:14,color:"#888",marginBottom:22}}>{session.correct}/{SESSION_LEN} correct</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%",marginBottom:22}}>
        {[["✅",session.correct,"Correct"],["❌",session.wrong,"Wrong"]].map(([ic,v,l])=>(
          <div key={l} style={{background:"#1a1a2e",borderRadius:14,padding:16,border:"1px solid #2a2a45"}}>
            <div style={{fontSize:22}}>{ic}</div><div style={{fontSize:26,fontWeight:900}}>{v}</div>
            <div style={{fontSize:11,color:"#888",fontWeight:700}}>{l}</div>
          </div>
        ))}
      </div>
      <button className="btn" onClick={()=>{setDone(false);setQCount(0);setSession({correct:0,wrong:0,streak:0});setSelected(null);setAnswered(false);setMsg("");usedRef.current=[];const i=Math.floor(Math.random()*questions.length);usedRef.current=[i];setQIndex(i);}} style={{width:"100%",background:"linear-gradient(135deg,#4ade80,#22d3ee)",borderRadius:16,padding:16,fontSize:17,fontWeight:900,color:"#0b0b16",marginBottom:10}}>
        ⚡ Play Again
      </button>
      <button className="btn" onClick={()=>setScreen("leaderboard")} style={{width:"100%",background:"#1a1a2e",borderRadius:16,padding:14,fontSize:14,fontWeight:700,color:"#f59e0b",border:"1px solid #2a2a45",marginBottom:10}}>
        🏆 See Leaderboard
      </button>
      <button className="btn" onClick={()=>setScreen("home")} style={{width:"100%",background:"#1a1a2e",borderRadius:16,padding:14,fontSize:14,fontWeight:700,color:"#aaa",border:"1px solid #2a2a45"}}>
        🏠 Back Home
      </button>
    </div>
  );

  const C = { correct:{bg:"#4ade8022",border:"#4ade80",text:"#4ade80"}, wrong:{bg:"#f43f5e22",border:"#f43f5e",text:"#f43f5e"}, neutral:{bg:"#1a1a2e",border:"#2a2a45",text:"#fff"}, dimmed:{bg:"#1a1a2e66",border:"#2a2a4555",text:"#444"} };

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", padding:"18px 18px 28px" }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <button className="btn" onClick={()=>setScreen("home")} style={{background:"#1a1a2e",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,color:"#aaa",border:"1px solid #2a2a45"}}>✕ Quit</button>
        <div style={{display:"flex",gap:6}}>
          {Array.from({length:SESSION_LEN}).map((_,i)=>(
            <div key={i} style={{width:26,height:8,borderRadius:99,background:i<qCount?"#4ade80":i===qCount?"#60a5fa":"#2a2a45",transition:"background .3s"}} />
          ))}
        </div>
        <div style={{fontSize:13,fontWeight:800,color:"#f59e0b"}}>🔥 {stats.currentStreak}</div>
      </div>

      {showXP && <div style={{position:"fixed",top:"30%",left:"50%",transform:"translateX(-50%)",fontSize:30,fontWeight:900,color:"#4ade80",zIndex:999,animation:"xpFloat 1.4s ease forwards",pointerEvents:"none"}}>+{xpGained} XP ⚡</div>}

      {q.media_url && (
        <div style={{marginBottom:14,borderRadius:14,overflow:"hidden",border:"2px solid #2a2a45"}}>
          {/\.(jpg|jpeg|png|gif|webp)/i.test(q.media_url) && <img src={q.media_url} alt="" style={{width:"100%",maxHeight:180,objectFit:"cover"}} />}
          {/\.(mp4|webm)/i.test(q.media_url) && <video src={q.media_url} controls style={{width:"100%",maxHeight:180}} />}
          {/\.(mp3|wav|ogg)/i.test(q.media_url) && <audio src={q.media_url} controls style={{width:"100%"}} />}
        </div>
      )}

      <div style={{background:"#1a1a2e",borderRadius:18,padding:20,marginBottom:18,border:"1px solid #2a2a45"}} className={shake?"shake":""}>
        <div style={{fontSize:10,color:"#888",fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>{q.category||"Question"} · {qCount+1}/{SESSION_LEN}</div>
        <div style={{fontSize:17,fontWeight:800,lineHeight:1.55}}>{q.question}</div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:9,flex:1}}>
        {opts.map(([letter,text])=>{
          let s = C.neutral;
          if (answered) { if(letter===q.correct) s=C.correct; else if(letter===selected) s=C.wrong; else s=C.dimmed; }
          return (
            <button key={letter} className="btn" onClick={()=>handleAnswer(letter)}
              style={{background:s.bg,border:`2px solid ${s.border}`,borderRadius:15,padding:"13px 16px",display:"flex",alignItems:"center",gap:12,textAlign:"left",transition:"all .2s",...(answered&&letter===q.correct?{animation:"glow 1s ease"}:{})}}>
              <span style={{width:32,height:32,borderRadius:9,background:answered?`${s.border}33`:"#2a2a45",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:s.text,flexShrink:0}}>{letter}</span>
              <span style={{fontSize:14,fontWeight:700,color:s.text,flex:1}}>{text}</span>
              {answered&&letter===q.correct&&<span style={{fontSize:18}}>✅</span>}
              {answered&&letter===selected&&letter!==q.correct&&<span style={{fontSize:18}}>❌</span>}
            </button>
          );
        })}
      </div>

      {answered && (
        <div style={{marginTop:14,animation:"slideUp .3s ease"}}>
          <div style={{background:selected===q.correct?"#4ade8022":"#f43f5e22",border:`2px solid ${selected===q.correct?"#4ade80":"#f43f5e"}`,borderRadius:15,padding:14,marginBottom:10}}>
            <div style={{fontWeight:900,fontSize:15,color:selected===q.correct?"#4ade80":"#f43f5e",marginBottom:q.explanation?4:0}}>{msg}</div>
            {q.explanation&&<div style={{fontSize:13,color:"#ccc",lineHeight:1.5}}>💡 {q.explanation}</div>}
          </div>
          <button className="btn" onClick={handleNext} style={{width:"100%",background:"linear-gradient(135deg,#4ade80,#22d3ee)",borderRadius:15,padding:15,fontSize:16,fontWeight:900,color:"#0b0b16"}}>
            {qCount+1>=SESSION_LEN?"🏆 See Results":"➡️ Next"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
function LeaderboardScreen({ leaderboard, loadLeaderboard, user, setScreen }) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => { setLoading(true); await loadLeaderboard(); setLoading(false); })();
  }, []);
  const medals = ["🥇","🥈","🥉"];
  return (
    <div style={{padding:"22px 18px 110px",overflowY:"auto",maxHeight:"100vh"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:22,fontWeight:900}}>🏆 Leaderboard</div>
        <button className="btn" onClick={()=>{setLoading(true);loadLeaderboard().then(()=>setLoading(false));}} style={{background:"#1a1a2e",border:"1px solid #2a2a45",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:800,color:"#60a5fa"}}>↺ Refresh</button>
      </div>
      {loading ? (
        <div style={{display:"flex",justifyContent:"center",padding:40}}>
          <div style={{width:36,height:36,border:"4px solid #1e1e33",borderTopColor:"#4ade80",borderRadius:"50%",animation:"spin 1s linear infinite"}} />
        </div>
      ) : leaderboard.length === 0 ? (
        <div style={{textAlign:"center",color:"#888",padding:40,fontSize:14}}>No players yet. Be the first! 🚀</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {leaderboard.map((p,i)=>{
            const isMe = p.username?.toLowerCase().replace(/\s/g,"_") === user?.id;
            const lv = getLevel(p.xp||0);
            return (
              <div key={p.username} style={{background:isMe?"linear-gradient(135deg,#4ade8015,#22d3ee15)":"#1a1a2e",border:`2px solid ${isMe?"#4ade8066":"#2a2a45"}`,borderRadius:16,padding:"14px 16px",display:"flex",alignItems:"center",gap:14,animation:"slideUp .3s ease"}}>
                <div style={{fontSize:i<3?28:16,fontWeight:900,minWidth:36,textAlign:"center",color:i>=3?"#888":"#fff"}}>{i<3?medals[i]:`#${i+1}`}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:900,fontSize:15}}>{p.username} {isMe&&<span style={{fontSize:11,color:"#4ade80",fontWeight:700}}>(you)</span>}</div>
                  <div style={{fontSize:11,color:"#888"}}>{lv.icon} {lv.name} · {p.total_answered||0} answered</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:18,fontWeight:900,color:"#f59e0b"}}>{p.xp||0}</div>
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

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function AdminScreen({ questions, setScreen, loadQuestions, user }) {
  const [tab, setTab] = useState("list");
  const [form, setForm] = useState({question:"",option_a:"",option_b:"",option_c:"",option_d:"",correct:"A",explanation:"",media_url:"",category:""});
  const [csvText, setCsvText] = useState("");
  const [saved, setSaved] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();

  const toast = (msg) => { setSaved(msg); setTimeout(()=>setSaved(""),2500); };

  const handleAdd = async () => {
    if (!form.question||!form.option_a||!form.option_b||!form.option_c||!form.option_d) { toast("❌ Fill in all required fields"); return; }
    const { error } = await supabase.from("questions").insert({ ...form, media_url: form.media_url||null, created_by: user?.id });
    if (error) { toast("❌ Error: "+error.message); return; }
    await loadQuestions();
    setForm({question:"",option_a:"",option_b:"",option_c:"",option_d:"",correct:"A",explanation:"",media_url:"",category:""});
    toast("✅ Question added!");
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    await supabase.from("questions").delete().eq("id", id);
    await loadQuestions();
    setDeleting(null);
  };

  const handleCSVImport = async () => {
    const parsed = parseCSV(csvText);
    if (!parsed.length) { toast("❌ No valid rows found. Check format."); return; }
    setImporting(true);
    const rows = parsed.map(q=>({...q, created_by: user?.id}));
    const { error } = await supabase.from("questions").insert(rows);
    if (error) { toast("❌ "+error.message); setImporting(false); return; }
    await loadQuestions();
    setCsvText(""); setImporting(false);
    toast(`✅ ${parsed.length} questions imported!`);
    setTab("list");
  };

  const handleFile = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => setCsvText(ev.target.result); r.readAsText(f);
  };

  const CSV_TEMPLATE = `Question,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Media Link,Category\n"What is 2+2?","3","4","5","6","B","Basic addition!","","Math"\n"Capital of France?","London","Berlin","Paris","Rome","C","Paris is the capital city.","","Geography"\n`;

  return (
    <div style={{padding:"22px 18px 110px",overflowY:"auto",maxHeight:"100vh"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <div style={{fontSize:22,fontWeight:900}}>⚙️ Manage</div>
        <div style={{fontSize:13,color:"#4ade80",fontWeight:700}}>{questions.length} questions</div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:18}}>
        {[["list","📋 List"],["add","➕ Add"],["csv","📂 CSV"]].map(([t,l])=>(
          <button key={t} className="btn" onClick={()=>setTab(t)} style={{flex:1,padding:"10px 4px",borderRadius:12,fontSize:12,fontWeight:800,border:"none",background:tab===t?"#4ade80":"#1a1a2e",color:tab===t?"#0b0b16":"#888"}}>{l}</button>
        ))}
      </div>

      {saved && <div style={{background:saved.startsWith("❌")?"#f43f5e22":"#4ade8022",border:`1px solid ${saved.startsWith("❌")?"#f43f5e":"#4ade80"}`,borderRadius:12,padding:12,marginBottom:14,textAlign:"center",fontWeight:800,color:saved.startsWith("❌")?"#f43f5e":"#4ade80",animation:"pop .3s ease"}}>{saved}</div>}

      {tab==="list" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {questions.length===0 && <div style={{textAlign:"center",color:"#888",padding:32,fontSize:14}}>No questions yet. Add some! 👆</div>}
          {questions.map((q,i)=>(
            <div key={q.id} style={{background:"#1a1a2e",borderRadius:14,padding:14,border:"1px solid #2a2a45",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:"#888",fontWeight:700,marginBottom:2}}>{i+1}. {q.category||"General"}</div>
                <div style={{fontSize:13,fontWeight:700,lineHeight:1.4}}>{q.question}</div>
                <div style={{fontSize:11,color:"#4ade80",marginTop:4}}>✅ {q.correct}: {q[`option_${q.correct.toLowerCase()}`]}</div>
              </div>
              <button className="btn" onClick={()=>handleDelete(q.id)} disabled={deleting===q.id} style={{background:"#f43f5e22",border:"1px solid #f43f5e44",borderRadius:8,padding:"6px 10px",fontSize:12,color:"#f43f5e",flexShrink:0}}>
                {deleting===q.id?"...":"🗑️"}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab==="add" && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {[["question","❓ Question *"],["option_a","Option A *"],["option_b","Option B *"],["option_c","Option C *"],["option_d","Option D *"],["category","Category"],["explanation","Explanation (optional)"],["media_url","Media URL (image/audio/video)"]].map(([key,label])=>(
            <div key={key}>
              <div style={{fontSize:11,color:"#888",fontWeight:700,marginBottom:4}}>{label}</div>
              <input value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}
                style={{width:"100%",background:"#1a1a2e",border:"2px solid #2a2a45",borderRadius:12,padding:"12px 14px",fontSize:14,color:"#fff",fontFamily:"inherit"}} placeholder={label} />
            </div>
          ))}
          <div>
            <div style={{fontSize:11,color:"#888",fontWeight:700,marginBottom:6}}>✅ Correct Answer *</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
              {["A","B","C","D"].map(l=>(
                <button key={l} className="btn" onClick={()=>setForm(p=>({...p,correct:l}))} style={{padding:12,borderRadius:12,fontWeight:900,fontSize:15,border:"2px solid",borderColor:form.correct===l?"#4ade80":"#2a2a45",background:form.correct===l?"#4ade8022":"#1a1a2e",color:form.correct===l?"#4ade80":"#888"}}>{l}</button>
              ))}
            </div>
          </div>
          <button className="btn" onClick={handleAdd} style={{background:"linear-gradient(135deg,#4ade80,#22d3ee)",borderRadius:14,padding:16,fontSize:16,fontWeight:900,color:"#0b0b16",marginTop:4}}>
            ➕ Add Question
          </button>
        </div>
      )}

      {tab==="csv" && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:"#1a1a2e",borderRadius:14,padding:16,border:"1px solid #2a2a45"}}>
            <div style={{fontSize:13,fontWeight:800,marginBottom:8,color:"#60a5fa"}}>📋 CSV Column Order:</div>
            <div style={{fontSize:11,color:"#aaa",fontFamily:"monospace",background:"#0b0b16",borderRadius:10,padding:12,lineHeight:2}}>
              Question, Option A, Option B,<br/>Option C, Option D, Correct Answer,<br/>Explanation, Media Link, Category
            </div>
            <div style={{fontSize:11,color:"#888",marginTop:8}}>Correct Answer = A, B, C, or D</div>
          </div>
          <button className="btn" onClick={()=>{const blob=new Blob([CSV_TEMPLATE],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="learnquest_template.csv";a.click();}} style={{background:"#1a1a2e",border:"2px dashed #2a2a45",borderRadius:14,padding:14,fontSize:13,fontWeight:800,color:"#60a5fa"}}>
            ⬇️ Download Template CSV
          </button>
          <button className="btn" onClick={()=>fileRef.current.click()} style={{background:"#1a1a2e",border:"2px dashed #4ade80",borderRadius:14,padding:14,fontSize:13,fontWeight:800,color:"#4ade80"}}>
            📁 Upload CSV File
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{display:"none"}} />
          <div>
            <div style={{fontSize:11,color:"#888",fontWeight:700,marginBottom:6}}>OR PASTE CSV TEXT:</div>
            <textarea value={csvText} onChange={e=>setCsvText(e.target.value)} rows={7}
              placeholder={"Question,Option A,...\n\"Your question\",\"Opt A\",..."}
              style={{width:"100%",background:"#1a1a2e",border:"2px solid #2a2a45",borderRadius:12,padding:12,fontSize:12,color:"#fff",fontFamily:"monospace",resize:"vertical",outline:"none"}} />
          </div>
          <button className="btn" onClick={handleCSVImport} disabled={importing} style={{background:"linear-gradient(135deg,#4ade80,#22d3ee)",borderRadius:14,padding:16,fontSize:16,fontWeight:900,color:"#0b0b16",opacity:importing?0.7:1}}>
            {importing?"⏳ Importing...":"📂 Import Questions"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── PROGRESS ─────────────────────────────────────────────────────────────────
function ProgressScreen({ stats, currLevel, xpInfo, accuracy, user }) {
  return (
    <div style={{padding:"22px 18px 110px",overflowY:"auto",maxHeight:"100vh"}}>
      <div style={{fontSize:22,fontWeight:900,marginBottom:20}}>📊 Your Progress</div>
      <div style={{background:`linear-gradient(135deg,${currLevel.color}22,${currLevel.color}11)`,border:`2px solid ${currLevel.color}55`,borderRadius:20,padding:20,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div>
            <div style={{fontSize:20,fontWeight:900}}>{currLevel.icon} Level {currLevel.level}</div>
            <div style={{fontSize:13,color:"#aaa"}}>{currLevel.name}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:26,fontWeight:900,color:"#f59e0b"}}>{stats.xp}</div>
            <div style={{fontSize:11,color:"#888"}}>Total XP</div>
          </div>
        </div>
        {xpInfo ? (
          <>
            <div style={{background:"#ffffff11",borderRadius:99,height:12,overflow:"hidden",marginBottom:5}}>
              <div style={{height:"100%",width:`${Math.round((xpInfo.earned/xpInfo.total)*100)}%`,background:`linear-gradient(90deg,${currLevel.color},#fff)`,borderRadius:99}} />
            </div>
            <div style={{fontSize:12,color:"#aaa"}}>{xpInfo.needed} XP to next level</div>
          </>
        ) : <div style={{fontSize:13,color:"#f59e0b",fontWeight:800}}>🌟 MAX LEVEL REACHED!</div>}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        {[["🎯",`${accuracy}%`,"Accuracy"],["⚡",stats.currentStreak,"Current Streak"],["🏆",stats.bestStreak,"Best Streak"],["✅",stats.totalCorrect,"Total Correct"],["📝",stats.totalAnswered,"Total Answered"],["🏅",stats.earnedBadges.length,"Badges Earned"]].map(([icon,val,label])=>(
          <div key={label} style={{background:"#1a1a2e",borderRadius:14,padding:14,border:"1px solid #2a2a45"}}>
            <div style={{fontSize:22}}>{icon}</div>
            <div style={{fontSize:24,fontWeight:900}}>{val}</div>
            <div style={{fontSize:10,color:"#888",fontWeight:700}}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{background:"#1a1a2e",borderRadius:20,padding:18,border:"1px solid #2a2a45"}}>
        <div style={{fontSize:15,fontWeight:900,marginBottom:14}}>🗺️ Level Roadmap</div>
        {LEVELS.map((l,i)=>{
          const unlocked = stats.xp >= l.xpRequired;
          const isCur = currLevel.level === l.level;
          return (
            <div key={l.level} style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                <div style={{width:42,height:42,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,background:unlocked?`${l.color}33`:"#2a2a45",border:`2px solid ${unlocked?l.color:"#2a2a45"}`,...(isCur?{animation:"pulse 2s ease infinite"}:{})}}>
                  {unlocked?l.icon:"🔒"}
                </div>
                {i<LEVELS.length-1&&<div style={{width:2,height:18,background:unlocked?l.color:"#2a2a45"}} />}
              </div>
              <div style={{flex:1,paddingBottom:i<LEVELS.length-1?16:0}}>
                <div style={{fontWeight:800,color:unlocked?"#fff":"#555",fontSize:14}}>{l.name} {isCur?"← YOU":""}</div>
                <div style={{fontSize:11,color:unlocked?l.color:"#444"}}>{l.xpRequired} XP required</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── BADGES ───────────────────────────────────────────────────────────────────
function BadgesScreen({ stats }) {
  return (
    <div style={{padding:"22px 18px 110px",overflowY:"auto",maxHeight:"100vh"}}>
      <div style={{fontSize:22,fontWeight:900,marginBottom:6}}>🏅 Badges</div>
      <div style={{fontSize:13,color:"#888",marginBottom:20}}>{stats.earnedBadges.length}/{BADGES.length} unlocked</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {BADGES.map(b=>{
          const earned = stats.earnedBadges.includes(b.id);
          return (
            <div key={b.id} style={{background:earned?"#1a1a2e":"#111118",borderRadius:18,padding:18,border:`2px solid ${earned?"#f59e0b55":"#1a1a2e"}`,textAlign:"center",opacity:earned?1:0.45,position:"relative"}}>
              {earned&&<div style={{position:"absolute",top:8,right:10,fontSize:10,color:"#f59e0b",fontWeight:800}}>✓</div>}
              <div style={{fontSize:38,marginBottom:8,filter:earned?"none":"grayscale(1)"}}>{b.icon}</div>
              <div style={{fontSize:13,fontWeight:900,marginBottom:4}}>{b.name}</div>
              <div style={{fontSize:11,color:"#888",lineHeight:1.4}}>{b.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
