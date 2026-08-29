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

/* 정규 호스트 — joygolive.com 이 메인이고 pages.dev 로 온 것은 그리로 넘긴다.
 *
 * **미리보기 배포는 건드리지 않는다.** Pages 는 배포마다
 * `<해시>.joygolive.pages.dev` 를 주는데, 그것까지 넘기면 올리기 전에 확인할
 * 방법이 없어진다. 그래서 와일드카드가 아니라 **프로덕션 호스트 하나**만 본다.
 *
 * **302 다.** 301 은 브라우저가 오래 캐시해서, 되돌려야 할 때 이미 한 번 온
 * 사람에게는 되돌릴 수가 없다. 자리를 잡은 뒤에 301 로 올린다.
 *
 * ⚠️ 순서: `joygolive.com` 이 Pages 커스텀 도메인으로 **붙은 뒤에** 배포한다.
 * 붙기 전에 켜면 pages.dev 는 없는 주소로 보내고 자기는 안 열어 사이트가
 * 통째로 막힌다.
 */
const CANONICAL_HOST = 'joygolive.com';
const LEGACY_HOST = 'joygolive.pages.dev';

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  if (!ALLOW.test(url.pathname) && BLOCKED.some((re) => re.test(url.pathname))) {
    // 막을 경로는 호스트와 무관하게 먼저 막는다 — 리다이렉트로 넘기면 그 경로가
    // Location 헤더에 그대로 실려 「거기 뭔가 있다」를 알려 주는 셈이 된다.
    return new Response('Not found', { status: 404 });
  }
  if (url.hostname === LEGACY_HOST) {
    url.hostname = CANONICAL_HOST;
    return Response.redirect(url.toString(), 302);
  }
  return ctx.next();
}
