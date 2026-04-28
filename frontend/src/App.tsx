import { useState, useRef } from "react";

// --- Types ---
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

type Status = "idle" | "running" | "complete" | "error";

// --- Agent config ---
const AGENTS: { name: AgentName; label: string; color: string; bg: string }[] =
  [
    { name: "planner", label: "Planner", color: "#534AB7", bg: "#EEEDFE" },
    { name: "coder", label: "Coder", color: "#085041", bg: "#E1F5EE" },
    { name: "reviewer", label: "Reviewer", color: "#854F0B", bg: "#FAEEDA" },
    { name: "debugger", label: "Debugger", color: "#993C1D", bg: "#FAECE7" },
  ];

export default function App() {
  const [task, setTask] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [timeline, setTimeline] = useState<AgentUpdate[]>([]);
  const [activeAgent, setActive] = useState<AgentName | null>(null);
  const [result, setResult] = useState<FinalResult | null>(null);
  const [error, setError] = useState("");
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
      const res = await fetch("http://localhost:8000/run", {
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
            setTimeline((prev) => [...prev, msg]);
          }

          if (msg.type === "complete") {
            setResult(msg);
            setActive(null);
            setStatus("complete");
          }
        }
      }
    } catch (e) {
      setError("Could not connect to backend. Is the FastAPI server running?");
      setStatus("error");
    }
  };

  return (
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Multi-Agent Coder</span>
        <span
          style={{
            ...styles.statusBadge,
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
      </div>

      <div style={styles.body}>
        {/* Left: Agent sidebar */}
        <div style={styles.sidebar}>
          <div style={styles.sectionLabel}>Agents</div>
          {AGENTS.map((a) => {
            const isActive = activeAgent === a.name;
            const isDone = agentDone(a.name);
            return (
              <div
                key={a.name}
                style={{
                  ...styles.agentCard,
                  borderColor: isActive
                    ? a.color
                    : isDone
                      ? a.color + "44"
                      : "var(--border)",
                }}
              >
                <div style={styles.agentRow}>
                  <div
                    style={{
                      ...styles.dot,
                      background: isActive
                        ? a.color
                        : isDone
                          ? "#0F6E56"
                          : "#B4B2A9",
                    }}
                  />
                  <span style={styles.agentName}>{a.label}</span>
                  {isDone && (
                    <span style={{ fontSize: 12, color: "#0F6E56" }}>✓</span>
                  )}
                  {isActive && (
                    <span style={{ fontSize: 11, color: a.color }}>●</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                  {isActive ? "Running..." : isDone ? "Done" : "Waiting"}
                </div>
              </div>
            );
          })}

          {/* Stats */}
          {result && (
            <div
              style={{
                marginTop: "auto",
                borderTop: "0.5px solid #e0e0e0",
                paddingTop: 12,
              }}
            >
              <div style={styles.sectionLabel}>Session stats</div>
              <div style={styles.statRow}>
                <span>Score</span>
                <span>{result.score}/10</span>
              </div>
              <div style={styles.statRow}>
                <span>Iterations</span>
                <span>{result.iterations}</span>
              </div>
              <div style={styles.statRow}>
                <span>Execution</span>
                <span>
                  {result.execution_success ? "✓ passed" : "✗ failed"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Center: Main feed */}
        <div style={styles.main}>
          {/* Task input */}
          <div style={styles.inputArea}>
            <textarea
              ref={textareaRef}
              style={styles.textarea}
              placeholder="Enter a coding task... e.g. Write a Python binary search function"
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
                ...styles.runBtn,
                opacity: status === "running" || !task.trim() ? 0.5 : 1,
                cursor:
                  status === "running" || !task.trim()
                    ? "not-allowed"
                    : "pointer",
              }}
              onClick={runAgents}
              disabled={status === "running" || !task.trim()}
            >
              {status === "running" ? "Running..." : "Run ⌘↵"}
            </button>
          </div>

          {error && <div style={styles.errorBox}>{error}</div>}

          {/* Timeline feed */}
          <div style={styles.feed}>
            {timeline.length === 0 && status === "idle" && (
              <div style={styles.emptyState}>
                Enter a coding task above and click Run.
                <br />
                The agents will plan, write, review, and execute your code.
              </div>
            )}

            {timeline.map((event, i) => {
              const agent = AGENTS.find((a) => a.name === event.agent)!;
              return (
                <div
                  key={i}
                  style={{
                    ...styles.feedCard,
                    borderColor: agent.color + "55",
                  }}
                >
                  <div
                    style={{
                      ...styles.feedLabel,
                      color: agent.color,
                      background: agent.bg,
                    }}
                  >
                    {agent.label}
                  </div>
                  <div style={styles.feedText}>{event.summary}</div>
                </div>
              );
            })}

            {status === "running" && activeAgent && (
              <div style={styles.thinkingCard}>
                <span style={{ color: "#888", fontSize: 13 }}>
                  {AGENTS.find((a) => a.name === activeAgent)?.label} is
                  thinking...
                </span>
                <span style={{ color: "#aaa", fontSize: 16, marginLeft: 8 }}>
                  ●●●
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Output panel */}
        <div style={styles.rightPanel}>
          <div style={styles.sectionLabel}>Output</div>

          {!result && (
            <div style={styles.emptyState}>
              Output will appear here after the run completes.
            </div>
          )}

          {result && (
            <>
              {/* Plan */}
              <div style={styles.sectionLabel}>Plan</div>
              <div style={styles.planBox}>{result.plan}</div>

              {/* Code */}
              <div style={styles.sectionLabel}>Final code</div>
              <pre style={styles.codeBox}>{result.final_code}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Styles ---
const styles: Record<string, React.CSSProperties> = {
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
    padding: "12px 20px",
    borderBottom: "0.5px solid #e0e0e0",
    background: "#fff",
    gap: 12,
  },
  headerTitle: { fontSize: 15, fontWeight: 500 },
  statusBadge: {
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
  sectionLabel: {
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
  statRow: {
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
  thinkingCard: {
    padding: "10px 12px",
    border: "0.5px dashed #d0d0d0",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
  },
  emptyState: {
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
  rightPanel: {
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
};
