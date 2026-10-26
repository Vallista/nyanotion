/**
 * Bento(맥) 생활 기록 → 도란, 한 번 옮기기 (`docs/15-today.md` §Bento 에서 옮기기).
 *
 * Bento 는 자기 파일(`blocks.json` · `mood.json` · `summaries.json`)과 화면 저장소의 생각(thoughts)을
 * **그대로** 보낸다. 모양을 바꾸는 일은 여기 한 곳에서 한다 — 서버에서 시험할 수 있고, Bento 를 다시 빌드하지
 * 않고도 고칠 수 있게.
 *
 * - 계획 블록 → 일정. 외부 캘린더 사본(gcal·applecal)은 도란이 iCal 로 따로 받으므로 빼고, 할 일에 매인 블록은
 *   할 일이 체크리스트로 오므로 빼고, 루틴·건강 블록은 루틴이 따로 있으므로 뺀다. 시간을 안 정한 블록도 뺀다.
 * - 생각(종류가 '생각'인 것만) → 메모. 줍기·블로그 생각은 Bento 에 남는다.
 * - 기분(0~1) → 1~5. 하루 회고는 그대로.
 * - 주간·월간 요약(AI) → 회고(`source = import`).
 *
 * DB·Next 를 모른다.
 */
import { cleanDay, cleanTime } from "./checklist";
import { FEED_COLORS } from "./calendar";
import { LifeRuleError, normalizePlanEvent, type PlanEventFields } from "./life";

export type BentoImportPlan = {
  events: (PlanEventFields & { sourceId: string })[];
  memos: { sourceId: string; text: string; done: boolean; createdAt: string; updatedAt: string }[];
  days: { date: string; mood: number | null; energy: number | null; note: string | null; retro: string | null }[];
  reviews: { kind: "week" | "month"; period: string; text: string; createdAt: string }[];
  skipped: { external: number; task: number; routine: number; unscheduled: number; invalid: number; thoughts: number; days: number; reviews: number };
};

/** 한 번에 받는 양 — Bento 몇 해치 블록이 한 번에 와도 되게 넉넉히. */
export const BENTO_IMPORT_MAX = 50_000;

/** Bento 블록 종류 → 일정 색. 모르는 종류면 기본 색. */
const KIND_COLOR: Record<string, string> = {
  meet: FEED_COLORS[0],
  people: FEED_COLORS[4],
  write: FEED_COLORS[3],
  read: FEED_COLORS[3],
  publish: FEED_COLORS[3],
  deep: FEED_COLORS[2],
  build: FEED_COLORS[2],
  meal: FEED_COLORS[1],
  leisure: FEED_COLORS[1],
  life: FEED_COLORS[1],
};
const SKIP_KINDS = new Set(["routine", "health"]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** 받은 id 를 우리 id 로 쓸 수 있는 모양만 남긴다. */
export function cleanSourceId(raw: unknown): string | null {
  const s = str(raw);
  if (s === null) return null;
  const id = s.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 100);
  return id === "" ? null : id;
}

function isoOr(raw: unknown, fallback: string): string {
  const s = str(raw);
  if (s === null) return fallback;
  const t = Date.parse(s);
  return Number.isNaN(t) ? fallback : new Date(t).toISOString();
}

/** 0~1 → 1~5. */
function level(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  return Math.min(5, Math.max(1, Math.round(Math.min(1, Math.max(0, n)) * 4) + 1));
}

function text(v: unknown, max: number): string | null {
  const s = str(v);
  if (s === null) return null;
  const t = s.replace(/\r\n/g, "\n").trim();
  return t === "" ? null : t.slice(0, max);
}

/** Bento 의 "HH:MM" — "24:00" 은 그날 끝(23:59). */
function bentoTime(v: unknown): string | null {
  const s = str(v);
  if (s === null) return null;
  if (s === "24:00") return "23:59";
  return cleanTime(s);
}

