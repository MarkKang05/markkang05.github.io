---
title: 발행 테스트 1
created: 2026-08-08
tags:
  - 테스트
publish: true
---
`Publish/2026/` 의 노트가 사이트로 나가는 경로를 확인하려고 만든 글이다.
이 문서가 `/2026/publish-test` 에 보이면 경로가 정상이다.

## 확인 항목

- [ ] `status: active` 인 노트만 나간다
- [ ] 볼트 전용 필드(`type`·`status`·`slug`)가 발행본에서 제거된다
- [ ] 폴더 구조가 `content/` 에 그대로 미러링된다
- [ ] 태그가 넘어간다
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
| 작성 | Publish/2026/ |
| 발행 | quartz/content/2026/ |

다른 폴더로 링크: [[2025/archive-test|지난해 테스트]]
