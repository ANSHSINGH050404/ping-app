"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Types ─────────────────────────────────────────────── */
interface PingResult {
  url: string;
  status: "ok" | "error";
  statusCode: number | null;
  responseTime: number;
  errorMessage: string | null;
  timestamp: string;
}

interface MonitoredSite {
  id: string;
  url: string;
  label: string;
  enabled: boolean;
  history: PingResult[]; // last 20 pings
  lastPing: PingResult | null;
  uptime: number; // percentage
  avgResponseTime: number;
}

const PING_INTERVAL = 10 * 60 * 1000;; // 10 minutes
const MAX_HISTORY = 20;
const STORAGE_KEY = "ping-sites";

/* ─── Helpers ────────────────────────────────────────────── */
function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function calcUptime(history: PingResult[]): number {
  if (!history.length) return 100;
  const ok = history.filter((h) => h.status === "ok").length;
  return Math.round((ok / history.length) * 100);
}

function calcAvgRT(history: PingResult[]): number {
  if (!history.length) return 0;
  return Math.round(history.reduce((a, b) => a + b.responseTime, 0) / history.length);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* ─── Sparkline ─────────────────────────────────────────── */
function Sparkline({ history }: { history: PingResult[] }) {
  const max = Math.max(...history.map((h) => h.responseTime), 1);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "2px",
        height: "32px",
      }}
    >
      {history.slice(-20).map((h, i) => {
        const pct = Math.max((h.responseTime / max) * 100, 8);
        return (
          <div
            key={i}
            className="spark-bar"
            title={`${h.responseTime}ms`}
            style={{
              height: `${pct}%`,
              background:
                h.status === "ok"
                  ? `hsl(${Math.max(140 - h.responseTime / 8, 30)}, 80%, 55%)`
                  : "#ef4444",
            }}
          />
        );
      })}
      {history.length === 0 &&
        Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="spark-bar"
            style={{ height: "8%", background: "rgba(99,179,237,0.15)" }}
          />
        ))}
    </div>
  );
}

