import { canWrite } from "@nyanotion/auth";
import { AiBusyError, buildPrompt, isAiTask, streamCompletion } from "@nyanotion/ai";
import { requireViewer } from "@/lib/session";
import { take, tooManyRequests } from "@/lib/rate-limit";

/**
 * 냥이가 글자를 흘려보내는 길. **LLM 호출은 `packages/ai` 게이트웨이만 통과한다** —
 * 여기서 Ollama 를 직접 부르지 않는다.
 *
 * 문서에 쓰는 일이므로 읽기 권한으로는 부족하다 — `canWrite` 를 본다.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const viewer = await requireViewer();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  const verdict = take("write", viewer.userId);
  if (!verdict.ok) return tooManyRequests(verdict, "냥이 부르기");

  const input = body as { task?: unknown; selection?: unknown; context?: unknown; documentId?: unknown };
  if (!isAiTask(input.task)) return Response.json({ error: "모르는 작업입니다" }, { status: 400 });
  if (typeof input.selection !== "string" || input.selection.trim() === "") {
    return Response.json({ error: "글이 비어 있습니다" }, { status: 400 });
  }
  if (typeof input.documentId !== "string") {
    return Response.json({ error: "문서를 알 수 없습니다" }, { status: 400 });
  }
  if (!(await canWrite(viewer.userId, input.documentId))) {
    return Response.json({ error: "이 문서를 고칠 수 없습니다" }, { status: 404 });
  }

  const plan = buildPrompt(
    input.task,
    input.selection,
    typeof input.context === "string" ? input.context : undefined,
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        for await (const chunk of streamCompletion(plan.prompt, {
          system: plan.system,
          temperature: plan.temperature,
          maxTokens: plan.maxTokens,
          signal: request.signal,
        })) {
          send("chunk", { text: chunk.text });
        }
        send("done", {});
      } catch (error) {
        if (error instanceof AiBusyError) {
          send("busy", { kind: error.reason.kind, message: error.message });
        } else {
          send("busy", { kind: "unreachable", message: "냥이를 부르지 못했습니다." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
