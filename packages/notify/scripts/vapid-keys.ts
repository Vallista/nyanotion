/**
 * VAPID 키 한 쌍을 만든다. **환경마다 다른 키를 쓴다** — 키가 바뀌면 기존 구독이 전부 죽는다.
 *
 *   pnpm --filter @nyanotion/notify keys
 *
 * 나온 값을 그 환경의 설정(.env.<환경> 또는 비밀값 폴더)에 넣으면 된다.
 * 공개키는 비밀이 아니지만(브라우저가 받아 간다) **개인키는 비밀이다.**
 */
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log(`
VAPID_PUBLIC_KEY=${keys.publicKey}
VAPID_PRIVATE_KEY=${keys.privateKey}
VAPID_SUBJECT=mailto:your@email.example

위 세 줄을 그 환경의 설정에 넣으세요.
  비밀값 폴더를 쓰면  $NYANOTION_SECRETS_DIR/<환경>.env
  아니면             .env.<환경>  (dev 는 .env)

**키를 바꾸면 이미 켜 둔 기기들의 알림이 전부 끊깁니다.** 다시 켜야 합니다.
`);
