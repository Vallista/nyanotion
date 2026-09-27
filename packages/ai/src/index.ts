export * from "./gateway";
export * from "./embed";
// 프롬프트·작업 정의는 @nyanotion/shared 에 있다 — 클라이언트 번들에도 들어가야 하므로
// 서버 전용 코드(gateway)와 같은 파일에 두면 안 된다.
export { AI_TASKS, TASK_LABELS, buildPrompt, isAiTask, type AiTask } from "@nyanotion/shared";
