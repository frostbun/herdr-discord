// This layout's right-click menus.
//   props { space }             — a channel: rename, new channel, close.
//   props { thread, terminal, tab, space } — a thread (pane): rename, close.
// Herdr's own space.close lets the app choose what shows next, and that can be a
// space on another machine. Closing a channel is handed to discord-channels,
// which stays in the layout after this menu is gone; it puts a channel of the
// same machine back in view: the next one there, else one it makes first.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, theme, run, props, closeOverlay, openOverlay } from "herdr";

const I = (name) => `mods/workspace-chrome/${name}.svg`;

export default class DiscordMenu extends View {
  init(_props, cx) {
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  space() {
    return spaces().find((s) => s.id === props()?.space);
  }

  // The menu's flat list: [label, icon, danger, action, sep-before].
  items() {
    const s = this.space();
    if (props()?.thread) {
      const p = { pane: props().thread, tab: props().tab };
      const list = [
        ["Rename thread", "square-pen", false, () => openOverlay({
          mod: "discord-threads", kind: "dialog", width: 420,
          props: { rename: true, pane: p.pane, tab: p.tab },
        }), false],
        ["Close thread", "x", true, () => run("pane.close", { pane: p.pane }), true],
      ];
      return list;
    }
    if (!s) return [];
    return [
      ["Rename channel", "square-pen", false, () => run("space.rename", { id: s.id }), false],
      ["New channel", "plus", false, () => run("space.new", { machine: s.machine ?? "" }), false],
      ["Close channel", "x", true, () => run(`discord-channels.closeChannel:${s.id}`), true],
    ];
  }

  choose(cx, i) {
    const item = this.items()[i];
    if (!item) return;
    closeOverlay(props()?.overlay);
    item[3]?.(cx);
  }

  render(cx) {
    const t = theme();
    const list = this.items();
    return v_flex()
      .id("discord-menu")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(cx, this.at);
        else if (e.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.notify();
      })
      .children(list.flatMap((it, i) => [
        ...(it[4] && i > 0 ? [div().mx(7).my(4).h(1).bg(t.border)] : []),
        h_flex()
          .id(`dm-${i}`)
          .h(31)
          .px(8)
          .gap(9)
          .rounded(7)
          .items_center()
          .text_color(it[2] ? t.blocked : t.foreground)
          .when(i === this.at, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.choose(cx, i))
          .child(svg(I(it[1])).size(14).flex_none().text_color(t.muted))
          .child(div().flex_1().truncate().child(it[0])),
      ]));
  }
}
