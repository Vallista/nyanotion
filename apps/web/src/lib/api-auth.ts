import { effectiveRole, spacesForUser, type SpaceAccess } from "@nyanotion/auth";
import { userByApiToken } from "@nyanotion/db";
import { roleAllows, type DocumentRole } from "@nyanotion/shared";
import { NextResponse, type NextRequest } from "next/server";
import { take } from "./rate-limit";

/**
 * **앱(Bento)이 부르는 동기화 API 의 문.** 웹 화면의 `requireViewer` 와 같은 자리지만 쿠키가 아니라
 * `Authorization: Bearer nyt_…` 개인 토큰으로 사람을 정한다. 토큰이 할 수 있는 일은 `/api/sync/*` 뿐이다.
 *
 * 권한 판정은 여전히 `access.ts` 한 곳 — 토큰은 "누구인가"만 정하고, 그 사람이 그 문서를 고칠 수 있는지는
 * `effectiveRole` 이 정한다. 권한이 없으면 404 (CLAUDE.md 규칙).
 */

export type ApiViewer = {
  userId: string;
  email: string;
  name: string;
  spaces: SpaceAccess[];
  spaceIds: string[];
};

/**
 * 어느 주소의 화면이 이 API 를 부를 수 있는가 (CORS).
 * Tauri 의 웹뷰는 macOS 에서 `tauri://localhost`, 개발 중엔 Vite 의 `http://localhost:1420`.
 * 쿠키를 쓰지 않으므로(토큰) 열어 둬도 남의 세션을 빌려 쓰는 일은 생기지 않는다.
 */
function allowedOrigins(): string[] {
  const configured = (process.env.SYNC_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
  return configured.length > 0
    ? configured
    : ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost", "http://localhost:1420"];
}

export function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (origin !== null && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/** 미리 묻기(OPTIONS)에 답한다. */
export function preflight(request: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export function json(request: NextRequest, body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders(request) });
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

/** 토큰으로 그 사람을 정한다. 없거나 틀리면 401 — 레이트 리밋도 여기서. */
export async function apiViewer(request: NextRequest): Promise<ApiViewer> {
  const who =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token === "") throw new ApiError(401, "토큰이 없습니다. 내 계정에서 개인 토큰을 만드세요.");

  const found = await userByApiToken(token);
  if (found === null) {
    // 틀린 토큰으로 두드리는 것만 센다 — 맞는 토큰의 동기화를 늦추지 않게.
    const verdict = take("token", who);
    if (!verdict.ok) throw new ApiError(429, "너무 자주 틀렸습니다.", verdict.retryAfterSeconds);
    throw new ApiError(401, "쓸 수 없는 토큰입니다. 끊겼거나 계정이 막혔을 수 있어요.");
  }
  const verdict = take("sync", found.tokenId);
  if (!verdict.ok) throw new ApiError(429, "잠시 뒤에 다시 하세요.", verdict.retryAfterSeconds);

  const spaces = await spacesForUser(found.userId);
  return {
    userId: found.userId,
    email: found.email,
    name: found.name,
    spaces,
    spaceIds: spaces.map((space) => space.id),
  };
}

/** 그 문서에 그 권한이 있는가. 없으면 404 — "있긴 하다"를 알려 주지 않는다. */
export async function apiRequireDocument(
  viewer: ApiViewer,
  documentId: string | null,
  need: DocumentRole = "editor",
): Promise<void> {
  if (documentId === null) throw new ApiError(404, "찾을 수 없습니다.");
  const role = await effectiveRole(viewer.userId, documentId);
  if (role === null || !roleAllows(role, need)) throw new ApiError(404, "찾을 수 없습니다.");
}

/** 라우트 본문을 감싸 오류를 같은 모양으로 돌려준다. */
export async function handle(
  request: NextRequest,
  run: () => Promise<unknown>,
): Promise<NextResponse> {
  try {
    return json(request, await run());
  } catch (error) {
    if (error instanceof ApiError) {
      const res = json(request, { error: error.message }, error.status);
      if (error.retryAfterSeconds !== undefined) res.headers.set("Retry-After", String(error.retryAfterSeconds));
      return res;
    }
    console.error("[sync]", error);
    return json(request, { error: "서버에서 처리하지 못했습니다." }, 500);
  }
}
