"use client";

import type { AdminAccount, AdminFamily, PendingInvite } from "@nyanotion/db";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  adminCreateFamilyAction,
  adminInviteAction,
  adminPutInFamilyAction,
  adminRemoveFromFamilyAction,
  adminResetPasswordAction,
  adminRevokeInviteAction,
  adminSetDisabledAction,
} from "@/lib/admin-actions";
import { SmallButton, inputStyle } from "./checklist-item";
import { PlusIcon } from "./icons";
import { Spinner } from "./pending";

/**
 * 어드민 — **초대 · 기다리는 초대 · 계정.**
 *
 * 계정을 지우는 단추는 없다. 그 사람이 쓴 문서와 기록이 남아야 하므로 "막기"로 충분하다.
 * 임시 비밀번호는 한 번만 보여 준다 — 저장하지 않는다.
 */

type Family = AdminFamily;
type Account = AdminAccount & { admin: boolean };

const ROLE_LABEL: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  member: "member",
  guest: "손님",
};

function when(iso: string | null): string {
  if (iso === null) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ko-KR", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function useAction() {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const run = (task: () => Promise<unknown>) =>
    startTransition(async () => {
      setProblem(null);
      try {
        await task();
        router.refresh();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "하지 못했어요.");
      }
    });
  return { busy, problem, run, setProblem, startTransition, router };
}

export function AdminBoard({
  origin,
  accounts,
  invites,
  families,
  userId,
}: {
  origin: string;
  accounts: Account[];
  invites: PendingInvite[];
  families: Family[];
  userId: string;
}) {
  const active = accounts.filter((a) => a.disabledAt === null);
  const blocked = accounts.filter((a) => a.disabledAt !== null);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>
        어드민
      </h1>
      <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 28, lineHeight: 1.7 }}>
        계정을 초대하고, 막고, 비밀번호를 다시 만들어 줍니다. 공개 가입은 없어요 —{" "}
        <b style={{ fontWeight: 500 }}>여기서 만든 링크의 그 주소로만</b> 가입됩니다. 한 일은 전부
        감사 로그에 남아요.
      </p>

      <InviteForm origin={origin} families={families} />

      <FamiliesSection origin={origin} families={families} accounts={accounts} />

      {invites.length > 0 && (
        <Section title={`기다리는 초대 ${invites.length}`}>
          {invites.map((invite) => (
            <InviteRow key={`${invite.kind}:${invite.id}`} invite={invite} origin={origin} />
          ))}
        </Section>
      )}

      <Section title={`계정 ${active.length}`}>
        {active.map((account) => (
          <AccountCard key={account.id} account={account} families={families} me={userId} />
        ))}
      </Section>

      {blocked.length > 0 && (
        <Section title={`막힌 계정 ${blocked.length}`}>
          {blocked.map((account) => (
            <AccountCard key={account.id} account={account} families={families} me={userId} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <h2 style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)", marginBottom: 10 }}>
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </section>
  );
}

function Card({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <article
      style={{
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        background: "var(--card)",
        padding: "12px 14px",
        opacity: dim ? 0.75 : 1,
      }}
    >
      {children}
    </article>
  );
}

function Problem({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p role="alert" style={{ fontSize: 12.5, color: "var(--late)", marginTop: 8 }}>
      {text}
    </p>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
      <code
        style={{
          flex: "1 1 240px",
          minWidth: 0,
          fontSize: 12,
          padding: "7px 9px",
          background: "var(--surface)",
          borderRadius: "var(--radius)",
          overflowWrap: "anywhere",
        }}
      >
        {url}
      </code>
      <SmallButton
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => setCopied(true));
        }}
      >
        {copied ? "복사했어요" : "복사"}
      </SmallButton>
    </div>
  );
}

