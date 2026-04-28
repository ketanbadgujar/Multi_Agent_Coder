import { useState, useRef } from "react";

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

const API = "http://localhost:8000";

export default function App() {
  const [tab, setTab] = useState<Tab>("run");
  const [task, setTask] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [timeline, setTimeline] = useState<AgentUpdate[]>([]);
  const [activeAgent, setActive] = useState<AgentName | null>(null);
  const [result, setResult] = useState<FinalResult | null>(null);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selected, setSelected] = useState<SessionDetail | null>(null);
  const [loadingDash, setLoadingDash] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div style={s.app}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerTitle}>⚡ Multi-Agent Coder</span>
        <div style={s.tabs}>
          <button
            style={{ ...s.tab, ...(tab === "run" ? s.tabActive : {}) }}
            onClick={() => setTab("run")}
          >
            Run
          </button>
          <button
            style={{ ...s.tab, ...(tab === "dashboard" ? s.tabActive : {}) }}
            onClick={loadDashboard}
          >
            Dashboard
          </button>
        </div>
        {tab === "run" && (
          <span
            style={{
              ...s.badge,
              background:
                status === "running"
                  ? "#FAEEDA"
                  : status === "complete"
                    ? "#E1F5EE"
                    : "#F1EFE8",
              color:
                status === "running"
                  ? "#854F0B"
                  : status === "complete"
                    ? "#085041"
                    : "#5F5E5A",
            }}
          >
            {status === "idle"
              ? "Ready"
              : status === "running"
                ? "Running..."
                : status === "complete"
                  ? "Complete"
                  : "Error"}
          </span>
        )}
      </div>

      {/* ── RUN TAB ── */}
      {tab === "run" && (
        <div style={s.body}>
          {/* Sidebar */}
          <div style={s.sidebar}>
            <div style={s.label}>Agents</div>
            {AGENTS.map((a) => {
              const isActive = activeAgent === a.name;
              const isDone = agentDone(a.name);
              return (
                <div
                  key={a.name}
                  style={{
                    ...s.agentCard,
                    borderColor: isActive
                      ? a.color
                      : isDone
                        ? a.color + "66"
                        : "#e0e0e0",
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
                    <span style={s.agentName}>{a.label}</span>
                    {isDone && (
                      <span style={{ fontSize: 11, color: "#0F6E56" }}>✓</span>
                    )}
                    {isActive && (
                      <span
                        style={{
                          fontSize: 11,
                          color: a.color,
                          animation: "pulse 1s infinite",
                        }}
                      >
                        ●
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                    {isActive ? "Running..." : isDone ? "Done" : "Waiting"}
                  </div>
                </div>
              );
            })}
            {result && (
              <div
                style={{
                  marginTop: "auto",
                  borderTop: "0.5px solid #e0e0e0",
                  paddingTop: 12,
                }}
              >
                <div style={s.label}>Stats</div>
                <div style={s.stat}>
                  <span>Score</span>
                  <span style={{ fontWeight: 500 }}>{result.score}/10</span>
                </div>
                <div style={s.stat}>
                  <span>Iterations</span>
                  <span>{result.iterations}</span>
                </div>
                <div style={s.stat}>
                  <span>Execution</span>
                  <span
                    style={{
                      color: result.execution_success ? "#0F6E56" : "#993C1D",
                    }}
                  >
                    {result.execution_success ? "✓ passed" : "✗ failed"}
                  </span>
                </div>
                <div style={s.stat}>
                  <span>Session</span>
                  <span style={{ fontSize: 10, color: "#999" }}>
                    {result.session_id.slice(0, 8)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Main feed */}
          <div style={s.main}>
            <div style={s.inputArea}>
              <textarea
                ref={textareaRef}
                style={s.textarea}
                placeholder="Enter a coding task... (⌘↵ to run)"
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
            <div style={s.feed}>
              {timeline.length === 0 && status === "idle" && (
                <div style={s.empty}>
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
                    style={{ ...s.feedCard, borderLeftColor: agent.color }}
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
                    <div style={s.feedText}>{event.summary}</div>
                  </div>
                );
              })}
              {status === "running" && activeAgent && (
                <div style={s.thinking}>
                  <span style={{ color: "#888", fontSize: 13 }}>
                    {AGENTS.find((a) => a.name === activeAgent)?.label} is
                    thinking
                  </span>
                  <span style={{ color: "#bbb", marginLeft: 8 }}>●●●</span>
                </div>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div style={s.right}>
            {!result ? (
              <div style={s.empty}>
                Output appears here after run completes.
              </div>
            ) : (
              <>
                <div style={s.label}>Plan</div>
                <div style={s.planBox}>{result.plan}</div>
                <div style={s.label}>Final code</div>
                <pre style={s.codeBox}>{result.final_code}</pre>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── DASHBOARD TAB ── */}
      {tab === "dashboard" && (
        <div style={s.dashBody}>
          {/* Session list */}
          <div style={s.sessionList}>
            <div style={{ ...s.label, marginBottom: 8 }}>Past sessions</div>
            {loadingDash && <div style={s.empty}>Loading...</div>}
            {!loadingDash && sessions.length === 0 && (
              <div style={s.empty}>No sessions yet. Run a task first.</div>
            )}
            {sessions.map((sess) => (
              <div
                key={sess.session_id}
                style={{
                  ...s.sessionCard,
                  borderColor:
                    selected?.session_id === sess.session_id
                      ? "#185FA5"
                      : "#e0e0e0",
                }}
                onClick={() => loadSession(sess.session_id)}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#1a1a18",
                    marginBottom: 4,
                  }}
                >
                  {sess.task.length > 60
                    ? sess.task.slice(0, 60) + "..."
                    : sess.task}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#888" }}>
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
                    style={{ fontSize: 11, color: "#888", marginLeft: "auto" }}
                  >
                    {sess.updated_at
                      ? new Date(sess.updated_at * 1000).toLocaleTimeString()
                      : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Session detail / replay */}
          <div style={s.sessionDetail}>
            {!selected ? (
              <div style={s.empty}>
                Click a session on the left to replay it.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>
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

                <div style={s.label}>Agent timeline</div>
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
                        <div style={s.feedText}>{event.summary}</div>
                      </div>
                    );
                  })}
                </div>

                <div style={s.label}>Final code</div>
                <pre style={s.codeBox}>{selected.final_code}</pre>
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
    background: "#fafaf9",
    color: "#1a1a18",
  },
  header: {
    display: "flex",
    alignItems: "center",
    padding: "10px 20px",
    borderBottom: "0.5px solid #e0e0e0",
    background: "#fff",
    gap: 12,
  },
  headerTitle: { fontSize: 15, fontWeight: 600 },
  tabs: {
    display: "flex",
    gap: 4,
    background: "#f1f0ee",
    borderRadius: 8,
    padding: 3,
  },
  tab: {
    fontSize: 12,
    fontWeight: 500,
    padding: "5px 14px",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: "#666",
    cursor: "pointer",
  },
  tabActive: {
    background: "#fff",
    color: "#1a1a18",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
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
    borderRight: "0.5px solid #e0e0e0",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "#f5f5f3",
    overflowY: "auto",
  },
  label: {
    fontSize: 10,
    fontWeight: 500,
    color: "#999",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  agentCard: {
    border: "0.5px solid #e0e0e0",
    borderRadius: 8,
    padding: "8px 10px",
    background: "#fff",
  },
  agentRow: { display: "flex", alignItems: "center", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  agentName: { fontSize: 13, fontWeight: 500, flex: 1 },
  stat: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#666",
    padding: "3px 0",
  },
  main: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "#fff",
  },
  inputArea: {
    padding: 14,
    borderBottom: "0.5px solid #e0e0e0",
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
  },
  textarea: {
    flex: 1,
    fontSize: 13,
    padding: "8px 12px",
    border: "0.5px solid #d0d0d0",
    borderRadius: 8,
    resize: "none",
    fontFamily: "inherit",
    background: "#fafaf9",
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
    whiteSpace: "nowrap",
  },
  feed: {
    flex: 1,
    overflowY: "auto",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  feedCard: {
    border: "0.5px solid #e0e0e0",
    borderLeft: "3px solid #ccc",
    borderRadius: 8,
    overflow: "hidden",
  },
  feedLabel: {
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    padding: "4px 10px",
  },
  feedText: { fontSize: 13, padding: "8px 10px", color: "#444" },
  thinking: {
    padding: "10px 12px",
    border: "0.5px dashed #d0d0d0",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
  },
  empty: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
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
    borderLeft: "0.5px solid #e0e0e0",
    padding: 14,
    overflowY: "auto",
    background: "#fafaf9",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  planBox: {
    fontSize: 12,
    color: "#555",
    background: "#f5f5f3",
    borderRadius: 8,
    padding: "10px 12px",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    marginBottom: 8,
  },
  codeBox: {
    fontSize: 11,
    background: "#1e1e1e",
    color: "#d4d4d4",
    borderRadius: 8,
    padding: "12px 14px",
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
    margin: 0,
  },
  dashBody: {
    display: "grid",
    gridTemplateColumns: "320px 1fr",
    flex: 1,
    overflow: "hidden",
  },
  sessionList: {
    borderRight: "0.5px solid #e0e0e0",
    padding: 14,
    overflowY: "auto",
    background: "#f5f5f3",
  },
  sessionCard: {
    border: "0.5px solid #e0e0e0",
    borderRadius: 8,
    padding: "10px 12px",
    background: "#fff",
    marginBottom: 8,
    cursor: "pointer",
  },
  sessionDetail: { padding: 16, overflowY: "auto", background: "#fff" },
};
