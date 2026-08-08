import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { registerCondition } from "./quartz/plugins/loader/conditions"
import { componentRegistry } from "./quartz/components/registry"

// 홈에서만 최근 글 목록을 보여주기 위한 조건 (빌트인은 "not-index" 만 제공)
registerCondition("index-only", (props) => props.fileData.slug === "index")

// 함수 옵션은 quartz.config.yaml 에 넣을 수 없어서 여기서 주입한다.
// 합성 페이지인 404 ("Not Found") 가 최근 글 목록에 끼어드는 것을 막는다.
//
// 키는 extractPluginName(source) 결과여야 한다. 우리 config 는 npm 스코프 이름
// ("@quartz-community/recent-notes") 을 쓰므로 그게 그대로 키가 된다 —
// "recent-notes" 로 넣으면 조용히 무시된다.
componentRegistry.setOptionOverrides("@quartz-community/recent-notes", {
  filter: (f: { slug?: string; unlisted?: boolean }) => {
    const slug = String(f.slug ?? "")
    return slug !== "404" && f.unlisted !== true
  },
})

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
