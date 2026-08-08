---
title: 제약과 트레이드오프
description: 무료 플랜, 반복 모델 차이, 완료 처리 등 설계상 한계와 수정한 버그들.
created: 2026-07-19
maturity: growing
publish: true
---
← [[todoist-sync|Todoist 동기화]]

설계상 의도적으로 택한 한계와, 사용 시 알아둬야 할 동작들.

## 1. 무료 Todoist 플랜
- **`deadline` 미지원**(유료 전용). → TaskNotes `due`(마감)는 **동기화 안 되고 로컬 전용**.
  일정은 `scheduled ↔ Todoist due` 로만 오간다. (코드가 premium 오류 시 자동으로 deadline 을 뺌.)

## 2. 반복(recurrence) — 느슨한 동기화
- 두 시스템 모델이 다름: TaskNotes(노트+`complete_instances`) vs Todoist(due 전진).
- 제목/우선순위/라벨/상태(섹션)는 항상 동기화. **규칙(RRULE ↔ 자연어)은 생성 시 1회만 변환되고 이후 동기화되지 않는다.**
- **예정일(다음 회차) 변경 — 양방향**:
  - Todoist 에서 옮기면 → TN `scheduled` 에 반영.
  - TaskNotes 에서 옮기면 → Todoist due 이동(`item_update` + `due.string` 으로 규칙 보존).
    끄려면 `sync.recurring_date_from_tn: false`.
  - **같은 사이클에 양쪽이 바뀌면 Todoist 가 이긴다**(반복 날짜의 기본 소유자).
  - TN 쪽 변경 판정은 상태 DB `meta.recur_tnsched:<id>` 기준선과 비교한다.
    기준선이 없는 첫 사이클에는 기록만 하고 밀지 않는다(오발송 방지).
  - Todoist 는 '완료로 인한 전진'과 '사람이 옮긴 것'을 구분하는 신호를 주지 않으므로 엔진이 추정한다:
    새 due 가 **규칙상의 회차가 아니면** 예정일 변경으로 보고 완료로 기록하지 않는다.
    규칙상 회차라도 **여러 칸을 건너뛰었는데 데몬이 계속 돌고 있었다면**(마지막 확인이 폴링 주기의
    3배 이내) 역시 예정일 변경으로 본다. 데몬이 오래 멈춰 있었다면 그 사이 회차를 완료로 복원한다.
- **완료는 델타로 양방향 전파**된다(`recurring_state` 기준선 비교):
  - Todoist 에서 완료 → due 전진 감지 → 지나간 회차를 `complete_instances` 에 추가 + `scheduled` 갱신.
    데몬이 멈춰 여러 칸 전진했으면 RRULE 로 **중간 회차까지 복원**(최대 60건).
  - TaskNotes 에서 완료 → 그 날짜가 Todoist 현재 due 와 같으면 `item_close` 로 전진.
    **지난 회차를 뒤늦게 체크한 경우는 전달하지 않는다**(Todoist 가 한 칸 더 전진해 어긋나므로). 로그로만 남음.
- **규칙 드리프트**: 양쪽 규칙이 달라지면 어느 쪽이 최신인지 알 방법이 없다(필드별 수정 시각 없음).
  자동 병합하지 않고 **매 사이클 경고**를 남기며, 맞출 때까지 `scheduled` 자동 갱신과 회차 복원을 보류한다.
  ```
  WARNING 반복[…]: 규칙 불일치 — TaskNotes=…BYMONTHDAY=21 / Todoist='every 1st'
  ```
  이 경고가 보이면 **사람이 한쪽을 직접 고쳐야 한다.**
- 기준선은 상태 DB(`recurring_state` + `meta`)에만 있다. **DB 를 잃으면 그 공백 기간의 완료
  델타는 전파되지 않고**(가짜 완료도 안 생김) 현재 상태가 새 기준선이 된다.
  frontmatter 이중화는 노트 속성이 늘어나는 대가라 쓰지 않기로 결정.
- 역방향 자연어→RRULE 은 흔한 패턴만(매일/매주/매월 N일/요일/매년/`every 1st`). 안 되면 일반 태스크로.

## 3. 완료(done) 처리
- **완료된 TN 태스크는 Todoist 에 새로 생성하지 않음**(완료 로그 오염 방지).
- 완료 = Todoist 체크 → 목록에서 사라짐(아카이브). 그래서 "Done 섹션"은 안 씀.
- 완료 후 재오픈하면(open/in-progress) 그때 Todoist 에 생성/복귀됨.

## 4. 상태 섹션
- Todoist 에 **`Open`, `In-progress` 섹션을 미리 만들어야** 함(Inbox 등).
- `done` 은 섹션이 아니라 완료 체크로 처리(설정 `status_sections` 에 done 없음).
- 하위작업은 섹션 지정 안 함(부모에 종속).

