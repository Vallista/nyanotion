import { readableDocumentIds } from "@nyanotion/auth";
import {
  AiBusyError,
  buildAnswerPrompt,
  embedQueryOrNull,
  NO_PASSAGES,
  streamCompletion,
} from "@nyanotion/ai";
import { retrievePassages } from "@nyanotion/db";
import { requireViewer } from "@/lib/session";
import { take, tooManyRequests } from "@/lib/rate-limit";

/**
 * 문서에 물어보기. **근거를 먼저 보내고 답을 흘려보낸다.**
 *
 * 순서가 중요하다 — 답보다 근거가 먼저 화면에 뜨면, 사람은 답을 기다리는 동안 어느 문서에서
 * 나온 이야기인지 이미 알 수 있다. 답이 틀렸을 때 바로 문서로 갈 수도 있다.
 *
 * **권한은 `readableDocumentIds` 하나로 끝난다.** 읽을 수 있는 문서 목록을 검색에 넘기고,
 * 그 밖의 문서는 어떤 길로도 들어오지 못한다 (`retrievePassages`). 프롬프트에 들어가는
 * 글은 전부 그 목록에서 나온 것이므로, 모델이 남의 문서를 인용할 방법이 없다.
 */
export const dynamic = "force-dynamic";

const MAX_QUESTION = 300;

/** 토막 글에서 맥락용 머리말을 떼고 한 줄로 만든다. */
function excerptOf(text: string, title: string, heading: string): string {
  let body = text;
  const prefix = `${title.trim()}\n\n`;
  if (title.trim() !== "" && body.startsWith(prefix)) body = body.slice(prefix.length);
  for (const head of [`# ${heading}\n`, `${heading}\n`]) {
    if (heading !== "" && body.startsWith(head)) {
      body = body.slice(head.length);
      break;
    }
  }
  return body.replace(/\s+/g, " ").trim().slice(0, 240);
}

export async function POST(request: Request): Promise<Response> {
  const viewer = await requireViewer();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }

  // 물어보기는 임베딩 + 생성이라 GPU 를 두 번 쓴다 — 한 사람이 다 먹지 않게 한다.
  const verdict = take("ask", viewer.userId);
  if (!verdict.ok) return tooManyRequests(verdict, "물어보기");

  const input = body as { question?: unknown };
  const question =
    typeof input.question === "string" ? input.question.trim().slice(0, MAX_QUESTION) : "";
  if (question === "") return Response.json({ error: "질문이 비어 있습니다" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        // 게임 중이면 임베딩이 null 로 온다 — 그때도 어휘 검색으로 답은 찾아 준다.
        const [allowed, embedding] = await Promise.all([
          readableDocumentIds(viewer.userId),
          embedQueryOrNull(question),
        ]);

        const passages = await retrievePassages({
          documentIds: [...allowed],
          query: question,
          queryEmbedding: embedding,
          limit: 6,
        });

        send("sources", {
          semantic: embedding !== null,
          passages: passages.map((passage, at) => ({
            n: at + 1,
            documentId: passage.documentId,
            documentTitle: passage.documentTitle,
            blockId: passage.blockId,
            heading: passage.heading,
            // 화면에 보여 줄 만큼만 — 본문 전체를 브라우저로 보낼 이유가 없다.
            // 토막 앞에 붙여 둔 제목·소제목은 뗀다. 임베딩에는 필요하지만 화면에서는
            // 바로 위 줄에 이미 적혀 있어 같은 말을 두 번 읽게 된다.
            excerpt: excerptOf(passage.text, passage.documentTitle, passage.heading),
          })),
        });

        if (passages.length === 0) {
          // 모델을 부르지 않는다. 근거가 없으면 지어낼 여지를 주지 않는 것이 옳다.
          send("chunk", { text: NO_PASSAGES });
          send("done", {});
          return;
        }

        const plan = buildAnswerPrompt(question, passages);
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
