"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, BookOpen, Bot, Check, ChevronDown, FileText, Github, Globe2, GraduationCap, LockKeyhole, Newspaper, Play, Plus, Settings2, Sparkles, ThumbsDown, ThumbsUp, Upload, X, Youtube } from "lucide-react";
import { secureFetch } from "@/lib/client-security";
import { defaultPreferences, groupResources, suggestions, type TutorAnswer, type TutorPreferences, type TutorSource, type TutorTurn } from "@/lib/career-tutor/types";

const storageKey = "lazyhire:career-assistant";
const legacyStorageKey = "orvio:career-tutor";
function savedChat() { try { return sessionStorage.getItem(storageKey) ?? sessionStorage.getItem(legacyStorageKey); } catch { return null; } }
function remember(id: string | null) { try { if (id) sessionStorage.setItem(storageKey, id); else sessionStorage.removeItem(storageKey); sessionStorage.removeItem(legacyStorageKey); } catch { /* Session history still works in memory. */ } }
function delay(ms: number) { return new Promise(resolve => window.setTimeout(resolve, ms)); }
async function bodyOf(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Something went wrong. Please try again.");
  return body;
}
function displayedMap(turns: TutorTurn[]) {
  return Object.fromEntries(turns.map(turn => [turn.id, turn.answer.text]));
}