function InviteForm({ origin, families }: { origin: string; families: Family[] }) {
  const { busy, problem, setProblem, startTransition } = useAction();
  const [email, setEmail] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [role, setRole] = useState("member");
  const [made, setMade] = useState<{ email: string; url: string } | null>(null);

  function submit(): void {
    const clean = email.trim();
    if (clean === "") return;
    startTransition(async () => {
      setProblem(null);
      try {
        const { path } = await adminInviteAction({
          email: clean,
          organizationId: familyId === "" ? null : familyId,
          role,
        });
        setMade({ email: clean, url: `${origin}${path}` });
        setEmail("");
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "초대장을 만들지 못했어요.");
      }
    });
  }

  return (
    <section style={{ marginBottom: 30 }}>
      <h2 style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)", marginBottom: 10 }}>
        계정 초대
      </h2>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
          }}
          placeholder="초대할 이메일"
          aria-label="초대할 이메일"
          style={{ ...inputStyle, flex: "1 1 220px" }}
        />
        <select
          value={familyId}
          onChange={(event) => setFamilyId(event.target.value)}
          aria-label="가족"
          style={{ ...inputStyle, width: 150 }}
        >
          <option value="">가족 없이 계정만</option>
          {families.map((family) => (
            <option key={family.id} value={family.id}>
              {family.name} 가족으로
            </option>
          ))}
        </select>
        {familyId !== "" && (
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            aria-label="가족 역할"
            style={{ ...inputStyle, width: 100 }}
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
            <option value="guest">손님</option>
            {/* owner 초대는 owner 가 아직 없는 가족에만 (서버가 한 번 더 본다). */}
            {families.find((f) => f.id === familyId)?.members.every((m) => m.role !== "owner") && (
              <option value="owner">owner (첫 구성원)</option>
            )}
          </select>
        )}
        <button
          onClick={submit}
          disabled={busy || email.trim() === ""}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 34,
            padding: "0 12px",
            borderRadius: "var(--radius)",
            background: "var(--ink)",
            color: "var(--paper)",
            fontSize: 13,
            fontWeight: 500,
            opacity: !busy && email.trim() === "" ? 0.45 : 1,
          }}
          aria-busy={busy}
        >
          {busy ? <Spinner size={12} /> : <PlusIcon size={13} />}
          초대 링크 만들기
        </button>
      </div>
      <Problem text={problem} />
      {made !== null && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid var(--accent-line)",
            background: "var(--accent-soft)",
            borderRadius: "var(--radius)",
          }}
        >
          <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
            <b style={{ fontWeight: 500 }}>{made.email}</b> 에게 이 링크를 보내세요. 메일은 가지
            않아요. 14일 동안, <b style={{ fontWeight: 500 }}>그 주소로만</b> 가입됩니다.
          </p>
          <CopyLink url={made.url} />
        </div>
      )}
    </section>
  );
}

function InviteRow({ invite, origin }: { invite: PendingInvite; origin: string }) {
  const { busy, problem, run } = useAction();
  const [show, setShow] = useState(false);
  const url = `${origin}${invite.kind === "account" ? "/join/" : "/invite/"}${invite.id}`;
  return (
    <Card dim={busy}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 500, flex: "1 1 auto", minWidth: 0 }}>
          {invite.email}
        </span>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {invite.kind === "account"
            ? "계정만"
            : `${invite.familyName} 가족 · ${ROLE_LABEL[invite.role ?? "member"] ?? invite.role}`}
          {" · "}
          {when(invite.expiresAt)}까지
        </span>
        <SmallButton onClick={() => setShow((v) => !v)}>{show ? "닫기" : "링크"}</SmallButton>
        <SmallButton
          disabled={busy}
          onClick={() => {
            if (window.confirm(`${invite.email} 의 초대를 취소할까요? 링크가 더는 안 열립니다.`)) {
              run(() => adminRevokeInviteAction(invite.kind, invite.id));
            }
          }}
        >
          취소
        </SmallButton>
      </div>
      {show && <CopyLink url={url} />}
      <Problem text={problem} />
    </Card>
  );
}

