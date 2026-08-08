---
title: Quartz 발행 테스트
description: 원본 볼트에서 발행 볼트로 넘어가는 경로가 정상 동작하는지 확인하는 노트.
created: 2026-08-08
maturity: seedling
publish: true
---
발행 파이프라인이 끝까지 도는지 확인하려고 만든 노트다. 이 문서가 사이트에 보이면 경로가 정상이다.

## 확인 항목

- [ ] `publish: true` 인 노트만 넘어간다
- [ ] 볼트 전용 프론트매터(`type`·`persona`·`status`)가 발행본에서 제거된다
- [ ] 한글 파일명이 `permalink` 로 영문 URL이 된다
- [ ] 마크다운 서식이 깨지지 않는다

## 서식 점검

**굵게**, *기울임*, `인라인 코드`.

```python
def hello():
    return "발행 성공"
```

> 인용문도 확인한다.

| 항목 | 값 |
|---|---|
| 원본 | CASE 볼트 |
| 발행 | quartz/content |

## 관련
-
