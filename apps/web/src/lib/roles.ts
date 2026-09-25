/** 가족 역할을 화면 문구로. 스키마는 영어, 보이는 건 한국어. */
export function familyRoleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "가장";
    case "admin":
      return "관리";
    case "member":
      return "식구";
    case "guest":
      return "손님";
    default:
      return role;
  }
}

/** 문서 권한을 화면 문구로. */
export function documentRoleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "주인";
    case "editor":
      return "편집";
    case "commenter":
      return "댓글";
    case "viewer":
      return "보기";
    default:
      return role;
  }
}
