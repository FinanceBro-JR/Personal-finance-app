/**
 * Cheda — Personal Finance (Uganda)
 * Features: Auth (sign up / sign in), UGX/USD inline conversion with adjustable rate,
 *           Budget vs Actual comparison chart, bulk delete, CSV import/export.
 *
 * Setup:
 *   npm create vite@latest cheda -- --template react
 *   cd cheda && npm install recharts lucide-react
 *   Replace src/App.jsx with this file.
 *   Add to src/index.css:
 *     @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');
 */

import { useState, useEffect, useMemo, useCallback, createContext, useContext, useRef } from "react";
import {
  AreaChart, Area, LineChart, Line, PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  Plus, Pencil, Trash2, TrendingUp, TrendingDown,
  Wallet, Target, Download, Upload, Filter, ChevronDown, Check,
  ArrowUpRight, ArrowDownRight, X, AlertCircle, BarChart2,
  PieChart as PieIcon, List, Settings, DollarSign, LogOut,
  User, Mail, Lock, Eye, EyeOff, RefreshCw, Calculator, FileText, ChevronRight, Info
} from "lucide-react";

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

const CATEGORIES = {
  income:  ["Salary", "Freelance", "Investment", "Gift", "Other Income"],
  expense: ["Housing", "Food", "Transport", "Entertainment", "Health", "Shopping", "Education", "Utilities", "Other"],
};

const CATEGORY_COLORS = {
  Housing: "#E8631A", Food: "#f59e0b", Transport: "#1BA8A0", Entertainment: "#ec4899",
  Health: "#168f88", Shopping: "#f97316", Education: "#8b5cf6", Utilities: "#06b6d4",
  Other: "#64748b", Salary: "#1BA8A0", Freelance: "#3b82f6", Investment: "#a855f7",
  Gift: "#e879f9", "Other Income": "#84cc16",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DEFAULT_RATE = 3700;

// ─── SAMPLE DATA ───────────────────────────────────────────────────────────

const generateSampleData = () => {
  const now = new Date();
  const data = [];
  let id = 1;
  for (let m = 5; m >= 0; m--) {
    const month = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const y = month.getFullYear(), mo = month.getMonth();
    data.push({ id: id++, type: "income",  amount: 16500000, category: "Salary",    description: "Monthly salary",  date: new Date(y, mo, 1).toISOString().split("T")[0] });
    if (Math.random() > 0.4) data.push({ id: id++, type: "income", amount: Math.round((800000 + Math.random()*1200000)/1000)*1000, category: "Freelance", description: "Freelance project", date: new Date(y, mo, 10+Math.floor(Math.random()*10)).toISOString().split("T")[0] });
    [
      { amount: 4500000, category: "Housing", description: "Rent" },
      { amount: Math.round((600000+Math.random()*400000)/1000)*1000, category: "Food",          description: "Groceries & dining" },
      { amount: Math.round((150000+Math.random()*200000)/1000)*1000, category: "Transport",     description: "Fuel & transit" },
      { amount: Math.round((80000 +Math.random()*120000)/1000)*1000, category: "Entertainment", description: "Events & streaming" },
      { amount: Math.round((120000+Math.random()*80000 )/1000)*1000, category: "Utilities",     description: "Electric & internet" },
    ].forEach(e => data.push({ id: id++, type: "expense", ...e, date: new Date(y, mo, Math.floor(Math.random()*28)+1).toISOString().split("T")[0] }));
    if (Math.random() > 0.5) data.push({ id: id++, type: "expense", amount: Math.round((100000+Math.random()*300000)/1000)*1000, category: "Shopping", description: "Online shopping", date: new Date(y, mo, Math.floor(Math.random()*28)+1).toISOString().split("T")[0] });
  }
  return data.sort((a, b) => new Date(b.date) - new Date(a.date));
};

// ─── HELPERS ──────────────────────────────────────────────────────────────

// Module-level so Recharts tooltips (outside React tree) can use current values
let _currency = "UGX";
let _rate     = DEFAULT_RATE;

const fmtUGX = (n) => "UGX\u00A0" + new Intl.NumberFormat("en-UG", { minimumFractionDigits:0, maximumFractionDigits:0 }).format(n);
const fmtUSD = (n) => new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", minimumFractionDigits:2, maximumFractionDigits:2 }).format(n);

// All amounts stored in UGX; fmt converts for display
const fmt = (ugxAmount) => {
  if (_currency === "USD") return fmtUSD(ugxAmount / _rate);
  return fmtUGX(ugxAmount);
};
const fmtShort = (ugxAmount) => {
  const n = _currency === "USD" ? ugxAmount / _rate : ugxAmount;
  if (_currency === "USD") return n >= 1000 ? `$${(n/1000).toFixed(1)}k` : fmtUSD(n);
  if (n >= 1000000) return `UGX\u00A0${(n/1000000).toFixed(1)}M`;
  if (n >= 1000)    return `UGX\u00A0${(n/1000).toFixed(0)}K`;
  return fmtUGX(n);
};

const dateLabel = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });

// ─── CONTEXTS ─────────────────────────────────────────────────────────────

const CurrencyContext = createContext({ currency:"UGX", rate:DEFAULT_RATE, setCurrency:()=>{}, setRate:()=>{} });
const useCurr = () => useContext(CurrencyContext);

// ─── AUTH HELPERS ──────────────────────────────────────────────────────────

const getUsers    = ()      => JSON.parse(localStorage.getItem("ff_users")   || "[]");
const saveUsers   = (u)     => localStorage.setItem("ff_users", JSON.stringify(u));
const getSession  = ()      => JSON.parse(localStorage.getItem("ff_session") || "null");
const saveSession = (u)     => localStorage.setItem("ff_session", JSON.stringify(u));
const clearSession= ()      => localStorage.removeItem("ff_session");
const userKey     = (id, k) => `ff_${id}_${k}`;

