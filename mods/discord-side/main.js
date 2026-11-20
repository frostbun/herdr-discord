// The right column's switcher, Discord-style: Files | Changes as tabs over one
// stack, with the button that puts the whole column away and brings it back.
// Props: { head: true }. Settings lives once, on the user card at the bottom left.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, run, layout } from "herdr";

const VIEWS = [
  { id: "files", label: "Files", icon: "mods/files/file.svg" },
  { id: "changes", label: "Changes", icon: "mods/changes/changes.svg" },
];

function find(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The view the stack shows: the layout is the truth, a click on a tab
// usually lands before the next render.
function shown() {
  const id = find(layout(), "side-body")?.active;
  return VIEWS.some((v) => v.id === id) ? id : "files";
}

export default class Side extends View {
  render() {
    const t = theme();
    const now = shown();
    const tab = (v) => {
      const on = v.id === now;
      return h_flex()
        .id(`side-tab-${v.id}`)
        .h(26)
        .px(8)
        .gap(5)
        .flex_none()
        .rounded(6)
        .items_center()
        .text_size(12)
        .cursor_pointer()
        .bg(on ? t.selected : t.chrome)
        .text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(on ? t.selected : t.hover).text_color(t.foreground))
        .on_click(() => run("layout.select", { stack: "side-body", child: v.id }))
        .child(svg(v.icon).size(13).flex_none())
        .child(v.label);
    };
    const hide = div()
      .id("side-fold")
      .size(26)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(6)
      .text_color(t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .cursor_pointer()
      .tooltip("Hide this column")
      .on_click(() => run("layout.hide", { id: "side" }))
      .child(svg("mods/workspace-chrome/panel-right.svg").size(15));
    return h_flex()
      .id("side-head")
      .size_full()
      .px(10)
      .gap(4)
      .items_center()
      .bg(t.surface)
      .border_b(1)
      .border_color(t.border)
      .children(VIEWS.map(tab))
      .child(div().flex_1())
      .child(hide);
  }
}