function AccountCard({
  account,
  families,
  me,
}: {
  account: Account;
  families: Family[];
  me: string;
}) {
  const { busy, problem, run, setProblem, startTransition } = useAction();
  const [password, setPassword] = useState<string | null>(null);
  const [addFamily, setAddFamily] = useState("");
  const [addRole, setAddRole] = useState("member");
  const isMe = account.id === me;
  const blocked = account.disabledAt !== null;
  const notIn = families.filter((f) => !account.families.some((m) => m.organizationId === f.id));

  return (
    <Card dim={busy || blocked}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14.5, fontWeight: 500 }}>{account.name}</span>
        <span style={{ fontSize: 12.5, color: "var(--ink-3)", overflowWrap: "anywhere" }}>
          {account.email}
        </span>
        {account.admin && <Badge accent>어드민</Badge>}
        {isMe && <Badge>나</Badge>}
        {blocked && <Badge late>막힘</Badge>}
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.6 }}>
        가입 {when(account.createdAt)} · 마지막 접속 {when(account.lastSeenAt)} · 내 문서{" "}
        {account.documentCount}개{blocked && ` · 막은 때 ${when(account.disabledAt)}`}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, alignItems: "center" }}>
        {account.families.length === 0 && (
          <span style={{ fontSize: 12, color: "var(--ink-4)" }}>가족 없음</span>
        )}
        {account.families.map((family) => (
          <span
            key={family.organizationId}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              padding: "2px 4px 2px 8px",
              background: "var(--chip)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {family.name}
            <select
              value={family.role}
              disabled={busy}
              onChange={(event) =>
                run(() => adminPutInFamilyAction(account.id, family.organizationId, event.target.value))
              }
              aria-label={`${family.name} 역할`}
              style={{ fontSize: 12, background: "transparent", border: 0, color: "var(--ink-2)" }}
            >
              {Object.entries(ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              aria-label={`${family.name} 에서 빼기`}
              disabled={busy}
              onClick={() => {
                if (window.confirm(`${account.name} 을 ${family.name} 가족에서 뺄까요? 쓴 문서는 남습니다.`)) {
                  run(() => adminRemoveFromFamilyAction(account.id, family.organizationId));
                }
              }}
              style={{ padding: "0 4px", color: "var(--ink-4)" }}
            >
              ×
            </button>
          </span>
        ))}
        {notIn.length > 0 && !blocked && (
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <select
              value={addFamily}
              onChange={(event) => setAddFamily(event.target.value)}
              aria-label="넣을 가족"
              style={{ ...inputStyle, height: 28, width: 130 }}
            >
              <option value="">가족에 넣기…</option>
              {notIn.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}
                </option>
              ))}
            </select>
            {addFamily !== "" && (
              <>
                <select
                  value={addRole}
                  onChange={(event) => setAddRole(event.target.value)}
                  aria-label="역할"
                  style={{ ...inputStyle, height: 28, width: 90 }}
                >
                  {Object.entries(ROLE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <SmallButton
                  primary
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await adminPutInFamilyAction(account.id, addFamily, addRole);
                      setAddFamily("");
                    })
                  }
                >
                  넣기
                </SmallButton>
              </>
            )}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        <SmallButton
          disabled={busy}
          onClick={() => {
            if (
              !window.confirm(
                `${account.name} 의 임시 비밀번호를 만들까요? 지금 비밀번호는 더 못 쓰고, 모든 기기에서 로그아웃됩니다.`,
              )
            )
              return;
            startTransition(async () => {
              setProblem(null);
              try {
                const result = await adminResetPasswordAction(account.id);
                setPassword(result.password);
              } catch (error) {
                setProblem(error instanceof Error ? error.message : "만들지 못했어요.");
              }
            });
          }}
        >
          임시 비밀번호
        </SmallButton>
        {!isMe && !account.admin && (
          <SmallButton
            disabled={busy}
            onClick={() => {
              const message = blocked
                ? `${account.name} 을 다시 열까요?`
                : `${account.name} 을 막을까요? 모든 기기에서 바로 로그아웃되고 다시 로그인할 수 없습니다. 문서는 남아요.`;
              if (window.confirm(message)) run(() => adminSetDisabledAction(account.id, !blocked));
            }}
          >
            {blocked ? "다시 열기" : "막기"}
          </SmallButton>
        )}
      </div>

      {password !== null && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            background: "var(--surface)",
            borderRadius: "var(--radius)",
            fontSize: 12.5,
            color: "var(--ink-2)",
            lineHeight: 1.6,
          }}
        >
          임시 비밀번호 — <b style={{ fontWeight: 500 }}>지금 한 번만</b> 보여 드려요. 전해 주고,
          로그인한 뒤 바꾸라고 해 주세요.
          <CopyLink url={password} />
        </div>
      )}
      <Problem text={problem} />
    </Card>
  );
}

function Badge({
  children,
  accent = false,
  late = false,
}: {
  children: React.ReactNode;
  accent?: boolean;
  late?: boolean;
}) {
  return (
    <span
      style={{
        fontSize: 11.5,
        color: late ? "var(--late)" : accent ? "var(--accent)" : "var(--ink-3)",
        background: accent ? "var(--accent-soft)" : "var(--chip)",
        borderRadius: "var(--radius-sm)",
        padding: "1px 6px",
      }}
    >
      {children}
    </span>
  );
}

