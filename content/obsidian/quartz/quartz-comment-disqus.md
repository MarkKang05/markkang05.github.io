---
title: quartz에 댓글 기능을 추가해보자(Disqus)
created: 2026-08-08
tags:
  - quartz
  - obsidian
publish: true
---
Quartz v5 블로그에 Disqus 댓글을 붙인 기록. 번들 플러그인으로는 안 돼서 로컬 플러그인을 하나 만들어야 했다.

## 왜 번들 플러그인으로 안 되나

Quartz v5에는 `@quartz-community/comments` 플러그인이 이미 들어있다. 그런데 매니페스트를 열어보면 provider가 하나뿐이다.

```json
"optionSchema": {
  "provider": { "type": "enum", "values": ["giscus"] }
}
```

giscus 전용이다. Disqus를 쓰려면 컴포넌트를 직접 만들어야 한다.

다행히 Quartz v5의 config loader는 **로컬 경로를 플러그인 소스로 지원**한다. `./plugins/foo` 를 적으면 `.quartz/plugins/foo` 로 심링크를 걸어 정식 플러그인처럼 로드한다. 코어를 건드리지 않고 컴포넌트를 추가할 수 있다는 뜻이다.

## 플러그인 구조

```
plugins/disqus-comments/
├── package.json          # quartz 매니페스트 (category: component)
├── index.js
└── components/index.js   # 컴포넌트 + 인라인 스크립트 + CSS
```

`package.json` 의 `quartz` 필드가 매니페스트 역할을 한다.

```json
{
  "name": "disqus-comments",
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./components": "./components/index.js"
  },
  "quartz": {
    "name": "disqus-comments",
    "category": "component",
    "defaultOptions": { "shortname": "", "title": "Comments" },
    "components": {
      "DisqusComments": { "defaultPosition": "afterBody", "defaultPriority": 20 }
    }
  }
}
```

컴포넌트는 서버에서 컨테이너만 렌더하고, 실제 로딩은 클라이언트 스크립트가 한다.

```js
h("div", {
  id: "disqus_thread",
  "data-shortname": opts.shortname,
  "data-identifier": slug,
  "data-url": canonicalUrl(cfg.baseUrl, slug),
})
```

## 함정 1 — SPA에서 댓글창이 안 바뀐다

Quartz는 기본적으로 `enableSPA: true` 다. 페이지를 이동해도 전체 리로드가 일어나지 않고 body만 교체된다.

Disqus 임베드는 이걸 모른다. 그냥 두면 **처음 방문한 페이지의 댓글 스레드를 계속 보여준다.** 두 번째 글로 이동해도 첫 글의 댓글이 그대로 남아있다.

해결은 `DISQUS.reset()`. 이미 로드된 상태면 스크립트를 다시 넣는 게 아니라 리셋해야 한다.

```js
function setupDisqus() {
  const container = document.getElementById("disqus_thread")
  if (!container) return

  const shortname = container.dataset.shortname
  if (!shortname) return

  window.disqus_config = function () {
    this.page.identifier = container.dataset.identifier
    this.page.url = container.dataset.url
  }

  if (window.DISQUS) {
    window.DISQUS.reset({ reload: true, config: window.disqus_config })
    return
  }

  const script = document.createElement("script")
  script.src = "https://" + shortname + ".disqus.com/embed.js"
  script.setAttribute("data-timestamp", String(Number(new Date())))
  script.async = true
  document.head.appendChild(script)
}

document.addEventListener("nav", setupDisqus)
document.addEventListener("render", setupDisqus)
```

Quartz는 페이지가 바뀔 때마다 `nav` 이벤트를 쏜다. 여기에 붙여두면 첫 로드와 SPA 이동이 모두 처리된다.

## 함정 2 — identifier를 URL로 잡으면 안 된다

Disqus는 `identifier` 로 스레드를 구분한다. 이걸 URL로 잡아두면 **도메인을 바꾸거나 URL 구조를 바꾸는 순간 기존 댓글이 전부 사라진다.** (정확히는 새 스레드가 생긴다.)

그래서 identifier는 slug로, url은 별도로 넘긴다.

```js
this.page.identifier = "obsidian/obsidian-lifeos-1"
this.page.url = "https://markkang05.github.io/obsidian/obsidian-lifeos-1"
```

## 함정 3 — shortname이 비면 404 폭탄

`shortname` 을 안 채운 상태로 켜두면 모든 페이지에서 `https://.disqus.com/embed.js` 를 요청한다. 그래서 값이 없으면 컴포넌트가 아예 아무것도 렌더하지 않게 했다.

```js
if (!opts.shortname) return null
```

## 설정

`quartz.config.yaml` 에 등록한다.

```yaml
- source: "./plugins/disqus-comments"
  enabled: true
  options:
    shortname: quartz-3
    title: Comments
  layout:
    position: afterBody
    priority: 20
    condition: not-index
```

댓글은 글 페이지에만 있으면 된다. 홈은 `condition: not-index` 로 빼고, 자동 생성되는 폴더/태그 페이지는 `byPageType` 에서 제외한다.

```yaml
layout:
  byPageType:
    folder:
      exclude:
        - reader-mode
        - disqus-comments
    tag:
      exclude:
        - reader-mode
        - disqus-comments
```

## shortname은 공개해도 되나

**된다.** 애초에 숨길 수 없는 값이다. 브라우저가 `https://quartz-3.disqus.com/embed.js` 를 직접 부르는 구조라 모든 방문자의 페이지 소스에 노출된다. 환경변수로 빼는 게 의미가 없다.

숨겨야 하는 건 따로 있다.

| 값 | 공개 | 비고 |
|---|---|---|
| Shortname | ✅ | 페이지 소스에 노출됨. 커밋해도 무방 |
| API Secret Key / SSO key | ❌ | 커밋 금지. 공개 임베드 방식에선 쓰지 않음 |

다만 shortname이 짧으면 추측이 쉽다. 남이 자기 사이트에 같은 shortname으로 임베드를 심으면 내 스레드가 엉뚱한 곳에서 열릴 수 있다. Disqus 관리자에서 막아둔다.

**Admin → Settings → Advanced → Trusted Domains** 에 도메인 추가. 로컬에서 `npx quartz build --serve` 로 확인할 거면 `localhost` 도 같이 넣어야 한다.

## 확인

빌드 결과에서 위치부터 본다.

```
article      <div id="disqus_thread" data-shortname="quartz-3"
                  data-identifier="obsidian/obsidian-lifeos-1"
                  data-url="https://markkang05.github.io/obsidian/obsidian-lifeos-1">
home         없음
tag page     없음
folder page  없음
```

스크립트 동작은 jsdom으로 확인했다. 특히 두 번째 `nav` 에서 스크립트가 중복 주입되지 않고 `reset` 이 불리는지가 중요하다.

```
1st nav -> embed.js injected: 1  (data-timestamp 있음)
        -> disqus_config: { identifier: 'obsidian/obsidian-lifeos-1', url: '...' }
2nd nav -> script 태그 수: 1 (중복 없음)
        -> DISQUS.reset({ reload: true, config: fn }) 호출됨
```

## 남은 것

Disqus 임베드는 사이트 테마를 따라가지 않는다. 페이지 배경색을 추정해서 자기 테마를 정하기 때문에 다크모드에서 어색할 수 있다. 일단 컨테이너에 `color-scheme: light` 만 걸어두고 넘어갔다.
