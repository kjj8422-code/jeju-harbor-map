// 법령·고시 페이지 자동 변경 감시 스크립트
//
// 하는 일:
//   1. sources.json에 적힌 페이지들을 하나씩 가져온다
//   2. 매번 바뀌는 부분(오늘 날짜, 세션 토큰, 조회수 등)을 걷어낸 뒤 지문(해시)을 만든다
//   3. 어제 지문과 비교해서 달라졌으면 "변경됨"으로 표시하고, 어디가 달라졌는지 요약한다
//   4. 결과를 status.json에 쓰고, 변경이 있으면 issue-body.md를 만든다
//      (GitHub Actions가 이 파일을 읽어 이슈를 자동 생성한다)
//
// 주의: 이 스크립트는 "법이 바뀌었는지 사람에게 알려주는" 역할만 합니다.
// 법 해석과 사이트 내용 수정은 반드시 사람이 확인하고 반영해야 합니다.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = join(HERE, "snapshots");
const STATUS_PATH = join(HERE, "status.json");
const ISSUE_BODY_PATH = join(HERE, "issue-body.md");
const FETCH_TIMEOUT_MS = 25000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const todayKst = () => {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST
  return now.toISOString().slice(0, 10);
};

// 매번 달라지는 값(오늘/어제 날짜, 세션 토큰, 조회수 등)을 제거해
// "내용이 진짜 바뀐 경우"에만 지문이 달라지게 만든다.
const normalize = (html) => {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const volatileDates = [];
  for (let offset = -1; offset <= 1; offset++) {
    const d = new Date(now.getTime() + offset * 86400000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    volatileDates.push(`${y}-${m}-${day}`, `${y}.${m}.${day}`, `${y}${m}${day}`, `${y}/${m}/${day}`);
  }

  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');

  for (const d of volatileDates) {
    text = text.split(d).join("[DATE]");
  }

  return text
    .replace(/\d{2}:\d{2}(:\d{2})?/g, "[TIME]") // 시:분(:초)
    .replace(/\b\d{10,}\b/g, "[ID]") // 타임스탬프·일련번호처럼 긴 숫자
    .replace(/(jsessionid|csrf[a-z]*|_csrf|token)=[^&\s"']+/gi, "$1=[TOKEN]")
    .replace(/조회\s*\d+/g, "조회 [N]")
    .replace(/\((\d{3,})\)/g, "([N])") // 게시판 카테고리 글 개수: 행정 (4886) → 행정 ([N])
    .replace(/[ \t\r\f\v]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
};

// 보도자료·공고처럼 매일 새 글이 올라오는 목록 페이지는 전체를 비교하면 매일 알림이 울린다.
// keywords가 지정된 경우, 그 단어가 들어간 줄만 남겨서 "우리와 관련된 변화"만 감시한다.
const filterByKeywords = (text, keywords) => {
  if (!keywords || !keywords.length) return text;
  return text
    .split("\n")
    .filter((line) => keywords.some((k) => line.includes(k)))
    .join("\n");
};

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

const fetchText = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
};

// 줄 단위로 "새로 생긴 줄 / 없어진 줄"만 뽑아 사람이 읽기 쉽게 요약한다.
const summarizeDiff = (oldText, newText, maxLines = 25) => {
  const oldLines = new Set(oldText.split("\n"));
  const newLines = new Set(newText.split("\n"));
  const added = [...newLines].filter((l) => !oldLines.has(l) && l.length > 5);
  const removed = [...oldLines].filter((l) => !newLines.has(l) && l.length > 5);
  const clip = (arr) =>
    arr.slice(0, maxLines).map((l) => (l.length > 300 ? l.slice(0, 300) + "…" : l));
  return { added: clip(added), removed: clip(removed), addedTotal: added.length, removedTotal: removed.length };
};

const loadJson = (path, fallback) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
};

const main = async () => {
  const { sources } = loadJson(join(HERE, "sources.json"), { sources: [] });
  const previous = loadJson(STATUS_PATH, { sources: {} });
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const checkedAt = todayKst();
  const status = { checkedAt, sources: {} };
  const changedReports = [];
  const errorReports = [];

  for (const src of sources) {
    const prev = previous.sources?.[src.id] ?? {};
    const snapshotPath = join(SNAPSHOT_DIR, `${src.id}.txt`);
    let entry;

    try {
      const html = await fetchText(src.url);
      const text = filterByKeywords(normalize(html), src.keywords);
      const hash = sha256(text);
      const prevText = existsSync(snapshotPath) ? readFileSync(snapshotPath, "utf8") : null;
      const isFirstRun = !prev.hash;
      const changed = !isFirstRun && prev.hash !== hash;

      if (changed && prevText) {
        const diff = summarizeDiff(prevText, text);
        changedReports.push({ src, diff, prevCheckedAt: prev.lastCheckedAt ?? "(기록 없음)" });
      }

      writeFileSync(snapshotPath, text, "utf8");

      entry = {
        label: src.label,
        url: src.url,
        affects: src.affects ?? "",
        priority: src.priority ?? "medium",
        status: isFirstRun ? "first-run" : changed ? "changed" : "ok",
        hash,
        length: text.length,
        lastCheckedAt: checkedAt,
        lastChangedAt: changed ? checkedAt : prev.lastChangedAt ?? null,
        failCount: 0,
      };
    } catch (err) {
      const failCount = (prev.failCount ?? 0) + 1;
      entry = {
        label: src.label,
        url: src.url,
        affects: src.affects ?? "",
        priority: src.priority ?? "medium",
        status: "error",
        hash: prev.hash ?? null,
        length: prev.length ?? 0,
        lastCheckedAt: checkedAt,
        lastChangedAt: prev.lastChangedAt ?? null,
        failCount,
        error: String(err && err.message ? err.message : err),
      };
      // 하루 이틀 실패는 서버 점검일 수 있으니, 3일 연속 실패했을 때만 사람을 부른다.
      if (failCount >= 3) errorReports.push({ src, failCount, error: entry.error });
    }

    status.sources[src.id] = entry;
  }

  writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2) + "\n", "utf8");

  const needsAttention = changedReports.length > 0 || errorReports.length > 0;
  if (needsAttention) {
    const lines = [];
    lines.push(`## 자동 점검 결과 (${checkedAt} KST)`, "");

    if (changedReports.length) {
      lines.push(`### 🔴 내용이 바뀐 페이지 ${changedReports.length}건 — 사이트 반영이 필요한지 확인해주세요`, "");
      for (const { src, diff, prevCheckedAt } of changedReports) {
        lines.push(`#### ${src.label}`);
        lines.push(`- 원문: ${src.url}`);
        lines.push(`- 이 내용이 영향을 주는 곳: **${src.affects ?? "미지정"}**`);
        lines.push(`- 직전 점검일: ${prevCheckedAt}`);
        lines.push("");
        if (diff.addedTotal) {
          lines.push(`**새로 생긴 문구 (${diff.addedTotal}줄 중 일부)**`, "```");
          lines.push(...diff.added, "```", "");
        }
        if (diff.removedTotal) {
          lines.push(`**없어진 문구 (${diff.removedTotal}줄 중 일부)**`, "```");
          lines.push(...diff.removed, "```", "");
        }
      }
    }

    if (errorReports.length) {
      lines.push(`### ⚠️ 3일 이상 확인 실패 ${errorReports.length}건 — 주소가 바뀌었을 수 있어요`, "");
      for (const { src, failCount, error } of errorReports) {
        lines.push(`- **${src.label}** (${failCount}일째 실패): ${error}`);
        lines.push(`  - ${src.url}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push(
      "이 이슈는 자동으로 만들어졌습니다. 변경 내용을 확인한 뒤, 사이트 반영이 필요하면 `index.html`의 해당 데이터와 `LAW_CHANGES`(변경 이력)를 함께 수정해주세요. 반영이 끝나면 이 이슈를 닫으면 됩니다."
    );
    writeFileSync(ISSUE_BODY_PATH, lines.join("\n"), "utf8");
  }

  const summary = Object.values(status.sources)
    .map((s) => `${s.status.padEnd(9)} ${s.label}`)
    .join("\n");
  console.log(`점검일: ${checkedAt}\n${summary}`);
  console.log(`needs_attention=${needsAttention}`);

  // GitHub Actions 출력 변수로 전달
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `needs_attention=${needsAttention}\n`, { flag: "a" });
  }
};

main().catch((err) => {
  console.error("점검 스크립트 자체가 실패했습니다:", err);
  process.exit(1);
});
