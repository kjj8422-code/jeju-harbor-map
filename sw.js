// 제주 어항 해도 — 오프라인 캐시용 서비스워커
// 이 페이지 자체(위치·법령·금어기 데이터)는 정적 콘텐츠라 캐시 후 오프라인에서도 열립니다.
// 구글 폰트 등 외부 리소스는 오프라인일 때 생략되고 대체 글꼴로 표시됩니다.
//
// 캐시 전략: "네트워크 우선, 실패 시에만 캐시" (network-first, fallback to cache).
// 예전 버전(캐시 우선 + 백그라운드 갱신)은 온라인 상태에서도 옛날 버전을 먼저 보여주고
// 새 버전은 "다음번 방문 때"에야 반영되는 문제가 있었음 — 그래서 배포 직후 사용자가
// 새로고침해도 계속 이전 화면이 보이는 원인이 됐음. 지금 방식은 온라인이면 항상 최신을
// 받아오고, 인터넷이 안 될 때만 저장된 버전으로 대체함(오프라인 기능은 그대로 유지).
const CACHE = "jeju-harbor-map-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin (fonts) pass through untouched

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request)) // 오프라인일 때만 저장된 버전 사용
  );
});
