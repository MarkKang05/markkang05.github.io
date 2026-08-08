import { h } from "preact"
import { classNames, simplifySlug } from "@quartz-community/utils"

/**
 * Disqus keys a thread by `identifier` (+ `url` as a fallback / for the
 * "discovery" links). We use the page slug as the identifier so the thread
 * survives a domain change, and build an absolute canonical URL from baseUrl.
 */
function canonicalUrl(baseUrl, slug) {
  const base = String(baseUrl ?? "").replace(/\/+$/, "")
  const withProtocol = /^https?:\/\//.test(base) ? base : `https://${base}`
  const simple = simplifySlug(slug)
  return simple === "/" ? `${withProtocol}/` : `${withProtocol}/${simple}`
}

const script = `
function setupDisqus() {
  const container = document.getElementById("disqus_thread")
  if (!container) return

  const shortname = container.dataset.shortname
  if (!shortname) return

  const identifier = container.dataset.identifier
  const url = container.dataset.url

  window.disqus_config = function () {
    this.page.identifier = identifier
    this.page.url = url
  }

  if (window.DISQUS) {
    // SPA navigation: tear the old thread down and load the new page's thread.
    // Without reset() Disqus keeps rendering the thread of the first page visited.
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
`

const css = `
.disqus-comments {
  margin-top: 2rem;
}

.disqus-comments > h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
}

/* Disqus injects a light-background iframe; keep it from clashing with the page */
.disqus-comments #disqus_thread {
  color-scheme: light;
}
`

export const DisqusComments = (userOpts) => {
  const opts = { shortname: "", title: "Comments", ...userOpts }

  const Component = ({ fileData, cfg, displayClass }) => {
    // No shortname configured — render nothing rather than requesting
    // https://.disqus.com/embed.js and 404ing on every page.
    if (!opts.shortname) return null

    const slug = fileData.slug
    return h("div", { class: classNames(displayClass, "disqus-comments") }, [
      opts.title ? h("h3", null, opts.title) : null,
      h("div", {
        id: "disqus_thread",
        "data-shortname": opts.shortname,
        "data-identifier": slug,
        "data-url": canonicalUrl(cfg.baseUrl, slug),
      }),
    ])
  }

  Component.css = css
  Component.afterDOMLoaded = script
  return Component
}