// ─── GLOBAL STYLES ─────────────────────────────────────────────────────────

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    :root{
      /* ── Watu Brand Palette ── */
      /* Orange (Boda) #E8631A  ·  Teal (Simu) #1BA8A0 */
      --bg:#faf8f5;--surface:#ffffff;--surface2:#fdf5ef;--border:#f0e6da;
      --text:#1a1208;--text2:#5c4a35;--text3:#a08060;
      --accent:#E8631A;--accent2:#d45510;--accent-soft:#fff0e6;
      --teal:#1BA8A0;--teal2:#168f88;--teal-soft:#e6f7f6;
      --green:#1BA8A0;--green-soft:#e6f7f6;
      --red:#c0392b;--red-soft:#fdf0ef;
      --amber:#f0a500;--amber-soft:#fff8e6;
      --shadow-sm:0 1px 3px rgba(232,99,26,.06),0 1px 2px rgba(0,0,0,.04);
      --shadow:0 4px 16px rgba(232,99,26,.1),0 1px 4px rgba(0,0,0,.04);
      --shadow-lg:0 12px 40px rgba(232,99,26,.14),0 4px 16px rgba(0,0,0,.06);
      --radius:16px;--radius-sm:10px;
      --font-display:'Syne',sans-serif;--font-body:'DM Sans',sans-serif;
    }
    [data-theme="dark"]{
      --bg:#110d08;--surface:#1c1510;--surface2:#251c14;--border:#332618;
      --text:#f5ede4;--text2:#b8956e;--text3:#6b4f35;
      --accent-soft:#2d1a08;--teal-soft:#062220;--green-soft:#062220;--red-soft:#2a0a08;--amber-soft:#1c1000;
      --shadow-sm:0 1px 3px rgba(0,0,0,.4);--shadow:0 4px 16px rgba(0,0,0,.5);--shadow-lg:0 12px 40px rgba(0,0,0,.6);
    }
    html{height:100%;}body{height:100%;margin:0;background:var(--bg);color:var(--text);font-family:var(--font-body);font-size:14px;line-height:1.5;transition:background .3s,color .3s;}
    ::-webkit-scrollbar{width:6px;height:6px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes slideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
    @keyframes scaleIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
    .fade-up{animation:fadeUp .4s ease forwards}
    .fade-in{animation:fadeIn .3s ease forwards}
    .scale-in{animation:scaleIn .25s ease forwards}
    .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;box-shadow:var(--shadow-sm);transition:box-shadow .2s,transform .2s;}
    .card:hover{box-shadow:0 6px 20px rgba(232,99,26,.12);}
    .btn{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:var(--radius-sm);font-family:var(--font-body);font-size:14px;font-weight:500;cursor:pointer;border:none;transition:all .15s;outline:none;}
    .btn:active{transform:scale(.98);}
    .btn-primary{background:var(--accent);color:white;}
    .btn-primary:hover{background:var(--accent2);box-shadow:0 4px 16px rgba(232,99,26,.35);}
    .btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border);}
    .btn-ghost:hover{background:var(--surface2);color:var(--text);}
    .btn-danger{background:var(--red-soft);color:var(--red);}
    .btn-danger:hover{background:var(--red);color:white;}
    .input{width:100%;padding:10px 14px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-family:var(--font-body);font-size:14px;transition:border-color .15s,box-shadow .15s;outline:none;}
    .input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(232,99,26,.14);}
    .input::placeholder{color:var(--text3);}
    .input.error{border-color:var(--red);}
    select.input{appearance:none;cursor:pointer;}
    .label{display:block;font-size:12px;font-weight:500;color:var(--text2);margin-bottom:6px;letter-spacing:.03em;text-transform:uppercase;}
    .toggle{position:relative;display:inline-block;width:40px;height:22px;}
    .toggle input{opacity:0;width:0;height:0;}
    .toggle-slider{position:absolute;cursor:pointer;inset:0;background:var(--border);border-radius:22px;transition:.2s;}
    .toggle-slider::before{content:'';position:absolute;height:16px;width:16px;left:3px;bottom:3px;background:white;border-radius:50%;transition:.2s;}
    .toggle input:checked+.toggle-slider{background:var(--teal);}
    .toggle input:checked+.toggle-slider::before{transform:translateX(18px);}
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn .2s ease;}
    .modal{background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow-lg);width:100%;max-width:480px;animation:scaleIn .25s ease;overflow:hidden;}
    .stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
    @media(max-width:768px){.stats-grid{grid-template-columns:1fr;}}
    .charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
    @media(max-width:900px){.charts-grid{grid-template-columns:1fr;}}
    .nav-item{display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:var(--radius-sm);cursor:pointer;color:var(--text2);font-size:14px;font-weight:500;transition:all .15s;white-space:nowrap;border:none;background:none;font-family:var(--font-body);}
    .nav-item:hover{background:var(--surface2);color:var(--text);}
    .nav-item.active{background:var(--accent-soft);color:var(--accent);border-left:3px solid var(--accent);}
    .progress-bar{height:8px;background:var(--surface2);border-radius:999px;overflow:hidden;}
    .progress-fill{height:100%;border-radius:999px;transition:width .6s cubic-bezier(.34,1.56,.64,1);}
    .recharts-tooltip-wrapper{outline:none;}
    .custom-tooltip{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;box-shadow:var(--shadow);font-family:var(--font-body);font-size:13px;}
    .tx-row{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--border);animation:slideIn .3s ease forwards;}
    .tx-row:last-child{border-bottom:none;}
    .tx-row:hover .tx-actions{opacity:1;}
    .tx-actions{display:flex;gap:4px;opacity:0;transition:opacity .15s;}
    @media(max-width:600px){.tx-actions{opacity:1;}}
    .cat-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
    .num{font-family:var(--font-display);font-weight:700;letter-spacing:-.02em;}
    .section-title{font-family:var(--font-display);font-size:16px;font-weight:700;color:var(--text);margin-bottom:2px;}
    .empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:40px 20px;color:var(--text3);text-align:center;}
    .stagger>*{opacity:0;animation:fadeUp .4s ease forwards;}
    .stagger>*:nth-child(1){animation-delay:.05s}
    .stagger>*:nth-child(2){animation-delay:.10s}
    .stagger>*:nth-child(3){animation-delay:.15s}
    .stagger>*:nth-child(4){animation-delay:.20s}
    .stagger>*:nth-child(5){animation-delay:.25s}
    .stagger>*:nth-child(6){animation-delay:.30s}
    .auth-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:40px;box-shadow:var(--shadow-lg);width:100%;max-width:420px;animation:scaleIn .3s ease;}
    .auth-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--text3);pointer-events:none;}
    .divider{display:flex;align-items:center;gap:12px;color:var(--text3);font-size:12px;margin:4px 0;}
    .divider::before,.divider::after{content:'';flex:1;height:1px;background:var(--border);}
  `}</style>
);

// ─── AUTH PAGE ─────────────────────────────────────────────────────────────

const AuthPage = ({ onAuth }) => {
  const [mode, setMode]     = useState("signin");
  const [form, setForm]     = useState({ username:"", email:"", password:"" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError]   = useState("");

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(""); };

  const handleSignUp = () => {
    if (!form.username.trim())               return setError("Username is required");
    if (!form.email.includes("@"))           return setError("Enter a valid email");
    if (form.password.length < 6)            return setError("Password must be at least 6 characters");
    const users = getUsers();
    if (users.find(u => u.email.toLowerCase() === form.email.toLowerCase()))        return setError("Email already registered");
    if (users.find(u => u.username.toLowerCase() === form.username.toLowerCase()))  return setError("Username taken");
    const user = { id: Date.now().toString(), username: form.username.trim(), email: form.email.toLowerCase(), password: form.password };
    saveUsers([...users, user]);
    localStorage.setItem(userKey(user.id,"transactions"), JSON.stringify(generateSampleData()));
    localStorage.setItem(userKey(user.id,"budgets"), JSON.stringify({ Housing:5000000, Food:800000, Transport:250000, Entertainment:150000, Utilities:180000 }));
    localStorage.setItem(userKey(user.id,"goals"),   JSON.stringify([{ name:"Emergency Fund", target:"10000000", saved:"3500000" }]));
    saveSession(user); onAuth(user);
  };

  const handleSignIn = () => {
    if (!form.email.trim()) return setError("Enter your email");
    if (!form.password)     return setError("Enter your password");
    const users = getUsers();
    const user  = users.find(u => u.email.toLowerCase()===form.email.toLowerCase() && u.password===form.password);
    if (!user) return setError("Incorrect email or password");
    saveSession(user); onAuth(user);
  };

  const submit = () => mode === "signin" ? handleSignIn() : handleSignUp();

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:20 }}>
      <GlobalStyles />
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:32 }}>
        <div style={{ width:44, height:44, borderRadius:14, background:"linear-gradient(135deg,var(--accent),var(--teal))", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 8px 24px rgba(232,99,26,.35)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <text x="2" y="17" fontSize="14" fontWeight="900" fontFamily="Syne,sans-serif" fill="white">C</text>
          <text x="12" y="13" fontSize="10" fontWeight="700" fontFamily="Syne,sans-serif" fill="rgba(255,255,255,0.9)">$</text>
        </svg>
        </div>
        <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:26, color:"var(--text)" }}>Cheda</span>
      </div>

      <div className="auth-card">
        <h2 style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:22, marginBottom:4 }}>{mode==="signin"?"Welcome back":"Create account"}</h2>
        <p style={{ color:"var(--text3)", fontSize:13, marginBottom:28 }}>{mode==="signin"?"Sign in to your Cheda account":"Start tracking your finances today"}</p>

        {error && <div style={{ background:"var(--red-soft)", color:"var(--red)", padding:"10px 14px", borderRadius:8, fontSize:13, marginBottom:16, display:"flex", gap:8, alignItems:"center" }}><AlertCircle size={14} style={{ flexShrink:0 }}/>{error}</div>}

        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {mode==="signup" && (
            <div>
              <label className="label">Username</label>
              <div style={{ position:"relative" }}>
                <User size={16} className="auth-icon"/>
                <input className="input" style={{ paddingLeft:40 }} placeholder="e.g. john_doe" value={form.username} onChange={e=>set("username",e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
              </div>
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <div style={{ position:"relative" }}>
              <Mail size={16} className="auth-icon"/>
              <input className="input" style={{ paddingLeft:40 }} type="email" placeholder="you@example.com" value={form.email} onChange={e=>set("email",e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
            </div>
          </div>
          <div>
            <label className="label">Password</label>
            <div style={{ position:"relative" }}>
              <Lock size={16} className="auth-icon"/>
              <input className="input" style={{ paddingLeft:40, paddingRight:42 }} type={showPw?"text":"password"} placeholder={mode==="signup"?"At least 6 characters":"Your password"} value={form.password} onChange={e=>set("password",e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
              <button onClick={()=>setShowPw(s=>!s)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"var(--text3)", display:"flex" }}>{showPw?<EyeOff size={16}/>:<Eye size={16}/>}</button>
            </div>
          </div>
          <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center", padding:"12px", marginTop:4 }} onClick={submit}>{mode==="signin"?"Sign In":"Create Account"}</button>
        </div>

        <div className="divider" style={{ marginTop:24, marginBottom:16 }}>or</div>
        <div style={{ textAlign:"center", fontSize:13, color:"var(--text2)" }}>
          {mode==="signin"?"Don't have an account? ":"Already have an account? "}
          <button onClick={()=>{setMode(m=>m==="signin"?"signup":"signin");setError("");setForm({username:"",email:"",password:""}); }} style={{ color:"var(--accent)", background:"none", border:"none", cursor:"pointer", fontFamily:"var(--font-body)", fontSize:13, fontWeight:600 }}>
            {mode==="signin"?"Sign up":"Sign in"}
          </button>
        </div>
      </div>
      <p style={{ marginTop:20, fontSize:11, color:"var(--text3)", textAlign:"center" }}>Data is stored locally in your browser. No server required.</p>
    </div>
  );
};

// ─── CUSTOM TOOLTIP ────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <div style={{ color:"var(--text2)", marginBottom:6, fontSize:12 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginTop:2 }}>
          <span style={{ width:8, height:8, borderRadius:"50%", background:p.color, display:"inline-block" }}/>
          <span style={{ color:"var(--text2)" }}>{p.name}:</span>
          <span style={{ color:"var(--text)", fontWeight:600 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ─── STAT CARD ─────────────────────────────────────────────────────────────

const StatCard = ({ label, amount, icon: Icon, trend, color, soft }) => {
  useCurr();
  return (
    <div className="card fade-up" style={{ position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:-20, right:-20, width:80, height:80, borderRadius:"50%", background:soft, opacity:.8 }}/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", position:"relative" }}>
        <div>
          <div className="label">{label}</div>
          <div className="num" style={{ fontSize:24, color:"var(--text)", marginTop:4 }}>{fmt(amount)}</div>
          {trend != null && (
            <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:6, fontSize:12, color:trend>0?"var(--red)":"var(--green)" }}>
              {trend>0?<ArrowUpRight size={14}/>:<ArrowDownRight size={14}/>}
              <span>{Math.abs(trend)}% vs last month</span>
            </div>
          )}
        </div>
        <div style={{ width:44, height:44, borderRadius:12, background:soft, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Icon size={20} color={color}/>
        </div>
      </div>
    </div>
  );
};

// ─── CURRENCY BAR ──────────────────────────────────────────────────────────

const CurrencyBar = () => {
  const { currency, rate, setCurrency, setRate } = useCurr();
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(String(rate));

  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n) && n > 0) setRate(n); else setDraft(String(rate));
    setEditing(false);
  };

  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
      {/* UGX / USD pill */}
      <div style={{ display:"flex", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:999, padding:3, gap:2 }}>
        {["UGX","USD"].map(c => (
          <button key={c} onClick={()=>setCurrency(c)} style={{ padding:"4px 10px", borderRadius:999, border:"none", cursor:"pointer", fontFamily:"var(--font-body)", fontSize:12, fontWeight:600, transition:"all .15s", background:currency===c?"var(--accent)":"transparent", color:currency===c?"white":"var(--text2)" }}>{c}</button>
        ))}
      </div>

      {/* Editable rate badge */}
      <div style={{ display:"flex", alignItems:"center", gap:5, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"4px 10px", fontSize:12, color:"var(--text2)" }}>
        <span style={{ color:"var(--text3)" }}>1 USD =</span>
        {editing ? (
          <input autoFocus style={{ width:72, background:"transparent", border:"none", outline:"none", fontFamily:"var(--font-body)", fontSize:12, color:"var(--text)", fontWeight:600 }} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape"){setDraft(String(rate));setEditing(false);}}}/>
        ) : (
          <button onClick={()=>{setDraft(String(rate));setEditing(true);}} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"var(--font-body)", fontSize:12, fontWeight:600, color:"var(--accent)", padding:0 }} title="Click to edit rate">{rate.toLocaleString()} UGX</button>
        )}
        <RefreshCw size={11} style={{ color:"var(--text3)", cursor:"pointer", flexShrink:0 }} onClick={()=>setRate(DEFAULT_RATE)} title="Reset to 3,700"/>
      </div>
    </div>
  );
};

// ─── TRANSACTION FORM MODAL ────────────────────────────────────────────────

const TransactionModal = ({ onClose, onSave, initial }) => {
  const { currency, rate } = useCurr();
  const sym = currency === "UGX" ? "UGX" : "USD";
  const blank = { type:"expense", amount:"", category:"", description:"", date:new Date().toISOString().split("T")[0] };
  const [form,   setForm]   = useState(initial ? { ...initial, amount: currency==="USD" ? (initial.amount/rate).toFixed(2) : String(initial.amount) } : blank);
  const [errors, setErrors] = useState({});

  const set = (k,v) => { setForm(f=>({...f,[k]:v,...(k==="type"?{category:""}:{})})); setErrors(e=>({...e,[k]:""})); };

  const validate = () => {
    const e = {};
    if (!form.amount||isNaN(form.amount)||Number(form.amount)<=0) e.amount="Enter a valid amount";
    if (!form.category) e.category="Select a category";
    if (!form.date)     e.date="Select a date";
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const ugx = currency==="USD" ? Math.round(parseFloat(form.amount)*rate) : parseFloat(form.amount);
    onSave({ ...form, amount:ugx, id:initial?.id||Date.now() });
    onClose();
  };

  const cats = CATEGORIES[form.type];

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div style={{ padding:"20px 24px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:17 }}>{initial?"Edit Transaction":"New Transaction"}</span>
          <button className="btn btn-ghost" style={{ padding:"6px", border:"none" }} onClick={onClose}><X size={18}/></button>
        </div>
        <div style={{ padding:24, display:"flex", flexDirection:"column", gap:18 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {["expense","income"].map(t=>(
              <button key={t} onClick={()=>set("type",t)} style={{ padding:"10px", borderRadius:"var(--radius-sm)", cursor:"pointer", fontFamily:"var(--font-body)", fontWeight:500, fontSize:14, transition:"all .15s", border:"1.5px solid", borderColor:form.type===t?(t==="income"?"var(--green)":"var(--red)"):"var(--border)", background:form.type===t?(t==="income"?"var(--green-soft)":"var(--red-soft)"):"transparent", color:form.type===t?(t==="income"?"var(--green)":"var(--red)"):"var(--text2)" }}>
                {t==="income"?"↑ Income":"↓ Expense"}
              </button>
            ))}
          </div>

          <div>
            <label className="label">Amount ({sym})</label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:"var(--text3)", fontSize:12, fontWeight:600 }}>{sym}</span>
              <input className={`input ${errors.amount?"error":""}`} style={{ paddingLeft:currency==="USD"?46:50 }} type="number" placeholder="0" value={form.amount} onChange={e=>set("amount",e.target.value)}/>
            </div>
            {form.amount>0&&!isNaN(form.amount)&&(
              <div style={{ fontSize:11, color:"var(--text3)", marginTop:4 }}>
                {currency==="USD" ? `≈ ${fmtUGX(Math.round(parseFloat(form.amount)*rate))} at current rate` : `≈ ${fmtUSD(parseFloat(form.amount)/rate)} at current rate`}
              </div>
            )}
            {errors.amount&&<div style={{ color:"var(--red)", fontSize:12, marginTop:4, display:"flex", gap:4, alignItems:"center" }}><AlertCircle size={12}/>{errors.amount}</div>}
          </div>

          <div>
            <label className="label">Category</label>
            <div style={{ position:"relative" }}>
              <select className={`input ${errors.category?"error":""}`} value={form.category} onChange={e=>set("category",e.target.value)}>
                <option value="">Select category…</option>
                {cats.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={14} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:"var(--text3)" }}/>
            </div>
            {errors.category&&<div style={{ color:"var(--red)", fontSize:12, marginTop:4, display:"flex", gap:4, alignItems:"center" }}><AlertCircle size={12}/>{errors.category}</div>}
          </div>

          <div>
            <label className="label">Description <span style={{ color:"var(--text3)", textTransform:"none", fontWeight:400 }}>(optional)</span></label>
            <input className="input" placeholder="What was this for?" value={form.description} onChange={e=>set("description",e.target.value)}/>
          </div>

          <div>
            <label className="label">Date</label>
            <input className={`input ${errors.date?"error":""}`} type="date" value={form.date} onChange={e=>set("date",e.target.value)}/>
          </div>
        </div>
        <div style={{ padding:"16px 24px", borderTop:"1px solid var(--border)", display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}><Check size={15}/>{initial?"Save Changes":"Add Transaction"}</button>
        </div>
      </div>
    </div>
  );
};

// ─── BUDGET MODAL ──────────────────────────────────────────────────────────

const BudgetModal = ({ budgets, onClose, onSave }) => {
  const { currency, rate } = useCurr();
  const sym     = currency==="UGX"?"UGX":"USD";
  const toDisp  = (ugx) => currency==="USD" ? (ugx/rate).toFixed(2) : String(ugx||"");
  const toUGX   = (v)   => currency==="USD" ? Math.round(parseFloat(v)*rate) : parseFloat(v);
  const [local, setLocal] = useState(() => {
    const d={};
    CATEGORIES.expense.forEach(c=>{d[c]=budgets[c]?toDisp(budgets[c]):"";});
    return d;
  });
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{ maxWidth:400 }}>
        <div style={{ padding:"20px 24px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:17 }}>Monthly Budgets ({sym})</span>
          <button className="btn btn-ghost" style={{ padding:"6px", border:"none" }} onClick={onClose}><X size={18}/></button>
        </div>
        <div style={{ padding:24, display:"flex", flexDirection:"column", gap:14, maxHeight:"60vh", overflowY:"auto" }}>
          {CATEGORIES.expense.map(cat=>(
            <div key={cat}>
              <label className="label">{cat}</label>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:"var(--text3)", fontSize:12 }}>{sym}</span>
                <input className="input" style={{ paddingLeft:44 }} type="number" placeholder="No limit" value={local[cat]||""} onChange={e=>setLocal(p=>({...p,[cat]:e.target.value}))}/>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding:"16px 24px", borderTop:"1px solid var(--border)", display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={()=>{const out={};CATEGORIES.expense.forEach(c=>{if(local[c]&&!isNaN(local[c]))out[c]=toUGX(local[c]);});onSave(out);onClose();}}><Check size={15}/>Save Budgets</button>
        </div>
      </div>
    </div>
  );
};

// ─── SAVINGS GOAL MODAL ────────────────────────────────────────────────────

const GoalModal = ({ goals, onClose, onSave }) => {
  const { currency } = useCurr();
  const sym = currency==="UGX"?"UGX":"USD";
  const [local, setLocal] = useState(goals.length?goals:[{name:"",target:"",saved:""}]);
  const add   = ()        => setLocal(g=>[...g,{name:"",target:"",saved:""}]);
  const remove= (i)       => setLocal(g=>g.filter((_,j)=>j!==i));
  const upd   = (i,k,v)   => setLocal(g=>g.map((x,j)=>j===i?{...x,[k]:v}:x));
  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{ maxWidth:440 }}>
        <div style={{ padding:"20px 24px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:17 }}>Savings Goals ({sym})</span>
          <button className="btn btn-ghost" style={{ padding:"6px", border:"none" }} onClick={onClose}><X size={18}/></button>
        </div>
        <div style={{ padding:24, display:"flex", flexDirection:"column", gap:16, maxHeight:"60vh", overflowY:"auto" }}>
          {local.map((g,i)=>(
            <div key={i} style={{ padding:16, background:"var(--surface2)", borderRadius:"var(--radius-sm)", position:"relative" }}>
              <button onClick={()=>remove(i)} style={{ position:"absolute", top:10, right:10, background:"none", border:"none", cursor:"pointer", color:"var(--text3)", display:"flex" }}><X size={14}/></button>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div><label className="label">Goal Name</label><input className="input" placeholder="e.g. Emergency Fund" value={g.name} onChange={e=>upd(i,"name",e.target.value)}/></div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div><label className="label">Target ({sym})</label><input className="input" type="number" value={g.target} onChange={e=>upd(i,"target",e.target.value)}/></div>
                  <div><label className="label">Saved ({sym})</label><input className="input" type="number" value={g.saved} onChange={e=>upd(i,"saved",e.target.value)}/></div>
                </div>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={add} style={{ justifyContent:"center" }}><Plus size={15}/>Add Goal</button>
        </div>
        <div style={{ padding:"16px 24px", borderTop:"1px solid var(--border)", display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={()=>{onSave(local.filter(g=>g.name));onClose();}}><Check size={15}/>Save Goals</button>
        </div>
      </div>
    </div>
  );
};

// ─── TRANSACTION ROW ───────────────────────────────────────────────────────

const TxRow = ({ tx, onEdit, onDelete, selectable, selected, onToggleSelect }) => {
  useCurr();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="tx-row" style={{ opacity:confirmDelete?0.7:1, transition:"opacity .15s" }}>
      {selectable ? (
        <div onClick={()=>onToggleSelect(tx.id)} style={{ width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
          <div style={{ width:20, height:20, borderRadius:6, border:`2px solid ${selected?"var(--accent)":"var(--border)"}`, background:selected?"var(--accent)":"transparent", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s" }}>{selected&&<Check size={12} color="white"/>}</div>
        </div>
      ) : (
        <div style={{ width:40, height:40, borderRadius:12, background:tx.type==="income"?"var(--teal-soft)":"var(--red-soft)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          {tx.type==="income"?<ArrowUpRight size={18} color="var(--teal)"/>:<ArrowDownRight size={18} color="var(--red)"/>}
        </div>
      )}
      <div style={{ minWidth:0 }}>
        <div style={{ fontWeight:500, color:"var(--text)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{tx.description||tx.category}</div>
        <div style={{ fontSize:12, color:"var(--text3)", display:"flex", alignItems:"center", gap:8, marginTop:2 }}>
          <span style={{ background:"var(--surface2)", padding:"1px 8px", borderRadius:999 }}>{tx.category}</span>
          <span>{dateLabel(tx.date)}</span>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
        <span className="num" style={{ fontSize:15, color:tx.type==="income"?"var(--teal)":"var(--red)" }}>
          {tx.type==="income"?"+":"−"}{fmt(tx.amount)}
        </span>
        {!selectable&&(confirmDelete?(
          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
            <span style={{ fontSize:11, color:"var(--text2)" }}>Delete?</span>
            <button onClick={()=>onDelete(tx.id)} style={{ background:"var(--red)", border:"none", borderRadius:6, padding:"3px 8px", cursor:"pointer", color:"white", fontSize:11, fontFamily:"var(--font-body)" }}>Yes</button>
            <button onClick={()=>setConfirmDelete(false)} style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:6, padding:"3px 8px", cursor:"pointer", color:"var(--text2)", fontSize:11, fontFamily:"var(--font-body)" }}>No</button>
          </div>
        ):(
          <div className="tx-actions">
            <button onClick={()=>onEdit(tx)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", padding:4, borderRadius:6, display:"flex" }} onMouseEnter={e=>e.currentTarget.style.color="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text3)"}><Pencil size={14}/></button>
            <button onClick={()=>setConfirmDelete(true)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", padding:4, borderRadius:6, display:"flex" }} onMouseEnter={e=>e.currentTarget.style.color="var(--red)"} onMouseLeave={e=>e.currentTarget.style.color="var(--text3)"}><Trash2 size={14}/></button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── BUDGET COMPARISON CHART ───────────────────────────────────────────────

const BudgetComparison = ({ transactions, budgets }) => {
  useCurr();
  const now = new Date();

  const data = useMemo(() => {
    const thisMonth = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear() && t.type==="expense";
    });
    return CATEGORIES.expense
      .filter(c => budgets[c] || thisMonth.some(t=>t.category===c))
      .map(c => {
        const budget = budgets[c] || 0;
        const spent  = thisMonth.filter(t=>t.category===c).reduce((s,t)=>s+t.amount, 0);
        const deviation = budget>0 ? Math.round(((spent-budget)/budget)*100) : null;
        return { category:c, Budget:budget, Spent:spent, deviation };
      });
  }, [transactions, budgets, now.getMonth(), now.getFullYear()]);

  if (data.length===0) return (
    <div className="card fade-up">
      <div className="section-title" style={{ marginBottom:8 }}>Budget vs Actual</div>
      <div className="empty"><BarChart2 size={32} opacity={0.3}/><div>Set budgets to see the comparison</div></div>
    </div>
  );

  const totalBudget = data.reduce((s,d)=>s+d.Budget, 0);
  const totalSpent  = data.reduce((s,d)=>s+d.Spent,  0);
  const totalDev    = totalBudget>0 ? Math.round(((totalSpent-totalBudget)/totalBudget)*100) : 0;
  const overCount   = data.filter(d=>d.deviation!=null&&d.deviation>0).length;
  const underCount  = data.filter(d=>d.deviation!=null&&d.deviation<0).length;

  // Custom label showing % deviation above each Spent bar
  const DevLabel = ({ x, y, width, index }) => {
    const d = data[index];
    if (!d || d.deviation==null || d.Budget===0) return null;
    const color = d.deviation>15?"#c0392b":d.deviation>0?"#E8631A":"#1BA8A0";
    return (
      <text x={x+width/2} y={y-6} fill={color} textAnchor="middle" fontSize={11} fontFamily="DM Sans, sans-serif" fontWeight="700">
        {d.deviation>0?`+${d.deviation}%`:`${d.deviation}%`}
      </text>
    );
  };

  return (
    <div className="card fade-up">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <div className="section-title">Budget vs Actual</div>
          <div style={{ color:"var(--text3)", fontSize:12, marginTop:2 }}>This month — % deviation shown above each bar</div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <div style={{ padding:"4px 12px", borderRadius:999, background:totalDev>0?"#fff0e6":"#e6f7f6", color:totalDev>0?"#E8631A":"#1BA8A0", fontSize:12, fontWeight:600 }}>
            Overall {totalDev>0?"+":""}{totalDev}%
          </div>
          {overCount>0  && <div style={{ padding:"4px 12px", borderRadius:999, background:"#fff0e6", color:"#E8631A", fontSize:12, fontWeight:600 }}>{overCount} over budget</div>}
          {underCount>0 && <div style={{ padding:"4px 12px", borderRadius:999, background:"#e6f7f6", color:"#1BA8A0", fontSize:12, fontWeight:600 }}>{underCount} under budget</div>}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top:24, right:10, left:10, bottom:20 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
          <XAxis dataKey="category" tick={{ fill:"var(--text3)", fontSize:11 }} axisLine={false} tickLine={false}/>
          <YAxis tick={{ fill:"var(--text3)", fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={62}/>
          <Tooltip content={<CustomTooltip/>}/>
          <Legend wrapperStyle={{ fontSize:12, paddingTop:8 }}/>
          <Bar dataKey="Budget" fill="#E8631A" radius={[6,6,0,0]} fillOpacity={0.85}/>
          <Bar dataKey="Spent" fill="#1BA8A0" radius={[6,6,0,0]} label={<DevLabel/>}>
            {data.map((entry,i) => {
              const color = entry.deviation==null ? "#1BA8A0" : entry.deviation>15 ? "#c0392b" : entry.deviation>0 ? "#E8631A" : "#1BA8A0";
              return <Cell key={i} fill={color}/>;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Per-category breakdown table */}
      <div style={{ marginTop:16, borderTop:"1px solid var(--border)", paddingTop:16 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto", gap:"6px 16px", alignItems:"center" }}>
          {["Category","Budget","Spent","Δ"].map(h=>(
            <span key={h} style={{ fontSize:11, fontWeight:600, color:"var(--text3)", textTransform:"uppercase", textAlign:h==="Category"?"left":"right" }}>{h}</span>
          ))}
          {data.map(d => {
            const color = d.deviation==null?"var(--text3)":d.deviation>15?"var(--red)":d.deviation>0?"var(--accent)":"var(--teal)";
            return [
              <div key={d.category+"n"} style={{ display:"flex", alignItems:"center", gap:6, fontSize:13 }}>
                <span className="cat-dot" style={{ background:CATEGORY_COLORS[d.category]||"#94a3b8" }}/>{d.category}
              </div>,
              <span key={d.category+"b"} style={{ fontSize:13, color:"var(--text2)", textAlign:"right" }}>{fmt(d.Budget)}</span>,
              <span key={d.category+"s"} style={{ fontSize:13, color:"var(--text)",  textAlign:"right", fontWeight:600 }}>{fmt(d.Spent)}</span>,
              <span key={d.category+"d"} style={{ fontSize:12, fontWeight:700, color, textAlign:"right" }}>
                {d.deviation==null?"—":d.deviation>0?`+${d.deviation}%`:`${d.deviation}%`}
              </span>,
            ];
          })}
        </div>
      </div>
    </div>
  );
};

// ─── PERIOD PICKER HELPERS ────────────────────────────────────────────────

// Returns { start: Date, end: Date, label: string, prevStart: Date, prevEnd: Date }
function resolvePeriod(preset, customFrom, customTo) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const startOf = (y,m,d=1) => new Date(y,m,d);
  const endOf   = (y,m)     => new Date(y,m+1,0);   // last day of month

  let start, end, prevStart, prevEnd, label;

  if (preset === "custom") {
    // Parse as local date components to avoid UTC timezone shifting dates
    const parseLocal = (s, eod=false) => {
      if (!s) return today;
      const [y,m,d] = s.split("-").map(Number);
      return eod ? new Date(y,m-1,d,23,59,59,999) : new Date(y,m-1,d,0,0,0,0);
    };
    start     = customFrom ? parseLocal(customFrom, false) : today;
    end       = customTo   ? parseLocal(customTo,   true)  : today;
    const diff = Math.max(end - start, 86400000);
    prevEnd   = new Date(start.getTime() - 1);
    prevStart = new Date(prevEnd.getTime() - diff);
    label     = customFrom && customTo
      ? `${customFrom} → ${customTo}`
      : customFrom ? `From ${customFrom}` : "Custom Range";

  } else if (preset === "this_month") {
    start     = startOf(now.getFullYear(), now.getMonth());
    end       = endOf  (now.getFullYear(), now.getMonth());
    prevStart = startOf(now.getFullYear(), now.getMonth()-1);
    prevEnd   = endOf  (now.getFullYear(), now.getMonth()-1);
    label     = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  } else if (preset === "last_month") {
    const lm  = new Date(now.getFullYear(), now.getMonth()-1, 1);
    start     = startOf(lm.getFullYear(), lm.getMonth());
    end       = endOf  (lm.getFullYear(), lm.getMonth());
    prevStart = startOf(lm.getFullYear(), lm.getMonth()-1);
    prevEnd   = endOf  (lm.getFullYear(), lm.getMonth()-1);
    label     = `${MONTHS[lm.getMonth()]} ${lm.getFullYear()}`;

  } else if (preset === "q1"||preset==="q2"||preset==="q3"||preset==="q4") {
    const qi  = {q1:0,q2:3,q3:6,q4:9}[preset];
    start     = startOf(now.getFullYear(), qi);
    end       = endOf  (now.getFullYear(), qi+2);
    prevStart = startOf(now.getFullYear(), qi-3);
    prevEnd   = endOf  (now.getFullYear(), qi-1);
    label     = `${preset.toUpperCase()} ${now.getFullYear()}`;

  } else if (preset === "ytd") {
    start     = startOf(now.getFullYear(), 0);
    end       = today;
    prevStart = startOf(now.getFullYear()-1, 0);
    prevEnd   = new Date(now.getFullYear()-1, now.getMonth(), now.getDate());
    label     = `YTD ${now.getFullYear()}`;

  } else if (preset === "last_year") {
    start     = startOf(now.getFullYear()-1, 0);
    end       = endOf  (now.getFullYear()-1, 11);
    prevStart = startOf(now.getFullYear()-2, 0);
    prevEnd   = endOf  (now.getFullYear()-2, 11);
    label     = `FY ${now.getFullYear()-1}`;

  } else { // last_3_months
    start     = startOf(now.getFullYear(), now.getMonth()-2);
    end       = endOf  (now.getFullYear(), now.getMonth());
    prevStart = startOf(now.getFullYear(), now.getMonth()-5);
    prevEnd   = endOf  (now.getFullYear(), now.getMonth()-3);
    label     = `Last 3 months`;
  }

  return { start, end, prevStart, prevEnd, label };
}

const inRange = (t, start, end) => {
  // Parse transaction date as local midnight to avoid UTC shift issues
  const [y,mo,dy] = t.date.split("-").map(Number);
  const d = new Date(y, mo-1, dy, 0, 0, 0, 0);
  // Compare date-only: strip time from start/end for comparison
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(),   end.getMonth(),   end.getDate());
  return d >= s && d <= e;
};

// ─── DASHBOARD ─────────────────────────────────────────────────────────────

const PRESET_OPTIONS = [
  { value:"this_month",    label:"This Month" },
  { value:"last_month",    label:"Last Month" },
  { value:"last_3_months", label:"Last 3 Months" },
  { value:"q1",            label:"Q1 (Jan–Mar)" },
  { value:"q2",            label:"Q2 (Apr–Jun)" },
  { value:"q3",            label:"Q3 (Jul–Sep)" },
  { value:"q4",            label:"Q4 (Oct–Dec)" },
  { value:"ytd",           label:"Year to Date" },
  { value:"last_year",     label:"Last Year" },
  { value:"custom",        label:"Custom Range" },
];

// ── Standalone PeriodPicker — must be OUTSIDE Dashboard so it never remounts ──
const PeriodPicker = ({ preset, period, customFrom, customTo, onPreset, onCustomFrom, onCustomTo, txCount }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(()=>{
    const h = (e) => { if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  },[]);

  const selectPreset = (v) => { onPreset(v); if(v !== "custom") setOpen(false); };

  return (
    <div ref={ref} style={{ position:"relative", flexShrink:0 }}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        display:"flex", alignItems:"center", gap:6, padding:"5px 12px",
        borderRadius:999, border:"1.5px solid var(--border)",
        background: open?"var(--accent-soft)":"var(--surface2)",
        color: open?"var(--accent)":"var(--text2)",
        cursor:"pointer", fontFamily:"var(--font-body)", fontSize:12, fontWeight:600,
        transition:"all .15s", whiteSpace:"nowrap"
      }}>
        <Filter size={12}/>{period.label}
        <ChevronDown size={11} style={{ transform:open?"rotate(180deg)":"none", transition:"transform .2s" }}/>
      </button>

      {open && (
        <div style={{
          position:"absolute", right:0, top:"calc(100% + 8px)", zIndex:300,
          background:"var(--surface)", border:"1px solid var(--border)",
          borderRadius:"var(--radius-sm)", boxShadow:"var(--shadow-lg)",
          minWidth:220, overflow:"hidden", animation:"scaleIn .15s ease"
        }}>
          {/* Preset list */}
          {PRESET_OPTIONS.filter(o=>o.value!=="custom").map(o=>(
            <button key={o.value} onClick={()=>selectPreset(o.value)} style={{
              display:"flex", justifyContent:"space-between", alignItems:"center",
              width:"100%", textAlign:"left", padding:"10px 16px",
              background: preset===o.value?"var(--accent-soft)":"transparent",
              color: preset===o.value?"var(--accent)":"var(--text)",
              border:"none", cursor:"pointer", fontFamily:"var(--font-body)", fontSize:13,
              fontWeight: preset===o.value?700:400,
              borderLeft: preset===o.value?"3px solid var(--accent)":"3px solid transparent",
              transition:"background .1s"
            }}>
              {o.label}
              {preset===o.value && <Check size={12}/>}
            </button>
          ))}

          {/* Custom range section — stays open so user can type both dates */}
          <div style={{ borderTop:"1px solid var(--border)", padding:"12px 16px", background:"var(--surface2)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:10 }}>Custom Range</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div>
                <label style={{ fontSize:11, color:"var(--text3)", display:"block", marginBottom:3 }}>From</label>
                <input
                  className="input"
                  type="date"
                  value={customFrom}
                  style={{ fontSize:13, padding:"7px 10px" }}
                  onChange={e=>{ onCustomFrom(e.target.value); onPreset("custom"); }}
                />
              </div>
              <div>
                <label style={{ fontSize:11, color:"var(--text3)", display:"block", marginBottom:3 }}>To</label>
                <input
                  className="input"
                  type="date"
                  value={customTo}
                  style={{ fontSize:13, padding:"7px 10px" }}
                  onChange={e=>{ onCustomTo(e.target.value); onPreset("custom"); }}
                />
              </div>
              {preset==="custom" && customFrom && customTo && (
                <div style={{ fontSize:11, color:"var(--accent)", fontWeight:600, textAlign:"center", padding:"4px 0" }}>
                  ✓ {txCount} transaction{txCount!==1?"s":""} in range
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Dashboard = ({ transactions, onEdit, onDelete, budgets, goals }) => {
  useCurr();
  const now = new Date();

  // ── Period state ──
  const [preset,     setPreset]     = useState("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const period     = useMemo(()=>resolvePeriod(preset, customFrom, customTo),[preset,customFrom,customTo]);
  const periodTxs  = useMemo(()=>transactions.filter(t=>inRange(t,period.start,period.end)),[transactions,period]);
  const prevTxs    = useMemo(()=>transactions.filter(t=>inRange(t,period.prevStart,period.prevEnd)),[transactions,period]);

  // ── Core metrics for selected period ──
  const income     = useMemo(()=>periodTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),[periodTxs]);
  const expense    = useMemo(()=>periodTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[periodTxs]);
  const balance    = income - expense;

  const prevIncome  = prevTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const prevExpense = prevTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const expTrend    = prevExpense ? Math.round(((expense-prevExpense)/prevExpense)*100) : null;
  const incTrend    = prevIncome  ? Math.round(((income -prevIncome )/prevIncome )*100) : null;

  // ── Area chart — fill every month in the range so lines always connect ──
  const chartData = useMemo(()=>{
    // Build a bucket for every calendar month between period.start and period.end
    // even if there are no transactions that month (value = 0), so Recharts draws
    // continuous lines instead of isolated dots.
    const buckets = {};

    // Seed all months in range first
    const cursor = new Date(period.start.getFullYear(), period.start.getMonth(), 1);
    const endMo  = new Date(period.end.getFullYear(),   period.end.getMonth(),   1);
    while(cursor <= endMo) {
      const k   = `${cursor.getFullYear()}-${String(cursor.getMonth()).padStart(2,"0")}`;
      const lbl = `${MONTHS[cursor.getMonth()]}${cursor.getFullYear()!==now.getFullYear()?" "+cursor.getFullYear():""}`;
      buckets[k] = { name:lbl, sortKey:k, Income:0, Expenses:0 };
      cursor.setMonth(cursor.getMonth()+1);
    }

    // Fill with actual transaction data
    periodTxs.forEach(t=>{
      const d = new Date(t.date+"T00:00:00");
      const k = `${d.getFullYear()}-${String(d.getMonth()).padStart(2,"0")}`;
      if(!buckets[k]) return;
      if(t.type==="income") buckets[k].Income   += t.amount;
      else                  buckets[k].Expenses += t.amount;
    });

    return Object.values(buckets).sort((a,b)=>a.sortKey>b.sortKey?1:-1);
  },[periodTxs, period]);

  // ── Pie: category breakdown ──
  const pieData = useMemo(()=>{
    const map={};
    periodTxs.filter(t=>t.type==="expense").forEach(t=>{map[t.category]=(map[t.category]||0)+t.amount;});
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));
  },[periodTxs]);

  // ── P&L ──
  const pl       = income - expense;
  const isProfit = pl >= 0;
  const margin   = income > 0 ? ((pl/income)*100).toFixed(1) : "0.0";
  const prevPl   = prevIncome - prevExpense;
  const vsLast   = prevPl !== 0 ? ((pl-prevPl)/Math.abs(prevPl)*100).toFixed(0) : null;

  const handlePreset = (v) => {
    setPreset(v);
    setShowCustom(v === "custom");
  };



  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

      {/* ══ STAT CARDS — period picker lives in the header row ══ */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
        <div>
          <h2 style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:20, color:"var(--text)", letterSpacing:"-.02em" }}>Dashboard</h2>
          <div style={{ fontSize:12, color:"var(--text3)", marginTop:2 }}>{period.label} · {periodTxs.length} transactions</div>
        </div>
        <PeriodPicker preset={preset} period={period} customFrom={customFrom} customTo={customTo} onPreset={handlePreset} onCustomFrom={setCustomFrom} onCustomTo={setCustomTo} txCount={periodTxs.length}/>
      </div>

      <div className="stats-grid stagger">
        <StatCard label="Balance"  amount={balance}  icon={Wallet}      color="var(--accent)" soft="var(--accent-soft)"/>
        <StatCard label="Income"   amount={income}   icon={TrendingUp}  color="var(--teal)"   soft="var(--teal-soft)"  trend={incTrend}/>
        <StatCard label="Expenses" amount={expense}  icon={TrendingDown} color="var(--red)"  soft="var(--red-soft)"   trend={expTrend}/>
      </div>

      {/* ══ MINI FINANCIAL STATEMENT ══ */}
      {(()=>{
        // Income breakdown by category
        const incomeRows = CATEGORIES.income.map(cat=>({
          cat, val: periodTxs.filter(t=>t.type==="income"&&t.category===cat).reduce((s,t)=>s+t.amount,0)
        })).filter(r=>r.val>0);

        // Expense breakdown by category
        const expenseRows = CATEGORIES.expense.map(cat=>({
          cat, val: periodTxs.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+t.amount,0)
        })).filter(r=>r.val>0);

        const grossProfit = income - expense;
        const margin      = income>0?((grossProfit/income)*100).toFixed(1):"0.0";

        return (
          <div className="card fade-up" style={{ padding:0, overflow:"hidden" }}>
            {/* Statement header */}
            <div style={{ padding:"16px 24px", background: isProfit?"linear-gradient(135deg,#0a3b38,#1BA8A0)":"linear-gradient(135deg,#3d1a00,#E8631A)", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:15, color:"white", letterSpacing:"-.01em" }}>
                  Income Statement
                </div>
                <div style={{ fontSize:12, color:"rgba(255,255,255,0.7)", marginTop:2 }}>{period.label}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:2 }}>{isProfit?"Net Profit":"Net Loss"}</div>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:22, color:"white" }}>
                  {isProfit?"+":"-"}{fmt(Math.abs(pl))}
                </div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", marginTop:2 }}>
                  {margin}% margin
                  {vsLast!==null&&<span style={{ marginLeft:8 }}>{parseFloat(vsLast)>=0?"▲":"▼"} {Math.abs(vsLast)}% vs prior</span>}
                </div>
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0 }}>

              {/* ── LEFT: INCOME ── */}
              <div style={{ borderRight:"1px solid var(--border)" }}>
                {/* Section header */}
                <div style={{ padding:"12px 20px", background:"var(--teal-soft)", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <TrendingUp size={14} color="var(--teal)"/>
                    <span style={{ fontSize:12, fontWeight:700, color:"var(--teal)", textTransform:"uppercase", letterSpacing:".06em" }}>Income</span>
                  </div>
                  <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:14, color:"var(--teal)" }}>{fmt(income)}</span>
                </div>
                {/* Rows */}
                <div style={{ padding:"0 20px" }}>
                  {incomeRows.length===0
                    ? <div style={{ padding:"16px 0", fontSize:12, color:"var(--text3)", textAlign:"center" }}>No income recorded</div>
                    : incomeRows.sort((a,b)=>b.val-a.val).map((r,i)=>{
                        const pct = income>0?((r.val/income)*100):0;
                        return (
                          <div key={r.cat} style={{ padding:"10px 0", borderBottom: i<incomeRows.length-1?"1px solid var(--border)":"none" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                                <span style={{ width:8, height:8, borderRadius:2, background:CATEGORY_COLORS[r.cat]||"var(--teal)", display:"inline-block", flexShrink:0 }}/>
                                <span style={{ fontSize:13, color:"var(--text)" }}>{r.cat}</span>
                              </div>
                              <div style={{ textAlign:"right" }}>
                                <span style={{ fontFamily:"var(--font-display)", fontWeight:600, fontSize:13, color:"var(--text)" }}>{fmt(r.val)}</span>
                                <span style={{ fontSize:10, color:"var(--text3)", marginLeft:6 }}>{pct.toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="progress-bar" style={{ height:4 }}>
                              <div className="progress-fill" style={{ width:`${pct}%`, background:"var(--teal)", opacity:.7 }}/>
                            </div>
                          </div>
                        );
                      })
                  }
                </div>
              </div>

              {/* ── RIGHT: EXPENSES ── */}
              <div>
                <div style={{ padding:"12px 20px", background:"var(--red-soft)", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <TrendingDown size={14} color="var(--red)"/>
                    <span style={{ fontSize:12, fontWeight:700, color:"var(--red)", textTransform:"uppercase", letterSpacing:".06em" }}>Expenses</span>
                  </div>
                  <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:14, color:"var(--red)" }}>{fmt(expense)}</span>
                </div>
                <div style={{ padding:"0 20px" }}>
                  {expenseRows.length===0
                    ? <div style={{ padding:"16px 0", fontSize:12, color:"var(--text3)", textAlign:"center" }}>No expenses recorded</div>
                    : expenseRows.sort((a,b)=>b.val-a.val).map((r,i)=>{
                        const pct = expense>0?((r.val/expense)*100):0;
                        return (
                          <div key={r.cat} style={{ padding:"10px 0", borderBottom: i<expenseRows.length-1?"1px solid var(--border)":"none" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                                <span style={{ width:8, height:8, borderRadius:2, background:CATEGORY_COLORS[r.cat]||"var(--red)", display:"inline-block", flexShrink:0 }}/>
                                <span style={{ fontSize:13, color:"var(--text)" }}>{r.cat}</span>
                              </div>
                              <div style={{ textAlign:"right" }}>
                                <span style={{ fontFamily:"var(--font-display)", fontWeight:600, fontSize:13, color:"var(--text)" }}>{fmt(r.val)}</span>
                                <span style={{ fontSize:10, color:"var(--text3)", marginLeft:6 }}>{pct.toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="progress-bar" style={{ height:4 }}>
                              <div className="progress-fill" style={{ width:`${pct}%`, background:"var(--red)", opacity:.7 }}/>
                            </div>
                          </div>
                        );
                      })
                  }
                </div>
              </div>
            </div>

            {/* Bottom summary bar */}
            <div style={{ padding:"12px 20px", borderTop:"1px solid var(--border)", background:"var(--surface2)", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:0, textAlign:"center" }}>
              {[
                { label:"Total Income",  value:fmt(income),  color:"var(--teal)" },
                { label:"Total Expenses",value:fmt(expense), color:"var(--red)" },
                { label:isProfit?"Net Profit":"Net Loss", value:(isProfit?"+":"-")+fmt(Math.abs(pl)), color:isProfit?"var(--teal)":"var(--red)" },
              ].map((s,i)=>(
                <div key={i} style={{ padding:"8px 12px", borderRight:i<2?"1px solid var(--border)":"none" }}>
                  <div style={{ fontSize:10, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:3 }}>{s.label}</div>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:13, color:s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ══ CHARTS ══ */}
      <div className="charts-grid">
        {/* Income vs Expenses — themed card */}
        <div className="card fade-up">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div>
              <div className="section-title">Income vs Expenses</div>
              <div style={{ color:"var(--text3)", fontSize:12, marginTop:2 }}>{period.label}</div>
            </div>
            <PeriodPicker preset={preset} period={period} customFrom={customFrom} customTo={customTo} onPreset={handlePreset} onCustomFrom={setCustomFrom} onCustomTo={setCustomTo} txCount={periodTxs.length}/>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{top:8,right:8,left:0,bottom:0}}>
                <defs>
                  <linearGradient id="fillInc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#1BA8A0" stopOpacity={0.35}/>
                    <stop offset="100%" stopColor="#1BA8A0" stopOpacity={0.03}/>
                  </linearGradient>
                  <linearGradient id="fillExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#E8631A" stopOpacity={0.28}/>
                    <stop offset="100%" stopColor="#E8631A" stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="name" tick={{fill:"var(--text3)",fontSize:11}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"var(--text3)",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={62}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Area type="monotone" dataKey="Income"
                  stroke="#1BA8A0" strokeWidth={2.5} fill="url(#fillInc)"
                  dot={chartData.length===1?{r:5,fill:"#1BA8A0",stroke:"var(--surface)",strokeWidth:2}:false}
                  activeDot={{r:5,fill:"#1BA8A0",stroke:"var(--surface)",strokeWidth:2}}/>
                <Area type="monotone" dataKey="Expenses"
                  stroke="#E8631A" strokeWidth={2.5} fill="url(#fillExp)"
                  dot={chartData.length===1?{r:5,fill:"#E8631A",stroke:"var(--surface)",strokeWidth:2}:false}
                  activeDot={{r:5,fill:"#E8631A",stroke:"var(--surface)",strokeWidth:2}}/>
                <Legend wrapperStyle={{fontSize:12,paddingTop:8}} iconType="circle"/>
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="empty"><BarChart2 size={32} opacity={.3}/><div>No data for this period</div></div>}
        </div>

        {/* Pie chart */}
        <div className="card fade-up">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div>
              <div className="section-title">Spending by Category</div>
              <div style={{ color:"var(--text3)", fontSize:12, marginTop:2 }}>{period.label}</div>
            </div>
            <PieIcon size={18} color="var(--text3)"/>
          </div>
          {pieData.length>0?(
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((e,i)=><Cell key={i} fill={CATEGORY_COLORS[e.name]||"#94a3b8"}/>)}
                </Pie>
                <Tooltip formatter={v=>fmt(v)} contentStyle={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,fontFamily:"var(--font-body)",fontSize:13}}/>
                <Legend wrapperStyle={{fontSize:12}}/>
              </PieChart>
            </ResponsiveContainer>
          ):<div className="empty"><PieIcon size={32} opacity={.3}/><div>No expenses for this period</div></div>}
        </div>
      </div>

      {/* Budget comparison */}
      <BudgetComparison transactions={periodTxs} budgets={budgets} periodLabel={period.label}/>

      {/* Savings goals */}
      {goals.length>0&&(
        <div className="card fade-up">
          <div className="section-title" style={{ marginBottom:16 }}>Savings Goals</div>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {goals.map((g,i)=>{
              const pct=Math.min((parseFloat(g.saved)/parseFloat(g.target))*100,100);
              return (
                <div key={i}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}><Target size={14} color="var(--accent)"/><span>{g.name}</span></div>
                    <span style={{ color:"var(--text2)" }}>{fmt(parseFloat(g.saved)||0)} / {fmt(parseFloat(g.target)||0)}</span>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width:`${pct}%`, background:pct>=100?"var(--teal)":"var(--accent)" }}/></div>
                  {pct>=100&&<div style={{ fontSize:11, color:"var(--teal)", marginTop:4, display:"flex", alignItems:"center", gap:4 }}><Check size={11}/>Goal reached!</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent transactions for period */}
      <div className="card fade-up">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div className="section-title">Transactions — {period.label}</div>
          <span style={{ fontSize:12, color:"var(--text3)", background:"var(--surface2)", padding:"3px 10px", borderRadius:999 }}>{periodTxs.length} total</span>
        </div>
        {periodTxs.length>0
          ?periodTxs.slice(0,10).map(tx=><TxRow key={tx.id} tx={tx} onEdit={onEdit} onDelete={onDelete}/>)
          :<div className="empty"><List size={32} opacity={.3}/><div>No transactions in this period</div></div>}
        {periodTxs.length>10&&(
          <div style={{ paddingTop:12, textAlign:"center", fontSize:12, color:"var(--text3)" }}>
            Showing 10 of {periodTxs.length} — view all in the Transactions tab
          </div>
        )}
      </div>
    </div>
  );
};

// ─── TRANSACTIONS VIEW ─────────────────────────────────────────────────────

const Transactions = ({ transactions, onEdit, onDelete, onBulkDelete, onImport }) => {
  const [search,       setSearch]       = useState("");
  const [filterType,   setFilterType]   = useState("all");
  const [filterCat,    setFilterCat]    = useState("");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [showFilters,  setShowFilters]  = useState(false);
  const [selectMode,   setSelectMode]   = useState(false);
  const [selected,     setSelected]     = useState(new Set());
  const [bulkConfirm,  setBulkConfirm]  = useState(false);
  const [uploadError,  setUploadError]  = useState("");
  const [uploadSuccess,setUploadSuccess]= useState("");
  const fileInputRef = useRef(null);

  const filtered = useMemo(()=>transactions.filter(t=>{
    if(filterType!=="all"&&t.type!==filterType) return false;
    if(filterCat&&t.category!==filterCat) return false;
    if(dateFrom&&t.date<dateFrom) return false;
    if(dateTo&&t.date>dateTo) return false;
    if(search&&!`${t.description} ${t.category} ${t.amount}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }),[transactions,filterType,filterCat,dateFrom,dateTo,search]);

  const toggleSelect    = (id) => setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const allSel          = filtered.length>0&&filtered.every(t=>selected.has(t.id));
  const toggleSelectAll = ()=>{if(allSel)setSelected(s=>{const n=new Set(s);filtered.forEach(t=>n.delete(t.id));return n;});else setSelected(s=>{const n=new Set(s);filtered.forEach(t=>n.add(t.id));return n;});};
  const exitSelect      = ()=>{setSelectMode(false);setSelected(new Set());setBulkConfirm(false);};
  const confirmBulk     = ()=>{onBulkDelete([...selected]);exitSelect();};

  const exportCSV = ()=>{
    const rows=[["Date","Type","Category","Description","Amount(UGX)"],...filtered.map(t=>[t.date,t.type,t.category,`"${(t.description||"").replace(/"/g,'""')}"`,t.amount])];
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([rows.map(r=>r.join(",")).join("\n")],{type:"text/csv"}));a.download="transactions.csv";a.click();
  };

  const handleFileUpload = (e)=>{
    const file=e.target.files[0];
    if(fileInputRef.current)fileInputRef.current.value="";
    if(!file)return;
    setUploadError("");setUploadSuccess("");
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const lines=ev.target.result.trim().split("\n").filter(Boolean);
        if(lines.length<2)throw new Error("File is empty");
        const header=lines[0].split(",").map(h=>h.trim().toLowerCase().replace(/"/g,""));
        const idx={date:-1,type:-1,category:-1,description:-1,amount:-1};
        header.forEach((h,i)=>{if(h in idx)idx[h]=i;else if(h.includes("amount"))idx.amount=i;});
        if(idx.amount===-1||idx.type===-1)throw new Error("CSV must have 'type' and 'amount' columns");
        const parsed=[];const errs=[];
        lines.slice(1).forEach((line,li)=>{
          const cols=line.split(",");const get=(i)=>i>=0?(cols[i]||"").replace(/^"|"$/g,"").trim():"";
          const type=get(idx.type).toLowerCase();const amount=parseFloat(get(idx.amount));
          const date=get(idx.date)||new Date().toISOString().split("T")[0];
          const category=get(idx.category)||(type==="income"?"Other Income":"Other");
          if(!["income","expense"].includes(type)){errs.push(`Row ${li+2}: bad type`);return;}
          if(isNaN(amount)||amount<=0){errs.push(`Row ${li+2}: bad amount`);return;}
          parsed.push({id:Date.now()+li,type,amount,category,description:get(idx.description)||"",date});
        });
        if(parsed.length===0)throw new Error("No valid rows. "+errs.join("; "));
        onImport(parsed);
        setUploadSuccess(`Imported ${parsed.length} transaction${parsed.length!==1?"s":""}${errs.length?` (${errs.length} skipped)`:""}`);
        setTimeout(()=>setUploadSuccess(""),5000);
      }catch(err){setUploadError(err.message);}
    };
    reader.readAsText(file);
  };

  const allCats=[...new Set(transactions.map(t=>t.category))].sort();

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {uploadError&&<div style={{ background:"var(--red-soft)", border:"1px solid var(--red)", color:"var(--red)", padding:"12px 16px", borderRadius:"var(--radius-sm)", fontSize:13, display:"flex", justifyContent:"space-between", gap:8 }}><div style={{ display:"flex", gap:8 }}><AlertCircle size={15}/>{uploadError}</div><button onClick={()=>setUploadError("")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--red)", display:"flex" }}><X size={14}/></button></div>}
      {uploadSuccess&&<div style={{ background:"var(--green-soft)", border:"1px solid var(--green)", color:"var(--green)", padding:"12px 16px", borderRadius:"var(--radius-sm)", fontSize:13, display:"flex", justifyContent:"space-between" }}><span>✓ {uploadSuccess}</span><button onClick={()=>setUploadSuccess("")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--green)", display:"flex" }}><X size={14}/></button></div>}

      <div className="card">
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <div style={{ flex:1, minWidth:180 }}><input className="input" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
          <button className="btn btn-ghost" onClick={()=>setShowFilters(f=>!f)} style={{ background:showFilters?"var(--accent-soft)":"transparent", color:showFilters?"var(--accent)":"var(--text2)", borderColor:showFilters?"var(--accent)":"var(--border)" }}><Filter size={15}/>Filters</button>
          <button className="btn btn-ghost" onClick={()=>fileInputRef.current?.click()}><Upload size={15}/>Import</button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display:"none" }} onChange={handleFileUpload}/>
          <button className="btn btn-ghost" onClick={exportCSV}><Download size={15}/>Export</button>
          <button className="btn btn-ghost" onClick={()=>{setSelectMode(s=>!s);setSelected(new Set());setBulkConfirm(false);}} style={{ background:selectMode?"var(--accent-soft)":"transparent", color:selectMode?"var(--accent)":"var(--text2)", borderColor:selectMode?"var(--accent)":"var(--border)" }}><Check size={15}/>{selectMode?"Cancel":"Select"}</button>
        </div>
        {showFilters&&(
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))", gap:10, marginTop:14, paddingTop:14, borderTop:"1px solid var(--border)" }}>
            <div><label className="label">Type</label><div style={{ position:"relative" }}><select className="input" value={filterType} onChange={e=>setFilterType(e.target.value)}><option value="all">All</option><option value="income">Income</option><option value="expense">Expense</option></select><ChevronDown size={14} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:"var(--text3)" }}/></div></div>
            <div><label className="label">Category</label><div style={{ position:"relative" }}><select className="input" value={filterCat} onChange={e=>setFilterCat(e.target.value)}><option value="">All</option>{allCats.map(c=><option key={c}>{c}</option>)}</select><ChevronDown size={14} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:"var(--text3)" }}/></div></div>
            <div><label className="label">From</label><input className="input" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></div>
            <div><label className="label">To</label><input className="input" type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></div>
          </div>
        )}
      </div>

      <div className="card" style={{ background:"var(--surface2)", border:"1.5px dashed var(--border)", boxShadow:"none", padding:"16px 20px" }} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFileUpload({target:{files:[f]}});}}>
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"var(--accent-soft)", display:"flex", alignItems:"center", justifyContent:"center" }}><Upload size={16} color="var(--accent)"/></div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:600, fontSize:13 }}>Import transactions from CSV</div>
            <div style={{ fontSize:12, color:"var(--text3)", marginTop:2 }}>
                  Drag & drop or <span style={{ color:"var(--accent)", cursor:"pointer" }} onClick={()=>fileInputRef.current?.click()}>browse</span> a CSV file.
                </div>
                <div style={{ fontSize:11, color:"var(--text3)", marginTop:6, display:"flex", flexWrap:"wrap", gap:4 }}>
                  <span style={{ fontWeight:600, color:"var(--text2)" }}>Columns:</span>
                  {["date (YYYY-MM-DD)","type (income/expense)","category","description","amount (UGX)"].map(f=>(
                    <code key={f} style={{ background:"var(--border)", padding:"1px 6px", borderRadius:4, fontSize:11 }}>{f}</code>
                  ))}
                </div>
                <div style={{ fontSize:11, color:"var(--text3)", marginTop:4, display:"flex", flexWrap:"wrap", gap:3 }}>
                  <span style={{ fontWeight:600, color:"var(--text2)" }}>Categories:</span>
                  {["Salary","Freelance","Investment","Gift","Other Income","Housing","Food","Transport","Entertainment","Health","Shopping","Education","Utilities","Other"].map(c=>(
                    <span key={c} style={{ background:"var(--surface2)", border:"1px solid var(--border)", padding:"1px 6px", borderRadius:4, fontSize:10 }}>{c}</span>
                  ))}
                </div>
          </div>
          <button onClick={()=>{
                  const rows = [
                    "date,type,category,description,amount",
                    "# YYYY-MM-DD | type: income or expense | amount in UGX (numbers only)",
                    "2024-07-01,income,Salary,Monthly salary,16500000",
                    "2024-07-10,income,Freelance,Website design project,1200000",
                    "2024-07-15,income,Investment,Dividend payment,450000",
                    "2024-07-20,income,Gift,Birthday gift,200000",
                    "2024-07-02,expense,Housing,Monthly rent,4500000",
                    "2024-07-03,expense,Food,Groceries and dining,820000",
                    "2024-07-05,expense,Transport,Fuel and boda boda,210000",
                    "2024-07-08,expense,Utilities,Electricity and internet,180000",
                    "2024-07-12,expense,Health,Medical checkup,150000",
                    "2024-07-14,expense,Education,School fees,500000",
                    "2024-07-18,expense,Entertainment,Cinema and events,80000",
                    "2024-07-22,expense,Shopping,Clothing and household,320000",
                    "2024-07-25,expense,Other,Miscellaneous expense,75000",
                  ].join("\n");
                  const blob = new Blob([rows], { type:"text/csv;charset=utf-8;" });
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement("a");
                  a.href     = url;
                  a.download = "cheda_import_template.csv";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }} style={{ fontSize:12, color:"var(--accent)", background:"none", border:"none", cursor:"pointer", fontFamily:"var(--font-body)", display:"flex", alignItems:"center", gap:4, padding:0 }}>
                  <Download size={12}/>Download Template
                </button>
        </div>
      </div>

      {selectMode&&(
        <div className="card fade-up" style={{ background:selected.size>0?"var(--accent-soft)":"var(--surface2)", border:`1.5px solid ${selected.size>0?"var(--accent)":"var(--border)"}`, padding:"14px 20px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <div onClick={toggleSelectAll} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", userSelect:"none" }}>
              <div style={{ width:20, height:20, borderRadius:6, border:`2px solid ${allSel?"var(--accent)":"var(--border)"}`, background:allSel?"var(--accent)":"transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>{allSel&&<Check size={12} color="white"/>}</div>
              <span style={{ fontSize:13, color:"var(--text2)" }}>{allSel?`Deselect all`:`Select all (${filtered.length})`}</span>
            </div>
            <div style={{ flex:1, fontSize:13, color:"var(--accent)", fontWeight:600 }}>{selected.size>0?`${selected.size} selected`:"Tap rows to select"}</div>
            {selected.size>0&&(bulkConfirm?(
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:13, color:"var(--red)", fontWeight:500 }}>Delete {selected.size}?</span>
                <button className="btn btn-danger" style={{ padding:"6px 14px", fontSize:13 }} onClick={confirmBulk}><Trash2 size={13}/>Yes</button>
                <button className="btn btn-ghost" style={{ padding:"6px 14px", fontSize:13 }} onClick={()=>setBulkConfirm(false)}>Cancel</button>
              </div>
            ):(
              <button className="btn btn-danger" style={{ padding:"6px 14px", fontSize:13 }} onClick={()=>setBulkConfirm(true)}><Trash2 size={13}/>Delete {selected.size}</button>
            ))}
            <button className="btn btn-ghost" style={{ padding:"6px 12px", fontSize:13 }} onClick={exitSelect}><X size={13}/>Done</button>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <span className="section-title">{filtered.length} Transaction{filtered.length!==1?"s":""}</span>
          {(filterType!=="all"||filterCat||dateFrom||dateTo||search)&&<button className="btn btn-ghost" style={{ fontSize:12, padding:"5px 10px" }} onClick={()=>{setFilterType("all");setFilterCat("");setDateFrom("");setDateTo("");setSearch("");}}><X size={12}/>Clear</button>}
        </div>
        {filtered.length>0?filtered.map(tx=><TxRow key={tx.id} tx={tx} onEdit={onEdit} onDelete={onDelete} selectable={selectMode} selected={selected.has(tx.id)} onToggleSelect={toggleSelect}/>):<div className="empty"><List size={32} opacity={.3}/><div>No transactions found</div></div>}
      </div>
    </div>
  );
};


