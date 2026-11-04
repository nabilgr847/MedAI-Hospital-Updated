import { useEffect, useRef, useState } from "react";
import { Api, json, postForm, downloadFile, fmtDay, fmtSize } from "./api";

/** Peer-to-peer browser call. Audio recording is disabled until both appointment participants consent. */
export default function TeleVisitCall({ api, token, appointmentId, user, setMessage }: { api: Api; token: string; appointmentId: string; user: any; setMessage: (s: string) => void }) {
  const localVideo = useRef<HTMLVideoElement>(null); const remoteVideo = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null); const local = useRef<MediaStream | null>(null); const remote = useRef<MediaStream | null>(null);
  const seen = useRef<Set<string>>(new Set()); const after = useRef(new Date(Date.now() - 60000).toISOString()); const queuedIce = useRef<RTCIceCandidateInit[]>([]);
  const recorder = useRef<MediaRecorder | null>(null); const audioContext = useRef<AudioContext | null>(null); const chunks = useRef<Blob[]>([]); const speechRecognition = useRef<any>(null);
  const [consent, setConsent] = useState({ patient: false, doctor: false }); const [connected, setConnected] = useState(false); const [callStarted, setCallStarted] = useState(false); const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false); const [recordings, setRecordings] = useState<any[]>([]); const [transcript, setTranscript] = useState(""); const [summary, setSummary] = useState(""); const [speechOn, setSpeechOn] = useState(false);
  const myRole = user?.role === "doctor" ? "doctor" : "patient";
  async function refreshConsent() { try { const d = await api(`/appointments/${appointmentId}/call-state`); setConsent(d.consent); } catch {} }
  async function loadRecordings() { try { const d = await api(`/appointments/${appointmentId}/recordings`); setRecordings(d.recordings || []); } catch {} }
  async function signal(type: string, payload: any = {}) { await api(`/appointments/${appointmentId}/call-signals`, { method: "POST", body: json({ type, payload }) }); }
  function ensurePeer() {
    if (pc.current) return pc.current;
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peer.onicecandidate = (e) => { if (e.candidate) signal("ice", e.candidate.toJSON()).catch(() => {}); };
    peer.ontrack = (e) => { remote.current = e.streams[0]; if (remoteVideo.current) { remoteVideo.current.srcObject = e.streams[0]; remoteVideo.current.play().catch(() => {}); } };
    peer.onconnectionstatechange = () => { const state = peer.connectionState; const ok = state === "connected"; setConnected(ok); const connectionState = ["connected", "disconnected", "failed"].includes(state) ? state : "starting"; api(`/appointments/${appointmentId}/call-heartbeat`, { method: "POST", body: json({ active: true, connectionState }) }).catch(() => {}); };
    pc.current = peer; return peer;
  }
  async function acquire(mode: "audio" | "video") {
    if (local.current) return local.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" }); local.current = stream;
    if (localVideo.current) { localVideo.current.srcObject = stream; localVideo.current.muted = true; }
    const peer = ensurePeer(); stream.getTracks().forEach(t => peer.addTrack(t, stream)); return stream;
  }
  async function startCall(mode: "audio" | "video") {
    setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser/device does not support secure audio/video calling. Open the site over HTTPS.");
      if (myRole === "doctor") { await acquire(mode); const offer = await ensurePeer().createOffer(); await ensurePeer().setLocalDescription(offer); await signal("offer", offer); setCallStarted(true); setMessage("Call started. The patient can join from their appointment."); }
      else setMessage("Ready to join. Waiting for the doctor to start the call. Keep this panel open.");
    } catch (e: any) { setMessage(e.message || "Could not start the call. Check camera/microphone permissions."); }
    finally { setBusy(false); }
  }
  async function handleSignal(s: any) {
    if (s.type === "hangup") { pc.current?.close(); pc.current = null; setConnected(false); return; }
    if (s.type === "offer" && myRole === "patient") {
      setCallStarted(true); api(`/appointments/${appointmentId}/call-heartbeat`, { method: "POST", body: json({ active: true, connectionState: "starting" }) }).catch(() => {});
      if (!local.current) await acquire(String(s.payload?.sdp || "").includes("m=video") ? "video" : "audio");
      const peer = ensurePeer(); await peer.setRemoteDescription(new RTCSessionDescription(s.payload));
      for (const ice of queuedIce.current.splice(0)) await peer.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {});
      const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); await signal("answer", answer);
    } else if (s.type === "answer" && myRole === "doctor" && pc.current && !pc.current.remoteDescription) {
      await pc.current.setRemoteDescription(new RTCSessionDescription(s.payload));
      for (const ice of queuedIce.current.splice(0)) await pc.current.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {});
    } else if (s.type === "ice" && s.payload) {
      if (pc.current?.remoteDescription) await pc.current.addIceCandidate(new RTCIceCandidate(s.payload)).catch(() => {}); else queuedIce.current.push(s.payload);
    }
  }
  useEffect(() => {
    refreshConsent(); loadRecordings(); const c = setInterval(refreshConsent, 3000);
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const d = await api(`/appointments/${appointmentId}/call-signals?after=${encodeURIComponent(new Date(new Date(after.current).getTime() - 1000).toISOString())}`);
        for (const s of d.signals || []) {
          if (!active || seen.current.has(s._id)) continue; seen.current.add(s._id);
          if (s.createdAt && new Date(s.createdAt) > new Date(after.current)) after.current = s.createdAt;
          await handleSignal(s);
        }
      } catch {}
    };
    const timer = setInterval(poll, 1500); poll();
    return () => { active = false; clearInterval(timer); clearInterval(c); speechRecognition.current?.stop(); recorder.current?.stop(); pc.current?.close(); local.current?.getTracks().forEach(t => t.stop()); audioContext.current?.close().catch(() => {}); };
  }, [appointmentId, myRole]);
  useEffect(() => {
    if (!callStarted) return;
    const beat = () => api(`/appointments/${appointmentId}/call-heartbeat`, { method: "POST", body: json({ active: true, connectionState: connected ? "connected" : "starting" }) }).catch(() => {});
    beat(); const timer = window.setInterval(beat, 15000);
    return () => window.clearInterval(timer);
  }, [appointmentId, callStarted, connected]);
  async function setMyConsent(accepted: boolean) {
    try { const d = await api(`/appointments/${appointmentId}/recording-consent`, { method: "POST", body: json({ accepted }) }); setConsent(d.consent); }
    catch (e: any) { setMessage(e.message); }
  }
  async function startRecording() {
    try {
      if (!consent.patient || !consent.doctor) throw new Error("Both patient and doctor must consent first.");
      if (!local.current || !remote.current) throw new Error("Connect the call before recording.");
      const ctx = new AudioContext(); audioContext.current = ctx; const destination = ctx.createMediaStreamDestination();
      for (const stream of [local.current, remote.current]) { const tracks = stream.getAudioTracks(); if (tracks.length) ctx.createMediaStreamSource(new MediaStream(tracks)).connect(destination); }
      if (!destination.stream.getAudioTracks().length) throw new Error("No call audio track is available.");
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(x => MediaRecorder.isTypeSupported(x));
      const r = new MediaRecorder(destination.stream, mime ? { mimeType: mime } : undefined); chunks.current = [];
      r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = async () => {
        try {
          const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
          if (!blob.size) throw new Error("Recording was empty.");
          const fd = new FormData(); fd.append("file", blob, `consultation-${appointmentId}.webm`);
          const d = await postForm(`/appointments/${appointmentId}/recording`, fd, token); setMessage(`${d.message}. It is private to the appointment participants.`);
        } catch (e: any) { setMessage(`Recording could not be saved: ${e.message}`); }
        finally { await ctx.close().catch(() => {}); audioContext.current = null; loadRecordings(); }
      };
      recorder.current = r; r.start(1000); setRecording(true); setMessage("Audio recording started. Video is not recorded. Stop recording before leaving the call.");
    } catch (e: any) { setMessage(e.message); }
  }
  function stopRecording() { if (recorder.current?.state === "recording") { recorder.current.stop(); setRecording(false); } }
  async function hangup() { stopRecording(); try { await signal("hangup"); await api(`/appointments/${appointmentId}/call-heartbeat`, { method: "POST", body: json({ active: false }) }); } catch {} setCallStarted(false); pc.current?.close(); pc.current = null; local.current?.getTracks().forEach(t => t.stop()); local.current = null; setConnected(false); if (localVideo.current) localVideo.current.srcObject = null; if (remoteVideo.current) remoteVideo.current.srcObject = null; }
  function startSpeechTranscript() {
    const W = window as any; const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) { setMessage("Speech recognition is not supported in this browser. You can type/edit the transcript manually."); return; }
    const recognition = new Ctor(); recognition.continuous = true; recognition.interimResults = false; recognition.lang = "en-US";
    recognition.onresult = (event: any) => { let add = ""; for (let i = event.resultIndex; i < event.results.length; i++) add += event.results[i][0].transcript + " "; setTranscript(old => (old + " " + add).trim()); };
    recognition.onerror = () => { setSpeechOn(false); speechRecognition.current = null; }; recognition.onend = () => { setSpeechOn(false); speechRecognition.current = null; };
    if (speechOn) { speechRecognition.current?.stop(); speechRecognition.current = null; setSpeechOn(false); } else { speechRecognition.current = recognition; recognition.start(); setSpeechOn(true); setMessage("Browser speech recognition started; accuracy/language support varies. Review and correct the transcript."); }
  }
  async function analyzeTranscript() {
    setBusy(true); try { const d = await api(`/appointments/${appointmentId}/recording-analysis`, { method: "POST", body: json({ transcript }) }); setSummary(d.summary + "\n\n" + d.disclaimer); }
    catch (e: any) { setMessage(e.message); } finally { setBusy(false); }
  }
  return <article className="full telecall">
    <h3>Secure online consultation</h3><p className="muted">Peer-to-peer WebRTC call; both people need a modern browser, HTTPS, and camera/microphone permission. Doctor starts the call, patient joins.</p>
    <div className="callvideos"><div><video ref={localVideo} autoPlay playsInline muted /><small>Your camera</small></div><div><video ref={remoteVideo} autoPlay playsInline /><small>Other participant</small></div></div>
    <div className="row"><button className="primary" disabled={busy || connected} onClick={() => startCall("video")}>{myRole === "doctor" ? "Start video call" : "Join video call"}</button><button className="outline" disabled={busy || connected} onClick={() => startCall("audio")}>Audio-only setup</button><button className="danger" onClick={hangup}>End call</button><span className={connected ? "notice" : "muted"}>{connected ? "Connected" : "Not connected"}</span></div>
    <div className="consentbox"><b>Recording consent</b><p className="muted">Only audio is recorded (not video). Do not record unless both people explicitly agree. Saved audio is private to this appointment.</p>
      <div className="row"><button className={consent[myRole] ? "primary" : "outline"} onClick={() => setMyConsent(!consent[myRole])}>{consent[myRole] ? "Withdraw my consent" : "I consent to audio recording"}</button><span className="muted">Patient: {consent.patient ? "consented" : "not consented"} · Doctor: {consent.doctor ? "consented" : "not consented"}</span></div>
      <div className="row"><button className="outline" disabled={recording || !connected || !consent.patient || !consent.doctor} onClick={startRecording}>Start audio recording</button><button className="danger" disabled={!recording} onClick={stopRecording}>Stop &amp; save recording</button></div>
    </div>
    <div className="transcriptbox"><h4>Saved audio recordings</h4><button className="outline" onClick={loadRecordings}>Refresh recordings</button>{recordings.length === 0 && <p className="muted">No saved audio recordings for this appointment.</p>}{recordings.map((f: any) => <div className="row" key={f._id}><span>{f.originalName} · {fmtDay(f.createdAt)} · {fmtSize(f.size)}</span><button className="outline" onClick={() => downloadFile(token, f._id, f.originalName).catch((e) => setMessage(e.message))}>Download audio</button></div>)}<h4>Transcript &amp; consultation summary</h4><p className="muted">Use browser speech recognition where supported or paste a transcript. It may miss words and must be reviewed by the clinician. AI does not diagnose or prescribe.</p>
      <div className="row"><button className="outline" onClick={startSpeechTranscript}>{speechOn ? "Stop speech recognition" : "Start speech recognition"}</button></div>
      <textarea rows={5} value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Review or paste the consultation transcript…" />
      <button className="primary" disabled={busy || transcript.trim().length < 20 || !consent.patient || !consent.doctor} onClick={analyzeTranscript}>{busy ? "Analyzing…" : "Generate AI consultation summary"}</button>
      {summary && <pre className="answer">{summary}</pre>}
    </div>
    <p className="warn">Do not use this feature for emergencies. AI summaries may be inaccurate and are not a substitute for clinician judgment. Recording and transcription may be subject to local laws and institutional policy.</p>
  </article>;
}
