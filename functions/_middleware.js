/* 정적 자산 관문.
 *
 * `.assetsignore` 는 **믿을 것이 못 된다.** 2026-08-28 확인 — schema.sql ·
 * wrangler.toml · IDEAS-SETUP.md 가 거기 적혀 있는데도 그대로 배포돼 공개로
 * 나오고 있었다. IDEAS-SETUP.md 에는 계정 메일과 Cloudflare 계정 ID · D1 ID 가
 * 적혀 있으므로 그냥 둘 수 없다.
 *
 * 그래서 **막는 일을 파일 목록이 아니라 코드가 한다.** 배포에 무엇이 딸려
 * 올라가든, 여기를 지나지 못하면 밖에서 못 읽는다. 안 올리는 것과 못 읽게 하는
 * 것 중 하나만 골라야 한다면 후자가 확실하다 — 전자는 조용히 실패하고,
 * 조용히 실패하는 방어는 방어가 아니다.
 *
 * 지우는 것이 아니라 **없는 척한다**(404). 403 을 주면 「여기 뭔가 있다」를
 * 알려 주는 셈이라 오히려 찾아보라는 말이 된다.
 */
const BLOCKED = [
  /(^|\/)\.[^/]/,                      // 점으로 시작하는 것 전부 (.gitignore · .secrets.local …)
  /\.(sql|toml|md|ya?ml|lock|log|sh|env|bak)$/i,
  /^\/(migrations|node_modules)(\/|$)/i,
];
// 인증서 발급·소유 확인이 쓰는 자리. 점으로 시작하지만 이건 열려 있어야 한다.
const ALLOW = /^\/\.well-known\//;

export async function onRequest(ctx) {
  const p = new URL(ctx.request.url).pathname;
  if (!ALLOW.test(p) && BLOCKED.some((re) => re.test(p))) {
    return new Response('Not found', { status: 404 });
  }
  return ctx.next();
}
