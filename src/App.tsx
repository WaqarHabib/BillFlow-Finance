import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Wallet,
  Download,
  Pencil,
  Gem,
  CalendarDays,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: "income" | "expense";
}

const STORAGE_KEY = "fbc.state.v1";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

type EditTarget =
  | { kind: "income" | "bill"; id: string }
  | null;

function FutureBalanceCalculator() {
  // ---------- Hydrate from localStorage ----------
  const [hydrated, setHydrated] = useState(false);
  const [startingBalance, setStartingBalance] = useState<string>("");
  const [incomes, setIncomes] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Transaction[]>([]);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.startingBalance === "string") setStartingBalance(parsed.startingBalance);
        if (Array.isArray(parsed.incomes)) setIncomes(parsed.incomes);
        if (Array.isArray(parsed.bills)) setBills(parsed.bills);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ startingBalance, incomes, bills }),
      );
    } catch {
      /* ignore */
    }
  }, [hydrated, startingBalance, incomes, bills]);

  // ---------- Form state ----------
  const [incomeForm, setIncomeForm] = useState({ description: "", amount: "", date: "" });
  const [billForm, setBillForm] = useState({ description: "", amount: "", date: "" });
  const [errors, setErrors] = useState<{ income?: string; bill?: string; edit?: string }>({});

  // ---------- Edit dialog state ----------
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [editForm, setEditForm] = useState({ description: "", amount: "", date: "" });

  const parsedStartingBalance = useMemo(() => {
    const val = parseFloat(startingBalance);
    return isNaN(val) ? 0 : val;
  }, [startingBalance]);

  const timeline = useMemo(() => {
    const all = [
      ...incomes.map((i) => ({ ...i, signedAmount: i.amount })),
      ...bills.map((b) => ({ ...b, signedAmount: -b.amount })),
    ];
    all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = parsedStartingBalance;
    return all.map((t) => {
      running += t.signedAmount;
      return {
        ...t,
        runningBalance: running,
        isNegative: running < 0,
      };
    });
  }, [incomes, bills, parsedStartingBalance]);

  const finalBalance = timeline.length > 0 ? timeline[timeline.length - 1].runningBalance : parsedStartingBalance;

  // Chart data: include a starting point
  const chartData = useMemo(() => {
    const points: { label: string; balance: number; date: string }[] = [];
    if (timeline.length === 0) return points;
    const firstDate = timeline[0].date;
    points.push({ label: "Start", balance: parsedStartingBalance, date: firstDate });
    for (const t of timeline) {
      points.push({
        label: formatShortDate(t.date),
        balance: t.runningBalance,
        date: t.date,
      });
    }
    return points;
  }, [timeline, parsedStartingBalance]);

  const minBalance = useMemo(
    () => (chartData.length ? Math.min(...chartData.map((d) => d.balance)) : 0),
    [chartData],
  );

  // Monthly summary
  const monthlySummary = useMemo(() => {
    const map = new Map<string, { income: number; bills: number }>();
    for (const i of incomes) {
      const key = i.date.slice(0, 7);
      const cur = map.get(key) ?? { income: 0, bills: 0 };
      cur.income += i.amount;
      map.set(key, cur);
    }
    for (const b of bills) {
      const key = b.date.slice(0, 7);
      const cur = map.get(key) ?? { income: 0, bills: 0 };
      cur.bills += b.amount;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({
        key,
        label: formatMonthLabel(key),
        income: v.income,
        bills: v.bills,
        net: v.income - v.bills,
      }));
  }, [incomes, bills]);

  // ---------- Validation ----------
  function validateForm(form: { description: string; amount: string; date: string }): string | undefined {
    if (!form.description.trim()) return "Description is required.";
    if (!form.amount.trim()) return "Amount is required.";
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) return "Amount must be a positive number.";
    if (!form.date) return "Date is required.";
    return undefined;
  }

  function addIncome(e: React.FormEvent) {
    e.preventDefault();
    const error = validateForm(incomeForm);
    if (error) return setErrors((p) => ({ ...p, income: error }));
    setErrors((p) => ({ ...p, income: undefined }));
    setIncomes((prev) => [
      ...prev,
      {
        id: generateId(),
        description: incomeForm.description.trim(),
        amount: parseFloat(incomeForm.amount),
        date: incomeForm.date,
        type: "income",
      },
    ]);
    setIncomeForm({ description: "", amount: "", date: "" });
  }

  function addBill(e: React.FormEvent) {
    e.preventDefault();
    const error = validateForm(billForm);
    if (error) return setErrors((p) => ({ ...p, bill: error }));
    setErrors((p) => ({ ...p, bill: undefined }));
    setBills((prev) => [
      ...prev,
      {
        id: generateId(),
        description: billForm.description.trim(),
        amount: parseFloat(billForm.amount),
        date: billForm.date,
        type: "expense",
      },
    ]);
    setBillForm({ description: "", amount: "", date: "" });
  }

  function removeIncome(id: string) {
    setIncomes((prev) => prev.filter((i) => i.id !== id));
  }
  function removeBill(id: string) {
    setBills((prev) => prev.filter((b) => b.id !== id));
  }

  // ---------- Edit ----------
  function openEdit(kind: "income" | "bill", id: string) {
    const source = kind === "income" ? incomes : bills;
    const item = source.find((t) => t.id === id);
    if (!item) return;
    setEditTarget({ kind, id });
    setEditForm({
      description: item.description,
      amount: String(item.amount),
      date: item.date,
    });
    setErrors((p) => ({ ...p, edit: undefined }));
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const error = validateForm(editForm);
    if (error) return setErrors((p) => ({ ...p, edit: error }));
    const update = (list: Transaction[]) =>
      list.map((t) =>
        t.id === editTarget.id
          ? {
              ...t,
              description: editForm.description.trim(),
              amount: parseFloat(editForm.amount),
              date: editForm.date,
            }
          : t,
      );
    if (editTarget.kind === "income") setIncomes(update);
    else setBills(update);
    setEditTarget(null);
  }

  // ---------- Luxury HTML statement export ----------
  function handleExportCSV() {
    const esc = (s: string | number) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const fmt = (n: number) => formatCurrency(n);
    const now = new Date();
    const generatedOn = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const generatedAt = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const ref =
      "AUR-" +
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      "-" +
      Math.random().toString(36).slice(2, 6).toUpperCase();

    const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
    const totalBills = bills.reduce((s, b) => s + b.amount, 0);
    const netChange = finalBalance - parsedStartingBalance;
    const netPositive = netChange >= 0;

    const sortedIncomes = [...incomes].sort((a, b) => a.date.localeCompare(b.date));
    const sortedBills = [...bills].sort((a, b) => a.date.localeCompare(b.date));

    const incomeRows = sortedIncomes.length
      ? sortedIncomes
          .map(
            (i) => `<tr>
              <td class="date">${esc(formatDate(i.date))}</td>
              <td>${esc(i.description)}</td>
              <td class="num pos">+ ${esc(fmt(i.amount))}</td>
            </tr>`,
          )
          .join("")
      : `<tr><td colspan="3" class="empty">No income entries recorded.</td></tr>`;

    const billRows = sortedBills.length
      ? sortedBills
          .map(
            (b) => `<tr>
              <td class="date">${esc(formatDate(b.date))}</td>
              <td>${esc(b.description)}</td>
              <td class="num neg">- ${esc(fmt(b.amount))}</td>
            </tr>`,
          )
          .join("")
      : `<tr><td colspan="3" class="empty">No scheduled obligations recorded.</td></tr>`;

    const timelineRows = timeline.length
      ? timeline
          .map(
            (t) => `<tr>
              <td class="date">${esc(formatDate(t.date))}</td>
              <td>${esc(t.description)}</td>
              <td class="tag ${t.type === "income" ? "pos" : "neg"}">${t.type === "income" ? "Credit" : "Debit"}</td>
              <td class="num ${t.type === "income" ? "pos" : "neg"}">${t.signedAmount >= 0 ? "+ " : "- "}${esc(fmt(Math.abs(t.signedAmount)))}</td>
              <td class="num bal">${esc(fmt(t.runningBalance))}</td>
            </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="empty">No projected movements.</td></tr>`;

    const monthlyRows = monthlySummary.length
      ? monthlySummary
          .map(
            (m) => `<tr>
              <td>${esc(formatMonthLabel(m.key))}</td>
              <td class="num pos">${esc(fmt(m.income))}</td>
              <td class="num neg">${esc(fmt(m.bills))}</td>
              <td class="num ${m.net >= 0 ? "pos" : "neg"}">${m.net >= 0 ? "+ " : "- "}${esc(fmt(Math.abs(m.net)))}</td>
            </tr>`,
          )
          .join("")
      : `<tr><td colspan="4" class="empty">No monthly activity.</td></tr>`;

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Bill Flow Statement &middot; ${esc(ref)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,500&family=Inter:wght@300;400;500;600;700&display=swap" />
<style>
  :root {
    --ink: #111319;
    --ink-soft: #4a4d57;
    --muted: #8a8d97;
    --line: #e6e1d6;
    --line-soft: #f0ece3;
    --paper: #fbf8f1;
    --paper-2: #f5f0e3;
    --gold: #b08a3e;
    --gold-deep: #8a6a26;
    --gold-soft: #d8b86b;
    --pos: #2f6b4a;
    --neg: #9a2b2b;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ece6d6; color: var(--ink); font-family: 'Inter', system-ui, sans-serif; font-weight: 400; -webkit-font-smoothing: antialiased; }
  .sheet { max-width: 900px; margin: 32px auto; background: var(--paper); border: 1px solid var(--line); box-shadow: 0 30px 80px -40px rgba(60,40,10,0.25); position: relative; overflow: hidden; }
  .sheet::before { content: ""; position: absolute; inset: 0; background:
      radial-gradient(circle at 0% 0%, rgba(176,138,62,0.08), transparent 40%),
      radial-gradient(circle at 100% 100%, rgba(176,138,62,0.06), transparent 45%);
    pointer-events: none; }
  .topbar { height: 6px; background: linear-gradient(90deg, var(--gold-deep), var(--gold-soft), var(--gold-deep)); }
  .hdr { padding: 44px 56px 28px; display: flex; justify-content: space-between; align-items: flex-start; gap: 32px; border-bottom: 1px solid var(--line); position: relative; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .monogram { width: 56px; height: 56px; border: 1px solid var(--gold); display: grid; place-items: center; font-family: 'Cormorant Garamond', serif; font-style: italic; font-weight: 600; font-size: 34px; color: var(--gold-deep); background: linear-gradient(135deg, rgba(216,184,107,0.18), transparent); }
  .name { font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 500; letter-spacing: 0.02em; color: var(--ink); line-height: 1; }
  .tag { font-size: 10px; letter-spacing: 0.32em; text-transform: uppercase; color: var(--gold-deep); margin-top: 8px; font-weight: 600; }
  .meta { text-align: right; font-size: 12px; color: var(--ink-soft); line-height: 1.7; }
  .meta strong { color: var(--ink); letter-spacing: 0.06em; font-weight: 600; }
  .title { padding: 36px 56px 8px; font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 26px; color: var(--ink); position: relative; }
  .title::after { content: ""; display: block; width: 48px; height: 1px; background: var(--gold); margin-top: 14px; }
  .subtitle { padding: 0 56px; color: var(--muted); font-size: 13px; max-width: 560px; line-height: 1.6; }
  .summary { padding: 28px 56px 8px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
  .stat { border: 1px solid var(--line); background: linear-gradient(180deg, #fff, var(--paper-2)); padding: 18px 16px; position: relative; }
  .stat .lbl { font-size: 9px; letter-spacing: 0.28em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
  .stat .val { margin-top: 10px; font-family: 'Cormorant Garamond', serif; font-size: 24px; font-weight: 500; color: var(--ink); letter-spacing: -0.01em; }
  .stat.gold { border-color: var(--gold); background: linear-gradient(180deg, #fff8e4, #f4e7c0); }
  .stat.gold .val { color: var(--gold-deep); }
  .stat .delta { font-size: 11px; margin-top: 4px; color: var(--ink-soft); }
  .stat .delta.pos { color: var(--pos); }
  .stat .delta.neg { color: var(--neg); }
  section { padding: 28px 56px; }
  h2 { font-family: 'Cormorant Garamond', serif; font-weight: 500; font-size: 19px; letter-spacing: 0.04em; color: var(--ink); margin: 0 0 4px; display: flex; align-items: baseline; gap: 14px; }
  h2 .num { font-family: 'Inter', sans-serif; font-size: 10px; letter-spacing: 0.32em; color: var(--gold-deep); font-weight: 600; }
  h2::after { content: ""; flex: 1; height: 1px; background: var(--line); margin-left: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12.5px; }
  th { text-align: left; font-weight: 600; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--muted); padding: 10px 12px; border-bottom: 1px solid var(--line); }
  td { padding: 12px; border-bottom: 1px solid var(--line-soft); color: var(--ink); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  td.date { color: var(--ink-soft); white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
  td.num.bal { color: var(--ink); font-weight: 600; }
  td.pos, .pos { color: var(--pos); }
  td.neg, .neg { color: var(--neg); }
  td.tag { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; }
  td.empty { text-align: center; color: var(--muted); font-style: italic; padding: 22px; }
  .footer { padding: 28px 56px 44px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
  .seal { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 13px; color: var(--gold-deep); }
  .sig { text-align: right; font-size: 11px; color: var(--muted); line-height: 1.6; }
  .sig .line { width: 180px; height: 1px; background: var(--ink); margin: 18px 0 6px auto; }
  .actions { max-width: 900px; margin: 0 auto 32px; display: flex; justify-content: flex-end; gap: 10px; padding: 0 8px; }
  .actions button { font-family: 'Inter', sans-serif; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; padding: 10px 18px; border: 1px solid var(--gold); background: var(--ink); color: var(--gold-soft); cursor: pointer; font-weight: 600; }
  .actions button:hover { background: var(--gold-deep); color: #fff; }
  @media print {
    body { background: #fff; }
    .actions { display: none; }
    .sheet { box-shadow: none; margin: 0 auto; border: none; }
  }
</style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">Print &middot; Save as PDF</button>
  </div>
  <article class="sheet">
    <div class="topbar"></div>
    <header class="hdr">
      <div class="brand">
        <div class="monogram">B</div>
        <div>
          <div class="name">Bill Flow</div>
          <div class="tag">Smart Bill Management</div>
        </div>
      </div>

      
      <div class="meta">
        <div><strong>Statement</strong></div>
        <div>Reference&nbsp;&middot;&nbsp;${esc(ref)}</div>
        <div>${esc(generatedOn)}</div>
        <div>Issued at ${esc(generatedAt)}</div>
      </div>
    </header>

    <div class="title">Projected Cash-Flow Statement</div>
    <div class="subtitle">A confidential forecast of your liquidity horizon, prepared with quiet precision from the entries on record.</div>

    <div class="summary">
      <div class="stat">
        <div class="lbl">Opening Balance</div>
        <div class="val">${esc(fmt(parsedStartingBalance))}</div>
      </div>
      <div class="stat">
        <div class="lbl">Total Credits</div>
        <div class="val pos">${esc(fmt(totalIncome))}</div>
        <div class="delta">${incomes.length} entr${incomes.length === 1 ? "y" : "ies"}</div>
      </div>
      <div class="stat">
        <div class="lbl">Total Debits</div>
        <div class="val neg">${esc(fmt(totalBills))}</div>
        <div class="delta">${bills.length} entr${bills.length === 1 ? "y" : "ies"}</div>
      </div>
      <div class="stat gold">
        <div class="lbl">Projected Balance</div>
        <div class="val">${esc(fmt(finalBalance))}</div>
        <div class="delta ${netPositive ? "pos" : "neg"}">${netPositive ? "+" : "-"} ${esc(fmt(Math.abs(netChange)))} net</div>
      </div>
    </div>

    <section>
      <h2><span>I.</span> Scheduled Income <span class="num">${sortedIncomes.length} record${sortedIncomes.length === 1 ? "" : "s"}</span></h2>
      <table>
        <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${incomeRows}</tbody>
      </table>
    </section>

    <section>
      <h2><span>II.</span> Scheduled Obligations <span class="num">${sortedBills.length} record${sortedBills.length === 1 ? "" : "s"}</span></h2>
      <table>
        <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${billRows}</tbody>
      </table>
    </section>

    <section>
      <h2><span>III.</span> Projected Timeline <span class="num">${timeline.length} movement${timeline.length === 1 ? "" : "s"}</span></h2>
      <table>
        <thead><tr><th>Date</th><th>Description</th><th>Type</th><th style="text-align:right">Amount</th><th style="text-align:right">Running Balance</th></tr></thead>
        <tbody>${timelineRows}</tbody>
      </table>
    </section>

    <section>
      <h2><span>IV.</span> Monthly Summary</h2>
      <table>
        <thead><tr><th>Month</th><th style="text-align:right">Income</th><th style="text-align:right">Bills</th><th style="text-align:right">Net</th></tr></thead>
        <tbody>${monthlyRows}</tbody>
      </table>
    </section>

    <footer class="footer">
      <div class="seal">Bill Flow &middot; Prepared in confidence for the account holder.</div>
      <div class="sig">
        <div class="line"></div>
        Authorised by the account holder
      </div>
    </footer>
  </article>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = now.toISOString().slice(0, 10);
    link.href = url;
    link.download = `billflow-statement-${today}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const hasAnyData = incomes.length > 0 || bills.length > 0 || startingBalance !== "";

  return (
    <div className="relative min-h-screen py-10 px-4 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-[var(--gold)]/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-[var(--chart-4)]/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-10">
        {/* Header */}
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-[var(--gold)]/30 bg-[var(--gold)]/[0.06] px-3.5 py-1 text-[10px] font-medium uppercase tracking-[0.32em] text-[var(--gold-soft)]">
              <Gem className="h-3 w-3" />
              Bill Flow · Smart Bill Management
            </div>
            <div className="flex items-center gap-4">
              <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[var(--gold)]/50 bg-gradient-to-br from-[var(--gold)]/25 via-transparent to-transparent shadow-[var(--shadow-gold)]">
                  <span className="font-display text-3xl font-semibold italic gold-text leading-none">B</span>
                <span className="absolute -bottom-1 left-1/2 h-px w-6 -translate-x-1/2 bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-4xl font-medium leading-[1.05] tracking-tight text-foreground sm:text-5xl">
                    <span className="gold-text italic">Bill Flow</span>
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Forecast, refine, and orchestrate your finances with quiet precision.
                </p>
              </div>
            </div>
          </div>
          <Button
            onClick={handleExportCSV}
            disabled={!hasAnyData}
            className="hidden sm:inline-flex shrink-0 border border-[var(--gold)]/40 bg-transparent text-[var(--gold)] hover:bg-[var(--gold)]/10 hover:text-[var(--gold)] shadow-none"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export Statement
          </Button>
        </header>

        <div className="hairline" />

        {/* Starting Balance + KPI */}
        <div className="grid gap-5 md:grid-cols-3">
          <Card className="glass-card md:col-span-2 overflow-hidden rounded-2xl">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Starting Balance
                </span>
                <Wallet className="h-4 w-4 text-[var(--gold-soft)]" />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="font-display text-5xl font-medium tracking-tight gold-text sm:text-6xl">
                {formatCurrency(parsedStartingBalance)}
              </div>
              <div>
                <Label htmlFor="starting-balance" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Adjust opening figure
                </Label>
                <Input
                  id="starting-balance"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  className="mt-2 h-11 border-[var(--gold)]/20 bg-background/40 text-lg focus-visible:ring-[var(--gold)]/40"
                />
              </div>
            </CardContent>
          </Card>

          <Card
            className={`glass-card overflow-hidden rounded-2xl ${
              finalBalance < 0 ? "ring-1 ring-expense/40" : "ring-1 ring-[var(--gold)]/25"
            }`}
          >
            <CardHeader className="pb-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Final Projection
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className={`font-display text-4xl font-medium tracking-tight ${
                  finalBalance < 0 ? "text-expense" : "gold-text"
                }`}
              >
                {formatCurrency(finalBalance)}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-[var(--gold)]" />
                  {timeline.length} entr{timeline.length === 1 ? "y" : "ies"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1 w-1 rounded-full bg-[var(--gold)]" />
                  {monthlySummary.length} month{monthlySummary.length === 1 ? "" : "s"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Income & Bills Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Income */}
          <Card className="glass-card rounded-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 font-display text-2xl font-medium text-income">
                <TrendingUp className="h-5 w-5" />
                Income
              </CardTitle>
              <CardDescription>Add income sources with expected dates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={addIncome} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-1">
                    <Label htmlFor="income-desc" className="text-xs font-medium">
                      Description
                    </Label>
                    <Input
                      id="income-desc"
                      placeholder="e.g. Paycheck"
                      value={incomeForm.description}
                      onChange={(e) => setIncomeForm((p) => ({ ...p, description: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="income-amount" className="text-xs font-medium">
                      Amount
                    </Label>
                    <Input
                      id="income-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={incomeForm.amount}
                      onChange={(e) => setIncomeForm((p) => ({ ...p, amount: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="income-date" className="text-xs font-medium">
                      Date
                    </Label>
                    <Input
                      id="income-date"
                      type="date"
                      value={incomeForm.date}
                      onChange={(e) => setIncomeForm((p) => ({ ...p, date: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>
                {errors.income && <p className="text-sm text-expense">{errors.income}</p>}
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full border-income text-income hover:bg-income-muted hover:text-income"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Income
                </Button>
              </form>

              {incomes.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-sm font-medium text-foreground">Added Income</p>
                  <div className="space-y-2">
                    {incomes.map((inc) => (
                      <div
                        key={inc.id}
                        className="flex items-center justify-between rounded-lg border bg-income-muted/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{inc.description}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(inc.date)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-sm font-semibold text-income">
                            {formatCurrency(inc.amount)}
                          </span>
                          <button
                            onClick={() => openEdit("income", inc.id)}
                            className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-background hover:text-primary transition-colors"
                            aria-label="Edit income"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => removeIncome(inc.id)}
                            className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-background hover:text-expense transition-colors"
                            aria-label="Remove income"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bills */}
          <Card className="glass-card rounded-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 font-display text-2xl font-medium text-expense">
                <TrendingDown className="h-5 w-5" />
                Bills & Expenses
              </CardTitle>
              <CardDescription>Add upcoming bills and expenses.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={addBill} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-1">
                    <Label htmlFor="bill-desc" className="text-xs font-medium">
                      Description
                    </Label>
                    <Input
                      id="bill-desc"
                      placeholder="e.g. Rent"
                      value={billForm.description}
                      onChange={(e) => setBillForm((p) => ({ ...p, description: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="bill-amount" className="text-xs font-medium">
                      Amount
                    </Label>
                    <Input
                      id="bill-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={billForm.amount}
                      onChange={(e) => setBillForm((p) => ({ ...p, amount: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="bill-date" className="text-xs font-medium">
                      Date
                    </Label>
                    <Input
                      id="bill-date"
                      type="date"
                      value={billForm.date}
                      onChange={(e) => setBillForm((p) => ({ ...p, date: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>
                {errors.bill && <p className="text-sm text-expense">{errors.bill}</p>}
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full border-expense text-expense hover:bg-expense-muted hover:text-expense"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Bill
                </Button>
              </form>

              {bills.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-sm font-medium text-foreground">Added Bills</p>
                  <div className="space-y-2">
                    {bills.map((bill) => (
                      <div
                        key={bill.id}
                        className="flex items-center justify-between rounded-lg border bg-expense-muted/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{bill.description}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(bill.date)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-sm font-semibold text-expense">
                            {formatCurrency(bill.amount)}
                          </span>
                          <button
                            onClick={() => openEdit("bill", bill.id)}
                            className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-background hover:text-primary transition-colors"
                            aria-label="Edit bill"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => removeBill(bill.id)}
                            className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-background hover:text-expense transition-colors"
                            aria-label="Remove bill"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        <Card className="glass-card rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-2xl font-medium">Balance Over Time</CardTitle>
            <CardDescription>
              Your projected running balance, visualized chronologically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Add income or bills to see the chart.
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--income)" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="var(--income)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="label"
                      stroke="var(--muted-foreground)"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) =>
                        new Intl.NumberFormat("en-US", {
                          notation: "compact",
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 1,
                        }).format(v as number)
                      }
                      width={70}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--popover-foreground)",
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [formatCurrency(value), "Balance"]}
                    />
                    {minBalance < 0 && (
                      <ReferenceLine y={0} stroke="var(--expense)" strokeDasharray="4 4" />
                    )}
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke="var(--income)"
                      strokeWidth={2.5}
                      fill="url(#balanceFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projected Balance Timeline */}
        <Card className="glass-card rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="font-display text-2xl font-medium">Projected Balance Timeline</CardTitle>
            <CardDescription>
              Transactions sorted chronologically with running balance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <p>Add income and bills to see your projected balance timeline.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto -mx-6 px-3 sm:px-6">
                  <Table className="min-w-0">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-2 sm:px-2">Date</TableHead>
                        <TableHead className="px-2 sm:px-2">Description</TableHead>
                        <TableHead className="px-2 sm:px-2 text-right">Amount</TableHead>
                        <TableHead className="px-2 sm:px-2 text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {timeline.map((row) => (
                        <TableRow
                          key={row.id}
                          className={row.isNegative ? "bg-expense-muted/30" : undefined}
                        >
                          <TableCell className="px-2 sm:px-2 whitespace-nowrap text-xs sm:text-sm text-muted-foreground">
                            <span className="sm:hidden">{formatShortDate(row.date)}</span>
                            <span className="hidden sm:inline">{formatDate(row.date)}</span>
                          </TableCell>
                          <TableCell className="px-2 sm:px-2 max-w-[120px] sm:max-w-none">
                            <div className="flex items-center gap-1.5">
                              {row.isNegative && (
                                <AlertTriangle className="h-3.5 w-3.5 text-expense shrink-0" />
                              )}
                              <span className={`truncate text-xs sm:text-sm ${row.isNegative ? "font-medium text-expense" : ""}`}>
                                {row.description}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell
                            className={`px-2 sm:px-2 text-right whitespace-nowrap text-xs sm:text-sm font-medium ${
                              row.type === "income" ? "text-income" : "text-expense"
                            }`}
                          >
                            {row.type === "income" ? "+" : "-"}
                            {formatCurrency(Math.abs(row.signedAmount))}
                          </TableCell>
                          <TableCell
                            className={`px-2 sm:px-2 text-right whitespace-nowrap text-xs sm:text-sm font-semibold ${
                              row.isNegative ? "text-expense" : "text-foreground"
                            }`}
                          >
                            {formatCurrency(row.runningBalance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-6 flex items-center justify-between rounded-xl border border-[var(--gold)]/25 bg-gradient-to-r from-[var(--gold)]/10 via-transparent to-[var(--gold)]/10 px-5 py-4">
                  <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Final Projected Balance
                  </span>
                  <span
                    className={`font-display text-3xl font-medium tracking-tight ${
                      finalBalance < 0 ? "text-expense" : "gold-text"
                    }`}
                  >
                    {formatCurrency(finalBalance)}
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Monthly Summary */}
        <Card className="glass-card rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 font-display text-2xl font-medium">
              <CalendarDays className="h-5 w-5 text-primary" />
              Monthly Summary
            </CardTitle>
            <CardDescription>
              Total income, bills, and net per month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {monthlySummary.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Add entries to see monthly totals.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Income</TableHead>
                      <TableHead className="text-right">Bills</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlySummary.map((m) => (
                      <TableRow key={m.key}>
                        <TableCell className="font-medium">{m.label}</TableCell>
                        <TableCell className="text-right text-income font-medium">
                          {formatCurrency(m.income)}
                        </TableCell>
                        <TableCell className="text-right text-expense font-medium">
                          {formatCurrency(m.bills)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-bold ${
                            m.net < 0 ? "text-expense" : "text-income"
                          }`}
                        >
                          {formatCurrency(m.net)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        {/* Mobile-only Export Button placed under Monthly Summary */}
        <div className="mx-auto max-w-6xl mt-6 px-4 sm:hidden">
          <Button
            onClick={handleExportCSV}
            disabled={!hasAnyData}
            className="w-full justify-center border border-[var(--gold)]/40 bg-transparent text-[var(--gold)] hover:bg-[var(--gold)]/10 hover:text-[var(--gold)] shadow-none"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export Statement
          </Button>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit {editTarget?.kind === "income" ? "Income" : "Bill"}
            </DialogTitle>
            <DialogDescription>
              Update the details and save your changes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div>
              <Label htmlFor="edit-desc" className="text-xs font-medium">
                Description
              </Label>
              <Input
                id="edit-desc"
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-amount" className="text-xs font-medium">
                  Amount
                </Label>
                <Input
                  id="edit-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editForm.amount}
                  onChange={(e) => setEditForm((p) => ({ ...p, amount: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="edit-date" className="text-xs font-medium">
                  Date
                </Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm((p) => ({ ...p, date: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            {errors.edit && <p className="text-sm text-expense">{errors.edit}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FutureBalanceCalculator;
