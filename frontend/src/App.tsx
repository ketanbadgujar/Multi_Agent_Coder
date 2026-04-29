import { useState, useRef, useEffect } from "react";

type AgentName = "planner" | "coder" | "reviewer" | "debugger";

interface AgentUpdate {
  agent: AgentName;
  summary: string;
}
interface FinalResult {
  session_id: string;
  iterations: number;
  debug_attempts: number;
  score: number;
  verdict: string;
  execution_success: boolean;
  final_code: string;
  plan: string;
}
interface SessionSummary {
  session_id: string;
  task: string;
  last_agent: string;
  score: number | null;
  updated_at: number;
}
interface SessionDetail {
  session_id: string;
  task: string;
  timeline: AgentUpdate[];
  score: number;
  last_agent: string;
  final_code: string;
  plan: string;
  iterations: number;
  execution_success: boolean;
}

type Status = "idle" | "running" | "complete" | "error";
type Tab = "run" | "dashboard";

const AGENTS: { name: AgentName; label: string; color: string; bg: string }[] =
  [
    { name: "planner", label: "Planner", color: "#534AB7", bg: "#EEEDFE" },
    { name: "coder", label: "Coder", color: "#085041", bg: "#E1F5EE" },
    { name: "reviewer", label: "Reviewer", color: "#854F0B", bg: "#FAEEDA" },
    { name: "debugger", label: "Debugger", color: "#993C1D", bg: "#FAECE7" },
  ];

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const cleanPlan = (text: string): string => {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/^[\s•\-*#]+/gm, "")
    .split("\n")
    .filter((line: string) => {
      const trimmed = line.trim();
      if (trimmed === "") return false;
      if (
        /^(plan|here is|here's|the following|steps?|overview)\b/i.test(trimmed)
      )
        return false;
      if (trimmed.length < 8) return false;
      return true;
    })
    .map((line: string, i: number) => `${i + 1}. ${line.trim()}`)
    .join("\n");
};

export default function App() {
  const [tab, setTab] = useState<Tab>("run");
  const [task, setTask] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [timeline, setTimeline] = useState<AgentUpdate[]>([]);
  const [activeAgent, setActive] = useState<AgentName | null>(null);
  const [result, setResult] = useState<FinalResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<SessionDetail | null>(null);
  const [loadingDash, setLoadingDash] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("darkMode") === "true";
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [timeline, status]);

  const t = {
    bg: darkMode ? "#1a1a1a" : "#fafaf9",
    surface: darkMode ? "#242424" : "#ffffff",
    sidebar: darkMode ? "#1e1e1e" : "#f5f5f3",
    border: darkMode ? "#333333" : "#e0e0e0",
    text: darkMode ? "#e8e8e6" : "#1a1a18",
    textSecondary: darkMode ? "#aaaaaa" : "#666666",
    textTertiary: darkMode ? "#666666" : "#999999",
    input: darkMode ? "#2a2a2a" : "#fafaf9",
    inputBorder: darkMode ? "#444444" : "#d0d0d0",
    codeBg: darkMode ? "#0d0d0d" : "#1e1e1e",
    tabBg: darkMode ? "#2a2a2a" : "#f1f0ee",
    tabActive: darkMode ? "#3a3a3a" : "#ffffff",
  };

  const statusConfig = {
    idle: { label: "Ready", bg: "#F1EFE8", color: "#5F5E5A" },
    running: { label: "Running...", bg: "#FAEEDA", color: "#854F0B" },
    complete: { label: "Complete", bg: "#E1F5EE", color: "#085041" },
    error: { label: "Error", bg: "#FAECE7", color: "#993C1D" },
  };

  const agentDone = (name: AgentName) => timeline.some((e) => e.agent === name);

  const runAgents = async () => {
    if (!task.trim()) return;
    setStatus("running");
    setTimeline([]);
    setActive(null);
    setResult(null);
    setError("");
    try {
      const res = await fetch(`${API}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n").filter(Boolean);
        for (const line of lines) {
          const msg = JSON.parse(line);
          if (msg.type === "agent_update") {
            setActive(msg.agent);
            setTimeline((p) => [...p, msg]);
          }
          if (msg.type === "complete") {
            setResult(msg);
            setActive(null);
            setStatus("complete");
          }
        }
      }
    } catch {
      setError(
        "Could not connect to backend. Is the FastAPI server running on port 8000?",
      );
      setStatus("error");
    }
  };

  const loadDashboard = async () => {
    setTab("dashboard");
    setLoadingDash(true);
    setSelected(null);
    try {
      const res = await fetch(`${API}/sessions`);
      const data = await res.json();
      setSessions(
        data.sessions.sort(
          (a: SessionSummary, b: SessionSummary) => b.updated_at - a.updated_at,
        ),
      );
    } catch {
      setSessions([]);
    }
    setLoadingDash(false);
  };

  const loadSession = async (session_id: string) => {
    const res = await fetch(`${API}/session/${session_id}/timeline`);
    const data = await res.json();
    setSelected(data);
  };

  const sc = statusConfig[status];

  return (
    <div style={{ ...s.app, background: t.bg, color: t.text }}>
      {/* ── Header ── */}
      <div
        style={{
          ...s.header,
          background: t.surface,
          borderBottom: `0.5px solid ${t.border}`,
        }}
      >
        <div style={s.logoWrap}>
          <span style={s.logoIcon}>🤖</span>
          <div>
            <div style={{ ...s.appName, color: t.text }}>AgentForge</div>
            <div
              style={{
                fontSize: 10,
                color: t.textTertiary,
                letterSpacing: "0.04em",
              }}
            >
              Multi-Agent Coding Assistant
            </div>
          </div>
        </div>

        <div style={{ ...s.pillGroup, background: t.tabBg }}>
          <button
            style={{
              ...s.pillBtn,
              color: tab === "run" ? t.text : t.textSecondary,
              ...(tab === "run"
                ? {
                    background: t.tabActive,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                  }
                : {}),
            }}
            onClick={() => setTab("run")}
          >
            ▶ Run
          </button>

          <button
            style={{
              ...s.pillBtn,
              color: tab === "dashboard" ? t.text : t.textSecondary,
              ...(tab === "dashboard"
                ? {
                    background: t.tabActive,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                  }
                : {}),
            }}
            onClick={loadDashboard}
          >
            ◫ Dashboard
          </button>

          <div
            style={{ width: "0.5px", background: t.border, margin: "4px 2px" }}
          />

          <div
            style={{
              ...s.pillBtn,
              background: sc.bg,
              color: sc.color,
              cursor: "default",
              fontWeight: 500,
            }}
          >
            {status === "running" && <span style={{ marginRight: 4 }}>⏳</span>}
            {status === "complete" && <span style={{ marginRight: 4 }}>✓</span>}
            {status === "error" && <span style={{ marginRight: 4 }}>✗</span>}
            {sc.label}
          </div>

          <div
            style={{ width: "0.5px", background: t.border, margin: "4px 2px" }}
          />

          <button
            style={{
              ...s.pillBtn,
              color: t.textSecondary,
              ...(darkMode
                ? {
                    background: t.tabActive,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                  }
                : {}),
            }}
            onClick={() => {
              const next = !darkMode;
              setDarkMode(next);
              localStorage.setItem("darkMode", String(next));
            }}
          >
            {darkMode ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </div>

      {/* ── RUN TAB ── */}
      {tab === "run" && (
        <div style={s.body}>
          {/* Sidebar */}
          <div
            style={{
              ...s.sidebar,
              background: t.sidebar,
              borderRight: `0.5px solid ${t.border}`,
            }}
          >
            <div style={{ ...s.label, color: t.textTertiary }}>Agents</div>
            {AGENTS.map((a) => {
              const isActive = activeAgent === a.name;
              const isDone = agentDone(a.name);
              return (
                <div
                  key={a.name}
                  style={{
                    ...s.agentCard,
                    background: t.surface,
                    borderColor: isActive
                      ? a.color
                      : isDone
                        ? a.color + "66"
                        : t.border,
                  }}
                >
                  <div style={s.agentRow}>
                    <div
                      style={{
                        ...s.dot,
                        background: isActive
                          ? a.color
                          : isDone
                            ? "#0F6E56"
                            : "#B4B2A9",
                      }}
                    />
                    <span style={{ ...s.agentName, color: t.text }}>
                      {a.label}
                    </span>
                    {isDone && (
                      <span style={{ fontSize: 11, color: "#0F6E56" }}>✓</span>
                    )}
                    {isActive && (
                      <span style={{ fontSize: 11, color: a.color }}>●</span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: t.textTertiary,
                      marginTop: 4,
                    }}
                  >
                    {isActive ? "Running..." : isDone ? "Done" : "Waiting"}
                  </div>
                </div>
              );
            })}
            {result && (
              <div
                style={{
                  marginTop: "auto",
                  borderTop: `0.5px solid ${t.border}`,
                  paddingTop: 12,
                }}
              >
                <div style={{ ...s.label, color: t.textTertiary }}>Stats</div>
                <div style={{ ...s.stat, color: t.textSecondary }}>
                  <span>Score</span>
                  <span style={{ fontWeight: 500 }}>{result.score}/10</span>
                </div>
                <div style={{ ...s.stat, color: t.textSecondary }}>
                  <span>Iterations</span>
                  <span>{result.iterations}</span>
                </div>
                <div style={{ ...s.stat, color: t.textSecondary }}>
                  <span>Execution</span>
                  <span
                    style={{
                      color: result.execution_success ? "#0F6E56" : "#993C1D",
                    }}
                  >
                    {result.execution_success ? "✓ passed" : "✗ failed"}
                  </span>
                </div>
                <div style={{ ...s.stat, color: t.textSecondary }}>
                  <span>Session</span>
                  <span style={{ fontSize: 10, color: t.textTertiary }}>
                    {result.session_id.slice(0, 8)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Main feed */}
          <div style={{ ...s.main, background: t.surface }}>
            <div
              style={{
                ...s.inputArea,
                borderBottom: `0.5px solid ${t.border}`,
              }}
            >
              <textarea
                ref={textareaRef}
                style={{
                  ...s.textarea,
                  background: t.input,
                  color: t.text,
                  border: `0.5px solid ${t.inputBorder}`,
                }}
                placeholder="Describe a coding task... e.g. Write a binary search function in Python"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) runAgents();
                }}
                rows={3}
                disabled={status === "running"}
              />
              <button
                style={{
                  ...s.runBtn,
                  opacity: status === "running" || !task.trim() ? 0.5 : 1,
                }}
                onClick={runAgents}
                disabled={status === "running" || !task.trim()}
              >
                {status === "running" ? "Running..." : "Run ⌘↵"}
              </button>
            </div>
            {error && <div style={s.errorBox}>{error}</div>}
            <div style={s.feed} ref={feedRef}>
              {timeline.length === 0 && status === "idle" && (
                <div style={{ ...s.empty, color: t.textTertiary }}>
                  Enter a coding task above and press Run.
                  <br />
                  Agents will plan, write, review and execute your code.
                </div>
              )}
              {timeline.map((event, i) => {
                const agent = AGENTS.find((a) => a.name === event.agent)!;
                return (
                  <div
                    key={i}
                    style={{
                      ...s.feedCard,
                      borderColor: t.border,
                      borderLeftColor: agent.color,
                    }}
                  >
                    <div
                      style={{
                        ...s.feedLabel,
                        color: agent.color,
                        background: agent.bg,
                      }}
                    >
                      {agent.label}
                    </div>
                    <div
                      style={{
                        ...s.feedText,
                        color: t.textSecondary,
                        background: t.surface,
                      }}
                    >
                      {event.summary}
                    </div>
                  </div>
                );
              })}
              {status === "running" && activeAgent && (
                <div
                  style={{ ...s.thinking, border: `0.5px dashed ${t.border}` }}
                >
                  <span style={{ color: t.textTertiary, fontSize: 13 }}>
                    {AGENTS.find((a) => a.name === activeAgent)?.label} is
                    thinking
                  </span>
                  <span style={{ color: t.textTertiary, marginLeft: 8 }}>
                    ●●●
                  </span>
                </div>
              )}
              {status === "complete" && result && (
                <div
                  style={{
                    borderRadius: 10,
                    overflow: "hidden",
                    border: `0.5px solid ${t.border}`,
                    marginTop: 4,
                  }}
                >
                  <div
                    style={{
                      padding: "6px 12px",
                      background: "#1e1e1e",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 500,
                        color: "#888",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase" as const,
                      }}
                    >
                      Final code
                    </span>
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: "#E1F5EE",
                          color: "#085041",
                        }}
                      >
                        ✓ {result.score}/10
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: result.execution_success
                            ? "#E1F5EE"
                            : "#FAECE7",
                          color: result.execution_success
                            ? "#085041"
                            : "#993C1D",
                        }}
                      >
                        {result.execution_success ? "Executed" : "Failed"}
                      </span>

                      {/* Copy button */}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(result.final_code);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 6,
                          border: "0.5px solid #444",
                          background: copied ? "#1a4a2e" : "#2a2a2a",
                          color: copied ? "#4ade80" : "#aaa",
                          cursor: "pointer",
                        }}
                      >
                        {copied ? "✓ Copied" : "⎘ Copy"}
                      </button>

                      {/* Download button */}
                      <button
                        onClick={() => {
                          const blob = new Blob([result.final_code], {
                            type: "text/plain",
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "solution.py";
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 6,
                          border: "0.5px solid #444",
                          background: "#2a2a2a",
                          color: "#aaa",
                          cursor: "pointer",
                        }}
                      >
                        ↓ Download
                      </button>
                    </div>
                  </div>
                  <pre
                    style={{
                      ...s.codeBox,
                      background: t.codeBg,
                      borderRadius: 0,
                      margin: 0,
                      maxHeight: 400,
                      overflowY: "auto" as const,
                    }}
                  >
                    {result.final_code || result.final_code === ""
                      ? result.final_code ||
                        "-- code not captured, check dashboard for this session --"
                      : ""}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div
            style={{
              ...s.right,
              background: t.sidebar,
              borderLeft: `0.5px solid ${t.border}`,
            }}
          >
            {!result ? (
              <div style={{ ...s.empty, color: t.textTertiary }}>
                Output appears here after run completes.
              </div>
            ) : (
              <>
                <div style={{ ...s.label, color: t.textTertiary }}>Plan</div>
                <div
                  style={{
                    ...s.planBox,
                    color: t.textSecondary,
                    background: t.surface,
                    border: `0.5px solid ${t.border}`,
                  }}
                >
                  {cleanPlan(result.plan)}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── DASHBOARD TAB ── */}
      {tab === "dashboard" && (
        <div style={s.dashBody}>
          <div
            style={{
              ...s.sessionList,
              background: t.sidebar,
              borderRight: `0.5px solid ${t.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div
                style={{ ...s.label, color: t.textTertiary, marginBottom: 0 }}
              >
                Past sessions
              </div>
              <button
                onClick={loadDashboard}
                style={{
                  fontSize: 11,
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: `0.5px solid ${t.border}`,
                  background: t.surface,
                  color: t.textSecondary,
                  cursor: "pointer",
                }}
              >
                ↻ Refresh
              </button>
            </div>
            {loadingDash && (
              <div style={{ ...s.empty, color: t.textTertiary }}>
                Loading...
              </div>
            )}
            {!loadingDash && sessions.length === 0 && (
              <div style={{ ...s.empty, color: t.textTertiary }}>
                No sessions yet. Run a task first.
              </div>
            )}
            {sessions.map((sess) => (
              <div
                key={sess.session_id}
                style={{
                  ...s.sessionCard,
                  background: t.surface,
                  borderColor:
                    selected?.session_id === sess.session_id
                      ? "#185FA5"
                      : t.border,
                }}
                onClick={() => loadSession(sess.session_id)}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: t.text,
                    marginBottom: 4,
                  }}
                >
                  {sess.task.length > 60
                    ? sess.task.slice(0, 60) + "..."
                    : sess.task}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: t.textTertiary }}>
                    {sess.session_id.slice(0, 8)}
                  </span>
                  {sess.score !== null && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "1px 7px",
                        borderRadius: 20,
                        background: "#E1F5EE",
                        color: "#085041",
                      }}
                    >
                      {sess.score}/10
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      color: t.textTertiary,
                      marginLeft: "auto",
                    }}
                  >
                    {sess.updated_at
                      ? new Date(sess.updated_at * 1000).toLocaleTimeString()
                      : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ ...s.sessionDetail, background: t.surface }}>
            {!selected ? (
              <div style={{ ...s.empty, color: t.textTertiary }}>
                Click a session on the left to replay it.
              </div>
            ) : (
              <>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: t.text,
                    marginBottom: 4,
                  }}
                >
                  {selected.task}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginBottom: 16,
                    flexWrap: "wrap" as const,
                  }}
                >
                  <span
                    style={{
                      ...s.badge,
                      background: "#E1F5EE",
                      color: "#085041",
                    }}
                  >
                    Score: {selected.score}/10
                  </span>
                  <span
                    style={{
                      ...s.badge,
                      background: "#EEEDFE",
                      color: "#534AB7",
                    }}
                  >
                    Iterations: {selected.iterations}
                  </span>
                  <span
                    style={{
                      ...s.badge,
                      background: selected.execution_success
                        ? "#E1F5EE"
                        : "#FAECE7",
                      color: selected.execution_success ? "#085041" : "#993C1D",
                    }}
                  >
                    {selected.execution_success ? "✓ Executed" : "✗ Failed"}
                  </span>
                </div>

                <div style={{ ...s.label, color: t.textTertiary }}>Plan</div>
                <div
                  style={{
                    ...s.planBox,
                    color: t.textSecondary,
                    background: t.sidebar,
                    border: `0.5px solid ${t.border}`,
                    marginBottom: 16,
                  }}
                >
                  {cleanPlan(selected.plan)}
                </div>

                <div style={{ ...s.label, color: t.textTertiary }}>
                  Agent timeline
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column" as const,
                    gap: 6,
                    marginBottom: 16,
                  }}
                >
                  {selected.timeline.map((event, i) => {
                    const agent = AGENTS.find((a) => a.name === event.agent)!;
                    return (
                      <div
                        key={i}
                        style={{
                          ...s.feedCard,
                          borderColor: t.border,
                          borderLeftColor: agent?.color || "#ccc",
                        }}
                      >
                        <div
                          style={{
                            ...s.feedLabel,
                            color: agent?.color,
                            background: agent?.bg,
                          }}
                        >
                          {agent?.label}
                        </div>
                        <div
                          style={{
                            ...s.feedText,
                            color: t.textSecondary,
                            background: t.surface,
                          }}
                        >
                          {event.summary}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ ...s.label, color: t.textTertiary }}>
                  Final code
                </div>
                <pre style={{ ...s.codeBox, background: t.codeBg }}>
                  {selected.final_code}
                </pre>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  app: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    padding: "10px 20px",
    gap: 16,
  },
  logoWrap: { display: "flex", alignItems: "center", gap: 10, marginRight: 8 },
  logoIcon: { fontSize: 22 },
  appName: { fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" },
  pillGroup: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    borderRadius: 10,
    padding: 3,
  },
  pillBtn: {
    fontSize: 12,
    fontWeight: 500,
    padding: "5px 13px",
    borderRadius: 7,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  badge: {
    fontSize: 11,
    fontWeight: 500,
    padding: "3px 10px",
    borderRadius: 20,
  },
  body: {
    display: "grid",
    gridTemplateColumns: "200px 1fr 280px",
    flex: 1,
    overflow: "hidden",
  },
  sidebar: {
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    overflowY: "auto" as const,
  },
  label: {
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    marginBottom: 4,
  },
  agentCard: { border: "0.5px solid", borderRadius: 8, padding: "8px 10px" },
  agentRow: { display: "flex", alignItems: "center", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  agentName: { fontSize: 13, fontWeight: 500, flex: 1 },
  stat: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    padding: "3px 0",
  },
  main: { display: "flex", flexDirection: "column", overflow: "hidden" },
  inputArea: {
    padding: 14,
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
  },
  textarea: {
    flex: 1,
    fontSize: 13,
    padding: "8px 12px",
    borderRadius: 8,
    resize: "none" as const,
    fontFamily: "inherit",
  },
  runBtn: {
    fontSize: 13,
    padding: "8px 16px",
    background: "#185FA5",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  feed: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  feedCard: {
    border: "0.5px solid",
    borderLeft: "3px solid",
    borderRadius: 8,
    overflow: "visible",
  },
  feedLabel: {
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    padding: "4px 10px",
  },
  feedText: {
    fontSize: 13,
    padding: "8px 10px",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    lineHeight: 1.6,
  },
  thinking: {
    padding: "10px 12px",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
  },
  empty: {
    fontSize: 13,
    textAlign: "center" as const,
    padding: "40px 20px",
    lineHeight: 1.6,
  },
  errorBox: {
    margin: "10px 14px",
    padding: "10px 14px",
    background: "#FAECE7",
    color: "#993C1D",
    borderRadius: 8,
    fontSize: 13,
  },
  right: {
    padding: 14,
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  planBox: {
    fontSize: 12,
    borderRadius: 8,
    padding: "10px 12px",
    lineHeight: 1.9,
    whiteSpace: "pre-wrap" as const,
    marginBottom: 8,
  },
  codeBox: {
    fontSize: 11,
    color: "#d4d4d4",
    borderRadius: 8,
    padding: "12px 14px",
    overflowX: "auto" as const,
    whiteSpace: "pre-wrap" as const,
    lineHeight: 1.6,
    margin: 0,
  },
  dashBody: {
    display: "grid",
    gridTemplateColumns: "320px 1fr",
    flex: 1,
    overflow: "hidden",
  },
  sessionList: { padding: 14, overflowY: "auto" as const },
  sessionCard: {
    border: "0.5px solid",
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 8,
    cursor: "pointer",
  },
  sessionDetail: { padding: 16, overflowY: "auto" as const },
};