// ─── URA PAYE CALCULATOR ───────────────────────────────────────────────────
//
// URA PAYE bands (monthly chargeable income, FY 2024/25):
//   0 – 335,000          → Nil
//   335,001 – 410,000    → 20% of amount exceeding 335,000
//   410,001 – 485,000    → UGX 15,000 + 25% of amount exceeding 410,000
//   485,001 – 10,000,000 → UGX 33,750 + 30% of amount exceeding 485,000
//   Above 10,000,000     → UGX 33,750 + 30%×(9,515,000) + 40% of excess over 10M
//
// Forward:  Gross → Chargeable → PAYE → Net
// Reverse:  Net → Gross (binary search, converges in <20 iterations)

const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function computePAYE(ci) {
  if (ci <= 335000)    return 0;
  if (ci <= 410000)    return (ci - 335000) * 0.20;
  if (ci <= 485000)    return 15000 + (ci - 410000) * 0.25;
  if (ci <= 10000000)  return 33750 + (ci - 485000) * 0.30;
  return 33750 + (9515000 * 0.30) + (ci - 10000000) * 0.40;
}

// Given gross, compute full breakdown
function computeFromGross(gross, ncb, housedByEmp, valueHousing, rentToEmp, deductLST) {
  const lst  = deductLST ? 9000 : 0;
  const rent = housedByEmp ? (parseFloat(rentToEmp) || 0) : 0;
  const housingDeduction = housedByEmp ? Math.min(parseFloat(valueHousing)||0, gross/3) : 0;
  const chargeableIncome = Math.max(0, gross + (parseFloat(ncb)||0) - housingDeduction);
  const paye = computePAYE(chargeableIncome);
  const nssf = Math.min(gross * 0.05, 350000);
  const totalDeductions = paye + nssf + lst + rent;
  const netPay = gross - totalDeductions;
  return { gross, chargeableIncome, housingDeduction, ncb: parseFloat(ncb)||0, paye, nssf, lst, rent, totalDeductions, netPay, effectiveRate: gross > 0 ? (paye/gross)*100 : 0 };
}

