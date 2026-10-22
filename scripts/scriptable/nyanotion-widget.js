// 냥노션 — 오늘·밀린 할 일 위젯 (Scriptable, iOS)
//
// 처음 한 번: Scriptable 앱에서 이 스크립트를 그냥 실행하면 서버 주소와 개인 토큰(nyt_…)을 묻는다.
// 둘 다 iOS 키체인에 저장되고 스크립트 파일에는 남지 않는다. 바꾸려면 앱에서 다시 실행.
// 그다음 홈 화면 → 위젯 추가 → Scriptable → 이 스크립트 고르기. 소·중·대 크기 전부 된다.
//
// 위젯에서 체크는 못 한다 (Scriptable 위젯은 단추를 못 단다). 줄을 누르면 그 체크리스트가 열린다.

const KEY_URL = "nyanotion.server";
const KEY_TOKEN = "nyanotion.token";

async function setup() {
  const alert = new Alert();
  alert.title = "냥노션 연결";
  alert.message = "서버 주소와 개인 토큰(내 계정 → 개인 토큰)을 넣어 주세요.";
  alert.addTextField("https://nyanotion.example.com", Keychain.contains(KEY_URL) ? Keychain.get(KEY_URL) : "");
  alert.addSecureTextField("nyt_…", "");
  alert.addAction("저장");
  alert.addCancelAction("취소");
  if ((await alert.present()) === -1) return false;
  const server = alert.textFieldValue(0).trim().replace(/\/+$/, "");
  const token = alert.textFieldValue(1).trim();
  if (server !== "") Keychain.set(KEY_URL, server);
  if (token !== "") Keychain.set(KEY_TOKEN, token);
  return Keychain.contains(KEY_URL) && Keychain.contains(KEY_TOKEN);
}

async function load(limit) {
  const request = new Request(`${Keychain.get(KEY_URL)}/api/sync/agenda?limit=${limit}`);
  request.headers = { Authorization: `Bearer ${Keychain.get(KEY_TOKEN)}` };
  request.timeoutInterval = 15;
  const body = await request.loadJSON();
  if (request.response.statusCode !== 200) throw new Error(body.error ?? `HTTP ${request.response.statusCode}`);
  return body;
}

const colors = {
  bg: Color.dynamic(new Color("#fbf8f3"), new Color("#1f1d1a")),
  text: Color.dynamic(new Color("#2b2723"), new Color("#ece6dd")),
  dim: Color.dynamic(new Color("#8a8178"), new Color("#9a9188")),
  late: Color.dynamic(new Color("#c2410c"), new Color("#fb923c")),
};

function rowsFor(family) {
  if (family === "large") return 9;
  if (family === "medium") return 4;
  return 3;
}

function build(data, family) {
  const server = Keychain.get(KEY_URL);
  const widget = new ListWidget();
  widget.backgroundColor = colors.bg;
  widget.setPadding(14, 14, 12, 14);
  widget.url = `${server}/`;
  // 위젯은 iOS 가 정한 때에만 다시 그린다. 이건 "이보다 이르게는 안 해도 된다"는 힌트일 뿐.
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const head = widget.addStack();
  head.centerAlignContent();
  const title = head.addText("🐱 오늘 할 일");
  title.font = Font.boldSystemFont(13);
  title.textColor = colors.text;
  head.addSpacer();
  const count = head.addText(String(data.items.length));
  count.font = Font.boldSystemFont(13);
  count.textColor = data.items.some((item) => item.late) ? colors.late : colors.dim;
  widget.addSpacer(8);

  if (data.items.length === 0) {
    const empty = widget.addText("다 했어요 ✨");
    empty.font = Font.systemFont(13);
    empty.textColor = colors.dim;
    widget.addSpacer();
    return widget;
  }

  const shown = data.items.slice(0, rowsFor(family));
  for (const item of shown) {
    const row = widget.addStack();
    row.url = `${server}${item.url}`;
    row.centerAlignContent();
    const text = row.addText(`○ ${item.title}`);
    text.font = Font.systemFont(family === "small" ? 12 : 13);
    text.textColor = colors.text;
    text.lineLimit = 1;
    if (family !== "small") {
      row.addSpacer();
      const when = row.addText(item.dueTime ? `${item.label} ${item.dueTime}` : item.label);
      when.font = Font.systemFont(11);
      when.textColor = item.late ? colors.late : colors.dim;
    }
    widget.addSpacer(5);
  }
  if (data.items.length > shown.length) {
    const more = widget.addText(`+${data.items.length - shown.length}개 더`);
    more.font = Font.systemFont(11);
    more.textColor = colors.dim;
  }
  widget.addSpacer();
  return widget;
}

function failure(message) {
  const widget = new ListWidget();
  widget.backgroundColor = colors.bg;
  const text = widget.addText(`냥노션에 닿지 못했어요\n${message}`);
  text.font = Font.systemFont(12);
  text.textColor = colors.dim;
  return widget;
}

if (config.runsInApp) {
  // 앱에서 실행 = 설정. 끝나면 중간 크기로 미리 보여 준다.
  if (await setup()) {
    try {
      await build(await load(30), "medium").presentMedium();
    } catch (error) {
      await failure(error.message).presentMedium();
    }
  }
} else {
  const family = config.widgetFamily ?? "medium";
  let widget;
  if (!Keychain.contains(KEY_URL) || !Keychain.contains(KEY_TOKEN)) {
    widget = failure("Scriptable 앱에서 이 스크립트를 한 번 실행해 연결하세요.");
  } else {
    try {
      widget = build(await load(30), family);
    } catch (error) {
      widget = failure(error.message);
    }
  }
  Script.setWidget(widget);
}
Script.complete();