/**
 * 가족 — **만들면서 첫 구성원(owner)을 정한다.** 이미 계정이 있는 주소면 바로 owner,
 * 없으면 owner 초대 링크가 나온다. owner 가 없는 가족은 짚어 준다.
 */
function FamiliesSection({
  origin,
  families,
  accounts,
}: {
  origin: string;
  families: Family[];
  accounts: Account[];
}) {
  const { busy, problem, setProblem, startTransition, router } = useAction();
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [made, setMade] = useState<{ name: string; email: string; url: string | null } | null>(null);
  const known = accounts.some((a) => a.email.toLowerCase() === ownerEmail.trim().toLowerCase());

  function submit(): void {
    if (name.trim() === "" || ownerEmail.trim() === "") return;
    startTransition(async () => {
      setProblem(null);
      try {
        const result = await adminCreateFamilyAction({ name, ownerEmail });
        setMade({
          name: name.trim(),
          email: ownerEmail.trim(),
          url: result.path === null ? null : `${origin}${result.path}`,
        });
        setName("");
        setOwnerEmail("");
        router.refresh();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "만들지 못했어요.");
      }
    });
  }

  return (
    <section style={{ marginBottom: 30 }}>
      <h2 style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)", marginBottom: 10 }}>
        가족 {families.length}
      </h2>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="새 가족 이름"
          aria-label="새 가족 이름"
          style={{ ...inputStyle, flex: "1 1 140px" }}
        />
        <input
          type="email"
          list="admin-account-emails"
          value={ownerEmail}
          onChange={(event) => setOwnerEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
          }}
          placeholder="첫 구성원(owner) 이메일"
          aria-label="첫 구성원 이메일"
          style={{ ...inputStyle, flex: "1 1 220px" }}
        />
        <datalist id="admin-account-emails">
          {accounts
            .filter((a) => a.disabledAt === null)
            .map((a) => (
              <option key={a.id} value={a.email}>
                {a.name}
              </option>
            ))}
        </datalist>
        <button
          onClick={submit}
          disabled={busy || name.trim() === "" || ownerEmail.trim() === ""}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 34,
            padding: "0 12px",
            borderRadius: "var(--radius)",
            background: "var(--ink)",
            color: "var(--paper)",
            fontSize: 13,
            fontWeight: 500,
            opacity: !busy && (name.trim() === "" || ownerEmail.trim() === "") ? 0.45 : 1,
          }}
          aria-busy={busy}
        >
          {busy ? <Spinner size={12} /> : <PlusIcon size={13} />}
          가족 만들기
        </button>
      </div>
      {ownerEmail.trim() !== "" && (
        <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
          {known
            ? "이미 있는 계정이라 바로 owner 가 됩니다."
            : "아직 계정이 없어요 — owner 초대 링크를 만들어 드려요. 그 링크로 가입하면 owner 로 들어옵니다."}
        </p>
      )}
      <Problem text={problem} />
      {made !== null && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid var(--accent-line)",
            background: "var(--accent-soft)",
            borderRadius: "var(--radius)",
            fontSize: 13,
            color: "var(--ink-2)",
            lineHeight: 1.6,
          }}
        >
          {made.url === null ? (
            <>
              <b style={{ fontWeight: 500 }}>{made.name}</b> 가족을 만들고 {made.email} 을 owner 로
              두었어요. 이제 그 사람이 가족 화면에서 다른 가족을 초대할 수 있어요.
            </>
          ) : (
            <>
              <b style={{ fontWeight: 500 }}>{made.name}</b> 가족을 만들었어요. {made.email} 에게 이
              링크를 보내세요 — 가입하면 owner 로 들어옵니다.
              <CopyLink url={made.url} />
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {families.map((family) => {
          const owners = family.members.filter((m) => m.role === "owner");
          return (
            <Card key={family.id}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14.5, fontWeight: 500 }}>{family.name}</span>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {family.members.length}명 · 만든 때 {when(family.createdAt)}
                </span>
                {owners.length === 0 && <Badge late>owner 없음 — 첫 구성원 초대를 기다려요</Badge>}
              </div>
              {family.members.length > 0 && (
                <p style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.7 }}>
                  {family.members.map((m, i) => (
                    <span key={m.userId}>
                      {i > 0 && " · "}
                      {m.name}
                      <span style={{ color: "var(--ink-4)" }}> {ROLE_LABEL[m.role] ?? m.role}</span>
                    </span>
                  ))}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