## 5. 하위작업
- `projects[0]` 이 태스크면 parent_id 중첩, 노트면 라벨.
- **부모가 active 여야 중첩 가능.** done 부모는 Todoist 에 없어 불가 → 라벨로 폴백.
- 부모가 아직 동기화 안 됐으면 `projects` 를 **건드리지 않고** 다음 사이클에 연결(최대 1분 지연).
  예전에는 생성 시 그동안 라벨 프로젝트로 채웠으나, 기존 값을 덮어쓸 위험이 있어
  '모르면 손대지 않는다'로 통일했다(2026-07-26 리팩토링 P3).

## 6. 프로젝트
- **Todoist 프로젝트를 생성/이동하지 않음**(항상 Inbox). 프로젝트는 **라벨** `프로젝트/…` 로만.
- Todoist 라벨은 공백 미지원 → 공백을 `_` 로 치환(원복 시 `_`↔공백이라 원래 이름에 `_` 가 있으면 애매).

## 7. 태그
- **TN 의 모든 태그 = 라벨**(조직용 태그와 라벨을 구분하지 않음). 특정 태그만 원하면 필터 추가 필요.

## 8. 실시간성
- **60초 폴링**(웹훅 아님). 변경이 반대편에 반영되는 데 최대 ~1분.
- 아이패드는 데몬을 못 돌리므로 맥북(또는 Pi)이 상시 켜져 있어야 함.

## 9. macOS 권한(TCC)
- `~/Documents` 안의 vault 는 launchd 프로세스가 **전체 디스크 접근 권한** 없으면 못 읽음.
  → [[todoist-sync-install|Todoist 동기화 설치와 CLI]] 4절 참고(1회 GUI 설정).

## 10. Obsidian 딥링크 댓글
- 생성 시 1회만 작성(단방향). 제목(=파일명) 변경 시 기존 댓글 링크는 옛 이름을 가리켜 깨질 수 있음.

## 11. 우선순위 비대칭
- TN `none` 과 `normal` 이 둘 다 Todoist `1` 로 매핑 → Todoist 3(P2)은 `normal` 로 복귀.
  즉 Todoist 에서 P2 로 바꾸면 왕복 후 normal 이 됨(경미한 드리프트).

## 12. 동시 실행
- 데몬과 수동 `once` 동시 구동 시 상태 DB 공유로 충돌 가능 → 개발 중엔 데몬 정지 권장.

---

## 수정된 주요 버그 (히스토리)
- **medium 오염**: `priority 3→medium` 매핑 → TaskNotes 엔 medium 없음. `3→normal` 로 수정.
- **Inbox 에코**: 프로젝트 생성이 태스크를 Inbox 로 보내 canonical 에 "Inbox" 가 섞여 무한 업데이트.
  프로젝트 생성 폐기(라벨 방식)로 해결.
- **섹션 캐시 미채움**: 증분 sync 는 기존 섹션을 안 줘서 섹션이 비어 에코. **캐시 비면 full sync** 로 해결.
- **삭제 후 재생성**: TN 삭제한 태스크를 같은 사이클에서 캐시로 재생성. **삭제 id 를 생성에서 제외**로 해결.
- **duration 형식**: `duration`+`duration_unit` 분리 전송 오류. Todoist 는 dict `{amount,unit}` 요구.
- **note_add temp_id 누락**: 댓글 생성 명령에 `temp_id` 필수.
- **반복이 끊기던 `item_complete`** (2026-07-26): TN 에서 반복을 완료하면 `item_complete` 를 보냈는데,
  이 명령은 반복 태스크도 **히스토리로 보내 반복 자체를 끝낸다.** 다음 회차로 전진시키는 명령은
  `item_close`(공식 클라이언트가 체크박스에 쓰는 것). → `cmd_item_close` 신설 후 교체.
- **`every 1st` 파싱 실패** (2026-07-26): Todoist 가 `every month on the 1st` 를 `every 1st` 로 정규화해
  돌려주는데 파서가 `"month"` 단어를 요구해 `None` 반환 → 반복 태스크가 **일반 태스크로 생성**됐다.
  단위 단어가 없는 서수 표기를 '매월 N일'로 해석하도록 보강.
- **예정일 변경을 완료로 오인** (2026-07-26): 반복 태스크의 due 를 뒤로 미루기만 해도 이전 날짜가
  `complete_instances` 에 '완료'로 박혔다. 중간 회차 복원을 넣으면서 건너뛴 칸 수만큼 증폭됐다
  (8/1→12/1 로 미루면 가짜 완료 4건). → 규칙 회차 여부 + 마지막 확인 시각으로 판별하도록 수정.
- **규칙 드리프트 무감지** (2026-07-26): 양쪽 규칙이 어긋나도 엔진이 `scheduled` 를 Todoist due 로 계속
  끌어와 **노트가 자기 RRULE 과 모순되는 상태**가 됐다(실제 4건 중 2건 발생). 감지 후 보류 + 경고로 변경.
- **completedDate 오염**: 테스트 중 완료일이 오늘로 덮임 → Obsidian 파일복구로 무손실 복원([[todoist-sync-troubleshooting|Todoist 동기화 트러블슈팅]]).

관련: [[todoist-sync-field-mapping|Todoist 동기화 필드 매핑]] · [[todoist-sync-troubleshooting|Todoist 동기화 트러블슈팅]]
