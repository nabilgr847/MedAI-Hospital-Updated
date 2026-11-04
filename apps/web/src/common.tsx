import { useEffect, useState } from "react";
import { Api, json, fmtDate } from "./api";

export function Tabs({ tabs, tab, setTab }: { tabs: [string, string][]; tab: string; setTab: (t: string) => void }) {
  return <div className="tabs">{tabs.map(([id, text]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{text}</button>)}</div>;
}

export function Chat({ api, appointmentId, meId }: { api: Api; appointmentId: string; meId: string }) {
  const [msgs, setMsgs] = useState<any[]>([]); const [body, setBody] = useState(""); const [err, setErr] = useState("");
  async function load() { try { const d = await api(`/appointments/${appointmentId}/messages`); setMsgs(d.messages || []); setErr(""); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [appointmentId]);
  async function send(e: any) {
    e.preventDefault(); if (!body.trim()) return;
    try { await api(`/appointments/${appointmentId}/messages`, { method: "POST", body: json({ body }) }); setBody(""); load(); } catch (x: any) { setErr(x.message); }
  }
  return <div className="chat">
    <div className="chatlog">{msgs.length === 0 && <p className="muted">No messages yet.</p>}
      {msgs.map((m) => <div key={m._id} className={"bubble" + (m.senderId?._id === meId ? " me" : "")}><b>{m.senderId?.name || "User"}</b><span>{m.body}</span><small>{fmtDate(m.createdAt)}</small></div>)}</div>
    {err && <p className="notice">{err}</p>}
    <form onSubmit={send} className="row"><input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message" maxLength={5000} /><button className="primary">Send</button></form>
    <p className="muted">Messages are for non-urgent follow-up. In an emergency call 999.</p>
  </div>;
}

export function ChangePassword({ api, onToken, setMessage }: { api: Api; onToken: (t: string) => void; setMessage: (s: string) => void }) {
  const [cur, setCur] = useState(""); const [next, setNext] = useState("");
  async function submit(e: any) {
    e.preventDefault();
    try { const d = await api("/auth/change-password", { method: "POST", body: json({ currentPassword: cur, newPassword: next }) }); if (d.token) onToken(d.token); setCur(""); setNext(""); setMessage(d.message); }
    catch (x: any) { setMessage(x.message); }
  }
  return <article><h3>Change password</h3><form onSubmit={submit}>
    <input type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} required />
    <input type="password" placeholder="New password (minimum 14 characters)" minLength={14} value={next} onChange={(e) => setNext(e.target.value)} required />
    <button className="primary">Update password</button></form></article>;
}
