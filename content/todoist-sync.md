---
title: Todoist–TaskNotes 동기화
description: Obsidian TaskNotes 와 Todoist 를 양방향 동기화하는 자체 개발 파이썬 데몬의 전체 문서.
created: 2026-07-19
maturity: growing
publish: true
---
Obsidian **TaskNotes** 플러그인의 태스크와 **Todoist** 를 양방향으로 동기화하는
자체 개발 도구(`todoist-tasknotes-sync`)의 전체 문서입니다.

> 코드 위치: `~/Develop/tnsync/` (git 저장소)
> 이 문서: 볼트 루트에 `Todoist 동기화 …` 로 흩어져 있고, 이 노트가 허브다.

## 한 줄 요약

Obsidian 앱에 의존하지 않고 **vault 의 마크다운 파일을 직접 읽고/쓰는 파이썬 데몬**이,
맥북에서 60초 주기로 Todoist API 와 vault 를 대조해 양쪽을 맞춘다. 결과 마크다운은
**Obsidian Sync** 가 아이패드로 전파한다.

```
┌──────────┐  Sync API   ┌──────────────┐  파일 R/W   ┌────────────────┐  Obsidian Sync ┌────────┐
│ Todoist  │ ◀────────▶ │ tnsync (Mac) │ ◀────────▶ │ CASE vault(.md)│ ◀────────────▶│ iPad   │
└──────────┘  (60초폴링)  └──────────────┘             └────────────────┘                └────────┘
```

## 목차 (파트별 문서)

1. [[todoist-sync-architecture|Todoist 동기화 아키텍처]] — 전체 구조, 동기화 루프, canonical 해시, 충돌 해결, 에코 방지
2. [[todoist-sync-field-mapping|Todoist 동기화 필드 매핑]] — 제목·상태·완료·일정·소요시간·우선순위·태그·프로젝트·하위작업·반복·딥링크
3. [[todoist-sync-config|Todoist 동기화 설정 레퍼런스]] — `config.yaml` 모든 옵션 설명
4. [[todoist-sync-install|Todoist 동기화 설치와 CLI]] — 설치, CLI 명령, launchd 상시구동, 로그, 권한(FDA)
5. [[todoist-sync-code|Todoist 동기화 코드 구조]] — 모듈별 역할과 핵심 알고리즘
6. [[todoist-sync-tradeoffs|Todoist 동기화 제약과 트레이드오프]] — 무료 플랜, 반복 모델 차이, 완료 처리 등 설계상 한계
7. [[todoist-sync-troubleshooting|Todoist 동기화 트러블슈팅]] — reset 절차, 완료일 무손실 복구, 자주 나는 오류
8. [[todoist-sync-raspberry-pi|Todoist 동기화 라즈베리파이 이전]] — headless 서버(Pi Zero)로 옮기는 방법
9. [[todoist-sync-proxmox-lxc|Todoist 동기화 Proxmox LXC 이전]] — Proxmox LXC + 컨테이너 내 Obsidian(Sync), 최소 GUI, 실전 함정

## 핵심 설계 원칙

- **파일이 진실의 원천(source of truth).** TaskNotes 태스크 = `TaskNotes/Tasks/*.md`(frontmatter).
- **매핑의 원본은 frontmatter `todoist_id`.** 상태 DB(SQLite)가 유실돼도 파일에서 복구된다.
- **Obsidian 비의존.** 파일시스템만 접근 → 라즈베리파이 등 headless 로 이식 가능.
- **변경 감지 = canonical 해시 비교.** 양쪽을 정규 표현으로 환원해 해시로 비교, 3-way 병합.
- **안전 우선.** `dry-run` 지원, 반복/완료 등 위험 케이스는 보수적으로 처리.

## 지원 기능 요약

| 기능 | 방향 | 비고 |
|---|---|---|
| 제목 | ↔ | 파일명 = 제목(rename 로 반영) |
| 완료(done) | ↔ | Todoist 완료 체크 |
| 상태 open/in-progress | ↔ | Todoist **섹션** |
| 일정(scheduled) | ↔ | Todoist due (날짜/시간) |
| 마감(due) | — | Todoist deadline 이 유료라 로컬 전용 |
| 소요시간(timeEstimate) | ↔ | Todoist duration |
| 우선순위 | ↔ | none/low/normal/high ↔ 1~4 |
| 태그 | ↔ | Todoist label |
| 프로젝트 | ↔ | Todoist **라벨** `프로젝트/…` |
| 하위작업 | ↔ | Todoist **parent_id** 중첩 |
| 반복 | ↔(느슨) | RRULE ↔ 자연어, 날짜/완료는 각자 관리 |
| Obsidian 딥링크 | → | Todoist **댓글**(단방향) |

자세한 내용은 [[todoist-sync-field-mapping|Todoist 동기화 필드 매핑]] 참고.
