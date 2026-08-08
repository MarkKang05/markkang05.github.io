import { h } from "preact"
import { classNames, resolveRelative, slugTag } from "@quartz-community/utils"

/**
 * Collect `tag -> note count` across every listed content file.
 * Generated pages (tag/folder indexes) are skipped so counts match real notes.
 */
function collectTags(allFiles) {
  const counts = new Map()
  for (const file of allFiles) {
    if (file.unlisted === true) continue
    const slug = file.slug ?? ""
    if (slug === "tags" || slug.startsWith("tags/")) continue

    const tags = file.frontmatter?.tags
    if (!Array.isArray(tags)) continue
    for (const tag of tags) {
      if (typeof tag !== "string" || tag.length === 0) continue
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Nested tags (`dev/mysql`) group under their first segment; flat tags stay
 * ungrouped and render as a single pill list above the categories.
 */
function groupTags(counts) {
  const ungrouped = []
  const categories = new Map()

  for (const [tag, count] of counts) {
    const sep = tag.indexOf("/")
    const entry = { tag, count, label: sep === -1 ? tag : tag.slice(sep + 1) }
    if (sep === -1) {
      ungrouped.push(entry)
    } else {
      const category = tag.slice(0, sep)
      const bucket = categories.get(category) ?? []
      bucket.push(entry)
      categories.set(category, bucket)
    }
  }

  // most-used first, then alphabetical — same ordering the reference site uses
  const byCountThenName = (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  ungrouped.sort(byCountThenName)
  for (const bucket of categories.values()) bucket.sort(byCountThenName)

  return {
    ungrouped,
    categories: [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  }
}

function pill(currentSlug, entry, showCounts) {
  return h("li", { key: entry.tag }, [
    h(
      "a",
      {
        href: resolveRelative(currentSlug, `tags/${slugTag(entry.tag)}`),
        class: "internal tag-link",
      },
      [entry.label, showCounts ? h("span", { class: "tag-count" }, entry.count) : null],
    ),
  ])
}

const script = `
const VIEW_KEY = "explorerView"

function setupTagExplorer() {
  const panel = document.querySelector("[data-tag-explorer]")
  if (!panel) return

  const explorer = document.querySelector("div.explorer")
  const content = explorer && explorer.querySelector(".explorer-content")
  if (!content) {
    // no Explorer on this page — leave the panel standing on its own
    panel.dataset.docked = "false"
    return
  }

  panel.dataset.docked = "true"
  if (panel.parentElement !== content) content.appendChild(panel)

  let tabs = content.querySelector(".explorer-tabs")
  if (!tabs) {
    tabs = document.createElement("div")
    tabs.className = "explorer-tabs"
    tabs.innerHTML =
      '<button type="button" class="explorer-tab" data-view="files">' +
      panel.dataset.filesLabel +
      '</button><button type="button" class="explorer-tab" data-view="tags">' +
      panel.dataset.tagsLabel +
      "</button>"
    content.prepend(tabs)
  }

  const list = content.querySelector("ul.explorer-ul")
  const buttons = [...tabs.querySelectorAll(".explorer-tab")]

  function apply(view, persist) {
    for (const button of buttons) {
      const isActive = button.dataset.view === view
      button.classList.toggle("active", isActive)
      button.setAttribute("aria-selected", isActive ? "true" : "false")
    }
    if (list) list.style.display = view === "tags" ? "none" : ""
    // 반드시 "block" — 빈 문자열로 되돌리면 스타일시트의 .tag-explorer{display:none}
    // 이 다시 이겨서 탭만 있고 내용이 안 보인다.
    panel.style.display = view === "tags" ? "block" : "none"
    if (persist) {
      try {
        localStorage.setItem(VIEW_KEY, view)
      } catch (e) {}
    }
  }

  const cleanups = []
  for (const button of buttons) {
    const handler = () => apply(button.dataset.view, true)
    button.addEventListener("click", handler)
    cleanups.push(() => button.removeEventListener("click", handler))
  }

  // collapsible category headers
  for (const header of panel.querySelectorAll(".tag-category-header")) {
    const handler = () => {
      const category = header.closest(".tag-category")
      if (category) category.classList.toggle("collapsed")
    }
    header.addEventListener("click", handler)
    cleanups.push(() => header.removeEventListener("click", handler))
  }

  if (typeof window !== "undefined" && window.addCleanup) {
    window.addCleanup(() => cleanups.forEach((fn) => fn()))
  }

  let saved = "files"
  try {
    saved = localStorage.getItem(VIEW_KEY) || "files"
  } catch (e) {}
  apply(saved === "tags" ? "tags" : "files", false)
}

document.addEventListener("nav", setupTagExplorer)
document.addEventListener("render", setupTagExplorer)
`

const css = `
.explorer-tabs {
  display: flex;
  gap: 0.25rem;
  margin: 0.25rem 0 0.5rem 0;
}

.explorer-tabs > .explorer-tab {
  flex: 1;
  background: none;
  border: none;
  border-bottom: 2px solid var(--lightgray);
  color: var(--gray);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.8rem;
  padding: 0.25rem 0;
  text-align: center;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.explorer-tabs > .explorer-tab:hover {
  color: var(--dark);
}

.explorer-tabs > .explorer-tab.active {
  border-bottom-color: var(--secondary);
  color: var(--dark);
  font-weight: 600;
}

.tag-explorer {
  display: none;
  max-height: 100%;
  overflow-y: auto;
}

/* standalone fallback: no Explorer card to dock into */
.tag-explorer[data-docked="false"] {
  display: block;
}

.tag-explorer > h3 {
  display: none;
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
}

.tag-explorer[data-docked="false"] > h3 {
  display: block;
}

.tag-explorer .tag-pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  list-style: none;
  margin: 0 0 0.6rem 0;
  padding-left: 0;
}

.tag-explorer .tag-pill-list > li {
  margin: 0;
}

.tag-explorer .tag-category-header {
  align-items: center;
  background: none;
  border: none;
  color: var(--dark);
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  gap: 0.3rem;
  margin: 0.3rem 0;
  padding: 0;
}

.tag-explorer .tag-category-icon {
  transition: transform 0.2s ease;
}

.tag-explorer .tag-category.collapsed .tag-category-icon {
  transform: rotate(-90deg);
}

.tag-explorer .tag-category.collapsed .tag-category-body {
  display: none;
}

.tag-explorer .tag-count {
  font-size: 0.65rem;
  margin-left: 0.25rem;
  opacity: 0.6;
}

.tag-explorer .empty {
  color: var(--gray);
  font-size: 0.8rem;
}
`

export const TagExplorer = (userOpts) => {
  const opts = {
    title: "Tags",
    filesTabLabel: "Files",
    tagsTabLabel: "Tags",
    showCounts: true,
    ...userOpts,
  }

  const Component = ({ allFiles, fileData, displayClass }) => {
    const { ungrouped, categories } = groupTags(collectTags(allFiles))
    const currentSlug = fileData.slug

    const chevron = h(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        width: "10",
        height: "10",
        viewBox: "5 8 14 8",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        class: "tag-category-icon",
      },
      [h("polyline", { points: "6 9 12 15 18 9" })],
    )

    const body = []
    if (ungrouped.length > 0) {
      body.push(
        h(
          "ul",
          { class: "tag-pill-list" },
          ungrouped.map((entry) => pill(currentSlug, entry, opts.showCounts)),
        ),
      )
    }
    for (const [category, entries] of categories) {
      body.push(
        h("div", { class: "tag-category", key: category }, [
          h("button", { class: "tag-category-header", type: "button" }, [
            chevron,
            h("span", null, category),
          ]),
          h("div", { class: "tag-category-body" }, [
            h(
              "ul",
              { class: "tag-pill-list" },
              entries.map((entry) => pill(currentSlug, entry, opts.showCounts)),
            ),
          ]),
        ]),
      )
    }
    if (body.length === 0) {
      body.push(h("p", { class: "empty" }, "No tags yet"))
    }

    return h(
      "div",
      {
        class: classNames(displayClass, "tag-explorer"),
        "data-tag-explorer": true,
        "data-files-label": opts.filesTabLabel,
        "data-tags-label": opts.tagsTabLabel,
      },
      [h("h3", null, opts.title), ...body],
    )
  }

  Component.css = css
  Component.afterDOMLoaded = script
  return Component
}
