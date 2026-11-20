// The empty pane area: Herdr always shows some space, so when the machine you
// are looking at has none, this says so instead of leaving another machine's
// terminal in view.
//
// The choosing is here, not in discord-channels: the layout's `threads` stack
// holds this block and the terminals, and this copy is the only thing that runs
// while it is shown — it has to switch back itself.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, theme, run, shared, layout } from "herdr";

// The machine the channel column shows. Same rule as discord-channels: the
// machine you last clicked, while the app's own choice may be another's.
const GUILD = "discord.guild";

function wanted() {
  const active = spaces().find((s) => s.active)?.machine ?? "";
  const pin = shared(GUILD);
  if (typeof pin !== "string") return active;
  const has = spaces().some((s) => (s.machine ?? "") === (pin ?? ""));
  if (has && active !== pin) return active;
  return pin ?? "";
}

export default class NoSpace extends View {
  init(props_, cx) {
    // While this is shown, keep deciding: the model can change under it.
    cx.timer.every(400, (cx) => this.decide(cx));
  }

  decide(cx) {
    const want = wanted();
    if (!want) return;
    const mine = spaces().filter((s) => (s.machine ?? "") === (want ?? ""));
    if (!mine.length) return;
    // A space of this machine exists: show its terminals again.
    const pick = mine.find((s) => s.active) ?? mine[0];
    run("space.select", { id: pick.id });
    this.show("pane-area", cx);
  }

  show(child, cx) {
    run("layout.select", { stack: "threads", child });
    cx.notify();
  }

  render(cx) {
    const t = theme();
    const want = wanted();
    const name = machines().find((m) => (m.name ?? "") === want)?.name ?? "this computer";
    // Nothing to say while the machine has spaces: this belongs to the other
    // child of the stack then.
    const mine = spaces().filter((s) => (s.machine ?? "") === (want ?? ""));
    if (mine.length) this.show("pane-area", cx);
    return v_flex()
      .id("no-space")
      .size_full()
      .items_center()
      .justify_center()
      .gap(10)
      .bg(t.background)
      .child(svg("mods/workspace-chrome/terminal.svg").size(30).text_color(t.dim))
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child("No space open"))
      .child(div().text_size(12.5).text_color(t.dim).child(`${name} has no space.`))
      .child(h_flex().id("no-space-new").h(30).px(14).mt(4).rounded(6).items_center().gap(6)
        .bg(t.raised).text_size(12.5).text_color(t.foreground).cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click(() => run("space.new", { machine: want }))
        .child(svg("mods/workspace-chrome/plus.svg").size(13))
        .child("New space"));
  }
}