export function CareerTutor() {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const typingFrame = useRef<number | null>(null);
  const busy = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [closing, setClosing] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [displayedAnswers, setDisplayedAnswers] = useState<Record<string, string>>({});
  const [preferences, setPreferences] = useState<TutorPreferences>(defaultPreferences);
  const [settings, setSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<{question: string; requestId: string} | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState<string | null>(null);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    input.current?.focus();
    let active = true;
    if (conversationId) return;
    const start = async () => {
      setInitializing(true); setError("");
      try {
        const saved = savedChat();
        let response = saved ? await secureFetch(`/api/career-tutor/conversations/${encodeURIComponent(saved)}`) : null;
        if (response?.status === 404) { remember(null); response = null; }
        response ??= await secureFetch("/api/career-tutor/conversations", {method: "POST"});
        const body = await bodyOf(response);
        if (!active) return;
        const loadedTurns = body.turns as TutorTurn[];
        remember(body.conversationId); setConversationId(body.conversationId); setTurns(loadedTurns); setDisplayedAnswers(displayedMap(loadedTurns)); setPreferences(body.preferences);
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "Chat is unavailable."); }
      finally { if (active) setInitializing(false); }
    };
    void start();
    return () => { active = false; };
    // Initialization runs on opening. Changing the new ID must not cancel its own request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const clear = () => {
      if (typingFrame.current) window.cancelAnimationFrame(typingFrame.current);
      controller.current?.abort(); dialog.current?.close(); remember(null);
      setOpen(false); setTurns([]); setDisplayedAnswers({}); setConversationId(null); setPreferences(defaultPreferences); setPending(""); setDraft(""); setFailed(null); setUploadNotice("");
    };
    window.addEventListener("lazyhire:session-cleared", clear);
    window.addEventListener("orvio:session-cleared", clear);
    return () => { window.removeEventListener("lazyhire:session-cleared", clear); window.removeEventListener("orvio:session-cleared", clear); controller.current?.abort(); if (typingFrame.current) window.cancelAnimationFrame(typingFrame.current); if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, []);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = turns.length || pending ? scroll.current.scrollHeight : 0; }, [turns, pending]);

  function animateAnswer(turn: TutorTurn) {
    if (typingFrame.current) window.cancelAnimationFrame(typingFrame.current);
    const text = turn.answer.text;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || text.length < 24) {
      setDisplayedAnswers(previous => ({...previous, [turn.id]: text}));
      return;
    }
    const duration = Math.min(9500, Math.max(1500, text.length * 18));
    let started = 0;
    setDisplayedAnswers(previous => ({...previous, [turn.id]: ""}));
    const tick = (now: number) => {
      if (!started) started = now;
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 1.7);
      const nextLength = Math.max(1, Math.floor(text.length * eased));
      setDisplayedAnswers(previous => ({...previous, [turn.id]: text.slice(0, nextLength)}));
      if (progress < 1) typingFrame.current = window.requestAnimationFrame(tick);
      else typingFrame.current = null;
    };
    typingFrame.current = window.requestAnimationFrame(tick);
  }

  function close() {
    setClosing(true);
    closeTimer.current = setTimeout(() => { dialog.current?.close(); setOpen(false); setClosing(false); launcher.current?.focus(); }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160);
  }
  async function send(question = draft, requestId = crypto.randomUUID()) {
    const value = question.trim();
    if (!value || value.length > 2000 || !conversationId || busy.current || initializing || saving) return;
    busy.current = true; setPending(value); setDraft(""); setError(""); setFailed(null);
    controller.current = new AbortController();
    try {
      const response = await secureFetch("/api/career-tutor/messages", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({question: value, conversationId, requestId}), signal: controller.current.signal});
      if (response.status === 401 || response.status === 404) { remember(null); setConversationId(null); setTurns([]); }
      const body = await bodyOf(response);
      await delay(900);
      const turn = body.turn as TutorTurn;
      setTurns(previous => previous.some(item => item.id === turn.id) ? previous : [...previous, turn]);
      animateAnswer(turn);
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) { setError(error instanceof Error ? error.message : "Could not send your question."); setFailed({question: value, requestId}); }
    } finally { busy.current = false; setPending(""); input.current?.focus(); }
  }
  async function newChat() {
    if (busy.current) return;
    setInitializing(true); setError("");
    try {
      if (conversationId) {
        const removed = await secureFetch(`/api/career-tutor/conversations/${conversationId}`, {method: "DELETE"});
        if (removed.status !== 404) await bodyOf(removed);
      }
      remember(null); setTurns([]); setDisplayedAnswers({}); setConversationId(null); setFailed(null);
      const body = await bodyOf(await secureFetch("/api/career-tutor/conversations", {method: "POST"}));
      setConversationId(body.conversationId); remember(body.conversationId); setPreferences(body.preferences); setDraft("");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not start a new chat."); }
    finally { setInitializing(false); input.current?.focus(); }
  }
  async function updatePreferences(next: TutorPreferences) {
    setSaving(true); setError("");
    try {
      const body = await bodyOf(await secureFetch("/api/career-tutor/preferences", {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify(next)}));
      setPreferences(body.preferences);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save preferences."); }
    finally { setSaving(false); }
  }
  async function vote(turn: TutorTurn, value: "helpful" | "not_helpful") {
    if (feedbackBusy) return;
    const next = turn.feedback === value ? null : value;
    setFeedbackBusy(turn.id); setError("");
    try {
      await bodyOf(await secureFetch("/api/career-tutor/feedback", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({conversationId, messageId: turn.id, value: next})}));
      setTurns(previous => previous.map(item => item.id === turn.id ? {...item, feedback: next} : item));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save feedback."); }
    finally { setFeedbackBusy(null); }
  }
  async function uploadCv(file: File) {
    if (!/\.(pdf|docx)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setError("Choose a PDF or DOCX file under 5 MB.");
      return;
    }
    setUploadingCv(true); setError(""); setUploadNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await secureFetch("/api/cv/analyze", {method: "POST", body: form});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "This CV could not be read.");
      setUploadNotice(`${body.filename} is now in your private career profile. Enable profile context in settings when you want answers to use it.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "This CV could not be read.");
    } finally {
      setUploadingCv(false);
      input.current?.focus();
    }
  }

  return <>
    <button ref={launcher} type="button" className="career-tutor-launcher" aria-label="Open AI Career Assistant" aria-haspopup="dialog" aria-expanded={open} disabled={!hydrated} onClick={() => setOpen(true)}>
      <span className="career-tutor-launcher-label">Need a next step?<strong>AI Career Assistant</strong></span>
      <span className="career-tutor-robot"><Bot aria-hidden="true" size={29}/><span className="career-tutor-status"/></span>
    </button>
    <dialog ref={dialog} aria-labelledby="career-tutor-title" className={`career-tutor-dialog ${closing ? "is-closing" : ""}`} onCancel={event => {event.preventDefault(); close();}} onClick={event => {if (event.target === event.currentTarget) close();}}>
      <div className="career-tutor-panel">
        <header className="career-tutor-header">
          <div className="career-tutor-avatar"><Bot size={24} aria-hidden="true"/></div>
          <div className="min-w-0 flex-1"><h2 id="career-tutor-title">AI Career Assistant</h2><p><span className="career-tutor-dot"/> Profile-aware mentor guidance</p></div>
          <button type="button" className="career-tutor-icon" aria-label="Chat settings" aria-expanded={settings} onClick={() => setSettings(!settings)}><Settings2 size={17}/></button>
          <button type="button" className="career-tutor-icon" aria-label="Close career tutor" onClick={close}><X size={20}/></button>
        </header>
        <div className="career-tutor-toolbar"><span><LockKeyhole size={12}/> Private to your session</span><button type="button" disabled={Boolean(pending) || initializing} onClick={() => void newChat()} title="Delete this conversation and start fresh"><Plus size={13}/> New chat</button></div>
        {settings && <section className="career-tutor-settings" aria-label="Tutor privacy settings">
          <label><span><strong>Use my career profile</strong><small>Let answers use your target role, listed skills, experience level, and resume-analysis notes as background. Contact details and full CVs are never shared. Each question is still answered on its own terms.</small></span><input type="checkbox" checked={preferences.useProfile} disabled={saving || Boolean(pending)} onChange={event => void updatePreferences({useProfile: event.target.checked})}/></label>
          <p>Answers come from reviewed career guides first, with AI mentor help for questions the guides do not cover. Chat text and feedback are encrypted and retained for this session, with a 45-minute inactivity limit. New chat deletes this conversation. Account controls include export and deletion.</p>
        </section>}
        <div ref={scroll} className="career-tutor-scroll" role="log" aria-label="Career conversation" aria-live="polite" aria-relevant="additions">
          {!turns.length && !pending && <div className="career-tutor-welcome">
            <span className="career-tutor-welcome-icon"><Sparkles size={23}/></span>
            <p className="career-tutor-eyebrow">YOUR NEXT CHAPTER</p>
            <h3>Ask for a plan,<br/>not just an answer.</h3>
            <p>Roadmaps, resume guidance, interviews, career switches, and learning resources.</p>
            <div className="career-tutor-suggestions">{suggestions.map(question => <button type="button" key={question} disabled={initializing || !conversationId} onClick={() => void send(question)}>{question}<ArrowUpRight size={15}/></button>)}</div>
            <p className="career-tutor-caption">Practical recommendations. Clear limits.<br/>Resources when they help.</p>
          </div>}
          {uploadNotice && <div className="career-tutor-upload-note" role="status"><FileText size={15}/><span>{uploadNotice}</span></div>}
          {turns.map(turn => {
            const displayed = displayedAnswers[turn.id] ?? turn.answer.text;
            const typing = displayed !== turn.answer.text;
            return <article key={turn.id} className="career-tutor-turn">
            <div className="career-tutor-question"><span className="sr-only">You: </span>{turn.question}</div>
            <div className="career-tutor-answer"><div className="career-tutor-answer-label"><Bot size={15}/><span>AI CAREER ASSISTANT</span>{turn.answer.personalized && <span className="career-tutor-personalized">For you</span>}</div>
              <AnswerText text={displayed} sources={turn.answer.sources}/>{typing && <span className="career-tutor-caret" aria-hidden="true"/>}
              {turn.answer.notice && !typing && <p className="career-tutor-notice">{turn.answer.notice}</p>}
              {turn.answer.sources.length > 0 && !typing && <ResourceGroups answer={turn.answer}/>}
              <div className="career-tutor-feedback"><span>{turn.answer.origin === "knowledge_base" ? "Career guide" : turn.answer.origin === "llm" ? "AI-assisted" : "Let’s clarify"}</span>
                <button type="button" aria-label="Helpful" aria-pressed={turn.feedback === "helpful"} disabled={feedbackBusy === turn.id} onClick={() => void vote(turn, "helpful")}><ThumbsUp size={13}/> Helpful</button>
                <button type="button" aria-label="Not helpful" aria-pressed={turn.feedback === "not_helpful"} disabled={feedbackBusy === turn.id} onClick={() => void vote(turn, "not_helpful")}><ThumbsDown size={13}/><span className="sr-only">Not helpful</span></button>
                {turn.feedback && <Check size={12} aria-label="Feedback saved"/>}
              </div>
            </div>
          </article>;
          })}
          {pending && <div className="career-tutor-turn"><div className="career-tutor-question">{pending}</div><div className="career-tutor-thinking" role="status"><Bot size={18}/><span className="career-tutor-thinking-dots"><i/><i/><i/></span><span>Reading the question and checking evidence...</span></div></div>}
          {initializing && <p className="career-tutor-loading" role="status">Opening your private chat…</p>}
          {error && <div className="career-tutor-error" role="alert"><p>{error}</p>{failed && conversationId ? <button type="button" onClick={() => void send(failed.question, failed.requestId)}>Retry question</button> : !conversationId && <button type="button" onClick={() => void newChat()}>Start chat</button>}</div>}
        </div>
        <form className="career-tutor-composer" onSubmit={event => {event.preventDefault(); void send();}}>
          <input ref={fileInput} className="sr-only" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => {const file = event.target.files?.[0]; if (file) void uploadCv(file); event.target.value = "";}}/>
          <div><textarea ref={input} aria-label="Your career question" placeholder="What’s on your mind?" value={draft} maxLength={2000} rows={2} disabled={initializing} onChange={event => setDraft(event.target.value)} onKeyDown={event => {if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault(); void send();}}}/><button type="submit" aria-label="Send question" disabled={!draft.trim() || Boolean(pending) || !conversationId || saving}><ArrowUp size={19}/></button></div>
          <p><button type="button" className="career-tutor-upload" disabled={uploadingCv || initializing || Boolean(pending)} onClick={() => fileInput.current?.click()}><Upload size={12}/>{uploadingCv ? "Uploading CV..." : "Upload CV"}</button><span>AI Career Assistant · Advice is a starting point, not a guarantee.</span></p>
        </form>
      </div>
    </dialog>
  </>;
}

function AnswerText({text, sources}: {text: string; sources: TutorSource[]}) {
  const headings = /^(recommended roadmap|3-month intensive path|6-month comprehensive path|recommended resources|progress checkpoints|portfolio project|phase \d+:.{0,90}|what to do next|next step[s]?|for your starting point|applying this to your goal|from your resume analysis|my recommendation|from the sources)$/i;
  return <div className="career-tutor-copy">{text.split(/\n\n+/).map((paragraph, index) => {
    const lines = paragraph.split("\n");
    const heading = headings.test(lines[0]) ? lines.shift() : null;
    return <div key={index}>{heading && <h4>{heading}</h4>}{lines.map((line, lineIndex) => <p key={lineIndex}>{line.split(/(\[[a-z0-9-]+\])/g).map((part, partIndex) => {
      const source = sources.find(item => `[${item.id}]` === part);
      return source ? <a key={partIndex} href={source.url} target="_blank" rel="noopener noreferrer" className="career-tutor-citation">View source <ArrowUpRight size={11}/></a> : <span key={partIndex}>{part.split(/(\*\*[^*]+\*\*)/g).map((segment, index) => segment.startsWith("**") && segment.endsWith("**") ? <strong key={index}>{segment.slice(2,-2)}</strong> : segment)}</span>;
    })}</p>)}</div>;
  })}</div>;
}
/**
 * Resources rendered underneath an answer, grouped by what they are. Older
 * turns stored before grouping existed carry only `sources`, so the groups are
 * derived client-side when the server did not supply them.
 */
function ResourceGroups({answer}: {answer: TutorAnswer}) {
  const groups = answer.youtube_resources || answer.official_resources || answer.learning_resources
    ? {youtube_resources: answer.youtube_resources ?? [], official_resources: answer.official_resources ?? [], learning_resources: answer.learning_resources ?? []}
    : groupResources(answer.sources);
  const total = groups.youtube_resources.length + groups.official_resources.length + groups.learning_resources.length;
  if (!total) return null;
  return <details className="career-tutor-resources" open>
    <summary>Resources for this answer <span>{total}</span><ChevronDown size={14}/></summary>
    <div>
      {groups.youtube_resources.length > 0 && <section className="career-tutor-resource-group" aria-label="Video resources">
        <h5><Youtube size={13}/> Watch and learn</h5>
        <div className="career-tutor-video-grid">{groups.youtube_resources.map(source => <VideoCard key={source.id} source={source}/>)}</div>
      </section>}
      {groups.official_resources.length > 0 && <section className="career-tutor-resource-group" aria-label="Official resources">
        <h5><BookOpen size={13}/> Official documentation and bodies</h5>
        {groups.official_resources.map(source => <SourceCard key={source.id} source={source}/>)}
      </section>}
      {groups.learning_resources.length > 0 && <section className="career-tutor-resource-group" aria-label="Learning resources">
        <h5><GraduationCap size={13}/> Learning resources</h5>
        {groups.learning_resources.map(source => <SourceCard key={source.id} source={source}/>)}
      </section>}
    </div>
  </details>;
}
const kindLabels: Record<string, string> = {official: "Official docs", learning: "Learning site", course: "Course", github: "GitHub", article: "Article", career: "Career resource", web: "Website", youtube: "YouTube"};
function VideoCard({source}: {source: TutorSource}) {
  const [imageFailed, setImageFailed] = useState(false);
  return <article className="career-tutor-video-card">
    <a className="career-tutor-video-thumb" href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`Watch ${source.title} on YouTube`}>
      {source.thumbnail && !imageFailed
        // The same-origin proxy serves bounded, verified imagery without arbitrary third-party browser requests.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={source.thumbnail} alt="" loading="lazy" onError={() => setImageFailed(true)}/>
        : <span className="career-tutor-video-fallback"><Youtube size={26}/></span>}
      <span className="career-tutor-video-play"><Play size={16}/></span>
    </a>
    <div className="career-tutor-video-body">
      <strong>{source.title}</strong>
      <small><Youtube size={11}/> {source.channel ?? source.provider ?? "YouTube"}</small>
      <span>{source.description}</span>
      <a className="career-tutor-video-action" href={source.url} target="_blank" rel="noopener noreferrer">Watch video <ArrowUpRight size={12}/></a>
    </div>
  </article>;
}
function SourceCard({source}: {source: TutorSource}) {
  const [imageFailed, setImageFailed] = useState(false);
  const video = source.kind === "youtube";
  const preview = video
    ? source.thumbnail
    : `/api/career-tutor/source-image?id=${encodeURIComponent(source.id)}`;
  const Icon = video ? Youtube : source.kind === "github" ? Github : source.kind === "article" ? Newspaper : source.kind === "course" ? GraduationCap : source.kind === "official" ? BookOpen : Globe2;
  const host = new URL(source.url).hostname.replace(/^www\./, "");
  return <a className="career-tutor-source" href={source.url} target="_blank" rel="noopener noreferrer">
    {preview && !imageFailed ? <div className={video ? "career-tutor-video-image" : "career-tutor-source-image"}>
      {/* The same-origin proxy serves bounded, verified imagery without arbitrary third-party browser requests. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="" loading="lazy" onError={() => setImageFailed(true)}/>{video && <Youtube size={23}/>}</div> : <span className="career-tutor-source-icon"><Icon size={17}/></span>}
    <span className="min-w-0 flex-1">
      <strong>{source.title}</strong>
      <small>{video ? source.channel : `${source.provider ?? host}${source.provider && source.provider.toLowerCase() !== host ? ` · ${host}` : ""}`}<b className="career-tutor-kind">{kindLabels[source.kind] ?? "Website"}</b></small>
      <span>{source.description}</span>
      <em>{video ? "Watch on YouTube" : source.kind === "github" ? "Open repository" : source.kind === "course" ? "Open course" : "Open resource"} <ArrowUpRight size={12}/></em>
    </span>
  </a>;
}
