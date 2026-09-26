import { isFirstUser } from "@nyanotion/db";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

/**
 * 계정이 **하나도 없으면** 첫 계정을 만들 수 있게 열어 준다.
 *
 * 가입은 초대로만 되지만, 그렇게만 두면 막 깔아 놓은 서버에 아무도 못 들어간다 —
 * 초대를 보낼 사람이 없기 때문이다. 이 자리를 여는 판단은 서버가 하고
 * (`lib/auth.ts` 의 가입 훅도 같은 조건을 다시 본다), 화면은 그 결과만 받는다.
 */
export default async function LoginPage() {
  const bootstrap = await isFirstUser();

  return (
    <Suspense fallback={null}>
      <LoginForm bootstrap={bootstrap} />
    </Suspense>
  );
}
