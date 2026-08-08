---
title: 발행 테스트
description: Publish 폴더에서 사이트까지 이어지는 경로가 정상 동작하는지 확인하는 노트.
created: 2026-08-08
publish: true
---
`Publish/` 폴더의 노트가 사이트로 나가는 경로를 확인하려고 만든 글이다.
이 문서가 보이면 경로가 정상이다.

## 확인 항목

- [ ] `status: active` 인 노트만 나간다
- [ ] 볼트 전용 필드(`type`·`status`·`slug`)가 발행본에서 제거된다
- [ ] `slug` 가 파일명이 되어 영문 URL이 된다
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
| 작성 | Publish/ |
| 발행 | quartz/content |

## 관련
-
