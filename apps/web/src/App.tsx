import { useEffect, useState } from "react";
import { makeApi, json } from "./api";
import PatientPanel from "./PatientPanel";
import DoctorPanel from "./DoctorPanel";
import AdminPanel from "./AdminPanel";
import DoctorApply from "./DoctorApply";

type User = { id: string; name: string; email: string; role: "patient" | "doctor" | "admin" };
const norm = (u: any): User => ({ ...u, id: u.id || u._id });

function MainApp() {
  const [token, setTokenState] = useState(localStorage.getItem("medai_token") || "");
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<"home" | "apply" | "more">("home");
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState(""); const [resetEmail, setResetEmail] = useState("");
  const [message, setMessage] = useState(""); const [pendingNote, setPendingNote] = useState<any>(null);
  const api = makeApi(token);

  function setToken(t: string) { if (t) localStorage.setItem("medai_token", t); else localStorage.removeItem("medai_token"); setTokenState(t); }
  function logout() { setToken(""); setUser(null); setMessage(""); }
  useEffect(() => { if (token) api("/auth/me").then((d) => setUser(norm(d.user))).catch(() => { setToken(""); }); }, []);
  useEffect(() => {
    if (!token || !user) return;
    const beat = () => api("/presence/heartbeat", { method: "POST", body: json({}) }).catch(() => {});
    beat(); const timer = window.setInterval(beat, 25000);
    return () => window.clearInterval(timer);
  }, [token, user?.id]);

  async function submitAuth(e: any) {
    e.preventDefault(); setMessage(""); setPendingNote(null);
    try {
      if (mode === "register") { await api("/auth/register", { method: "POST", body: json({ name, email, password }) }); setMessage("Patient account created. Please sign in."); setMode("login"); setPassword(""); return; }
      const d = await api("/auth/login", { method: "POST", body: json({ email, password }) });
      setToken(d.token); setUser(norm(d.user)); setPassword("");
    } catch (x: any) {
      setMessage(x.message);
      if (x.data?.role === "doctor" && x.data?.status === "pending_verification") setPendingNote({ note: x.data.note });
    }
  }
  async function requestReset() { try { const d = await api("/auth/password-reset/request", { method: "POST", body: json({ email: resetEmail || email }) }); setMessage(d.message); } catch (x: any) { setMessage(x.message); } }

  return <div className="shell">
    <header><img src="/branding/medai-logo.svg" alt="MedAI Hospital" />
      <nav><a href="#services">Services</a><a href="#safety">Safety</a>{!user && <a href="#portal" onClick={() => setView("home")}>Sign in</a>}</nav>
      {user && <div className="row"><span className="role">{user.name} · {user.role}</span><button className="outline" onClick={logout}>Sign out</button></div>}</header>

    {!user && view === "apply" && <DoctorApply mode="new" onBack={() => setView("home")} />}
    {!user && view === "more" && <DoctorApply mode="more" onBack={() => setView("home")} />}
    {!user && view === "home" && <>
      <section className="hero"><div><span className="eyebrow">YOUR HEALTH, OUR PRIORITY</span><h1>Healthcare support, connected around you.</h1><p>Organize your health journey, request clinician appointments, and understand general health information.</p><div className="pills"><span>Patient care</span><span>Doctor-led review</span><span>Secure access</span></div></div><img className="banner" src="/branding/medai-banner.png" alt="" /></section>
      <section className="auth" id="portal"><div>
        <h2>{mode === "login" ? "Welcome back" : "Create a patient account"}</h2>
        <p>Patients can register here. Doctors apply for verification. Admin access is privately provisioned.</p>
        <form onSubmit={submitAuth}>
            {mode === "register" && <input autoComplete="name" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />}
            <input type="email" autoComplete="email" placeholder="Email address / Admin ID" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={mode === "register" ? "Password (minimum 12 characters)" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "register" ? 12 : 1} />
            <button className="primary">{mode === "login" ? "Sign in" : "Create patient account"}</button></form>
          <button className="link" onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }}>{mode === "login" ? "Create a patient account" : "Back to sign in"}</button>
          <div className="doctorbox"><b>Are you a doctor?</b><div className="row"><button className="outline" onClick={() => { setView("apply"); setMessage(""); }}>Apply for a doctor account</button><button className="outline" onClick={() => { setView("more"); setMessage(""); }}>Send requested documents</button></div></div>
          {mode === "login" && <div className="reset"><input type="email" placeholder="Email for password reset" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} /><button className="outline" onClick={requestReset}>Send password reset email</button></div>}
        {message && <p className="notice" role="status" aria-live="polite">{message}</p>}
        {pendingNote && <p className="warn">{pendingNote.note ? "Message from the admin team: " + pendingNote.note : "Your documents are being reviewed."} If more documents were requested, use “Send requested documents”.</p>}
      </div></section></>}

    {user && <section className="dashboard"><div className="welcome"><div><span className="eyebrow">{user.role.toUpperCase()} PORTAL</span><h1>Hello, {user.name}</h1><p>{user.role === "admin" ? "Platform operations and verification workspace" : user.role === "doctor" ? "Clinician workspace" : "Your health dashboard"}</p></div><span className="role">{user.role}</span></div>
      {message && <p className="notice" onClick={() => setMessage("")}>{message} <small>(tap to dismiss)</small></p>}
      {user.role === "patient" && <PatientPanel api={api} token={token} user={user} onToken={setToken} setMessage={setMessage} />}
      {user.role === "doctor" && <DoctorPanel api={api} token={token} user={user} onToken={setToken} setMessage={setMessage} />}
      {user.role === "admin" && <AdminPanel api={api} token={token} onToken={setToken} setMessage={setMessage} />}
    </section>}

    <section id="services"><p className="eyebrow">CARE, CONNECTED</p><h2>Tools to support your health journey</h2><div className="grid three"><article><div className="service-icon" aria-hidden="true">▤</div><h3>Medical report hub</h3><p>Organize private reports and share them only through authorized care workflows.</p></article><article><div className="service-icon" aria-hidden="true">✚</div><h3>Doctor consultation</h3><p>Appointment requests, clinician messaging and doctor-written prescriptions.</p></article><article><div className="service-icon" aria-hidden="true">♡</div><h3>Medicine information</h3><p>Structured medicine information for review. MedAI does not independently prescribe treatment.</p></article></div></section>
    <section id="safety"><p className="eyebrow">SAFETY BY DESIGN</p><h2>Clinical safety comes first</h2><p>MedAI provides general health information and organization tools. It is not a diagnosis, a substitute for a qualified clinician, or an emergency service. For severe breathing difficulty, chest pain, stroke symptoms, unconsciousness, or severe bleeding, seek emergency care immediately. In Bangladesh, call 999.</p></section>
    <footer><img src="/branding/medai-logo.svg" alt="" /><p>MedAI Hospital · Your Health, Our Priority</p></footer></div>;
}

function ResetPassword() {
  const [password, setPassword] = useState(""); const [message, setMessage] = useState(""); const [ok, setOk] = useState(false);
  async function submit(e: any) {
    e.preventDefault();
    try { const token = new URLSearchParams(window.location.search).get("token") || ""; const d = await makeApi("")("/auth/password-reset/complete", { method: "POST", body: json({ token, newPassword: password }) }); setMessage(d.message); setOk(true); } catch (x: any) { setMessage(x.message); }
  }
  return <div className="auth"><div><h2>Reset your MedAI password</h2>
    {!ok && <form onSubmit={submit}><input type="password" minLength={14} placeholder="New password (minimum 14 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required /><button className="primary">Set new password</button></form>}
    {message && <p className="notice" role="status" aria-live="polite">{message}</p>}
    {ok && <a href="/">Go to sign in</a>}</div></div>;
}

export default function App() { return window.location.pathname === "/reset-password" ? <ResetPassword /> : <MainApp />; }
