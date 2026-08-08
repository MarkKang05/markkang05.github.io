---
title: 필드 매핑
description: 제목·완료·일정·우선순위·태그·하위작업·반복이 두 시스템 사이에서 어떻게 대응되는가.
created: 2026-07-19
maturity: growing
publish: true
---
← [[todoist-sync|Todoist 동기화]]

각 필드가 두 시스템 사이에서 어떻게 대응되는지, 구현상 주의점까지 정리한다.

## 요약표

| TaskNotes | Todoist | 방향 | 비고 |
|---|---|---|---|
| 파일명 (제목) | `content` | ↔ | `title` 필드 안 씀. 제목변경=파일 rename |
| `status`=done | `checked`(완료) | ↔ | `completedDate` ↔ `completed_at` |
| `status`=open | **Open** 섹션 | ↔ | `status_sections` 설정 |
| `status`=in-progress | **In-progress** 섹션 | ↔ | 〃 |
| `scheduled` | `due`(date/datetime) | ↔ | `todoist_due_to: scheduled` |
| `due`(마감) | `deadline` | ✗ | 유료 전용 → 로컬 전용 |
| `timeEstimate`(분) | `duration`{amount,unit} | ↔ | 시간지정 태스크만 |
| `priority` | `priority`(1~4) | ↔ | none/low/normal/high |
| `tags`(task 제외) | `labels` | ↔ | 전부 라벨로 취급 |
| `projects[0]`=노트 | 라벨 `프로젝트/…` | ↔ | 공백→`_` |
| `projects[0]`=태스크 | `parent_id`(하위작업) | ↔ | 부모가 active 여야 |
| `recurrence`(RRULE) | `due.string`(반복) | ↔(느슨) | 날짜/완료는 각자 |
| (노트 링크) | `description` 댓글 | → | `obsidian://` 딥링크 |

---

## 1. 제목 ↔ content
- TaskNotes 는 `storeTitleInFilename: true` → **제목 = 파일명**. `title` frontmatter 는 안 쓴다.
  (기존 파일의 `title` 필드는 일괄 제거함.)
- Todoist 에서 제목이 바뀌면 → **TN 파일 이름을 rename**(제목 필드 추가가 아니라).
- 신규 TN 생성 시 파일명 = 제목, 금지문자(`\/:*?"<>|#^[]`) 제거, 충돌 시 ` (2)` 접미.

## 2. 완료(done) ↔ 완료 체크
- TN `status` 가 완료 status(`isCompleted:true`, 기본 `done`) → Todoist `item_complete`(체크).
- Todoist 체크됨 → TN `status = done` + `completedDate = completed_at` 날짜.
- **완료된 TN 태스크는 Todoist 에 새로 만들지 않는다**(완료 로그 오염 방지). 역방향도 마찬가지.
- 완료 태스크는 Todoist 목록에서 사라짐(체크 = 아카이브). 그래서 "Done 섹션"은 쓰지 않는다.

## 3. 상태(open/in-progress) ↔ 섹션  ★
- Todoist 에 미리 만든 **섹션**(Inbox 의 `Open`, `In-progress`)에 태스크를 배치.
- `status_sections: { open: "Open", "in-progress": "In-progress" }` 매핑.
- 양방향: TN 에서 in-progress 로 바꾸면 Todoist In-progress 섹션으로 이동. 반대도.
- canonical 의 `stage` 필드로 비교(완료 태스크는 `stage=None` 제외).
- 하위작업(부모 있음)은 섹션 지정 안 함(Todoist 하위작업은 부모에 종속).
- **섹션 캐시가 비면 1회 full sync 로 채운다**(증분 sync 는 기존 섹션을 안 주므로).

## 4. 일정 ↔ due / 마감 ↔ deadline
- **Todoist `due` ↔ TaskNotes `scheduled`** (설정 `todoist_due_to: scheduled`).
  - Todoist `due` 는 "언제" → TaskNotes 의 `scheduled`("할 시점")와 의미가 맞음.
  - 날짜(`2026-07-20`)와 시간(`2026-07-20T09:00`) 모두 지원. tz 는 로컬로 정규화.
- **`due`(마감) ↔ Todoist `deadline` 은 무료 플랜에서 비활성**(`todoist_deadline_to: none`).
  deadline 은 Todoist 유료 기능이라, 무료면 TN `due` 는 **동기화 안 되고 로컬 전용**으로 남는다.
  (코드도 premium 오류 감지 시 자동으로 deadline 을 뺀다.)

## 5. 소요시간 ↔ duration
- TaskNotes `timeEstimate`(분) ↔ Todoist `duration` `{amount, unit}`.
- **시간이 지정된(due datetime) 태스크에만** duration 설정 가능(Todoist 규칙).
- 예: Todoist 에서 1시간 = `{amount:60, unit:"minute"}` ↔ TN `timeEstimate: 60`.
- (이 매핑이 없던 초기엔 Todoist 60분인데 TN 은 캘린더 기본 30분 블록으로 떠서 어긋났었음.)

