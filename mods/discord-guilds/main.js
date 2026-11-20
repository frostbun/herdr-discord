// Discord's guild rail: one round tile per machine, this computer first, then
// every machine `hc machine ls` knows. A guild is a machine; its channels are
// that machine's spaces. The white pill on the left marks the guild the channel
// list shows; the corner dot is whether that machine answers. "+" adds a machine.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, agents, theme, run, openOverlay, shared, setShared } from "herdr";

const TILE = 48;

// This computer (null) and every machine Herdr knows, in a fixed order: this
// computer first, then machines by name. It must not depend on which machines
// have spaces — a tile that moves under the pointer when a space is made or
// closed makes the rail unusable.
function guilds() {
  const names = machines().map((m) => m.name).filter((n) => n !== null).sort();
  return [null, ...names].map((name) => ({
    name,
    label: name ?? "This computer",
    layout: name ? machines().find((m) => m.name === name)?.layout ?? "loading" : "ready",
  }));
}

// The guild the column shows.
//
// The pin is the machine you last clicked. While it still has channels, showing a
// space of another machine means you navigated there, so the column follows. When
// it has none — you closed its last channel, or it never had one — the pin holds
// and the column keeps showing that machine, with an empty list, instead of
// following the app to whichever machine it picked.
// The guild the column shows: the pin, else the machine in view.
//
// The pin is what you last picked — a guild tile, the status card, or a space you
// showed. It is authoritative even for a machine with no channels, because that
// is how you ask to look at an empty machine. It is kept in sync with navigation
// (see `syncPin`), so it can never go stale and trap the column.
const GUILD = "discord.guild";

function chosenGuild() {
  const pin = shared(GUILD);
  if (typeof pin === "string") return pin;
  return spaces().find((s) => s.active)?.machine ?? "";
}
// Show a guild's channels. Nothing is created: a guild with no channels shows an
// empty list, and the person makes one when they want to.
function open(name) {
  const machine = name ?? "";
  // Choosing a guild is what the column shows, whether or not it has channels.
  setShared(GUILD, machine);
  const first = spaces().find((s) => (s.machine ?? "") === machine);
  if (first) run("space.select", { id: first.id });
}

export default class Guilds extends View {
  init(_p, cx) {
    this.hovered = null;

  }

  // Whether this machine answers: `machines()` reports the layout document's
  // state — ready is connected, loading is still connecting, unavailable is not.
  conn(t, g) {
    return g.layout === "ready" ? t.ansi2 : g.layout === "loading" ? t.ansi3 : t.dim;
  }

  tile(g, t, on) {
    const key = g.name ?? "";
    const letter = g.name ? [...g.name][0].toUpperCase() : null;
    // Needs you: an agent on this machine is blocked (asking) or done (finished
    // while you weren't looking).
    const waiting = agents().filter((a) => (spaces().find((x) => x.id === a.space)?.machine ?? "") === (g.name ?? "")
      && (a.status === "blocked" || a.status === "done"));
    const attention = waiting.length;
    const blocked = waiting.filter((a) => a.status === "blocked").length;
    return h_flex()
      .id(`guild-${key || "local"}`)
      .relative()
      .w(76)
      .h(TILE + 8)
      .flex_none()
      .justify_center()
      .items_center()
      .child(div().absolute().left(0).w(4).h(on ? 34 : this.hovered === key ? 20 : 0).rounded_r(2).bg(t.foreground))
      .child(
        div()
          .id(`guild-tile-${key || "local"}`)
          .relative()
          .size(TILE)
          .rounded(on ? 16 : 24)
          .bg(on ? t.accent : t.raised)
          .flex()
          .items_center()
          .justify_center()
          .cursor_pointer()
          .hover((s) => s.rounded(16).bg(on ? t.accent : t.hover))
          .on_hover((over, cx) => {
            const next = over ? key : null;
            if (this.hovered !== next) { this.hovered = next; cx.notify(); }
          })
          .on_click(() => open(g.name))
          .tooltip(`${g.label} \u00b7 ${g.layout === "ready" ? "connected" : g.layout === "loading" ? "loading" : "away"}`)
          .when(Boolean(letter), (el) => el.child(div().text_size(17).font_semibold().text_color(on ? t.accent_foreground : t.foreground).child(letter)))
          .when(!letter, (el) => el.child(svg("mods/workspace-chrome/monitor.svg").size(20).text_color(on ? t.accent_foreground : t.foreground)))
          // Connection: green connected, amber connecting, grey not connected.
          .child(div().absolute().right(0).bottom(0).size(18).rounded_full().bg(on ? t.accent : t.raised)
            .flex().items_center().justify_center()
            .child(div().size(12).rounded_full().bg(this.conn(t, g))))
          // Agents there need you: a dot the size of the connection dot's ring,
          // top-right, so the two corners match. No count — the tooltip says how
          // many, and the detail belongs in the status card.
          .when(attention > 0, (el) => el.child(div()
            .absolute().right(0).top(0).size(18).rounded_full()
            .bg(on ? t.accent : t.raised)
            .flex().items_center().justify_center()
            .tooltip(blocked ? `${blocked} need${blocked === 1 ? "s" : ""} you` : `${attention} finished`)
            .child(div().size(12).rounded_full().bg(t.blocked)))),
      );
  }

  render() {
    const t = theme();
    const all = guilds();
    const now = chosenGuild();
    return v_flex()
      .size_full()
      .bg(t.chrome)
      .pt(10)
      .pb(10)
      .gap(6)
      .items_center()
      .child(h_flex().w(76).h(4).flex_none().justify_center().child(div().w(32).h(2).rounded(1).bg(t.border)))
      .child(v_flex().id("guild-list").flex_1().min_h(0).w(76).gap(6).items_center().overflow_y_scrollbar()
        .children(all.map((g) => this.tile(g, t, (g.name ?? "") === now))))
      .child(
        div()
          .id("guild-add")
          .size(TILE)
          .flex_none()
          .rounded(24)
          .bg(t.raised)
          .flex()
          .items_center()
          .justify_center()
          .cursor_pointer()
          .hover((s) => s.rounded(16).bg(t.hover))
          .tooltip("Add a machine")
          .on_click(() => openOverlay({ mod: "machine-add", kind: "dialog", width: 560 }))
          .child(svg("mods/workspace-chrome/plus.svg").size(18).text_color(t.ansi2)),
      );
  }
}
