/**
 * 동기화 서버(apps/collab)에 붙을 때 쓰는 짧은 표.
 *
 * WebSocket 은 Next 의 세션을 거치지 않으니 뭔가를 들려 보내야 하는데,
 * **세션 토큰을 그대로 클라이언트 JS 에 내보내지 않는다** — 그건 쿠키의 httpOnly 를 스스로 버리는 일이다.
 * 대신 문서 하나, 몇십 초짜리로 범위를 좁힌 표를 서명해서 준다. 새 나가도 그 문서에 그 잠깐뿐이다.
 *
 * Web Crypto 만 쓴다 (`node:crypto` 아님) — 이 패키지는 브라우저 번들에도 들어간다.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 표의 기본 수명. 붙는 순간에만 필요하므로 짧게 둔다. */
export const COLLAB_TICKET_TTL_MS = 60_000;

type Payload = { u: string; d: string; e: number };

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** ArrayBuffer 를 직접 잡는다 — 그래야 Web Crypto 의 BufferSource 로 그대로 넘어간다. */
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** TextEncoder 의 결과도 같은 이유로 ArrayBuffer 위에 올려 준다. */
function utf8(value: string): Uint8Array<ArrayBuffer> {
  const source = encoder.encode(value);
  const bytes = new Uint8Array(new ArrayBuffer(source.byteLength));
  bytes.set(source);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    utf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signCollabTicket(
  secret: string,
  input: { userId: string; documentId: string; ttlMs?: number },
): Promise<string> {
  const payload: Payload = {
    u: input.userId,
    d: input.documentId,
    e: Date.now() + (input.ttlMs ?? COLLAB_TICKET_TTL_MS),
  };
  const body = toBase64Url(utf8(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), utf8(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** 서명과 만료를 확인한다. 어느 하나라도 어긋나면 null — 이유를 구분해 알려주지 않는다. */
export async function verifyCollabTicket(
  secret: string,
  ticket: string,
): Promise<{ userId: string; documentId: string } | null> {
  const dot = ticket.indexOf(".");
  if (dot <= 0) return null;
  const body = ticket.slice(0, dot);
  const signature = fromBase64Url(ticket.slice(dot + 1));
  if (signature === null) return null;

  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature,
    utf8(body),
  );
  if (!ok) return null;

  const raw = fromBase64Url(body);
  if (raw === null) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(decoder.decode(raw));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const { u, d, e } = payload as Partial<Payload>;
  if (typeof u !== "string" || typeof d !== "string" || typeof e !== "number") return null;
  if (Date.now() > e) return null;
  return { userId: u, documentId: d };
}