/* ─── Countdown Ring ────────────────────────────────────── */
function CountdownRing({ secondsLeft }: { secondsLeft: number }) {
  const radius = 20;
  const circ = 2 * Math.PI * radius;
  const progress = secondsLeft / 600;
  const dashoffset = circ * (1 - progress);

  return (
    <svg width="54" height="54" style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx="27"
        cy="27"
        r={radius}
        fill="none"
        stroke="rgba(99,179,237,0.1)"
        strokeWidth="4"
      />
      <circle
        cx="27"
        cy="27"
        r={radius}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={dashoffset}
        style={{ transition: "stroke-dashoffset 1s linear" }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ─── Site Card ─────────────────────────────────────────── */
function SiteCard({
  site,
  onToggle,
  onRemove,
  onPingNow,
  isPinging,
}: {
  site: MonitoredSite;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onPingNow: (id: string) => void;
  isPinging: boolean;
}) {
  const statusColor =
    site.lastPing?.status === "ok"
      ? "var(--green)"
      : site.lastPing?.status === "error"
      ? "var(--red)"
      : "var(--yellow)";

  const dotClass = site.lastPing
    ? site.lastPing.status === "ok"
      ? "ok"
      : "error"
    : "pending";

  return (
    <div
      className="glass-card fade-in-up"
      style={{
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        opacity: site.enabled ? 1 : 0.5,
        transition: "opacity 0.3s ease",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <span className={`status-dot ${dotClass}`} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: "15px",
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {site.label}
            </div>
            <div
              className="mono"
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                marginTop: "2px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {site.url}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
          {/* Toggle */}
          <button
            onClick={() => onToggle(site.id)}
            title={site.enabled ? "Pause" : "Resume"}
            style={{
              background: site.enabled
                ? "rgba(16,185,129,0.1)"
                : "rgba(100,116,139,0.1)",
              border: `1px solid ${site.enabled ? "rgba(16,185,129,0.3)" : "rgba(100,116,139,0.3)"}`,
              color: site.enabled ? "var(--green)" : "var(--text-muted)",
              padding: "5px 10px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {site.enabled ? "● Active" : "⏸ Paused"}
          </button>

          <button
            className="btn-danger"
            onClick={() => onRemove(site.id)}
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "12px",
        }}
      >
        {[
          {
            label: "Uptime",
            value: `${site.uptime}%`,
            color:
              site.uptime >= 90
                ? "var(--green)"
                : site.uptime >= 70
                ? "var(--yellow)"
                : "var(--red)",
          },
          {
            label: "Avg Response",
            value: site.avgResponseTime ? `${site.avgResponseTime}ms` : "—",
            color: "var(--accent-2)",
          },
          {
            label: "Last Status",
            value: site.lastPing?.statusCode
              ? `HTTP ${site.lastPing.statusCode}`
              : site.lastPing
              ? "Error"
              : "Pending",
            color: statusColor,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "rgba(0,0,0,0.2)",
              borderRadius: "10px",
              padding: "10px 12px",
              border: "1px solid rgba(99,179,237,0.07)",
            }}
          >
            <div
              style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}
            >
              {stat.label}
            </div>
            <div
              className="mono"
              style={{ fontSize: "16px", fontWeight: 700, color: stat.color }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Sparkline */}
      <div>
        <div
          style={{
            fontSize: "11px",
            color: "var(--text-muted)",
            marginBottom: "6px",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Response time history</span>
          {site.lastPing && (
            <span style={{ color: "var(--text-secondary)" }}>
              Last: {formatTime(site.lastPing.timestamp)}
            </span>
          )}
        </div>
        <Sparkline history={site.history} />
      </div>

      {/* Error message */}
      {site.lastPing?.status === "error" && site.lastPing.errorMessage && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "12px",
            color: "#fca5a5",
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          ⚠ {site.lastPing.errorMessage}
        </div>
      )}

      {/* Ping now */}
      <button
        className="btn-primary"
        onClick={() => onPingNow(site.id)}
        disabled={isPinging}
        style={{ alignSelf: "flex-start", fontSize: "13px", padding: "8px 16px" }}
      >
        {isPinging ? "Pinging…" : "⚡ Ping Now"}
      </button>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────── */
export default function Home() {
  const [sites, setSites] = useState<MonitoredSite[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [addError, setAddError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(600);
  const [pingingIds, setPingingIds] = useState<Set<string>>(new Set());
  const [totalPings, setTotalPings] = useState(0);
  const [mounted, setMounted] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Load from localStorage */
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSites(JSON.parse(stored));
    } catch {}
  }, []);

  /* Save to localStorage */
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
    }
  }, [sites, mounted]);

  /* Ping a single site */
  const pingSite = useCallback(async (site: MonitoredSite): Promise<PingResult> => {
    const res = await fetch("/api/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: site.url }),
    });
    return await res.json();
  }, []);

  /* Ping all enabled sites */
  const pingAll = useCallback(async () => {
    setSites((prev) => {
      const enabled = prev.filter((s) => s.enabled);
      if (!enabled.length) return prev;
      return prev;
    });

    setSites((current) => {
      const enabled = current.filter((s) => s.enabled);
      if (!enabled.length) return current;

      // kick off pings (side effects)
      enabled.forEach(async (site) => {
        setPingingIds((p) => new Set(p).add(site.id));
        try {
          const result = await pingSite(site);
          setTotalPings((t) => t + 1);
          setSites((prev) =>
            prev.map((s) => {
              if (s.id !== site.id) return s;
              const newHistory = [...s.history, result].slice(-MAX_HISTORY);
              return {
                ...s,
                lastPing: result,
                history: newHistory,
                uptime: calcUptime(newHistory),
                avgResponseTime: calcAvgRT(newHistory),
              };
            })
          );
        } catch (e) {
          console.error("Ping failed", e);
        } finally {
          setPingingIds((p) => {
            const n = new Set(p);
            n.delete(site.id);
            return n;
          });
        }
      });

      return current;
    });
  }, [pingSite]);

  /* Ping single site on-demand */
  const pingOne = useCallback(
    async (id: string) => {
      setSites((current) => {
        const site = current.find((s) => s.id === id);
        if (!site) return current;

        setPingingIds((p) => new Set(p).add(id));
        pingSite(site)
          .then((result) => {
            setTotalPings((t) => t + 1);
            setSites((prev) =>
              prev.map((s) => {
                if (s.id !== id) return s;
                const newHistory = [...s.history, result].slice(-MAX_HISTORY);
                return {
                  ...s,
                  lastPing: result,
                  history: newHistory,
                  uptime: calcUptime(newHistory),
                  avgResponseTime: calcAvgRT(newHistory),
                };
              })
            );
          })
          .finally(() => {
            setPingingIds((p) => {
              const n = new Set(p);
              n.delete(id);
              return n;
            });
          });

        return current;
      });
    },
    [pingSite]
  );

  /* Setup 30-second interval */
  useEffect(() => {
    if (!mounted) return;

    // Ping immediately when sites change (first load)
    pingAll();

    // Countdown
    setSecondsLeft(600);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 600 : s - 1));
    }, 1000);

    // Main ping interval
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      pingAll();
      setSecondsLeft(600);
    }, PING_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Add new site */
  const addSite = () => {
    setAddError("");
    let url = newUrl.trim();
    if (!url) return setAddError("Please enter a URL.");
    if (!url.startsWith("http://") && !url.startsWith("https://"))
      url = "https://" + url;
    try {
      new URL(url);
    } catch {
      return setAddError("Invalid URL format.");
    }
    const label = newLabel.trim() || new URL(url).hostname;
    const newSite: MonitoredSite = {
      id: genId(),
      url,
      label,
      enabled: true,
      history: [],
      lastPing: null,
      uptime: 100,
      avgResponseTime: 0,
    };
    setSites((prev) => [...prev, newSite]);
    setNewUrl("");
    setNewLabel("");
    // Ping immediately
    setTimeout(() => pingOne(newSite.id), 200);
  };

  const toggleSite = (id: string) =>
    setSites((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );

  const removeSite = (id: string) =>
    setSites((prev) => prev.filter((s) => s.id !== id));

  /* Stats */
  const allOk = sites.filter((s) => s.lastPing?.status === "ok").length;
  const allError = sites.filter((s) => s.lastPing?.status === "error").length;
  const overallUptime =
    sites.length === 0
      ? 100
      : Math.round(sites.reduce((a, s) => a + s.uptime, 0) / sites.length);

  if (!mounted) return null;

  return (
    <div
      className="bg-grid"
      style={{ minHeight: "100vh", position: "relative" }}
    >
      {/* Background orbs */}
      <div className="glow-orb glow-orb-1" />
      <div className="glow-orb glow-orb-2" />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "860px",
          margin: "0 auto",
          padding: "40px 20px 80px",
        }}
      >
        {/* ── Header ── */}
        <div style={{ marginBottom: "40px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(59,130,246,0.1)",
              border: "1px solid rgba(59,130,246,0.25)",
              borderRadius: "999px",
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 600,
              color: "#60a5fa",
              marginBottom: "16px",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            <span style={{ fontSize: "16px" }}>🏓</span> Keep-Alive Monitor
          </div>

          <h1
            style={{
              fontSize: "clamp(28px, 5vw, 48px)",
              fontWeight: 800,
              background: "linear-gradient(135deg, #f0f6ff 0%, #60a5fa 50%, #06b6d4 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              lineHeight: 1.1,
              marginBottom: "12px",
            }}
          >
            Ping Dashboard
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "16px", maxWidth: "480px" }}>
            Automatically keeps your Render apps awake by pinging them every{" "}
            <span style={{ color: "#60a5fa", fontWeight: 600 }}>10 minutes</span>.
          </p>
        </div>

        {/* ── Global Stats ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "16px",
            marginBottom: "32px",
          }}
        >
          {[
            {
              label: "Overall Uptime",
              value: `${overallUptime}%`,
              icon: "📈",
              color:
                overallUptime >= 90
                  ? "var(--green)"
                  : overallUptime >= 70
                  ? "var(--yellow)"
                  : "var(--red)",
            },
            {
              label: "Sites Online",
              value: `${allOk} / ${sites.length}`,
              icon: "🟢",
              color: "var(--green)",
            },
            {
              label: "Errors",
              value: allError.toString(),
              icon: "🔴",
              color: allError > 0 ? "var(--red)" : "var(--text-secondary)",
            },
            {
              label: "Total Pings",
              value: totalPings.toString(),
              icon: "⚡",
              color: "var(--accent-2)",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="glass-card"
              style={{ padding: "18px 20px" }}
            >
              <div style={{ fontSize: "20px", marginBottom: "8px" }}>{s.icon}</div>
              <div
                className="mono"
                style={{ fontSize: "24px", fontWeight: 700, color: s.color }}
              >
                {s.value}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Next Ping Countdown ── */}
        {sites.some((s) => s.enabled) && (
          <div
            className="glass-card"
            style={{
              padding: "16px 24px",
              marginBottom: "32px",
              display: "flex",
              alignItems: "center",
              gap: "20px",
            }}
          >
            <CountdownRing secondsLeft={secondsLeft} />
            <div>
              <div style={{ fontWeight: 600, fontSize: "15px" }}>
                Next ping in{" "}
                <span
                  className="mono"
                  style={{ color: "#60a5fa", fontSize: "18px" }}
                >
                  {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>
                All active sites are being pinged on a 10-minute loop
              </div>
            </div>
            <button
              className="btn-primary"
              style={{ marginLeft: "auto" }}
              onClick={pingAll}
              disabled={pingingIds.size > 0}
            >
              {pingingIds.size > 0 ? "Pinging…" : "⚡ Ping All Now"}
            </button>
          </div>
        )}

        {/* ── Add Site Form ── */}
        <div
          className="glass-card"
          style={{ padding: "24px", marginBottom: "32px" }}
        >
          <h2
            style={{
              fontSize: "16px",
              fontWeight: 700,
              marginBottom: "16px",
              color: "var(--text-primary)",
            }}
          >
            + Add a Site to Monitor
          </h2>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <input
              id="site-label"
              className="input-field"
              style={{ flex: "1 1 140px", minWidth: "140px" }}
              type="text"
              placeholder="Label (e.g. My API)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSite()}
            />
            <input
              id="site-url"
              className="input-field"
              style={{ flex: "3 1 280px", minWidth: "200px" }}
              type="url"
              placeholder="https://your-app.onrender.com"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSite()}
            />
            <button className="btn-primary" onClick={addSite} id="add-site-btn">
              Add Site
            </button>
          </div>
          {addError && (
            <div
              style={{
                marginTop: "10px",
                fontSize: "13px",
                color: "#fca5a5",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              ⚠ {addError}
            </div>
          )}
        </div>

        {/* ── Site Cards ── */}
        {sites.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🏓</div>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>
              No sites added yet
            </div>
            <div style={{ fontSize: "14px" }}>
              Add your Render app URL above to start keeping it alive!
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {sites.map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                onToggle={toggleSite}
                onRemove={removeSite}
                onPingNow={pingOne}
                isPinging={pingingIds.has(site.id)}
              />
            ))}
          </div>
        )}

        {/* ── Footer ── */}
        <div
          style={{
            marginTop: "56px",
            textAlign: "center",
            fontSize: "13px",
            color: "var(--text-muted)",
          }}
        >
          <div style={{ marginBottom: "6px" }}>
            Sites are pinged every{" "}
            <span className="mono" style={{ color: "var(--accent)" }}>
              30s
            </span>{" "}
            while this tab is open. Data is stored locally in your browser.
          </div>
          <div>
            Built to defeat{" "}
            <span style={{ color: "#60a5fa" }}>Render free-tier sleep</span> 💙
          </div>
        </div>
      </div>
    </div>
  );
}