// Reverse: given net, find gross via binary search
function computeFromNet(targetNet, ncb, housedByEmp, valueHousing, rentToEmp, deductLST) {
  let lo = targetNet, hi = targetNet * 3 + 500000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const r = computeFromGross(mid, ncb, housedByEmp, valueHousing, rentToEmp, deductLST);
    if (Math.abs(r.netPay - targetNet) < 1) return r;
    if (r.netPay < targetNet) lo = mid; else hi = mid;
  }
  return computeFromGross((lo+hi)/2, ncb, housedByEmp, valueHousing, rentToEmp, deductLST);
}

const fmtN   = (n) => "UGX " + Math.round(n).toLocaleString("en-UG");
const fmtNs  = (n) => Math.round(n).toLocaleString("en-UG");

const PAYE_SCHEDULE = [
  ["0 – 335,000",          "Nil",        "Tax-free"],
  ["335,001 – 410,000",    "20%",        "of amount over 335,000"],
  ["410,001 – 485,000",    "25%",        "UGX 15,000 + 25% over 410,000"],
  ["485,001 – 10,000,000", "30%",        "UGX 33,750 + 30% over 485,000"],
  ["Above 10,000,000",     "40%",        "30% base + 10% surtax over 10M"],
];

// Standalone so it never remounts on parent re-render (fixes focus loss bug)
const NetPayInputField = ({ label, value, onChange, hint, onEnter }) => (
  <div>
    <label className="label">{label}</label>
    <div style={{ position:"relative" }}>
      <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:11, fontWeight:700, color:"var(--text3)", letterSpacing:".02em" }}>UGX</span>
      <input
        className="input"
        style={{ paddingLeft:50, fontSize:15, fontWeight:500, fontFamily:"var(--font-display)", letterSpacing:"-.01em" }}
        type="number"
        placeholder="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(); }}
      />
    </div>
    {hint && <div style={{ fontSize:11, color:"var(--text3)", marginTop:4 }}>{hint}</div>}
  </div>
);