export function planBentoImport(bundle: unknown, now: Date = new Date()): BentoImportPlan {
  if (!isObj(bundle)) throw new LifeRuleError("가져올 내용이 없어요.");
  const list = (key: string): unknown[] => (Array.isArray(bundle[key]) ? (bundle[key] as unknown[]) : []);
  const blocks = list("blocks");
  const moods = list("moods");
  const summaries = list("summaries");
  const thoughts = list("thoughts");
  if (blocks.length + moods.length + summaries.length + thoughts.length > BENTO_IMPORT_MAX) {
    throw new LifeRuleError(`한 번에 ${BENTO_IMPORT_MAX}개까지 옮길 수 있어요.`);
  }
  const nowIso = now.toISOString();
  const plan: BentoImportPlan = {
    events: [],
    memos: [],
    days: [],
    reviews: [],
    skipped: { external: 0, task: 0, routine: 0, unscheduled: 0, invalid: 0, thoughts: 0, days: 0, reviews: 0 },
  };

  for (const raw of blocks) {
    if (!isObj(raw)) {
      plan.skipped.invalid += 1;
      continue;
    }
    const source = str(raw.source) ?? "local";
    if (source !== "local") {
      plan.skipped.external += 1;
      continue;
    }
    if (str(raw.taskId)) {
      plan.skipped.task += 1;
      continue;
    }
    const kind = str(raw.kind) ?? "";
    if (SKIP_KINDS.has(kind)) {
      plan.skipped.routine += 1;
      continue;
    }
    const start = str(raw.start) ?? "";
    const end = str(raw.end) ?? "";
    if (start === "" && end === "") {
      plan.skipped.unscheduled += 1;
      continue;
    }
    const id = cleanSourceId(raw.id);
    const startsOn = cleanDay(str(raw.date));
    if (id === null || startsOn === null) {
      plan.skipped.invalid += 1;
      continue;
    }
    const endsOn = cleanDay(str(raw.endDate)) ?? startsOn;
    const allDay = start === "00:00" && (end === "00:00" || end === "23:59" || end === "24:00");
    try {
      const fields = normalizePlanEvent({
        title: (str(raw.title) ?? "").trim() || (str(raw.customLabel) ?? "").trim() || "일정",
        startsOn,
        endsOn: endsOn < startsOn ? startsOn : endsOn,
        startTime: allDay ? null : bentoTime(start),
        endTime: allDay ? null : bentoTime(end),
        color: (str(raw.color) !== null && (FEED_COLORS as readonly string[]).includes(str(raw.color)!) ? str(raw.color) : null) ?? KIND_COLOR[kind] ?? null,
        location: str(raw.location),
        note: str(raw.notes),
      });
      plan.events.push({ ...fields, sourceId: id });
    } catch {
      plan.skipped.invalid += 1;
    }
  }

  for (const raw of thoughts) {
    if (!isObj(raw) || (str(raw.type) ?? "thought") !== "thought") {
      plan.skipped.thoughts += 1;
      continue;
    }
    const id = cleanSourceId(raw.id);
    const title = text(raw.title, 400);
    const body = text(raw.body, 3500);
    const joined = [title, body].filter((x): x is string => x !== null).join("\n");
    if (id === null || joined === "") {
      plan.skipped.thoughts += 1;
      continue;
    }
    const state = str(raw.state) ?? "inbox";
    const createdAt = isoOr(raw.createdAt, nowIso);
    plan.memos.push({
      sourceId: id,
      text: joined.slice(0, 4000),
      done: state === "done" || state === "archived" || str(raw.promotedTo) !== null,
      createdAt,
      updatedAt: isoOr(raw.updatedAt, createdAt),
    });
  }

  for (const raw of moods) {
    if (!isObj(raw)) {
      plan.skipped.days += 1;
      continue;
    }
    const date = cleanDay(str(raw.date));
    const day = {
      date: date ?? "",
      mood: level(raw.mood),
      energy: level(raw.energy),
      note: text(raw.note, 1000),
      retro: text(raw.retrospectiveNote, 8000),
    };
    if (date === null || (day.mood === null && day.energy === null && day.note === null && day.retro === null)) {
      plan.skipped.days += 1;
      continue;
    }
    plan.days.push(day);
  }

  for (const raw of summaries) {
    if (!isObj(raw)) {
      plan.skipped.reviews += 1;
      continue;
    }
    const kind = str(raw.kind) === "monthly" ? "month" : str(raw.kind) === "weekly" ? "week" : null;
    const period = str(raw.period) ?? "";
    const body = text(raw.text, 20000);
    const shapeOk = kind === "week" ? /^\d{4}-W\d{2}$/.test(period) : kind === "month" ? /^\d{4}-\d{2}$/.test(period) : false;
    if (kind === null || !shapeOk || body === null) {
      plan.skipped.reviews += 1;
      continue;
    }
    plan.reviews.push({ kind, period, text: body, createdAt: isoOr(raw.generatedAt, nowIso) });
  }

  return plan;
}
