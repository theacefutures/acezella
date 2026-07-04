import React, { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { loadCloudState, saveCloudState } from "./lib/cloudSync";

// ─── THEME ───────────────────────────────────────────────────────────────────
// C is intentionally a single mutable object — every component reads C.xxx at
// render time, so mutating its properties (via applyTheme) re-colors the whole
// app without needing to thread theme through every component as a prop.
const C = {
  bg: "#020617", surface: "#0F172A", surfaceHigh: "#334155",
  border: "#1e293b", borderLight: "#334155",
  accent: "#32D18D", accentDim: "#32D18D22", accentHover: "#28b378",
  accent2: "#ff8a3d", accent2Dim: "#ff8a3d22", accent2Hover: "#e87530",
  purple: "#8b5cf6", purpleDim: "#8b5cf61f",
  red: "#ff4466", redDim: "#ff446622",
  yellow: "#f5a623", yellowDim: "#f5a62322",
  blue: "#4488ff", blueDim: "#4488ff22",
  text: "#e8eaf0", textMuted: "#94a3b8", textDim: "#64748b",
  sidebar: "#0F172A",
};

const NIGHT_BASE = { bg: "#020617", surface: "#0F172A", surfaceHigh: "#334155", border: "#1e293b", borderLight: "#334155", text: "#e8eaf0", textMuted: "#94a3b8", textDim: "#64748b", sidebar: "#0F172A" };
const DAY_BASE = { bg: "#f4f5f8", surface: "#ffffff", surfaceHigh: "#eef0f5", border: "#dde1ea", borderLight: "#c9cfdc", text: "#161a22", textMuted: "#5b6478", textDim: "#8a93a8", sidebar: "#ffffff" };
// Deeper, near-black base used by the "Terminal Black" theme — sits below NIGHT_BASE in brightness.
const TERMINAL_BASE = { bg: "#020617", surface: "#0c0e13", surfaceHigh: "#334155", border: "#1b1f2a", borderLight: "#334155", text: "#eef0f5", textMuted: "#717b95", textDim: "#454c61", sidebar: "#0F172A" };
// Base modeled on tradeset.app — near-black navy with a slightly darker sidebar than main content.
// Brand palette: background #020617, boxes/cards #0F172A, inputs/hover surfaces #334155.
const TRADESET_BASE = { bg: "#020617", surface: "#0F172A", surfaceHigh: "#334155", border: "#1e293b", borderLight: "#334155", text: "#f2f4f9", textMuted: "#94a3b8", textDim: "#64748b", sidebar: "#0F172A" };

const THEMES = {
  // Clone of tradeset.app's palette — near-black navy base, mint-green accent,
  // burnt-orange secondary. This is now the app's default look.
  "TradeSet": { base: TRADESET_BASE, accent: "#32D18D", accentHover: "#28b378", accent2: "#ff8a3d", accent2Hover: "#e87530" },
  "Original": { accent: "#1fd9a8", accentHover: "#16b88c", accent2: "#ff8a3d", accent2Hover: "#e87530" },
  "Apex Green": { accent: "#16d16a", accentHover: "#11a955", accent2: "#ff8a3d", accent2Hover: "#e87530" },
  "Brass Terminal": { accent: "#c4995f", accentHover: "#a87f49", accent2: "#ff8a3d", accent2Hover: "#e87530" },
  "Mint Glass": { accent: "#3fe0bd", accentHover: "#23c6a1", accent2: "#ff8a3d", accent2Hover: "#e87530" },
  "Ice Blade": { accent: "#a78bfa", accentHover: "#8d6ef0", accent2: "#ff8a3d", accent2Hover: "#e87530" },
  "Cobalt": { accent: "#4488ff", accentHover: "#2f6fe0", accent2: "#ff8a3d", accent2Hover: "#e87530" },
  // Deep near-black "fintech terminal" palette — green stays the primary accent
  // (P&L, equity curve, win stats) while accent2 is a burnt orange used for
  // secondary/behavioral widgets, matching the reference screenshot.
  "Terminal Black": { base: TERMINAL_BASE, accent: "#34d399", accentHover: "#1fb886", accent2: "#d97a3f", accent2Hover: "#bd672f" },
};

// Gradient wordmark style (blue → mint), matching tradeset.app's logo treatment.
// A function (not a static object) because C's colors are mutated by applyTheme() —
// this must be re-evaluated at render time to pick up the active theme's colors.
const gradientTextStyle = () => ({
  backgroundImage: `linear-gradient(90deg, ${C.blue}, ${C.purple}, ${C.accent2})`,
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
});

function applyTheme(themeName = "Original", mode = "night", transparency = 0, popupTransparency = 0) {
  const theme = THEMES[themeName] || THEMES["TradeSet"];
  const base = theme.base ? theme.base : (mode === "day" ? DAY_BASE : NIGHT_BASE);
  Object.assign(C, base, theme, { accentDim: theme.accent + "22", accent2Dim: theme.accent2 + "22" });
  // Interface Transparency (Settings → adjustable 0–90): 0 = fully solid
  // panels, 90 = nearly invisible. Cards and their sub-panels (surfaceHigh)
  // use this. Popups/modals and the sidebar use their own separate
  // "Popups & Sidebar Transparency" value below, so they can be tuned
  // independently from regular cards.
  const t = Math.max(0, Math.min(90, transparency));
  const pt = Math.max(0, Math.min(90, popupTransparency));
  const toAlpha = pct => Math.round((1 - Math.max(0, Math.min(95, pct)) / 100) * 255).toString(16).padStart(2, "0");
  C.surface = base.surface.slice(0, 7) + toAlpha(t);
  C.surfaceHigh = base.surfaceHigh.slice(0, 7) + toAlpha(t - 10);
  C.modalBg = base.surface.slice(0, 7) + toAlpha(pt);
  C.sidebar = base.sidebar.slice(0, 7) + toAlpha(pt - 15);
}

function buildGlobalCSS() {
  return `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%}
  body{
    background:
      radial-gradient(circle at 15% 10%, ${C.accent}12, transparent 42%),
      radial-gradient(circle at 85% 0%, ${C.blue}0e, transparent 46%),
      radial-gradient(circle at 50% 100%, ${C.accent2}0e, transparent 55%),
      ${C.bg};
    color:${C.text};font-family:'Inter',sans-serif;min-height:100vh;overflow:hidden;
  }
  /* Cards, modals, and the sidebar use semi-transparent surface colors so the
     background glow / watermark stays clearly visible underneath — no blur,
     just true transparency. */
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
  input,textarea,select{font-family:inherit}
  input[type="date"],input[type="time"]{min-width:0;max-width:100%}
  input[type="date"]::-webkit-calendar-picker-indicator,input[type="time"]::-webkit-calendar-picker-indicator{transform:scale(0.8);margin-left:2px;padding:0}
  input[type="date"]::-webkit-datetime-edit,input[type="time"]::-webkit-datetime-edit{padding:0}
  input[type="date"]::-webkit-datetime-edit-fields-wrapper,input[type="time"]::-webkit-datetime-edit-fields-wrapper{padding:0}
  button{cursor:pointer;font-family:inherit}
  .mono{font-family:'Inter',sans-serif}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes spin{to{transform:rotate(360deg)}}
  .fade-in{animation:fadeIn 0.2s ease forwards}

  /* ── Responsive: mobile topbar + sidebar drawer ───────────────────────── */
  .mobile-topbar{display:none}
  .desktop-header{display:flex}
  .sidebar-scrim{display:none}
  .calendar-scroll{overflow-x:visible}

  @media (max-width: 880px){
    [style*="grid-template-columns: repeat(4, 1fr)"]{grid-template-columns:repeat(2,1fr) !important}
    [style*="grid-template-columns: repeat(8, 1fr)"]{grid-template-columns:repeat(4,1fr) !important}
    [style*="grid-template-columns: repeat(3, 1fr)"]{grid-template-columns:repeat(2,1fr) !important}
    [style*="grid-template-columns: 1fr 1fr 1fr"]{grid-template-columns:repeat(2,1fr) !important}
    [style*="grid-template-columns: 1.6fr 1fr"]{grid-template-columns:1fr !important}
    [style*="grid-template-columns: 1.4fr 1fr"]{grid-template-columns:1fr !important}
    [style*="grid-template-columns: 1fr 1.2fr 1.2fr"]{grid-template-columns:1fr !important}
    [style*="grid-template-columns: 1.3fr 1fr"]{grid-template-columns:1fr !important}
    [style*="grid-template-columns: 1fr 1fr 1.1fr"]{grid-template-columns:1fr !important}
    [style*="grid-template-columns: 2fr 1fr 1fr auto"]{grid-template-columns:1fr !important}
    [style*="repeat(auto-fill, minmax(360px, 1fr))"]{grid-template-columns:1fr !important}
  }

  @media (max-width: 760px){
    .app-sidebar{position:fixed !important;top:0;left:0;z-index:500;transform:translateX(-100%);transition:transform 0.25s ease;box-shadow:0 0 40px #000a}
    .app-sidebar.open{transform:translateX(0)}
    .sidebar-close-btn{display:block !important}
    .mobile-topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid ${C.border};background:${C.sidebar};flex-shrink:0}
    .desktop-header{display:none}
    .sidebar-scrim{display:block;position:fixed;inset:0;background:#000a;z-index:490}
    .calendar-scroll{overflow-x:auto !important}
    [style*="padding: 28px"]{padding:16px !important}
    [style*="padding: 24px"]{padding:16px !important}
    h1{font-size:19px !important}
  }

  @media (max-width: 600px){
    [style*="grid-template-columns: repeat(2, 1fr)"]{grid-template-columns:1fr !important}
    [style*="grid-template-columns: repeat(4, 1fr)"]{grid-template-columns:1fr !important}
    [style*="grid-template-columns: repeat(3, 1fr)"]{grid-template-columns:1fr !important}
    [style*="grid-template-columns: 1fr 1fr"]{grid-template-columns:1fr !important}
    [style*="grid-template-columns: 1fr 1fr 1fr"]{grid-template-columns:1fr !important}
    [style*="grid-template-columns: repeat(7, 1fr)"]{grid-template-columns:repeat(3,1fr) !important}
    .calendar-scroll [style*="grid-template-columns: repeat(7, 1fr)"]{grid-template-columns:repeat(7,1fr) !important}
  }

  /* ── Privacy Mode: block printing (Print → Save as PDF is a common
     screenshot workaround). Only applied when the .privacy-print-lock
     class is present, i.e. the user has Privacy Mode + Block Printing on. ── */
  @media print{
    .privacy-print-lock{display:none !important}
  }
`;
}

// ─── OUTCOME COLORS ──────────────────────────────────────────────────────────
const outcomeColor = (outcome, pnl) => {
  if (outcome === "BE") return C.yellow;
  if (outcome === "Win" || pnl > 0) return C.accent;
  if (outcome === "Loss" || pnl < 0) return C.red;
  return C.textMuted;
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const fmt$ = (n) => { const a = Math.abs(n).toFixed(2); return n >= 0 ? `+$${a}` : `-$${a}`; };
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
const ACCOUNT_COLORS = [C.accent, C.yellow, C.blue, "#ff8844", "#cc44ff", "#44ccff", "#ff44cc"];

// ─── PLAN / FEATURE GATING ────────────────────────────────────────────────────
// Ace Basic (free) vs AcePlus ($10/mo). NOTE: this is client-side UI gating
// only — there's no backend/payment processor wired up yet, so it's easy to
// bypass via devtools. Fine for a prototype / trust-based rollout; swap the
// SET_PLAN dispatch for a real server-verified subscription check before
// charging real money.
const PLAN_NAME = { free: "Ace Basic", plus: "AcePlus" };
const FREE_LIMITS = { maxTrades: 40, maxAccounts: 1, maxSetups: 4, maxScreenshots: 1 };
const PLUS_ONLY_PAGES = { mynotes: "My Notes", analytics: "Analytics", emotions: "Edge Score", finances: "Prop Firms", livecapital: "Live Capital", myrecord: "My Record" };
const PLUS_ONLY_THEMES = ["TradeSet"]; // themes available on Ace Basic; everything else is AcePlus
// ── PROMO MODE ──────────────────────────────────────────────────────────────
// All AcePlus-gated features are temporarily unlocked for every user while we
// run a free promo. To restore normal paywalling later, just flip this flag
// back to false (or swap the isPlus body back to `state.plan === "plus"`).
const PROMO_ALL_FEATURES_FREE = true;
const isPlus = (state) => PROMO_ALL_FEATURES_FREE ? true : state.plan === "plus";
const canAddTrade = (state) => isPlus(state) || state.trades.length < FREE_LIMITS.maxTrades;
const canAddAccount = (state) => isPlus(state) || state.accounts.length < FREE_LIMITS.maxAccounts;
const canAddSetup = (state) => isPlus(state) || state.strategies.length < FREE_LIMITS.maxSetups;
// Opens the Add Trade modal, or the upgrade paywall if the free trade cap is hit.
const openAddTrade = (state, dispatch, trade) => {
  if (trade || canAddTrade(state)) dispatch({ type: "OPEN_MODAL", modal: trade ? { type: "add_trade", trade } : "add_trade" });
  else dispatch({ type: "OPEN_MODAL", modal: "upgrade" });
};

const PlusBadge = ({ small }) => (
  <span style={{ background: `linear-gradient(90deg, ${C.blue}, ${C.purple})`, color: "#fff", fontSize: small ? 8 : 9, fontWeight: 800, letterSpacing: 0.5, padding: small ? "1px 6px" : "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>✨ PLUS</span>
);

// ── PROMO ANNOUNCEMENT BANNER ─────────────────────────────────────────────
// Sits pinned at the very top of the app (above the header/sidebar) for as
// long as PROMO_ALL_FEATURES_FREE is true, so nobody misses that today's free
// access is temporary. Intentionally has no dismiss button — it's meant to
// stay put and keep reminding people, not disappear after one click.
function PlanAnnouncementBanner() {
  if (!PROMO_ALL_FEATURES_FREE) return null;
  return (
    <div style={{
      flexShrink: 0, width: "100%", position: "relative", zIndex: 600,
      background: `linear-gradient(90deg, ${C.blue}, ${C.purple}, ${C.accent2})`,
      color: "#fff", padding: "10px 16px",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      flexWrap: "wrap", textAlign: "center", boxShadow: "0 2px 14px #0007",
    }}>
      <span style={{ fontSize: 15, flexShrink: 0 }}>✨</span>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.2 }}>
        Every AcePlus feature is FREE right now.
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 500, opacity: 0.95 }}>
        Some features will become paid soon. Enjoy full access while it lasts!
      </span>
    </div>
  );
}

// Full-page paywall shown in place of a locked page's content.
function UpgradeGate({ title, desc, dispatch }) {
  return (
    <div className="fade-in" style={{ height: "100%", overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
      <div style={{ width: "100%", maxWidth: 460, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: 36, textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: C.purpleDim, color: C.purple, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 18px" }}>🔒</div>
        <div style={{ marginBottom: 10 }}><PlusBadge /></div>
        <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 24, lineHeight: 1.6 }}>{desc}</div>
        <Btn variant="gradient" onClick={() => dispatch({ type: "OPEN_MODAL", modal: "upgrade" })} style={{ width: "100%", justifyContent: "center" }}>✨ Upgrade to AcePlus — $10/mo</Btn>
      </div>
    </div>
  );
}

// Small inline lock strip used for things like Settings sub-sections (Sessions,
// Emotions, Export/Import) rather than a whole-page gate.
function InlineUpgradeLock({ text, dispatch }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.purpleDim, border: `1px solid ${C.purple}44`, borderRadius: 10, padding: "12px 14px" }}>
      <span style={{ fontSize: 16 }}>🔒</span>
      <div style={{ flex: 1, fontSize: 12.5, color: C.textMuted, lineHeight: 1.5 }}>{text}</div>
      <Btn small variant="gradient" onClick={() => dispatch({ type: "OPEN_MODAL", modal: "upgrade" })} style={{ flexShrink: 0 }}>Upgrade</Btn>
    </div>
  );
}

// Pricing / upgrade modal — swap the "Activate" button for a real Stripe
// Checkout redirect + webhook-driven SET_PLAN once billing is wired up.
function WelcomeModal({ state, dispatch }) {
  const name = state.currentUser?.name || state.currentUser?.email || "Trader";
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && dispatch({ type: "CLOSE_MODAL" })}>
      <div className="fade-in" style={{ background: C.modalBg, border: `1px solid ${C.borderLight}`, borderRadius: 18, padding: 32, width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 14, color: C.accent }}>♤</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.4, marginBottom: 10 }}>
          Welcome {name}, 8 Figures Trader.
        </h2>
        <div style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.6, marginBottom: 24 }}>
          Another Day To Follow The Plan, Be Patient and Disciplined
        </div>
        <Btn variant="primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => dispatch({ type: "CLOSE_MODAL" })}>Let's Get It</Btn>
      </div>
    </div>
  );
}

function UpgradeModal({ state, dispatch }) {
  const plus = isPlus(state);
  const FEATURES = [
    ["Trades", "Up to 40", "Unlimited"],
    ["Accounts", "1", "Unlimited"],
    ["Playbook setups", "Up to 4", "Unlimited"],
    ["Custom Sessions & Emotions", "—", "✓"],
    ["Analytics", "—", "✓"],
    ["Edge Score (behavioral)", "—", "✓"],
    ["Prop Firm Tracker", "—", "✓"],
    ["Live Capital Tracker", "—", "✓"],
    ["Import / Export data", "—", "✓"],
    ["Themes & watermark", "Default only", "All themes + custom logo"],
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && dispatch({ type: "CLOSE_MODAL" })}>
      <div className="fade-in" style={{ background: C.modalBg, border: `1px solid ${C.borderLight}`, borderRadius: 18, padding: 28, width: "100%", maxWidth: 620, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>Upgrade to AcePlus</h2>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>Unlock the full trading journal.</div>
          </div>
          <button onClick={() => dispatch({ type: "CLOSE_MODAL" })} style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 9, width: 32, height: 32, color: C.textMuted, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, margin: "20px 0" }}>
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Ace Basic</div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 14 }}>Free, forever</div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 800 }}>$0</div>
          </div>
          <div style={{ background: `linear-gradient(160deg, ${C.blue}18, ${C.purple}18)`, border: `1px solid ${C.purple}55`, borderRadius: 14, padding: 20, position: "relative" }}>
            <div style={{ position: "absolute", top: -10, right: 16 }}><PlusBadge /></div>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>AcePlus</div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 14 }}>Full access, cancel anytime</div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 800 }}>$10<span style={{ fontSize: 13, color: C.textDim, fontWeight: 600 }}>/mo</span></div>
          </div>
        </div>
        <div style={{ overflowX: "auto", marginBottom: 22 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Feature", "Ace Basic", "AcePlus"].map((h, i) => <th key={h} style={{ textAlign: i === 0 ? "left" : "center", padding: "8px 10px", fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {FEATURES.map(([f, basic, plusVal]) => (
                <tr key={f} style={{ borderBottom: `1px solid ${C.border}20` }}>
                  <td style={{ padding: "9px 10px", fontSize: 13 }}>{f}</td>
                  <td style={{ padding: "9px 10px", fontSize: 12.5, textAlign: "center", color: C.textMuted }}>{basic}</td>
                  <td style={{ padding: "9px 10px", fontSize: 12.5, textAlign: "center", color: C.accent, fontWeight: 700 }}>{plusVal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plus ? (
          <>
            <div style={{ background: C.accentDim, border: `1px solid ${C.accent}44`, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: C.accent, marginBottom: 12 }}>✓ You're already on AcePlus. Thanks for supporting ACEZELLA!</div>
            <Btn variant="ghost" onClick={() => dispatch({ type: "SET_PLAN", plan: "free" })} style={{ width: "100%", justifyContent: "center" }}>Downgrade to Ace Basic</Btn>
          </>
        ) : (
          <>
            <Btn variant="gradient" onClick={() => dispatch({ type: "SET_PLAN", plan: "plus" })} style={{ width: "100%", justifyContent: "center", padding: "14px 0", fontSize: 15 }}>✨ Activate AcePlus</Btn>
            <div style={{ fontSize: 11, color: C.textDim, textAlign: "center", marginTop: 10 }}>Demo mode — no card charged. Wire this button to real billing (e.g. Stripe Checkout) before launch.</div>
          </>
        )}
      </div>
    </div>
  );
}

function calcStats(trades) {
  if (!trades.length) return { netPnl: 0, winRate: 0, profitFactor: 0, avgWin: 0, avgLoss: 0, wins: 0, losses: 0, be: 0, totalWins: 0, totalLosses: 0, expectancy: 0, totalPips: 0 };
  const wins = trades.filter(t => t.outcome === "Win" || (t.outcome !== "Loss" && t.outcome !== "BE" && t.pnl > 0));
  const losses = trades.filter(t => t.outcome === "Loss" || (t.outcome !== "Win" && t.outcome !== "BE" && t.pnl < 0));
  const be = trades.filter(t => t.outcome === "BE");
  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const totalWins = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLosses = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const avgWin = wins.length ? totalWins / wins.length : 0;
  const avgLoss = losses.length ? totalLosses / losses.length : 0;
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : wins.length > 0 ? 99 : 0;
  const decidedTrades = wins.length + losses.length;
  const winRate = decidedTrades ? (wins.length / decidedTrades) * 100 : 0;
  const expectancy = avgWin * (winRate / 100) - avgLoss * (1 - winRate / 100);
  const totalPips = trades.reduce((s, t) => s + (t.pips || 0), 0);
  return { netPnl, winRate, profitFactor, avgWin, avgLoss, wins: wins.length, losses: losses.length, be: be.length, totalWins, totalLosses: -totalLosses, expectancy, totalPips };
}

// ─── LIVE CAPITAL HELPERS ─────────────────────────────────────────────────────
function calcLiveCapitalStats(state) {
  const lc = state.liveCapital || {};
  const txs = state.capitalTransactions || [];
  const linkedAccount = lc.linkedAccount || "all";
  const trades = (state.trades || []).filter(t => linkedAccount === "all" || t.account === linkedAccount);
  const completed = txs.filter(t => t.status !== "pending" && !t.isStartingBalance);
  const deposits = completed.filter(t => t.type === "Deposit").reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const withdrawals = completed.filter(t => t.type === "Withdrawal").reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const fees = completed.filter(t => t.type === "Fee").reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const netContributions = deposits - withdrawals - fees;
  const realizedTradingProfit = trades.reduce((s, t) => s + t.pnl, 0);
  const startingCapital = lc.startingCapital || 0;
  const currentLiveCapital = startingCapital + netContributions + realizedTradingProfit;
  const netAccountChange = currentLiveCapital - startingCapital;
  const netAccountChangePct = startingCapital ? (netAccountChange / startingCapital) * 100 : 0;
  const realizedPct = startingCapital ? (realizedTradingProfit / startingCapital) * 100 : 0;

  // Chronological equity curve for drawdown tracking
  const events = [
    { date: lc.startingDate || "2026-01-01", delta: startingCapital, organicDelta: 0, type: "Starting Balance", note: "Starting live capital balance", account: "Live Account", amount: startingCapital },
    ...completed.map(t => ({ date: t.date, delta: t.type === "Withdrawal" || t.type === "Fee" ? -(parseFloat(t.amount) || 0) : (parseFloat(t.amount) || 0), organicDelta: 0, type: t.type, note: t.note, account: t.account || "Live Account", amount: parseFloat(t.amount) || 0 })),
    ...trades.map(t => ({ date: t.date.slice(0, 10), delta: t.pnl, organicDelta: t.pnl, type: "Trade", note: `${t.symbol} ${t.direction}`, account: "Trading", amount: t.pnl })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = 0, organicRunning = startingCapital, peak = 0, maxDD = 0;
  const curvePoints = [];
  events.forEach(e => {
    running += e.delta; organicRunning += e.organicDelta; if (running > peak) peak = running;
    const dd = peak - running; if (dd > maxDD) maxDD = dd;
    curvePoints.push({ date: e.date, value: running, organicValue: organicRunning, type: e.type, note: e.note, account: e.account, amount: e.amount });
  });
  const currentDrawdownDollar = Math.max(0, peak - running);
  const currentDrawdownPct = peak ? (currentDrawdownDollar / peak) * 100 : 0;
  const maxDrawdownLimit = lc.maxDrawdownLimit || 0;
  const availableRiskBuffer = Math.max(0, maxDrawdownLimit - currentDrawdownDollar);

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const todayPnl = trades.filter(t => t.date.slice(0, 10) === todayKey).reduce((s, t) => s + t.pnl, 0);
  const dailyLossUsedPct = lc.dailyLossLimit ? Math.min(100, Math.max(0, (-todayPnl / lc.dailyLossLimit) * 100)) : 0;
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const weekPnl = trades.filter(t => new Date(t.date) >= weekStart).reduce((s, t) => s + t.pnl, 0);
  const weeklyLossUsedPct = lc.weeklyLossLimit ? Math.min(100, Math.max(0, (-weekPnl / lc.weeklyLossLimit) * 100)) : 0;
  const recoveryRequiredPct = running > 0 && currentDrawdownDollar > 0 ? (currentDrawdownDollar / running) * 100 : 0;
  const ddRatio = maxDrawdownLimit ? maxDD / maxDrawdownLimit : 0;
  const capitalVolatility = ddRatio < 0.25 ? "Low" : ddRatio < 0.6 ? "Medium" : "High";

  const profitGoal = lc.profitGoal || 0;
  const profitTargetPct = profitGoal ? Math.min(100, Math.max(0, (currentLiveCapital / profitGoal) * 100)) : 0;
  const profitTargetRemaining = Math.max(0, profitGoal - currentLiveCapital);

  const organicTradingGrowth = realizedTradingProfit;
  const contributionAssistedGrowth = organicTradingGrowth + netContributions;

  const stats = calcStats(trades);
  const bestTrade = trades.length ? [...trades].sort((a, b) => b.pnl - a.pnl)[0] : null;
  const linkedTrades = [...trades].sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    startingCapital, currentLiveCapital, netAccountChange, netAccountChangePct, realizedTradingProfit, realizedPct,
    currentDrawdownDollar, currentDrawdownPct, maxDD, availableRiskBuffer, dailyLossUsedPct, weeklyLossUsedPct,
    recoveryRequiredPct, capitalVolatility, profitGoal, profitTargetPct, profitTargetRemaining, netContributions,
    organicTradingGrowth, contributionAssistedGrowth, deposits, withdrawals, fees, curvePoints, tradeStats: stats, bestTrade,
    linkedAccount, linkedTrades,
  };
}

function buildLiveCapitalMonthly(state) {
  const lc = state.liveCapital || {};
  const txs = (state.capitalTransactions || []).filter(t => t.status !== "pending" && !t.isStartingBalance);
  const linkedAccount = lc.linkedAccount || "all";
  const trades = (state.trades || []).filter(t => linkedAccount === "all" || t.account === linkedAccount);
  const monthMap = {};
  const ensure = k => (monthMap[k] = monthMap[k] || { tradingPnl: 0, contributions: 0, withdrawals: 0 });
  trades.forEach(t => { ensure(monthKey(t.date)).tradingPnl += t.pnl; });
  txs.forEach(t => {
    const bucket = ensure(monthKey(t.date));
    if (t.type === "Deposit") bucket.contributions += parseFloat(t.amount) || 0;
    else bucket.withdrawals += parseFloat(t.amount) || 0;
  });
  const startKey = monthKey(lc.startingDate || "2026-01-01");
  if (!monthMap[startKey]) monthMap[startKey] = { tradingPnl: 0, contributions: 0, withdrawals: 0 };
  const keys = Object.keys(monthMap).sort();
  let running = lc.startingCapital || 0;
  return keys.map(k => {
    const m = monthMap[k];
    const netGrowth = m.tradingPnl + m.contributions - m.withdrawals;
    running += netGrowth;
    return { key: k, label: monthLabel(k), tradingPnl: m.tradingPnl, contributions: m.contributions, withdrawals: m.withdrawals, netGrowth, endingBalance: running };
  });
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = "acezella_v3";
function loadData() { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function saveData(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} }

function genDemoData() {
  const symbols = ["NQ", "ES", "GC", "CL", "MNQ", "MES"];
  const setups = ["Celery", "Breakout", "Onion", "Fade", "Inverted Celery"];
  const sessions = ["Asian", "London", "New York"];
  const moods = ["Focus", "Fear", "Greed", "Anger"];
  const outcomes = ["Win", "Win", "Win", "Loss", "Loss", "BE"];
  const timeframes = ["15 min", "30 min", "1 hr"];
  const trendBiases = ["With Trend", "Counter"];
  const risks = ["Low Risk", "Normal Risk", "High Risk"];
  const exitBehaviors = ["Planned", "Early", "Late"];
  const postTradeStates = ["Detached", "Neutral", "Attached"];
  const now = new Date();
  return Array.from({ length: 40 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - Math.floor(Math.random() * 50));
    const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
    const pnl = outcome === "Win" ? +(Math.random() * 280 + 15).toFixed(2) : outcome === "Loss" ? -(Math.random() * 180 + 10).toFixed(2) : 0;
    const pips = outcome === "Win" ? +(Math.random() * 30 + 2).toFixed(1) : outcome === "Loss" ? -(Math.random() * 20 + 1).toFixed(1) : 0;
    const openH = 9 + Math.floor(Math.random() * 6), openM = Math.floor(Math.random() * 60);
    const durMin = 5 + Math.floor(Math.random() * 55);
    const openDate = new Date(2000, 0, 1, openH, openM), closeDate = new Date(openDate.getTime() + durMin * 60000);
    const pad = n => String(n).padStart(2, "0");
    return {
      id: `t${i}`, date: d.toISOString(),
      symbol: symbols[Math.floor(Math.random() * symbols.length)],
      direction: Math.random() > 0.5 ? "Long" : "Short",
      entry: +(Math.random() * 100 + 4000).toFixed(2), exit: +(Math.random() * 100 + 4000).toFixed(2),
      size: Math.floor(Math.random() * 3) + 1, pnl, pips, outcome,
      setup: setups[Math.floor(Math.random() * setups.length)],
      session: sessions[Math.floor(Math.random() * sessions.length)],
      mood: moods[Math.floor(Math.random() * moods.length)],
      timeframe: timeframes[Math.floor(Math.random() * timeframes.length)],
      trendBias: trendBiases[Math.floor(Math.random() * trendBiases.length)],
      risk: risks[Math.floor(Math.random() * risks.length)],
      openTime: `${pad(openDate.getHours())}:${pad(openDate.getMinutes())}`,
      closeTime: `${pad(closeDate.getHours())}:${pad(closeDate.getMinutes())}`,
      fees: +(Math.random() * 6).toFixed(2),
      exitBehavior: exitBehaviors[Math.floor(Math.random() * exitBehaviors.length)],
      postTradeState: postTradeStates[Math.floor(Math.random() * postTradeStates.length)],
      notes: outcome === "Win" ? "Followed the plan, patience paid off." : outcome === "Loss" ? "Jumped in early, need confirmation." : "Got stopped at entry, no loss no gain.",
      screenshots: [], account: "acc1", tags: [],
    };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function defaultState() {
  return {
    users: [{ id: "u1", email: "demo@acezella.io", password: "demo123", name: "Ace Trader" }],
    currentUser: null, modal: null, activeAccount: "all",
    trades: genDemoData(),
    accounts: [
      { id: "acc1", name: "ACEZELLA", type: "Funded", color: C.accent },
    ],
    strategies: [
      { id: "s1", name: "Celery", color: C.accent, description: "Breakout with an additional confirmation candlestick", rules: ["Confirm bias on higher TF", "Wait for confirmation candle", "Enter on retest"] },
      { id: "s2", name: "Breakout", color: C.blue, description: "Price moves past a support or resistance level. This typically happens after the price breaks the established structure of a range market, signaling the start of a new trend", rules: ["Identify the range", "Wait for a clean break", "Enter on retest or momentum"] },
      { id: "s3", name: "Onion", color: C.yellow, description: "Buy or sell at pullback level", rules: ["Identify the trend", "Wait for pullback to key level", "Enter with confirmation"] },
      { id: "s4", name: "Fade", color: C.red, description: "Buy or sell at pullback level", rules: ["Identify overextension", "Wait for reversal signal", "Enter against the move"] },
      { id: "s5", name: "Inverted Celery", color: "#9b6bff", description: "Buy or sell at pullback level", rules: ["Confirm bias on higher TF", "Wait for confirmation candle", "Enter on retest"] },
    ],
    sessions: ["Asian", "London", "New York"],
    emotions: ["Focus", "Fear", "Greed", "Anger"],
    referenceListsSchemaVersion: REFERENCE_LISTS_SCHEMA_VERSION,
    accountsSchemaVersion: ACCOUNTS_SCHEMA_VERSION,
    timeframes: ["15 min", "30 min", "1 hr", "4 hr"],
    riskLevels: ["Low Risk", "Normal Risk", "High Risk"],
    trendBiases: ["With Trend", "Counter"],
    weeklyNotes: {}, expenses: [], journalNotes: {},
    propFirms: [
      { id: "pf1", name: "Top One Futures", accountSize: 50000, status: "Live", evaluation: 99, fundedFee: 499, subscription: 19, platform: 9, other: 15, dateJoined: "2025-09-01" },
      { id: "pf2", name: "Top Step Futures", accountSize: 100000, status: "Breached", evaluation: 129, fundedFee: 699, subscription: 29, platform: 19, other: 35, dateJoined: "2025-12-15" },
      { id: "pf3", name: "Apex Futures", accountSize: 50000, status: "Live", evaluation: 109, fundedFee: 449, subscription: 14, platform: 15, other: 0, dateJoined: "2025-10-05" },
      { id: "pf4", name: "Prop Firm Capital", accountSize: 150000, status: "Live", evaluation: 119, fundedFee: 599, subscription: 24, platform: 12, other: 50, dateJoined: "2025-11-01" },
      { id: "pf5", name: "Trading Elite", accountSize: 25000, status: "Breached", evaluation: 89, fundedFee: 399, subscription: 9, platform: 9, other: 20, dateJoined: "2025-09-01" },
    ],
    payouts: [
      { id: "fp1", firmId: "pf1", gross: 1350, splitPct: 80, date: "2025-10-27", certificateUrl: "", notes: "First funded payout!" },
      { id: "fp2", firmId: "pf1", gross: 2100, splitPct: 80, date: "2025-12-15", certificateUrl: "", notes: "Second month payout" },
      { id: "fp3", firmId: "pf3", gross: 875, splitPct: 75, date: "2025-11-20", certificateUrl: "", notes: "First payout from Apex" },
      { id: "fp4", firmId: "pf3", gross: 1500, splitPct: 75, date: "2026-01-10", certificateUrl: "", notes: "Strong January performance" },
      { id: "fp5", firmId: "pf4", gross: 950, splitPct: 65, date: "2025-12-01", certificateUrl: "", notes: "December payout" },
      { id: "fp6", firmId: "pf1", gross: 1800, splitPct: 80, date: "2026-01-28", certificateUrl: "", notes: "January payout - best month yet" },
    ],
    siteName: "ACEZELLA",
    plan: "free", // "free" (Ace Basic) | "plus" (AcePlus $10/mo)
    theme: { name: "TradeSet", mode: "night" },
    themeSchemaVersion: THEME_SCHEMA_VERSION,
    uiTransparency: 0,
    popupTransparency: 0,
    watermark: { dataUrl: null, opacity: 20 },
    privacy: { enabled: false, blurOnBlur: true, disableRightClick: true, disableCopy: true, watermarkOverlay: true, blockPrint: true },
    liveCapital: {
      startingCapital: 25000,
      startingDate: "2026-01-01",
      profitGoal: 100000,
      linkedAccount: "all",
      contribution: { amount: 300, frequency: "Monthly", day: 14, startDate: "2026-02-14", autoAdd: true },
      withdrawal: { amount: 100, frequency: "Monthly", day: 15, startDate: "2026-04-15", autoAdd: true },
      dailyLossLimit: 750, weeklyLossLimit: 1800, maxDrawdownLimit: 2500, softWarningThreshold: 80,
      growthStyle: "Balanced", accountPurpose: "Growth Account",
    },
    capitalTransactions: [
      { id: "ct1", date: "2026-01-01", type: "Deposit", amount: 25000, account: "Live Account", note: "Starting live capital balance", status: "completed", isStartingBalance: true },
      { id: "ct2", date: "2026-02-14", type: "Deposit", amount: 300, account: "Live Account", note: "Scheduled contribution managed by Capital Rules & Targets", status: "completed" },
      { id: "ct3", date: "2026-03-14", type: "Deposit", amount: 300, account: "Live Account", note: "Scheduled contribution managed by Capital Rules & Targets", status: "completed" },
      { id: "ct4", date: "2026-04-15", type: "Withdrawal", amount: 100, account: "Live Account", note: "Scheduled withdrawal managed by Capital Rules & Targets", status: "completed" },
      { id: "ct5", date: "2026-05-01", type: "Fee", amount: 49, account: "Live Account", note: "Platform fee", status: "completed" },
      { id: "ct6", date: "2026-07-14", type: "Deposit", amount: 300, account: "Live Account", note: "Scheduled (Pending) Deposit: Managed by Capital Rules & Targets", status: "pending" },
      { id: "ct7", date: "2026-07-15", type: "Withdrawal", amount: 100, account: "Live Account", note: "Scheduled (Pending) Withdrawal: Managed by Capital Rules & Targets", status: "pending" },
    ],
  };
}

// Bump this whenever the *default* visual theme changes, so returning users
// (who have a saved theme/transparency in localStorage) get migrated onto
// the new look automatically instead of staying stuck on an older default.
// Their trades, accounts, notes, etc. are untouched — only appearance resets.
const THEME_SCHEMA_VERSION = 2;

// Bump this whenever the *default* sessions/emotions lists (or the seeded
// demo trades) change, so returning users on an older reference-list
// version get migrated onto the new curated lists automatically. A user's
// actually-logged trades are never touched — only a pristine, untouched
// demo dataset (recognized by its short sequential ids, e.g. "t0", "t1" —
// real trades get a timestamp id like "t1751462400123") gets refreshed.
const REFERENCE_LISTS_SCHEMA_VERSION = 3;

// Bump this whenever the *default* accounts list changes, so returning users
// still sitting on the old two-account "Pipstone 100K Funded / Pipstone BOGO"
// demo default get migrated onto the single "ACEZELLA" account automatically.
// Any trades logged against the old second account ("acc2") are remapped
// onto "acc1" so nothing gets silently hidden or deleted.
const ACCOUNTS_SCHEMA_VERSION = 2;

function initState() {
  const s = loadData();
  const defaults = defaultState();
  if (s) {
    const needsThemeMigration = s.themeSchemaVersion !== THEME_SCHEMA_VERSION;
    const needsListMigration = s.referenceListsSchemaVersion !== REFERENCE_LISTS_SCHEMA_VERSION;
    const needsAccountMigration = s.accountsSchemaVersion !== ACCOUNTS_SCHEMA_VERSION;
    const tradesArePristineDemo = (s.trades || []).length > 0 && s.trades.every(t => /^t\d{1,3}$/.test(t.id));
    let migratedTrades = needsListMigration && tradesArePristineDemo ? defaults.trades : s.trades;
    if (needsAccountMigration) {
      // Old default had a second account ("acc2" — "Pipstone BOGO"); fold any
      // trades logged against it into the single remaining default account.
      migratedTrades = (migratedTrades || []).map(t => t.account === "acc2" ? { ...t, account: "acc1" } : t);
    }
    return {
      ...defaults, ...s,
      theme: needsThemeMigration ? defaults.theme : { ...defaults.theme, ...s.theme },
      uiTransparency: needsThemeMigration ? defaults.uiTransparency : (s.uiTransparency ?? defaults.uiTransparency),
      popupTransparency: needsThemeMigration ? defaults.popupTransparency : (s.popupTransparency ?? defaults.popupTransparency),
      themeSchemaVersion: THEME_SCHEMA_VERSION,
      sessions: needsListMigration ? defaults.sessions : (s.sessions && s.sessions.length ? s.sessions : defaults.sessions),
      emotions: needsListMigration ? defaults.emotions : (s.emotions && s.emotions.length ? s.emotions : defaults.emotions),
      trades: migratedTrades,
      referenceListsSchemaVersion: REFERENCE_LISTS_SCHEMA_VERSION,
      accounts: needsAccountMigration ? defaults.accounts : (s.accounts && s.accounts.length ? s.accounts : defaults.accounts),
      accountsSchemaVersion: ACCOUNTS_SCHEMA_VERSION,
      watermark: { ...defaults.watermark, ...s.watermark },
      privacy: { ...defaults.privacy, ...s.privacy },
      propFirms: s.propFirms && s.propFirms.length ? s.propFirms : defaults.propFirms,
      liveCapital: { ...defaults.liveCapital, ...s.liveCapital, contribution: { ...defaults.liveCapital.contribution, ...s.liveCapital?.contribution }, withdrawal: { ...defaults.liveCapital.withdrawal, ...s.liveCapital?.withdrawal } },
      capitalTransactions: s.capitalTransactions && s.capitalTransactions.length ? s.capitalTransactions : defaults.capitalTransactions,
    };
  }
  return defaults;
}

function reducer(state, action) {
  let next = state;
  switch (action.type) {
    case "LOGIN": next = { ...state, currentUser: action.user, modal: "welcome" }; break;
    case "LOGOUT": next = { ...state, currentUser: null }; break;
    case "REGISTER": next = { ...state, users: [...state.users, action.user], currentUser: action.user, modal: "welcome" }; break;
    case "SET_ACTIVE_ACCOUNT": next = { ...state, activeAccount: action.id }; break;
    case "ADD_TRADE": next = { ...state, trades: [action.trade, ...state.trades] }; break;
    case "DELETE_TRADE": next = { ...state, trades: state.trades.filter(t => t.id !== action.id) }; break;
    case "UPDATE_TRADE": next = { ...state, trades: state.trades.map(t => t.id === action.id ? { ...t, ...action.data } : t) }; break;
    case "ADD_ACCOUNT": next = { ...state, accounts: [...state.accounts, action.account] }; break;
    case "DELETE_ACCOUNT": next = { ...state, accounts: state.accounts.filter(a => a.id !== action.id), trades: state.trades.filter(t => t.account !== action.id) }; break;
    case "ADD_STRATEGY": next = { ...state, strategies: [...state.strategies, action.strategy] }; break;
    case "DELETE_STRATEGY": next = { ...state, strategies: state.strategies.filter(s => s.id !== action.id) }; break;
    case "ADD_SESSION": next = { ...state, sessions: [...state.sessions, action.name] }; break;
    case "DELETE_SESSION": next = { ...state, sessions: state.sessions.filter(s => s !== action.name) }; break;
    case "ADD_EMOTION": next = { ...state, emotions: [...state.emotions, action.name] }; break;
    case "DELETE_EMOTION": next = { ...state, emotions: state.emotions.filter(e => e !== action.name) }; break;
    case "SET_WEEKLY_NOTE": next = { ...state, weeklyNotes: { ...state.weeklyNotes, [action.key]: action.note } }; break;
    case "SET_JOURNAL_FIELD": next = { ...state, journalNotes: { ...state.journalNotes, [action.date]: { ...(state.journalNotes?.[action.date] || {}), [action.field]: action.value } } }; break;
    case "DELETE_JOURNAL_FIELD": { const day = { ...(state.journalNotes?.[action.date] || {}) }; delete day[action.field]; next = { ...state, journalNotes: { ...state.journalNotes, [action.date]: day } }; break; }
    case "DELETE_JOURNAL_DAY": { const jn = { ...state.journalNotes }; delete jn[action.date]; next = { ...state, journalNotes: jn }; break; }
    case "ADD_PAYOUT": next = { ...state, payouts: [...state.payouts, action.payout] }; break;
    case "UPDATE_PAYOUT": next = { ...state, payouts: state.payouts.map(p => p.id === action.id ? { ...p, ...action.data } : p) }; break;
    case "ADD_EXPENSE": next = { ...state, expenses: [...state.expenses, action.expense] }; break;
    case "DELETE_PAYOUT": next = { ...state, payouts: state.payouts.filter(p => p.id !== action.id) }; break;
    case "DELETE_EXPENSE": next = { ...state, expenses: state.expenses.filter(e => e.id !== action.id) }; break;
    case "ADD_PROP_FIRM": next = { ...state, propFirms: [...(state.propFirms || []), action.firm] }; break;
    case "UPDATE_PROP_FIRM": next = { ...state, propFirms: (state.propFirms || []).map(f => f.id === action.id ? { ...f, ...action.data } : f) }; break;
    case "DELETE_PROP_FIRM": next = { ...state, propFirms: (state.propFirms || []).filter(f => f.id !== action.id), payouts: state.payouts.filter(p => p.firmId !== action.id) }; break;
    case "OPEN_MODAL": next = { ...state, modal: action.modal }; break;
    case "CLOSE_MODAL": next = { ...state, modal: null }; break;
    case "IMPORT_DATA": next = { ...action.data, currentUser: state.currentUser, modal: null }; break;
    case "SET_THEME": next = { ...state, theme: { ...state.theme, ...action.theme } }; break;
    case "SET_TRANSPARENCY": next = { ...state, uiTransparency: action.value }; break;
    case "SET_POPUP_TRANSPARENCY": next = { ...state, popupTransparency: action.value }; break;
    case "SET_SITE_NAME": next = { ...state, siteName: action.name }; break;
    case "SET_PLAN": next = { ...state, plan: action.plan, modal: null }; break;
    case "SET_WATERMARK": next = { ...state, watermark: { ...state.watermark, ...action.watermark } }; break;
    case "SET_PRIVACY": next = { ...state, privacy: { ...state.privacy, ...action.data } }; break;
    case "SET_LIVE_CAPITAL": next = { ...state, liveCapital: { ...state.liveCapital, ...action.data } }; break;
    case "ADD_CAPITAL_TX": next = { ...state, capitalTransactions: [action.tx, ...(state.capitalTransactions || [])] }; break;
    case "UPDATE_CAPITAL_TX": next = { ...state, capitalTransactions: (state.capitalTransactions || []).map(t => t.id === action.id ? { ...t, ...action.data } : t) }; break;
    case "DELETE_CAPITAL_TX": next = { ...state, capitalTransactions: (state.capitalTransactions || []).filter(t => t.id !== action.id) }; break;
    default: return state;
  }
  saveData(next);
  return next;
}

// ─── PRIMITIVE UI ─────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant = "primary", small, style = {}, disabled }) => {
  const base = { display: "inline-flex", alignItems: "center", gap: 6, padding: small ? "7px 16px" : "11px 22px", borderRadius: 10, fontSize: small ? 12 : 14, fontWeight: 700, border: "none", transition: "all 0.15s", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 };
  const variants = { primary: { background: C.accent, color: "#000" }, gradient: { background: `linear-gradient(90deg, ${C.blue}, ${C.purple}, ${C.accent2})`, color: "#fff" }, gradient2: { background: `linear-gradient(90deg, ${C.blue}, ${C.purple}, ${C.accent2})`, color: "#fff" }, ghost: { background: "transparent", color: C.textMuted, border: `1px solid ${C.border}` }, danger: { background: C.redDim, color: C.red, border: `1px solid ${C.red}40` }, success: { background: C.accentDim, color: C.accent, border: `1px solid ${C.accent}40` }, warn: { background: C.yellowDim, color: C.yellow, border: `1px solid ${C.yellow}40` }, accent2: { background: C.accent2, color: "#000" } };
  return <button onClick={disabled ? null : onClick} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
};

const Inp = ({ label, value, onChange, type = "text", placeholder, style = {}, full }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, ...(full ? { gridColumn: "1/-1" } : {}) }}>
    {label && <label style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{label}</label>}
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "10px 14px", fontSize: 14, outline: "none", ...style }}
      onFocus={e => e.target.style.borderColor = C.accent} onBlur={e => e.target.style.borderColor = C.border} />
  </div>
);

const Sel = ({ label, value, onChange, options, style = {} }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    {label && <label style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{label}</label>}
    <select value={value} onChange={e => onChange(e.target.value)} style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "10px 14px", fontSize: 14, outline: "none", cursor: "pointer", ...style }}>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  </div>
);

const Card = ({ children, style = {}, onClick }) => (
  <div onClick={onClick} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, transition: "border-color 0.15s", cursor: onClick ? "pointer" : "default", ...style }}
    onMouseEnter={onClick ? e => e.currentTarget.style.borderColor = C.borderLight : null}
    onMouseLeave={onClick ? e => e.currentTarget.style.borderColor = C.border : null}>
    {children}
  </div>
);

const Badge = ({ children, color = C.accent }) => (
  <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>
);

const StatCard = ({ label, value, sub, color, style, icon, iconColor, tone = "neutral", info }) => {
  const toneColor = tone === "positive" ? C.accent : tone === "negative" ? C.red : null;
  return (
    <div style={{
      background: toneColor ? toneColor + "0c" : C.surface,
      border: `1px solid ${toneColor ? toneColor + "40" : C.border}`,
      borderRadius: 16, padding: "18px 20px", transition: "border-color 0.15s",
      ...style,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {icon && <span style={{ fontSize: 14, color: iconColor || toneColor || C.textMuted, display: "flex", alignItems: "center", flexShrink: 0 }}>{icon}</span>}
        <span style={{ fontSize: 13.5, color: C.textMuted, fontWeight: 500, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 800, color: color || C.text, letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
};

// ─── BEHAVIORAL GLOW CARD (Behavioral Edge / Stability / Exit Discipline / Dominant Emotion) ──
const GLOW_ICONS = {
  badge: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  ),
  pulse: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="2" />
    </svg>
  ),
  brain: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 3a3 3 0 0 0-3 3v.3A3 3 0 0 0 4 9v1a3 3 0 0 0 1 2.24V15a3 3 0 0 0 3 3h.3A3 3 0 0 0 11 20h1a3 3 0 0 0 3-3v-2.76A3 3 0 0 0 16 12v-1a3 3 0 0 0-2.5-2.96V6a3 3 0 0 0-3-3z" />
      <path d="M12 3v17" />
    </svg>
  ),
};
function GlowStatCard({ icon, title, value, valueColor, subtitle, glow }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${glow}55`, borderRadius: 16, padding: 22,
      boxShadow: `0 0 0 1px ${glow}18, 0 10px 34px ${glow}12`,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1.2, lineHeight: 1.4 }}>{title}</div>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: glow + "1c", border: `1px solid ${glow}40`, color: glow, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{GLOW_ICONS[icon]}</div>
      </div>
      <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: valueColor || glow, letterSpacing: -1 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 5, lineHeight: 1.5 }}>{subtitle}</div>
    </div>
  );
}

const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>{children}</div>
);

// ─── BAR & LINE CHARTS ───────────────────────────────────────────────────────
const BarChart = ({ data, height = 120 }) => {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, paddingTop: 8 }}>
      {data.map((d, i) => {
        const h = Math.max(2, (Math.abs(d.value) / max) * (height - 20));
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ width: "100%", height: h, background: d.value >= 0 ? C.accent : C.red, borderRadius: "3px 3px 0 0", opacity: 0.85 }} title={`${d.label}: ${fmt$(d.value)}`} />
            <div style={{ fontSize: 9, color: C.textDim, textAlign: "center", lineHeight: 1.2 }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
};

const LineChart = ({ trades, height = 140 }) => {
  const sorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
  let cum = 0;
  const pts = sorted.map(t => { cum += t.pnl; return cum; });
  if (pts.length < 2) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 13 }}>Log more trades to see your curve</div>;
  const min = Math.min(...pts, 0), max = Math.max(...pts, 0), range = max - min || 1;
  const W = 600, H = height - 20;
  const x = i => (i / (pts.length - 1)) * W, y = v => H - ((v - min) / range) * H;
  const path = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={last >= 0 ? C.accent : C.red} stopOpacity="0.3" /><stop offset="100%" stopColor={last >= 0 ? C.accent : C.red} stopOpacity="0" /></linearGradient></defs>
      <path d={`${path} L${W},${y(0).toFixed(1)} L0,${y(0).toFixed(1)} Z`} fill="url(#lg)" />
      <path d={path} fill="none" stroke={last >= 0 ? C.accent : C.red} strokeWidth="2" />
      <line x1="0" y1={y(0).toFixed(1)} x2={W} y2={y(0).toFixed(1)} stroke={C.border} strokeWidth="1" strokeDasharray="4,4" />
    </svg>
  );
};

// ─── EQUITY CURVE (interactive, dashboard) ───────────────────────────────────
// Rounds a rough step size up to a "nice" 1/2/5 × 10^n number so Y-axis
// gridlines read as clean values ($3,000 / $6,000…) instead of jagged ones.
function niceStep(rough) {
  if (!rough || rough <= 0) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const frac = rough / base;
  const niceFrac = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  return niceFrac * base;
}
const axisMoney = (v) => `${v < 0 ? "-" : ""}$${Math.abs(Math.round(v)).toLocaleString()}`;

function EquityCurveChart({ trades, height = 300 }) {
  const [range, setRange] = useState("All");
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const now = new Date();
  const rangeFiltered = trades.filter(t => {
    if (range === "Month") return (now - new Date(t.date)) / 86400000 <= 30;
    if (range === "Year") return (now - new Date(t.date)) / 86400000 <= 365;
    return true;
  });
  const sorted = [...rangeFiltered].sort((a, b) => new Date(a.date) - new Date(b.date));
  let cum = 0;
  const pts = sorted.map(t => { cum += t.pnl; return { date: t.date, value: cum }; });

  const Header = () => (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.5 }}>Equity<br />Curve</div>
      <div style={{ display: "flex", gap: 2, background: C.surfaceHigh, borderRadius: 10, padding: 4 }}>
        {["Month", "Year", "All"].map(r => (
          <button key={r} onClick={() => { setRange(r); setHover(null); }} style={{
            padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
            background: range === r ? "linear-gradient(135deg, #fdfaf4, #f3e9e0)" : "transparent",
            color: range === r ? "#161a22" : C.textMuted,
          }}>{r}</button>
        ))}
      </div>
    </div>
  );

  if (pts.length < 2) {
    return (
      <div>
        <Header />
        <div style={{ height: height - 60, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 13 }}>Log more trades to see your curve</div>
      </div>
    );
  }

  const vals = pts.map(p => p.value);
  const dataMax = Math.max(...vals, 0), dataMin = Math.min(...vals, 0);
  const step = niceStep(Math.max(Math.abs(dataMax), Math.abs(dataMin)) / 4);
  const niceMax = Math.max(step, Math.ceil(dataMax / step) * step);
  const niceMin = dataMin < 0 ? -Math.ceil(Math.abs(dataMin) / step) * step : 0;
  const span = niceMax - niceMin || 1;

  const padTop = 20, padBottom = 34, padLeft = 68;
  const W = 900;
  const plotH = height - padTop - padBottom;
  const plotW = W - padLeft;
  const x = i => padLeft + (pts.length > 1 ? (i / (pts.length - 1)) * plotW : plotW / 2);
  const y = v => padTop + (1 - (v - niceMin) / span) * plotH;
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const zeroY = y(0);

  const ySteps = 4;
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => niceMin + (span / ySteps) * i).reverse();
  const xTickEvery = Math.max(1, Math.ceil(pts.length / 6));
  const strip = Math.max(2, plotW / pts.length);

  const hoverInfo = hover != null ? pts[hover] : null;
  const leftPct = hover != null ? (x(hover) / W) * 100 : 0;
  const flip = leftPct > 60;

  // Tap/drag support for touch devices — maps a touch's screen position to
  // the nearest data point so tapping (not just hovering) reveals the tooltip.
  const pointFromClientX = (clientX) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return null;
    const relX = ((clientX - rect.left) / rect.width) * W;
    let nearest = 0, minDist = Infinity;
    pts.forEach((p, i) => { const dist = Math.abs(x(i) - relX); if (dist < minDist) { minDist = dist; nearest = i; } });
    return nearest;
  };
  const handleTouch = (e) => {
    const t = e.touches[0] || e.changedTouches[0];
    if (!t) return;
    const idx = pointFromClientX(t.clientX);
    if (idx != null) setHover(idx);
  };

  return (
    <div>
      <Header />
      <div style={{ position: "relative" }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height, display: "block", touchAction: "pan-y" }} preserveAspectRatio="none" onMouseLeave={() => setHover(null)} onTouchStart={handleTouch} onTouchMove={handleTouch}>
          <defs><linearGradient id="eqcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity="0.35" /><stop offset="100%" stopColor={C.accent} stopOpacity="0" /></linearGradient></defs>
          {yLabels.map((v, i) => {
            const yy = padTop + (i / ySteps) * plotH;
            return (
              <g key={i}>
                <text x={padLeft - 10} y={yy + 4} fill={C.textMuted} fontSize="13" textAnchor="end">{axisMoney(v)}</text>
                <line x1={padLeft} x2={W} y1={yy} y2={yy} stroke={C.border} strokeDasharray="4,4" />
              </g>
            );
          })}
          <path d={`${path} L${x(pts.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${padLeft},${zeroY.toFixed(1)} Z`} fill="url(#eqcg)" />
          <path d={path} fill="none" stroke={C.accent} strokeWidth="2.5" />
          {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 0 : 2.6} fill={C.accent} opacity="0.85" />)}
          {hover != null && (
            <>
              <line x1={x(hover).toFixed(1)} x2={x(hover).toFixed(1)} y1={padTop} y2={zeroY.toFixed(1)} stroke={C.text} strokeWidth="1.5" opacity="0.55" />
              <circle cx={x(hover)} cy={y(pts[hover].value)} r="6.5" fill={C.blue} stroke={C.surface} strokeWidth="3" />
              <circle cx={x(hover)} cy={zeroY} r="6.5" fill={C.blue} stroke={C.surface} strokeWidth="3" />
            </>
          )}
          {pts.map((p, i) => <rect key={i} x={x(i) - strip / 2} y={padTop} width={strip} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />)}
        </svg>
        {pts.map((p, i) => (i % xTickEvery === 0 || i === pts.length - 1) && (
          <div key={i} style={{ position: "absolute", left: `${(x(i) / W) * 100}%`, bottom: 0, transform: i === 0 ? "translateX(0)" : i === pts.length - 1 ? "translateX(-100%)" : "translateX(-50%)", fontSize: 11, color: C.textDim, whiteSpace: "nowrap" }}>{fmtShortDate(p.date)}</div>
        ))}
        {hoverInfo && (
          <div style={{
            position: "absolute", top: 8, [flip ? "right" : "left"]: `${flip ? 100 - leftPct : leftPct}%`,
            transform: `translateX(${flip ? "-14px" : "14px"})`,
            background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px",
            minWidth: 170, boxShadow: "0 10px 30px #000a", pointerEvents: "none", zIndex: 6,
          }}>
            <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 600 }}>{fmtDate(hoverInfo.date)}</div>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>Net P&amp;L</div>
            <div className="mono" style={{ fontSize: 19, fontWeight: 800, color: C.accent, marginTop: 4 }}>{moneyFmt(hoverInfo.value)}</div>
          </div>
        )}
      </div>
    </div>
  );
}


function AuthScreen({ state, dispatch }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [name, setName] = useState(""), [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const login = async () => {
    if (!email || !password) { setError("Email and password required."); return; }
    setError(""); setBusy(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    dispatch({ type: "LOGIN", user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name || data.user.email } });
  };
  const register = async () => {
    if (!name || !email || !password) { setError("All fields required."); return; }
    setError(""); setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (data.user && data.session) {
      dispatch({ type: "REGISTER", user: { id: data.user.id, email: data.user.email, name } });
    } else {
      setError("Account created — check your email to confirm, then sign in.");
      setMode("login");
    }
  };
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 440 }} className="fade-in">
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -2, fontFamily: "'Inter', sans-serif", ...gradientTextStyle() }}>{state.siteName || "ACEZELLA"}</div>
          <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 4, textTransform: "uppercase", marginTop: 4 }}>Trading Journal</div>
        </div>
        <Card style={{ padding: 32 }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 24, background: C.bg, borderRadius: 10, padding: 4 }}>
            {[["login", "Sign In"], ["register", "Create Account"]].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); setError(""); }} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", background: mode === m ? C.accent : "transparent", color: mode === m ? "#000" : C.textMuted }}>{l}</button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "register" && <Inp label="Full Name" value={name} onChange={setName} placeholder="Ace Trader" />}
            <Inp label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
            <Inp label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
            {error && <div style={{ color: C.red, fontSize: 13, padding: "8px 12px", background: C.redDim, borderRadius: 8 }}>{error}</div>}
            <Btn onClick={mode === "login" ? login : register} disabled={busy} style={{ justifyContent: "center", marginTop: 4 }}>{busy ? "Please wait…" : (mode === "login" ? "Sign In" : "Create Account")}</Btn>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
            <div style={{ flex: 1, height: 1, background: C.border }} /><span style={{ fontSize: 12, color: C.textDim }}>or</span><div style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <Btn variant="ghost" onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }} style={{ width: "100%", justifyContent: "center" }}>{mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}</Btn>
        </Card>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: C.textDim }}>Data stored locally in your browser. Always yours.</div>
      </div>
    </div>
  );
}

// ─── TOP HEADER (account switcher · add trade · settings · session) ────────
function TopHeader({ state, dispatch, setPage, page }) {
  const { currentUser, accounts, activeAccount } = state;
  const [userOpen, setUserOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState("Funded");
  const [newAccColor, setNewAccColor] = useState(ACCOUNT_COLORS[0]);
  const activeAccountObj = accounts.find(a => a.id === activeAccount);
  const activeAccountLabel = activeAccount === "all" ? "All Accounts" : (activeAccountObj?.name || "Account");
  const activeAccountColor = activeAccount === "all" ? C.textMuted : (activeAccountObj?.color || C.accent);

  const closeAccountMenu = () => { setAccountOpen(false); setAddingAccount(false); };
  const startAddAccount = () => {
    if (!canAddAccount(state)) { dispatch({ type: "OPEN_MODAL", modal: "upgrade" }); closeAccountMenu(); return; }
    setNewAccName(""); setNewAccType("Funded"); setNewAccColor(ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length]);
    setAddingAccount(true);
  };
  const saveNewAccount = () => {
    const name = newAccName.trim();
    if (!name) return;
    if (!canAddAccount(state)) { dispatch({ type: "OPEN_MODAL", modal: "upgrade" }); closeAccountMenu(); return; }
    const account = { id: `acc${Date.now()}`, name, type: newAccType, color: newAccColor };
    dispatch({ type: "ADD_ACCOUNT", account });
    dispatch({ type: "SET_ACTIVE_ACCOUNT", id: account.id });
    closeAccountMenu();
  };

  return (
    <div className="desktop-header" style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
      borderBottom: `1px solid ${C.border}`, background: C.sidebar, flexShrink: 0, position: "relative", zIndex: 30,
    }}>
      {/* Quick jump to Dashboard */}
      <button onClick={() => setPage("dashboard")} style={{ display: "flex", alignItems: "center", gap: 7, background: page === "dashboard" ? C.surfaceHigh : "transparent", border: `1px solid ${page === "dashboard" ? C.border : "transparent"}`, borderRadius: 9, color: page === "dashboard" ? C.text : C.textMuted, fontSize: 13, fontWeight: 600, padding: "8px 14px", cursor: "pointer" }}>
        <span style={{ fontSize: 13 }}>▦</span> Dashboard
      </button>

      <div style={{ flex: 1 }} />

      <Btn small onClick={() => openAddTrade(state, dispatch)}>+ Add Trade</Btn>

      {/* Account selector — switch between all accounts or a single account */}
      <div style={{ position: "relative" }}>
        <button onClick={() => setAccountOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 8, background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 9, color: C.text, fontSize: 13, fontWeight: 600, padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: activeAccountColor, flexShrink: 0 }} />
          <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeAccountLabel}</span>
          <span style={{ fontSize: 9, color: C.textDim }}>▾</span>
        </button>
        {accountOpen && (
          <>
            <div onClick={closeAccountMenu} style={{ position: "fixed", inset: 0, zIndex: 39 }} />
            <div className="fade-in" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: 240, background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 6, boxShadow: "0 12px 30px #000a", zIndex: 40, maxHeight: 420, overflowY: "auto" }}>
              <div onClick={() => { dispatch({ type: "SET_ACTIVE_ACCOUNT", id: "all" }); closeAccountMenu(); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13, background: activeAccount === "all" ? C.accentDim : "transparent", color: activeAccount === "all" ? C.accent : C.text, fontWeight: activeAccount === "all" ? 700 : 400 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: activeAccount === "all" ? C.accent : C.textDim }} /> All Accounts
              </div>
              {accounts.map(a => (
                <div key={a.id} onClick={() => { dispatch({ type: "SET_ACTIVE_ACCOUNT", id: a.id }); closeAccountMenu(); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13, background: activeAccount === a.id ? a.color + "22" : "transparent", color: activeAccount === a.id ? a.color : C.text, fontWeight: activeAccount === a.id ? 700 : 400 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                </div>
              ))}

              <div style={{ borderTop: `1px solid ${C.border}`, margin: "6px 2px 0" }} />

              {addingAccount ? (
                <div style={{ padding: "10px 8px 6px", display: "flex", flexDirection: "column", gap: 8 }} onClick={e => e.stopPropagation()}>
                  <input autoFocus value={newAccName} onChange={e => setNewAccName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveNewAccount(); if (e.key === "Escape") setAddingAccount(false); }}
                    placeholder="Account name (e.g. FTMO 100K)" style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, padding: "8px 10px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" }} />
                  <select value={newAccType} onChange={e => setNewAccType(e.target.value)} style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, padding: "8px 10px", fontSize: 13, outline: "none", cursor: "pointer" }}>
                    {["Funded", "Combine", "Live", "Demo"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "2px 2px 0" }}>
                    {ACCOUNT_COLORS.map(col => (
                      <div key={col} onClick={() => setNewAccColor(col)} style={{ width: 20, height: 20, borderRadius: "50%", background: col, cursor: "pointer", border: newAccColor === col ? "2px solid #fff" : "2px solid transparent", boxShadow: newAccColor === col ? `0 0 0 1px ${col}` : "none" }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                    <Btn small onClick={saveNewAccount} disabled={!newAccName.trim()} style={{ flex: 1, justifyContent: "center" }}>Add Account</Btn>
                    <Btn small variant="ghost" onClick={() => setAddingAccount(false)}>Cancel</Btn>
                  </div>
                </div>
              ) : (
                <div onClick={startAddAccount} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13, color: C.accent, fontWeight: 700, marginTop: 2 }}>
                  <span style={{ width: 18, textAlign: "center", fontSize: 15, lineHeight: 1 }}>+</span> Add Account
                  {!canAddAccount(state) && <PlusBadge small />}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <button title="Settings" onClick={() => setPage("settings")} style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 9, color: C.textMuted, width: 34, height: 34, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>⚙️</button>

      <a href="mailto:support@acezella.io" style={{ display: "flex", alignItems: "center", gap: 6, color: C.textMuted, fontSize: 13, fontWeight: 600, textDecoration: "none", padding: "8px 6px", whiteSpace: "nowrap" }}>✉ Contact Us</a>

      {/* Session control */}
      <div style={{ position: "relative" }}>
        <button onClick={() => setUserOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 8, background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 9, color: C.text, fontSize: 13, fontWeight: 600, padding: "6px 12px 6px 8px", cursor: "pointer" }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: C.accentDim, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
            {(currentUser?.name || currentUser?.email || "?").charAt(0).toUpperCase()}
          </span>
          <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser?.name || "Account"}</span>
          <span style={{ fontSize: 9, color: C.textDim }}>▾</span>
        </button>
        {userOpen && (
          <>
            <div onClick={() => setUserOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 39 }} />
            <div className="fade-in" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 210, background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 6, boxShadow: "0 12px 30px #000a", zIndex: 40 }}>
              <div style={{ padding: "8px 10px 10px", borderBottom: `1px solid ${C.border}`, marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{currentUser?.name}</div>
                <div style={{ fontSize: 11, color: C.textDim }}>{currentUser?.email}</div>
              </div>
              {currentUser && (
                <div onClick={async () => { await supabase.auth.signOut(); dispatch({ type: "LOGOUT" }); setUserOpen(false); }} style={{ padding: "8px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13, color: C.red, fontWeight: 600 }}>⏻ Sign Out</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
const NAV = [{ id: "dashboard", icon: "♤", label: "Dashboard" }, { id: "journal", icon: "♤", label: "Trades" }, { id: "strategies", icon: "♤", label: "Playbook" }, { id: "analytics", icon: "♤", label: "Analytics", plus: true }, { id: "myrecord", icon: "♤", label: "My Record", plus: true }, { id: "mynotes", icon: "♤", label: "My Notes", plus: true }, { id: "emotions", icon: "♤", label: "Edge Score", plus: true }, { id: "finances", icon: "♤", label: "Prop Firms", plus: true }, { id: "livecapital", icon: "♤", label: "Live Capital", plus: true }];

function Sidebar({ page, setPage, state, dispatch, mobileNavOpen, onClose }) {
  return (
    <>
      {mobileNavOpen && <div className="sidebar-scrim" onClick={onClose} />}
      <div className={`app-sidebar${mobileNavOpen ? " open" : ""}`} style={{ width: 224, minWidth: 224, background: C.sidebar, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ padding: "18px 16px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, fontFamily: "'Inter', sans-serif", letterSpacing: -1, ...gradientTextStyle() }}>{state.siteName || "ACEZELLA"}</div>
            <div style={{ fontSize: 9, color: C.accent, letterSpacing: 3, textTransform: "uppercase", marginTop: 2, opacity: 0.85 }}>Trading Journal</div>
          </div>
          <button onClick={onClose} className="sidebar-close-btn" style={{ background: "none", border: "none", color: C.textMuted, fontSize: 22, cursor: "pointer", display: "none" }}>×</button>
        </div>
      <div style={{ padding: "10px 8px", flex: 1, overflowY: "auto" }}>
        <div style={{ fontSize: 9, color: C.textDim, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", padding: "4px 8px 6px" }}>Menu</div>
        {NAV.map(n => (
          <div key={n.id} onClick={() => { setPage(n.id); onClose && onClose(); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 1, transition: "all 0.1s", background: page === n.id ? C.accentDim : "transparent", color: page === n.id ? C.accent : C.textMuted, fontWeight: page === n.id ? 600 : 400, fontSize: 14 }}>
            <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>{n.icon}</span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.plus && !isPlus(state) && <PlusBadge small />}
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 8px" }}>
        <Btn onClick={() => openAddTrade(state, dispatch)} style={{ width: "100%", justifyContent: "center", fontSize: 13, marginBottom: 8 }}>+ Add Trade</Btn>
        <button onClick={() => { if (!isPlus(state)) { dispatch({ type: "OPEN_MODAL", modal: "upgrade" }); onClose && onClose(); return; } setPage("import"); onClose && onClose(); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: `linear-gradient(90deg, ${C.blue}, ${C.purple}, ${C.accent2})`, border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontWeight: 700, padding: 8, cursor: "pointer", marginBottom: 8, opacity: page === "import" ? 1 : 0.9, boxShadow: page === "import" ? `0 0 0 2px ${C.accent}55` : "none" }}>Import Trades {!isPlus(state) && <PlusBadge small />}</button>
        <button onClick={async () => { await supabase.auth.signOut(); dispatch({ type: "LOGOUT" }); }} style={{ width: "100%", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, color: C.textMuted, fontSize: 12, padding: 7, cursor: "pointer" }}>Sign Out</button>
      </div>
    </div>
    </>
  );
}

// ─── SCREENSHOT UPLOAD ────────────────────────────────────────────────────────
function ScreenshotUploader({ screenshots = [], onChange, max = 6, locked }) {
  const fileRef = useRef();
  const handleFiles = (files) => {
    const remaining = max - screenshots.length;
    const toProcess = Array.from(files).slice(0, remaining);
    toProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => onChange([...screenshots, { id: Date.now() + Math.random(), url: e.target.result, name: file.name }]);
      reader.readAsDataURL(file);
    });
  };
  const remove = (id) => onChange(screenshots.filter(s => s.id !== id));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <SectionLabel>Screenshots ({screenshots.length}/{max})</SectionLabel>
        {locked && <PlusBadge small />}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
        {screenshots.map(s => (
          <div key={s.id} style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, aspectRatio: "16/9" }}>
            <img src={s.url} alt={s.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <button onClick={() => remove(s.id)} style={{ position: "absolute", top: 4, right: 4, background: "#000b", border: "none", borderRadius: "50%", color: C.red, width: 22, height: 22, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        ))}
        {screenshots.length < max && (
          <div onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${C.border}`, borderRadius: 8, aspectRatio: "16/9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 4, color: C.textDim, fontSize: 12 }}>
            <span style={{ fontSize: 22 }}>+</span><span>Add Photo</span>
          </div>
        )}
      </div>
      {locked && screenshots.length >= max && <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>Ace Basic allows {max} screenshot per trade. Upgrade to AcePlus for up to 6.</div>}
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
    </div>
  );
}

// ─── ADD/EDIT TRADE MODAL (TradeSet-style) ────────────────────────────────────
// Picks readable text (dark or white) for an arbitrary background hex color,
// so per-item colored buttons (setup/timeframe/mood/exit behavior) stay legible.
function textColorFor(hex) {
  if (!hex || hex[0] !== "#") return "#001018";
  let c = hex.slice(1);
  if (c.length === 3) c = c.split("").map(ch => ch + ch).join("");
  if (c.length !== 6) return "#001018";
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.58 ? "#001018" : "#fff";
}
const segBtnStyle = (active, activeColor, activeText = "#001018") => ({
  position: "relative", padding: "13px 14px", borderRadius: 10, cursor: "pointer",
  border: `1.5px solid ${active ? activeColor : C.border}`,
  background: active ? activeColor : C.surfaceHigh,
  color: active ? activeText : C.textMuted,
  fontWeight: 700, fontSize: 14, transition: "all 0.15s",
  boxShadow: active ? `0 0 0 3px ${activeColor}22` : "none",
  width: "100%", minWidth: 0, boxSizing: "border-box", overflowWrap: "break-word", wordBreak: "break-word",
});
const SegBadge = ({ color, textColor = "#001018", children }) => (
  <span style={{ position: "absolute", top: -9, right: -6, background: color, color: textColor, fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 20, letterSpacing: 0.4 }}>{children}</span>
);
const ModalField = ({ label, sub, children }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>{label}{sub && <span style={{ fontWeight: 400, color: C.textDim, fontSize: 11 }}> ({sub})</span>}</div>
    {children}
  </div>
);
const modalInputStyle = { width: "100%", minWidth: 0, background: C.surfaceHigh, border: `1.5px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "12px 14px", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
const modalDateTimeInputStyle = { ...modalInputStyle, colorScheme: "dark" };
const ModalSelect = ({ label, badge, value, onChange, options, valueColor, placeholder }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{label}</span>
      {badge && <span style={{ background: C.accentDim, color: C.accent, fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 20, letterSpacing: 0.4 }}>{badge}</span>}
    </div>
    <select value={value || ""} onChange={e => onChange(e.target.value)} style={{ ...modalInputStyle, fontWeight: 700, color: value ? (valueColor || C.text) : C.textDim, cursor: "pointer" }}>
      <option value="">{placeholder || `Select ${label}`}</option>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  </div>
);
const ModalDivider = () => <div style={{ height: 2, borderRadius: 2, margin: "22px 0", background: `linear-gradient(90deg, ${C.blue}, ${C.purple}, ${C.accent2})`, opacity: 0.5 }} />;

function AddTradeModal({ state, dispatch }) {
  const { accounts, strategies, sessions, emotions, timeframes = ["15 min", "30 min", "1 hr", "4 hr"], riskLevels = ["Low Risk", "Normal Risk", "High Risk"], trendBiases = ["With Trend", "Counter"] } = state;
  const editing = state.modal?.trade;
  const defaultAccount = (state.activeAccount && state.activeAccount !== "all") ? state.activeAccount : (accounts[0]?.id || "");
  const [form, setForm] = useState(() => editing ? {
    ...editing, entryDate: editing.date.slice(0, 10), exitDate: editing.exitDate || "",
    partialExits: editing.partialExits || [],
    outcomeNeutral: editing.postTradeState === "Detached" ? "Yes" : editing.postTradeState === "Attached" ? "No" : "",
  } : {
    entryDate: new Date().toISOString().slice(0, 10), exitDate: "",
    symbol: "NQ", direction: "Long",
    entry: "", exit: "", size: "1", pnl: "", pips: "", outcome: "",
    setup: "", session: "", mood: "",
    timeframe: "", trendBias: "", risk: "",
    openTime: "", closeTime: "", fees: "", exitBehavior: "", outcomeNeutral: "",
    notes: "", account: defaultAccount, screenshots: [], partialExits: [],
  });
  const [addingSetup, setAddingSetup] = useState(false);
  const [newSetupName, setNewSetupName] = useState("");
  const [notebookOpen, setNotebookOpen] = useState(!!(editing && editing.notes));
  const set = k => v => setForm(f => ({ ...f, [k]: v }));

  // Win → force +, Loss → force −, Breakeven → force 0. Applied both when the
  // outcome itself is (re)selected and whenever P&L / Pips are typed in.
  const applySign = (outcome, val) => {
    if (outcome === "BE") return "0";
    if (val === "" || val === null || val === undefined) return val;
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    if (outcome === "Win") return String(Math.abs(num));
    if (outcome === "Loss") return String(-Math.abs(num));
    return val;
  };
  const setOutcome = (val) => setForm(f => ({ ...f, outcome: val, pnl: applySign(val, f.pnl), pips: applySign(val, f.pips) }));
  const setSignedField = (field) => (v) => setForm(f => ({ ...f, [field]: applySign(f.outcome, v) }));

  const autoPnl = (() => {
    const en = parseFloat(form.entry), ex = parseFloat(form.exit), sz = parseFloat(form.size) || 0;
    if (isNaN(en) || isNaN(ex) || !sz) return null;
    const dirMult = form.direction === "Short" ? -1 : 1;
    const gross = (ex - en) * sz * dirMult;
    return +(gross - (parseFloat(form.fees) || 0)).toFixed(2);
  })();
  const applyAutoPnl = () => { if (autoPnl != null) setSignedField("pnl")(String(autoPnl)); };

  const addPartialExit = () => setForm(f => ({ ...f, partialExits: [...(f.partialExits || []), { id: `pe${Date.now()}`, price: "", size: "" }] }));
  const updatePartialExit = (id, k, v) => setForm(f => ({ ...f, partialExits: f.partialExits.map(p => p.id === id ? { ...p, [k]: v } : p) }));
  const removePartialExit = (id) => setForm(f => ({ ...f, partialExits: f.partialExits.filter(p => p.id !== id) }));

  const saveNewSetup = () => {
    if (!canAddSetup(state)) { dispatch({ type: "OPEN_MODAL", modal: "upgrade" }); return; }
    const name = newSetupName.trim();
    if (!name) return;
    const strategy = { id: `s${Date.now()}`, name, color: ACCOUNT_COLORS[strategies.length % ACCOUNT_COLORS.length], description: "", rules: [] };
    dispatch({ type: "ADD_STRATEGY", strategy });
    set("setup")(name);
    setNewSetupName(""); setAddingSetup(false);
  };

  const submit = () => {
    const pnl = parseFloat(form.pnl) || 0;
    const outcome = form.outcome || (pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "BE");
    const postTradeState = form.outcomeNeutral === "Yes" ? "Detached" : form.outcomeNeutral === "No" ? "Attached" : (editing?.postTradeState || "");
    const isoDate = new Date(`${form.entryDate || new Date().toISOString().slice(0, 10)}T${form.openTime || "00:00"}`).toISOString();
    const trade = {
      id: editing?.id || `t${Date.now()}`, ...form, date: isoDate, outcome, postTradeState,
      entry: parseFloat(form.entry) || 0, exit: parseFloat(form.exit) || 0, size: parseInt(form.size) || 1,
      pnl, pips: parseFloat(form.pips) || 0, fees: parseFloat(form.fees) || 0,
    };
    dispatch({ type: editing ? "UPDATE_TRADE" : "ADD_TRADE", trade, id: editing?.id, data: trade });
    dispatch({ type: "CLOSE_MODAL" });
  };

  const emotionRows = []; for (let i = 0; i < emotions.length; i += 2) emotionRows.push(emotions.slice(i, i + 2));
  const exitBehaviorOptions = [["Early", "Exit Early"], ["Planned", "As Planned"], ["Late", "Exit Late"]];
  const canSubmit = form.symbol && (!isPlus(state) || form.mood);

  if (!editing && !canAddTrade(state)) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && dispatch({ type: "CLOSE_MODAL" })}>
        <div className="fade-in" style={{ background: C.modalBg, border: `1px solid ${C.borderLight}`, borderRadius: 18, padding: 30, width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: C.purpleDim, color: C.purple, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 16px" }}>🔒</div>
          <div style={{ marginBottom: 8 }}><PlusBadge /></div>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Ace Basic trade limit reached</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 22, lineHeight: 1.6 }}>You've logged {state.trades.length} of {FREE_LIMITS.maxTrades} trades available on Ace Basic. Upgrade to AcePlus for unlimited trades.</div>
          <Btn variant="gradient" onClick={() => dispatch({ type: "OPEN_MODAL", modal: "upgrade" })} style={{ width: "100%", justifyContent: "center", marginBottom: 10 }}>✨ Upgrade to AcePlus</Btn>
          <Btn variant="ghost" onClick={() => dispatch({ type: "CLOSE_MODAL" })} style={{ width: "100%", justifyContent: "center" }}>Close</Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && dispatch({ type: "CLOSE_MODAL" })}>
      <div className="fade-in" style={{ background: C.modalBg, border: `1px solid ${C.borderLight}`, boxShadow: `0 0 0 1px ${C.accent}2a, 0 30px 80px #000d`, borderRadius: 18, padding: 28, width: "100%", maxWidth: 600, maxHeight: "92vh", overflowY: "auto", overflowX: "hidden", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 22 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, flex: 1 }}>{editing ? "Edit Trade" : "Add New Trade"}</h2>
          <button onClick={() => dispatch({ type: "CLOSE_MODAL" })} style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 9, width: 32, height: 32, color: C.textMuted, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Outcome — Win / Loss / Breakeven */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Outcome</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[["Win", C.accent, "#001018"], ["Loss", C.red, "#fff"], ["BE", C.yellow, "#001018"]].map(([val, color, txt]) => (
              <button key={val} onClick={() => setOutcome(val)} style={segBtnStyle(form.outcome === val, color, txt)}>{val === "BE" ? "Breakeven" : val}</button>
            ))}
          </div>
        </div>

        {/* Entry / Exit Date & Time */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <ModalField label="Entry Date & Time">
            <div style={{ display: "flex", gap: 6 }}>
              <input type="date" value={form.entryDate} onChange={e => set("entryDate")(e.target.value)} style={{ ...modalDateTimeInputStyle, flex: 1, minWidth: 0, padding: "12px 6px", fontSize: 12.5 }} />
              <input type="time" value={form.openTime} onChange={e => set("openTime")(e.target.value)} style={{ ...modalDateTimeInputStyle, flex: 1, minWidth: 0, padding: "12px 6px", fontSize: 12.5 }} />
            </div>
          </ModalField>
          <ModalField label="Exit Date & Time" sub="Optional">
            <div style={{ display: "flex", gap: 6 }}>
              <input type="date" value={form.exitDate} onChange={e => set("exitDate")(e.target.value)} style={{ ...modalDateTimeInputStyle, flex: 1, minWidth: 0, padding: "12px 6px", fontSize: 12.5 }} />
              <input type="time" value={form.closeTime} onChange={e => set("closeTime")(e.target.value)} style={{ ...modalDateTimeInputStyle, flex: 1, minWidth: 0, padding: "12px 6px", fontSize: 12.5 }} />
            </div>
          </ModalField>
        </div>

        {/* Entry / Exit Price */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <ModalField label="Entry Price"><input type="number" value={form.entry} onChange={e => set("entry")(e.target.value)} placeholder="0.00" style={modalInputStyle} /></ModalField>
          <ModalField label="Exit Price"><input type="number" value={form.exit} onChange={e => set("exit")(e.target.value)} placeholder="0.00" style={modalInputStyle} /></ModalField>
        </div>

        {/* Entry / Exit Time now combined into Entry/Exit Date & Time above */}

        {/* Direction / Symbol */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <ModalField label="Direction">
            <div style={{ display: "flex", gap: 8 }}>
              {["Long", "Short"].map(d => (
                <button key={d} onClick={() => set("direction")(d)} style={{ ...segBtnStyle(form.direction === d, d === "Long" ? C.accent : C.red, "#fff"), flex: 1 }}>{d}</button>
              ))}
            </div>
          </ModalField>
          <ModalField label="Symbol" sub="*">
            <input value={form.symbol} onChange={e => set("symbol")(e.target.value.toUpperCase())} placeholder="NQ, ES, GC…" style={modalInputStyle} />
          </ModalField>
        </div>

        {/* Quantity / Fees */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <ModalField label="Quantity" sub="Contracts/Lots/Shares"><input type="number" value={form.size} onChange={e => set("size")(e.target.value)} placeholder="1" style={modalInputStyle} /></ModalField>
          <ModalField label="Fees / Commission"><input type="number" value={form.fees} onChange={e => set("fees")(e.target.value)} placeholder="0" style={modalInputStyle} /></ModalField>
        </div>

        {/* Account (needed for multi-account tracking) */}
        <div style={{ marginBottom: 16 }}>
          <ModalSelect label="Account" value={form.account} onChange={set("account")} options={accounts.map(a => ({ value: a.id, label: a.name }))} valueColor={accounts.find(a => a.id === form.account)?.color} />
        </div>

        {/* Partial Exits */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Partial Exits <span style={{ fontWeight: 400, color: C.textDim, fontSize: 11 }}>(Optional)</span></div>
          {(form.partialExits || []).map(p => (
            <div key={p.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input type="number" value={p.price} onChange={e => updatePartialExit(p.id, "price", e.target.value)} placeholder="Exit price" style={{ ...modalInputStyle, flex: 1, minWidth: 0 }} />
              <input type="number" value={p.size} onChange={e => updatePartialExit(p.id, "size", e.target.value)} placeholder="Size" style={{ ...modalInputStyle, flex: 1, minWidth: 0 }} />
              <button onClick={() => removePartialExit(p.id)} style={{ background: C.redDim, border: "none", borderRadius: 10, color: C.red, width: 44, flexShrink: 0, cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
          ))}
          <button onClick={addPartialExit} style={{ width: "100%", background: C.surfaceHigh, border: `1.5px dashed ${C.border}`, borderRadius: 10, color: C.textMuted, padding: "12px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Add Partial Exit</button>
        </div>

        <ModalDivider />

        {/* Setup / Strategy */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>Setup / Strategy</div>
            <button onClick={() => canAddSetup(state) ? setAddingSetup(a => !a) : dispatch({ type: "OPEN_MODAL", modal: "upgrade" })} style={{ background: "none", border: "none", color: canAddSetup(state) ? C.accent : C.textDim, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>+ Add New Setup {!canAddSetup(state) && <PlusBadge small />}</button>
          </div>
          {!canAddSetup(state) && <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10 }}>Ace Basic is limited to {FREE_LIMITS.maxSetups} Playbook setups — you can still use your existing ones below.</div>}
          {addingSetup && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input value={newSetupName} onChange={e => setNewSetupName(e.target.value)} placeholder="New setup name…" style={{ ...modalInputStyle, flex: 1, minWidth: 0 }} />
              <Btn small onClick={saveNewSetup}>Save</Btn>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {strategies.map(s => {
              const active = form.setup === s.name;
              const col = s.color || C.accent;
              return (
                <button key={s.id} onClick={() => set("setup")(s.name)} style={segBtnStyle(active, col, textColorFor(col))}>
                  {s.name}
                  {active && <SegBadge color={col}>1ST</SegBadge>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time Frame Entry */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Time Frame Entry</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {timeframes.map(tf => (
              <button key={tf} onClick={() => set("timeframe")(tf)} style={segBtnStyle(form.timeframe === tf, timeframeColor(tf), textColorFor(timeframeColor(tf)))}>{tf}</button>
            ))}
          </div>
        </div>

        {/* Trading Session / Risk Meter / Trend Alignment */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 6 }}>
          <ModalSelect label="Trading Session" badge="NEW!" value={form.session} onChange={set("session")} options={sessions} valueColor={C.blue} placeholder="Select Trading Session" />
          <ModalSelect label="Risk Meter" badge="NEW!" value={form.risk} onChange={set("risk")} options={riskLevels} valueColor={form.risk === "High Risk" ? C.red : form.risk === "Normal Risk" ? C.yellow : C.accent} placeholder="Select Risk Level" />
          <ModalSelect label="Trend Alignment" badge="NEW!" value={form.trendBias} onChange={set("trendBias")} options={trendBiases} valueColor={form.trendBias === "With Trend" ? C.accent : C.red} placeholder="Select Trend Alignment" />
        </div>

        <ModalDivider />

        {/* Behavioral Edge Score */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Behavioral Edge Score™</div>
            {!isPlus(state) && <PlusBadge small />}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14 }}>Logged per-trade so your Edge Score and coaching insights stay accurate.</div>

          {isPlus(state) ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Primary Emotion</span>
                <span style={{ background: C.surfaceHigh, color: C.textDim, fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 20, border: `1px solid ${C.border}` }}>REQUIRED</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
                {emotionRows.map((row, ri) => (
                  <div key={ri} style={{ display: "grid", gridTemplateColumns: `repeat(${row.length}, 1fr)`, gap: 10 }}>
                    {row.map(m => (
                      <button key={m} onClick={() => set("mood")(m)} style={segBtnStyle(form.mood === m, moodColor(m), textColorFor(moodColor(m)))}>
                        {m}
                        {form.mood === m && <SegBadge color="#0a0c10" textColor={moodColor(m)}>1ST</SegBadge>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              {form.mood && (
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 12px", marginBottom: 16, fontSize: 12, color: C.textDim }}>
                  <span style={{ background: C.accent, color: "#001018", fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 20, marginRight: 8 }}>1ST</span>{form.mood}
                  <div style={{ marginTop: 4 }}>Tap another emotion to add an optional secondary.</div>
                </div>
              )}

              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Were you outcome neutral?</div>
              <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10 }}>Did you remain emotionally detached from whether this trade won or lost?</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <button onClick={() => set("outcomeNeutral")("Yes")} style={segBtnStyle(form.outcomeNeutral === "Yes", C.accent)}>Yes</button>
                <button onClick={() => set("outcomeNeutral")("No")} style={segBtnStyle(form.outcomeNeutral === "No", C.red, "#fff")}>No</button>
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Exit Behavior</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
                {exitBehaviorOptions.map(([val, label]) => (
                  <button key={val} onClick={() => set("exitBehavior")(val)} style={segBtnStyle(form.exitBehavior === val, exitBehaviorColor(val), textColorFor(exitBehaviorColor(val)))}>{label}</button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ marginBottom: 18 }}>
              <InlineUpgradeLock dispatch={dispatch} text="Logging Primary Emotion, Outcome Neutrality, and Exit Behavior is an AcePlus feature — this data powers your Edge Score." />
            </div>
          )}

          {/* Trade Notebook */}
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: C.purpleDim, color: C.purple, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>📄</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Trade Notebook</div>
                <div style={{ fontSize: 11, color: C.textDim }}>Open a dedicated rich note workspace linked to this trade.</div>
              </div>
              <Btn small variant={notebookOpen ? "success" : "primary"} onClick={() => setNotebookOpen(o => !o)}>{notebookOpen ? "✓ Open" : "+ Add Note"}</Btn>
            </div>
            {notebookOpen && (
              <textarea value={form.notes} onChange={e => set("notes")(e.target.value)} placeholder="What happened? Entry reason, execution quality, mistakes…" rows={4}
                style={{ ...modalInputStyle, marginTop: 14, resize: "vertical" }} />
            )}
          </div>

          {/* Trade Screenshot */}
          <ScreenshotUploader screenshots={form.screenshots} onChange={ss => set("screenshots")(ss)} max={isPlus(state) ? 6 : FREE_LIMITS.maxScreenshots} locked={!isPlus(state)} />
        </div>

        <ModalDivider />

        {/* P&L */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>P&amp;L</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input type="number" value={form.pnl} onChange={e => setSignedField("pnl")(e.target.value)} readOnly={form.outcome === "BE"} placeholder="Enter P&L or use auto-populate" style={{ ...modalInputStyle, flex: "1 1 160px", minWidth: 0, opacity: form.outcome === "BE" ? 0.55 : 1 }} />
            <button onClick={applyAutoPnl} disabled={autoPnl == null || form.outcome === "BE"} style={{ background: (autoPnl == null || form.outcome === "BE") ? C.surfaceHigh : C.accentDim, border: `1px solid ${(autoPnl == null || form.outcome === "BE") ? C.border : C.accent + "55"}`, color: (autoPnl == null || form.outcome === "BE") ? C.textDim : C.accent, borderRadius: 10, padding: "0 18px", fontWeight: 700, fontSize: 13, cursor: (autoPnl == null || form.outcome === "BE") ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexShrink: 0, whiteSpace: "nowrap", minHeight: 44 }}>🧮 Auto</button>
          </div>
          {autoPnl != null && <div style={{ fontSize: 12, color: C.accent, marginTop: 8 }}>Calculated: {fmt$(autoPnl)}</div>}
        </div>

        {/* Pips */}
        <div style={{ marginBottom: 20 }}>
          <ModalField label="Pips" sub="+ gain / − loss">
            <input type="number" value={form.pips} onChange={e => setSignedField("pips")(e.target.value)} readOnly={form.outcome === "BE"} placeholder="e.g. 12.5 or -8" style={{ ...modalInputStyle, opacity: form.outcome === "BE" ? 0.55 : 1 }} />
          </ModalField>
        </div>

        <Btn onClick={submit} disabled={!canSubmit} style={{ width: "100%", justifyContent: "center", padding: "14px 0", fontSize: 15 }}>{editing ? "Update Trade" : "Add Trade"}</Btn>
      </div>
    </div>
  );
}

// ─── SHARE MODAL ─────────────────────────────────────────────────────────────
function ShareModal({ trade, dispatch }) {
  const shareData = {
    id: trade.id, symbol: trade.symbol, direction: trade.direction, date: trade.date,
    entry: trade.entry, exit: trade.exit, size: trade.size, pnl: trade.pnl, pips: trade.pips,
    outcome: trade.outcome, setup: trade.setup, session: trade.session, mood: trade.mood,
    notes: trade.notes, screenshots: trade.screenshots,
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(shareData))));
  const link = `${window.location.origin}${window.location.pathname}#share=${encoded}`;
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && dispatch({ type: "CLOSE_MODAL" })}>
      <div className="fade-in" style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: "100%", maxWidth: 500 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>Share Trade</h2>
          <button onClick={() => dispatch({ type: "CLOSE_MODAL" })} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>Anyone with this link can view your trade — no account needed.</div>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.textMuted, wordBreak: "break-all", marginBottom: 14, lineHeight: 1.6 }}>{link.slice(0, 100)}…</div>
        <Btn onClick={copy} style={{ width: "100%", justifyContent: "center" }}>{copied ? "✓ Copied!" : "📋 Copy Share Link"}</Btn>
        <div style={{ marginTop: 16, padding: 14, background: C.surfaceHigh, borderRadius: 10 }}>
          <SectionLabel>Trade Summary</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["Symbol", trade.symbol], ["Direction", trade.direction], ["P&L", fmt$(trade.pnl)], ["Pips", trade.pips ? `${trade.pips > 0 ? "+" : ""}${trade.pips}` : "—"], ["Outcome", trade.outcome], ["Setup", trade.setup || "—"]].map(([k, v]) => (
              <div key={k}><span style={{ fontSize: 11, color: C.textDim }}>{k}: </span><span style={{ fontSize: 12, fontWeight: 600 }}>{v}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PUBLIC TRADE VIEW (when URL has #share=...) ─────────────────────────────
function PublicTradeView({ encoded }) {
  let trade;
  try { trade = JSON.parse(decodeURIComponent(escape(atob(encoded)))); } catch { return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.red }}>Invalid or expired trade link.</div>; }
  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: 28, maxWidth: 680, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.accent, fontFamily: "'Inter', sans-serif" }}>ACEZELLA</div>
        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 3, textTransform: "uppercase" }}>Shared Trade</div>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{trade.symbol}</div>
          <Badge color={trade.direction === "Long" ? C.accent : C.red}>{trade.direction}</Badge>
          <Badge color={outcomeColor(trade.outcome, trade.pnl)}>{trade.outcome || (trade.pnl >= 0 ? "Win" : "Loss")}</Badge>
          <div style={{ flex: 1 }} />
          <div className="mono" style={{ fontSize: 32, fontWeight: 800, color: outcomeColor(trade.outcome, trade.pnl) }}>{fmt$(trade.pnl)}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[["Date", fmtDate(trade.date)], ["Session", trade.session], ["Setup", trade.setup || "—"], ["Entry", trade.entry ? `$${trade.entry}` : "—"], ["Exit", trade.exit ? `$${trade.exit}` : "—"], ["Pips", trade.pips ? `${trade.pips > 0 ? "+" : ""}${trade.pips}` : "—"], ["Size", `${trade.size} lot${trade.size > 1 ? "s" : ""}`], ["Mood", trade.mood], ["Outcome", trade.outcome]].map(([k, v]) => (
            <div key={k} style={{ background: C.surfaceHigh, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{k}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
        {trade.notes && <div style={{ marginTop: 16, padding: 14, background: C.surfaceHigh, borderRadius: 10, fontSize: 14, color: C.textMuted, lineHeight: 1.7 }}>{trade.notes}</div>}
      </Card>
      {trade.screenshots?.length > 0 && (
        <Card>
          <SectionLabel>Chart Screenshots</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {trade.screenshots.map(s => <img key={s.id} src={s.url} alt="" style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.border}` }} />)}
          </div>
        </Card>
      )}
      <div style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: C.textDim }}>Shared via ACEZELLA Trading Journal</div>
    </div>
  );
}

// ─── DASHBOARD CALENDAR SECTION ──────────────────────────────────────────────
function DashboardCalendarSection({ state, dispatch, onSelectTrade, setPage }) {
  const { trades, activeAccount } = state;
  const [current, setCurrent] = useState(new Date());
  const [popup, setPopup] = useState(null);

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") setPopup(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const year = current.getFullYear(), month = current.getMonth();
  const first = new Date(year, month, 1), daysInMonth = new Date(year, month + 1, 0).getDate();

  const leading = first.getDay();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < leading; i++) cells.push({ d: prevMonthDays - leading + 1 + i, inMonth: false, dateObj: new Date(year, month - 1, prevMonthDays - leading + 1 + i) });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, inMonth: true, dateObj: new Date(year, month, d) });
  let nextD = 1;
  while (cells.length < totalCells) { cells.push({ d: nextD, inMonth: false, dateObj: new Date(year, month + 1, nextD) }); nextD++; }

  const accTrades = trades.filter(t => activeAccount === "all" || t.account === activeAccount);
  const toKey = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const tradesForDate = dt => accTrades.filter(t => t.date.startsWith(toKey(dt)));
  const getDayNote = dt => state.journalNotes?.[toKey(dt)]?.calendarNote || "";
  const getWeekNote = row => state.weeklyNotes?.[`weekOf:${toKey(row[0].dateObj)}`] || "";
  const monthTrades = accTrades.filter(t => { const dd = new Date(t.date); return dd.getMonth() === month && dd.getFullYear() === year; });
  const mStats = calcStats(monthTrades);
  const tradingDays = new Set(monthTrades.map(t => t.date.slice(0, 10))).size;

  const weekRows = [];
  for (let i = 0; i < cells.length; i += 7) weekRows.push(cells.slice(i, i + 7));

  const weekStats = (row) => {
    const wTrades = row.filter(c => c.inMonth).flatMap(c => tradesForDate(c.dateObj));
    const s = calcStats(wTrades);
    const activeDays = new Set(wTrades.map(t => t.date.slice(0, 10))).size;
    return { ...s, days: activeDays, count: wTrades.length };
  };

  const CELL_H = 110;

  return (
    <Card style={{ padding: "20px 20px 18px", position: "relative", overflow: popup ? "hidden" : "visible" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setCurrent(new Date(year, month - 1, 1))} style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, width: 30, height: 30, cursor: "pointer", fontSize: 16 }}>‹</button>
        <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>{current.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
        <button onClick={() => setCurrent(new Date(year, month + 1, 1))} style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, width: 30, height: 30, cursor: "pointer", fontSize: 16 }}>›</button>
        <button onClick={() => setCurrent(new Date())} style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, color: C.textMuted, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Today</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: C.textMuted }}>Monthly stats:</span>
        <span className="mono" style={{ color: mStats.netPnl >= 0 ? C.accent : C.red, fontWeight: 800, fontSize: 15 }}>{mStats.netPnl >= 0 ? "+" : ""}{fmt$(mStats.netPnl).replace("+","").replace("-","")}</span>
        <Badge color={C.blue}>{tradingDays} days · {monthTrades.length} trades</Badge>
      </div>

      {/* Calendar grid + week sidebar */}
      <div className="calendar-scroll" style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 158px", gap: 10, minWidth: 680 }}>
          {/* Main grid */}
          <div>
            {/* Day headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 12, color: C.text, fontWeight: 700, padding: "9px 0", background: C.surfaceHigh, borderRadius: 10 }}>{d}</div>
              ))}
            </div>
            {/* Weeks */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {weekRows.map((row, ri) => (
                <div key={ri} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                  {row.map((c, ci) => {
                    const dt = tradesForDate(c.dateObj);
                    const pnl = dt.reduce((s, t) => s + t.pnl, 0);
                    const wins = dt.filter(t => t.outcome === "Win" || (t.outcome !== "Loss" && t.outcome !== "BE" && t.pnl > 0)).length;
                    const decided = dt.filter(t => t.outcome !== "BE").length;
                    const winPct = decided ? Math.round((wins / decided) * 100) : null;
                    const isToday = c.dateObj.toDateString() === new Date().toDateString();
                    const hasTrades = dt.length > 0 && c.inMonth;
                    const hasNote = c.inMonth && !!getDayNote(c.dateObj);
                    return (
                      <div key={ci}
                        onClick={() => c.inMonth && setPopup({ kind: "day", dateObj: c.dateObj })}
                        onMouseEnter={e => c.inMonth && (e.currentTarget.style.transform = "scale(1.025)")}
                        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                        style={{
                          height: CELL_H, borderRadius: 12, padding: "10px 12px", cursor: c.inMonth ? "pointer" : "default",
                          position: "relative", overflow: "hidden", boxSizing: "border-box",
                          background: !hasTrades ? C.surfaceHigh : pnl >= 0 ? `${C.accent}1c` : `${C.red}1c`,
                          border: isToday ? `2px solid #8b5cf6` : hasTrades ? `1px solid ${pnl >= 0 ? C.accent + "70" : C.red + "70"}` : `1px solid ${C.border}`,
                          opacity: c.inMonth ? 1 : 0.28,
                          transition: "transform 0.12s",
                          display: "flex", flexDirection: "column",
                        }}>
                        {hasNote && <span title="Has a note" style={{ position: "absolute", top: 7, left: 8, fontSize: 10, color: C.purple, zIndex: 1 }}>📝</span>}
                        {hasTrades ? (
                          <>
                            <div style={{ position: "absolute", top: 8, right: 10, fontSize: 11, color: C.textDim, fontWeight: 600 }}>{c.d}</div>
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
                              <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: pnl >= 0 ? C.accent : C.red }}>
                                {pnl >= 0 ? "+" : "-"}${Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </div>
                              <div style={{ fontSize: 11, color: C.textMuted }}>{dt.length} trade{dt.length !== 1 ? "s" : ""}</div>
                              {winPct !== null && <div style={{ fontSize: 11, fontWeight: 700, color: winPct >= 60 ? C.accent : C.red }}>{winPct}%</div>}
                            </div>
                          </>
                        ) : (
                          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 17, fontWeight: 700, color: isToday ? "#8b5cf6" : C.textMuted }}>{c.d}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Week summary sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ height: 34 }} /> {/* spacer for day headers */}
            {weekRows.map((row, ri) => {
              const ws = weekStats(row);
              const hasAny = ws.count > 0;
              const hasNote = !!getWeekNote(row);
              const positive = ws.netPnl > 0, negative = ws.netPnl < 0;
              return (
                <div key={ri}
                  onClick={() => setPopup({ kind: "week", row, weekIndex: ri })}
                  style={{
                    minHeight: CELL_H, borderRadius: 12, padding: "12px 14px", cursor: "pointer", position: "relative",
                    background: !hasAny ? C.surfaceHigh : positive ? `${C.accent}14` : negative ? `${C.red}14` : C.surfaceHigh,
                    border: `1px solid ${!hasAny ? C.border : positive ? C.accent + "55" : negative ? C.red + "55" : C.border}`,
                    display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box", overflow: "hidden",
                  }}>
                  {hasNote && <span title="Has a note" style={{ position: "absolute", top: 7, right: 8, fontSize: 10, color: C.purple }}>📝</span>}
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, marginBottom: 5 }}>Week {ri + 1}</div>
                    <div className="mono" style={{ fontSize: 17, fontWeight: 800, color: !hasAny ? C.textMuted : positive ? C.accent : negative ? C.red : C.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {hasAny ? (positive ? "+" : "-") + "$" + Math.abs(ws.netPnl).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "$0"}
                    </div>
                  </div>
                  <div style={{ display: "inline-block", background: "#8b5cf61f", color: "#a78bfa", border: "1px solid #8b5cf63a", borderRadius: 7, padding: "4px 8px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", width: "fit-content", marginTop: 6, boxSizing: "border-box" }}>
                    {ws.days} day{ws.days !== 1 ? "s" : ""} · {ws.count} trade{ws.count !== 1 ? "s" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Side panel — anchored to this calendar card (not the page), so it only overlays the calendar section */}
      {popup && (() => {
        const isDay = popup.kind === "day";
        const dt = isDay
          ? tradesForDate(popup.dateObj)
          : popup.row.filter(c => c.inMonth).flatMap(c => tradesForDate(c.dateObj)).sort((a, b) => new Date(a.date) - new Date(b.date));
        const s = calcStats(dt);
        const wins = dt.filter(t => t.outcome === "Win" || (t.outcome !== "Loss" && t.outcome !== "BE" && t.pnl > 0)).length;
        const losses = dt.filter(t => t.outcome === "Loss" || (t.outcome !== "Win" && t.outcome !== "BE" && t.pnl < 0)).length;
        const panelTitle = isDay
          ? popup.dateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
          : `Week ${popup.weekIndex + 1} · ${popup.row[0].dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${popup.row[6].dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
        const pnlPositive = s.netPnl >= 0;
        return (
          <div className="fade-in" style={{
            position: "absolute", top: 0, right: 0, bottom: 0, width: 310, maxWidth: "90%", zIndex: 300,
            background: C.modalBg,
            borderLeft: `1px solid ${C.border}`,
            display: "flex", flexDirection: "column",
            boxShadow: "-12px 0 48px #000a",
            overflowY: "auto",
          }}>
            {/* Header */}
            <div style={{ padding: "22px 20px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, position: "sticky", top: 0, background: C.modalBg, zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.3 }}>{panelTitle}</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>{dt.length} trade{dt.length !== 1 ? "s" : ""}</div>
                </div>
                <button onClick={() => setPopup(null)} style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, color: C.textMuted, width: 30, height: 30, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
              </div>
            </div>

            {/* P&L hero card */}
            <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{
                background: pnlPositive ? `${C.accent}18` : `${C.red}18`,
                border: `1px solid ${pnlPositive ? C.accent + "50" : C.red + "50"}`,
                borderRadius: 14, padding: "16px 18px",
              }}>
                <div style={{ fontSize: 10, color: pnlPositive ? C.accent : C.red, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>
                  {isDay ? "Daily P&L" : "Weekly P&L"}
                </div>
                <div className="mono" style={{ fontSize: 30, fontWeight: 800, color: pnlPositive ? C.accent : C.red, letterSpacing: -1, marginBottom: 8 }}>
                  {pnlPositive ? "+" : "−"}${Math.abs(s.netPnl).toFixed(2)}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                  <span style={{ color: C.accent, fontWeight: 700 }}>{wins} win{wins !== 1 ? "s" : ""}</span>
                  <span style={{ color: C.red, fontWeight: 700 }}>{losses} loss{losses !== 1 ? "es" : ""}</span>
                </div>
              </div>
            </div>

            {/* Notes — jot down what happened this day/week so you can look back later */}
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 13 }}>📝</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{isDay ? "Day Notes" : "Week Notes"}</span>
              </div>
              <JournalFieldTextarea
                value={isDay ? getDayNote(popup.dateObj) : getWeekNote(popup.row)}
                onSave={v => {
                  if (isDay) dispatch({ type: "SET_JOURNAL_FIELD", date: toKey(popup.dateObj), field: "calendarNote", value: v });
                  else dispatch({ type: "SET_WEEKLY_NOTE", key: `weekOf:${toKey(popup.row[0].dateObj)}`, note: v });
                }}
                placeholder={isDay ? "What happened today? Mistakes, wins, lessons…" : "What stood out this week? Patterns, lessons, plans for next week…"}
                rows={3}
              />
            </div>

            {/* Trades list */}
            <div style={{ flex: 1, padding: "14px 18px 10px" }}>
              <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>Trades</div>
              {dt.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: C.textDim, fontSize: 13 }}>No trades logged.</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {dt.map(t => {
                  const col = outcomeColor(t.outcome, t.pnl);
                  return (
                    <div key={t.id}
                      onClick={() => { setPopup(null); onSelectTrade(t.id); }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + "66"}
                      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
                      style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 14px", cursor: "pointer", transition: "border-color 0.15s" }}>
                      {/* Symbol + direction + pnl */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{t.symbol}</span>
                        <span style={{ background: (t.direction === "Long" ? C.accent : C.red) + "22", color: t.direction === "Long" ? C.accent : C.red, border: `1px solid ${(t.direction === "Long" ? C.accent : C.red)}44`, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
                          {t.direction.toUpperCase()}
                        </span>
                        <div style={{ flex: 1 }} />
                        <span className="mono" style={{ fontWeight: 800, fontSize: 14, color: col }}>{fmt$(t.pnl)}</span>
                        <span style={{ fontSize: 12, color: col }}>♤</span>
                      </div>
                      {/* Setup + session badges */}
                      {(t.setup || t.session) && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: t.notes ? 9 : 0 }}>
                          {t.setup && <span style={{ background: C.accentDim, color: C.accent, border: `1px solid ${C.accent}33`, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>{t.setup}</span>}
                          {t.session && <span style={{ background: C.blueDim, color: C.blue, border: `1px solid ${C.blue}33`, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>{t.session}</span>}
                        </div>
                      )}
                      {/* Notes snippet */}
                      {t.notes && (
                        <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.55, borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4 }}>
                          {t.notes.length > 90 ? t.notes.slice(0, 90) + "…" : t.notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 18px 20px", borderTop: `1px solid ${C.border}`, flexShrink: 0, position: "sticky", bottom: 0, background: C.modalBg }}>
              <button
                onClick={() => { setPopup(null); setPage && setPage("journal"); }}
                style={{ width: "100%", background: `linear-gradient(90deg, ${C.blue}, ${C.purple}, ${C.accent2})`, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 14, padding: "13px 0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit", letterSpacing: 0.3 }}>
                <span style={{ fontSize: 15 }}>♤</span> View on Trades page
              </button>
            </div>
          </div>
        );
      })()}
    </Card>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function Dashboard({ state, dispatch, setPage }) {
  const { trades, accounts, activeAccount } = state;
  const [calendarViewTradeId, setCalendarViewTradeId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [rangeOpen, setRangeOpen] = useState(false);

  if (calendarViewTradeId) {
    const trade = trades.find(t => t.id === calendarViewTradeId);
    if (trade) return <TradeDetail trade={trade} state={state} dispatch={dispatch} onBack={() => setCalendarViewTradeId(null)} onSelectTrade={id => setCalendarViewTradeId(id)} setPage={setPage} />;
  }
  const now = new Date();
  const filtered = trades.filter(t => {
    const accOk = activeAccount === "all" || t.account === activeAccount;
    if (!accOk) return false;
    if (filter === "7d") return (now - new Date(t.date)) / 86400000 <= 7;
    if (filter === "30d") return (now - new Date(t.date)) / 86400000 <= 30;
    if (filter === "90d") return (now - new Date(t.date)) / 86400000 <= 90;
    if (filter === "custom" && customRange.from && customRange.to) {
      const d = t.date.slice(0, 10);
      return d >= customRange.from && d <= customRange.to;
    }
    return true;
  });
  const stats = calcStats(filtered);
  const sorted = [...trades].sort((a, b) => new Date(b.date) - new Date(a.date));
  let streak = 0; for (const t of sorted) { if (t.outcome === "Win" || t.pnl > 0) streak++; else break; }
  const accName = activeAccount === "all" ? "All Accounts" : accounts.find(a => a.id === activeAccount)?.name;
  const accountTrades = trades.filter(t => activeAccount === "all" || t.account === activeAccount);

  // ── extra derived metrics for the redesigned dashboard ──
  const avgTrade = filtered.length ? stats.netPnl / filtered.length : 0;
  const dayPnlMap = {};
  filtered.forEach(t => { const k = t.date.slice(0, 10); dayPnlMap[k] = (dayPnlMap[k] || 0) + t.pnl; });
  const tradingDayCount = Object.keys(dayPnlMap).length;
  const winningDayCount = Object.values(dayPnlMap).filter(v => v > 0).length;
  const dayWinPct = tradingDayCount ? (winningDayCount / tradingDayCount) * 100 : 0;
  const avgWLRatio = stats.avgLoss ? stats.avgWin / stats.avgLoss : stats.avgWin > 0 ? 99 : 0;

  const lowNormalRisk = filtered.filter(t => t.risk !== "High Risk").length;
  const riskScore = filtered.length ? (lowNormalRisk / filtered.length) * 100 : 0;
  const plannedExits = filtered.filter(t => t.exitBehavior === "Planned").length;
  const exitsWithData = filtered.filter(t => t.exitBehavior).length;
  const disciplineScore = exitsWithData ? (plannedExits / exitsWithData) * 100 : 0;
  const detached = filtered.filter(t => t.postTradeState === "Detached").length;
  const stateWithData = filtered.filter(t => t.postTradeState).length;
  const resilienceScore = stateWithData ? (detached / stateWithData) * 100 : 0;
  const pfScore = Math.min(100, (stats.profitFactor >= 99 ? 100 : stats.profitFactor) * 20);
  const masteryAxes = [
    { label: "Win Rate", value: stats.winRate },
    { label: "Profit Factor", value: pfScore },
    { label: "Risk", value: riskScore },
    { label: "Discipline", value: disciplineScore },
    { label: "Resilience", value: resilienceScore },
  ];
  const masteryScore = Math.round(masteryAxes.reduce((a, x) => a + x.value, 0) / masteryAxes.length);

  // Daily net P&L bars, last 14 trading days in range
  const dailyBars = Object.entries(dayPnlMap)
    .map(([k, v]) => ({ key: k, label: new Date(k).toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: v }))
    .sort((a, b) => a.key.localeCompare(b.key)).slice(-14);

  // ── Behavioral glow-card metrics (mirrors Edge Score page logic, scoped to this range) ──
  const edgeScored = filtered.map(t => edgeScoreForTrade(t)).filter(v => v != null);
  const avgEdge = edgeScored.length ? edgeScored.reduce((a, b) => a + b, 0) / edgeScored.length : 0;
  const edgeZoneInfo = edgeZone(avgEdge);

  const moodChrono = [...filtered].filter(t => t.mood).sort((a, b) => new Date(a.date) - new Date(b.date));
  let moodShifts = 0;
  for (let i = 1; i < moodChrono.length; i++) if (moodChrono[i].mood !== moodChrono[i - 1].mood) moodShifts++;
  const moodShiftRate = moodChrono.length > 1 ? (moodShifts / (moodChrono.length - 1)) * 100 : 0;
  const stabilityScore = Math.round(100 - moodShiftRate);
  const stabilityTier = stabilityScore >= 80 ? { label: "Elite Stability", color: C.accent }
    : stabilityScore >= 60 ? { label: "Stable", color: C.accent }
    : stabilityScore >= 35 ? { label: "Developing Stability", color: C.yellow }
    : { label: "Reactive", color: C.red };

  const exitLogged = filtered.filter(t => t.exitBehavior);
  const plannedExitPct = exitLogged.length ? (exitLogged.filter(t => t.exitBehavior === "Planned").length / exitLogged.length) * 100 : 0;
  const lateLossPct = exitLogged.length ? (exitLogged.filter(t => t.exitBehavior === "Late" && t.pnl < 0).length / exitLogged.length) * 100 : 0;

  const moodMode = modeOf(filtered.filter(t => t.mood).map(t => t.mood));
  const moodLoggedCount = filtered.filter(t => t.mood).length;
  const moodModePct = moodMode && moodLoggedCount ? (moodMode.count / moodLoggedCount) * 100 : 0;

  return (
    <div className="fade-in" style={{ padding: 28, overflowY: "auto", height: "100%", display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 28, color: C.accent, lineHeight: 1 }}>♤</span>
            <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1, color: C.accent }}>Dashboard</h1>
          </div>
          <div style={{ fontSize: 15, color: C.textMuted, marginTop: 4 }}>Your trading performance at a glance</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {[["7d", "7D"], ["30d", "30D"], ["90d", "90D"], ["all", "All"]].map(([v, l]) => {
            const active = filter === v;
            return (
              <button key={v} onClick={() => { setFilter(v); setRangeOpen(false); }} style={{
                padding: "11px 20px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${active ? "transparent" : C.border}`,
                background: active ? "linear-gradient(135deg, #fdfaf4, #f3e9e0)" : C.surfaceHigh,
                color: active ? "#161a22" : C.text,
              }}>{l}</button>
            );
          })}
          <div style={{ position: "relative" }}>
            <button onClick={() => setRangeOpen(o => !o)} style={{
              display: "flex", alignItems: "center", gap: 9, padding: "11px 22px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", border: "1px solid transparent",
              background: filter === "custom" ? "linear-gradient(135deg, #fdfaf4, #f3e9e0)" : "linear-gradient(135deg, #fdfaf4, #f3e9e0)",
              color: "#161a22", whiteSpace: "nowrap",
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#161a22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M3 10h18" /><path d="M8 2v4" /><path d="M16 2v4" /></svg>
              {filter === "custom" && customRange.from && customRange.to ? `${customRange.from} – ${customRange.to}` : "Date range"}
            </button>
            {rangeOpen && (
              <>
                <div onClick={() => setRangeOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 39 }} />
                <div className="fade-in" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 40, background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, boxShadow: "0 12px 30px #000a", minWidth: 260 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <Inp label="From" type="date" value={customRange.from} onChange={v => setCustomRange(r => ({ ...r, from: v }))} />
                    <Inp label="To" type="date" value={customRange.to} onChange={v => setCustomRange(r => ({ ...r, to: v }))} />
                    <Btn small onClick={() => { if (customRange.from && customRange.to) { setFilter("custom"); setRangeOpen(false); } }} style={{ justifyContent: "center", marginTop: 4 }}>Apply</Btn>
                  </div>
                </div>
              </>
            )}
          </div>
          <Btn variant="gradient" onClick={() => openAddTrade(state, dispatch)} style={{ padding: "11px 24px", fontSize: 14 }}>+ Add Trade</Btn>
        </div>
      </div>
      {/* Account filter chips */}
      {activeAccount === "all" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {accounts.map(a => {
            const aStats = calcStats(trades.filter(t => t.account === a.id));
            return (
              <div key={a.id} onClick={() => dispatch({ type: "SET_ACTIVE_ACCOUNT", id: a.id })} style={{ background: a.color + "15", border: `1px solid ${a.color}44`, borderRadius: 10, padding: "8px 14px", cursor: "pointer", display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: a.color }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: a.color }}>{a.name}</span>
                <span className="mono" style={{ fontSize: 13, color: aStats.netPnl >= 0 ? C.accent : C.red, fontWeight: 700 }}>{fmt$(aStats.netPnl)}</span>
                <Badge color={C.textMuted}>{a.type}</Badge>
              </div>
            );
          })}
        </div>
      )}

      {/* Row 1 — headline metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <StatCard label="Net P&L" value={fmt$(stats.netPnl)} color={stats.netPnl >= 0 ? C.accent : C.red} sub={`${filtered.length} trades`} icon="$" iconColor={C.accent} />
        <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} sub={`${stats.wins}W · ${stats.losses}L · ${stats.be}BE`} icon="◎" iconColor={C.accent} />
        <StatCard label="Profit Factor" value={stats.profitFactor >= 99 ? "∞" : stats.profitFactor.toFixed(2)} sub={`Expectancy ${fmt$(stats.expectancy)}`} icon="⟐" iconColor={C.accent} />
        <StatCard label="Avg Trade" value={fmt$(avgTrade)} color={avgTrade >= 0 ? C.accent : C.red} icon="📈" iconColor={C.blue} />
      </div>

      {/* Row 2 — secondary metrics incl. win/loss distribution + pips */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <StatCard label="Total Trades" value={filtered.length} sub="logged trades" />
        <StatCard label="Day Win %" value={`${dayWinPct.toFixed(1)}%`} sub={`${winningDayCount}/${tradingDayCount} trading days`} />
        <Card>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Win/Loss Distribution</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 64, minWidth: 64, flexShrink: 0, overflow: "hidden" }}><DonutChart segments={[{ label: "Wins", value: stats.wins, color: C.accent }, { label: "Losses", value: stats.losses, color: C.red }]} size={64} thickness={11} showLegend={false} /></div>
            <div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 800 }}><span style={{ color: C.accent }}>{stats.wins}</span> <span style={{ color: C.textDim, fontWeight: 600, fontSize: 11 }}>Wins</span></div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 800 }}><span style={{ color: C.red }}>{stats.losses}</span> <span style={{ color: C.textDim, fontWeight: 600, fontSize: 11 }}>Losses</span></div>
            </div>
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Avg Win/Loss Ratio</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{avgWLRatio >= 99 ? "∞" : avgWLRatio.toFixed(2)}</div>
          <div style={{ height: 6, borderRadius: 3, overflow: "hidden", display: "flex", background: C.border }}>
            <div style={{ width: `${Math.min(100, (stats.avgWin / (stats.avgWin + stats.avgLoss || 1)) * 100)}%`, background: C.accent }} />
            <div style={{ flex: 1, background: C.red }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textDim, marginTop: 6 }}><span>{fmt$(stats.avgWin)}</span><span>{fmt$(-stats.avgLoss)}</span></div>
        </Card>
      </div>

      {/* Row 3 — pips, avg winner/loser, win streak */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <StatCard label="Avg Winner" value={fmt$(stats.avgWin)} color={C.accent} />
        <StatCard label="Avg Loser" value={fmt$(stats.avgLoss)} color={C.red} />
        <StatCard label="Total Pips" value={`${stats.totalPips >= 0 ? "+" : ""}${stats.totalPips.toFixed(1)}`} color={stats.totalPips >= 0 ? C.accent : C.red} sub="pips gained/lost" />
        <StatCard label="Win Streak" value={streak} sub="consecutive wins" color={streak >= 3 ? C.accent : C.text} />
      </div>

      {/* Row 3.5 — Behavioral snapshot */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <GlowStatCard icon="badge" glow={edgeZoneInfo.color} title="Behavioral Edge™" value={`${avgEdge.toFixed(2)} / 10`} subtitle={edgeZoneInfo.label} />
        <GlowStatCard icon="pulse" glow={stabilityTier.color} title="Emotional Stability" value={`${stabilityScore}%`} subtitle={`${stabilityTier.label} · Shift Rate: ${moodShiftRate.toFixed(0)}%`} />
        <GlowStatCard icon="target" glow={plannedExitPct >= 60 ? C.accent : C.yellow} title="Exit Discipline" value={`${plannedExitPct.toFixed(0)}%`} subtitle={`Late-Loss Rate: ${lateLossPct.toFixed(0)}%`} />
        <GlowStatCard icon="brain" glow={moodMode ? moodColor(moodMode.value) : C.accent} title="Dominant Emotion" value={moodMode ? moodMode.value : "—"} subtitle={moodMode ? `Used in ${moodMode.count} trades (${moodModePct.toFixed(0)}%)` : "No moods logged yet"} />
      </div>

      {/* Row 4 — Trading Mastery Score / Daily P&L / Equity Curve */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1.2fr", gap: 16, alignItems: "stretch" }}>
        <Card>
          <SectionLabel>Trading Mastery Score</SectionLabel>
          <RadarChart axes={masteryAxes} size={260} />
          <div style={{ textAlign: "center", marginTop: -6 }}>
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Your Score</div>
            <div className="mono" style={{ fontSize: 30, fontWeight: 800, color: masteryScore >= 70 ? C.accent : masteryScore >= 45 ? C.yellow : C.red }}>{masteryScore}</div>
          </div>
        </Card>
        <Card>
          <SectionLabel>Net Daily P&L</SectionLabel>
          <GridBarChart data={dailyBars} height={260} />
        </Card>
        <Card>
          <EquityCurveChart trades={accountTrades} height={280} />
        </Card>
      </div>

      {/* Calendar Section */}
      <div>
        <SectionLabel>Calendar</SectionLabel>
        <DashboardCalendarSection state={state} dispatch={dispatch} onSelectTrade={setCalendarViewTradeId} setPage={setPage} />
      </div>

      <Card style={{ padding: 0 }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Recent Trades</div>
        {filtered.slice(0, 10).map(t => (
          <div key={t.id} onClick={() => setCalendarViewTradeId(t.id)}
            onMouseEnter={e => e.currentTarget.style.background = C.surfaceHigh}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            style={{ display: "flex", alignItems: "center", padding: "11px 20px", borderBottom: `1px solid ${C.border}20`, gap: 14, cursor: "pointer", transition: "background 0.1s" }}>
            <div style={{ width: 3, height: 36, background: outcomeColor(t.outcome, t.pnl), borderRadius: 2 }} />
            <Badge color={t.direction === "Long" ? C.accent : C.red}>{t.direction}</Badge>
            <div style={{ flex: 1 }}><span style={{ fontWeight: 700, fontSize: 15 }}>{t.symbol}</span><span style={{ marginLeft: 8, fontSize: 12, color: C.textMuted }}>{t.setup} · {t.session}</span></div>
            {t.pips !== undefined && t.pips !== 0 && <span style={{ fontSize: 12, color: t.pips > 0 ? C.accent : C.red }}>{t.pips > 0 ? "+" : ""}{t.pips} pips</span>}
            <Badge color={outcomeColor(t.outcome, t.pnl)}>{t.outcome}</Badge>
            <div className="mono" style={{ fontWeight: 700, fontSize: 16, color: outcomeColor(t.outcome, t.pnl), minWidth: 90, textAlign: "right" }}>{fmt$(t.pnl)}</div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ padding: 32, textAlign: "center", color: C.textDim }}>No trades yet. Click "+ Add Trade" to get started.</div>}
      </Card>
    </div>
  );
}

// ─── JOURNAL ──────────────────────────────────────────────────────────────────
// ─── deterministic badge color for arbitrary string values ──────────────────
function hashColor(str, palette = [C.blue, "#2dd4bf", C.yellow, "#9b6bff", "#ff8844", C.red, C.accent]) {
  if (!str) return C.textMuted;
  let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
const moodColor = (m) => m === "Focus" || m === "Focused" || m === "Confident" || m === "Patient" ? C.accent : m === "Anxious" || m === "Anger" || m === "Fear" ? C.red : m === "Greedy" || m === "Greed" || m === "Impulsive" ? "#ff8844" : hashColor(m);
const exitBehaviorColor = (eb, outcome) => eb === "Planned" ? C.accent : eb === "Late" ? C.red : eb === "Early" ? C.yellow : C.textMuted;
const postTradeStateColor = (s) => s === "Detached" ? C.accent : s === "Attached" ? C.red : s === "Neutral" ? C.yellow : C.textMuted;
const POSITIVE_MOODS = ["Focus", "Focused", "Confident", "Patient"];
const NEGATIVE_MOODS = ["Fear", "Anger", "Greed", "Anxious", "Greedy", "Impulsive"];

function Journal({ state, dispatch, setPage }) {
  const { trades, activeAccount, strategies } = state;
  const [search, setSearch] = useState(""), [filterDir, setFilterDir] = useState("All"), [filterOutcome, setFilterOutcome] = useState("All"), [selected, setSelected] = useState(null);
  const [sortField, setSortField] = useState("date"), [sortDir, setSortDir] = useState("desc"), [hoverId, setHoverId] = useState(null);
  const visible = trades.filter(t => {
    const accOk = activeAccount === "all" || t.account === activeAccount;
    const q = search.toLowerCase();
    const matchQ = !q || t.symbol.toLowerCase().includes(q) || t.setup?.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q);
    return accOk && matchQ && (filterDir === "All" || t.direction === filterDir) && (filterOutcome === "All" || t.outcome === filterOutcome || (filterOutcome === "Win" && t.pnl > 0 && !t.outcome) || (filterOutcome === "Loss" && t.pnl < 0 && !t.outcome));
  });
  const sorted = [...visible].sort((a, b) => {
    let av, bv;
    if (sortField === "date") { av = new Date(a.date); bv = new Date(b.date); }
    else if (sortField === "pnl") { av = a.pnl; bv = b.pnl; }
    else if (sortField === "pips") { av = a.pips || 0; bv = b.pips || 0; }
    else { av = (a[sortField] || "").toString().toLowerCase(); bv = (b[sortField] || "").toString().toLowerCase(); }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  const toggleSort = (field) => { if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(field); setSortDir("desc"); } };
  const sortArrow = (field) => sortField === field ? (sortDir === "asc" ? " ↑" : " ↓") : " ⇅";

  if (selected) { const trade = trades.find(t => t.id === selected); return trade ? <TradeDetail trade={trade} state={state} dispatch={dispatch} onBack={() => setSelected(null)} onSelectTrade={id => setSelected(id)} setPage={setPage} /> : null; }

  const th = (label, field) => (
    <th onClick={field ? () => toggleSort(field) : undefined} style={{ position: "sticky", top: 0, background: C.surface, padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, color: field && sortField === field ? C.accent : C.textMuted, cursor: field ? "pointer" : "default", whiteSpace: "nowrap", userSelect: "none", borderBottom: `1px solid ${C.border}` }}>
      {label}{field && <span style={{ fontSize: 10, opacity: 0.7 }}>{sortArrow(field)}</span>}
    </th>
  );
  const td = (children, extra = {}) => <td style={{ padding: "11px 14px", fontSize: 13, whiteSpace: "nowrap", ...extra }}>{children}</td>;

  return (
    <div className="fade-in" style={{ height: "100%", overflow: "hidden", padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1, flex: 1, color: C.accent }}>♤ Trades</h1>
        <Btn small variant="gradient2" onClick={() => isPlus(state) ? (setPage && setPage("import")) : dispatch({ type: "OPEN_MODAL", modal: "upgrade" })}>Import Trades {!isPlus(state) && <PlusBadge small />}</Btn>
        <div style={{ position: "relative" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "8px 14px 8px 34px", fontSize: 13, outline: "none", width: 200 }} />
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.textDim }}>⌕</span>
        </div>
        {["All", "Long", "Short"].map(d => <Btn key={d} small variant={filterDir === d ? "success" : "ghost"} onClick={() => setFilterDir(d)}>{d}</Btn>)}
        {["All", "Win", "Loss", "BE"].map(o => <Btn key={o} small variant={filterOutcome === o ? (o === "Win" ? "success" : o === "Loss" ? "danger" : o === "BE" ? "warn" : "ghost") : "ghost"} onClick={() => setFilterOutcome(o)}>{o === "BE" ? "Breakeven" : o}</Btn>)}
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, flexShrink: 0 }}>{visible.length} trades · {calcStats(visible).netPnl >= 0 ? "+" : ""}${calcStats(visible).netPnl.toFixed(2)} · {calcStats(visible).totalPips >= 0 ? "+" : ""}{calcStats(visible).totalPips.toFixed(1)} pips</div>
      {visible.length === 0 && <div style={{ textAlign: "center", padding: 60, color: C.textDim }}>No trades found.</div>}
      {visible.length > 0 && (
        <Card style={{ padding: 0, overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {th("Date", "date")}
                  {th("Symbol", "symbol")}
                  {th("Direction", "direction")}
                  {th("Setup", "setup")}
                  {th("Time Frame")}
                  {th("Session")}
                  {th("Risk")}
                  {th("Pre-Emotion")}
                  {th("Exit Behavior")}
                  {th("P&L", "pnl")}
                  {th("Pips", "pips")}
                  {th("Screenshot")}
                  {th("Notes")}
                  {th("Actions")}
                </tr>
              </thead>
              <tbody>
                {sorted.map((t, i) => {
                  const strat = strategies.find(s => s.name === t.setup);
                  const exitLabel = t.exitBehavior ? `${t.exitBehavior}${t.exitBehavior === "Late" && (t.outcome === "Loss" || t.pnl < 0) ? " (Loss)" : ""}` : "—";
                  return (
                    <tr key={t.id} onClick={() => setSelected(t.id)} onMouseEnter={() => setHoverId(t.id)} onMouseLeave={() => setHoverId(null)}
                      style={{ cursor: "pointer", background: hoverId === t.id ? C.surfaceHigh : i % 2 ? C.bg + "60" : "transparent", borderBottom: `1px solid ${C.border}30` }}>
                      {td(hoverId === t.id
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.accentDim, color: C.accent, borderRadius: 7, padding: "4px 10px", fontWeight: 700, fontSize: 12 }}>👁 See details</span>
                        : fmtDate(t.date))}
                      {td(<b>{t.symbol}</b>)}
                      {td(<Badge color={t.direction === "Long" ? C.accent : C.red}>{t.direction === "Long" ? "♤ LONG" : "♤ SHORT"}</Badge>)}
                      {td(t.setup ? <Badge color={strat?.color || hashColor(t.setup)}>{t.setup}</Badge> : "—")}
                      {td(t.timeframe ? <Badge color={hashColor(t.timeframe)}>{t.timeframe}</Badge> : "—")}
                      {td(t.session ? <Badge color={hashColor(t.session)}>{t.session}</Badge> : "—")}
                      {td(t.risk ? <Badge color={riskColor(t.risk)}>{t.risk}</Badge> : "—")}
                      {td(t.mood ? <Badge color={moodColor(t.mood)}>{t.mood}</Badge> : "—")}
                      {td(t.exitBehavior ? <Badge color={exitBehaviorColor(t.exitBehavior)}>{exitLabel}</Badge> : "—")}
                      {td(<span className="mono" style={{ fontWeight: 700, color: outcomeColor(t.outcome, t.pnl) }}>{fmt$(t.pnl)}</span>)}
                      {td(t.pips !== undefined && t.pips !== 0 ? <span className="mono" style={{ fontWeight: 700, color: t.pips > 0 ? C.accent : C.red }}>{t.pips > 0 ? "+" : ""}{t.pips}</span> : <span style={{ color: C.textDim }}>—</span>)}
                      {td(t.screenshots?.length > 0 ? <span style={{ color: C.blue }}>📷 {t.screenshots.length}</span> : <span style={{ color: C.textDim }}>—</span>)}
                      {td(t.notes ? <Badge color="#9b6bff">📄 Open</Badge> : <span style={{ color: C.textDim }}>—</span>)}
                      {td(
                        <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => dispatch({ type: "OPEN_MODAL", modal: { type: "add_trade", trade: t } })} style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: C.blueDim, color: C.blue, cursor: "pointer", fontSize: 12 }}>✏️</button>
                          <button onClick={() => dispatch({ type: "DELETE_TRADE", id: t.id })} style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: C.redDim, color: C.red, cursor: "pointer", fontSize: 12 }}>🗑️</button>
                        </div>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── IMPORT TRADES ────────────────────────────────────────────────────────────
// Generic broker/CSV parser shared by every import source below. Broker-
// specific column names (TopStepX, Tradovate, TradingView, etc.) mostly
// agree on the same handful of concepts (date, symbol, side, pnl…), so one
// forgiving header-matching parser covers the vast majority of exports.
// "Custom CSV Format" and "Any Broker (AI)" both route through this same
// function — the difference is just messaging on the card.
function parseGenericCSV(text, accountId) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (lines.length < 2) return [];
  const splitRow = line => (line.match(/(".*?"|[^,]+)/g) || []).map(v => v.replace(/^"|"$/g, "").trim());
  const headers = splitRow(lines[0]).map(h => h.toLowerCase());
  const find = (row, ...keys) => { for (const k of keys) if (row[k] !== undefined && row[k] !== "") return row[k]; return ""; };
  const trades = lines.slice(1).map((line, i) => {
    const vals = splitRow(line);
    const row = {};
    headers.forEach((h, j) => row[h] = vals[j] ?? "");
    const pnl = parseFloat(find(row, "pnl", "p&l", "profit", "net p&l", "net pnl").toString().replace(/[^0-9.\-]/g, "")) || 0;
    const sideRaw = find(row, "direction", "side", "type").toLowerCase();
    const dateRaw = find(row, "date", "opened", "open time", "entry date", "entry time");
    return {
      id: `t_import_${Date.now()}_${i}`,
      date: new Date(dateRaw || Date.now()).toISOString(),
      symbol: find(row, "symbol", "ticker", "instrument", "contract") || "?",
      direction: /short|sell/.test(sideRaw) ? "Short" : "Long",
      outcome: find(row, "outcome", "result") || (pnl >= 0 ? "Win" : "Loss"),
      entry: parseFloat(find(row, "entry", "entry price", "buy price")) || 0,
      exit: parseFloat(find(row, "exit", "exit price", "sell price")) || 0,
      size: parseInt(find(row, "size", "qty", "quantity", "contracts", "lots")) || 1,
      pnl,
      pips: parseFloat(find(row, "pips")) || 0,
      setup: find(row, "setup", "strategy"),
      session: find(row, "session"),
      mood: find(row, "mood", "emotion") || "Neutral",
      timeframe: find(row, "timeframe"),
      fees: parseFloat(find(row, "fees", "commission", "commissions")) || 0,
      notes: find(row, "notes", "comment", "comments"),
      account: accountId,
      screenshots: [], tags: [],
    };
  }).filter(t => t.symbol && t.symbol !== "?");
  return trades;
}

const IMPORT_SOURCES = [
  { id: "any", name: "Any Broker (AI)", badge: "AI-POWERED", badgeColor: C.purple, icon: "✨", iconBg: C.purpleDim, iconColor: C.purple,
    desc: "Upload from any broker or prop firm. Our importer auto-detects your columns and builds your journal.",
    note: "No templates. No manual formatting. Works with any CSV export.",
    tags: [{ label: "Universal Mapping", color: C.purple }, { label: "All Markets", color: C.blue }, { label: "Any Prop Firm", color: C.purple }] },
  { id: "topstepx", name: "TopStepX CSV", icon: "TX", iconBg: "#00000022", iconColor: C.text,
    desc: "Import trades directly from TopStepX platform exports.",
    tags: [{ label: "Auto-mapping", color: C.accent }, { label: "Duplicate Detection", color: C.accent }] },
  { id: "tradovate", name: "Tradovate CSV", icon: "TV", iconBg: C.blueDim, iconColor: C.blue,
    desc: "Import trades from Tradovate Account Reports.",
    tags: [{ label: "Auto-mapping", color: C.blue }, { label: "P&L included", color: C.blue }] },
  { id: "tradingview", name: "TradingView CSV", badge: "AI-POWERED", badgeColor: C.purple, icon: "▲", iconBg: "#00000022", iconColor: C.text,
    desc: "Import trades from TradingView. Reconstructs accurate trades with real P&L.",
    tags: [{ label: "AI Trade Pairing", color: C.purple }, { label: "All Markets", color: C.blue }] },
  { id: "tradesea", name: "Tradesea CSV", icon: "◆", iconBg: C.blueDim, iconColor: C.blue,
    desc: "Import Lucid Prop Firm / Tradesea order exports with automatic order pairing.",
    tags: [{ label: "Order Pairing", color: C.blue }, { label: "Futures P&L", color: C.blue }] },
  { id: "quantower", name: "Quantower CSV", icon: "Q", iconBg: C.blueDim, iconColor: C.blue,
    desc: "Import Quantower Trades panel exports with default or all selected columns.",
    tags: [{ label: "Default Fields", color: C.blue }, { label: "All Fields", color: C.blue }, { label: "Futures P&L", color: C.blue }] },
  { id: "mt5", name: "MetaTrader 5 XML", icon: "MT5", iconBg: "#00000022", iconColor: C.text,
    desc: "Import MT5 History reports exported as Open XML with FIFO trade reconstruction.",
    tags: [{ label: "FIFO Matching", color: C.accent }, { label: "Deal ID Deduping", color: C.accent }, { label: "Forex / CFD", color: C.accent }] },
  { id: "ctrader", name: "cTrader XLSX/CSV", icon: "cT", iconBg: C.redDim, iconColor: C.red,
    desc: "Import Forex trade statements exported from cTrader History.",
    tags: [{ label: "Partial Exits", color: C.red }, { label: "XLSX/CSV", color: C.red }, { label: "Forex Statements", color: C.red }, { label: "Duplicate Check", color: C.red }] },
  { id: "tradezella", name: "TradeZella CSV", icon: "Z", iconBg: C.purpleDim, iconColor: C.purple,
    desc: "Import trades directly from TradeZella exports. Smart column detection — works even with filtered views.",
    note: "Automatically splits multiple setups per trade & creates Playbooks.",
    tags: [{ label: "Smart Auto-Mapping", color: C.purple }, { label: "Multi-Setup Support", color: C.purple }] },
  { id: "custom", name: "Custom CSV Format", icon: "📄", iconBg: C.blueDim, iconColor: C.blue,
    desc: "Use your own CSV file format — we'll match common column names automatically.",
    tags: [{ label: "Flexible format", color: C.blue }] },
];

function ImportSourceCard({ src, onFile, busy }) {
  const fileRef = useRef();
  return (
    <Card style={{ padding: 22, position: "relative", display: "flex", flexDirection: "column", gap: 14 }}>
      {src.badge && <div style={{ position: "absolute", top: 16, right: 16, background: src.badgeColor, color: "#fff", fontSize: 9, fontWeight: 800, padding: "3px 10px", borderRadius: 20, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 4 }}>✦ {src.badge}</div>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ width: 50, height: 50, borderRadius: 12, background: src.iconBg || C.surfaceHigh, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: src.iconColor || C.text, border: `1px solid ${C.border}` }}>{src.icon}</div>
        <button onClick={() => !busy && fileRef.current?.click()} disabled={busy} style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: C.surfaceHigh, color: src.iconColor || C.accent, cursor: busy ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{busy === src.id ? "…" : "→"}</button>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{src.name}</div>
        <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>{src.desc}</div>
        {src.note && <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>{src.note}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {src.tags?.map(t => <Badge key={t.label} color={t.color}>{t.label}</Badge>)}
      </div>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xml,.txt" style={{ display: "none" }} onChange={e => { onFile(e.target.files[0], src); e.target.value = ""; }} />
    </Card>
  );
}

function ImportTrades({ state, dispatch, setPage }) {
  const { accounts } = state;
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(null);
  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3800); };

  const handleFile = (file, src) => {
    if (!file) return;
    setBusy(src.id);
    const reader = new FileReader();
    reader.onload = e => {
      setBusy(null);
      try {
        const trades = parseGenericCSV(e.target.result, accounts[0]?.id || "");
        if (!trades.length) { notify(`Couldn't find any trades in that file. Double-check it's a ${src.name} export.`); return; }
        trades.forEach(t => dispatch({ type: "ADD_TRADE", trade: t }));
        notify(`✓ Imported ${trades.length} trade${trades.length !== 1 ? "s" : ""} from ${src.name}.`);
        setTimeout(() => setPage && setPage("journal"), 1000);
      } catch {
        notify("Something went wrong reading that file. Try the Custom CSV Format option.");
      }
    };
    reader.onerror = () => { setBusy(null); notify("Couldn't read that file."); };
    reader.readAsText(file);
  };

  return (
    <div className="fade-in" style={{ height: "100%", overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1, marginBottom: 8, color: C.accent }}>Import Your Trades</h1>
        <div style={{ fontSize: 14, color: C.textMuted }}>Choose your import method and upload your trading data</div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", background: C.yellowDim, border: `1px solid ${C.yellow}40`, borderRadius: 12, padding: "14px 18px", fontSize: 13, color: C.yellow, display: "flex", alignItems: "center", gap: 10 }}>
        ⚠ Imported trades are added to <b>{accounts[0]?.name || "your account"}</b> and can be reassigned any time from the Trades page.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18, maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        {IMPORT_SOURCES.map(src => <ImportSourceCard key={src.id} src={src} onFile={handleFile} busy={busy} />)}
      </div>

      {toast && <div className="fade-in" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 20px", fontSize: 13, fontWeight: 600, color: C.text, boxShadow: "0 8px 24px #0008", zIndex: 400, maxWidth: "90vw", textAlign: "center" }}>{toast}</div>}
    </div>
  );
}

// ─── MY RECORD (Green Days vs Red Days — Lifetime / This Year / This Month) ─
// Groups trades by calendar day and buckets each trading day as "green"
// (net P&L > 0), "red" (net P&L < 0), or breakeven (net P&L === 0, shown as
// a small badge rather than its own box). Trade-level counts (wins/losses/BE)
// and pips gained/lost are computed straight from calcStats so they always
// agree with the rest of the app's win/loss logic.
function buildDayPnlMap(trades) {
  const map = {};
  trades.forEach(t => { const k = t.date.slice(0, 10); map[k] = (map[k] || 0) + t.pnl; });
  return map;
}
function countGreenRedDays(dayMap) {
  let green = 0, red = 0, flat = 0;
  Object.values(dayMap).forEach(v => { if (v > 0) green++; else if (v < 0) red++; else flat++; });
  return { green, red, flat, total: green + red + flat };
}
function pipsBreakdown(trades) {
  let gained = 0, lost = 0;
  trades.forEach(t => { const p = t.pips || 0; if (p > 0) gained += p; else if (p < 0) lost += Math.abs(p); });
  return { gained, lost };
}
function buildRecordStats(pool) {
  const days = countGreenRedDays(buildDayPnlMap(pool));
  const cs = calcStats(pool);
  const pips = pipsBreakdown(pool);
  return { ...days, wins: cs.wins, losses: cs.losses, be: cs.be, pipsGained: pips.gained, pipsLost: pips.lost };
}

function RecordStatBox({ label, value, color }) {
  return (
    <div style={{ background: `${color}14`, border: `1px solid ${color}44`, borderRadius: 14, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </div>
      <div className="mono" style={{ fontSize: 24, fontWeight: 800, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

function RecordRow({ title, sub, stats }) {
  const total = stats.green + stats.red;
  const greenPct = total ? (stats.green / total) * 100 : 0;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>{sub}</div>
        </div>
        {stats.flat > 0 && <Badge color={C.yellow}>{stats.flat} breakeven day{stats.flat !== 1 ? "s" : ""}</Badge>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <RecordStatBox label="Green Days" value={stats.green} color={C.accent} />
        <RecordStatBox label="Red Days" value={stats.red} color={C.red} />
        <RecordStatBox label="Winning Trades" value={stats.wins} color={C.accent} />
        <RecordStatBox label="Losing Trades" value={stats.losses} color={C.red} />
        <RecordStatBox label="Break Even Trades" value={stats.be} color={C.yellow} />
        <RecordStatBox label="Total Pips Gained" value={`+${stats.pipsGained.toFixed(1)}`} color={C.accent} />
        <RecordStatBox label="Total Pips Lost" value={`-${stats.pipsLost.toFixed(1)}`} color={C.red} />
      </div>
      {total > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ height: 8, borderRadius: 4, overflow: "hidden", display: "flex", background: C.border }}>
            <div style={{ width: `${greenPct}%`, background: C.accent }} />
            <div style={{ flex: 1, background: C.red }} />
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>{greenPct.toFixed(0)}% green days · {total} trading day{total !== 1 ? "s" : ""}</div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.textDim, marginTop: 14 }}>No trades logged in this period yet.</div>
      )}
    </Card>
  );
}

function MyRecord({ state }) {
  const { trades, activeAccount } = state;
  const pool = trades.filter(t => activeAccount === "all" || t.account === activeAccount);
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();

  const lifetimeStats = buildRecordStats(pool);

  const yearPool = pool.filter(t => new Date(t.date).getFullYear() === year);
  const yearStats = buildRecordStats(yearPool);

  const monthPool = pool.filter(t => { const d = new Date(t.date); return d.getFullYear() === year && d.getMonth() === month; });
  const monthStats = buildRecordStats(monthPool);

  return (
    <div className="fade-in" style={{ height: "100%", overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1, display: "flex", alignItems: "center", gap: 8, color: C.accent }}><span>♤</span> My Record</h1>
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>Your green day vs. red day track record — lifetime, this year, and this month.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <RecordRow title="Lifetime" sub="All trades logged" stats={lifetimeStats} />
        <RecordRow title={`${year}`} sub="This year" stats={yearStats} />
        <RecordRow title={now.toLocaleDateString("en-US", { month: "long", year: "numeric" })} sub="This month" stats={monthStats} />
      </div>
    </div>
  );
}

// ─── MY NOTES (Journal: Graces & Goals / Daily Notes / Past Entries) ────────
const INSPIRE_QUOTES = [
  { q: "Assume the feeling of your wish fulfilled.", a: "Neville Goddard" },
  { q: "Whatever the mind can conceive and believe, it can achieve.", a: "Napoleon Hill" },
  { q: "Discipline is the bridge between goals and accomplishment.", a: "Jim Rohn" },
  { q: "The market is a device for transferring money from the impatient to the patient.", a: "Warren Buffett" },
  { q: "Risk comes from not knowing what you're doing.", a: "Warren Buffett" },
  { q: "Plans are worthless, but planning is everything.", a: "Dwight D. Eisenhower" },
  { q: "You don't have to be great to start, but you have to start to be great.", a: "Zig Ziglar" },
  { q: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", a: "Aristotle" },
  { q: "Discipline is choosing between what you want now and what you want most.", a: "Abraham Lincoln" },
  { q: "It's not that I'm so smart, it's just that I stay with problems longer.", a: "Albert Einstein" },
  { q: "Motivation gets you going, but discipline keeps you growing.", a: "John C. Maxwell" },
  { q: "The successful warrior is the average man, with laser-like focus.", a: "Bruce Lee" },
  { q: "Consistency is what transforms average into excellence.", a: "Tony Robbins" },
  { q: "You don't rise to the level of your goals, you fall to the level of your systems.", a: "James Clear" },
  { q: "Small daily improvements are the key to staggering long-term results.", a: "James Clear" },
  { q: "Focus on being productive instead of busy.", a: "Tim Ferriss" },
  { q: "The mind is everything. What you think you become.", a: "Buddha" },
  { q: "Self-control is strength. Right thought is mastery. Calmness is power.", a: "James Allen" },
  { q: "Character is the ability to carry out a good resolution long after the mood has left you.", a: "Cavett Robert" },
  { q: "Winners are not people who never fail, but people who never quit.", a: "Unknown" },
  { q: "Your habits will determine your future.", a: "Jack Canfield" },
  { q: "Success is the sum of small efforts, repeated day in and day out.", a: "Robert Collier" },
  { q: "Concentrate all your thoughts upon the work at hand.", a: "Alexander Graham Bell" },
  { q: "The pain of discipline weighs ounces, the pain of regret weighs tons.", a: "Jim Rohn" },
  { q: "What you do every day matters more than what you do once in a while.", a: "Gretchen Rubin" },
  { q: "A river cuts through rock not because of its power, but because of its persistence.", a: "Jim Watkins" },
  { q: "Patience, persistence and perspiration make an unbeatable combination for success.", a: "Napoleon Hill" },
  { q: "Do not wait to strike till the iron is hot, but make it hot by striking.", a: "William B. Sprague" },
  { q: "The chains of habit are too weak to be felt until they are too strong to be broken.", a: "Samuel Johnson" },
  { q: "Slow and steady wins the race.", a: "Aesop" },
];
const INSPIRE_VERSES = [
  { v: "I can do all things through Christ who strengthens me.", r: "Philippians 4:13" },
  { v: "ALLAH Is Enough For Me.", r: "9:129 Quran", link: "https://myislam.org/surah-taubah/ayat-129/" },
  { v: "Be still, and know that I am God.", r: "Psalm 46:10" },
  { v: "Commit to the Lord whatever you do, and He will establish your plans.", r: "Proverbs 16:3" },
  { v: "For I know the plans I have for you, declares the Lord.", r: "Jeremiah 29:11" },
];
// Short daily Quran ayat — one is picked deterministically per calendar day
// (via pickForDate/hashDateSeed, same mechanism used for the quote/verse of
// the day), so it stays the same all day and rotates automatically right
// after midnight.
const QURAN_AYATS = [
  { v: "Indeed, with hardship [there is] ease.", r: "Surah Ash-Sharh 94:6" },
  { v: "So remember Me; I will remember you.", r: "Surah Al-Baqarah 2:152" },
  { v: "And whoever relies upon Allah — then He is sufficient for him.", r: "Surah At-Talaq 65:3" },
  { v: "Verily, in the remembrance of Allah do hearts find rest.", r: "Surah Ar-Ra'd 13:28" },
  { v: "Allah does not burden a soul beyond that it can bear.", r: "Surah Al-Baqarah 2:286" },
  { v: "Indeed, Allah is with the patient.", r: "Surah Al-Baqarah 2:153" },
  { v: "And He is with you wherever you are.", r: "Surah Al-Hadid 57:4" },
  { v: "Your Lord has not forsaken you, nor has He detested you.", r: "Surah Ad-Duha 93:3" },
  { v: "My Lord, expand for me my breast [with assurance].", r: "Surah Ta-Ha 20:25" },
  { v: "And say, My Lord, increase me in knowledge.", r: "Surah Ta-Ha 20:114" },
  { v: "Allah is the best of planners.", r: "Surah Al-Anfal 8:30" },
  { v: "Do not lose hope, nor be sad.", r: "Surah Aal-e-Imran 3:139" },
];
function dateKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
// Deterministic "random" pick seeded by the calendar date — same all day, changes right after midnight.
function hashDateSeed(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
function pickForDate(list, dayKey, salt = "") { return list[hashDateSeed(dayKey + salt) % list.length]; }


function JournalFieldTextarea({ value, onSave, placeholder, rows = 4 }) {
  const [v, setV] = useState(value || "");
  useEffect(() => { setV(value || ""); }, [value]);
  return (
    <textarea value={v} onChange={e => setV(e.target.value)} onBlur={() => { if (v !== (value || "")) onSave(v); }}
      placeholder={placeholder} rows={rows}
      style={{ width: "100%", background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: 14, fontSize: 14, resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.6 }} />
  );
}

function MyNotes({ state, dispatch }) {
  const journalNotes = state.journalNotes || {};
  const [tab, setTab] = useState("graces");
  const [month, setMonth] = useState(new Date());
  const [search, setSearch] = useState("");
  const [popupDate, setPopupDate] = useState(null);
  const [savedFlash, setSavedFlash] = useState("");
  const mentorFileRef = useRef();

  const today = new Date();
  const todayKey = dateKey(today);
  const quote = pickForDate(INSPIRE_QUOTES, todayKey, "q");
  const verse = pickForDate(INSPIRE_VERSES, todayKey, "v");
  const ayat = pickForDate(QURAN_AYATS, todayKey, "ayat");

  const todayEntry = journalNotes[todayKey] || {};
  const graces = todayEntry.graces && todayEntry.graces.length === 5 ? todayEntry.graces : ["", "", "", "", ""];

  const saveField = (field, value) => {
    dispatch({ type: "SET_JOURNAL_FIELD", date: todayKey, field, value });
    setSavedFlash(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
  };
  const saveGrace = (i, value) => { const next = [...graces]; next[i] = value; saveField("graces", next); };
  const handleMentorScreenshot = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => saveField("mentorScreenshot", e.target.result);
    reader.readAsDataURL(file);
  };

  // ── Past Entries calendar grid ──
  const year = month.getFullYear(), mo = month.getMonth();
  const first = new Date(year, mo, 1), daysInMonth = new Date(year, mo + 1, 0).getDate();
  const leading = first.getDay();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const prevMonthDays = new Date(year, mo, 0).getDate();
  const cells = [];
  for (let i = 0; i < leading; i++) cells.push({ d: prevMonthDays - leading + 1 + i, inMonth: false, dateObj: new Date(year, mo - 1, prevMonthDays - leading + 1 + i) });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, inMonth: true, dateObj: new Date(year, mo, d) });
  let nextD = 1;
  while (cells.length < totalCells) { cells.push({ d: nextD, inMonth: false, dateObj: new Date(year, mo + 1, nextD) }); nextD++; }

  const hasEntry = (k) => {
    const e = journalNotes[k];
    if (!e) return false;
    return !!(e.quickNotes || e.selfReview || e.mentorNotes || e.mainGoal || e.feelingResults || (e.graces && e.graces.some(Boolean)));
  };
  const matchesSearch = (k) => {
    if (!search.trim()) return true;
    const e = journalNotes[k]; if (!e) return false;
    const q = search.toLowerCase();
    const hay = [e.quickNotes, e.selfReview, e.mentorNotes, e.mainGoal, e.feelingResults, ...(e.graces || [])].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  };

  const popupEntry = popupDate ? (journalNotes[dateKey(popupDate)] || {}) : null;

  return (
    <div className="fade-in" style={{ height: "100%", overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: C.accent }}>♤ My Notes</h1>
        <div style={{ fontSize: 13, color: C.textMuted, fontStyle: "italic", marginTop: 4 }}>"For as a man thinks in his heart, so is he"</div>
      </div>

      <div style={{ display: "flex", gap: 8, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 6, maxWidth: 640, margin: "0 auto", width: "100%" }}>
        {[["graces", "🚩 Graces and Goals"], ["daily", "📄 Daily Notes"], ["past", "📅 Past Entries"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: "10px 12px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
            background: tab === id ? `linear-gradient(90deg, ${C.blue}, ${C.purple}, ${C.accent2})` : "transparent", color: tab === id ? "#001018" : C.textMuted }}>{label}</button>
        ))}
      </div>

      {tab === "graces" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 780, margin: "0 auto", width: "100%" }}>
          <Card style={{ textAlign: "center", padding: 28 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>✨</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
            <div style={{ fontSize: 14, color: C.textMuted, fontStyle: "italic", marginTop: 14 }}>"{verse.v}"</div>
            {verse.link ? (
              <a href={verse.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.accent, marginTop: 4, display: "inline-block", textDecoration: "underline" }}>{verse.r}</a>
            ) : (
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>{verse.r}</div>
            )}
            <div style={{ height: 1, background: C.border, margin: "18px auto", width: "60%" }} />
            <div style={{ fontSize: 14, color: C.textMuted, fontStyle: "italic" }}>"{quote.q}"</div>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>— {quote.a}</div>
          </Card>

          <Card style={{ textAlign: "center", padding: 24 }}>
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>☪ Ayat of the Day</div>
            <div style={{ fontSize: 15, color: C.text, fontStyle: "italic", lineHeight: 1.6 }}>"{ayat.v}"</div>
            <div style={{ fontSize: 12, color: C.accent, marginTop: 8, fontWeight: 600 }}>— {ayat.r}</div>
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>💗</span>
              <div><div style={{ fontWeight: 700, fontSize: 16 }}>5 Daily Graces</div><div style={{ fontSize: 12, color: C.textDim }}>What are you grateful for today?</div></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
              {graces.map((g, i) => (
                <div key={i}>
                  <div style={{ fontSize: 12, color: C.textDim, marginBottom: 5 }}>{i + 1}.</div>
                  <JournalFieldTextarea value={g} onSave={v => saveGrace(i, v)} placeholder="I am grateful for…" rows={2} />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>🎯</span>
              <div><div style={{ fontWeight: 700, fontSize: 16 }}>Main Goal</div><div style={{ fontSize: 12, color: C.textDim }}>What's your primary focus in life?</div></div>
            </div>
            <JournalFieldTextarea value={todayEntry.mainGoal} onSave={v => saveField("mainGoal", v)} placeholder="My main goal is…" rows={3} />
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>✨</span>
              <div><div style={{ fontWeight: 700, fontSize: 16 }}>Feeling the Results</div><div style={{ fontSize: 12, color: C.textDim }}>How will you feel when your goal is achieved?</div></div>
            </div>
            <JournalFieldTextarea value={todayEntry.feelingResults} onSave={v => saveField("feelingResults", v)} placeholder="I'm so happy and grateful right now that I can see myself…" rows={3} />
          </Card>

          <div style={{ textAlign: "center", fontSize: 13, color: C.textDim, fontStyle: "italic", padding: "6px 0 20px" }}>"See it, believe it, achieve it"</div>
        </div>
      )}

      {tab === "daily" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 780, margin: "0 auto", width: "100%" }}>
          <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700 }}>📅 Today: {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
            {savedFlash && <Badge color={C.accent}>✓ Saved {savedFlash}</Badge>}
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <div><div style={{ fontWeight: 700, fontSize: 16 }}>Quick Notes</div><div style={{ fontSize: 12, color: C.textDim }}>Capture ideas and insights quickly</div></div>
            </div>
            <div style={{ marginTop: 12 }}><JournalFieldTextarea value={todayEntry.quickNotes} onSave={v => saveField("quickNotes", v)} placeholder="Write your quick thoughts, observations, or reminders here…" rows={5} /></div>
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>🧠</span>
              <div><div style={{ fontWeight: 700, fontSize: 16 }}>Advanced Self Review</div><div style={{ fontSize: 12, color: C.textDim }}>In-depth analysis of your progress</div></div>
            </div>
            <div style={{ marginTop: 12 }}><JournalFieldTextarea value={todayEntry.selfReview} onSave={v => saveField("selfReview", v)} placeholder="Reflect deeply on your performance, patterns, and growth areas…" rows={5} /></div>
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>👥</span>
              <div><div style={{ fontWeight: 700, fontSize: 16 }}>Mentor Notes</div><div style={{ fontSize: 12, color: C.textDim }}>Guidance and wisdom from others</div></div>
            </div>
            <div style={{ marginTop: 12 }}><JournalFieldTextarea value={todayEntry.mentorNotes} onSave={v => saveField("mentorNotes", v)} placeholder="Record insights, advice, or feedback from mentors and coaches…" rows={5} /></div>
            <div style={{ marginTop: 14 }}>
              <SectionLabel>Add Screenshot (optional)</SectionLabel>
              {todayEntry.mentorScreenshot ? (
                <div style={{ position: "relative", width: 180 }}>
                  <img src={todayEntry.mentorScreenshot} alt="" style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.border}` }} />
                  <button onClick={() => saveField("mentorScreenshot", null)} style={{ position: "absolute", top: 6, right: 6, background: "#000b", border: "none", borderRadius: "50%", color: C.red, width: 22, height: 22, cursor: "pointer" }}>×</button>
                </div>
              ) : (
                <div onClick={() => mentorFileRef.current?.click()} style={{ border: `2px dashed ${C.border}`, borderRadius: 10, padding: "26px 20px", textAlign: "center", cursor: "pointer", color: C.textDim, fontSize: 13 }}>⬆ Click to upload</div>
              )}
              <input ref={mentorFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleMentorScreenshot(e.target.files[0])} />
            </div>
          </Card>
        </div>
      )}

      {tab === "past" && (
        <div style={{ maxWidth: 900, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 16 }}>📅</span>
              <h2 style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
              <button onClick={() => setMonth(new Date(year, mo - 1, 1))} style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, width: 30, height: 30, cursor: "pointer" }}>‹</button>
              <button onClick={() => setMonth(new Date(year, mo + 1, 1))} style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, width: 30, height: 30, cursor: "pointer" }}>›</button>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search past entries by keyword" style={{ width: "100%", background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "10px 14px", fontSize: 13, outline: "none", marginBottom: 16 }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 12, color: C.textMuted, fontWeight: 700, padding: "6px 0" }}>{d}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
              {cells.map((c, i) => {
                const k = dateKey(c.dateObj);
                const entryExists = hasEntry(k) && c.inMonth;
                const isMatch = entryExists && matchesSearch(k);
                const isToday = c.dateObj.toDateString() === today.toDateString();
                return (
                  <div key={i} onClick={() => entryExists && isMatch && setPopupDate(c.dateObj)}
                    style={{ aspectRatio: "1", borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                      cursor: entryExists && isMatch ? "pointer" : "default", opacity: c.inMonth ? (search.trim() && entryExists && !isMatch ? 0.3 : 1) : 0.25,
                      background: entryExists ? C.accentDim : "transparent", border: isToday ? `2px solid ${C.purple}` : entryExists ? `1px solid ${C.accent}55` : `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 14, fontWeight: isToday ? 800 : 600, color: isToday ? C.purple : C.text }}>{c.d}</span>
                    {entryExists && <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.accent }} />}
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign: "center", fontSize: 12, color: C.textDim, marginTop: 14 }}>Click on highlighted days to view your journal entries</div>
          </Card>
        </div>
      )}

      {popupDate && popupEntry && (() => {
        const k = dateKey(popupDate);
        const del = (field) => dispatch({ type: "DELETE_JOURNAL_FIELD", date: k, field });
        return (
          <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && setPopupDate(null)}>
            <div className="fade-in" style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 16, padding: 26, width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>{popupDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h2>
                <button onClick={() => setPopupDate(null)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 22, cursor: "pointer" }}>×</button>
              </div>
              <Btn variant="danger" small style={{ marginBottom: 16 }} onClick={() => { dispatch({ type: "DELETE_JOURNAL_DAY", date: k }); setPopupDate(null); }}>🗑 Delete Entire Day</Btn>

              {(popupEntry.graces && popupEntry.graces.some(Boolean)) && (
                <div style={{ background: C.bg, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ flex: 1, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>💗 Daily Gratitude</div>
                    <button onClick={() => del("graces")} style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}>🗑</button>
                  </div>
                  <ol style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                    {popupEntry.graces.filter(Boolean).map((g, i) => <li key={i} style={{ fontSize: 13, color: C.accent }}>{g}</li>)}
                  </ol>
                </div>
              )}
              {popupEntry.mainGoal && (
                <div style={{ background: C.bg, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}><div style={{ flex: 1, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>🎯 Main Goal</div><button onClick={() => del("mainGoal")} style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}>🗑</button></div>
                  <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>{popupEntry.mainGoal}</div>
                </div>
              )}
              {popupEntry.feelingResults && (
                <div style={{ background: C.bg, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}><div style={{ flex: 1, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>✨ Feeling the Results</div><button onClick={() => del("feelingResults")} style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}>🗑</button></div>
                  <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>{popupEntry.feelingResults}</div>
                </div>
              )}
              {(popupEntry.quickNotes || popupEntry.selfReview || popupEntry.mentorNotes) && <div style={{ margin: "6px 0 14px" }}><Badge color={C.blue}>Notes</Badge></div>}
              {popupEntry.quickNotes && (
                <div style={{ background: C.bg, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}><div style={{ flex: 1, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>📄 Quick Notes</div><button onClick={() => del("quickNotes")} style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}>🗑</button></div>
                  <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>{popupEntry.quickNotes}</div>
                </div>
              )}
              {popupEntry.selfReview && (
                <div style={{ background: C.bg, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}><div style={{ flex: 1, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>🧠 Advanced Self Review</div><button onClick={() => del("selfReview")} style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}>🗑</button></div>
                  <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>{popupEntry.selfReview}</div>
                </div>
              )}
              {popupEntry.mentorNotes && (
                <div style={{ background: C.bg, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}><div style={{ flex: 1, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>👥 Mentor Notes</div><button onClick={() => del("mentorNotes")} style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}>🗑</button></div>
                  <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, marginBottom: popupEntry.mentorScreenshot ? 10 : 0 }}>{popupEntry.mentorNotes}</div>
                  {popupEntry.mentorScreenshot && <img src={popupEntry.mentorScreenshot} alt="" style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.border}` }} />}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── helpers for TradeDetail ──────────────────────────────────────────────────
function holdMinutes(t) {
  if (!t.openTime || !t.closeTime) return null;
  const [oh, om] = t.openTime.split(":").map(Number), [ch, cm] = t.closeTime.split(":").map(Number);
  let mins = (ch * 60 + cm) - (oh * 60 + om);
  if (mins < 0) mins += 24 * 60;
  return mins;
}
function fmtMin(m) { if (m == null) return "—"; const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h ${r}m` : `${r}m`; }

function contextBucket(trades, field, value) {
  const ts = trades.filter(t => t[field] === value);
  if (!ts.length) return null;
  const s = calcStats(ts);
  return { count: ts.length, winRate: s.winRate, avgPnl: ts.reduce((a, t) => a + t.pnl, 0) / ts.length, netPnl: s.netPnl };
}

// ─── TRADE DETAIL ────────────────────────────────────────────────────────────
function TradeDetail({ trade, state, dispatch, onBack, onSelectTrade, setPage }) {
  const { trades, activeAccount } = state;
  const [notes, setNotes] = useState(trade.notes || ""), [editNotes, setEditNotes] = useState(false), [showShare, setShowShare] = useState(false);
  const saveNotes = () => { dispatch({ type: "UPDATE_TRADE", id: trade.id, data: { notes } }); setEditNotes(false); };
  const col = outcomeColor(trade.outcome, trade.pnl);
  const pool = trades.filter(t => activeAccount === "all" || t.account === activeAccount);
  const poolStats = calcStats(pool);
  const mins = holdMinutes(trade);
  const avgMins = (() => { const withMins = pool.map(holdMinutes).filter(m => m != null); return withMins.length ? withMins.reduce((a, b) => a + b, 0) / withMins.length : null; })();
  const beatPct = pool.length > 1 ? Math.round((pool.filter(t => t.pnl < trade.pnl).length / (pool.length - 1)) * 100) : 0;
  const bestTrade = pool.length ? Math.max(...pool.map(t => t.pnl)) : 0;

  const strategy = state.strategies.find(s => s.name === trade.setup);
  const strategyTrades = pool.filter(t => t.setup === trade.setup);
  const strategyStats = calcStats(strategyTrades);

  const tfCtx = contextBucket(pool, "timeframe", trade.timeframe);
  const sessCtx = contextBucket(pool, "session", trade.session);
  const trendCtx = contextBucket(pool, "trendBias", trade.trendBias);

  const moodGroups = groupBreakdown(pool, "mood").sort((a, b) => b.count - a.count).slice(0, 5);

  const similar = pool.filter(t => t.id !== trade.id && (t.setup === trade.setup || t.symbol === trade.symbol)).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  // Trade Quality heuristic (transparent, derived from real fields you log)
  const exitScore = trade.exitBehavior === "Planned" ? 100 : trade.exitBehavior === "Late" ? 60 : trade.exitBehavior === "Early" ? 70 : 75;
  const mindsetScore = trade.mood === "Focus" || trade.mood === "Focused" || trade.mood === "Confident" || trade.mood === "Patient" ? 100 : trade.mood === "Neutral" ? 75 : 45;
  const detachScore = trade.postTradeState === "Detached" ? 100 : trade.postTradeState === "Neutral" ? 70 : 40;
  const riskScore = trade.risk === "Low Risk" ? 100 : trade.risk === "Normal Risk" ? 80 : 55;
  const quality = Math.round(exitScore * 0.35 + mindsetScore * 0.30 + detachScore * 0.20 + riskScore * 0.15);
  const qualityLabel = quality >= 90 ? "Excellent" : quality >= 75 ? "Good" : quality >= 55 ? "Fair" : "Needs Work";

  const fees = parseFloat(trade.fees) || 0;

  return (
    <div className="fade-in" style={{ height: "100%", overflowY: "auto", padding: 24 }}>
      {showShare && (
        <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowShare(false)}>
          <div className="fade-in" onClick={e => e.stopPropagation()} style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: "100%", maxWidth: 500 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}><h2 style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>Share Trade</h2><button onClick={() => setShowShare(false)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 22, cursor: "pointer" }}>×</button></div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14 }}>Anyone with this link can view your trade — no account needed.</div>
            {(() => {
              const shareData = { id: trade.id, symbol: trade.symbol, direction: trade.direction, date: trade.date, entry: trade.entry, exit: trade.exit, size: trade.size, pnl: trade.pnl, pips: trade.pips, outcome: trade.outcome, setup: trade.setup, session: trade.session, mood: trade.mood, notes: trade.notes, screenshots: trade.screenshots };
              const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(shareData))));
              const link = `${window.location.origin}${window.location.pathname}#share=${encoded}`;
              return (
                <>
                  <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: C.textMuted, wordBreak: "break-all", marginBottom: 14, lineHeight: 1.7 }}>{link.slice(0, 120)}…</div>
                  <Btn onClick={() => { navigator.clipboard.writeText(link); }} style={{ width: "100%", justifyContent: "center" }}>📋 Copy Share Link</Btn>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Btn small variant="gradient" onClick={onBack}>← Back to Trades</Btn>
        <div style={{ flex: 1 }} />
        <Btn small variant="ghost" onClick={() => setShowShare(true)}>🔗 Share</Btn>
        <Btn small variant="ghost" onClick={() => dispatch({ type: "OPEN_MODAL", modal: { type: "add_trade", trade } })}>✏️ Edit</Btn>
        <Btn small variant="danger" onClick={() => { dispatch({ type: "DELETE_TRADE", id: trade.id }); onBack(); }}>Delete</Btn>
      </div>

      {/* Stat strip */}
      <Card style={{ marginBottom: 16, padding: "16px 20px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{fmtDate(trade.date)} · {trade.symbol}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 14 }}>
          {[
            ["NET P&L", fmt$(trade.pnl), col],
            ["SIDE", trade.direction.toUpperCase(), trade.direction === "Long" ? C.accent : C.red],
            ["LOTS", trade.size, C.text],
            ["PIPS", trade.pips ? `${trade.pips > 0 ? "+" : ""}${trade.pips}` : "—", trade.pips > 0 ? C.accent : trade.pips < 0 ? C.red : C.text],
            ["ENTRY", trade.entry ? `$${trade.entry.toLocaleString()}` : "—", C.text],
            ["EXIT", trade.exit ? `$${trade.exit.toLocaleString()}` : "—", C.text],
            ["OPEN TIME", trade.openTime || "—", C.text],
            ["CLOSE TIME", trade.closeTime || "—", C.text],
          ].map(([l, v, c]) => (
            <div key={l}>
              <div style={{ fontSize: 9, color: C.textDim, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>{l}</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: C.textDim }}>TOTAL CHARGES <span style={{ color: C.red, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>${fees.toFixed(2)}</span> {mins != null && <span> · HOLD TIME <span style={{ color: C.text, fontWeight: 700 }}>{fmtMin(mins)}</span></span>}</div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, alignItems: "start" }}>
        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>Chart</div>
              <Btn small variant="ghost" onClick={() => dispatch({ type: "OPEN_MODAL", modal: { type: "add_trade", trade } })}>+ Add</Btn>
            </div>
            {trade.screenshots?.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {trade.screenshots.map(s => (
                  <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer">
                    <img src={s.url} alt={s.name} style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.border}`, display: "block" }} />
                  </a>
                ))}
              </div>
            ) : (
              <div style={{ border: `1px dashed ${C.border}`, borderRadius: 10, padding: "50px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 26, marginBottom: 10, opacity: 0.5 }}>🖼️</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No chart screenshot for this trade</div>
                <div style={{ fontSize: 12, color: C.textDim }}>Add one by editing the trade</div>
              </div>
            )}
          </Card>

          {/* Behavior Insights */}
          <Card>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>🧠 Behavior Insights</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <div style={{ background: C.bg, borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>PRE-TRADE EMOTION</div>
                <Badge color={C.accent}>{trade.mood}</Badge>
              </div>
              <div style={{ background: C.bg, borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>POST-TRADE STATE</div>
                <Badge color={trade.postTradeState === "Detached" ? C.accent : trade.postTradeState === "Attached" ? C.red : C.yellow}>{trade.postTradeState || "—"}</Badge>
              </div>
              <div style={{ background: C.bg, borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>EXIT BEHAVIOR</div>
                <Badge color={trade.exitBehavior === "Planned" ? C.accent : C.yellow}>{trade.exitBehavior || "—"}</Badge>
              </div>
            </div>
          </Card>

          {/* Trade Quality Score */}
          <Card>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Trade Quality Score</div>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <ProgressRing pct={quality} size={96} color={quality >= 75 ? C.accent : quality >= 55 ? C.yellow : C.red} label={<div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{quality}</div></div>} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                {[["Exit Discipline", exitScore, 35], ["Mindset", mindsetScore, 30], ["Detachment", detachScore, 20], ["Risk Discipline", riskScore, 15]].map(([label, score, weight]) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: C.textMuted }}>{label} <span style={{ color: C.textDim }}>· {weight}% of score</span></span>
                      <span style={{ fontWeight: 700 }}>{score}%</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: C.border, overflow: "hidden" }}><div style={{ width: `${score}%`, height: "100%", background: score >= 75 ? C.accent : score >= 55 ? C.yellow : C.red }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ textAlign: "center", marginTop: 4, fontSize: 12, color: C.textDim }}>{qualityLabel}</div>
          </Card>

          {/* Trade Context */}
          <Card>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>🕐 Trade Context</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[["⏱", "TIME FRAME", trade.timeframe, tfCtx], ["🌐", "SESSION", trade.session, sessCtx], ["📈", "TREND ALIGNMENT", trade.trendBias, trendCtx]].map(([icon, label, value, ctx]) => (
                <div key={label} style={{ background: C.bg, borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>{icon} {label}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{value || "—"}</div>
                  {ctx ? (
                    <>
                      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>Across {ctx.count} trades</div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
                        <span style={{ color: C.textMuted }}>Win Rate <b style={{ color: C.text }}>{ctx.winRate.toFixed(0)}%</b></span>
                        <span style={{ color: C.textMuted }}>Net <b style={{ color: ctx.netPnl >= 0 ? C.accent : C.red }}>{fmt$(ctx.netPnl)}</b></span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: "hidden" }}><div style={{ width: `${Math.min(100, ctx.winRate)}%`, height: "100%", background: C.accent }} /></div>
                    </>
                  ) : <div style={{ fontSize: 11, color: C.textDim }}>No comparison data yet</div>}
                </div>
              ))}
            </div>
          </Card>

          {/* Similar Trades */}
          {similar.length > 0 && (
            <Card>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}>🗂 Similar Trades</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {similar.map(t => (
                  <div key={t.id} onClick={() => onSelectTrade(t.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: C.bg, borderRadius: 9, cursor: "pointer" }}>
                    <Badge color={t.direction === "Long" ? C.accent : C.red}>{t.direction}</Badge>
                    <div style={{ flex: 1, fontSize: 13 }}><b>{t.symbol}</b> <span style={{ color: C.textMuted }}>· {fmtDate(t.date)} · {t.setup}</span></div>
                    <div className="mono" style={{ fontWeight: 700, color: outcomeColor(t.outcome, t.pnl) }}>{fmt$(t.pnl)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 7 }}>📝 Notes</div>
              {!editNotes && <Btn small variant="ghost" onClick={() => setEditNotes(true)}>+ Add</Btn>}
            </div>
            {editNotes ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} style={{ background: C.surfaceHigh, border: `1px solid ${C.accent}`, borderRadius: 8, color: C.text, padding: 12, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit", width: "100%" }} />
                <div style={{ display: "flex", gap: 8 }}><Btn small onClick={saveNotes}>Save</Btn><Btn small variant="ghost" onClick={() => { setNotes(trade.notes || ""); setEditNotes(false); }}>Cancel</Btn></div>
              </div>
            ) : <div style={{ fontSize: 13, color: trade.notes ? C.text : C.textDim, lineHeight: 1.7 }}>{trade.notes || "Click + Add to start writing…"}</div>}
          </Card>

          {/* Playbook Setup */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 7 }}>🏷 Playbook Setup</div>
            </div>
            {trade.setup ? (
              <>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                  <Badge color={strategy?.color || C.blue}>{trade.setup}</Badge>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: C.textDim }}>{strategyTrades.length} trades</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                  <div style={{ background: C.bg, borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 9, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Win Rate</div><div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{strategyStats.winRate.toFixed(0)}%</div></div>
                  <div style={{ background: C.bg, borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 9, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Net P&L</div><div className="mono" style={{ fontWeight: 700, fontSize: 14, color: strategyStats.netPnl >= 0 ? C.accent : C.red }}>{fmt$(strategyStats.netPnl)}</div></div>
                  <div style={{ background: C.bg, borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 9, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Profit Factor</div><div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{strategyStats.profitFactor >= 99 ? "∞" : strategyStats.profitFactor.toFixed(2)}</div></div>
                </div>
                <Btn onClick={() => setPage && setPage("strategies")} style={{ width: "100%", justifyContent: "center" }}>See more in Playbook →</Btn>
              </>
            ) : <div style={{ fontSize: 12, color: C.textDim }}>No setup tagged for this trade.</div>}
          </Card>

          {/* vs Your Average */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 7 }}>📊 vs. Your Average</div>
              <span style={{ fontSize: 11, color: C.textDim }}>{pool.length} trades</span>
            </div>
            <div style={{ background: C.bg, borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>🏆 This trade beat <b style={{ color: C.text }}>{beatPct}%</b> of your trades</div>
              <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}><div style={{ width: `${beatPct}%`, height: "100%", background: `linear-gradient(90deg, ${C.blue}, ${C.accent})` }} /></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 10 }}>
              <span style={{ color: C.textMuted }}>Net P&L</span>
              <span><b style={{ color: col }}>{fmt$(trade.pnl)}</b> <span style={{ color: C.textDim, fontSize: 11 }}>avg {fmt$(poolStats.netPnl / (pool.length || 1))}</span></span>
            </div>
            {mins != null && avgMins != null && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 14 }}>
                <span style={{ color: C.textMuted }}>Hold Time</span>
                <span><b>{fmtMin(mins)}</b> <span style={{ color: C.textDim, fontSize: 11 }}>avg {fmtMin(Math.round(avgMins))}</span></span>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: C.bg, borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 9, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Win Rate</div><div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{poolStats.winRate.toFixed(0)}%</div></div>
              <div style={{ background: C.bg, borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 9, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Best Trade</div><div className="mono" style={{ fontWeight: 700, fontSize: 14, color: C.accent }}>{fmt$(bestTrade)}</div></div>
              <div style={{ background: C.bg, borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 9, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Avg Win</div><div className="mono" style={{ fontWeight: 700, fontSize: 14, color: C.accent }}>{fmt$(poolStats.avgWin)}</div></div>
              <div style={{ background: C.bg, borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 9, color: C.textDim, marginBottom: 3, textTransform: "uppercase" }}>Avg Loss</div><div className="mono" style={{ fontWeight: 700, fontSize: 14, color: C.red }}>{fmt$(-poolStats.avgLoss)}</div></div>
            </div>
          </Card>

          {/* Performance by Emotion */}
          {moodGroups.length > 0 && (
            <Card>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}>🎭 Performance by Emotion</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {moodGroups.map(m => {
                  const mtrades = pool.filter(t => t.mood === m.label);
                  const mPnl = mtrades.reduce((a, t) => a + t.pnl, 0);
                  const isCurrent = m.label === trade.mood;
                  return (
                    <div key={m.label} style={{ background: isCurrent ? C.accentDim : C.bg, border: isCurrent ? `1px solid ${C.accent}55` : "1px solid transparent", borderRadius: 9, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{m.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: m.pct >= 50 ? C.accent : C.red }}>{m.pct}%</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: C.border, overflow: "hidden", marginBottom: 5 }}><div style={{ width: `${m.pct}%`, height: "100%", background: m.pct >= 50 ? C.accent : C.red }} /></div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textDim }}>
                        <span>{m.count} trades</span><span style={{ color: mPnl >= 0 ? C.accent : C.red }}>{fmt$(mPnl)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PROGRESS RING ────────────────────────────────────────────────────────────
const ProgressRing = ({ pct, size = 64, color = C.accent, label }) => {
  const stroke = 6, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.surfaceHigh} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size > 56 ? 15 : 12, fontWeight: 800, color: C.text }}>{label}</div>
    </div>
  );
};

// ─── BREAKDOWN GROUP (timeframe / session / risk / trend) ────────────────────
const BADGE_PALETTE = [C.blue, "#2dd4bf", C.yellow, "#9b6bff", C.red, C.accent];
function groupBreakdown(trades, field) {
  const groups = {};
  trades.forEach(t => { const k = t[field]; if (!k) return; (groups[k] = groups[k] || []).push(t); });
  return Object.entries(groups).map(([label, ts], i) => {
    const w = ts.filter(t => t.outcome === "Win" || (t.outcome !== "Loss" && t.outcome !== "BE" && t.pnl > 0)).length;
    const l = ts.filter(t => t.outcome === "Loss" || (t.outcome !== "Win" && t.outcome !== "BE" && t.pnl < 0)).length;
    const decided = w + l;
    return { label, w, l, pct: decided ? Math.round((w / decided) * 100) : 0, count: ts.length, color: BADGE_PALETTE[i % BADGE_PALETTE.length] };
  }).sort((a, b) => b.count - a.count);
}

const riskColor = (label) => label === "Low Risk" ? C.accent : label === "High Risk" ? C.red : C.yellow;

function BreakdownSection({ icon, title, items, colorFn }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 3);
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.textDim, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}><span>{icon}</span>{title}</div>
        {items.length > 3 && <button onClick={() => setExpanded(e => !e)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 11, cursor: "pointer" }}>{expanded ? "Show less ‹" : "See more ›"}</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(shown.length, 3)}, 1fr)`, gap: 8 }}>
        {shown.map((it, i) => (
          <div key={i} style={{ background: C.bg, borderRadius: 9, padding: "9px 10px", textAlign: "center" }}>
            <span style={{ display: "inline-block", background: (colorFn ? colorFn(it.label) : it.color) + "22", color: colorFn ? colorFn(it.label) : it.color, border: `1px solid ${(colorFn ? colorFn(it.label) : it.color)}55`, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>{it.label}</span>
            <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: it.pct >= 50 ? C.accent : C.red }}>{it.pct}%</div>
            <div style={{ fontSize: 10, color: C.textDim }}>{it.w}W / {it.l}L</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── STRATEGY CARD ────────────────────────────────────────────────────────────
function StrategyCard({ s, trades, dispatch }) {
  const st = trades.filter(t => t.setup === s.name);
  const stats = calcStats(st);
  const winPct = Math.round(stats.winRate);
  const trendItems = groupBreakdown(st, "trendBias");
  const tfItems = groupBreakdown(st, "timeframe");
  const sessionItems = groupBreakdown(st, "session");
  const riskItems = groupBreakdown(st, "risk");
  const color = s.color || C.accent;
  return (
    <Card style={{ borderTop: `3px solid ${color}`, padding: 22, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <div style={{ width: 9, height: 9, borderRadius: "50%", background: color, marginRight: 9 }} />
        <div style={{ fontWeight: 800, fontSize: 17, flex: 1 }}>{s.name}</div>
        <Badge color={C.textMuted}>{st.length} trades</Badge>
      </div>
      {s.description && <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, lineHeight: 1.5 }}>{s.description}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
        <ProgressRing pct={winPct} color={winPct >= 50 ? C.accent : C.red} label={`${winPct}%`} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: C.textMuted }}>Win rate <span style={{ color: C.text, fontWeight: 700 }}>{winPct.toFixed(1)}%</span></div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>Net P&L <span style={{ color: stats.netPnl >= 0 ? C.accent : C.red, fontWeight: 700 }}>{fmt$(stats.netPnl)}</span></div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.1fr", gap: 10, marginBottom: 18, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>Profit Factor</div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 800 }}>{stats.profitFactor >= 99 ? "∞" : stats.profitFactor.toFixed(2)}</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 10, marginBottom: 4 }}>Expectancy</div>
          <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: stats.expectancy >= 0 ? C.accent : C.red }}>{fmt$(stats.expectancy)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>Avg Winner</div>
          <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: C.accent }}>{fmt$(stats.avgWin)}</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 10, marginBottom: 4 }}>Avg Loser</div>
          <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: C.red }}>{fmt$(-stats.avgLoss)}</div>
        </div>
        <div style={{ background: C.bg, borderRadius: 9, padding: "9px 10px" }}>
          <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Trend Bias</div>
          {trendItems.length === 0 && <div style={{ fontSize: 11, color: C.textDim }}>No data yet</div>}
          {trendItems.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.textMuted }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: it.label === "With Trend" ? C.accent : C.red, display: "inline-block" }} />{it.label}</span>
              <span style={{ fontWeight: 700 }}>{it.pct}%</span>
            </div>
          ))}
        </div>
      </div>
      <BreakdownSection icon="🕐" title="Time Frame Entry" items={tfItems} />
      <BreakdownSection icon="🌐" title="Trading Session" items={sessionItems} />
      <BreakdownSection icon="⚠" title="Risk Meter" items={riskItems} colorFn={riskColor} />
      <button onClick={() => dispatch({ type: "DELETE_STRATEGY", id: s.id })} style={{ marginTop: 6, width: "100%", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, color: C.textDim, fontSize: 11, padding: "6px", cursor: "pointer" }}>Remove Strategy</button>
    </Card>
  );
}

// ─── STRATEGIES ──────────────────────────────────────────────────────────────
function Strategies({ state, dispatch }) {
  const { strategies, trades } = state;
  const [adding, setAdding] = useState(false), [form, setForm] = useState({ name: "", description: "", color: ACCOUNT_COLORS[0], rules: [""] });
  const atCap = !canAddSetup(state);
  const save = () => { if (!form.name || atCap) return; dispatch({ type: "ADD_STRATEGY", strategy: { id: `s${Date.now()}`, ...form, rules: form.rules.filter(Boolean) } }); setForm({ name: "", description: "", color: ACCOUNT_COLORS[0], rules: [""] }); setAdding(false); };
  const openAdd = () => atCap ? dispatch({ type: "OPEN_MODAL", modal: "upgrade" }) : setAdding(a => !a);
  return (
    <div className="fade-in" style={{ height: "100%", overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1, flex: 1, color: C.accent }}>♤ Playbook</h1>
        {atCap && <Badge color={C.purple}>{strategies.length}/{FREE_LIMITS.maxSetups} setups (Ace Basic)</Badge>}
        <Btn small onClick={openAdd}>+ New Setup {atCap && <PlusBadge small />}</Btn>
      </div>
      {atCap && <InlineUpgradeLock dispatch={dispatch} text={`You've reached the Ace Basic limit of ${FREE_LIMITS.maxSetups} Playbook setups. Upgrade to AcePlus for unlimited setups.`} />}
      {adding && !atCap && (
        <Card style={{ borderColor: C.accentHover }}>
          <h3 style={{ marginBottom: 14, fontSize: 16, fontWeight: 700 }}>New Setup</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Inp label="Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Breakout" />
            <Inp label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Brief description of this setup" />
            <div>
              <label style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Color</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ACCOUNT_COLORS.map(col => <div key={col} onClick={() => setForm(f => ({ ...f, color: col }))} style={{ width: 24, height: 24, borderRadius: "50%", background: col, cursor: "pointer", border: form.color === col ? `3px solid #fff` : "3px solid transparent" }} />)}
              </div>
            </div>
            <div>
              <SectionLabel>Rules / Checklist</SectionLabel>
              {form.rules.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input value={r} onChange={e => { const rules = [...form.rules]; rules[i] = e.target.value; setForm(f => ({ ...f, rules })); }} placeholder={`Rule ${i + 1}`} style={{ flex: 1, background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, padding: "8px 12px", fontSize: 13, outline: "none" }} />
                  {form.rules.length > 1 && <button onClick={() => setForm(f => ({ ...f, rules: f.rules.filter((_, j) => j !== i) }))} style={{ background: C.redDim, border: "none", borderRadius: 7, color: C.red, padding: "0 10px", cursor: "pointer" }}>×</button>}
                </div>
              ))}
              <Btn small variant="ghost" onClick={() => setForm(f => ({ ...f, rules: [...f.rules, ""] }))}>+ Add Rule</Btn>
            </div>
            <div style={{ display: "flex", gap: 8 }}><Btn small onClick={save}>Save Setup</Btn><Btn small variant="ghost" onClick={() => setAdding(false)}>Cancel</Btn></div>
          </div>
        </Card>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 18 }}>
        {strategies.map(s => <StrategyCard key={s.id} s={s} trades={trades} dispatch={dispatch} />)}
        <Card onClick={openAdd} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, cursor: "pointer", borderStyle: "dashed" }}>
          <div style={{ fontSize: 28, color: C.textDim, marginBottom: 6 }}>{atCap ? "🔒" : "+"}</div><div style={{ color: C.textMuted, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>New Setup {atCap && <PlusBadge small />}</div>
        </Card>
      </div>
    </div>
  );
}

// ─── CALENDAR ────────────────────────────────────────────────────────────────
function Calendar({ state, dispatch, setPage }) {
  const { trades, activeAccount } = state;
  const [current, setCurrent] = useState(new Date());
  const [popup, setPopup] = useState(null); // { kind: 'day'|'week', day, weekDays }
  const [viewTradeId, setViewTradeId] = useState(null);
  const year = current.getFullYear(), month = current.getMonth();
  const first = new Date(year, month, 1), daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build a full 7-col grid including leading/trailing days from adjacent months for a clean card grid
  const leading = first.getDay();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < leading; i++) cells.push({ d: prevMonthDays - leading + 1 + i, inMonth: false, dateObj: new Date(year, month - 1, prevMonthDays - leading + 1 + i) });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, inMonth: true, dateObj: new Date(year, month, d) });
  let nextD = 1;
  while (cells.length < totalCells) { cells.push({ d: nextD, inMonth: false, dateObj: new Date(year, month + 1, nextD) }); nextD++; }

  const accTrades = trades.filter(t => activeAccount === "all" || t.account === activeAccount);
  const toKey = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const tradesForDate = dt => accTrades.filter(t => t.date.startsWith(toKey(dt)));
  const monthTrades = accTrades.filter(t => { const dd = new Date(t.date); return dd.getMonth() === month && dd.getFullYear() === year; });
  const mStats = calcStats(monthTrades);
  const tradingDays = new Set(monthTrades.map(t => t.date.slice(0, 10))).size;

  // Group cells into week rows
  const weekRows = [];
  for (let i = 0; i < cells.length; i += 7) weekRows.push(cells.slice(i, i + 7));

  const weekStats = (row) => {
    const wTrades = row.filter(c => c.inMonth).flatMap(c => tradesForDate(c.dateObj));
    const s = calcStats(wTrades);
    const activeDays = new Set(wTrades.map(t => t.date.slice(0, 10))).size;
    return { ...s, days: activeDays, count: wTrades.length, row };
  };

  const recentTrades = [...accTrades].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  const CELL_H = 130;
  const dayCardStyle = (pnl, hasTrades, isToday) => ({
    height: CELL_H, borderRadius: 16, padding: "14px", cursor: "pointer", position: "relative", overflow: "hidden", boxSizing: "border-box",
    background: !hasTrades ? C.surfaceHigh : pnl >= 0 ? `${C.accent}1c` : `${C.red}1c`,
    border: isToday ? `2px solid #8b5cf6` : hasTrades ? `1px solid ${pnl >= 0 ? C.accent + "70" : C.red + "70"}` : `1px solid ${C.border}`,
    transition: "transform 0.1s, border-color 0.1s", display: "flex", flexDirection: "column",
  });

  const openTrade = (id) => { setPopup(null); setViewTradeId(id); };

  if (viewTradeId) {
    const trade = trades.find(t => t.id === viewTradeId);
    if (trade) {
      return (
        <TradeDetail trade={trade} state={state} dispatch={dispatch}
          onBack={() => setViewTradeId(null)}
          onSelectTrade={id => setViewTradeId(id)}
          setPage={setPage} />
      );
    }
    setViewTradeId(null);
  }

  return (
    <div className="fade-in" style={{ height: "100%", overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Btn small variant="ghost" onClick={() => setCurrent(new Date(year, month - 1, 1))}>‹</Btn>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -1 }}>{current.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h1>
        <Btn small variant="ghost" onClick={() => setCurrent(new Date(year, month + 1, 1))}>›</Btn>
        <Btn small variant="ghost" onClick={() => setCurrent(new Date())}>Today</Btn>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.textMuted, flexWrap: "wrap" }}>
          <span>Monthly stats:</span>
          <span className="mono" style={{ color: mStats.netPnl >= 0 ? C.accent : C.red, fontWeight: 800, fontSize: 15 }}>{fmt$(mStats.netPnl)}</span>
          <Badge color={C.blue}>{tradingDays} days · {monthTrades.length} trades</Badge>
        </div>
      </div>

      {/* Calendar grid (7 days) + week summary sidebar */}
      <div className="calendar-scroll" style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 16, alignItems: "start", minWidth: 760 }}>
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, marginBottom: 10 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 13, color: C.text, fontWeight: 700, padding: "12px 0", background: C.surfaceHigh, borderRadius: 12 }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {weekRows.map((row, ri) => (
              <div key={ri} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
                {row.map((c, ci) => {
                  const dt = tradesForDate(c.dateObj);
                  const pnl = dt.reduce((s, t) => s + t.pnl, 0);
                  const wins = dt.filter(t => t.outcome === "Win" || (t.outcome !== "Loss" && t.outcome !== "BE" && t.pnl > 0)).length;
                  const decided = dt.filter(t => t.outcome !== "BE").length;
                  const winPct = decided ? Math.round((wins / decided) * 100) : null;
                  const today = new Date();
                  const isToday = c.dateObj.toDateString() === today.toDateString();
                  const hasTrades = dt.length > 0 && c.inMonth;
                  return (
                    <div key={ci} onClick={() => c.inMonth && setPopup({ kind: "day", dateObj: c.dateObj })}
                      style={{ ...dayCardStyle(pnl, hasTrades, isToday), opacity: c.inMonth ? 1 : 0.35 }}
                      onMouseEnter={e => c.inMonth && (e.currentTarget.style.transform = "scale(1.02)")}
                      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}>
                      {hasTrades ? (
                        <>
                          <div style={{ position: "absolute", top: 10, right: 12, fontSize: 12, color: C.textDim, fontWeight: 600 }}>{c.d}</div>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
                            <div className="mono" style={{ fontSize: 19, fontWeight: 800, color: pnl >= 0 ? C.accent : C.red, whiteSpace: "nowrap" }}>{pnl >= 0 ? "+" : "-"}${Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                            <div style={{ fontSize: 12, color: C.textMuted, whiteSpace: "nowrap" }}>{dt.length} trade{dt.length > 1 ? "s" : ""}</div>
                            {winPct !== null && <div style={{ fontSize: 12, fontWeight: 700, color: winPct >= 60 ? C.accent : C.red }}>{winPct}%</div>}
                          </div>
                        </>
                      ) : (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 20, fontWeight: 700, color: isToday ? "#8b5cf6" : C.textMuted }}>{c.d}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Week summary sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ height: 44 }} />
          {weekRows.map((row, ri) => {
            const ws = weekStats(row);
            const hasAny = ws.count > 0;
            const positive = ws.netPnl > 0, negative = ws.netPnl < 0;
            return (
              <div key={ri} onClick={() => hasAny && setPopup({ kind: "week", row, weekIndex: ri })}
                style={{ height: CELL_H, borderRadius: 16, padding: "16px", cursor: hasAny ? "pointer" : "default", overflow: "hidden", boxSizing: "border-box",
                  background: !hasAny ? C.surfaceHigh : positive ? `${C.accent}14` : negative ? `${C.red}14` : C.surfaceHigh,
                  border: `1px solid ${!hasAny ? C.border : positive ? C.accent + "70" : negative ? C.red + "70" : C.border}`,
                  display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 700, marginBottom: 6 }}>Week {ri + 1}</div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 800, color: !hasAny ? C.textMuted : positive ? C.accent : negative ? C.red : C.textMuted, whiteSpace: "nowrap" }}>{hasAny ? fmt$(ws.netPnl) : "$0"}</div>
                </div>
                <div style={{ display: "inline-block", background: "#8b5cf61f", color: "#a78bfa", border: "1px solid #8b5cf63a", borderRadius: 8, padding: "5px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", width: "fit-content" }}>
                  {ws.days} day{ws.days !== 1 ? "s" : ""} · {ws.count} trade{ws.count !== 1 ? "s" : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {/* Recent Trades */}
      <Card style={{ padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Recent Trades</div>
        </div>
        {recentTrades.length === 0 && <div style={{ padding: 28, textAlign: "center", color: C.textDim }}>No trades yet.</div>}
        {recentTrades.map(t => (
          <div key={t.id} onClick={() => openTrade(t.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", borderBottom: `1px solid ${C.border}20`, cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = C.surfaceHigh} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: outcomeColor(t.outcome, t.pnl) + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: outcomeColor(t.outcome, t.pnl) }}>{t.direction === "Long" ? "♤" : "♤"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.symbol}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{fmtDate(t.date)} · {t.direction.toUpperCase()}</div>
            </div>
            <div className="mono" style={{ fontWeight: 700, fontSize: 15, color: outcomeColor(t.outcome, t.pnl) }}>{fmt$(t.pnl)}</div>
          </div>
        ))}
      </Card>

      {/* Day / Week popup */}
      {popup && (
        <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && setPopup(null)}>
          <div className="fade-in" style={{ background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 16, padding: 26, width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto" }}>
            {popup.kind === "day" ? (() => {
              const dt = tradesForDate(popup.dateObj);
              const s = calcStats(dt);
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>{popup.dateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h2>
                    <button onClick={() => setPopup(null)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 22, cursor: "pointer" }}>×</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
                    <StatCard label="Net P&L" value={fmt$(s.netPnl)} color={s.netPnl >= 0 ? C.accent : C.red} />
                    <StatCard label="Trades" value={dt.length} />
                    <StatCard label="Win Rate" value={`${s.winRate.toFixed(0)}%`} />
                  </div>
                  <SectionLabel>Trades</SectionLabel>
                  {dt.length === 0 && <div style={{ color: C.textDim, fontSize: 13, padding: "10px 0" }}>No trades this day.</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {dt.map(t => (
                      <div key={t.id} onClick={() => openTrade(t.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.surfaceHigh, borderRadius: 9, cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = C.borderLight} >
                        <Badge color={t.direction === "Long" ? C.accent : C.red}>{t.direction}</Badge>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{t.symbol}</span>
                          <span style={{ marginLeft: 8, fontSize: 12, color: C.textMuted }}>{t.setup} · {t.session}</span>
                        </div>
                        <Badge color={outcomeColor(t.outcome, t.pnl)}>{t.outcome}</Badge>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 14, color: outcomeColor(t.outcome, t.pnl), minWidth: 80, textAlign: "right" }}>{fmt$(t.pnl)}</div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })() : (() => {
              const row = popup.row;
              const wTrades = row.filter(c => c.inMonth).flatMap(c => tradesForDate(c.dateObj)).sort((a, b) => new Date(a.date) - new Date(b.date));
              const s = calcStats(wTrades);
              const rangeStart = row[0].dateObj, rangeEnd = row[6].dateObj;
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>Week {popup.weekIndex + 1} · {rangeStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {rangeEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</h2>
                    <button onClick={() => setPopup(null)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 22, cursor: "pointer" }}>×</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
                    <StatCard label="Net P&L" value={fmt$(s.netPnl)} color={s.netPnl >= 0 ? C.accent : C.red} />
                    <StatCard label="Trades" value={wTrades.length} />
                    <StatCard label="Win Rate" value={`${s.winRate.toFixed(0)}%`} />
                  </div>
                  <SectionLabel>Trades</SectionLabel>
                  {wTrades.length === 0 && <div style={{ color: C.textDim, fontSize: 13, padding: "10px 0" }}>No trades this week.</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {wTrades.map(t => (
                      <div key={t.id} onClick={() => openTrade(t.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.surfaceHigh, borderRadius: 9, cursor: "pointer" }}>
                        <span style={{ fontSize: 11, color: C.textDim, minWidth: 46 }}>{fmtDate(t.date).slice(0, 6)}</span>
                        <Badge color={t.direction === "Long" ? C.accent : C.red}>{t.direction}</Badge>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{t.symbol}</span>
                          <span style={{ marginLeft: 8, fontSize: 12, color: C.textMuted }}>{t.setup} · {t.session}</span>
                        </div>
                        <Badge color={outcomeColor(t.outcome, t.pnl)}>{t.outcome}</Badge>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 14, color: outcomeColor(t.outcome, t.pnl), minWidth: 80, textAlign: "right" }}>{fmt$(t.pnl)}</div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PREMIUM GRID BAR CHART (with axis labels + gridlines) ──────────────────
// Caps how wide a single bar "slot" (bar + its label) can grow to. Without
// this, a chart with only 3-4 categories rendered inside a very wide card
// (large/ultrawide monitors) stretches each bar into a giant slab. Bars now
// grow up to this width and then the row centers itself instead of
// stretching edge-to-edge.
const BAR_SLOT_MAX_WIDTH = 130;
const GridBarChart = ({ data, height = 260, colorFn, axisFormat, tooltipFormat, yMin, yMax }) => {
  const [hover, setHover] = useState(null);
  if (!data.length) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 13 }}>No data yet</div>;
  const max = yMax != null ? yMax : Math.max(...data.map(d => d.value), 0);
  const min = yMin != null ? yMin : Math.min(...data.map(d => d.value), 0);
  const range = max - min || 1;
  const padTop = 10, padBottom = 30, padLeft = 56;
  const plotH = height - padTop - padBottom;
  const zeroY = padTop + (max / range) * plotH;
  const ySteps = 4;
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => min + (range / ySteps) * i).reverse();
  const fmtAxis = axisFormat || (v => `$${Math.round(v).toLocaleString()}`);
  const fmtTip = tooltipFormat || fmt$;
  return (
    <div style={{ position: "relative", width: "100%", height }}>
      {yLabels.map((v, i) => {
        const y = padTop + (i / ySteps) * plotH;
        return (
          <div key={i} style={{ position: "absolute", left: 0, top: y - 6, width: "100%" }}>
            <span style={{ position: "absolute", left: 0, fontSize: 10, color: C.textDim, fontFamily: "'Inter',sans-serif" }}>{fmtAxis(v)}</span>
            <div style={{ position: "absolute", left: padLeft, right: 0, top: 6, borderTop: v === 0 ? `1px solid ${C.borderLight}` : `1px dashed ${C.border}` }} />
          </div>
        );
      })}
      <div style={{ position: "absolute", left: padLeft, right: 0, top: padTop, bottom: padBottom, display: "flex", alignItems: "stretch", justifyContent: "center", gap: 2 }}>
        {data.map((d, i) => {
          const barH = Math.max(2, (Math.abs(d.value) / range) * plotH);
          const isPos = d.value >= 0;
          const barColor = colorFn ? colorFn(d, i) : (isPos ? C.accent : C.red);
          return (
            <div key={i} style={{ flex: "1 1 0", maxWidth: BAR_SLOT_MAX_WIDTH, minWidth: 0, position: "relative" }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(h => h === i ? null : h)}>
              {hover === i && (
                <div style={{ position: "absolute", bottom: (isPos ? zeroY - padTop - barH : zeroY - padTop) + barH + 10, left: "50%", transform: "translateX(-50%)", background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 11, whiteSpace: "nowrap", zIndex: 5, boxShadow: "0 4px 14px #0008" }}>
                  <div style={{ color: C.textMuted, marginBottom: 2 }}>{d.label}</div>
                  <div className="mono" style={{ fontWeight: 800, fontSize: 13, color: barColor }}>{fmtTip(d.value)}</div>
                  {(d.count != null) && <div style={{ color: C.textDim, marginTop: 2 }}>{d.count} trade{d.count !== 1 ? "s" : ""}{d.winRate != null ? ` · ${d.winRate.toFixed(0)}% win rate` : ""}</div>}
                </div>
              )}
              <div style={{
                position: "absolute", left: "20%", right: "20%", maxWidth: 64, margin: "0 auto",
                top: isPos ? zeroY - padTop - barH : zeroY - padTop,
                height: barH, background: barColor, borderRadius: 3, opacity: hover === i ? 1 : 0.9, transition: "opacity 0.1s",
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: padLeft, right: 0, bottom: 0, display: "flex", justifyContent: "center", gap: 2 }}>
        {data.map((d, i) => <div key={i} style={{ flex: "1 1 0", maxWidth: BAR_SLOT_MAX_WIDTH, minWidth: 0, textAlign: "center", fontSize: 10, color: colorFn ? colorFn(d, i) : C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</div>)}
      </div>
    </div>
  );
};

// ─── DONUT CHART ──────────────────────────────────────────────────────────────
const DonutChart = ({ segments, size = 180, thickness = 28, showLegend = true }) => {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - thickness / 2;
  const cx = size / 2, cy = size / 2;
  let acc = 0;
  const circumference = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.surfaceHigh} strokeWidth={thickness} />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * circumference;
          const offset = circumference - (acc / total) * circumference;
          acc += s.value;
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />
          );
        })}
      </svg>
      {showLegend && (
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.textMuted, whiteSpace: "nowrap" }}>
            <div style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />{s.label}
          </div>
        ))}
      </div>
      )}
    </div>
  );
};

// ─── RADAR CHART (Trading Mastery Score) ─────────────────────────────────────
const RadarChart = ({ axes, size = 320, color = C.accent2 }) => {
  const cx = size / 2, cy = size / 2 - 6, r = size / 2 - 64;
  const n = axes.length;
  const angle = i => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, frac) => [cx + Math.cos(angle(i)) * r * frac, cy + Math.sin(angle(i)) * r * frac];
  const rings = [0.25, 0.5, 0.75, 1];
  const poly = axes.map((a, i) => pt(i, Math.max(0, Math.min(100, a.value)) / 100));
  const polyStr = poly.map(p => p.join(",")).join(" ");
  return (
    <svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings.map((f, i) => {
        const ringPts = axes.map((_, ai) => pt(ai, f).join(",")).join(" ");
        return <polygon key={i} points={ringPts} fill="none" stroke={C.border} strokeWidth="1" />;
      })}
      {axes.map((a, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={C.border} strokeWidth="1" />; })}
      <polygon points={polyStr} fill={color + "55"} stroke={color} strokeWidth="2" />
      {poly.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={color} />)}
      {axes.map((a, i) => {
        const [lx, ly] = pt(i, 1.32);
        return (
          <text key={i} x={lx} y={ly} fill={C.textMuted} fontSize="12" fontWeight="600" textAnchor="middle" dominantBaseline="middle">{a.label}</text>
        );
      })}
    </svg>
  );
};


// ─── ANALYTICS HELPERS ────────────────────────────────────────────────────────
function filterByOutcome(trades, view) {
  if (view === "Wins") return trades.filter(t => t.outcome === "Win" || (t.outcome !== "Loss" && t.outcome !== "BE" && t.pnl > 0));
  if (view === "Losses") return trades.filter(t => t.outcome === "Loss" || (t.outcome !== "Win" && t.outcome !== "BE" && t.pnl < 0));
  return trades;
}

function BreakdownTable({ items }) {
  if (!items.length) return <div style={{ color: C.textDim, fontSize: 12, padding: "10px 0" }}>No data yet</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowX: "auto" }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 1fr 1fr", alignItems: "center", gap: 10, background: C.bg, borderRadius: 9, padding: "10px 14px", minWidth: 420 }}>
          <Badge color={it.color}>{it.label}</Badge>
          <div><div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", marginBottom: 2 }}>Win%</div><div className="mono" style={{ fontWeight: 700, color: it.winPct >= 50 ? C.accent : C.red, fontSize: 13 }}>{it.winPct}%</div></div>
          <div><div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", marginBottom: 2 }}>W/L</div><div className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{it.w}/{it.l}</div></div>
          <div><div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", marginBottom: 2 }}>Net</div><div className="mono" style={{ fontWeight: 700, fontSize: 13, color: it.net >= 0 ? C.accent : C.red }}>{fmt$(it.net)}</div></div>
          <div><div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", marginBottom: 2 }}>PF</div><div className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{it.pf >= 99 ? "∞" : it.pf.toFixed(1)}</div></div>
        </div>
      ))}
    </div>
  );
}

function buildFieldBreakdown(trades, field, colorFn) {
  const groups = {};
  trades.forEach(t => { const k = t[field]; if (!k) return; (groups[k] = groups[k] || []).push(t); });
  return Object.entries(groups).map(([label, ts]) => {
    const s = calcStats(ts);
    return { label, color: colorFn ? colorFn(label) : hashColor(label), winPct: Math.round(s.winRate), w: s.wins, l: s.losses, net: s.netPnl, pf: s.profitFactor };
  }).sort((a, b) => b.net - a.net);
}

function StatBreakdownSection({ icon, title, trades, field, strategies, colorFn }) {
  const [mode, setMode] = useState("Overall");
  const [setupPick, setSetupPick] = useState(strategies?.[0]?.name || "");
  const pool = mode === "By Setup" && setupPick ? trades.filter(t => t.setup === setupPick) : trades;
  const breakdown = buildFieldBreakdown(pool, field, colorFn);
  const chartData = breakdown.map(b => ({ label: b.label, value: b.net, count: b.w + b.l, winRate: b.winPct }));
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, fontWeight: 700, fontSize: 15 }}><span>{icon}</span>{title}</div>
        {mode === "By Setup" && strategies?.length > 0 && (
          <Sel value={setupPick} onChange={setSetupPick} options={strategies.map(s => s.name)} style={{ padding: "6px 10px", fontSize: 12 }} />
        )}
        <div style={{ display: "flex", gap: 6 }}>
          {["Overall", "By Setup"].map(m => <Btn key={m} small variant={mode === m ? "success" : "ghost"} onClick={() => setMode(m)}>{m}</Btn>)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>P&L by {title.replace(" Statistics", "")}</div>
          <GridBarChart data={chartData} height={260} colorFn={(d) => colorFn ? colorFn(d.label) : hashColor(d.label)} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>Breakdown</div>
          <BreakdownTable items={breakdown} />
        </div>
      </div>
    </Card>
  );
}

const timeframeColor = (v) => v === "15 min" ? "#38bdf8" : v === "30 min" ? "#2dd4bf" : v === "1 hr" ? C.yellow : hashColor(v);
const sessionColorMap = (v) => v === "Asian" ? "#38bdf8" : v === "London" ? "#9b6bff" : v === "New York" ? C.blue : v === "Pre-New York" ? "#38bdf8" : v === "Power Hour" ? "#ff8844" : hashColor(v);
const trendColor = (v) => v === "With Trend" ? C.accent : v === "Counter" ? C.red : hashColor(v);

function bucketDuration(mins) {
  if (mins == null) return null;
  if (mins < 5) return "<5 min";
  if (mins < 15) return "5-15 min";
  if (mins < 30) return "15-30 min";
  if (mins < 60) return "30-60 min";
  return ">60 min";
}
const DURATION_BUCKETS = ["<5 min", "5-15 min", "15-30 min", "30-60 min", ">60 min"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function roundToSlot(openTime, stepMin = 15) {
  if (!openTime) return null;
  const [h, m] = openTime.split(":").map(Number);
  const total = h * 60 + m;
  const rounded = Math.floor(total / stepMin) * stepMin;
  const rh = Math.floor(rounded / 60), rm = rounded % 60;
  return `${String(rh).padStart(2, "0")}:${String(rm).padStart(2, "0")}`;
}

function ViewToggle({ view, setView }) {
  return <div style={{ display: "flex", gap: 6 }}>{["All", "Wins", "Losses"].map(v => <Btn key={v} small variant={view === v ? "success" : "ghost"} onClick={() => setView(v)}>{v}</Btn>)}</div>;
}

function TimeOfDaySection({ trades }) {
  const [view, setView] = useState("All");
  const pool = filterByOutcome(trades, view);
  const slotMap = {};
  pool.forEach(t => { const slot = roundToSlot(t.openTime); if (!slot) return; (slotMap[slot] = slotMap[slot] || []).push(t); });
  const slots = Object.entries(slotMap).map(([label, ts]) => ({ label, value: ts.reduce((a, t) => a + t.pnl, 0), count: ts.length })).sort((a, b) => a.label.localeCompare(b.label));
  const [showAll, setShowAll] = useState(false);
  const visibleSlots = showAll ? slots : slots.slice(0, 3);
  if (!slots.length) return null;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>Performance by Time of Day</div>
        <ViewToggle view={view} setView={setView} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <GridBarChart data={slots} height={260} />
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visibleSlots.map(s => (
              <div key={s.label} style={{ background: C.bg, borderRadius: 9, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontWeight: 700, fontSize: 13 }}>{s.label}</div><div style={{ fontSize: 11, color: C.textDim }}>{s.count} trade{s.count !== 1 ? "s" : ""}</div></div>
                <div className="mono" style={{ fontWeight: 700, color: s.value >= 0 ? C.accent : C.red }}>{fmt$(s.value)}</div>
              </div>
            ))}
          </div>
          {slots.length > 3 && <button onClick={() => setShowAll(s => !s)} style={{ marginTop: 8, width: "100%", background: "none", border: "none", color: C.textMuted, fontSize: 12, cursor: "pointer", padding: 6 }}>{showAll ? "Show less ‹" : `${slots.length - 3} more time slots ⌄`}</button>}
        </div>
      </div>
    </Card>
  );
}

function DurationSection({ trades }) {
  const [view, setView] = useState("All");
  const pool = filterByOutcome(trades, view);
  const data = DURATION_BUCKETS.map(b => {
    const ts = pool.filter(t => bucketDuration(holdMinutes(t)) === b);
    return { label: b, value: ts.reduce((a, t) => a + t.pnl, 0), count: ts.length };
  });
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>Performance by Trade Duration</div>
        <ViewToggle view={view} setView={setView} />
      </div>
      <GridBarChart data={data} height={240} />
    </Card>
  );
}

function DayOfWeekSection({ trades }) {
  const [view, setView] = useState("All");
  const pool = filterByOutcome(trades, view);
  const data = DAY_NAMES.map((label, i) => {
    const ts = pool.filter(t => new Date(t.date).getDay() === i);
    return { label, value: ts.reduce((a, t) => a + t.pnl, 0), count: ts.length };
  }).filter(d => d.count > 0 || ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(d.label));
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>Performance by Day of the Week</div>
        <ViewToggle view={view} setView={setView} />
      </div>
      <GridBarChart data={data} height={240} />
    </Card>
  );
}

function LongShortCards({ trades }) {
  const longs = trades.filter(t => t.direction === "Long"), shorts = trades.filter(t => t.direction === "Short");
  const ls = calcStats(longs), ss = calcStats(shorts);
  return (
    <div>
      <SectionLabel>Long vs Short Performance</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}><span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Long Trades</span><span style={{ color: C.accent }}>♤</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>P&L:</span><b style={{ color: ls.netPnl >= 0 ? C.accent : C.red }}>{fmt$(ls.netPnl)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>Win Rate:</span><b>{ls.winRate.toFixed(1)}%</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>Total Trades:</span><b>{longs.length}</b></div>
          </div>
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}><span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Short Trades</span><span style={{ color: C.red }}>♤</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>P&L:</span><b style={{ color: ss.netPnl >= 0 ? C.accent : C.red }}>{fmt$(ss.netPnl)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>Win Rate:</span><b>{ss.winRate.toFixed(1)}%</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>Total Trades:</span><b>{shorts.length}</b></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function TopSymbolsTable({ trades }) {
  const symbols = [...new Set(trades.map(t => t.symbol))];
  const rows = symbols.map(sym => { const ts = trades.filter(t => t.symbol === sym); const s = calcStats(ts); return { sym, pnl: s.netPnl, count: ts.length, winRate: s.winRate }; }).sort((a, b) => b.pnl - a.pnl);
  if (!rows.length) return null;
  return (
    <div>
      <SectionLabel>Top Performing Symbols</SectionLabel>
      <Card style={{ padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Symbol", "P&L", "Trades", "Win Rate"].map((h, i) => <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "12px 16px", fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.sym} style={{ borderBottom: `1px solid ${C.border}20` }}>
                <td style={{ padding: "11px 16px", fontWeight: 700 }}>{r.sym}</td>
                <td style={{ padding: "11px 16px", textAlign: "right", color: r.pnl >= 0 ? C.accent : C.red, fontWeight: 700 }} className="mono">{fmt$(r.pnl)}</td>
                <td style={{ padding: "11px 16px", textAlign: "right" }}>{r.count}</td>
                <td style={{ padding: "11px 16px", textAlign: "right" }}>{r.winRate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Analytics({ state }) {
  const { trades, activeAccount } = state;
  const [range, setRange] = useState("All");
  const [setupView, setSetupView] = useState("All");
  const now = new Date();
  const byAccount = trades.filter(t => activeAccount === "all" || t.account === activeAccount);
  const filtered = byAccount.filter(t => {
    if (range === "All") return true;
    const days = range === "7D" ? 7 : range === "30D" ? 30 : 90;
    return (now - new Date(t.date)) / 86400000 <= days;
  });
  const stats = calcStats(filtered);
  const wins = filtered.filter(t => t.outcome === "Win" || (t.outcome !== "Loss" && t.outcome !== "BE" && t.pnl > 0));
  const losses = filtered.filter(t => t.outcome === "Loss" || (t.outcome !== "Win" && t.outcome !== "BE" && t.pnl < 0));
  const largestWin = wins.length ? Math.max(...wins.map(t => t.pnl)) : 0;
  const largestLoss = losses.length ? Math.min(...losses.map(t => t.pnl)) : 0;
  const ratio = stats.avgLoss ? stats.avgWin / stats.avgLoss : stats.avgWin > 0 ? 99 : 0;
  const totalFees = filtered.reduce((s, t) => s + (parseFloat(t.fees) || 0), 0);

  // Daily P&L (last 14 active trading days)
  const dayMap = {};
  filtered.forEach(t => { const k = new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }); dayMap[k] = (dayMap[k] || 0) + t.pnl; });
  const dailyData = Object.entries(dayMap).map(([label, value]) => ({ label, value, _d: new Date(filtered.find(t => new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) === label)?.date) }))
    .sort((a, b) => a._d - b._d).slice(-14).map(({ label, value }) => ({ label, value }));

  // Day win %
  const dayPnlMap = {};
  filtered.forEach(t => { const k = t.date.slice(0, 10); dayPnlMap[k] = (dayPnlMap[k] || 0) + t.pnl; });
  const tradingDayCount = Object.keys(dayPnlMap).length;
  const winningDays = Object.values(dayPnlMap).filter(v => v > 0).length;
  const dayWinPct = tradingDayCount ? (winningDays / tradingDayCount) * 100 : 0;
  const multiTradeDays = Object.entries(dayPnlMap).filter(([k]) => filtered.filter(t => t.date.startsWith(k)).length > 1).length;

  // Performance by setup
  const setupNames = [...new Set(filtered.map(t => t.setup).filter(Boolean))];
  const setupData = setupNames.map(s => {
    const st = filtered.filter(t => t.setup === s);
    const w = st.filter(t => t.outcome === "Win" || (t.outcome !== "Loss" && t.outcome !== "BE" && t.pnl > 0));
    const l = st.filter(t => t.outcome === "Loss" || (t.outcome !== "Win" && t.outcome !== "BE" && t.pnl < 0));
    const val = setupView === "Wins" ? w.reduce((a, t) => a + t.pnl, 0) : setupView === "Losses" ? Math.abs(l.reduce((a, t) => a + t.pnl, 0)) : calcStats(st).netPnl;
    return { label: s, value: val };
  }).sort((a, b) => b.value - a.value);

  const exportCSV = () => {
    const headers = ["date", "symbol", "direction", "outcome", "pnl", "setup"];
    const rows = filtered.map(t => headers.map(h => JSON.stringify(t[h] ?? "")).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "analytics_export.csv"; a.click();
  };

  return (
    <div className="fade-in" style={{ height: "100%", overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 26 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22, color: C.accent }}>♤</span>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1, color: C.accent }}>Analytics</h1>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", rowGap: 8 }}>
          {["7D", "30D", "90D", "All"].map(r => <Btn key={r} small variant={range === r ? "success" : "ghost"} onClick={() => setRange(r)}>{r}</Btn>)}
          <Btn small variant="gradient2" onClick={exportCSV} style={{ whiteSpace: "nowrap" }}>Export Data</Btn>
        </div>
      </div>

      {/* Performance Summary */}
      <div>
        <SectionLabel>Performance Summary</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <StatCard label="Net P&L" value={fmt$(stats.netPnl)} color={stats.netPnl >= 0 ? C.accent : C.red} icon="$" tone={stats.netPnl >= 0 ? "positive" : "negative"} />
          <StatCard label="Win Rate %" value={`${stats.winRate.toFixed(1)}%`} sub={`${stats.wins}W / ${stats.losses}L`} color={stats.winRate >= 50 ? C.accent : C.text} icon="◎" tone={stats.winRate >= 50 ? "positive" : "neutral"} />
          <StatCard label="Total Trades" value={filtered.length} sub={`${stats.wins} wins`} icon="♤" tone="neutral" />
          <StatCard label="Profit Factor" value={stats.profitFactor >= 99 ? "∞" : stats.profitFactor.toFixed(2)} color={C.accent} icon="🏆" tone="positive" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 14 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 14, color: C.textMuted, display: "flex", alignItems: "center" }}>⚖</span>
              <span style={{ fontSize: 13.5, color: C.textMuted, fontWeight: 500, flex: 1 }}>Avg win/loss ratio</span>
            </div>
            <div className="mono" style={{ fontSize: 26, fontWeight: 800, marginBottom: 12 }}>{ratio >= 99 ? "∞" : ratio.toFixed(1)}</div>
            <div style={{ height: 6, borderRadius: 3, overflow: "hidden", display: "flex", background: C.border }}>
              <div style={{ width: `${Math.min(100, (stats.avgWin / (stats.avgWin + stats.avgLoss || 1)) * 100)}%`, background: C.accent }} />
              <div style={{ flex: 1, background: C.red }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.textDim, marginTop: 6 }}><span style={{ color: C.accent }}>{fmt$(stats.avgWin)}</span><span style={{ color: C.red }}>{fmt$(-stats.avgLoss)}</span></div>
          </div>
          <StatCard label="Trade Expectancy" value={fmt$(stats.expectancy)} color={stats.expectancy >= 0 ? C.accent : C.red} icon="◎" tone="neutral" />
          <StatCard label="Total Fees" value={`-${totalFees.toFixed(2)}`} color={C.red} icon="$" tone="neutral" />
          <StatCard label="Day Win %" value={`${dayWinPct.toFixed(1)}%`} sub={`${multiTradeDays} multi-trade days`} color={C.accent} icon="📅" tone="neutral" />
        </div>
      </div>

      {/* Trade Statistics */}
      <div>
        <SectionLabel>Trade Statistics</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <StatCard label="Avg Win" value={fmt$(stats.avgWin)} color={C.accent} icon="♤" tone="positive" />
          <StatCard label="Avg Loss" value={fmt$(-stats.avgLoss)} color={C.red} icon="♤" tone="negative" />
          <StatCard label="Largest Win" value={fmt$(largestWin)} color={C.accent} icon="🏆" tone="positive" />
          <StatCard label="Largest Loss" value={fmt$(largestLoss)} color={C.red} icon="♤" tone="negative" />
        </div>
      </div>

      {/* Daily P&L + Win/Loss Distribution */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
        <Card>
          <SectionLabel>Daily P&L</SectionLabel>
          <GridBarChart data={dailyData} height={260} />
        </Card>
        <Card style={{ display: "flex", flexDirection: "column" }}>
          <SectionLabel>Win/Loss Distribution</SectionLabel>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DonutChart segments={[{ label: "Wins", value: stats.wins, color: C.accent }, { label: "Losses", value: stats.losses, color: C.red }]} />
          </div>
        </Card>
      </div>

      {/* Performance by Setup */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}><span>📊</span><span style={{ fontSize: 15, fontWeight: 700 }}>Performance by Setup</span></div>
          <div style={{ display: "flex", gap: 6 }}>
            {["All", "Wins", "Losses"].map(v => <Btn key={v} small variant={setupView === v ? "success" : "ghost"} onClick={() => setSetupView(v)}>{v}</Btn>)}
          </div>
        </div>
        <GridBarChart data={setupData} height={260} />
      </Card>

      <StatBreakdownSection icon="🕐" title="Time Frame Entry Statistics" trades={filtered} field="timeframe" strategies={state.strategies} colorFn={timeframeColor} />
      <StatBreakdownSection icon="🌐" title="Trading Session Statistics" trades={filtered} field="session" strategies={state.strategies} colorFn={sessionColorMap} />
      <StatBreakdownSection icon="⚠" title="Risk Meter Statistics" trades={filtered} field="risk" strategies={state.strategies} colorFn={riskColor} />
      <StatBreakdownSection icon="📈" title="Trend Alignment Statistics" trades={filtered} field="trendBias" strategies={state.strategies} colorFn={trendColor} />

      <LongShortCards trades={filtered} />
      <TopSymbolsTable trades={filtered} />
      <TimeOfDaySection trades={filtered} />
      <DurationSection trades={filtered} />
      <DayOfWeekSection trades={filtered} />

      <Card><EquityCurveChart trades={filtered} height={300} /></Card>
    </div>
  );
}

// ─── EMOTIONS SCORE (Behavioral Edge) ────────────────────────────────────────
// Composite 0-10 "edge score" per trade, blended from whichever behavioral
// fields were actually logged (mood, exit behavior, post-trade state, risk).
// Missing fields are skipped rather than penalized, and a Late exit that
// ended up a winner scores meaningfully higher than a Late exit that lost —
// mirroring how a real trader's discipline reads differently depending on
// whether the deviation from plan paid off.
function edgeScoreForTrade(t) {
  const parts = [];
  if (t.mood) parts.push(POSITIVE_MOODS.includes(t.mood) ? 9 : t.mood === "Neutral" ? 7 : NEGATIVE_MOODS.includes(t.mood) ? 4 : 6);
  if (t.exitBehavior) parts.push(t.exitBehavior === "Planned" ? 8.5 : t.exitBehavior === "Early" ? 7 : t.exitBehavior === "Late" ? (t.pnl >= 0 ? 7.5 : 4) : 6);
  if (t.postTradeState) parts.push(t.postTradeState === "Detached" ? 9 : t.postTradeState === "Neutral" ? 7 : t.postTradeState === "Attached" ? 4 : 6);
  if (t.risk) parts.push(t.risk === "Low Risk" ? 8.5 : t.risk === "Normal Risk" ? 7.5 : t.risk === "High Risk" ? 5 : 6);
  if (!parts.length) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function edgeZone(score) {
  if (score >= 7) return { key: "green", label: "Green Zone", color: C.accent, tier: "Professional Trader / Elite Mindset" };
  if (score >= 3) return { key: "yellow", label: "Yellow Zone", color: C.yellow, tier: "Disciplined Trader" };
  return { key: "red", label: "Red Zone", color: C.red, tier: "Poor Discipline Trader" };
}

function modeOf(arr) {
  if (!arr.length) return null;
  const counts = {};
  arr.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  let best = arr[0];
  Object.entries(counts).forEach(([k, c]) => { if (c > counts[best]) best = k; });
  return { value: best, count: counts[best] };
}

// Longest run of consecutive (chronological) trades sharing the same mood
function longestMoodStreak(sortedTrades) {
  let best = 0, cur = 0, prev = null;
  sortedTrades.forEach(t => {
    if (!t.mood) { prev = null; return; }
    if (t.mood === prev) cur++; else cur = 1;
    if (cur > best) best = cur;
    prev = t.mood;
  });
  return best;
}

// Most frequent mood[i] -> mood[i+1] transition
function mostFrequentShift(sortedTrades) {
  const withMood = sortedTrades.filter(t => t.mood);
  const counts = {};
  for (let i = 1; i < withMood.length; i++) {
    if (withMood[i].mood === withMood[i - 1].mood) continue;
    const key = `${withMood[i - 1].mood} → ${withMood[i].mood}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? { key: entries[0][0], count: entries[0][1] } : null;
}

// A "severe combo" = negative pre-trade mood + a late exit that lost money —
// the classic emotional spiral (stayed in a bad state, held a loser too long).
function isSevereCombo(t) {
  return NEGATIVE_MOODS.includes(t.mood) && t.exitBehavior === "Late" && t.pnl < 0;
}

function GradientZoneBar({ value, max, zones, height = 30 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ position: "relative", paddingTop: 10 }}>
      <div style={{ position: "absolute", top: 0, left: `calc(${pct}% - 9px)`, width: 18, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", border: `3px solid ${C.surface}`, boxShadow: "0 0 0 1px #0006, 0 2px 6px #0008" }} />
      </div>
      <div style={{ display: "flex", height, borderRadius: 8, overflow: "hidden", marginTop: 10 }}>
        {zones.map((z, i) => <div key={i} style={{ flex: z.to - z.from, background: z.color, opacity: 0.9 }} />)}
      </div>
    </div>
  );
}

const EdgeLineChart = ({ data, height = 260, domainMax = 10 }) => {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  if (!data.length) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 13 }}>No data yet</div>;
  const padTop = 16, padBottom = 30, padLeft = 34;
  const W = 900;
  const plotH = height - padTop - padBottom;
  const plotW = W - padLeft;
  const x = i => padLeft + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
  const y = v => padTop + (1 - Math.max(0, Math.min(domainMax, v)) / domainMax) * plotH;
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const yTicks = [0, domainMax * 0.3, domainMax * 0.6, domainMax];
  const step = Math.max(1, Math.ceil(data.length / 11));
  const strip = Math.max(2, plotW / data.length);

  const pointFromClientX = (clientX) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return null;
    const relX = ((clientX - rect.left) / rect.width) * W;
    let nearest = 0, minDist = Infinity;
    data.forEach((d, i) => { const dist = Math.abs(x(i) - relX); if (dist < minDist) { minDist = dist; nearest = i; } });
    return nearest;
  };
  const handleTouch = (e) => {
    const t = e.touches[0] || e.changedTouches[0];
    if (!t) return;
    const idx = pointFromClientX(t.clientX);
    if (idx != null) setHover(idx);
  };

  const hoverInfo = hover != null ? data[hover] : null;
  const leftPct = hover != null ? (x(hover) / W) * 100 : 0;
  const flip = leftPct > 60;
  const labelTransform = (i) => i === 0 ? "translateX(0)" : i === data.length - 1 ? "translateX(-100%)" : "translateX(-50%)";

  return (
    <div style={{ position: "relative", width: "100%", height: height + 20 }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height, display: "block", touchAction: "pan-y" }} preserveAspectRatio="none" onMouseLeave={() => setHover(null)} onTouchStart={handleTouch} onTouchMove={handleTouch}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padLeft} x2={W} y1={y(t)} y2={y(t)} stroke={C.border} strokeDasharray="4,4" />
            <text x={padLeft - 6} y={y(t) + 4} fill={C.textDim} fontSize="11" textAnchor="end">{t.toFixed(t % 1 === 0 ? 0 : 1)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke={C.accent} strokeWidth="2.5" />
        {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.value)} r={hover === i ? 0 : 3.5} fill={C.accent} />)}
        {hover != null && (
          <>
            <line x1={x(hover).toFixed(1)} x2={x(hover).toFixed(1)} y1={padTop} y2={padTop + plotH} stroke={C.textDim} strokeDasharray="3,3" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(data[hover].value)} r="6.5" fill={C.accent} stroke={C.surface} strokeWidth="3" />
          </>
        )}
        {data.map((d, i) => <rect key={i} x={x(i) - strip / 2} y={padTop} width={strip} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />)}
      </svg>
      {data.map((d, i) => (i % step === 0 || i === data.length - 1) && (
        <div key={i} style={{ position: "absolute", left: `${(x(i) / W) * 100}%`, top: height + 2, transform: labelTransform(i), fontSize: 10, color: C.textDim, whiteSpace: "nowrap" }}>{d.label}</div>
      ))}
      {hoverInfo && (
        <div style={{
          position: "absolute", top: 8, [flip ? "right" : "left"]: `${flip ? 100 - leftPct : leftPct}%`,
          transform: `translateX(${flip ? "-10px" : "10px"})`,
          background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px",
          minWidth: 140, boxShadow: "0 10px 30px #000a", pointerEvents: "none", zIndex: 6,
        }}>
          <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>{hoverInfo.label}</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: C.accent, marginTop: 3 }}>{hoverInfo.value.toFixed(2)} / 10</div>
        </div>
      )}
    </div>
  );
};

function EmotionsScore({ state, dispatch, setPage }) {
  const { trades, activeAccount } = state;
  const [range, setRange] = useState("All");
  const [openRec, setOpenRec] = useState(null);
  const [startedRecs, setStartedRecs] = useState({});
  const now = new Date();

  const byAccount = trades.filter(t => activeAccount === "all" || t.account === activeAccount);
  const rangeDays = range === "7D" ? 7 : range === "30D" ? 30 : range === "90D" ? 90 : null;
  const filtered = byAccount.filter(t => rangeDays == null || (now - new Date(t.date)) / 86400000 <= rangeDays);
  const priorFiltered = rangeDays == null ? [] : byAccount.filter(t => {
    const days = (now - new Date(t.date)) / 86400000;
    return days > rangeDays && days <= rangeDays * 2;
  });
  const chronological = [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));

  const scored = filtered.map(t => ({ t, edge: edgeScoreForTrade(t) })).filter(x => x.edge != null);
  const avgEdge = scored.length ? scored.reduce((a, x) => a + x.edge, 0) / scored.length : 0;
  const priorScored = priorFiltered.map(t => edgeScoreForTrade(t)).filter(v => v != null);
  const avgEdgePrior = priorScored.length ? priorScored.reduce((a, b) => a + b, 0) / priorScored.length : null;
  const zone = edgeZone(avgEdge);

  const moodMode = modeOf(filtered.filter(t => t.mood).map(t => t.mood));
  const detachedCount = filtered.filter(t => t.postTradeState === "Detached").length;
  const postStateLogged = filtered.filter(t => t.postTradeState).length;
  const outcomeNeutralRate = postStateLogged ? (detachedCount / postStateLogged) * 100 : 0;

  // ── Emotional Performance Breakdown table (per mood) ──
  const moodNames = [...new Set(filtered.map(t => t.mood).filter(Boolean))];
  const moodRows = moodNames.map(m => {
    const ts = filtered.filter(t => t.mood === m);
    const s = calcStats(ts);
    const edges = ts.map(t => edgeScoreForTrade(t)).filter(v => v != null);
    const avgE = edges.length ? edges.reduce((a, b) => a + b, 0) / edges.length : 0;
    const lateLoss = ts.filter(t => t.exitBehavior === "Late" && t.pnl < 0).length;
    const neutralN = ts.filter(t => t.postTradeState === "Detached").length;
    const neutralD = ts.filter(t => t.postTradeState).length;
    return {
      label: m, count: ts.length, avgEdge: avgE, winRate: s.winRate, avgPnl: ts.reduce((a, t) => a + t.pnl, 0) / ts.length,
      lateLossPct: ts.length ? (lateLoss / ts.length) * 100 : 0, neutralPct: neutralD ? (neutralN / neutralD) * 100 : 0,
    };
  }).sort((a, b) => b.count - a.count);
  const bestMoodRow = moodRows.length ? [...moodRows].sort((a, b) => b.avgEdge - a.avgEdge)[0] : null;
  const worstMoodRow = moodRows.length > 1 ? [...moodRows].sort((a, b) => a.avgEdge - b.avgEdge)[0] : null;

  // ── Exit Behavior Analysis ──
  const exitLogged = filtered.filter(t => t.exitBehavior);
  const plannedExits = exitLogged.filter(t => t.exitBehavior === "Planned");
  const earlyExits = exitLogged.filter(t => t.exitBehavior === "Early");
  const lateWinExits = exitLogged.filter(t => t.exitBehavior === "Late" && t.pnl >= 0);
  const lateLossExits = exitLogged.filter(t => t.exitBehavior === "Late" && t.pnl < 0);
  const plannedRate = exitLogged.length ? (plannedExits.length / exitLogged.length) * 100 : 0;
  const exitDisciplineScore = exitLogged.length
    ? ((plannedExits.length * 100 + earlyExits.length * 70 + lateWinExits.length * 55 + lateLossExits.length * 20) / exitLogged.length)
    : 0;
  const severeCombos = filtered.filter(isSevereCombo);
  const exitDist = [
    { label: "Exit Early", n: earlyExits.length, color: C.yellow },
    { label: "As Planned", n: plannedExits.length, color: C.accent },
    { label: "Exit Late (Winners)", n: lateWinExits.length, color: C.blue },
    { label: "Exit Late (Losers)", n: lateLossExits.length, color: C.red },
  ].map(d => ({ ...d, pct: exitLogged.length ? Math.round((d.n / exitLogged.length) * 100) : 0 }));
  const mostCommonExit = exitDist.length ? [...exitDist].sort((a, b) => b.n - a.n)[0] : null;
  const edgeByExit = [
    ["Planned", plannedExits], ["Early", earlyExits], ["Late (Win)", lateWinExits], ["Late (Loss)", lateLossExits],
  ].map(([label, ts]) => {
    const edges = ts.map(t => edgeScoreForTrade(t)).filter(v => v != null);
    return { label, avgEdge: edges.length ? edges.reduce((a, b) => a + b, 0) / edges.length : null, avgPnl: ts.length ? ts.reduce((a, t) => a + t.pnl, 0) / ts.length : null };
  });
  const severeFreqPct = filtered.length ? (severeCombos.length / filtered.length) * 100 : 0;

  // ── Emotional Stability Score ──
  const moodSeq = chronological.filter(t => t.mood);
  let shifts = 0;
  for (let i = 1; i < moodSeq.length; i++) if (moodSeq[i].mood !== moodSeq[i - 1].mood) shifts++;
  const shiftRate = moodSeq.length > 1 ? (shifts / (moodSeq.length - 1)) * 100 : 0;
  const stabilityScore = Math.round(100 - shiftRate);
  const stabilityTier = stabilityScore >= 80 ? { label: "Elite Stability", color: C.accent } : stabilityScore >= 60 ? { label: "Stable" , color: C.accent } : stabilityScore >= 35 ? { label: "Developing Stability", color: C.yellow } : { label: "Reactive", color: C.red };
  const longestStreak = longestMoodStreak(chronological);
  const freqShift = mostFrequentShift(chronological);

  // ── Recommendations ──
  const recCandidates = [];
  if (severeCombos.length > 0) {
    recCandidates.push({
      id: "spiral", severity: "HIGH", title: "Stop the Spiral",
      text: `Last ${filtered.length} trades contained ${severeCombos.length} negative-mood + late-loss combo${severeCombos.length !== 1 ? "s" : ""}. These are your most expensive pattern.`,
      detail: "When a negative mood (Anxious, Greedy, Impulsive, Tired) is logged and the trade is also exited late for a loss, it's a sign you held on while emotionally compromised. Pre-commit to a hard stop before entry, and treat hitting it as a win for discipline — not a loss.",
    });
  }
  if (plannedRate < 90 && exitLogged.length >= 3) {
    recCandidates.push({
      id: "exit", severity: plannedRate < 70 ? "HIGH" : "MEDIUM", title: "Exit Discipline Upgrade",
      text: `Only ${plannedRate.toFixed(0)}% of trades exited as planned. ${lateLossExits.length} late-loss exit${lateLossExits.length !== 1 ? "s" : ""} detected.`,
      detail: "Write your exit price and invalidation level before entry, and treat any deviation as data to review afterward rather than a decision to make live.",
    });
  }
  if (stabilityScore < 75 && moodSeq.length >= 5) {
    recCandidates.push({
      id: "stability", severity: stabilityScore < 45 ? "HIGH" : "MEDIUM", title: "Strengthen Emotional Consistency",
      text: `Your Emotional Stability Score is ${stabilityScore}% (${stabilityTier.label}). Emotional patterns are ${stabilityScore < 45 ? "erratic" : "still forming"}.`,
      detail: "A high shift rate between trades means your mindset resets constantly instead of compounding. Try a 2-minute pause between trades to re-anchor to one dominant, process-focused state.",
    });
  }
  if (!recCandidates.length) {
    recCandidates.push({ id: "keepgoing", severity: "LOW", title: "Keep Logging", text: "No major behavioral leaks detected in this range — keep logging mood, exit behavior, and post-trade state to sharpen these insights further.", detail: "Consistent logging is what makes every other number on this page trustworthy." });
  }
  const recommendations = recCandidates.slice(0, 3);
  const sevColor = s => s === "HIGH" ? C.red : s === "MEDIUM" ? C.yellow : C.textMuted;

  // ── Daily edge score (last 30 active trading days) ──
  const dayEdgeMap = {};
  scored.forEach(({ t, edge }) => { const k = t.date.slice(0, 10); (dayEdgeMap[k] = dayEdgeMap[k] || []).push(edge); });
  const dailyEdgeData = Object.entries(dayEdgeMap)
    .map(([k, arr]) => ({ key: k, label: new Date(k).toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: arr.reduce((a, b) => a + b, 0) / arr.length }))
    .sort((a, b) => a.key.localeCompare(b.key)).slice(-30);

  // ── Avg P&L by emotion / Win rate by emotion ──
  const avgPnlByMood = moodRows.map(m => ({ label: m.label, value: m.avgPnl }));
  const winRateByMood = moodRows.map(m => ({ label: m.label, value: Math.round(m.winRate) }));

  // ── Outcome neutral vs attached ──
  const neutralYes = filtered.filter(t => t.postTradeState === "Detached");
  const neutralNo = filtered.filter(t => t.postTradeState === "Attached");
  const neutralBars = [
    { label: "Detached: Yes", value: neutralYes.length ? neutralYes.reduce((a, t) => a + t.pnl, 0) / neutralYes.length : 0, count: neutralYes.length },
    { label: "Detached: No", value: neutralNo.length ? neutralNo.reduce((a, t) => a + t.pnl, 0) / neutralNo.length : 0, count: neutralNo.length },
  ];

  // ── Emotion statistics table (modifier = deviation of avg edge from 5, scaled) ──
  const emotionStatRows = moodRows.map(m => ({ ...m, modifier: (m.avgEdge - 5) / 5 })).sort((a, b) => b.modifier - a.modifier);

  const hasAnyData = filtered.some(t => t.mood || t.exitBehavior || t.postTradeState || t.risk);
  const thermoZones = [{ from: 0, to: 3, color: C.red }, { from: 3, to: 7, color: C.yellow }, { from: 7, to: 10, color: C.accent }];
  const stabilityZones = [{ from: 0, to: 35, color: C.red }, { from: 35, to: 60, color: C.yellow }, { from: 60, to: 80, color: "#38bdf8" }, { from: 80, to: 100, color: C.accent }];

  const coachingInsight = (() => {
    if (!hasAnyData) return "Log mood, exit behavior, post-trade state, and risk level on your trades to unlock coaching insights here.";
    const p1 = `Your ${range === "All" ? "all-time" : range} score sits at ${avgEdge.toFixed(2)}/10 (${zone.label}), driven by ${plannedRate.toFixed(0)}% planned exits and a ${outcomeNeutralRate.toFixed(0)}% outcome-neutral rate${bestMoodRow ? ` with strong ${bestMoodRow.label}-state execution` : ""}. ${severeCombos.length ? `${severeCombos.length} severe combo${severeCombos.length !== 1 ? "s" : ""} (negative mood + late-loss exit) and ${lateLossExits.length} late-loss exit${lateLossExits.length !== 1 ? "s" : ""} caused the largest drawdowns.` : `No severe emotional combos were detected in this range — that's a real strength.`}`;
    const p2 = worstMoodRow && bestMoodRow && worstMoodRow.label !== bestMoodRow.label
      ? `Your results vary sharply by emotional state. ${worstMoodRow.label}-driven trades are currently the weakest link, while ${bestMoodRow.label}-based trades show far higher execution consistency.`
      : `Keep logging your pre-trade mood consistently — a few more data points will reveal which emotional states drive your best and worst execution.`;
    const p3 = severeCombos.length
      ? `→ Biggest Leverage: Pause 2 minutes when ${NEGATIVE_MOODS.slice(0, 2).join(" or ")} is detected. Write your exit plan before entry.`
      : `→ Biggest Leverage: Keep exit behavior planned — it's the single biggest driver of your score.`;
    return [p1, p2, p3];
  })();

  return (
    <div className="fade-in" style={{ height: "100%", overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1, display: "flex", alignItems: "center", gap: 8, color: C.accent }}><span>♤</span> Edge Score</h1>
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>Understand your emotional patterns and their impact on trading performance.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["7D", "30D", "90D", "All"].map(r => <Btn key={r} small variant={range === r ? "success" : "ghost"} onClick={() => setRange(r)}>{r}</Btn>)}
        </div>
      </div>

      {!hasAnyData && (
        <Card style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 30, marginBottom: 10, opacity: 0.6 }}>⚡</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No behavioral data logged yet</div>
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 16 }}>Log mood, exit behavior, post-trade state, and risk level when adding trades to build your Behavioral Edge Score.</div>
          <Btn onClick={() => openAddTrade(state, dispatch)}>+ Log a Trade</Btn>
        </Card>
      )}

      {/* Top stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <Card>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Period Avg Edge Score</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <div className="mono" style={{ fontSize: 30, fontWeight: 800, color: zone.color }}>{avgEdge.toFixed(2)}</div>
            <div style={{ fontSize: 13, color: C.textDim }}>/ 10</div>
          </div>
          <Badge color={zone.color}>{zone.label}</Badge>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
            {avgEdgePrior != null ? (avgEdge >= avgEdgePrior ? `▲ +${(avgEdge - avgEdgePrior).toFixed(2)} vs prior ${range}` : `▼ ${(avgEdge - avgEdgePrior).toFixed(2)} vs prior ${range}`) : "No prior period comparison"}
          </div>
          <div style={{ fontSize: 11, color: C.textDim }}>{range === "All" ? "All time" : `Last ${range}`}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Most Common Mindset</div>
          <div className="mono" style={{ fontSize: 24, fontWeight: 800, color: moodMode ? moodColor(moodMode.value) : C.text }}>{moodMode ? moodMode.value : "—"}</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>{moodMode ? `${moodMode.count} trades` : "No mood logged"}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Outcome Neutral Rate</div>
          <div className="mono" style={{ fontSize: 30, fontWeight: 800, color: C.accent }}>{outcomeNeutralRate.toFixed(0)}%</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>Remained detached from outcome</div>
        </Card>
        <Card>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Total Trades Analyzed</div>
          <div className="mono" style={{ fontSize: 30, fontWeight: 800 }}>{filtered.length}</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>In selected period</div>
        </Card>
      </div>

      {/* Thermometer */}
      <Card>
        <SectionLabel>Behavioral Edge Thermometer</SectionLabel>
        <GradientZoneBar value={Math.max(0, Math.min(10, avgEdge))} max={10} zones={thermoZones} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: C.textDim }}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <span key={n}>{n}</span>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 18 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 4 }}>Red Zone (0–3)</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>Elevated emotional pressure. Risk of impulsive execution.</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.yellow, marginBottom: 4 }}>Yellow Zone (3–7)</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>Mixed mindset. Variable execution.</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 4 }}>Green Zone (7–10)</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>Stable, process-focused mindset.</div>
          </div>
        </div>
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Trader Benchmarks</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { key: "red", label: "Poor Discipline Trader", desc: "Frequent emotional trading. Reactive exits. Low outcome neutrality.", color: C.red },
              { key: "yellow", label: "Disciplined Trader", desc: "Mostly process-driven. Occasional emotional interference. Improving consistency.", color: C.yellow },
              { key: "green", label: "Professional Trader / Elite Mindset", desc: "Consistent execution. Strong emotional regulation. Follows plan.", color: C.accent },
            ].map(b => (
              <div key={b.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, background: zone.key === b.key ? b.color + "14" : "transparent", border: zone.key === b.key ? `1px solid ${b.color}44` : "1px solid transparent" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: b.color, marginTop: 5, flexShrink: 0 }} />
                <div><span style={{ fontWeight: 700, fontSize: 13, color: b.color }}>{b.label}</span><div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{b.desc}</div></div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Coaching Insight */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><span style={{ fontSize: 16 }}>📈</span><span style={{ fontWeight: 700, fontSize: 15 }}>Coaching Insight</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13, color: C.textMuted, lineHeight: 1.7 }}>
          {coachingInsight.map((p, i) => <div key={i} style={i === coachingInsight.length - 1 ? { color: C.accent, fontWeight: 600 } : {}}>{p}</div>)}
        </div>
      </Card>

      {/* Emotional Performance Breakdown */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 14px" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Emotional Performance Breakdown</div>
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>Performance metrics by dominant pre-trade emotion.</div>
        </div>
        {moodRows.length === 0 ? <div style={{ padding: "0 20px 20px", color: C.textDim, fontSize: 13 }}>No moods logged yet.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  {["Emotion", "Trades", "Avg Edge", "Win Rate", "Avg P&L", "Late-Loss %", "Neutral %"].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "10px 20px", fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {moodRows.map(m => (
                  <tr key={m.label} style={{ borderBottom: `1px solid ${C.border}20` }}>
                    <td style={{ padding: "11px 20px", fontWeight: 700, color: moodColor(m.label) }}>{m.label}</td>
                    <td style={{ padding: "11px 20px", textAlign: "right" }}>{m.count}</td>
                    <td style={{ padding: "11px 20px", textAlign: "right" }} className="mono">{m.avgEdge.toFixed(1)}</td>
                    <td style={{ padding: "11px 20px", textAlign: "right", color: m.winRate >= 50 ? C.accent : C.red }} className="mono">{m.winRate.toFixed(0)}%</td>
                    <td style={{ padding: "11px 20px", textAlign: "right", color: m.avgPnl >= 0 ? C.accent : C.red }} className="mono">{fmt$(m.avgPnl)}</td>
                    <td style={{ padding: "11px 20px", textAlign: "right", color: m.lateLossPct > 0 ? C.red : C.textMuted }} className="mono">{m.lateLossPct.toFixed(0)}%</td>
                    <td style={{ padding: "11px 20px", textAlign: "right" }} className="mono">{m.neutralPct.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(bestMoodRow || worstMoodRow) && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "16px 20px" }}>
            {bestMoodRow && <Badge color={C.accent}>🟢 Highest Performing: {bestMoodRow.label} ({bestMoodRow.avgEdge.toFixed(1)} avg edge, {bestMoodRow.count} trades)</Badge>}
            {worstMoodRow && <Badge color={C.red}>🔴 Most Risk: {worstMoodRow.label} ({worstMoodRow.avgEdge.toFixed(1)} avg edge, {worstMoodRow.count} trades)</Badge>}
          </div>
        )}
        {bestMoodRow && (
          <div style={{ margin: "0 20px 20px", padding: 14, background: C.bg, borderRadius: 10 }}>
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Emotional Pattern Insight</div>
            <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>
              Your performance improves significantly when trading {bestMoodRow.label}. Continue prioritizing structured preparation.{worstMoodRow && worstMoodRow.label !== bestMoodRow.label ? ` ${worstMoodRow.label}-related trades show more inconsistency and emotional volatility — consider a mandatory cooldown before entering in that state.` : ""}
            </div>
          </div>
        )}
      </Card>

      {/* Exit Behavior Analysis */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Exit Behavior Analysis</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Planned Exit Rate</div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 800, color: C.accent }}>{plannedRate.toFixed(0)}%</div>
          </div>
          <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Exit Discipline Score</div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 800, color: C.blue }}>{exitDisciplineScore.toFixed(0)}%</div>
          </div>
          <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Late-Loss Count</div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 800, color: C.red }}>{lateLossExits.length}</div>
          </div>
          <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Severe Combos</div>
            <div className="mono" style={{ fontSize: 24, fontWeight: 800, color: C.red }}>{severeCombos.length}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Exit Behavior Distribution</div>
              {mostCommonExit && <div style={{ fontSize: 12, color: C.textMuted }}>Most common: <b style={{ color: C.text }}>{mostCommonExit.label.replace("As ", "")}</b></div>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {exitDist.map(d => (
                <div key={d.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: C.textMuted }}>{d.label}</span>
                    <span style={{ fontWeight: 700, color: d.color }}>({d.n}) {d.pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}><div style={{ width: `${d.pct}%`, height: "100%", background: d.color }} /></div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Performance Correlations</div>
            <div style={{ background: C.bg, borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>Avg Edge Score by Exit Type</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {edgeByExit.map(e => (
                  <div key={e.label}><span style={{ fontSize: 11, color: C.textMuted }}>{e.label}: </span><span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{e.avgEdge != null ? e.avgEdge.toFixed(1) : "—"}</span></div>
                ))}
              </div>
            </div>
            <div style={{ background: C.bg, borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>Avg P&L by Exit Type</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {edgeByExit.map(e => (
                  <div key={e.label}><span style={{ fontSize: 11, color: C.textMuted }}>{e.label}: </span><span className="mono" style={{ fontWeight: 700, fontSize: 13, color: e.avgPnl == null ? C.text : e.avgPnl >= 0 ? C.accent : C.red }}>{e.avgPnl != null ? fmt$(e.avgPnl) : "—"}</span></div>
                ))}
              </div>
            </div>
            {severeCombos.length > 0 && (
              <div style={{ background: C.redDim, border: `1px solid ${C.red}40`, borderRadius: 10, padding: "10px 14px", marginBottom: 8, fontSize: 12, color: C.red }}>
                <b>⚠ Severe Combo Impact</b><div style={{ marginTop: 2 }}>{severeFreqPct.toFixed(0)}% frequency across logged trades</div>
              </div>
            )}
            <div style={{ background: plannedRate >= 60 ? C.accentDim : C.yellowDim, border: `1px solid ${(plannedRate >= 60 ? C.accent : C.yellow)}40`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: plannedRate >= 60 ? C.accent : C.yellow }}>
              {plannedRate >= 60 ? "Strong discipline" : "Needs improvement"}: {plannedRate.toFixed(0)}% planned exits
            </div>
          </div>
        </div>
      </Card>

      {/* Emotional Stability Score */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Emotional Stability Score</div>
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, alignItems: "start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span className="mono" style={{ fontSize: 40, fontWeight: 800, color: stabilityTier.color }}>{Math.max(0, stabilityScore)}</span>
              <span style={{ fontSize: 18, color: C.textDim }}>%</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: stabilityTier.color }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: stabilityTier.color }}>{stabilityTier.label}</span>
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginBottom: 14 }}>
              {stabilityScore >= 80 ? "Your mindset is highly consistent trade to trade." : stabilityScore >= 60 ? "Your emotional state is largely stable across trades." : stabilityScore >= 35 ? "Emotional patterns are forming. Continued consistency will improve execution stability." : "Your emotional state changes frequently between trades. This tends to hurt execution consistency."}
            </div>
            <GradientZoneBar value={Math.max(0, Math.min(100, stabilityScore))} max={100} zones={stabilityZones} height={16} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, color: C.textDim }}>
              <span>Reactive</span><span>Developing</span><span>Stable</span><span>Elite</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Emotional Behavior Breakdown</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}><div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>Trades Analyzed</div><div className="mono" style={{ fontSize: 20, fontWeight: 800 }}>{filtered.length}</div></div>
              <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}><div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>Emotion Shift Rate</div><div className="mono" style={{ fontSize: 20, fontWeight: 800 }}>{shiftRate.toFixed(0)}%</div></div>
              <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}><div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>Longest Focus Streak</div><div className="mono" style={{ fontSize: 20, fontWeight: 800 }}>{longestStreak}</div></div>
              <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}><div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>Most Frequent Shift</div><div style={{ fontSize: 15, fontWeight: 800 }}>{freqShift ? freqShift.key : "—"}</div></div>
            </div>
            <div style={{ background: C.bg, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: C.textMuted, marginBottom: 10 }}>
              {shiftRate < 30 ? "Low variability. Your emotional state is carrying over well between trades." : shiftRate < 55 ? "Moderate variability. Reinforcing a dominant emotional state may improve consistency." : "High variability. Your emotional state resets often — a short pre-trade routine may help anchor it."}
            </div>
            <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>What this measures: tracks how often your emotional state changes between trades. Higher stability typically leads to more consistent execution.</div>
          </div>
        </div>
      </Card>

      {/* Top 3 Recommendations */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Top {recommendations.length} Recommendation{recommendations.length !== 1 ? "s" : ""}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {recommendations.map((r, i) => (
            <div key={r.id} style={{ background: C.bg, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: C.textDim }}>#{i + 1}</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{r.title}</span>
                <Badge color={sevColor(r.severity)}>{r.severity}</Badge>
              </div>
              <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12, lineHeight: 1.6 }}>{r.text}</div>
              {openRec === r.id && <div style={{ fontSize: 12, color: C.textDim, background: C.surfaceHigh, borderRadius: 8, padding: 12, marginBottom: 12, lineHeight: 1.6 }}>{r.detail}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <Btn small variant="ghost" onClick={() => setOpenRec(o => o === r.id ? null : r.id)}>{openRec === r.id ? "▴ Hide" : "▾ View Experiment"}</Btn>
                <Btn small variant={startedRecs[r.id] ? "success" : "primary"} onClick={() => setStartedRecs(s => ({ ...s, [r.id]: !s[r.id] }))}>{startedRecs[r.id] ? "✓ Started" : "▷ Start"}</Btn>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Daily Edge Score */}
      <Card>
        <SectionLabel>Daily Edge Score (Last 30 Days)</SectionLabel>
        <EdgeLineChart data={dailyEdgeData} height={260} />
      </Card>

      {/* Avg P&L by Emotion + Win Rate by Emotion */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <SectionLabel>Average P&L by Emotion</SectionLabel>
          <GridBarChart data={avgPnlByMood} height={260} colorFn={(d) => moodColor(d.label)} />
        </Card>
        <Card>
          <SectionLabel>Win Rate by Emotion (%)</SectionLabel>
          <GridBarChart data={winRateByMood} height={260} colorFn={() => C.blue} yMin={0} yMax={100} axisFormat={v => `${Math.round(v)}%`} tooltipFormat={v => `${Math.round(v)}%`} />
        </Card>
      </div>

      {/* Outcome Neutral vs Attached */}
      <Card>
        <SectionLabel>Avg P&L: Outcome Neutral vs Attached</SectionLabel>
        <GridBarChart data={neutralBars} height={220} colorFn={(d) => d.value >= 0 ? C.accent : C.red} />
      </Card>

      {/* Emotion Statistics table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 14px", fontWeight: 700, fontSize: 15 }}>Emotion Statistics</div>
        {emotionStatRows.length === 0 ? <div style={{ padding: "0 20px 20px", color: C.textDim, fontSize: 13 }}>No moods logged yet.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  {["Emotion", "Modifier", "Trade Count", "Avg P&L", "Win Rate"].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "10px 20px", fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {emotionStatRows.map(m => (
                  <tr key={m.label} style={{ borderBottom: `1px solid ${C.border}20` }}>
                    <td style={{ padding: "11px 20px", fontWeight: 700, color: moodColor(m.label) }}>{m.label}</td>
                    <td style={{ padding: "11px 20px", textAlign: "right", color: m.modifier >= 0 ? C.accent : C.red }} className="mono">{m.modifier >= 0 ? "+" : ""}{m.modifier.toFixed(2)}</td>
                    <td style={{ padding: "11px 20px", textAlign: "right" }}>{m.count}</td>
                    <td style={{ padding: "11px 20px", textAlign: "right", color: m.avgPnl >= 0 ? C.accent : C.red }} className="mono">{fmt$(m.avgPnl)}</td>
                    <td style={{ padding: "11px 20px", textAlign: "right" }}>{m.winRate.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Btn variant="ghost" onClick={() => setPage && setPage("journal")} style={{ alignSelf: "flex-start" }}>← Review trades in Trades</Btn>
    </div>
  );
}

// ─── PROP FIRM TRACKER (Finances) ────────────────────────────────────────────
const FIRM_PALETTE = [C.accent, C.blue, "#9b6bff", C.yellow, "#ff8844", C.red, "#2dd4bf", "#38bdf8"];
const firmColor = (id, list) => FIRM_PALETTE[Math.max(0, list.findIndex(f => f.id === id)) % FIRM_PALETTE.length];
function firmExpenseTotal(f) { return (parseFloat(f.evaluation) || 0) + (parseFloat(f.fundedFee) || 0) + (parseFloat(f.subscription) || 0) + (parseFloat(f.platform) || 0) + (parseFloat(f.other) || 0); }
function buildFirmStats(propFirms, payouts) {
  return propFirms.map(f => {
    const fPayouts = payouts.filter(p => p.firmId === f.id);
    const gross = fPayouts.reduce((s, p) => s + (parseFloat(p.gross) || 0), 0);
    const net = fPayouts.reduce((s, p) => s + (parseFloat(p.gross) || 0) * ((parseFloat(p.splitPct) || 100) / 100), 0);
    const expense = firmExpenseTotal(f);
    const netProfit = net - expense;
    const roi = expense ? (netProfit / expense) * 100 : (net > 0 ? 100 : 0);
    return { ...f, payouts: fPayouts, gross, revenue: net, expense, netProfit, roi };
  });
}

// Grouped bars — 2 or 3 series per category, e.g. Revenue vs Expenses (vs Net)
function GroupedBarChart({ data, series, height = 260 }) {
  const [hover, setHover] = useState(null);
  if (!data.length) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 13 }}>No data yet</div>;
  const allVals = data.flatMap(d => series.map(s => d[s.key] || 0));
  const max = Math.max(...allVals, 0), min = Math.min(...allVals, 0);
  const range = max - min || 1;
  const padTop = 10, padBottom = 30, padLeft = 56;
  const plotH = height - padTop - padBottom;
  const zeroY = padTop + (max / range) * plotH;
  const ySteps = 4;
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => min + (range / ySteps) * i).reverse();
  return (
    <div>
      <div style={{ position: "relative", width: "100%", height }}>
        {yLabels.map((v, i) => {
          const y = padTop + (i / ySteps) * plotH;
          return (
            <div key={i} style={{ position: "absolute", left: 0, top: y - 6, width: "100%" }}>
              <span style={{ position: "absolute", left: 0, fontSize: 10, color: C.textDim, fontFamily: "'Inter',sans-serif" }}>${Math.round(v).toLocaleString()}</span>
              <div style={{ position: "absolute", left: padLeft, right: 0, top: 6, borderTop: v === 0 ? `1px solid ${C.borderLight}` : `1px dashed ${C.border}` }} />
            </div>
          );
        })}
        <div style={{ position: "absolute", left: padLeft, right: 0, top: padTop, bottom: padBottom, display: "flex", alignItems: "stretch", justifyContent: "center", gap: 2 }}>
          {data.map((d, i) => (
            <div key={i} style={{ flex: "1 1 0", maxWidth: BAR_SLOT_MAX_WIDTH, minWidth: 0, position: "relative", display: "flex", justifyContent: "center", gap: 3 }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(h => h === i ? null : h)}>
              {hover === i && (
                <div style={{ position: "absolute", bottom: plotH + 8, left: "50%", transform: "translateX(-50%)", background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 11, whiteSpace: "nowrap", zIndex: 5, boxShadow: "0 4px 14px #0008" }}>
                  <div style={{ color: C.textMuted, marginBottom: 3, fontWeight: 700 }}>{d.label}</div>
                  {series.map(s => <div key={s.key} style={{ color: s.color }}>{s.label}: {fmt$(d[s.key] || 0)}</div>)}
                </div>
              )}
              {series.map(s => {
                const v = d[s.key] || 0;
                const barH = Math.max(1, (Math.abs(v) / range) * plotH);
                const isPos = v >= 0;
                return <div key={s.key} style={{ width: `${Math.floor(70 / series.length)}%`, maxWidth: 34, position: "absolute", top: isPos ? zeroY - padTop - barH : zeroY - padTop, height: barH, background: s.color, borderRadius: 3, opacity: hover === i ? 1 : 0.9 }} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", marginLeft: padLeft, justifyContent: "center", gap: 2 }}>
        {data.map((d, i) => <div key={i} style={{ flex: "1 1 0", maxWidth: BAR_SLOT_MAX_WIDTH, minWidth: 0, textAlign: "center", fontSize: 10, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</div>)}
      </div>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 10 }}>
        {series.map(s => <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.textMuted }}><div style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />{s.label}</div>)}
      </div>
    </div>
  );
}

// Stacked bars — category breakdown per firm
function StackedBarChart({ data, series, height = 260 }) {
  if (!data.length) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 13 }}>No data yet</div>;
  const totals = data.map(d => series.reduce((s, k) => s + (d[k.key] || 0), 0));
  const max = Math.max(...totals, 1);
  const padBottom = 26;
  const plotH = height - padBottom;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 10, height: plotH }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: "1 1 0", maxWidth: BAR_SLOT_MAX_WIDTH, minWidth: 0, display: "flex", flexDirection: "column-reverse", height: "100%", borderRadius: "4px 4px 0 0", overflow: "hidden" }} title={d.label}>
            {series.map(s => {
              const v = d[s.key] || 0;
              const h = (v / max) * plotH;
              return v > 0 ? <div key={s.key} style={{ height: Math.max(2, h), background: s.color, opacity: 0.9 }} /> : null;
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 6 }}>
        {data.map((d, i) => <div key={i} style={{ flex: "1 1 0", maxWidth: BAR_SLOT_MAX_WIDTH, minWidth: 0, textAlign: "center", fontSize: 10, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</div>)}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", marginTop: 10 }}>
        {series.map(s => <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textMuted }}><div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />{s.label}</div>)}
      </div>
    </div>
  );
}

// Simple (non-cumulative) smooth-ish line chart over labeled points
function SimpleLineChart({ data, height = 200, color = C.accent }) {
  if (data.length < 2) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 13 }}>Not enough data yet</div>;
  const vals = data.map(d => d.value);
  const min = Math.min(...vals, 0), max = Math.max(...vals, 1), range = max - min || 1;
  const W = 700, H = height - 24;
  const x = i => (i / (data.length - 1)) * W, y = v => H - ((v - min) / range) * H;
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} preserveAspectRatio="none">
        <path d={`${path} L${W},${H} L0,${H} Z`} fill={color + "22"} />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" />
        {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.value)} r="3.5" fill={color} />)}
      </svg>
      <div style={{ display: "flex", marginTop: 6 }}>
        {data.map((d, i) => <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 10, color: C.textDim }}>{d.label}</div>)}
      </div>
    </div>
  );
}

const monthKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthLabel = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" }); };

function AddFirmForm({ editing, onCancel, dispatch }) {
  const [form, setForm] = useState(editing || { name: "", accountSize: "", status: "Live", evaluation: "", fundedFee: "", subscription: "", platform: "", other: "", dateJoined: new Date().toISOString().slice(0, 10) });
  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  const save = () => {
    if (!form.name) return;
    const firm = { ...form, id: editing?.id || `pf${Date.now()}`, accountSize: parseFloat(form.accountSize) || 0, evaluation: parseFloat(form.evaluation) || 0, fundedFee: parseFloat(form.fundedFee) || 0, subscription: parseFloat(form.subscription) || 0, platform: parseFloat(form.platform) || 0, other: parseFloat(form.other) || 0 };
    dispatch({ type: editing ? "UPDATE_PROP_FIRM" : "ADD_PROP_FIRM", id: firm.id, data: firm, firm });
    onCancel();
  };
  return (
    <Card style={{ borderColor: C.accentHover }}>
      <h3 style={{ marginBottom: 14, fontSize: 16, fontWeight: 700 }}>{editing ? "Edit Prop Firm" : "New Prop Firm"}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Inp label="Firm Name" value={form.name} onChange={set("name")} placeholder="e.g. Apex Futures" />
        <Inp label="Account Size ($)" type="number" value={form.accountSize} onChange={set("accountSize")} placeholder="50000" />
        <Sel label="Status" value={form.status} onChange={set("status")} options={["Live", "Breached"]} />
        <Inp label="Evaluation Fee ($)" type="number" value={form.evaluation} onChange={set("evaluation")} placeholder="0.00" />
        <Inp label="Funded Account Fee ($)" type="number" value={form.fundedFee} onChange={set("fundedFee")} placeholder="0.00" />
        <Inp label="Subscription ($)" type="number" value={form.subscription} onChange={set("subscription")} placeholder="0.00" />
        <Inp label="Platform ($)" type="number" value={form.platform} onChange={set("platform")} placeholder="0.00" />
        <Inp label="Other ($)" type="number" value={form.other} onChange={set("other")} placeholder="0.00" />
        <Inp label="Date Joined" type="date" value={form.dateJoined} onChange={set("dateJoined")} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn small onClick={save}>{editing ? "Save Changes" : "Add Firm"}</Btn>
        <Btn small variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </Card>
  );
}

function AddPayoutForm({ editing, propFirms, onCancel, dispatch }) {
  const [form, setForm] = useState(editing || { firmId: propFirms[0]?.id || "", gross: "", splitPct: "80", date: new Date().toISOString().slice(0, 10), certificateUrl: "", notes: "" });
  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  const save = () => {
    if (!form.firmId || !form.gross) return;
    const payout = { ...form, id: editing?.id || `fp${Date.now()}`, gross: parseFloat(form.gross) || 0, splitPct: parseFloat(form.splitPct) || 100 };
    dispatch({ type: editing ? "UPDATE_PAYOUT" : "ADD_PAYOUT", id: payout.id, data: payout, payout });
    onCancel();
  };
  return (
    <Card style={{ borderColor: C.accentHover }}>
      <h3 style={{ marginBottom: 14, fontSize: 16, fontWeight: 700 }}>{editing ? "Edit Payout" : "New Payout"}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Sel label="Firm" value={form.firmId} onChange={set("firmId")} options={propFirms.map(f => ({ value: f.id, label: f.name }))} />
        <Inp label="Gross Amount ($)" type="number" value={form.gross} onChange={set("gross")} placeholder="0.00" />
        <Inp label="Split (%)" type="number" value={form.splitPct} onChange={set("splitPct")} placeholder="80" />
        <Inp label="Date" type="date" value={form.date} onChange={set("date")} />
        <Inp label="Certificate URL (optional)" value={form.certificateUrl} onChange={set("certificateUrl")} placeholder="https://…" />
        <Inp label="Notes" value={form.notes} onChange={set("notes")} placeholder="e.g. First funded payout!" />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn small onClick={save}>{editing ? "Save Changes" : "Add Payout"}</Btn>
        <Btn small variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </Card>
  );
}

function PnLTab({ state, dispatch }) {
  const propFirms = state.propFirms || [], payouts = state.payouts || [];
  const firms = buildFirmStats(propFirms, payouts);
  const totalRevenue = firms.reduce((s, f) => s + f.revenue, 0);
  const totalExpenses = firms.reduce((s, f) => s + f.expense, 0);
  const netProfit = totalRevenue - totalExpenses;
  const roi = totalExpenses ? (netProfit / totalExpenses) * 100 : 0;

  const byFirmData = firms.map(f => ({ label: f.name, revenue: f.revenue, expenses: f.expense }));

  // Monthly net P&L: expenses hit the month a firm was joined; payouts hit their own month
  const monthMap = {};
  propFirms.forEach(f => { const k = monthKey(f.dateJoined || new Date().toISOString()); monthMap[k] = (monthMap[k] || 0) - firmExpenseTotal(f); });
  payouts.forEach(p => { const f = propFirms.find(x => x.id === p.firmId); if (!f) return; const k = monthKey(p.date); const net = (parseFloat(p.gross) || 0) * ((parseFloat(p.splitPct) || 100) / 100); monthMap[k] = (monthMap[k] || 0) + net; });
  const monthlyData = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ label: monthLabel(k), value: v }));

  // Yearly P&L
  const yearMap = {};
  propFirms.forEach(f => { const y = new Date(f.dateJoined || Date.now()).getFullYear(); yearMap[y] = yearMap[y] || { revenue: 0, expenses: 0 }; yearMap[y].expenses += firmExpenseTotal(f); });
  payouts.forEach(p => { const y = new Date(p.date).getFullYear(); yearMap[y] = yearMap[y] || { revenue: 0, expenses: 0 }; yearMap[y].revenue += (parseFloat(p.gross) || 0) * ((parseFloat(p.splitPct) || 100) / 100); });
  const yearlyData = Object.entries(yearMap).sort((a, b) => a[0] - b[0]).map(([y, v]) => ({ label: y, revenue: v.revenue, expenses: v.expenses, netPnl: v.revenue - v.expenses }));

  const revenueSegments = firms.filter(f => f.revenue > 0).map(f => ({ label: f.name, value: f.revenue, color: firmColor(f.id, propFirms) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <StatCard label="Total Revenue" value={fmt$(totalRevenue)} color={C.accent} />
        <StatCard label="Total Expenses" value={`-$${totalExpenses.toFixed(2)}`} color={C.red} />
        <StatCard label="Net Profit" value={fmt$(netProfit)} color={netProfit >= 0 ? C.accent : C.red} />
        <StatCard label="ROI" value={`${roi.toFixed(1)}%`} color={C.blue} />
      </div>
      <Card>
        <SectionLabel>Profit &amp; Loss by Firm</SectionLabel>
        <GroupedBarChart data={byFirmData} series={[{ key: "revenue", label: "Revenue", color: C.accent }, { key: "expenses", label: "Expenses", color: C.red }]} />
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <Card>
          <SectionLabel>Monthly Net P&amp;L</SectionLabel>
          <GridBarChart data={monthlyData} height={260} />
        </Card>
        <Card>
          <SectionLabel>Revenue Distribution by Firm</SectionLabel>
          {revenueSegments.length ? <DonutChart segments={revenueSegments} size={170} thickness={26} /> : <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 13 }}>No revenue yet</div>}
        </Card>
      </div>
      <Card>
        <SectionLabel>P&amp;L by Year</SectionLabel>
        <GroupedBarChart data={yearlyData} series={[{ key: "revenue", label: "Revenue", color: C.accent }, { key: "expenses", label: "Expenses", color: C.red }, { key: "netPnl", label: "Net P&L", color: C.blue }]} />
      </Card>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", fontWeight: 700, fontSize: 15, borderBottom: `1px solid ${C.border}` }}>Per-Firm Summary</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Firm", "Revenue", "Expenses", "Net Profit", "ROI"].map((h, i) => <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "11px 20px", fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {firms.map(f => (
                <tr key={f.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                  <td style={{ padding: "11px 20px", fontWeight: 700 }}>{f.name}</td>
                  <td style={{ padding: "11px 20px", textAlign: "right", color: C.accent }} className="mono">{fmt$(f.revenue)}</td>
                  <td style={{ padding: "11px 20px", textAlign: "right", color: C.red }} className="mono">-${f.expense.toFixed(2)}</td>
                  <td style={{ padding: "11px 20px", textAlign: "right", color: f.netProfit >= 0 ? C.accent : C.red, fontWeight: 700 }} className="mono">{fmt$(f.netProfit)}</td>
                  <td style={{ padding: "11px 20px", textAlign: "right", color: f.roi >= 0 ? C.blue : C.red }} className="mono">{f.roi.toFixed(1)}%</td>
                </tr>
              ))}
              {firms.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: C.textDim }}>No prop firms added yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ExpensesTab({ state, dispatch }) {
  const propFirms = state.propFirms || [];
  const [adding, setAdding] = useState(false), [editing, setEditing] = useState(null);
  const totalExpenses = propFirms.reduce((s, f) => s + firmExpenseTotal(f), 0);

  const catSeries = [
    { key: "evaluation", label: "Evaluation", color: C.accent },
    { key: "fundedFee", label: "Funded Account Fee", color: C.accent2 },
    { key: "subscription", label: "Subscription", color: C.purple },
    { key: "platform", label: "Platform", color: C.blue },
    { key: "other", label: "Other", color: C.red },
  ];
  const stackedData = propFirms.map(f => ({ label: f.name, ...f }));
  const pieSegments = propFirms.filter(f => firmExpenseTotal(f) > 0).map(f => ({ label: f.name, value: firmExpenseTotal(f), color: firmColor(f.id, propFirms) }));

  const monthMap = {};
  propFirms.forEach(f => { const k = monthKey(f.dateJoined || new Date().toISOString()); monthMap[k] = (monthMap[k] || 0) + firmExpenseTotal(f); });
  const monthlyData = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ label: monthLabel(k), value: v }));

  const yearMap = {};
  propFirms.forEach(f => { const y = new Date(f.dateJoined || Date.now()).getFullYear(); yearMap[y] = (yearMap[y] || 0) + firmExpenseTotal(f); });
  const yearlyData = Object.entries(yearMap).sort((a, b) => a[0] - b[0]).map(([y, v]) => ({ label: y, value: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <StatCard label="Total Expenses Across All Firms" value={`-$${totalExpenses.toFixed(2)}`} color={C.red} style={{ flex: 1, minWidth: 260 }} />
        <Btn onClick={() => { setEditing(null); setAdding(a => !a); }}>+ Add Prop Firm</Btn>
      </div>
      {(adding || editing) && <AddFirmForm editing={editing} dispatch={dispatch} onCancel={() => { setAdding(false); setEditing(null); }} />}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Firm", "Account Size", "Active", "Evaluation", "Funded Account Fee", "Subscription", "Platform", "Other", "Total", "Actions"].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "11px 16px", fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {propFirms.map(f => {
                const breached = f.status === "Breached";
                const strike = breached ? { textDecoration: "line-through", opacity: 0.55 } : {};
                return (
                  <tr key={f.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                    <td style={{ padding: "12px 16px", fontWeight: 700, ...(breached ? { color: C.textMuted } : {}) }}>{f.name}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }} className="mono">${(f.accountSize || 0).toLocaleString()}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <span onClick={() => dispatch({ type: "UPDATE_PROP_FIRM", id: f.id, data: { status: breached ? "Live" : "Breached" } })} style={{ cursor: "pointer" }}>
                        <Badge color={breached ? C.red : C.accent}>{breached ? "Breached" : "● Live"}</Badge>
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", ...strike }} className="mono">${(f.evaluation || 0).toFixed(2)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", ...strike }} className="mono">${(f.fundedFee || 0).toFixed(2)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", ...strike }} className="mono">${(f.subscription || 0).toFixed(2)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", ...strike }} className="mono">${(f.platform || 0).toFixed(2)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", ...strike }} className="mono">${(f.other || 0).toFixed(2)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: breached ? C.red : C.accent }} className="mono">${firmExpenseTotal(f).toFixed(2)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button onClick={() => { setEditing(f); setAdding(false); }} style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: C.blueDim, color: C.blue, cursor: "pointer", fontSize: 11 }}>✏️</button>
                        <button onClick={() => dispatch({ type: "DELETE_PROP_FIRM", id: f.id })} style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: C.redDim, color: C.red, cursor: "pointer", fontSize: 11 }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {propFirms.length === 0 && <tr><td colSpan={10} style={{ padding: 24, textAlign: "center", color: C.textDim }}>No prop firms yet — click "+ Add Prop Firm" to get started.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 16 }}>
        <Card>
          <SectionLabel>Expense Distribution by Firm</SectionLabel>
          {pieSegments.length ? <DonutChart segments={pieSegments} size={180} thickness={28} /> : <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 13 }}>No expenses yet</div>}
        </Card>
        <Card>
          <SectionLabel>Expense Breakdown by Category</SectionLabel>
          <StackedBarChart data={stackedData} series={catSeries} />
        </Card>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <SectionLabel>Monthly Expenses</SectionLabel>
          <SimpleLineChart data={monthlyData} color={C.accent} />
        </Card>
        <Card>
          <SectionLabel>Expenses by Year</SectionLabel>
          <GridBarChart data={yearlyData} height={220} colorFn={() => C.accent} />
        </Card>
      </div>
    </div>
  );
}

function PayoutsTab({ state, dispatch }) {
  const propFirms = state.propFirms || [], payouts = state.payouts || [];
  const [adding, setAdding] = useState(false), [editing, setEditing] = useState(null);
  const totalGross = payouts.reduce((s, p) => s + (parseFloat(p.gross) || 0), 0);
  const totalNet = payouts.reduce((s, p) => s + (parseFloat(p.gross) || 0) * ((parseFloat(p.splitPct) || 100) / 100), 0);
  const firmName = id => propFirms.find(f => f.id === id)?.name || "—";
  const sorted = [...payouts].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, flex: 1, minWidth: 320 }}>
          <StatCard label="Total Gross Payouts" value={`$${totalGross.toFixed(2)}`} />
          <StatCard label="Total Net (You Received)" value={fmt$(totalNet)} color={C.accent} />
        </div>
        <Btn onClick={() => { setEditing(null); setAdding(a => !a); }}>+ Add Payout</Btn>
      </div>
      {(adding || editing) && <AddPayoutForm editing={editing} propFirms={propFirms} dispatch={dispatch} onCancel={() => { setAdding(false); setEditing(null); }} />}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Firm", "Gross", "Split", "Net (Received)", "Date", "Certificate", "Notes", "Actions"].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "11px 16px", fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const net = (parseFloat(p.gross) || 0) * ((parseFloat(p.splitPct) || 100) / 100);
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                    <td style={{ padding: "12px 16px", fontWeight: 700 }}>{firmName(p.firmId)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }} className="mono">${(parseFloat(p.gross) || 0).toFixed(2)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: C.purple }} className="mono">{p.splitPct || 100}%</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: C.accent, fontWeight: 700 }} className="mono">${net.toFixed(2)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtDate(p.date)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>{p.certificateUrl ? <a href={p.certificateUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.accent, fontSize: 12 }}>📄 View</a> : <span style={{ color: C.textDim }}>—</span>}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: C.textMuted, fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.notes || "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button onClick={() => { setEditing(p); setAdding(false); }} style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: C.blueDim, color: C.blue, cursor: "pointer", fontSize: 11 }}>✏️</button>
                        <button onClick={() => dispatch({ type: "DELETE_PAYOUT", id: p.id })} style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: C.redDim, color: C.red, cursor: "pointer", fontSize: 11 }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {payouts.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: C.textDim }}>No payouts logged yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function LostTab({ state }) {
  const propFirms = state.propFirms || [];
  const lost = propFirms.filter(f => f.status === "Breached");
  const totalLost = lost.reduce((s, f) => s + firmExpenseTotal(f), 0);
  const avgCost = lost.length ? totalLost / lost.length : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card style={{ background: C.redDim, borderColor: C.red + "44" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: C.red + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>⚠️</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Lost / Breached Accounts</div>
            <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>This section shows all prop firm accounts that have been <span style={{ color: C.red, fontWeight: 700 }}>breached or lost</span>. When an account is breached, the investment you made (evaluation fees, subscriptions, platform fees, etc.) is considered a sunk cost — you can no longer receive payouts from these accounts. Tracking lost accounts helps you understand the true cost of your prop firm journey and make better decisions about future evaluations.</div>
          </div>
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <StatCard label="Lost Accounts" value={lost.length} color={C.red} />
        <StatCard label="Total Capital Lost" value={`-$${totalLost.toFixed(2)}`} color={C.red} />
        <StatCard label="Avg Cost per Breach" value={`$${avgCost.toFixed(2)}`} color={C.yellow} />
      </div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 4px" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Breached Account Details</div>
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>All investments below are considered lost and unrecoverable</div>
        </div>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Firm", "Account Size", "Status", "Date Joined", "Evaluation", "Funded Acct Fee", "Subscription", "Platform", "Other", "Total Lost"].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "11px 16px", fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {lost.map(f => (
                <tr key={f.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                  <td style={{ padding: "12px 16px", fontWeight: 700 }}>{f.name}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }} className="mono">${(f.accountSize || 0).toLocaleString()}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}><Badge color={C.red}>Breached</Badge></td>
                  <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>{f.dateJoined ? fmtDate(f.dateJoined) : "—"}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: C.red }} className="mono">${(f.evaluation || 0).toFixed(2)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: C.red }} className="mono">${(f.fundedFee || 0).toFixed(2)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: C.red }} className="mono">${(f.subscription || 0).toFixed(2)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: C.red }} className="mono">${(f.platform || 0).toFixed(2)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: C.red }} className="mono">${(f.other || 0).toFixed(2)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: C.red }} className="mono">-${firmExpenseTotal(f).toFixed(2)}</td>
                </tr>
              ))}
              {lost.length === 0 && <tr><td colSpan={10} style={{ padding: 24, textAlign: "center", color: C.textDim }}>No breached accounts. 🎉</td></tr>}
            </tbody>
            {lost.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={9} style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, color: C.textMuted, fontWeight: 700 }}>Total Capital Lost:</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800, color: C.red }} className="mono">-${totalLost.toFixed(2)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.textDim, textAlign: "center" }}>
          💡 Tip: To mark an account as breached, go to the <b style={{ color: C.text }}>Expenses</b> tab and toggle the status from "Live" to "Breached" on the firm row.
        </div>
      </Card>
    </div>
  );
}

function Finances({ state, dispatch }) {
  const [tab, setTab] = useState("pnl");
  const TABS = [["pnl", "⚖ P&L"], ["expenses", "$ Expenses"], ["payouts", "⊙ Payouts"], ["lost", "⊘ Lost"]];
  return (
    <div className="fade-in" style={{ height: "100%", overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1, display: "flex", alignItems: "center", gap: 8, color: C.accent }}><span>♤</span> Prop Firms</h1>
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>Track expenses, payouts, and profit from your prop firms</div>
      </div>
      <div style={{ display: "flex", gap: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, width: "fit-content", flexWrap: "wrap" }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: "9px 18px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
            background: tab === id ? `linear-gradient(90deg, ${C.blue}, ${C.purple}, ${C.accent2})` : "transparent", color: tab === id ? "#001018" : C.textMuted }}>{label}</button>
        ))}
      </div>
      {tab === "pnl" && <PnLTab state={state} dispatch={dispatch} />}
      {tab === "expenses" && <ExpensesTab state={state} dispatch={dispatch} />}
      {tab === "payouts" && <PayoutsTab state={state} dispatch={dispatch} />}
      {tab === "lost" && <LostTab state={state} />}
    </div>
  );
}

// ─── LIVE CAPITAL ────────────────────────────────────────────────────────────
const TX_TYPES = ["Deposit", "Withdrawal", "Fee"];
const LC_FREQUENCIES = ["Monthly", "Weekly", "Biweekly"];
const LC_GROWTH_STYLES = ["Conservative", "Balanced", "Aggressive"];
const LC_ACCOUNT_PURPOSES = ["Growth Account", "Income Account", "Personal Capital", "Evaluation-to-Live Transition", "Retirement Growth", "Custom"];
const ordinal = (n) => { n = parseInt(n) || 1; const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const moneyFmt = (n) => `${n < 0 ? "-" : ""}$${Math.abs(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const eventMarkerColor = (type) => type === "Withdrawal" ? C.red : type === "Fee" ? C.accent2 : type === "Starting Balance" ? C.purple : C.accent;
const fmtShortDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function LiveCapitalCurve({ points, startingCapital, height = 280 }) {
  const [hover, setHover] = useState(null);
  const byDate = {};
  points.forEach(p => { byDate[p.date] = p; });
  const dates = Object.keys(byDate).sort();
  if (dates.length < 2) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontSize: 13 }}>Log capital transactions and trades to see your curve</div>;
  const vals = dates.map(d => byDate[d].value);
  const orgVals = dates.map(d => byDate[d].organicValue);
  const max = Math.max(...vals, ...orgVals, startingCapital, 0);
  const min = Math.min(...vals, ...orgVals, startingCapital, 0);
  const range = max - min || 1;
  const padTop = 16, padBottom = 26, padLeft = 50;
  const W = 900;
  const plotH = height - padTop - padBottom;
  const plotW = W - padLeft;
  const x = i => padLeft + (dates.length > 1 ? (i / (dates.length - 1)) * plotW : plotW / 2);
  const y = v => padTop + (1 - (v - min) / range) * plotH;
  const path = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const orgPath = orgVals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const baseY = y(startingCapital).toFixed(1);

  const ySteps = 4;
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => min + (range / ySteps) * i).reverse();
  const xTickEvery = Math.max(1, Math.ceil(dates.length / 8));
  const markerIdxs = dates.map((d, i) => ({ d, i })).filter(({ d, i }) => byDate[d].type !== "Trade" || i === dates.length - 1);
  const strip = Math.max(2, plotW / dates.length);
  const hoverInfo = hover != null ? { d: dates[hover], p: byDate[dates[hover]] } : null;
  const leftPct = hover != null ? (x(hover) / W) * 100 : 0;
  const flip = leftPct > 58;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        <defs><linearGradient id="lcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity="0.28" /><stop offset="100%" stopColor={C.accent} stopOpacity="0" /></linearGradient></defs>
        {yLabels.map((v, i) => {
          const yy = padTop + (i / ySteps) * plotH;
          return (
            <g key={i}>
              <text x={padLeft - 8} y={yy + 4} fill={C.textDim} fontSize="11" textAnchor="end" fontFamily="'Inter',sans-serif">${Math.round(v / 1000)}k</text>
              <line x1={padLeft} x2={W} y1={yy} y2={yy} stroke={C.border} strokeDasharray="4,4" />
            </g>
          );
        })}
        <path d={`${path} L${x(vals.length - 1)},${padTop + plotH} L${padLeft},${padTop + plotH} Z`} fill="url(#lcg)" />
        <line x1={padLeft} y1={baseY} x2={W} y2={baseY} stroke={C.purple} strokeWidth="1.5" strokeDasharray="6,5" />
        <path d={orgPath} fill="none" stroke={C.blue} strokeWidth="2" strokeDasharray="5,4" />
        <path d={path} fill="none" stroke={C.accent} strokeWidth="2.5" />
        {markerIdxs.map(({ d, i }) => {
          const isLast = i === dates.length - 1;
          const isHovered = hover === i;
          return <circle key={d} cx={x(i)} cy={y(byDate[d].value)} r={isHovered ? 6.5 : isLast ? 5.5 : 4.5}
            fill={isHovered ? "#fff" : eventMarkerColor(byDate[d].type)}
            stroke={isHovered ? C.surface : "none"} strokeWidth={isHovered ? 3 : 0} />;
        })}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padTop} y2={padTop + plotH} stroke={C.textDim} strokeDasharray="3,3" strokeWidth="1" />}
        {dates.map((d, i) => (
          <rect key={d} x={x(i) - strip / 2} y={padTop} width={strip} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {dates.map((d, i) => (i % xTickEvery === 0 || i === dates.length - 1) && (
        <div key={d} style={{ position: "absolute", left: `${(x(i) / W) * 100}%`, bottom: 0, transform: i === 0 ? "translateX(0)" : i === dates.length - 1 ? "translateX(-100%)" : "translateX(-50%)", fontSize: 10, color: C.textDim, whiteSpace: "nowrap" }}>{fmtShortDate(d)}</div>
      ))}
      {hoverInfo && (
        <div style={{
          position: "absolute", top: 8, [flip ? "right" : "left"]: `${flip ? 100 - leftPct : leftPct}%`,
          transform: `translateX(${flip ? "-10px" : "10px"})`, marginLeft: flip ? 0 : 0,
          background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 18px",
          minWidth: 230, boxShadow: "0 10px 30px #000a", pointerEvents: "none", zIndex: 6,
        }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Net Account Value: <span className="mono">{moneyFmt(hoverInfo.p.value)}</span></div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginTop: 4 }}>Organic Growth Curve: <span className="mono">{moneyFmt(hoverInfo.p.organicValue)}</span></div>
          {hoverInfo.p.type && hoverInfo.p.type !== "Trade" && (
            <>
              <div style={{ height: 1, background: C.border, margin: "10px 0" }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: eventMarkerColor(hoverInfo.p.type) }}>{hoverInfo.p.type} — {moneyFmt(hoverInfo.p.amount)}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>{hoverInfo.p.account || "Live Account"}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{fmtDate(hoverInfo.d)}</div>
              {hoverInfo.p.note && <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{hoverInfo.p.note}</div>}
            </>
          )}
          {hoverInfo.p.type === "Trade" && <div style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>{fmtDate(hoverInfo.d)} · Trading activity</div>}
        </div>
      )}
    </div>
  );
}

function LiveCapitalOverview({ state, dispatch, setPage }) {
  const s = calcLiveCapitalStats(state);
  const monthly = buildLiveCapitalMonthly(state);
  const paceMonths = monthly.slice(-3);
  const monthlyPace = paceMonths.length ? paceMonths.reduce((a, m) => a + m.netGrowth, 0) / paceMonths.length : 0;
  const estMonths = monthlyPace > 0 && s.profitTargetRemaining > 0 ? Math.ceil(s.profitTargetRemaining / monthlyPace) : null;
  const pendingCount = (state.capitalTransactions || []).filter(t => t.status === "pending").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        <StatCard label="Current Live Capital" value={moneyFmt(s.currentLiveCapital)} color={C.accent} style={{ minWidth: 0 }} />
        <StatCard label="Net Account Change" value={fmt$(s.netAccountChange)} color={s.netAccountChange >= 0 ? C.accent : C.red} sub={`${s.netAccountChangePct.toFixed(1)}%`} style={{ minWidth: 0 }} />
        <StatCard label="Realized Trading Profit" value={fmt$(s.realizedTradingProfit)} color={s.realizedTradingProfit >= 0 ? C.accent : C.red} sub={`${s.realizedPct.toFixed(1)}% · Pure trading performance`} style={{ minWidth: 0 }} />
        <StatCard label="Current Drawdown" value={`${s.currentDrawdownPct.toFixed(1)}%`} color={s.currentDrawdownPct > 0 ? C.red : C.text} sub={moneyFmt(-s.currentDrawdownDollar)} style={{ minWidth: 0 }} />
        <StatCard label="Available Risk Buffer" value={moneyFmt(s.availableRiskBuffer)} color={C.blue} style={{ minWidth: 0 }} />
      </div>

      <Card>
        <SectionLabel>Profit Target Progress</SectionLabel>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 10 }}>{moneyFmt(s.currentLiveCapital)} / {moneyFmt(s.profitGoal)} target reached — {s.profitTargetPct.toFixed(0)}% complete</div>
        <div style={{ height: 10, borderRadius: 6, background: C.border, overflow: "hidden" }}>
          <div style={{ width: `${s.profitTargetPct}%`, height: "100%", background: `linear-gradient(90deg, ${C.blue}, ${C.purple}, ${C.accent2})`, transition: "width 0.3s" }} />
        </div>
        <div style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>Remaining: {moneyFmt(s.profitTargetRemaining)}</div>
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Live Capital Curve</div>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>Net account value vs. starting capital baseline.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge color={C.accent}>Net Account Value</Badge>
            <Badge color={C.blue}>Organic Growth</Badge>
            <Badge color={C.purple}>Baseline</Badge>
          </div>
        </div>
        <LiveCapitalCurve points={s.curvePoints} startingCapital={s.startingCapital} />
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span>✨</span><span style={{ fontSize: 10, color: C.textDim, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>Capital Growth Intelligence</span></div>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Compounding Projection</div>
            <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>{monthlyPace > 0 && estMonths != null ? `At your current pace, your account may reach ${moneyFmt(s.profitGoal)} in approximately ${estMonths} month${estMonths !== 1 ? "s" : ""}.` : "Log more months of trades and contributions to estimate your timeline."}</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[["Monthly Pace", fmt$(monthlyPace)], ["Target", moneyFmt(s.profitGoal)], ["Est. Timeline", estMonths != null ? `${estMonths} mo` : "—"]].map(([l, v]) => (
              <div key={l} style={{ background: C.bg, borderRadius: 10, padding: "10px 16px", minWidth: 120 }}>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>{l}</div>
                <div className="mono" style={{ fontWeight: 800, fontSize: 16 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 4px" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Monthly Capital Breakdown</div>
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>See whether growth is coming from trading skill, contributions, or withdrawals.</div>
        </div>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
            <thead><tr>{["Month", "Trading Net P&L", "Contributions", "Withdrawals", "Net Growth", "Ending Balance"].map((h, i) => <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "10px 20px", fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {monthly.map(m => (
                <tr key={m.key} style={{ borderBottom: `1px solid ${C.border}20` }}>
                  <td style={{ padding: "11px 20px", fontWeight: 700 }}>{m.label}</td>
                  <td style={{ padding: "11px 20px", textAlign: "right", color: m.tradingPnl >= 0 ? C.accent : C.red }} className="mono">{fmt$(m.tradingPnl)}</td>
                  <td style={{ padding: "11px 20px", textAlign: "right", color: m.contributions ? C.accent : C.textMuted }} className="mono">{moneyFmt(m.contributions)}</td>
                  <td style={{ padding: "11px 20px", textAlign: "right", color: m.withdrawals ? C.red : C.textMuted }} className="mono">{m.withdrawals ? "-" + moneyFmt(m.withdrawals) : "$0.00"}</td>
                  <td style={{ padding: "11px 20px", textAlign: "right", fontWeight: 700, color: m.netGrowth >= 0 ? C.accent : C.red }} className="mono">{fmt$(m.netGrowth)}</td>
                  <td style={{ padding: "11px 20px", textAlign: "right" }} className="mono">{moneyFmt(m.endingBalance)}</td>
                </tr>
              ))}
              {monthly.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: C.textDim }}>No capital history yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14, gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Drawdown Protection</div>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>Risk guardrails and capital preservation metrics.</div>
          </div>
          <Badge color={s.capitalVolatility === "High" ? C.red : s.capitalVolatility === "Medium" ? C.yellow : C.accent}>{s.currentDrawdownPct > 0 ? "At Risk" : "Stable"}</Badge>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
          {[
            ["Current Drawdown", `${s.currentDrawdownPct.toFixed(1)}%`],
            ["Max Drawdown Reached", moneyFmt(s.maxDD)],
            ["Daily Loss Used", `${s.dailyLossUsedPct.toFixed(1)}%`],
            ["Weekly Loss Used", `${s.weeklyLossUsedPct.toFixed(1)}%`],
            ["Recovery Required", `${s.recoveryRequiredPct.toFixed(1)}%`],
            ["Available Risk Buffer", moneyFmt(s.availableRiskBuffer)],
          ].map(([label, val]) => (
            <div key={label} style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 800 }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ background: C.bg, borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Capital Volatility</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: s.capitalVolatility === "High" ? C.red : s.capitalVolatility === "Medium" ? C.yellow : C.accent }}>{s.capitalVolatility}</div>
        </div>
        <div style={{ fontSize: 12, color: s.currentDrawdownPct > 0 ? C.yellow : C.accent, display: "flex", alignItems: "center", gap: 6 }}>
          {s.currentDrawdownPct > 0 ? "⚠ Monitor drawdown closely — you're below your recent equity peak." : "🛡 No capital protection warnings right now."}
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 4 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Linked Account Trading Summary</div>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>Performance metrics from trades connected to this live capital account.</div>
          </div>
          <div style={{ minWidth: 200 }}>
            <Sel label="Trades counted" value={s.linkedAccount} onChange={v => dispatch({ type: "SET_LIVE_CAPITAL", data: { linkedAccount: v } })}
              options={[{ value: "all", label: "All Accounts" }, ...state.accounts.map(a => ({ value: a.id, label: a.name }))]} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginTop: 14 }}>
          <div><div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Total Linked Trades</div><div className="mono" style={{ fontSize: 20, fontWeight: 800 }}>{s.linkedTrades.length}</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{s.linkedAccount === "all" ? "All accounts" : (state.accounts.find(a => a.id === s.linkedAccount)?.name || "Selected account")}</div></div>
          <div><div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Win Rate</div><div className="mono" style={{ fontSize: 20, fontWeight: 800, color: C.accent }}>{s.tradeStats.winRate.toFixed(1)}%</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{s.tradeStats.winRate >= 60 ? "Strong consistency" : "Room to improve"}</div></div>
          <div><div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Realized Trading Profit</div><div className="mono" style={{ fontSize: 20, fontWeight: 800, color: s.realizedTradingProfit >= 0 ? C.accent : C.red }}>{fmt$(s.realizedTradingProfit)}</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>Excludes deposits/withdrawals</div></div>
          <div><div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Profit Factor</div><div className="mono" style={{ fontSize: 20, fontWeight: 800 }}>{s.tradeStats.profitFactor >= 99 ? "∞" : s.tradeStats.profitFactor.toFixed(2)}</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>Gross wins ÷ gross losses</div></div>
          <div><div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Best Trade</div><div className="mono" style={{ fontSize: 16, fontWeight: 800, color: C.accent }}>{s.bestTrade ? `${s.bestTrade.symbol} ${fmt$(s.bestTrade.pnl)}` : "—"}</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>Highest winner</div></div>
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Trades Counted Toward This Balance</div>
          {s.linkedTrades.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: C.textDim, fontSize: 13 }}>
              No trades logged for {s.linkedAccount === "all" ? "any account" : (state.accounts.find(a => a.id === s.linkedAccount)?.name || "this account")} yet.<br />
              Log a trade or import your history and it'll appear here automatically.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead><tr>{["Date", "Symbol", "Direction", "Outcome", "P&L"].map((h, i) => <th key={h} style={{ textAlign: i === 4 ? "right" : "left", padding: "8px 12px", fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {s.linkedTrades.slice(0, 8).map(t => (
                    <tr key={t.id} onClick={() => setPage && setPage("journal")} style={{ borderBottom: `1px solid ${C.border}20`, cursor: setPage ? "pointer" : "default" }}>
                      <td style={{ padding: "9px 12px", fontSize: 13, whiteSpace: "nowrap" }}>{fmtDate(t.date)}</td>
                      <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 700 }}>{t.symbol}</td>
                      <td style={{ padding: "9px 12px" }}><Badge color={t.direction === "Long" ? C.accent : C.red}>{t.direction}</Badge></td>
                      <td style={{ padding: "9px 12px" }}><Badge color={outcomeColor(t.outcome, t.pnl)}>{t.outcome}</Badge></td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: outcomeColor(t.outcome, t.pnl) }} className="mono">{fmt$(t.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {s.linkedTrades.length > 8 && <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>+{s.linkedTrades.length - 8} more trade{s.linkedTrades.length - 8 !== 1 ? "s" : ""} counted toward this balance.</div>}
            </div>
          )}
        </div>
        {setPage && <Btn small variant="ghost" style={{ marginTop: 16 }} onClick={() => setPage("journal")}>View trades →</Btn>}
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span>⬡</span><span style={{ fontWeight: 700, fontSize: 15 }}>Capital Growth Intelligence</span></div>
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16 }}>A simple read on whether growth is coming from trading skill or outside capital.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <div style={{ background: C.bg, borderRadius: 10, padding: 16 }}><div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Organic Trading Growth</div><div className="mono" style={{ fontSize: 22, fontWeight: 800, color: s.organicTradingGrowth >= 0 ? C.accent : C.red }}>{fmt$(s.organicTradingGrowth)}</div></div>
          <div style={{ background: C.bg, borderRadius: 10, padding: 16 }}><div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Contribution-Assisted Growth</div><div className="mono" style={{ fontSize: 22, fontWeight: 800, color: C.accent }}>{fmt$(s.contributionAssistedGrowth)}</div></div>
          <div style={{ background: C.bg, borderRadius: 10, padding: 16 }}><div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Net Contributions</div><div className="mono" style={{ fontSize: 22, fontWeight: 800 }}>{fmt$(s.netContributions)}</div></div>
        </div>
      </Card>
    </div>
  );
}

function LiveCapitalSetup({ state, dispatch }) {
  const lc = state.liveCapital;
  const [starting, setStarting] = useState(lc.startingCapital);
  const [goal, setGoal] = useState(lc.profitGoal);
  const [saved, setSaved] = useState(false);
  const [advOpen, setAdvOpen] = useState(true);
  const [contrib, setContrib] = useState(lc.contribution);
  const [withdraw, setWithdraw] = useState(lc.withdrawal);
  const [risk, setRisk] = useState({ dailyLossLimit: lc.dailyLossLimit, weeklyLossLimit: lc.weeklyLossLimit, maxDrawdownLimit: lc.maxDrawdownLimit, softWarningThreshold: lc.softWarningThreshold, growthStyle: lc.growthStyle, accountPurpose: lc.accountPurpose });

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800); };
  const saveTargets = () => { dispatch({ type: "SET_LIVE_CAPITAL", data: { startingCapital: parseFloat(starting) || 0, profitGoal: parseFloat(goal) || 0 } }); flash(); };
  const saveContrib = (next) => { setContrib(next); dispatch({ type: "SET_LIVE_CAPITAL", data: { contribution: next } }); };
  const saveWithdraw = (next) => { setWithdraw(next); dispatch({ type: "SET_LIVE_CAPITAL", data: { withdrawal: next } }); };
  const saveRisk = (next) => { setRisk(next); dispatch({ type: "SET_LIVE_CAPITAL", data: next }); };
  const dayOptions = Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `${ordinal(i + 1)} day of month` }));

  const AutoToggle = ({ on, onClick, label, hint }) => (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, background: on ? C.accentDim : C.bg, border: `1px solid ${on ? C.accent + "44" : C.border}`, borderRadius: 10, padding: 14, cursor: "pointer", marginBottom: 14 }}>
      <div style={{ width: 38, height: 22, borderRadius: 12, background: on ? C.accent : C.border, position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: on ? 19 : 3, transition: "left 0.15s" }} />
      </div>
      <div><div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>{label} {on && <Badge color={C.accent}>ON</Badge>}</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{hint}</div></div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>⚏ Capital Rules &amp; Targets</div>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>Configure the core capital baseline and optional risk guardrails.</div>
          </div>
          {saved && <Badge color={C.accent}>Saved</Badge>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>💲 Starting Capital <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· Core capital target</span></div>
            <input type="number" value={starting} onChange={e => setStarting(e.target.value)} onBlur={saveTargets} style={{ width: "100%", background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "10px 14px", fontSize: 14, outline: "none" }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>◎ Profit Goal <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· Core capital target</span></div>
            <input type="number" value={goal} onChange={e => setGoal(e.target.value)} onBlur={saveTargets} style={{ width: "100%", background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "10px 14px", fontSize: 14, outline: "none" }} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <div style={{ fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📈 Trades Counted Toward This Balance <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· Which trading account's P&amp;L feeds Live Capital</span></div>
            <select value={lc.linkedAccount || "all"} onChange={e => dispatch({ type: "SET_LIVE_CAPITAL", data: { linkedAccount: e.target.value } })} style={{ width: "100%", background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, padding: "10px 14px", fontSize: 14, outline: "none", cursor: "pointer" }}>
              <option value="all">All Accounts</option>
              {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>Trades are added automatically the moment you log or import them under the selected account — there's nothing extra to do on this page.</div>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>📅 Monthly Contribution Automation</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Inp label="Monthly Contribution" type="number" value={contrib.amount} onChange={v => saveContrib({ ...contrib, amount: parseFloat(v) || 0 })} />
          <Sel label="Frequency" value={contrib.frequency} onChange={v => saveContrib({ ...contrib, frequency: v })} options={LC_FREQUENCIES} />
          <Sel label="Day of month" value={contrib.day} onChange={v => saveContrib({ ...contrib, day: parseInt(v) })} options={dayOptions} />
          <Inp label="Start date" type="date" value={contrib.startDate} onChange={v => saveContrib({ ...contrib, startDate: v })} />
        </div>
        <AutoToggle on={contrib.autoAdd} onClick={() => saveContrib({ ...contrib, autoAdd: !contrib.autoAdd })} label="Automatically add this contribution" hint="When enabled, ACEZELLA will create and manage the deposit plan from these settings." />
        <div style={{ background: C.bg, borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}><Badge color={C.accent}>Deposit</Badge><Badge color={C.blue}>Auto-add</Badge></div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Deposit plan</div>
          <div style={{ fontSize: 13, color: C.textMuted }}>{moneyFmt(parseFloat(contrib.amount) || 0)} · {contrib.frequency} · {ordinal(contrib.day)} day of month</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>Live Account · Starts {contrib.startDate}</div>
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>📅 Monthly Withdrawal Automation</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          <Inp label="Monthly Withdrawal" type="number" value={withdraw.amount} onChange={v => saveWithdraw({ ...withdraw, amount: parseFloat(v) || 0 })} />
          <Sel label="Frequency" value={withdraw.frequency} onChange={v => saveWithdraw({ ...withdraw, frequency: v })} options={LC_FREQUENCIES} />
          <Sel label="Day of month" value={withdraw.day} onChange={v => saveWithdraw({ ...withdraw, day: parseInt(v) })} options={dayOptions} />
          <Inp label="Start date" type="date" value={withdraw.startDate} onChange={v => saveWithdraw({ ...withdraw, startDate: v })} />
        </div>
        <AutoToggle on={withdraw.autoAdd} onClick={() => saveWithdraw({ ...withdraw, autoAdd: !withdraw.autoAdd })} label="Automatically add this withdrawal" hint="When enabled, ACEZELLA will create and manage the withdrawal plan from these settings." />
        <div style={{ background: C.bg, borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}><Badge color={C.purple}>Withdrawal</Badge><Badge color={C.blue}>Auto-add</Badge></div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Withdrawal plan</div>
          <div style={{ fontSize: 13, color: C.textMuted }}>{moneyFmt(parseFloat(withdraw.amount) || 0)} · {withdraw.frequency} · {ordinal(withdraw.day)} day of month</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>Live Account · Starts {withdraw.startDate}</div>
        </div>
      </Card>

      <Card>
        <div onClick={() => setAdvOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <span>🛡</span>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 15 }}>Advanced Risk Settings (Optional)</div><div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>Loss limits, growth style, account purpose, and withdrawal goals.</div></div>
          <span style={{ color: C.textMuted, fontSize: 13 }}>{advOpen ? "▴" : "▾"}</span>
        </div>
        {advOpen && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 18 }}>
            <Inp label="Daily Loss Limit" type="number" value={risk.dailyLossLimit} onChange={v => saveRisk({ ...risk, dailyLossLimit: parseFloat(v) || 0 })} />
            <Inp label="Weekly Loss Limit" type="number" value={risk.weeklyLossLimit} onChange={v => saveRisk({ ...risk, weeklyLossLimit: parseFloat(v) || 0 })} />
            <Inp label="Max Drawdown Limit" type="number" value={risk.maxDrawdownLimit} onChange={v => saveRisk({ ...risk, maxDrawdownLimit: parseFloat(v) || 0 })} />
            <Inp label="Soft Warning Threshold %" type="number" value={risk.softWarningThreshold} onChange={v => saveRisk({ ...risk, softWarningThreshold: parseFloat(v) || 0 })} />
            <Sel label="Capital Growth Style" value={risk.growthStyle} onChange={v => saveRisk({ ...risk, growthStyle: v })} options={LC_GROWTH_STYLES} />
            <Sel label="Account Purpose" value={risk.accountPurpose} onChange={v => saveRisk({ ...risk, accountPurpose: v })} options={LC_ACCOUNT_PURPOSES} />
          </div>
        )}
      </Card>
    </div>
  );
}

function LiveCapitalTransactions({ state, dispatch }) {
  const [account, setAccount] = useState("Live Account");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState("Deposit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const accountOptions = ["Live Account", ...state.accounts.map(a => a.name)];

  const addTx = () => {
    if (!amount) return;
    dispatch({ type: "ADD_CAPITAL_TX", tx: { id: `ct${Date.now()}`, date, type, amount: parseFloat(amount) || 0, account, note, status: "completed" } });
    setAmount(""); setNote("");
  };

  const sorted = [...(state.capitalTransactions || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Capital Transactions</div>
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 16 }}>Deposits, withdrawals, fees, transfers, and balance corrections.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, alignItems: "end" }}>
          <Sel label="Account" value={account} onChange={setAccount} options={accountOptions} />
          <Inp label="Date" type="date" value={date} onChange={setDate} />
          <Sel label="Type" value={type} onChange={setType} options={TX_TYPES} />
          <Inp label="Amount" type="number" value={amount} onChange={setAmount} placeholder="0.00" />
          <Inp label="Note" value={note} onChange={setNote} placeholder="Optional note" />
          <Btn onClick={addTx} style={{ justifyContent: "center", minWidth: 0 }}>+ Add</Btn>
        </div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>Deposits add new external capital; withdrawals and fees reduce your live balance.</div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 4px" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Transaction History</div>
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>View and manage recent capital transactions.</div>
        </div>
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
            <thead><tr>{["Date", "Type", "Amount", "Account", "Note", "Actions"].map((h, i) => <th key={h} style={{ textAlign: i === 2 ? "right" : "left", padding: "10px 20px", fontSize: 11, color: C.textDim, fontWeight: 700, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {sorted.map(t => {
                const isPending = t.status === "pending";
                const isNeg = t.type === "Withdrawal" || t.type === "Fee";
                return (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}20` }}>
                    <td style={{ padding: "12px 20px", whiteSpace: "nowrap" }}>{t.date}</td>
                    <td style={{ padding: "12px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span>{t.type}</span>
                        {isPending && <Badge color={C.yellow}>SCHEDULED (PENDING)</Badge>}
                        {!isPending && t.type === "Withdrawal" && <Badge color={C.textMuted}>WITHDRAWN</Badge>}
                        {!isPending && t.type === "Deposit" && !t.isStartingBalance && <Badge color={C.accent}>DEPOSITED</Badge>}
                      </div>
                    </td>
                    <td style={{ padding: "12px 20px", textAlign: "right", color: isNeg ? C.red : C.accent, fontWeight: 700 }} className="mono">{isNeg ? "-" : ""}{moneyFmt(parseFloat(t.amount) || 0)}</td>
                    <td style={{ padding: "12px 20px" }}>{t.account}</td>
                    <td style={{ padding: "12px 20px", color: C.textMuted, fontSize: 12, maxWidth: 280 }}>{t.note || "—"}</td>
                    <td style={{ padding: "12px 20px" }}>
                      {isPending ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                          <Btn small variant="success" onClick={() => dispatch({ type: "UPDATE_CAPITAL_TX", id: t.id, data: { status: "completed" } })}>✓ Mark Complete</Btn>
                          <Btn small variant="ghost" onClick={() => dispatch({ type: "DELETE_CAPITAL_TX", id: t.id })}>⊗ Cancel</Btn>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => dispatch({ type: "DELETE_CAPITAL_TX", id: t.id })} style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: C.redDim, color: C.red, cursor: "pointer", fontSize: 12 }}>🗑️</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: C.textDim }}>No transactions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── CAPITAL ALERTS (proactive discipline / pacing / risk reminders) ────────
function buildCapitalAlerts(state) {
  const s = calcLiveCapitalStats(state);
  const monthly = buildLiveCapitalMonthly(state);
  const paceMonths = monthly.slice(-3);
  const monthlyPace = paceMonths.length ? paceMonths.reduce((a, m) => a + m.netGrowth, 0) / paceMonths.length : 0;
  const estMonths = monthlyPace > 0 && s.profitTargetRemaining > 0 ? Math.ceil(s.profitTargetRemaining / monthlyPace) : null;
  const softPct = state.liveCapital?.softWarningThreshold || 80;
  const riskUsedPct = Math.max(s.dailyLossUsedPct, s.weeklyLossUsedPct, s.currentDrawdownPct);
  const riskHealthy = riskUsedPct < softPct;
  const paceHealthy = estMonths != null && estMonths <= 18;

  const alerts = [
    {
      id: "risk",
      tone: riskHealthy ? "good" : "bad",
      title: "Risk Status",
      message: riskHealthy ? "Risk levels currently healthy." : `Risk usage at ${riskUsedPct.toFixed(0)}% of your soft warning threshold — size down.`,
    },
    {
      id: "pace",
      tone: paceHealthy ? "good" : "bad",
      title: "Goal Pace Warning",
      message: paceHealthy ? `On pace to hit your target in ~${estMonths} month${estMonths !== 1 ? "s" : ""}.` : "At current pace, your target may be delayed.",
    },
  ];
  if (s.currentDrawdownPct > 0 && s.availableRiskBuffer < (state.liveCapital?.maxDrawdownLimit || 0) * 0.25) {
    alerts.push({ id: "buffer", tone: "bad", title: "Risk Buffer Low", message: "Available risk buffer is running low relative to your max drawdown limit." });
  }
  return alerts;
}

function CapitalAlertsPanel({ state, onClose, dismissed, onDismiss, onSnooze }) {
  const alerts = buildCapitalAlerts(state).filter(a => !dismissed[a.id] || dismissed[a.id] < Date.now());
  return (
    <div className="fade-in" style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, width: 340, maxWidth: "90vw", zIndex: 60, background: C.modalBg, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, boxShadow: "0 20px 50px #000c" }}>
      <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Capital Alerts</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, lineHeight: 1.5 }}>Proactive capital discipline, pacing, and risk reminders.</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 18, cursor: "pointer" }}>×</button>
      </div>
      {alerts.length === 0 && <div style={{ fontSize: 13, color: C.textDim, padding: "10px 0" }}>No active alerts. 🎉</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {alerts.map(a => {
          const good = a.tone === "good";
          const color = good ? C.accent : C.accent2;
          return (
            <div key={a.id} style={{ background: good ? `${C.accent}12` : `${C.accent2}12`, border: `1px solid ${color}45`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 15, color, marginTop: 1 }}>{good ? "🕐" : "⚠"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{a.title}</div>
                  <div style={{ fontSize: 12.5, color, marginTop: 4, lineHeight: 1.5 }}>{a.message}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, marginLeft: 25 }}>
                <button onClick={() => onSnooze(a.id)} style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: "pointer" }}>Snooze 3 days</button>
                <button onClick={() => onDismiss(a.id)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Dismiss</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LiveCapital({ state, dispatch, setPage }) {
  const [tab, setTab] = useState("overview");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [dismissed, setDismissed] = useState({});
  const pendingCount = (state.capitalTransactions || []).filter(t => t.status === "pending").length;
  const activeAlertCount = buildCapitalAlerts(state).filter(a => !dismissed[a.id] || dismissed[a.id] < Date.now()).length;
  const dismissAlert = (id) => setDismissed(d => ({ ...d, [id]: Infinity }));
  const snoozeAlert = (id) => setDismissed(d => ({ ...d, [id]: Date.now() + 3 * 24 * 60 * 60 * 1000 }));
  const TABS = [["overview", "Overview"], ["setup", "Setup & Automation"], ["transactions", "Transactions"]];
  return (
    <div className="fade-in" style={{ height: "100%", overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1, display: "flex", alignItems: "center", gap: 8, color: C.accent }}><span>♤</span> Live Capital</h1>
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>Track live capital, drawdown, risk buffer, and account growth.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
          <Badge color={C.blue}>Live Account</Badge>
          {pendingCount > 0 && <Badge color={C.purple}>{pendingCount} Pending</Badge>}
          <button onClick={() => setAlertsOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 7, background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 12, fontWeight: 700, padding: "8px 14px", cursor: "pointer" }}>
            🔔 {activeAlertCount} Alert{activeAlertCount !== 1 ? "s" : ""}
          </button>
          {alertsOpen && <CapitalAlertsPanel state={state} onClose={() => setAlertsOpen(false)} dismissed={dismissed} onDismiss={dismissAlert} onSnooze={snoozeAlert} />}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, width: "fit-content", flexWrap: "wrap" }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: "9px 18px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: tab === id ? `linear-gradient(90deg, ${C.blue}, ${C.purple}, ${C.accent2})` : "transparent", color: tab === id ? "#001018" : C.textMuted }}>{label}</button>
        ))}
      </div>

      {tab === "overview" && <LiveCapitalOverview state={state} dispatch={dispatch} setPage={setPage} />}
      {tab === "setup" && <LiveCapitalSetup state={state} dispatch={dispatch} />}
      {tab === "transactions" && <LiveCapitalTransactions state={state} dispatch={dispatch} />}
    </div>
  );
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function Settings({ state, dispatch }) {
  const { accounts, sessions, emotions } = state;
  const [newAccName, setNewAccName] = useState(""), [newAccType, setNewAccType] = useState("Funded"), [newAccColor, setNewAccColor] = useState(ACCOUNT_COLORS[0]);
  const [newSession, setNewSession] = useState(""), [newEmotion, setNewEmotion] = useState("");
  const [siteNameInput, setSiteNameInput] = useState(state.siteName || "ACEZELLA");
  const [confirmAction, setConfirmAction] = useState(null); // { message, onConfirm }
  const [toast, setToast] = useState("");
  const fileRef = useRef();
  const watermarkRef = useRef();
  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const addAccount = () => {
    if (!newAccName) return;
    if (!canAddAccount(state)) { dispatch({ type: "OPEN_MODAL", modal: "upgrade" }); return; }
    dispatch({ type: "ADD_ACCOUNT", account: { id: `acc${Date.now()}`, name: newAccName, type: newAccType, color: newAccColor } });
    setNewAccName(""); setNewAccType("Funded");
  };

  const theme = state.theme || { name: "Original", mode: "night" };
  const setThemeName = (name) => {
    if (!isPlus(state) && !PLUS_ONLY_THEMES.includes(name)) { dispatch({ type: "OPEN_MODAL", modal: "upgrade" }); return; }
    dispatch({ type: "SET_THEME", theme: { name } });
  };
  const setThemeMode = (mode) => dispatch({ type: "SET_THEME", theme: { mode } });
  const saveSiteName = () => { if (!isPlus(state)) { dispatch({ type: "OPEN_MODAL", modal: "upgrade" }); return; } dispatch({ type: "SET_SITE_NAME", name: siteNameInput.trim() || "ACEZELLA" }); };
  const handleWatermarkUpload = (file) => {
    if (!file) return;
    if (!isPlus(state)) { dispatch({ type: "OPEN_MODAL", modal: "upgrade" }); return; }
    const reader = new FileReader();
    reader.onload = e => dispatch({ type: "SET_WATERMARK", watermark: { dataUrl: e.target.result } });
    reader.readAsDataURL(file);
  };

  // Export handlers
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "acezella_backup.json"; a.click();
  };

  const exportCSV = () => {
    const headers = ["date", "symbol", "direction", "outcome", "entry", "exit", "size", "pnl", "pips", "setup", "session", "mood", "notes", "account"];
    const rows = state.trades.map(t => headers.map(h => {
      const v = h === "account" ? (accounts.find(a => a.id === t.account)?.name || t.account) : t[h];
      return JSON.stringify(v ?? "");
    }).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "acezella_trades.csv"; a.click();
  };

  const exportHTML = () => {
    const stats = calcStats(state.trades);
    const rows = state.trades.map(t => `<tr><td>${fmtDate(t.date)}</td><td>${t.symbol}</td><td>${t.direction}</td><td style="color:${outcomeColor(t.outcome, t.pnl)}">${t.outcome}</td><td>${fmt$(t.pnl)}</td><td>${t.pips >= 0 ? "+" : ""}${t.pips}</td><td>${t.setup || ""}</td><td>${t.session}</td><td>${t.mood}</td></tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ACEZELLA — Trade Report</title><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');body{font-family:'Inter',sans-serif;background:#020617;color:#e8eaf0;padding:32px}h1{color:#32D18D}table{width:100%;border-collapse:collapse;margin-top:24px}th{background:#1e293b;padding:10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:1px}td{padding:10px;border-bottom:1px solid #1e293b;font-size:13px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:24px 0}.stat{background:#0F172A;border:1px solid #1e293b;border-radius:12px;padding:16px}.stat-label{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}.stat-value{font-size:24px;font-weight:700;color:#32D18D;font-family:'Inter',sans-serif}</style></head><body><h1>ACEZELLA — Trade Report</h1><p style="color:#94a3b8">Generated ${new Date().toLocaleString()}</p><div class="stats"><div class="stat"><div class="stat-label">Net P&L</div><div class="stat-value">${fmt$(stats.netPnl)}</div></div><div class="stat"><div class="stat-label">Win Rate</div><div class="stat-value">${stats.winRate.toFixed(1)}%</div></div><div class="stat"><div class="stat-label">Total Pips</div><div class="stat-value">${stats.totalPips >= 0 ? "+" : ""}${stats.totalPips.toFixed(1)}</div></div><div class="stat"><div class="stat-label">Trades</div><div class="stat-value">${state.trades.length}</div></div></div><table><thead><tr><th>Date</th><th>Symbol</th><th>Direction</th><th>Outcome</th><th>P&L</th><th>Pips</th><th>Setup</th><th>Session</th><th>Mood</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "acezella_report.html"; a.click();
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = e => { try { const data = JSON.parse(e.target.result); dispatch({ type: "IMPORT_DATA", data }); notify("Data imported successfully!"); } catch { notify("Invalid JSON file."); } };
    reader.readAsText(file);
  };

  const importCSV = (file) => {
    const reader = new FileReader();
    reader.onload = e => {
      const lines = e.target.result.split("\n").filter(Boolean);
      const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
      const newTrades = lines.slice(1).map((line, i) => {
        const vals = line.match(/(".*?"|[^,]+)/g)?.map(v => v.replace(/^"|"$/g, "").trim()) || [];
        const t = {};
        headers.forEach((h, j) => t[h] = vals[j] || "");
        return { id: `t_import_${i}`, date: new Date(t.date || Date.now()).toISOString(), symbol: t.symbol || "?", direction: t.direction || "Long", outcome: t.outcome || (parseFloat(t.pnl) >= 0 ? "Win" : "Loss"), entry: parseFloat(t.entry) || 0, exit: parseFloat(t.exit) || 0, size: parseInt(t.size) || 1, pnl: parseFloat(t.pnl) || 0, pips: parseFloat(t.pips) || 0, setup: t.setup || "", session: t.session || "", mood: t.mood || t.emotion || "Neutral", notes: t.notes || "", account: accounts[0]?.id || "", screenshots: [], tags: [] };
      }).filter(t => t.symbol !== "?");
      dispatch({ type: "IMPORT_DATA", data: { ...state, trades: [...state.trades, ...newTrades] } });
      notify(`Imported ${newTrades.length} trades.`);
    };
    reader.readAsText(file);
  };

  const handleFileImport = (file) => {
    if (!file) return;
    if (file.name.endsWith(".json")) importJSON(file);
    else if (file.name.endsWith(".csv")) importCSV(file);
    else notify("Supported formats: JSON, CSV");
  };

  return (
    <div className="fade-in" style={{ height: "100%", overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 22 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1, color: C.accent }}>♤ Settings</h1>

      {/* Plan / Billing */}
      <Card style={{ background: isPlus(state) ? `linear-gradient(160deg, ${C.blue}14, ${C.purple}14)` : C.surface, borderColor: isPlus(state) ? C.purple + "55" : C.border }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <SectionLabel>Plan &amp; Billing</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{PROMO_ALL_FEATURES_FREE ? "All Features Unlocked" : (PLAN_NAME[state.plan] || "Ace Basic")}</div>
              {isPlus(state) && <PlusBadge />}
              {PROMO_ALL_FEATURES_FREE && <Badge color={C.yellow}>FREE PROMO</Badge>}
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
              {PROMO_ALL_FEATURES_FREE
                ? `You're on ${PLAN_NAME[state.plan] || "Ace Basic"}, but every AcePlus feature is free for everyone during our launch promo. Some features will move to a paid plan soon.`
                : (isPlus(state) ? "Full access — $10/month." : "Free plan — limited trades, accounts, and setups. Upgrade for the full journal.")}
            </div>
          </div>
          <Btn variant={isPlus(state) ? "ghost" : "gradient"} onClick={() => dispatch({ type: "OPEN_MODAL", modal: "upgrade" })}>{isPlus(state) ? "Manage Plan" : "✨ Upgrade to AcePlus"}</Btn>
        </div>
      </Card>

      {/* Appearance */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ flex: 1 }}><SectionLabel>Site Name</SectionLabel></div>
          {!isPlus(state) && <PlusBadge small />}
        </div>
        {isPlus(state) ? (
          <>
            <div style={{ display: "flex", gap: 10, maxWidth: 460 }}>
              <Inp value={siteNameInput} onChange={setSiteNameInput} placeholder="ACEZELLA" style={{ flex: 1 }} />
              <Btn onClick={saveSiteName}>Save</Btn>
            </div>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 8 }}>Shown in the sidebar and on the sign-in screen.</div>
          </>
        ) : (
          <InlineUpgradeLock dispatch={dispatch} text={`Renaming the app from "${state.siteName || "ACEZELLA"}" is an AcePlus feature.`} />
        )}
      </Card>

      <Card>
        <SectionLabel>Color Theme</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 }}>
          {Object.entries(THEMES).map(([name, t]) => {
            const active = theme.name === name;
            const locked = !isPlus(state) && !PLUS_ONLY_THEMES.includes(name);
            return (
              <div key={name} onClick={() => setThemeName(name)} style={{ border: `2px solid ${active ? t.accent : C.border}`, borderRadius: 12, padding: "14px 12px", textAlign: "center", cursor: "pointer", background: active ? t.accent + "0f" : "transparent", position: "relative", opacity: locked ? 0.6 : 1 }}>
                {locked && <div style={{ position: "absolute", top: 8, right: 8 }}><PlusBadge small /></div>}
                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#fff" }} />
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#020617", border: `1px solid ${C.border}` }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: active ? t.accent : C.text, marginBottom: 8 }}>{name}</div>
                <div style={{ height: 3, borderRadius: 2, background: t.accent, width: "60%", margin: "0 auto" }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, maxWidth: 460 }}>
          <div onClick={() => setThemeMode("day")} style={{ flex: 1, padding: "16px 0", textAlign: "center", cursor: "pointer", background: theme.mode === "day" ? C.accentDim : "transparent", color: theme.mode === "day" ? C.accent : C.textMuted, fontWeight: 600, fontSize: 14 }}>☀️ Day</div>
          <div onClick={() => setThemeMode("night")} style={{ flex: 1, padding: "16px 0", textAlign: "center", cursor: "pointer", background: theme.mode === "night" ? C.accentDim : "transparent", color: theme.mode === "night" ? C.accent : C.textMuted, fontWeight: 600, fontSize: 14 }}>🌙 Night</div>
        </div>
      </Card>

      <Card>
        <SectionLabel>Background Watermark</SectionLabel>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>Defaults to the ♤ spade mark. Upload a logo or image to use a subtle background watermark instead.</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14, maxWidth: 460 }}>
          <Btn variant="ghost" onClick={() => isPlus(state) ? watermarkRef.current?.click() : dispatch({ type: "OPEN_MODAL", modal: "upgrade" })} style={{ flex: 1, justifyContent: "center" }}>Upload image {!isPlus(state) && <PlusBadge small />}</Btn>
          <Btn variant="danger" onClick={() => dispatch({ type: "SET_WATERMARK", watermark: { dataUrl: null } })}>Remove</Btn>
        </div>
        <input ref={watermarkRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleWatermarkUpload(e.target.files[0])} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: 460 }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>Opacity</span>
          <input type="range" min="2" max="40" value={state.watermark?.opacity ?? 20} onChange={e => dispatch({ type: "SET_WATERMARK", watermark: { opacity: parseInt(e.target.value) } })} style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: C.textMuted, minWidth: 32, textAlign: "right" }}>{state.watermark?.opacity ?? 20}%</span>
        </div>
        {state.watermark?.dataUrl ? (
          <div style={{ marginTop: 14, width: 140, height: 90, borderRadius: 8, border: `1px solid ${C.border}`, backgroundImage: `url(${state.watermark.dataUrl})`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundColor: C.bg }} />
        ) : (
          <div style={{ marginTop: 14, width: 140, height: 90, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 40, color: C.accent, lineHeight: 1 }}>♤</span>
          </div>
        )}
      </Card>

      <Card>
        <SectionLabel>Card Transparency</SectionLabel>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>Controls how see-through dashboard cards and panels are — so the background glow and watermark show through however much you want. 0% is fully solid, higher is more transparent.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: 460 }}>
          <span style={{ fontSize: 11, color: C.textDim }}>Solid</span>
          <input type="range" min="0" max="90" value={state.uiTransparency ?? 0} onChange={e => dispatch({ type: "SET_TRANSPARENCY", value: parseInt(e.target.value) })} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: C.textDim }}>Clear</span>
          <span style={{ fontSize: 12, color: C.text, fontWeight: 700, minWidth: 40, textAlign: "right" }}>{state.uiTransparency ?? 0}%</span>
        </div>
      </Card>

      <Card>
        <SectionLabel>Popups &amp; Sidebar Transparency</SectionLabel>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>Separately controls pop-ups (Add Trade, day/week calendar tap pop-ups, share, past-entry, delete-confirm, etc.) and the sidebar — tune these independently from regular cards above.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: 460 }}>
          <span style={{ fontSize: 11, color: C.textDim }}>Solid</span>
          <input type="range" min="0" max="90" value={state.popupTransparency ?? 0} onChange={e => dispatch({ type: "SET_POPUP_TRANSPARENCY", value: parseInt(e.target.value) })} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: C.textDim }}>Clear</span>
          <span style={{ fontSize: 12, color: C.text, fontWeight: 700, minWidth: 40, textAlign: "right" }}>{state.popupTransparency ?? 0}%</span>
        </div>
      </Card>

      {/* Privacy & Screen Protection */}
      <Card style={{ borderColor: state.privacy?.enabled ? C.purple + "55" : C.border }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4, gap: 10 }}>
          <div style={{ flex: 1 }}>
            <SectionLabel>🔒 Privacy &amp; Screen Protection</SectionLabel>
          </div>
          {state.privacy?.enabled && <Badge color={C.purple}>ON</Badge>}
        </div>
        <div style={{ background: C.yellowDim, border: `1px solid ${C.yellow}40`, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: C.yellow, lineHeight: 1.6, marginBottom: 16 }}>
          ⚠ Honest limits: no website can truly block OS-level screenshots or screen recording (Print Screen, phone screen recording, capture software, or a camera pointed at the monitor are outside any webpage's control). This turns on the deterrents that <b>are</b> possible in a browser — it will not stop a determined capture.
        </div>
        <div onClick={() => dispatch({ type: "SET_PRIVACY", data: { enabled: !state.privacy?.enabled } })} style={{ display: "flex", alignItems: "center", gap: 12, background: state.privacy?.enabled ? C.purpleDim : C.bg, border: `1px solid ${state.privacy?.enabled ? C.purple + "44" : C.border}`, borderRadius: 10, padding: 14, cursor: "pointer", marginBottom: state.privacy?.enabled ? 16 : 0 }}>
          <div style={{ width: 38, height: 22, borderRadius: 12, background: state.privacy?.enabled ? C.purple : C.border, position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: state.privacy?.enabled ? 19 : 3, transition: "left 0.15s" }} />
          </div>
          <div><div style={{ fontSize: 13, fontWeight: 700 }}>Enable Privacy Mode</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>Turns on the sub-options below across the whole app.</div></div>
        </div>
        {state.privacy?.enabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ["blurOnBlur", "Blur content when window loses focus", "Instantly hides your trades behind a blur if you alt-tab, switch apps, or the tab goes into the background."],
              ["blockPrint", "Block printing", "Prevents Print / Save-as-PDF, a common way to export a page as an image."],
              ["disableRightClick", "Disable right-click", "Blocks the browser's right-click menu, including \"Save image as\"."],
              ["disableCopy", "Disable text copy & selection", "Prevents selecting or copying text out of the app."],
              ["watermarkOverlay", "Traceable watermark overlay", "Tiles your name, email, and a timestamp faintly across the screen so any leaked capture can be traced back to the session."],
            ].map(([key, label, hint]) => {
              const on = !!state.privacy?.[key];
              return (
                <div key={key} onClick={() => dispatch({ type: "SET_PRIVACY", data: { [key]: !on } })} style={{ display: "flex", alignItems: "center", gap: 12, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
                  <div style={{ width: 32, height: 18, borderRadius: 10, background: on ? C.accent : C.border, position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
                    <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#fff", position: "absolute", top: 2.5, left: on ? 16 : 2.5, transition: "left 0.15s" }} />
                  </div>
                  <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>{label}</div><div style={{ fontSize: 11, color: C.textDim, marginTop: 2, lineHeight: 1.5 }}>{hint}</div></div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Accounts */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ flex: 1 }}><SectionLabel>Accounts</SectionLabel></div>
          {!isPlus(state) && <Badge color={C.purple}>{accounts.length}/{FREE_LIMITS.maxAccounts} (Ace Basic)</Badge>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {accounts.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: C.surfaceHigh, borderRadius: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: a.color }} />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div><div style={{ fontSize: 11, color: C.textMuted }}>{a.type}</div></div>
              <Badge color={a.color}>{calcStats(state.trades.filter(t => t.account === a.id)).netPnl >= 0 ? "+" : ""}{calcStats(state.trades.filter(t => t.account === a.id)).netPnl.toFixed(2)}</Badge>
              <button onClick={() => setConfirmAction({ message: `Delete "${a.name}" and all its trades? This cannot be undone.`, onConfirm: () => dispatch({ type: "DELETE_ACCOUNT", id: a.id }) })} style={{ background: C.redDim, border: "none", borderRadius: 7, color: C.red, padding: "5px 10px", cursor: "pointer", fontSize: 12 }}>Delete</button>
            </div>
          ))}
        </div>
        {canAddAccount(state) ? (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <Inp label="Account Name" value={newAccName} onChange={setNewAccName} placeholder="e.g. FTMO 100K Funded" />
            <Sel label="Type" value={newAccType} onChange={setNewAccType} options={["Funded", "Combine", "Live", "Demo"]} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 11, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Color</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ACCOUNT_COLORS.map(col => <div key={col} onClick={() => setNewAccColor(col)} style={{ width: 24, height: 24, borderRadius: "50%", background: col, cursor: "pointer", border: newAccColor === col ? `3px solid #fff` : "3px solid transparent", transition: "border 0.1s" }} />)}
              </div>
            </div>
            <Btn onClick={addAccount}>Add Account</Btn>
          </div>
        ) : (
          <InlineUpgradeLock dispatch={dispatch} text={`Ace Basic supports ${FREE_LIMITS.maxAccounts} account. Upgrade to AcePlus to add unlimited accounts.`} />
        )}
      </Card>

      {/* Sessions */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ flex: 1 }}><SectionLabel>Trading Sessions</SectionLabel></div>
          {!isPlus(state) && <PlusBadge small />}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {sessions.map(s => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px" }}>
              <span style={{ fontSize: 13 }}>{s}</span>
              {isPlus(state) && <button onClick={() => dispatch({ type: "DELETE_SESSION", name: s })} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>}
            </div>
          ))}
        </div>
        {isPlus(state) ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Inp value={newSession} onChange={setNewSession} placeholder="New session name…" style={{ maxWidth: 260 }} />
            <Btn small onClick={() => { if (newSession.trim()) { dispatch({ type: "ADD_SESSION", name: newSession.trim() }); setNewSession(""); } }}>Add Session</Btn>
          </div>
        ) : (
          <InlineUpgradeLock dispatch={dispatch} text="Adding or removing custom sessions is an AcePlus feature. Ace Basic can still log trades using the default sessions above." />
        )}
      </Card>

      {/* Emotions */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ flex: 1 }}><SectionLabel>Emotions / Moods</SectionLabel></div>
          {!isPlus(state) && <PlusBadge small />}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {emotions.map(e => (
            <div key={e} style={{ display: "flex", alignItems: "center", gap: 6, background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px" }}>
              <span style={{ fontSize: 13 }}>{e}</span>
              {isPlus(state) && <button onClick={() => dispatch({ type: "DELETE_EMOTION", name: e })} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>}
            </div>
          ))}
        </div>
        {isPlus(state) ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Inp value={newEmotion} onChange={setNewEmotion} placeholder="New emotion…" style={{ maxWidth: 260 }} />
            <Btn small onClick={() => { if (newEmotion.trim()) { dispatch({ type: "ADD_EMOTION", name: newEmotion.trim() }); setNewEmotion(""); } }}>Add Emotion</Btn>
          </div>
        ) : (
          <InlineUpgradeLock dispatch={dispatch} text="Adding or removing custom emotions is an AcePlus feature. Ace Basic can still log trades using the default emotions above." />
        )}
      </Card>

      {/* Data Export */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ flex: 1 }}><SectionLabel>Export Data</SectionLabel></div>
          {!isPlus(state) && <PlusBadge small />}
        </div>
        {isPlus(state) ? (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn variant="success" onClick={exportJSON}>⬇ Export JSON (Full Backup)</Btn>
              <Btn variant="ghost" onClick={exportCSV}>⬇ Export CSV (Trades)</Btn>
              <Btn variant="ghost" onClick={exportHTML}>⬇ Export HTML Report</Btn>
            </div>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 10 }}>JSON backup includes all trades, accounts, settings, and notes. CSV is trades-only for spreadsheets.</div>
          </>
        ) : (
          <InlineUpgradeLock dispatch={dispatch} text="Exporting your data (JSON backup, CSV, HTML report) is an AcePlus feature." />
        )}
      </Card>

      {/* Data Import */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ flex: 1 }}><SectionLabel>Import Data</SectionLabel></div>
          {!isPlus(state) && <PlusBadge small />}
        </div>
        {isPlus(state) ? (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <Btn variant="ghost" onClick={() => fileRef.current?.click()}>⬆ Import JSON or CSV</Btn>
            </div>
            <input ref={fileRef} type="file" accept=".json,.csv" style={{ display: "none" }} onChange={e => handleFileImport(e.target.files[0])} />
            <div style={{ fontSize: 12, color: C.textDim }}>Auto-detects JSON (full restore) or CSV (add trades). CSV columns: date, symbol, direction, outcome, entry, exit, size, pnl, pips, setup, session, mood, notes.</div>
          </>
        ) : (
          <InlineUpgradeLock dispatch={dispatch} text="Bulk importing trades (JSON or CSV) is an AcePlus feature." />
        )}
      </Card>

      {/* Danger Zone */}
      <Card style={{ borderColor: C.red + "44" }}>
        <SectionLabel>Danger Zone</SectionLabel>
        <Btn variant="danger" onClick={() => setConfirmAction({ message: "Delete ALL your data? This cannot be undone.", onConfirm: () => { localStorage.removeItem("acezella_v3"); window.location.reload(); } })}>🗑 Clear All Data</Btn>
      </Card>

      {/* Custom confirm modal (window.confirm is blocked in this sandboxed preview) */}
      {confirmAction && (
        <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && setConfirmAction(null)}>
          <div className="fade-in" style={{ background: C.modalBg, border: `1px solid ${C.red}44`, borderRadius: 16, padding: 26, width: "100%", maxWidth: 400 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Are you sure?</div>
            <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 22, lineHeight: 1.6 }}>{confirmAction.message}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="danger" style={{ flex: 1, justifyContent: "center" }} onClick={() => { confirmAction.onConfirm(); setConfirmAction(null); }}>Delete</Btn>
              <Btn variant="ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setConfirmAction(null)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Toast (replaces alert(), which is also blocked in this sandbox) */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 20px", fontSize: 13, fontWeight: 600, color: C.text, boxShadow: "0 8px 24px #0008", zIndex: 400 }} className="fade-in">{toast}</div>
      )}
    </div>
  );
}

// ─── PRIVACY MODE ─────────────────────────────────────────────────────────────
// IMPORTANT — honesty about limits: no website (or any browser-based app) can
// actually block OS-level screenshots or screen recording. There is no browser
// API for this — Print Screen, phone screen recording, capture software, or a
// second camera pointed at the monitor are all outside a webpage's control,
// by design (browsers deliberately don't expose that power to sites).
// What IS achievable in-browser, and what this feature actually does:
//   • Blur/hide content the instant the tab loses focus or visibility — this
//     defeats casual alt-tab screenshotting and hides data during screen
//     shares/recordings of *other* windows.
//   • Block printing (Print → Save as PDF is a common "screenshot" workaround).
//   • Disable right-click "Save image as" and text copy/selection.
//   • Overlay a faint, tiled watermark (name + email + timestamp) so that if
//     someone does capture the screen by other means, the leak is traceable.
// None of this is real DRM — it's deterrence + accountability, not prevention.
function PrivacyGuard({ state, dispatch, children }) {
  const privacy = state.privacy || {};
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    if (!privacy.enabled || !privacy.blurOnBlur) { setObscured(false); return; }
    const hide = () => setObscured(true);
    const show = () => { if (document.visibilityState === "visible" && document.hasFocus()) setObscured(false); };
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    document.addEventListener("visibilitychange", () => { if (document.hidden) hide(); else show(); });
    if (document.hidden || !document.hasFocus()) setObscured(true);
    return () => {
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
      document.removeEventListener("visibilitychange", show);
    };
  }, [privacy.enabled, privacy.blurOnBlur]);

  useEffect(() => {
    if (!privacy.enabled || !privacy.disableRightClick) return;
    const block = e => e.preventDefault();
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, [privacy.enabled, privacy.disableRightClick]);

  useEffect(() => {
    if (!privacy.enabled || !privacy.disableCopy) return;
    const block = e => e.preventDefault();
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    return () => { document.removeEventListener("copy", block); document.removeEventListener("cut", block); };
  }, [privacy.enabled, privacy.disableCopy]);

  const name = state.currentUser?.name || "Trader";
  const email = state.currentUser?.email || "";
  const stamp = `${name}${email ? " · " + email : ""} · ${new Date().toLocaleString()}`;

  return (
    <div className={privacy.enabled && privacy.blockPrint ? "privacy-print-lock" : ""} style={{ position: "relative", height: "100%", userSelect: privacy.enabled && privacy.disableCopy ? "none" : "auto" }}>
      {children}
      {privacy.enabled && privacy.watermarkOverlay && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, pointerEvents: "none", overflow: "hidden", opacity: 0.07 }}>
          <div style={{
            position: "absolute", top: "-20%", left: "-20%", width: "140%", height: "140%",
            display: "flex", flexWrap: "wrap", gap: 40, transform: "rotate(-28deg)", justifyContent: "center", alignContent: "center",
          }}>
            {Array.from({ length: 60 }).map((_, i) => (
              <span key={i} style={{ fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{stamp}</span>
            ))}
          </div>
        </div>
      )}
      {privacy.enabled && privacy.blurOnBlur && obscured && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999, backdropFilter: "blur(22px)", background: "#000c",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center", padding: 20,
        }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Content hidden</div>
          <div style={{ fontSize: 13, color: "#cbd5e1", maxWidth: 320 }}>Privacy Mode blurred this window because it lost focus. Click back into the tab to continue.</div>
        </div>
      )}
    </div>
  );
}

// ─── ROOT APP ────────────────────────────────────────────────────────────────
// ─── PAGE ERROR BOUNDARY ──────────────────────────────────────────────────────
// Without this, any uncaught error thrown while rendering a page (bad data
// shape, a null field, etc.) unmounts the entire React tree and leaves a
// blank white screen with no clue why. This catches it, logs the full error
// to the browser console, and shows the message + a "Try Again" button in
// place of just that page — the header/sidebar stay usable.
class PageErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Page render error:", error, info?.componentStack); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
          <div style={{ background: C.redDim, border: `1px solid ${C.red}44`, borderRadius: 14, padding: 24, maxWidth: 760 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: C.red, marginBottom: 10 }}>⚠ Something went wrong loading this page</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 6 }}>Open your browser's DevTools Console (F12) for the full stack trace. Error message:</div>
            <div style={{ fontSize: 12.5, color: C.text, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 16, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {String(this.state.error?.message || this.state.error)}
            </div>
            <button onClick={() => this.setState({ error: null })} style={{ background: C.accent, color: "#000", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Try Again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [state, setRawState] = useState(() => initState());
  const [page, setPage] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const dispatch = useCallback(action => setRawState(prev => reducer(prev, action)), []);

  // ── Restore Supabase session on load, and react to sign-in/out elsewhere ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        dispatch({ type: "LOGIN", user: { id: session.user.id, email: session.user.email, name: session.user.user_metadata?.name || session.user.email } });
      }
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setCloudLoaded(false); dispatch({ type: "LOGOUT" }); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ── Pull this user's saved cloud state the moment they're identified ──
  useEffect(() => {
    if (!state.currentUser?.id) return;
    let cancelled = false;
    setCloudLoaded(false);
    loadCloudState(state.currentUser.id).then(cloud => {
      if (cancelled) return;
      if (cloud) {
        dispatch({ type: "IMPORT_DATA", data: { ...cloud, currentUser: state.currentUser } });
      } else {
        // Brand-new account — start clean instead of inheriting stray localStorage data.
        dispatch({ type: "IMPORT_DATA", data: { ...defaultState(), currentUser: state.currentUser } });
      }
      setCloudLoaded(true);
    });
    return () => { cancelled = true; };
  }, [state.currentUser?.id]);

  // ── Push every change back up to Supabase (debounced), once initial pull is done ──
  useEffect(() => {
    if (state.currentUser?.id && cloudLoaded) saveCloudState(state.currentUser.id, state);
  }, [state, cloudLoaded]);

  useEffect(() => {
    let tag = document.querySelector('meta[name="viewport"]');
    if (!tag) { tag = document.createElement("meta"); tag.name = "viewport"; document.head.appendChild(tag); }
    tag.content = "width=device-width, initial-scale=1, viewport-fit=cover";
  }, []);

  applyTheme(state.theme?.name, state.theme?.mode, state.uiTransparency, state.popupTransparency);

  // Check for shared trade link
  const hash = window.location.hash;
  if (hash.startsWith("#share=")) {
    return (
      <>
        <style>{buildGlobalCSS()}</style>
        <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
          <PlanAnnouncementBanner />
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <PublicTradeView encoded={hash.slice(7)} />
          </div>
        </div>
      </>
    );
  }

  if (!authChecked) return (
    <>
      <style>{buildGlobalCSS()}</style>
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 14 }}>Loading…</div>
    </>
  );

  if (!state.currentUser) return (
    <>
      <style>{buildGlobalCSS()}</style>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <PlanAnnouncementBanner />
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <AuthScreen state={state} dispatch={dispatch} />
        </div>
      </div>
    </>
  );

  if (!cloudLoaded) return (
    <>
      <style>{buildGlobalCSS()}</style>
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 14 }}>Loading your journal…</div>
    </>
  );

  const modalType = typeof state.modal === "string" ? state.modal : state.modal?.type;

  const gatedPage = (id, node, gateTitle, gateDesc) =>
    (PLUS_ONLY_PAGES[id] && !isPlus(state)) ? <UpgradeGate title={gateTitle} desc={gateDesc} dispatch={dispatch} /> : node;

  const pages = {
    dashboard: <Dashboard state={state} dispatch={dispatch} setPage={setPage} />,
    journal: <Journal state={state} dispatch={dispatch} setPage={setPage} />,
    import: isPlus(state) ? <ImportTrades state={state} dispatch={dispatch} setPage={setPage} /> : <UpgradeGate title="Bulk import is an AcePlus feature" desc="Import trades from any broker/CSV in bulk once you upgrade to AcePlus." dispatch={dispatch} />,
    mynotes: gatedPage("mynotes", <MyNotes state={state} dispatch={dispatch} />, "My Notes is an AcePlus feature", "Unlock daily journaling — Graces & Goals, Quick Notes, Advanced Self Review, Mentor Notes, and Past Entries."),
    strategies: <Strategies state={state} dispatch={dispatch} />,
    analytics: gatedPage("analytics", <Analytics state={state} />, "Analytics is an AcePlus feature", "Unlock full performance breakdowns by setup, session, timeframe, symbol, and more."),
    myrecord: gatedPage("myrecord", <MyRecord state={state} />, "My Record is an AcePlus feature", "Track your lifetime green-day vs. red-day record, win/loss trade counts, and pips gained/lost — lifetime, this year, and this month."),
    emotions: gatedPage("emotions", <EmotionsScore state={state} dispatch={dispatch} setPage={setPage} />, "Edge Score is an AcePlus feature", "Track your Behavioral Edge Score, emotional patterns, and coaching insights."),
    finances: gatedPage("finances", <Finances state={state} dispatch={dispatch} />, "Prop Firm Tracker is an AcePlus feature", "Track evaluation costs, payouts, ROI, and breached accounts across every prop firm."),
    livecapital: gatedPage("livecapital", <LiveCapital state={state} dispatch={dispatch} setPage={setPage} />, "Live Capital is an AcePlus feature", "Track live account drawdown, risk buffer, growth pacing, and capital rules."),
    settings: <Settings state={state} dispatch={dispatch} />,
  };

  const watermark = state.watermark;
  const currentNav = NAV.find(n => n.id === page) || (page === "import" ? { icon: "♤", label: "Import Trades" } : page === "settings" ? { icon: "♤", label: "Settings" } : null);

  return (
    <>
      <style>{buildGlobalCSS()}</style>
      <PrivacyGuard state={state} dispatch={dispatch}>
      {watermark?.dataUrl ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: `url(${watermark.dataUrl})`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat", opacity: (watermark.opacity ?? 20) / 100, pointerEvents: "none" }} />
      ) : (
        <div style={{ position: "fixed", inset: 0, zIndex: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: (watermark?.opacity ?? 20) / 100, pointerEvents: "none" }}>
          <span style={{ fontSize: "min(60vw, 60vh)", lineHeight: 1, color: C.accent }}>♤</span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", position: "relative", zIndex: 1 }}>
        <PlanAnnouncementBanner />
        <TopHeader state={state} dispatch={dispatch} setPage={setPage} page={page} />
        <div className="app-shell" style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
          <Sidebar page={page} setPage={setPage} state={state} dispatch={dispatch} mobileNavOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
          <div className="app-main" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
            <div className="mobile-topbar">
              <button onClick={() => setMobileNavOpen(true)} aria-label="Open menu" style={{ background: "none", border: "none", color: C.text, fontSize: 22, cursor: "pointer", padding: "4px 6px" }}>☰</button>
              <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}><span>{currentNav?.icon}</span>{currentNav?.label}</div>
              <button onClick={() => openAddTrade(state, dispatch)} style={{ background: C.accent, border: "none", color: "#000", fontWeight: 700, fontSize: 13, borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>+ Trade</button>
            </div>
            <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
              <PageErrorBoundary key={page}>{pages[page]}</PageErrorBoundary>
            </div>
          </div>
          {modalType === "welcome" && <WelcomeModal state={state} dispatch={dispatch} />}
          {modalType === "add_trade" && <AddTradeModal state={state} dispatch={dispatch} />}
          {modalType === "upgrade" && <UpgradeModal state={state} dispatch={dispatch} />}
        </div>
      </div>
      </PrivacyGuard>
    </>
  );
}

// Inner component for page state (hooks rules)
const _App = App;
export { _App };