## 6. 우선순위
- TaskNotes: `none / low / normal / high` (medium 없음!).
- Todoist: `1`(없음/기본) ~ `4`(긴급, UI 의 P1).
- 매핑(기본, medium 절대 생성 안 함):
  - `priority_td_to_tn: { 4: high, 3: normal, 2: low, 1: normal }`
  - `priority_tn_to_td: { high: 4, normal: 1, low: 2, none: 1 }`
- **normal ↔ 1** 로 맞춰 기본 태스크에 불필요한 우선순위 노이즈가 안 생기게 함.
- ⚠️ 초기 버그: `3→medium` 이었는데 TaskNotes 엔 medium 이 없어 오염됨 → `3→normal` 로 수정.

## 7. 태그 ↔ 라벨
- TN `tags`(단, 식별용 `task` 태그는 제외) ↔ Todoist `labels`.
- **TN 의 모든 태그를 라벨로 취급**(조직용 태그와 라벨을 구분하지 않음).

## 8. 프로젝트 ↔ 라벨  (Todoist 프로젝트는 만들지 않음)
- TN `projects[0]` 이 **일반 노트**를 가리키면 → Todoist **라벨** `프로젝트/<이름>`.
- Todoist 라벨은 공백 미지원 → **공백을 `_` 로 치환/복원**.
  예) `신규 서비스 검토` → 라벨 `프로젝트/신규_서비스_검토`.
- **Todoist 프로젝트(project_id)는 읽지도 쓰지도 않는다**(항상 Inbox). 이유:
  - 처음엔 프로젝트를 만들었더니 태스크가 Inbox 로 가고 canonical 에 "Inbox" 가 섞여
    무한 업데이트(에코)가 났음 → 프로젝트 생성 자체를 폐기.

## 9. 하위작업 ↔ parent_id  ★
- TN `projects[0]` 이 **다른 태스크**(동기화된 태스크)를 가리키면 → Todoist **하위작업**으로 중첩
  (`parent_id` = 부모의 todoist_id). 이땐 라벨을 만들지 않음.
- 판별: 매 사이클 `제목→todoist_id` 맵을 만들어, `projects[0]` 가 그 맵에 있으면 부모 태스크.
- 양방향: Todoist `parent_id` → TN `projects: [[부모 제목]]`.
- **제약**: 부모가 **active(미완료)** 여야 Todoist 에 존재 → 중첩 가능. **done 부모는 불가**(라벨 폴백).
- 부모가 아직 동기화 안 됐으면 다음 사이클에 자동 연결(최대 1분 지연).

## 10. 반복 ↔ Todoist 반복  (느슨한 동기화)
- TaskNotes `recurrence` = RRULE(`FREQ=MONTHLY;BYMONTHDAY=1` 등, `DTSTART` 포함 가능)
  + `complete_instances`(날짜별 완료 기록). Todoist = 완료하면 due 가 다음으로 전진.
- **모델이 근본적으로 달라** 완료/날짜 양방향은 위험 → **느슨한 동기화**:
  - Todoist 에 반복 규칙대로 생성(RRULE → 자연어 `every month on the 1st`).
  - 제목/우선순위/라벨/상태(섹션)만 동기화. **날짜·완료는 각 시스템이 자체 관리**.
  - canonical 에서 반복 태스크는 `due/scheduled/completed = None`(비교 제외) → 에코 없음.
- ⚠️ **한쪽에서 반복 완료해도 다른 쪽엔 반영되지 않음**(각자 다음 주기로).
- 역방향(Todoist 반복 → TN)은 자연어→RRULE 을 흔한 패턴만 변환(안 되면 일반 태스크로).
- `skip_recurring: true` 로 두면 반복 태스크를 아예 안 건드림.

## 11. Obsidian 딥링크 (Todoist 댓글, 단방향)
- 생성 시 Todoist 태스크 **댓글**에 `📝 [Obsidian에서 열기](obsidian://open?vault=CASE&file=…)` 추가.
- 아이패드 Todoist 에서 탭하면 해당 노트로 점프.
- 단방향(생성 시 1회). ⚠️ 제목(=파일명) 바꾸면 기존 댓글 링크는 옛 이름을 가리켜 깨질 수 있음.
- (처음엔 설명(description)에 넣었다가, "댓글로" 요청으로 옮김. 설명은 비움.)

관련: [[todoist-sync-config|Todoist 동기화 설정 레퍼런스]] · [[todoist-sync-tradeoffs|Todoist 동기화 제약과 트레이드오프]]
