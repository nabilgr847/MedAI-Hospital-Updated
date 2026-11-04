import { useState } from "react";
import { postForm } from "./api";

type Slot = { category: string; text: string; required?: boolean };
const SLOTS: Slot[] = [
  { category: "bmdc_certificate", text: "BMDC registration certificate (required)", required: true },
  { category: "doctor_photo", text: "Passport-size photo" },
  { category: "degree_certificate", text: "Degree certificate (MBBS / postgraduate)" },
  { category: "identity_document", text: "National ID or passport" },
  { category: "other_qualification", text: "Other qualification (optional)" },
];

// mode "new": full doctor application. mode "more": send extra documents when the admin asked for more information.
export default function DoctorApply({ mode, onBack }: { mode: "new" | "more"; onBack: () => void }) {
  const [f, setF] = useState<any>({ name: "", email: "", phone: "", password: "", bmdcNumber: "", specialty: "", qualifications: "", experienceYears: "0" });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [msg, setMsg] = useState(""); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  async function submit(e: any) {
    e.preventDefault(); setMsg("");
    const chosen = SLOTS.filter((s) => files[s.category]);
    if (mode === "new" && !files.bmdc_certificate) { setMsg("Please attach your BMDC registration certificate."); return; }
    if (mode === "more" && chosen.length === 0) { setMsg("Attach at least one document."); return; }
    const fd = new FormData();
    if (mode === "new") for (const k of Object.keys(f)) fd.append(k, f[k]);
    else { fd.append("email", f.email); fd.append("password", f.password); }
    chosen.forEach((s, i) => { fd.append(`category_${i}`, s.category); });
    chosen.forEach((s) => { fd.append("documents", files[s.category] as File); });
    setBusy(true);
    try { const d = await postForm(mode === "new" ? "/doctor/apply" : "/doctor/additional-documents", fd); setMsg(d.message || "Your request was received."); setDone(true); }
    catch (x: any) { setMsg(x.message || "Could not submit your application. Check your connection and try again."); } finally { setBusy(false); }
  }

  return <section className="auth"><div className="wide">
    <p className="eyebrow">MEDAI · CLINICIAN VERIFICATION</p>
    <h2>{mode === "new" ? "Apply for a doctor account" : "Send requested documents"}</h2>
    <p>{mode === "new" ? "Create your application in a few steps. Our admin team must verify your BMDC registration before doctor access is activated." : "Enter the same email and password used in your application, then attach the documents requested by the admin team."}</p>
    <div className="pills"><span>🔒 Private review</span><span>✓ BMDC verification</span><span>📄 Document upload</span></div>
    {done ? <><p className="notice">{msg}</p><button className="primary" onClick={onBack}>Back to sign in</button></> :
      <form onSubmit={submit}>
        {mode === "new" && <>
          <label>Full name<input value={f.name} onChange={(e) => set("name", e.target.value)} required minLength={2} /></label>
          <label>Phone<input value={f.phone} onChange={(e) => set("phone", e.target.value)} required minLength={5} /></label>
        </>}
        <label>Email<input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} required /></label>
        <label>Password{mode === "new" ? " (minimum 14 characters)" : ""}<input type="password" value={f.password} onChange={(e) => set("password", e.target.value)} required minLength={mode === "new" ? 14 : 1} /></label>
        {mode === "new" && <>
          <label>BMDC registration number<input value={f.bmdcNumber} onChange={(e) => set("bmdcNumber", e.target.value)} required minLength={3} /></label>
          <label>Specialty<input value={f.specialty} onChange={(e) => set("specialty", e.target.value)} required placeholder="e.g. Medicine, Pediatrics" /></label>
          <label>Qualifications (comma separated)<input value={f.qualifications} onChange={(e) => set("qualifications", e.target.value)} required placeholder="MBBS, FCPS" /></label>
          <label>Years of experience<input type="number" min={0} max={70} value={f.experienceYears} onChange={(e) => set("experienceYears", e.target.value)} required /></label>
        </>}
        <h3>Verification documents</h3>
        <p className="muted">Accepted formats: PDF, JPG, PNG or WEBP · Maximum 12 MB per file. The BMDC certificate is required for a new application.</p>
        {SLOTS.map((s) => <label key={s.category}>{s.text}<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFiles({ ...files, [s.category]: e.target.files?.[0] || null })} />{files[s.category] && <span className="muted">Selected: {files[s.category]?.name} ({((files[s.category]?.size || 0)/1048576).toFixed(2)} MB)</span>}</label>)}
        <button className="primary" disabled={busy}>{busy ? "Sending…" : mode === "new" ? "Submit application" : "Send documents"}</button>
        <button type="button" className="link" onClick={onBack}>Back to sign in</button>
        {msg && <p className="notice" role="status" aria-live="polite">{msg}</p>}
      </form>}
  </div></section>;
}