const NetPayCalc = () => {
  const now = new Date();
  const [mode,         setMode]         = useState("gross2net"); // "gross2net" | "net2gross"
  const [year,         setYear]         = useState(now.getFullYear());
  const [month,        setMonth]        = useState(now.getMonth());
  const [grossInput,   setGrossInput]   = useState("");
  const [netInput,     setNetInput]     = useState("");
  const [nonCash,      setNonCash]      = useState("");
  const [housedByEmp,  setHousedByEmp]  = useState(false);
  const [valueHousing, setValueHousing] = useState("");
  const [rentToEmp,    setRentToEmp]    = useState("");
  const [deductLST,    setDeductLST]    = useState(false);
  const [result,       setResult]       = useState(null);
  const [showSched,    setShowSched]    = useState(false);
  const [animKey,      setAnimKey]      = useState(0);

  const years = [now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1];

  const calculate = () => {
    let r;
    if (mode === "gross2net") {
      const g = parseFloat(grossInput) || 0;
      if (g <= 0) return;
      r = computeFromGross(g, nonCash, housedByEmp, valueHousing, rentToEmp, deductLST);
    } else {
      const n = parseFloat(netInput) || 0;
      if (n <= 0) return;
      r = computeFromNet(n, nonCash, housedByEmp, valueHousing, rentToEmp, deductLST);
    }
    setResult(r);
    setAnimKey(k => k+1);
  };

  const clearAll = () => {
    setGrossInput(""); setNetInput(""); setNonCash("");
    setValueHousing(""); setRentToEmp(""); setHousedByEmp(false);
    setDeductLST(false); setResult(null);
  };

  const switchMode = (m) => { setMode(m); setResult(null); setGrossInput(""); setNetInput(""); };

  // ── determine tax band label ──
  const bandLabel = (ci) => {
    if (ci <= 335000)    return { label:"Tax-free", color:"#10b981" };
    if (ci <= 410000)    return { label:"20% band",  color:"#f59e0b" };
    if (ci <= 485000)    return { label:"25% band",  color:"#f97316" };
    if (ci <= 10000000)  return { label:"30% band",  color:"#ef4444" };
    return                      { label:"40% band (surtax)", color:"#7c3aed" };
  };

  const band = result ? bandLabel(result.chargeableIncome) : null;

  return (
    <div style={{ maxWidth:960, margin:"0 auto", display:"flex", flexDirection:"column", gap:24 }}>

      {/* ── TOP HERO ── */}
      <div className="fade-up" style={{ borderRadius:"var(--radius)", overflow:"hidden", background:"linear-gradient(135deg,#1a0a02 0%,var(--accent) 45%,var(--teal) 100%)", padding:"32px 36px", position:"relative" }}>
        {/* decorative circles */}
        <div style={{ position:"absolute", top:-40, right:-40, width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.05)" }}/>
        <div style={{ position:"absolute", bottom:-60, right:80, width:140, height:140, borderRadius:"50%", background:"rgba(255,255,255,0.04)" }}/>

        <div style={{ position:"relative", display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
          <div style={{ width:60, height:60, borderRadius:18, background:"rgba(255,255,255,0.15)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, border:"1px solid rgba(255,255,255,0.2)" }}>
            <Calculator size={30} color="white"/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:24, color:"white", letterSpacing:"-.02em" }}>URA Net Pay Calculator</div>
            <div style={{ color:"rgba(255,255,255,0.7)", fontSize:13, marginTop:5, maxWidth:480 }}>
              Uganda Revenue Authority PAYE · NSSF · LST · Forward & Reverse calculation
            </div>
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <button onClick={()=>setShowSched(s=>!s)} style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.25)", borderRadius:10, padding:"9px 16px", color:"white", cursor:"pointer", fontSize:13, fontFamily:"var(--font-body)", display:"flex", alignItems:"center", gap:7, backdropFilter:"blur(4px)", transition:"background .15s" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"}>
              <FileText size={14}/>{showSched?"Hide":"PAYE"} Schedule
            </button>
          </div>
        </div>

        {/* Mode pills inside hero */}
        <div style={{ position:"relative", marginTop:24, display:"flex", gap:0, background:"rgba(0,0,0,0.2)", borderRadius:12, padding:4, width:"fit-content" }}>
          {[["gross2net","Gross → Net","I know my gross pay"],["net2gross","Net → Gross","I know my take-home"]].map(([m,label,sub])=>(
            <button key={m} onClick={()=>switchMode(m)} style={{ padding:"10px 20px", borderRadius:9, border:"none", cursor:"pointer", fontFamily:"var(--font-body)", fontWeight:600, fontSize:13, transition:"all .2s", background:mode===m?"white":"transparent", color:mode===m?"var(--accent)":"rgba(255,255,255,0.7)", boxShadow:mode===m?"0 2px 8px rgba(0,0,0,0.2)":"none" }}>
              <div>{label}</div>
              <div style={{ fontSize:10, fontWeight:400, opacity:.7, marginTop:2 }}>{sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── PAYE SCHEDULE ── */}
      {showSched && (
        <div className="card fade-up" style={{ padding:0, overflow:"hidden" }}>
          <div style={{ padding:"16px 24px", background:"var(--accent-soft)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10 }}>
            <FileText size={16} color="var(--accent)"/>
            <span style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:15, color:"var(--text)" }}>Monthly PAYE Schedule — Uganda FY 2024/25</span>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"var(--surface2)" }}>
                  {["Chargeable Income (UGX)","Rate","Formula"].map(h=>(
                    <th key={h} style={{ padding:"10px 20px", textAlign:"left", fontWeight:600, color:"var(--text2)", fontSize:11, textTransform:"uppercase", letterSpacing:".05em", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PAYE_SCHEDULE.map(([band,rate,formula],i)=>(
                  <tr key={i} style={{ borderTop:"1px solid var(--border)" }}>
                    <td style={{ padding:"13px 20px", fontFamily:"var(--font-display)", fontWeight:600, color:"var(--text)", whiteSpace:"nowrap" }}>{band}</td>
                    <td style={{ padding:"13px 20px" }}><span style={{ background:["var(--teal-soft)","var(--accent-soft)","var(--accent-soft)","var(--red-soft)","var(--red-soft)"][i], color:["var(--teal)","var(--accent)","var(--accent2)","var(--red)","var(--red)"][i], padding:"2px 10px", borderRadius:999, fontSize:12, fontWeight:700 }}>{rate}</span></td>
                    <td style={{ padding:"13px 20px", color:"var(--text2)" }}>{formula}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding:"10px 20px", borderTop:"1px solid var(--border)", fontSize:11, color:"var(--text3)" }}>
            NSSF: 5% of gross (employee) · Max UGX 350,000/month &nbsp;·&nbsp; LST: UGX 9,000/month &nbsp;·&nbsp; Source: Uganda Revenue Authority
          </div>
        </div>
      )}

      {/* ── MAIN GRID ── */}
      <div style={{ display:"grid", gridTemplateColumns:"5fr 7fr", gap:20, alignItems:"start" }}>

        {/* ── INPUT CARD ── */}
        <div className="card fade-up" style={{ padding:0, overflow:"hidden" }}>
          {/* Card header */}
          <div style={{ padding:"18px 24px", borderBottom:"1px solid var(--border)", background:"var(--surface2)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:15, color:"var(--text)" }}>
                {mode==="gross2net"?"Enter Gross Pay":"Enter Net Pay"}
              </div>
              <div style={{ fontSize:12, color:"var(--text3)", marginTop:2 }}>
                {mode==="gross2net"?"We'll compute your take-home":"We'll reverse-calculate your gross"}
              </div>
            </div>
            {/* Period selectors */}
            <div style={{ display:"flex", gap:6 }}>
              <div style={{ position:"relative" }}>
                <select className="input" style={{ padding:"5px 24px 5px 9px", fontSize:12, width:"auto" }} value={month} onChange={e=>setMonth(Number(e.target.value))}>
                  {MONTHS_FULL.map((m,i)=><option key={i} value={i}>{m.slice(0,3)}</option>)}
                </select>
                <ChevronDown size={11} style={{ position:"absolute", right:6, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:"var(--text3)" }}/>
              </div>
              <div style={{ position:"relative" }}>
                <select className="input" style={{ padding:"5px 24px 5px 9px", fontSize:12, width:"auto" }} value={year} onChange={e=>setYear(Number(e.target.value))}>
                  {years.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
                <ChevronDown size={11} style={{ position:"absolute", right:6, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:"var(--text3)" }}/>
              </div>
            </div>
          </div>

          <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>
            {/* Primary input */}
            {mode==="gross2net"
              ? <NetPayInputField label="Gross Monthly Pay (UGX)" value={grossInput} onChange={setGrossInput} onEnter={calculate}/>
              : <NetPayInputField label="Net Monthly Pay / Take-Home (UGX)" value={netInput} onChange={setNetInput} hint="We'll find the gross that produces this net" onEnter={calculate}/>
            }

            {/* Non-Cash Benefits */}
            <div>
              <label className="label" style={{ display:"flex", alignItems:"center", gap:5 }}>
                Non-Cash Benefits
                <span title="Benefits in kind e.g. car use, fuel" style={{ cursor:"help", color:"var(--text3)", display:"flex" }}><Info size={11}/></span>
              </label>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:11, fontWeight:700, color:"var(--text3)" }}>UGX</span>
                <input className="input" style={{ paddingLeft:50 }} type="number" placeholder="0" value={nonCash} onChange={e=>setNonCash(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")calculate();}}/>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height:1, background:"var(--border)" }}/>

            {/* Checkboxes */}
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {/* Housed */}
              <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", userSelect:"none", padding:"10px 14px", borderRadius:"var(--radius-sm)", border:`1.5px solid ${housedByEmp?"var(--accent)":"var(--border)"}`, background:housedByEmp?"var(--accent-soft)":"var(--surface2)", transition:"all .15s" }}>
                <input type="checkbox" checked={housedByEmp} onChange={e=>setHousedByEmp(e.target.checked)} style={{ width:16, height:16, accentColor:"var(--accent)", cursor:"pointer", flexShrink:0 }}/>
                <div>
                  <div style={{ fontWeight:600, fontSize:13, color:"var(--text)" }}>Housed by Employer</div>
                  <div style={{ fontSize:11, color:"var(--text3)", marginTop:1 }}>Reduces chargeable income</div>
                </div>
              </label>
              {/* LST */}
              <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", userSelect:"none", padding:"10px 14px", borderRadius:"var(--radius-sm)", border:`1.5px solid ${deductLST?"var(--accent)":"var(--border)"}`, background:deductLST?"var(--accent-soft)":"var(--surface2)", transition:"all .15s" }}>
                <input type="checkbox" checked={deductLST} onChange={e=>setDeductLST(e.target.checked)} style={{ width:16, height:16, accentColor:"var(--accent)", cursor:"pointer", flexShrink:0 }}/>
                <div>
                  <div style={{ fontWeight:600, fontSize:13, color:"var(--text)" }}>Deduct LST</div>
                  <div style={{ fontSize:11, color:"var(--text3)", marginTop:1 }}>Local Service Tax · UGX 9,000/month</div>
                </div>
              </label>
            </div>

            {/* Housing details (conditional) */}
            {housedByEmp && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, padding:"14px", background:"var(--accent-soft)", borderRadius:"var(--radius-sm)", border:"1px solid rgba(99,102,241,.2)" }}>
                <div>
                  <label className="label" style={{ color:"var(--accent)" }}>Value of Housing</label>
                  <div style={{ position:"relative" }}>
                    <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:10, fontWeight:700, color:"var(--text3)" }}>UGX</span>
                    <input className="input" style={{ paddingLeft:42, fontSize:13 }} type="number" placeholder="0" value={valueHousing} onChange={e=>setValueHousing(e.target.value)}/>
                  </div>
                </div>
                <div>
                  <label className="label" style={{ color:"var(--accent)" }}>Rent to Employer</label>
                  <div style={{ position:"relative" }}>
                    <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:10, fontWeight:700, color:"var(--text3)" }}>UGX</span>
                    <input className="input" style={{ paddingLeft:42, fontSize:13 }} type="number" placeholder="0" value={rentToEmp} onChange={e=>setRentToEmp(e.target.value)}/>
                  </div>
                </div>
                <div style={{ gridColumn:"1/-1", fontSize:11, color:"var(--accent)", opacity:.8 }}>Deduction = lower of housing value or ⅓ of gross pay</div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:10, marginTop:4 }}>
              <button className="btn btn-ghost" onClick={clearAll} style={{ justifyContent:"center", fontSize:13 }}>Clear</button>
              <button className="btn btn-primary" onClick={calculate} style={{ justifyContent:"center", fontSize:14, padding:"11px" }}>
                <Calculator size={16}/>Calculate
              </button>
            </div>
          </div>
        </div>

        {/* ── RESULTS PANEL ── */}
        <div key={animKey} style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {result ? (
            <>
              {/* Primary result card */}
              <div className="fade-up" style={{ borderRadius:"var(--radius)", overflow:"hidden", position:"relative" }}>
                {/* Top half — the headline number */}
                <div style={{ background: mode==="gross2net" ? "linear-gradient(135deg,#0a3b38,var(--teal))" : "linear-gradient(135deg,#3d1a00,var(--accent))", padding:"28px 28px 20px", textAlign:"center", position:"relative" }}>
                  <div style={{ position:"absolute", top:0, left:0, right:0, bottom:0, backgroundImage:"radial-gradient(circle at 80% 20%, rgba(255,255,255,0.08) 0%, transparent 60%)" }}/>
                  <div style={{ position:"relative" }}>
                    <div style={{ fontSize:11, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:"rgba(255,255,255,0.6)", marginBottom:8 }}>
                      {mode==="gross2net"?"Take-Home Pay":"Gross Pay"} · {MONTHS_FULL[month]} {year}
                    </div>
                    <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:38, color:"white", letterSpacing:"-.03em", lineHeight:1 }}>
                      {fmtN(mode==="gross2net"?result.netPay:result.gross)}
                    </div>
                    <div style={{ marginTop:10, display:"flex", gap:16, justifyContent:"center", flexWrap:"wrap" }}>
                      <div style={{ fontSize:12, color:"rgba(255,255,255,0.65)", display:"flex", alignItems:"center", gap:5 }}>
                        <span style={{ width:6, height:6, borderRadius:"50%", background:"rgba(255,255,255,0.5)", display:"inline-block" }}/>
                        Effective tax: <strong style={{ color:"white" }}>{result.effectiveRate.toFixed(2)}%</strong>
                      </div>
                      <div style={{ fontSize:12, color:"rgba(255,255,255,0.65)", display:"flex", alignItems:"center", gap:5 }}>
                        <span style={{ width:6, height:6, borderRadius:"50%", background:"rgba(255,255,255,0.5)", display:"inline-block" }}/>
                        PAYE: <strong style={{ color:"white" }}>{fmtN(result.paye)}</strong>
                      </div>
                      <div style={{ fontSize:12, color:"rgba(255,255,255,0.65)", display:"flex", alignItems:"center", gap:5 }}>
                        <span style={{ width:6, height:6, borderRadius:"50%", background:"rgba(255,255,255,0.5)", display:"inline-block" }}/>
                        Tax band: <strong style={{ color:"white" }}>{band.label}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom half — 3 stat chips */}
                <div style={{ background:"var(--surface)", borderTop:"1px solid var(--border)", display:"grid", gridTemplateColumns:"1fr 1fr 1fr" }}>
                  {[
                    { label:"Gross Pay",   value:fmtN(result.gross),       sub:"Before deductions" },
                    { label:"PAYE + NSSF", value:fmtN(result.paye+result.nssf), sub:"Total statutory" },
                    { label:"Net Pay",     value:fmtN(result.netPay),      sub:"Take-home amount" },
                  ].map((s,i)=>(
                    <div key={i} style={{ padding:"16px 14px", borderRight:i<2?"1px solid var(--border)":"none", textAlign:"center" }}>
                      <div style={{ fontSize:11, color:"var(--text3)", marginBottom:5, textTransform:"uppercase", letterSpacing:".04em" }}>{s.label}</div>
                      <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14, color:"var(--text)" }}>{s.value}</div>
                      <div style={{ fontSize:10, color:"var(--text3)", marginTop:2 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stacked bar visual */}
              <div className="card fade-up" style={{ padding:"20px 24px" }}>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:14, marginBottom:16, color:"var(--text)" }}>Pay Composition</div>
                {/* Single stacked bar */}
                <div style={{ height:28, borderRadius:8, overflow:"hidden", display:"flex", marginBottom:14 }}>
                  {[
                    { value:result.netPay,  color:"#1BA8A0", label:"Net" },
                    { value:result.paye,    color:"#E8631A", label:"PAYE" },
                    { value:result.nssf,    color:"#f59e0b", label:"NSSF" },
                    { value:result.lst,     color:"#8b5cf6", label:"LST",  hide:result.lst===0 },
                    { value:result.rent,    color:"#06b6d4", label:"Rent", hide:result.rent===0 },
                  ].filter(s=>!s.hide&&s.value>0).map((s,i)=>{
                    const w = (s.value/result.gross)*100;
                    return <div key={i} title={`${s.label}: ${fmtN(s.value)} (${w.toFixed(1)}%)`} style={{ width:`${w}%`, background:s.color, transition:"width .6s ease", cursor:"default" }}/>;
                  })}
                </div>
                {/* Legend */}
                <div style={{ display:"flex", flexWrap:"wrap", gap:"10px 18px" }}>
                  {[
                    { value:result.netPay, color:"#1BA8A0", label:"Net Pay" },
                    { value:result.paye,   color:"#E8631A", label:"PAYE Tax" },
                    { value:result.nssf,   color:"#d4a017", label:"NSSF (5%)" },
                    { value:result.lst,    color:"#8b5cf6", label:"LST",  hide:result.lst===0 },
                    { value:result.rent,   color:"#06b6d4", label:"Rent", hide:result.rent===0 },
                  ].filter(s=>!s.hide).map((s,i)=>{
                    const w = result.gross>0 ? (s.value/result.gross)*100 : 0;
                    return (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                        <span style={{ width:10, height:10, borderRadius:3, background:s.color, display:"inline-block", flexShrink:0 }}/>
                        <span style={{ color:"var(--text2)" }}>{s.label}</span>
                        <span style={{ color:"var(--text)", fontWeight:600 }}>{w.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detailed breakdown */}
              <div className="card fade-up" style={{ padding:0, overflow:"hidden" }}>
                <div style={{ padding:"14px 20px", background:"var(--surface2)", borderBottom:"1px solid var(--border)", fontFamily:"var(--font-display)", fontWeight:700, fontSize:14, color:"var(--text)" }}>
                  Full Breakdown
                </div>
                <div style={{ padding:"0 20px" }}>
                  {[
                    { label:"Gross Pay",             value:result.gross,            color:"var(--green)",  bold:false, op:"+" },
                    { label:"Non-Cash Benefits",      value:result.ncb,              color:"var(--text2)", bold:false, op:"+", hide:result.ncb===0 },
                    { label:"Housing Deduction",      value:result.housingDeduction, color:"var(--red)",   bold:false, op:"−", hide:!housedByEmp||result.housingDeduction===0 },
                    { label:"Chargeable Income",      value:result.chargeableIncome, color:"var(--accent)",bold:true,  op:"=", divider:true },
                    { label:"PAYE Tax",               value:result.paye,             color:"var(--red)",   bold:false, op:"−" },
                    { label:"NSSF (5% employee)",     value:result.nssf,             color:"var(--red)",   bold:false, op:"−" },
                    { label:"LST",                    value:result.lst,              color:"var(--red)",   bold:false, op:"−", hide:result.lst===0 },
                    { label:"Rent to Employer",       value:result.rent,             color:"var(--red)",   bold:false, op:"−", hide:result.rent===0 },
                    { label:"Total Deductions",       value:result.totalDeductions,  color:"var(--red)",   bold:true,  op:"",  divider:true },
                    { label:"Net Pay (Take-Home)",    value:result.netPay,           color:"#1BA8A0",      bold:true,  op:"=", divider:true, hero:true },
                  ].filter(r=>!r.hide).map((r,i)=>(
                    <div key={i}>
                      {r.divider && <div style={{ height:1, background:"var(--border)", margin:"2px 0" }}/>}
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:r.hero?"14px 0":"10px 0" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          {r.op&&<span style={{ width:20, height:20, borderRadius:6, background: r.op==="+"?"var(--green-soft)":r.op==="−"?"var(--red-soft)":r.op==="="?"var(--teal-soft)":"transparent", color:r.op==="+"?"var(--teal)":r.op==="−"?"var(--red)":r.op==="="?"var(--teal)":"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, flexShrink:0 }}>{r.op}</span>}
                          <span style={{ fontSize:r.hero?14:13, fontWeight:r.bold?600:400, color:r.bold?"var(--text)":"var(--text2)" }}>{r.label}</span>
                        </div>
                        <span style={{ fontFamily:r.bold?"var(--font-display)":"var(--font-body)", fontWeight:r.hero?800:r.bold?700:500, fontSize:r.hero?18:13, color:r.color }}>
                          {fmtN(r.value)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reverse mode note */}
              {mode==="net2gross" && (
                <div className="fade-up" style={{ padding:"12px 16px", background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.2)", borderRadius:"var(--radius-sm)", display:"flex", gap:10, alignItems:"flex-start", fontSize:12 }}>
                  <Info size={14} color="#3b82f6" style={{ flexShrink:0, marginTop:1 }}/>
                  <div style={{ color:"var(--text2)" }}>
                    <strong style={{ color:"var(--text)" }}>Reverse calculation</strong> — The gross of <strong>{fmtN(result.gross)}</strong> was found to produce a net of <strong>{fmtN(result.netPay)}</strong> (±UGX 1 rounding). Useful when negotiating a salary offer in net terms.
                  </div>
                </div>
              )}
            </>
          ) : (
            // Empty state
            <div className="card fade-up" style={{ minHeight:380, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20, padding:40 }}>
              <div style={{ position:"relative" }}>
                <div style={{ width:80, height:80, borderRadius:24, background:"var(--accent-soft)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Calculator size={40} color="var(--accent)" style={{ opacity:.7 }}/>
                </div>
                <div style={{ position:"absolute", top:-4, right:-4, width:22, height:22, borderRadius:"50%", background:mode==="gross2net"?"var(--green)":"var(--accent)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ color:"white", fontSize:12, fontWeight:800 }}>{mode==="gross2net"?"→":"←"}</span>
                </div>
              </div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:17, color:"var(--text)", marginBottom:8 }}>
                  {mode==="gross2net"?"Calculate your take-home":"Find your gross from net"}
                </div>
                <div style={{ fontSize:13, color:"var(--text3)", maxWidth:280, lineHeight:1.6 }}>
                  {mode==="gross2net"
                    ?"Enter your gross monthly salary and we'll compute PAYE, NSSF and your exact net pay."
                    :"Enter the net pay you want to receive and we'll reverse-engineer the required gross salary."
                  }
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, width:"100%", maxWidth:300 }}>
                {(mode==="gross2net"
                  ?["Enter gross salary","Set month & year","Add NCB if any","Hit Calculate"]
                  :["Enter target net pay","Set month & year","Add any deductions","Hit Calculate"]
                ).map((s,i)=>(
                  <div key={i} style={{ padding:"10px 14px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", display:"flex", alignItems:"center", gap:8, fontSize:12, color:"var(--text2)" }}>
                    <div style={{ width:20, height:20, borderRadius:"50%", background:"var(--accent)", color:"white", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
                    {s}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media(max-width:720px){
          .netpay-main-grid{ grid-template-columns:1fr!important; }
        }
      `}</style>
    </div>
  );
};


// ─── ADMIN PANEL ───────────────────────────────────────────────────────────
// localStorage-based admin. Access via email = "admin@cheda.app" pw = "admin123"
// In production this would be a real backend with JWT auth.

const ADMIN_CREDENTIALS = { email:"admin@cheda.app", password:"admin123" };

const AdminLogin = ({ onAuth }) => {
  const [form, setForm]   = useState({ email:"", password:"" });
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const submit = () => {
    if(form.email===ADMIN_CREDENTIALS.email && form.password===ADMIN_CREDENTIALS.password) onAuth();
    else setError("Invalid admin credentials");
  };
  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <GlobalStyles/>
      <div style={{ width:"100%", maxWidth:380, animation:"scaleIn .3s ease" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:56, height:56, borderRadius:18, background:"linear-gradient(135deg,var(--accent),var(--teal))", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", boxShadow:"0 8px 24px rgba(232,99,26,.3)" }}>
            <Lock size={26} color="white"/>
          </div>
          <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:22, color:"var(--text)" }}>Admin Panel</div>
          <div style={{ color:"var(--text3)", fontSize:13, marginTop:4 }}>Cheda — Platform Management</div>
        </div>
        <div className="card" style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {error&&<div style={{ background:"var(--red-soft)", color:"var(--red)", padding:"10px 14px", borderRadius:8, fontSize:13, display:"flex", gap:8 }}><AlertCircle size={14}/>{error}</div>}
          <div>
            <label className="label">Admin Email</label>
            <div style={{ position:"relative" }}><Mail size={15} style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:"var(--text3)" }}/><input className="input" style={{ paddingLeft:40 }} type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&submit()}/></div>
          </div>
          <div>
            <label className="label">Password</label>
            <div style={{ position:"relative" }}>
              <Lock size={15} style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:"var(--text3)" }}/>
              <input className="input" style={{ paddingLeft:40, paddingRight:42 }} type={showPw?"text":"password"} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&submit()}/>
              <button onClick={()=>setShowPw(s=>!s)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"var(--text3)", display:"flex" }}>{showPw?<EyeOff size={15}/>:<Eye size={15}/>}</button>
            </div>
          </div>
          <button className="btn btn-primary" style={{ justifyContent:"center", padding:"11px", marginTop:4 }} onClick={submit}>Access Admin Panel</button>
          <div style={{ textAlign:"center", fontSize:11, color:"var(--text3)" }}>Default: admin@cheda.app / admin123</div>
        </div>
      </div>
    </div>
  );
};


// ── AdminUsersTab: extracted as proper component so hooks (useState) are legal ──
const AdminUsersTab = ({ users, userSummaries, allTxs, filteredUsers, search, setSearch, confirmDel, setConfirmDel, deleteUser, selUser, setSelUser, refresh }) => {
            // ── local state for credentials management ──
            const [showPw,      setShowPw]      = useState({});        // { [uid]: bool }
            const [resetModal,  setResetModal]  = useState(null);      // user object
            const [resetForm,   setResetForm]   = useState({ username:"", email:"", password:"" });
            const [resetMsg,    setResetMsg]    = useState("");
            const [editField,   setEditField]   = useState({});        // { [uid+field]: bool }

            const togglePw = (uid) => setShowPw(s=>({...s,[uid]:!s[uid]}));

            const openReset = (u) => {
              setResetForm({ username:u.username, email:u.email, password:"" });
              setResetMsg("");
              setResetModal(u);
            };

            const saveReset = () => {
              if (!resetForm.username.trim()) return setResetMsg("Username cannot be empty");
              if (!resetForm.email.includes("@")) return setResetMsg("Enter a valid email");
              if (resetForm.password && resetForm.password.length < 6) return setResetMsg("Password must be at least 6 characters");
              const all = getUsers();
              // Check uniqueness excluding current user
              if (all.find(u=>u.id!==resetModal.id && u.email.toLowerCase()===resetForm.email.toLowerCase()))
                return setResetMsg("Email already used by another account");
              if (all.find(u=>u.id!==resetModal.id && u.username.toLowerCase()===resetForm.username.toLowerCase()))
                return setResetMsg("Username taken by another account");
              const updated = all.map(u => u.id===resetModal.id ? {
                ...u,
                username: resetForm.username.trim(),
                email:    resetForm.email.toLowerCase(),
                ...(resetForm.password ? { password: resetForm.password } : {})
              } : u);
              saveUsers(updated);
              // Update session if user edited themselves
              const session = getSession();
              if (session?.id === resetModal.id) {
                saveSession(updated.find(u=>u.id===resetModal.id));
              }
              setResetModal(null);
              refresh();
              setResetMsg("");
            };


  return (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                <div>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:20, color:"var(--text)" }}>User Management</div>
                  <div style={{ fontSize:12, color:"var(--text3)", marginTop:2 }}>{users.length} registered accounts</div>
                </div>
                <input className="input" style={{ width:220, fontSize:13 }} placeholder="Search users…" value={search} onChange={e=>setSearch(e.target.value)}/>
              </div>

              {/* Delete confirmation banner */}
              {confirmDel && (
                <div style={{ background:"var(--red-soft)", border:"1.5px solid var(--red)", borderRadius:"var(--radius-sm)", padding:"14px 18px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center", color:"var(--red)", fontSize:13 }}><AlertCircle size={16}/>Delete <strong>{confirmDel.username}</strong>? This removes all their data permanently.</div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button className="btn btn-danger" style={{ padding:"6px 14px", fontSize:13 }} onClick={()=>deleteUser(confirmDel.id)}>Delete</button>
                    <button className="btn btn-ghost" style={{ padding:"6px 14px", fontSize:13 }} onClick={()=>setConfirmDel(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* ── CREDENTIALS + RESET MODAL ── */}
              {resetModal && (
                <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setResetModal(null)}>
                  <div className="modal" style={{ maxWidth:460 }}>
                    {/* Header */}
                    <div style={{ padding:"18px 24px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center", background:"var(--surface2)" }}>
                      <div>
                        <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:16 }}>Edit Credentials</div>
                        <div style={{ fontSize:12, color:"var(--text3)", marginTop:2 }}>User ID: <code style={{ fontSize:11, background:"var(--border)", padding:"1px 6px", borderRadius:4 }}>{resetModal.id}</code></div>
                      </div>
                      <button onClick={()=>setResetModal(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", display:"flex" }}><X size={18}/></button>
                    </div>

                    <div style={{ padding:24, display:"flex", flexDirection:"column", gap:16 }}>
                      {resetMsg && (
                        <div style={{ background:"var(--red-soft)", color:"var(--red)", padding:"10px 14px", borderRadius:8, fontSize:13, display:"flex", gap:8 }}>
                          <AlertCircle size={14} style={{ flexShrink:0, marginTop:1 }}/>{resetMsg}
                        </div>
                      )}

                      {/* Current credentials read-only preview */}
                      <div style={{ padding:"12px 16px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)" }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:10 }}>Current Credentials</div>
                        <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:"6px 14px", fontSize:13 }}>
                          <span style={{ color:"var(--text3)" }}>Username</span>
                          <span style={{ fontWeight:600, color:"var(--text)" }}>{resetModal.username}</span>
                          <span style={{ color:"var(--text3)" }}>Email</span>
                          <span style={{ fontWeight:600, color:"var(--text)" }}>{resetModal.email}</span>
                          <span style={{ color:"var(--text3)" }}>Password</span>
                          <span style={{ fontFamily:"monospace", fontSize:12, color:"var(--accent)", letterSpacing:".05em" }}>
                            {showPw[resetModal.id] ? resetModal.password : "•".repeat(Math.min(resetModal.password?.length||8, 12))}
                            <button onClick={()=>togglePw(resetModal.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", marginLeft:8, verticalAlign:"middle", display:"inline-flex" }}>
                              {showPw[resetModal.id] ? <EyeOff size={12}/> : <Eye size={12}/>}
                            </button>
                          </span>
                        </div>
                      </div>

                      {/* Edit fields */}
                      <div style={{ fontSize:11, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".06em" }}>Update Fields</div>

                      <div>
                        <label className="label">Username</label>
                        <div style={{ position:"relative" }}>
                          <User size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text3)" }}/>
                          <input className="input" style={{ paddingLeft:36 }} value={resetForm.username} onChange={e=>setResetForm(f=>({...f,username:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&saveReset()}/>
                        </div>
                      </div>

                      <div>
                        <label className="label">Email</label>
                        <div style={{ position:"relative" }}>
                          <Mail size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text3)" }}/>
                          <input className="input" style={{ paddingLeft:36 }} type="email" value={resetForm.email} onChange={e=>setResetForm(f=>({...f,email:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&saveReset()}/>
                        </div>
                      </div>

                      <div>
                        <label className="label">New Password <span style={{ color:"var(--text3)", textTransform:"none", fontWeight:400 }}>(leave blank to keep current)</span></label>
                        <div style={{ position:"relative" }}>
                          <Lock size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"var(--text3)" }}/>
                          <input className="input" style={{ paddingLeft:36, paddingRight:40, fontFamily:"monospace" }} type={showPw["new"]?"text":"password"} placeholder="Min 6 characters" value={resetForm.password} onChange={e=>setResetForm(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&saveReset()}/>
                          <button onClick={()=>togglePw("new")} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"var(--text3)", display:"flex" }}>
                            {showPw["new"]?<EyeOff size={14}/>:<Eye size={14}/>}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding:"16px 24px", borderTop:"1px solid var(--border)", display:"flex", gap:8, justifyContent:"flex-end" }}>
                      <button className="btn btn-ghost" onClick={()=>setResetModal(null)}>Cancel</button>
                      <button className="btn btn-primary" onClick={saveReset}><Check size={14}/>Save Changes</button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── USERS TABLE with credentials ── */}
              <div className="card" style={{ padding:0, overflow:"hidden" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr style={{ background:"var(--surface2)" }}>
                      {["User","Email","Password","Transactions","Balance","Last Active","Actions"].map(h=>(
                        <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontWeight:600, color:"var(--text2)", fontSize:11, textTransform:"uppercase", letterSpacing:".04em", whiteSpace:"nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length===0?(
                      <tr><td colSpan={7} style={{ padding:"32px", textAlign:"center", color:"var(--text3)" }}>No users found</td></tr>
                    ):filteredUsers.map((u,i)=>{
                      const rawUser = getUsers().find(r=>r.id===u.id);
                      return (
                      <tr key={u.id} style={{ borderTop:"1px solid var(--border)", background:selUser?.id===u.id?"var(--accent-soft)":"transparent", cursor:"pointer", transition:"background .1s" }}
                        onClick={()=>setSelUser(s=>s?.id===u.id?null:u)}>
                        {/* Avatar + username */}
                        <td style={{ padding:"12px 16px" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <div style={{ width:32, height:32, borderRadius:"50%", background:`hsl(${(i*67)%360},60%,88%)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:`hsl(${(i*67)%360},60%,35%)`, flexShrink:0 }}>{u.username[0].toUpperCase()}</div>
                            <div>
                              <div style={{ fontWeight:600 }}>{u.username}</div>
                              <div style={{ fontSize:10, color:"var(--text3)" }}>ID: {u.id.slice(-6)}</div>
                            </div>
                          </div>
                        </td>
                        {/* Email */}
                        <td style={{ padding:"12px 16px", color:"var(--text2)", fontSize:12 }}>{u.email}</td>
                        {/* Password — masked with toggle */}
                        <td style={{ padding:"12px 16px" }} onClick={e=>e.stopPropagation()}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <span style={{ fontFamily:"monospace", fontSize:12, color:"var(--text)", letterSpacing:".05em", minWidth:80 }}>
                              {showPw[u.id] ? (rawUser?.password||"—") : "•".repeat(Math.min(rawUser?.password?.length||8,10))}
                            </span>
                            <button onClick={()=>togglePw(u.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", display:"flex", flexShrink:0, padding:2 }} title={showPw[u.id]?"Hide password":"Show password"}>
                              {showPw[u.id]?<EyeOff size={13}/>:<Eye size={13}/>}
                            </button>
                          </div>
                        </td>
                        {/* Stats */}
                        <td style={{ padding:"12px 16px" }}>
                          <span style={{ background:"var(--surface2)", padding:"2px 10px", borderRadius:999, fontWeight:600 }}>{u.txCount}</span>
                        </td>
                        <td style={{ padding:"12px 16px", fontWeight:600, color:u.balance>=0?"var(--teal)":"var(--red)", fontFamily:"var(--font-display)", fontSize:12 }}>{fmtUGX(u.balance)}</td>
                        <td style={{ padding:"12px 16px", color:"var(--text3)", fontSize:12 }}>{u.lastActivity||"—"}</td>
                        {/* Actions */}
                        <td style={{ padding:"12px 16px" }} onClick={e=>e.stopPropagation()}>
                          <div style={{ display:"flex", gap:6 }}>
                            <button onClick={()=>openReset(rawUser)} style={{ background:"var(--accent-soft)", border:"none", borderRadius:6, padding:"4px 10px", cursor:"pointer", color:"var(--accent)", fontSize:12, fontFamily:"var(--font-body)", display:"flex", alignItems:"center", gap:4, whiteSpace:"nowrap" }}>
                              <Settings size={12}/>Edit
                            </button>
                            <button onClick={()=>setConfirmDel(u)} style={{ background:"var(--red-soft)", border:"none", borderRadius:6, padding:"4px 10px", cursor:"pointer", color:"var(--red)", fontSize:12, fontFamily:"var(--font-body)", display:"flex", alignItems:"center", gap:4 }}>
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── USER DETAIL / CREDENTIAL PANEL ── */}
              {selUser && (()=>{
                const s = userSummaries.find(u=>u.id===selUser.id);
                const rawUser = getUsers().find(u=>u.id===selUser.id);
                if(!s) return null;
                const utxs = allTxs.filter(t=>t._userId===s.id).slice(0,6);
                return (
                  <div className="card fade-up" style={{ padding:0, overflow:"hidden" }}>
                    {/* Panel header */}
                    <div style={{ padding:"14px 20px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center", background:"var(--surface2)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:36, height:36, borderRadius:"50%", background:"linear-gradient(135deg,var(--accent),var(--teal))", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <span style={{ color:"white", fontSize:14, fontWeight:700 }}>{s.username[0].toUpperCase()}</span>
                        </div>
                        <div>
                          <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:15 }}>{s.username}</div>
                          <div style={{ fontSize:11, color:"var(--text3)" }}>{s.email}</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button className="btn btn-primary" style={{ padding:"6px 14px", fontSize:12 }} onClick={()=>openReset(rawUser)}>
                          <Settings size={13}/>Edit Credentials
                        </button>
                        <button onClick={()=>setSelUser(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", display:"flex" }}><X size={16}/></button>
                      </div>
                    </div>

                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0 }}>
                      {/* Left: credentials */}
                      <div style={{ padding:"18px 20px", borderRight:"1px solid var(--border)" }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:12 }}>Login Credentials</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                          {[
                            { label:"Username", value:rawUser?.username },
                            { label:"Email",    value:rawUser?.email },
                          ].map(f=>(
                            <div key={f.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"var(--surface2)", borderRadius:8 }}>
                              <span style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".04em" }}>{f.label}</span>
                              <span style={{ fontWeight:600, fontSize:13, color:"var(--text)" }}>{f.value}</span>
                            </div>
                          ))}
                          {/* Password row with reveal */}
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"var(--surface2)", borderRadius:8 }}>
                            <span style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".04em" }}>Password</span>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ fontFamily:"monospace", fontSize:13, color:"var(--accent)", letterSpacing:".08em" }}>
                                {showPw["detail_"+s.id] ? rawUser?.password : "•".repeat(Math.min(rawUser?.password?.length||8,12))}
                              </span>
                              <button onClick={()=>togglePw("detail_"+s.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", display:"flex", padding:2 }}>
                                {showPw["detail_"+s.id]?<EyeOff size={13}/>:<Eye size={13}/>}
                              </button>
                            </div>
                          </div>
                          {/* Account created */}
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"var(--surface2)", borderRadius:8 }}>
                            <span style={{ fontSize:11, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".04em" }}>User ID</span>
                            <code style={{ fontSize:11, color:"var(--text2)", background:"var(--border)", padding:"2px 6px", borderRadius:4 }}>{s.id}</code>
                          </div>
                        </div>
                      </div>

                      {/* Right: financials */}
                      <div style={{ padding:"18px 20px" }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:12 }}>Financial Summary</div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:16 }}>
                          {[["Income",fmtUGX(s.income),"var(--teal)"],["Expenses",fmtUGX(s.expense),"var(--red)"],["Balance",fmtUGX(s.balance),s.balance>=0?"var(--teal)":"var(--red)"]].map(([l,v,c])=>(
                            <div key={l} style={{ textAlign:"center", padding:"10px 8px", background:"var(--surface2)", borderRadius:8 }}>
                              <div style={{ fontSize:10, color:"var(--text3)", textTransform:"uppercase", marginBottom:3 }}>{l}</div>
                              <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:12, color:c }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize:11, fontWeight:700, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".06em", marginBottom:8 }}>Recent Transactions</div>
                        {utxs.length===0
                          ? <div style={{ color:"var(--text3)", fontSize:12, padding:"8px 0" }}>No transactions</div>
                          : utxs.map(t=>(
                            <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid var(--border)", fontSize:12 }}>
                              <div>
                                <span style={{ fontWeight:500 }}>{t.description||t.category}</span>
                                <span style={{ marginLeft:8, fontSize:10, color:"var(--text3)" }}>{t.date}</span>
                              </div>
                              <span style={{ fontWeight:600, color:t.type==="income"?"var(--teal)":"var(--red)", fontFamily:"var(--font-display)", fontSize:12 }}>
                                {t.type==="income"?"+":"−"}{fmtUGX(t.amount)}
                              </span>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
  );
};

const AdminPanel = ({ onExit }) => {
  const [adminTab, setAdminTab] = useState("overview");
  const [users,    setUsers]    = useState(()=>getUsers());
  const [selUser,  setSelUser]  = useState(null);
  const [search,   setSearch]   = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const refresh = () => setUsers(getUsers());

  // Aggregate stats across ALL users
  const allTxs = useMemo(()=>{
    const out = [];
    users.forEach(u=>{
      try{
        const txs = JSON.parse(localStorage.getItem(userKey(u.id,"transactions"))||"[]");
        txs.forEach(t=>out.push({...t, _userId:u.id, _username:u.username}));
      }catch{}
    });
    return out;
  },[users]);

  const totalIncome  = allTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const totalExpense = allTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);

  // Monthly activity for platform chart
  const now = new Date();
  const platformChart = useMemo(()=>Array.from({length:6},(_,i)=>{
    const d = new Date(now.getFullYear(), now.getMonth()-5+i, 1);
    const mo = d.getMonth(), yr = d.getFullYear();
    const month_txs = allTxs.filter(t=>{ const td=new Date(t.date+"T00:00:00"); return td.getMonth()===mo&&td.getFullYear()===yr; });
    return { name:MONTHS[mo], Income:month_txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0), Expenses:month_txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), Users:users.filter(u=>{ try{ const txs=JSON.parse(localStorage.getItem(userKey(u.id,"transactions"))||"[]"); return txs.some(t=>{ const td=new Date(t.date+"T00:00:00"); return td.getMonth()===mo&&td.getFullYear()===yr; }); }catch{return false;} }).length };
  }),[allTxs, users]);

  // Per-user summary
  const userSummaries = useMemo(()=>users.map(u=>{
    try{
      const txs = JSON.parse(localStorage.getItem(userKey(u.id,"transactions"))||"[]");
      const inc = txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
      const exp = txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
      const last = txs.length>0 ? txs.sort((a,b)=>new Date(b.date)-new Date(a.date))[0].date : null;
      return { ...u, txCount:txs.length, income:inc, expense:exp, balance:inc-exp, lastActivity:last };
    }catch{ return { ...u, txCount:0, income:0, expense:0, balance:0, lastActivity:null }; }
  }),[users]);

  const filteredUsers = userSummaries.filter(u=>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const deleteUser = (uid) => {
    const updated = getUsers().filter(u=>u.id!==uid);
    saveUsers(updated);
    ["transactions","budgets","goals"].forEach(k=>localStorage.removeItem(userKey(uid,k)));
    setConfirmDel(null); setSelUser(null); refresh();
  };

  const exportAllCSV = () => {
    const rows = [["User","Email","Date","Type","Category","Description","Amount(UGX)"],
      ...allTxs.map(t=>[t._username,"",t.date,t.type,t.category,`"${(t.description||"").replace(/"/g,'""')}"`,t.amount])];
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([rows.map(r=>r.join(",")).join("\n")],{type:"text/csv"})); a.download="cheda_all_transactions.csv"; a.click();
  };

  const AdminStat = ({label,value,icon:Icon,color,soft}) => (
    <div style={{ background:soft, border:`1px solid ${color}22`, borderRadius:"var(--radius-sm)", padding:"16px 20px", display:"flex", alignItems:"center", gap:14 }}>
      <div style={{ width:40, height:40, borderRadius:12, background:`${color}22`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Icon size={20} color={color}/></div>
      <div><div style={{ fontSize:11, fontWeight:600, color:"var(--text3)", textTransform:"uppercase", letterSpacing:".06em" }}>{label}</div><div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:22, color:"var(--text)", marginTop:2 }}>{value}</div></div>
    </div>
  );

  const ADMIN_TABS = [
    { id:"overview", label:"Overview",     icon:BarChart2 },
    { id:"users",    label:"Users",        icon:User },
    { id:"txs",      label:"Transactions", icon:List },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", flexDirection:"column" }}>
      <GlobalStyles/>

      {/* Admin header */}
      <header style={{ background:"linear-gradient(135deg,#1a0a02,var(--accent))", borderBottom:"1px solid rgba(255,255,255,0.1)", padding:"0 24px", height:60, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:32, height:32, borderRadius:10, background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><text x="1" y="17" fontSize="13" fontWeight="900" fontFamily="Syne,sans-serif" fill="white">C</text><text x="12" y="13" fontSize="9" fontWeight="700" fontFamily="Syne,sans-serif" fill="rgba(255,255,255,0.85)">$</text></svg>
          </div>
          <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:16, color:"white" }}>Cheda Admin</span>
          <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:999, background:"rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.8)" }}>Platform Management</span>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={exportAllCSV} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:8, background:"rgba(255,255,255,0.15)", border:"none", color:"white", cursor:"pointer", fontSize:12, fontFamily:"var(--font-body)", fontWeight:600 }}><Download size={13}/>Export All</button>
          <button onClick={onExit} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", borderRadius:8, background:"rgba(255,255,255,0.15)", border:"none", color:"white", cursor:"pointer", fontSize:12, fontFamily:"var(--font-body)", fontWeight:600 }}><LogOut size={13}/>Exit Admin</button>
        </div>
      </header>

      <div style={{ display:"flex", flex:1, maxWidth:1200, margin:"0 auto", width:"100%", padding:"24px 20px 60px", gap:24 }}>

        {/* Sidebar */}
        <nav style={{ width:180, flexShrink:0 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:4, position:"sticky", top:84 }}>
            {ADMIN_TABS.map(t=>(
              <button key={t.id} className={`nav-item ${adminTab===t.id?"active":""}`} onClick={()=>setAdminTab(t.id)} style={{ justifyContent:"flex-start" }}>
                <t.icon size={16}/>{t.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:20 }}>

          {/* ── OVERVIEW TAB ── */}
          {adminTab==="overview" && (
            <>
              <div>
                <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:20, color:"var(--text)" }}>Platform Overview</div>
                <div style={{ fontSize:12, color:"var(--text3)", marginTop:2 }}>All-user aggregate statistics</div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
                <AdminStat label="Total Users"       value={users.length}                          icon={User}        color="#E8631A" soft="var(--accent-soft)"/>
                <AdminStat label="Total Transactions" value={allTxs.length.toLocaleString()}       icon={List}        color="#1BA8A0" soft="var(--teal-soft)"/>
                <AdminStat label="Platform Income"   value={fmtUGX(totalIncome)}                  icon={TrendingUp}  color="#1BA8A0" soft="var(--teal-soft)"/>
                <AdminStat label="Platform Expenses" value={fmtUGX(totalExpense)}                 icon={TrendingDown} color="var(--red)" soft="var(--red-soft)"/>
              </div>

              {/* Platform activity chart */}
              <div className="card">
                <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:15, marginBottom:20 }}>Platform Activity — Last 6 Months</div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={platformChart} margin={{top:5,right:5,left:0,bottom:0}}>
                    <defs>
                      <linearGradient id="aInc" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1BA8A0" stopOpacity={.25}/><stop offset="95%" stopColor="#1BA8A0" stopOpacity={0}/></linearGradient>
                      <linearGradient id="aExp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#E8631A" stopOpacity={.18}/><stop offset="95%" stopColor="#E8631A" stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                    <XAxis dataKey="name" tick={{fill:"var(--text3)",fontSize:12}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:"var(--text3)",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={n=>n>=1000000?`${(n/1000000).toFixed(1)}M`:n>=1000?`${(n/1000).toFixed(0)}K`:n} width={58}/>
                    <Tooltip contentStyle={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:10,fontFamily:"var(--font-body)",fontSize:13}}/>
                    <Area type="monotone" dataKey="Income"   stroke="#1BA8A0" strokeWidth={2} fill="url(#aInc)" dot={false}/>
                    <Area type="monotone" dataKey="Expenses" stroke="#E8631A" strokeWidth={2} fill="url(#aExp)" dot={false}/>
                    <Legend wrapperStyle={{fontSize:12,paddingTop:8}}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Top users by activity */}
              <div className="card" style={{ padding:0, overflow:"hidden" }}>
                <div style={{ padding:"16px 20px", borderBottom:"1px solid var(--border)", fontFamily:"var(--font-display)", fontWeight:700, fontSize:15 }}>Top Users by Transaction Volume</div>
                <div style={{ padding:"0 20px" }}>
                  {userSummaries.sort((a,b)=>b.txCount-a.txCount).slice(0,5).map((u,i)=>(
                    <div key={u.id} style={{ display:"grid", gridTemplateColumns:"24px 1fr auto auto", gap:12, alignItems:"center", padding:"12px 0", borderBottom:i<4?"1px solid var(--border)":"none" }}>
                      <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:14, color:"var(--text3)" }}>#{i+1}</span>
                      <div>
                        <div style={{ fontWeight:600, fontSize:13 }}>{u.username}</div>
                        <div style={{ fontSize:11, color:"var(--text3)" }}>{u.email}</div>
                      </div>
                      <span style={{ fontSize:12, color:"var(--text2)", background:"var(--surface2)", padding:"2px 10px", borderRadius:999 }}>{u.txCount} txs</span>
                      <span style={{ fontSize:12, fontWeight:600, color:u.balance>=0?"var(--teal)":"var(--red)" }}>{fmtUGX(u.balance)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── USERS TAB ── */}
          {adminTab==="users" && <AdminUsersTab users={users} userSummaries={userSummaries} allTxs={allTxs} filteredUsers={filteredUsers} search={search} setSearch={setSearch} confirmDel={confirmDel} setConfirmDel={setConfirmDel} deleteUser={deleteUser} selUser={selUser} setSelUser={setSelUser} refresh={refresh}/>}

          {/* ── TRANSACTIONS TAB ── */}
          {adminTab==="txs" && (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
                <div>
                  <div style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:20, color:"var(--text)" }}>All Transactions</div>
                  <div style={{ fontSize:12, color:"var(--text3)", marginTop:2 }}>{allTxs.length} across {users.length} users</div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <input className="input" style={{ width:200, fontSize:13 }} placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>
                  <button className="btn btn-ghost" onClick={exportAllCSV} style={{ fontSize:13 }}><Download size={14}/>Export CSV</button>
                </div>
              </div>
              <div className="card" style={{ padding:0, overflow:"hidden" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr style={{ background:"var(--surface2)" }}>
                      {["User","Date","Type","Category","Description","Amount"].map(h=>(
                        <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontWeight:600, color:"var(--text2)", fontSize:11, textTransform:"uppercase", letterSpacing:".04em", whiteSpace:"nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allTxs
                      .filter(t=>!search||`${t._username} ${t.category} ${t.description}`.toLowerCase().includes(search.toLowerCase()))
                      .sort((a,b)=>new Date(b.date)-new Date(a.date))
                      .slice(0,50)
                      .map((t,i)=>(
                      <tr key={t.id+t._userId} style={{ borderTop:"1px solid var(--border)", background:i%2===0?"transparent":"var(--surface2)" }}>
                        <td style={{ padding:"10px 16px" }}>
                          <span style={{ fontSize:12, fontWeight:600, color:"var(--accent)", background:"var(--accent-soft)", padding:"2px 8px", borderRadius:999 }}>{t._username}</span>
                        </td>
                        <td style={{ padding:"10px 16px", color:"var(--text3)", fontSize:12 }}>{t.date}</td>
                        <td style={{ padding:"10px 16px" }}>
                          <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:999, background:t.type==="income"?"var(--teal-soft)":"var(--red-soft)", color:t.type==="income"?"var(--teal)":"var(--red)" }}>{t.type}</span>
                        </td>
                        <td style={{ padding:"10px 16px", color:"var(--text2)" }}>{t.category}</td>
                        <td style={{ padding:"10px 16px", color:"var(--text)", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.description||"—"}</td>
                        <td style={{ padding:"10px 16px", fontWeight:700, fontFamily:"var(--font-display)", fontSize:12, color:t.type==="income"?"var(--teal)":"var(--red)" }}>
                          {t.type==="income"?"+":"−"}{fmtUGX(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {allTxs.length>50&&<div style={{ padding:"12px 20px", borderTop:"1px solid var(--border)", fontSize:12, color:"var(--text3)", textAlign:"center" }}>Showing 50 of {allTxs.length} — export CSV for full data</div>}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
};

// ─── MAIN APP ──────────────────────────────────────────────────────────────

const NAV_ITEMS = [
    { id:"dashboard",    label:"Dashboard",    icon:BarChart2, group:"main" },
    { id:"transactions", label:"Transactions", icon:List,      group:"main" },
    { id:"netpay",       label:"Net Pay",      icon:Calculator,group:"main" },
    { id:"budgets",      label:"Budgets",      icon:Target,    group:"tools" },
    { id:"goals",        label:"Goals",        icon:TrendingUp,group:"tools" },
  ];

export default function App() {
  const [user, setUser] = useState(() => getSession());
  const uid = user?.id || "guest";

  const [transactions, setTransactions] = useState(()=>{
    try{const s=localStorage.getItem(userKey(uid,"transactions"));return s?JSON.parse(s):generateSampleData();}catch{return generateSampleData();}
  });
  const [budgets, setBudgets] = useState(()=>{
    try{const s=localStorage.getItem(userKey(uid,"budgets"));return s?JSON.parse(s):{Housing:5000000,Food:800000,Transport:250000,Entertainment:150000,Utilities:180000};}catch{return {};}
  });
  const [goals, setGoals] = useState(()=>{
    try{const s=localStorage.getItem(userKey(uid,"goals"));return s?JSON.parse(s):[{name:"Emergency Fund",target:"10000000",saved:"3500000"}];}catch{return [];}
  });

  const [dark,     setDark]     = useState(()=>localStorage.getItem("ff_dark")==="1");
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [showAdmin,   setShowAdmin]   = useState(false);
  const [currency, setCurrencyState] = useState(()=>{ const s=localStorage.getItem("ff_currency")||"UGX"; _currency=s; return s; });
  const [rate,     setRateState]     = useState(()=>{ const s=parseFloat(localStorage.getItem("ff_rate")||String(DEFAULT_RATE)); _rate=s; return s; });
  const [page,     setPage]     = useState("dashboard");
  const [modal,    setModal]    = useState(null);
  const [editTx,   setEditTx]   = useState(null);

  useEffect(()=>{localStorage.setItem(userKey(uid,"transactions"),JSON.stringify(transactions));},[transactions,uid]);
  useEffect(()=>{localStorage.setItem(userKey(uid,"budgets"),     JSON.stringify(budgets));},[budgets,uid]);
  useEffect(()=>{localStorage.setItem(userKey(uid,"goals"),       JSON.stringify(goals));},[goals,uid]);
  useEffect(()=>{localStorage.setItem("ff_dark",dark?"1":"0");document.documentElement.setAttribute("data-theme",dark?"dark":"light");},[dark]);
  useEffect(()=>{_currency=currency;localStorage.setItem("ff_currency",currency);},[currency]);

  const setCurrency = useCallback((c)=>{ _currency=c; setCurrencyState(c); },[]);
  const setRate     = useCallback((r)=>{ _rate=r; setRateState(r); localStorage.setItem("ff_rate",String(r)); },[]);

  const saveTx      = useCallback((tx)=>setTransactions(prev=>{const exists=prev.find(t=>t.id===tx.id);return(exists?prev.map(t=>t.id===tx.id?tx:t):[tx,...prev]).sort((a,b)=>new Date(b.date)-new Date(a.date));}),[]);
  const deleteTx    = useCallback((id) =>setTransactions(prev=>prev.filter(t=>t.id!==id)),[]);
  const bulkDelete  = useCallback((ids)=>setTransactions(prev=>prev.filter(t=>!ids.includes(t.id))),[]);
  const importTx    = useCallback((txs)=>setTransactions(prev=>[...txs,...prev].sort((a,b)=>new Date(b.date)-new Date(a.date))),[]);
  const openEdit    = useCallback((tx) =>{setEditTx(tx);setModal("edit");},[]);

  const handleSignOut = () => { clearSession(); setUser(null); };

  const handleAuth = (u) => {
    setUser(u);
    try{const s=localStorage.getItem(userKey(u.id,"transactions"));setTransactions(s?JSON.parse(s):generateSampleData());}catch{setTransactions(generateSampleData());}
    try{const s=localStorage.getItem(userKey(u.id,"budgets"));setBudgets(s?JSON.parse(s):{Housing:5000000,Food:800000,Transport:250000,Entertainment:150000,Utilities:180000});}catch{setBudgets({});}
    try{const s=localStorage.getItem(userKey(u.id,"goals"));setGoals(s?JSON.parse(s):[{name:"Emergency Fund",target:"10000000",saved:"3500000"}]);}catch{setGoals([]);}
  };

  if (showAdmin && !adminAuthed) return <AdminLogin onAuth={()=>setAdminAuthed(true)}/>;
  if (showAdmin && adminAuthed)  return <AdminPanel  onExit={()=>{ setShowAdmin(false); setAdminAuthed(false); }}/>;
  if (!user) return <AuthPage onAuth={handleAuth}/>;


  return (
    <CurrencyContext.Provider value={{ currency, rate, setCurrency, setRate }}>
      <GlobalStyles/>
      <style>{`
        /* ── Sidebar layout ── */
        .app-shell { display:flex; height:100vh; overflow:hidden; background:var(--bg); }
        .sidebar {
          width:220px; flex-shrink:0;
          background:var(--surface);
          border-right:1px solid var(--border);
          display:flex; flex-direction:column;
          height:100vh; overflow:hidden;
          transition:width .2s;
        }
        .sidebar-logo {
          padding:20px 20px 16px;
          border-bottom:1px solid var(--border);
          display:flex; align-items:center; gap:10px; flex-shrink:0;
        }
        .sidebar-nav { flex:1; overflow-y:auto; padding:12px 10px; }
        .sidebar-nav-group { margin-bottom:4px; }
        .sidebar-nav-label {
          font-size:9px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
          color:var(--text3); padding:10px 10px 4px;
        }
        .sidebar-item {
          display:flex; align-items:center; gap:10px;
          padding:9px 12px; border-radius:var(--radius-sm);
          cursor:pointer; color:var(--text2); font-size:13px; font-weight:500;
          transition:all .15s; border:none; background:none;
          font-family:var(--font-body); width:100%; text-align:left;
          white-space:nowrap;
        }
        .sidebar-item:hover  { background:var(--surface2); color:var(--text); }
        .sidebar-item.active {
          background:linear-gradient(135deg,var(--accent-soft),rgba(27,168,160,0.08));
          color:var(--accent);
          border-left:3px solid var(--accent);
          padding-left:9px;
          font-weight:700;
        }
        .sidebar-item .badge {
          margin-left:auto; font-size:10px; padding:1px 7px;
          border-radius:999px; background:var(--accent); color:white; font-weight:700;
        }
        .sidebar-footer {
          padding:14px 12px;
          border-top:1px solid var(--border);
          flex-shrink:0;
        }
        /* Main area */
        .main-area { flex:1; display:flex; flex-direction:column; overflow:hidden; }
        .topbar {
          height:56px; flex-shrink:0;
          background:var(--surface);
          border-bottom:1px solid var(--border);
          display:flex; align-items:center;
          justify-content:space-between;
          padding:0 24px; gap:12px;
        }
        .content-scroll { flex:1; overflow-y:auto; padding:24px; }
        @media(max-width:768px){
          .sidebar{ width:60px; }
          .sidebar-item span, .sidebar-logo span, .sidebar-nav-label, .sidebar-footer .user-name { display:none; }
          .sidebar-item { justify-content:center; padding:10px; }
          .sidebar-item.active { border-left:none; border-bottom:3px solid var(--accent); padding-left:10px; }
          .content-scroll { padding:16px; }
        }
      `}</style>

      <div className="app-shell">
        {/* ══════════ SIDEBAR ══════════ */}
        <aside className="sidebar">
          {/* Logo */}
          <div className="sidebar-logo">
            <div style={{ width:34, height:34, borderRadius:10, background:"linear-gradient(135deg,var(--accent),var(--teal))", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <text x="1" y="17" fontSize="14" fontWeight="900" fontFamily="Syne,sans-serif" fill="white">C</text>
                <text x="12" y="13" fontSize="10" fontWeight="700" fontFamily="Syne,sans-serif" fill="rgba(255,255,255,0.85)">$</text>
              </svg>
            </div>
            <span style={{ fontFamily:"var(--font-display)", fontWeight:800, fontSize:17, color:"var(--text)", whiteSpace:"nowrap" }}>Cheda</span>
          </div>

          {/* Navigation */}
          <nav className="sidebar-nav">
            <div className="sidebar-nav-group">
              <div className="sidebar-nav-label">Main</div>
              {NAV_ITEMS.filter(n=>n.group==="main").map(n=>(
                <button key={n.id} className={`sidebar-item ${page===n.id?"active":""}`} onClick={()=>setPage(n.id)}>
                  <n.icon size={16}/><span>{n.label}</span>
                </button>
              ))}
            </div>
            <div className="sidebar-nav-group" style={{ marginTop:8 }}>
              <div className="sidebar-nav-label">Tools</div>
              <button className="sidebar-item" onClick={()=>setModal("budget")}>
                <Target size={16}/><span>Budgets</span>
              </button>
              <button className="sidebar-item" onClick={()=>setModal("goals")}>
                <TrendingUp size={16}/><span>Goals</span>
              </button>
            </div>
          </nav>

          {/* Footer: user + controls */}
          <div className="sidebar-footer">
            {/* Dark mode toggle */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <span style={{ fontSize:12, color:"var(--text3)" }}>Dark mode</span>
              <label className="toggle" style={{ cursor:"pointer" }}>
                <input type="checkbox" checked={dark} onChange={e=>setDark(e.target.checked)}/>
                <span className="toggle-slider"/>
              </label>
            </div>
            {/* User pill */}
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:"var(--surface2)", borderRadius:"var(--radius-sm)", border:"1px solid var(--border)" }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"linear-gradient(135deg,var(--accent),var(--teal))", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{ color:"white", fontSize:12, fontWeight:700 }}>{user.username[0].toUpperCase()}</span>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="user-name" style={{ fontSize:12, fontWeight:600, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.username}</div>
                <div className="user-name" style={{ fontSize:10, color:"var(--text3)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.email}</div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                <button onClick={()=>setShowAdmin(true)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", display:"flex", padding:2 }} title="Admin"><Settings size={13}/></button>
                <button onClick={handleSignOut} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text3)", display:"flex", padding:2 }} title="Sign out"><LogOut size={13}/></button>
              </div>
            </div>
          </div>
        </aside>

        {/* ══════════ MAIN AREA ══════════ */}
        <div className="main-area">
          {/* Top bar */}
          <div className="topbar">
            {/* Page title */}
            <div style={{ fontFamily:"var(--font-display)", fontWeight:700, fontSize:15, color:"var(--text)", whiteSpace:"nowrap" }}>
              {page==="dashboard"?"Dashboard":page==="transactions"?"Transactions":page==="netpay"?"Net Pay Calculator":"Cheda"}
            </div>

            <div style={{ display:"flex", gap:8, alignItems:"center", flex:1, justifyContent:"flex-end", flexWrap:"wrap" }}>
              {/* Currency bar */}
              <CurrencyBar/>
              {/* Add transaction — hide on net pay */}
              {page!=="netpay" && (
                <button className="btn btn-primary" onClick={()=>setModal("add")} style={{ padding:"7px 16px", fontSize:13 }}>
                  <Plus size={15}/>Add
                </button>
              )}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="content-scroll">
            {page==="dashboard"
              ?<Dashboard transactions={transactions} onEdit={openEdit} onDelete={deleteTx} budgets={budgets} goals={goals}/>
              :page==="netpay"
              ?<NetPayCalc/>
              :<Transactions transactions={transactions} onEdit={openEdit} onDelete={deleteTx} onBulkDelete={bulkDelete} onImport={importTx}/>}
          </div>
        </div>
      </div>

      {(modal==="add"||modal==="edit")&&<TransactionModal onClose={()=>{setModal(null);setEditTx(null);}} onSave={saveTx} initial={modal==="edit"?editTx:null}/>}
      {modal==="budget"&&<BudgetModal budgets={budgets} onClose={()=>setModal(null)} onSave={setBudgets}/>}
      {modal==="goals" &&<GoalModal  goals={goals}     onClose={()=>setModal(null)} onSave={setGoals}/>}
    </CurrencyContext.Provider>
  );
}
