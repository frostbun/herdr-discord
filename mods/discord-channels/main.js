// Discord's channel sidebar for one guild (machine): the guild's name on top,
// its spaces as #channels (drag to reorder, click to switch, right-click for
// its menu), the person at the bottom.
// Props: { guild: true } | { person: true } | none (the channel list).

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, panes, agents, terminals, theme, run, openOverlay, props, focused, shared, setShared, nextCommand, home, layout } from "herdr";

const ROW = 34;
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// Panes carry the names people gave them (discord-threads saves them here).
const NAMES = "discord.paneNames";

function pic(p, size, color) {
  if (!p?.icon) return svg("mods/crew-board/silhouette.svg").size(size).flex_none().text_color(color);
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function find(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The guild the column shows: the pin, else the machine in view.
//
// The pin is what you last picked — a guild tile, the status card, or a space you
// showed. It is authoritative even for a machine with no channels, because that
// is how you ask to look at an empty machine. It is kept in sync with navigation
// (see `syncPin`), so it can never go stale and trap the column.
const GUILD = "discord.guild";

function chosen() {
  const pin = shared(GUILD);
  if (typeof pin === "string") return pin;
  return spaces().find((s) => s.active)?.machine ?? "";
}
// Where a space is now: its first terminal's live folder, else where it was made.
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}


export default class Channels extends View {
  init(_props, cx) {
    this.pressed = null;
    this.over = null;
    this.hovered = null;
    this.cardHover = false;
    this.cardButton = false;
    this.rowHover = null;
    this.rowButton = null;
    const mine = props() ?? {};
    // Only the list copy takes commands; the other two draw headers.
    if (!mine.guild && !mine.person) {
      // The pane area has to follow the machine even when render does not run
      // (a window in the background does not redraw). Timers run while the copy
      // is alive, so this is what makes the empty state reliable.
      cx.timer.every(500, (cx) => this.syncPaneArea(cx));
      cx.spawn(async (cx) => {
        for (;;) {
          const cmd = await nextCommand();
          const ch = /^closeChannel:?(.*)$/.exec(cmd ?? "");
          if (ch) await this.closeChannel(cx, ch[1]);
        }
      });
    }
  }

  // A channel's close runs here, not in the menu that asked for it: the menu is
  // an overlay and is gone the moment it starts, taking its tasks with it. This
  // copy is in the layout for good and the request arrives as its own command.
  //
  // Nothing is created: closing a machine's last channel leaves it with none,
  // and the sidebar keeps showing that machine regardless of what the app puts
  // in the pane area next.
  async closeChannel(cx, id) {
    if (!id) return;
    const s = spaces().find((x) => x.id === id);
    if (!s) return;
    const machine = s.machine ?? "";
    const same = spaces().filter((x) => (x.machine ?? "") === machine && x.id !== id);
    // When the machine keeps other channels, show one of them before closing so
    // the next space the app picks is already this machine's.
    const next = same.find((x) => x.active) ?? same[0];
    if (next) run("space.select", { id: next.id });
    run("space.close", { id, confirmed: true });
    cx.notify();
  }

  // A channel's menu is this layout's own: its Close stays in the same machine.
  menu(space) {
    openOverlay({ mod: "discord-menu", kind: "popup", width: 220, height: 300, props: { space: space.id } });
  }

  head(t) {
    const guild = chosen();
    const m = machines().find((x) => (x.name ?? "") === guild);
    const state = guild ? m?.layout ?? "loading" : "ready";
    const dot = state === "ready" ? t.ansi2 : state === "loading" ? t.ansi3 : t.dim;
    const count = spaces().filter((s) => (s.machine ?? "") === (guild ?? "")).length;
    return h_flex()
      .id("guild-head-row")
      .size_full()
      .px(14)
      .gap(9)
      .items_center()
      .bg(t.surface)
      .border_b(1)
      .border_color(t.border)
      .child(svg(guild ? "mods/workspace-chrome/server.svg" : "mods/workspace-chrome/monitor.svg").size(16).flex_none().text_color(t.muted))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().gap(6).items_center()
          .child(div().truncate().text_size(13.5).font_semibold().text_color(t.foreground).child(guild || "This computer"))
          .child(div().size(6).rounded_full().flex_none().bg(dot)))
        .child(div().truncate().text_size(10.5).text_color(t.dim)
          .child(`${count} channel${count === 1 ? "" : "s"}${m?.state && m.state !== "connected" ? ` \u00b7 ${m.state.replace(/_/g, " ")}` : ""}`)));
  }

  // The open channel's threads, under it the way Discord nests them: a bracket
  // down the left, each thread a pill, the open one filled and bright.
  threadsUnder(s, t) {
    if (!s.active) return [];
    const list = panes().filter((p) => (s.tabs ?? []).some((c) => c.id === p.tab));
    const given = shared(NAMES) ?? {};
    const named = (p) => {
      const order = panes().filter((x) => x.tab === p.tab).map((x) => x.pane);
      const slot = `${p.tab}/${Math.max(0, order.indexOf(p.pane))}`;
      const tab = (s.tabs ?? []).find((c) => c.id === p.tab);
      return given[slot] || given[p.pane]
        || (panes().filter((x) => x.tab === p.tab).length <= 1 && tab?.named ? tab.name : null)
        || p.program?.name || p.title || p.terminal || p.mod || "thread";
    };
    return list.map((p, i) => {
      const last = i === list.length - 1;
      const live = panes().find((x) => x.pane === p.pane)?.focused;
      return h_flex()
        .relative()
        .id(`thread-${p.pane}`)
        .flex_none()
        .pl(12)
        .pr(6)
        .py(1)
        .items_center()
        // This row's piece of the guide line. The rows are gapless and 30 px
        // apart (a 28 px pill between py(1)), so a segment covering -1…30 lands
        // exactly on the next one: no seam, no overlap. Opaque, because an alpha
        // colour darkened where two met.
        .child(div().relative().flex_none().w(18).h(28)
          .when(!last, (el) => el
            .child(div().absolute().left(7).top(-1).w(2).h(31).bg(t.dim))
            .child(div().absolute().left(7).top(13).w(9).h(2).bg(t.dim)))
          .when(last, (el) => el
            .child(div().absolute().left(7).top(-1).w(9).h(16)
              .border_l(2).border_b(2).rounded_bl(4).border_color(t.dim))))
        .child(h_flex()
          .flex_1()
          .min_w(0)
          .h(28)
          .px(8)
          .gap(6)
          .rounded(6)
          .items_center()
          .text_size(13)
          .when(live, (el) => el.bg(t.raised))
          .when(!live, (el) => el.hover((h) => h.bg(t.hover)))
          .cursor_pointer()
          .on_click(() => {
            const tab = (s.tabs ?? []).find((c) => c.id === p.tab);
            if (tab && !tab.active) run("tab.select", { id: p.tab });
            run("pane.focus", { pane: p.pane });
          })
          .on_mouse_down("right", (_e, cx) => {
            cx.stop_propagation();
            openOverlay({ mod: "discord-menu", kind: "popup", width: 240, height: 200, props: { thread: p.pane, terminal: p.terminal, tab: p.tab, space: s.id } });
          })
          .child(div().flex_1().min_w(0).truncate().text_color(live ? t.foreground : t.muted).child(named(p)))
          .when(p.status === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(10).flex_none().text_color(t.working).spin(900)))
          .when(p.status === "blocked" || p.status === "done", (el) => el.child(div().size(6).flex_none().rounded_full().bg(t[p.status]))));
    });
  }

  // The open channel's threads, each with its own piece of the guide line. The
  // pieces tile exactly — row i covers [i*ROW, (i+1)*ROW) — so the line is
  // continuous without two pieces overlapping, and the last row owns the turn.
  group(s, t) {
    const rows = this.threadsUnder(s, t);
    if (!rows.length) return [];
    // No gap between threads: the guide line has to be continuous, and a gap
    // here would leave a seam at every row boundary.
    return [v_flex().gap(0).children(rows)];
  }

  row(s, t, ps) {
    const on = s.active;
    const alert = s.status === "blocked" || s.status === "done";
    const cwd = place(s, ps);
    const tail = cwd && cwd !== "/" ? cwd.replace(/\/+$/, "").split("/").pop() : "";
    const show = tail && tail !== s.name ? tail : "";
    // The open channel is Discord's raised pill; the icons on its right only
    // show while the pointer is on it (they were the menu chevron before).
    const tools = (id, label, icon, action) => div()
      .id(id)
      .size(22)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(5)
      .text_color(t.muted)
      .hover((h) => h.bg(t.hover).text_color(t.foreground))
      .cursor_pointer()
      .on_hover((over, cx) => {
        const next = over ? id : null;
        if (this.rowButton !== next) { this.rowButton = next; cx.notify(); }
      })
      .tooltip(label)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); action(); })
      .child(svg(`mods/workspace-chrome/${icon}.svg`).size(14));
    return h_flex()
      .id(`channel-${s.id}`)
      .relative()
      .h(40)
      .flex_none()
      .mx(8)
      .px(9)
      .gap(4)
      .rounded(8)
      .items_center()
      .text_size(15)
      // Paint the row for its own hover only: `on_hover` tracks both, and the
      // buttons say when the pointer is on them.
      .when(on, (el) => el.bg(t.raised))
      .when(!on && this.rowHover === s.id && this.rowButton !== `channel-add-${s.id}` && this.rowButton !== `channel-menu-${s.id}`,
        (el) => el.bg(t.hover))
      .when(this.pressed === s.id && this.over !== s.id, (el) => el.opacity(0.45))
      .on_mouse_down("left", () => { this.pressed = s.id; this.over = s.id; })
      .on_hover((over, cx) => {
        const next = over ? s.id : null;
        const show = over ? s.id : this.hovered === s.id ? null : this.hovered;
        if (this.rowHover !== next || this.hovered !== show) {
          this.rowHover = next;
          this.hovered = show;
          cx.notify();
        }
      })
      .on_mouse_move((_e, cx) => {
        if (this.pressed === null || this.over === s.id) return;
        this.over = s.id;
        cx.notify();
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        this.pressed = null;
        this.over = null;
        if (from && from !== s.id) {
          const index = spaces().findIndex((x) => x.id === s.id);
          if (index !== -1) run("space.move", { id: from, index: index + 1 });
        } else if (from === s.id) run("space.select", { id: s.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(s))
      .child(div().flex_none().pr(6).text_size(18).text_color(on ? t.foreground : t.dim).child("#"))
      .child(div().flex_1().min_w(0).truncate().text_color(on || this.hovered === s.id ? t.foreground : t.muted).child(s.name))
      .when(Boolean(show), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(show)))
      .when(alert, (el) => el.child(div().size(8).flex_none().rounded_full().bg(t[s.status])))
      .when(!alert && s.status === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(on || this.hovered === s.id, (el) => el
        .child(h_flex().flex_none().gap(2).pl(4)
          // Discord's + on a channel starts a thread in it, not a new channel.
          .child(tools(`channel-add-${s.id}`, "New thread", "plus", () => run("tab.new", { space: s.id })))
          .child(tools(`channel-menu-${s.id}`, "Channel settings", "settings", () => this.menu(s)))));
  }

  list(t) {
    const guild = chosen();
    const ps = panes();
    const space = spaces().find((s) => s.active);
    // Same rule as voice() lists, so the count and the rows agree.
    const here = agents().filter((a) => (spaces().find((x) => x.id === a.space)?.machine ?? "") === (guild ?? ""));
    const mine = spaces().filter((s) => (s.machine ?? "") === (guild ?? ""));
    const m = machines().find((x) => (x.name ?? "") === guild);
    const loading = guild !== "" && (m?.layout === "loading" || (!m && mine.length === 0));
    return v_flex()
      .id("channel-col")
      .size_full()
      .min_h(0)
      .bg(t.surface)
      .pt(8)
      // A section label, not a row: only its + reacts, so the band around
      // "TEXT CHANNELS" never looks selected.
      .child(h_flex().id("channel-section").h(26).mx(8).px(8).flex_none().gap(5).items_center()
        .child(svg("mods/workspace-chrome/chevron-down.svg").size(10).flex_none().text_color(t.dim))
        .child(div().text_size(10.5).font_semibold().text_color(t.dim).child("TEXT CHANNELS"))
        .child(div().flex_1())
        .child(div().id("channel-section-add").size(20).flex_none().flex().items_center().justify_center().rounded(5)
          .text_color(t.dim).hover((h) => h.bg(t.hover).text_color(t.foreground)).cursor_pointer()
          .tooltip("New channel")
          .on_click(() => run("space.new", { machine: guild }))
          .child(svg("mods/workspace-chrome/plus.svg").size(12))))
      .child(v_flex().id("channel-rows").flex_1().min_h(0).gap(1).overflow_y_scrollbar()
        .children(mine.flatMap((s) => [this.row(s, t, ps), ...this.group(s, t)]))
        .when(mine.length === 0, (el) => el.child(div().mx(16).my(10).text_size(12).text_color(t.dim)
          .child(loading ? "Loading this machine's channels\u2026" : "No channels yet. Press + to make one.")))
        .child(h_flex().id("voice-section").h(26).mx(8).mt(10).px(8).flex_none().gap(5).rounded(6).items_center()
          .child(svg("mods/workspace-chrome/chevron-down.svg").size(10).flex_none().text_color(t.dim))
          .child(div().text_size(10.5).font_semibold().text_color(t.dim).child("VOICE CHANNELS"))
          .child(div().flex_1())
          .child(div().text_size(10).text_color(t.dim).child(String(here.length))))
        .children(this.voice(t))
        .when(here.length === 0, (el) => el.child(div().mx(16).my(8).text_size(11.5).text_color(t.dim)
          .child("No agents yet"))));
  }

  // The channel the column is looking at, for the card and the empty state.
  voiceSpace() {
    const guild = chosen();
    return spaces().find((s) => s.active && (s.machine ?? "") === (guild ?? ""))
      ?? spaces().find((s) => (s.machine ?? "") === (guild ?? ""));
  }

  // Voice channels hold the people in a channel, so each agent is a voice channel
  // of its own, with the sub-agents it started sitting in it. A row goes to the
  // agent's pane; a sub-agent without one opens peek.
  voice(t) {
    // Every agent on the machine this column shows, whichever channel it is in:
    // the voice list is the machine's people, so switching workspace must not
    // hide them.
    const guild = chosen();
    const live = terminals();
    const given = shared(NAMES) ?? {};
    const mine = agents()
      .filter((a) => (spaces().find((x) => x.id === a.space)?.machine ?? "") === (guild ?? ""))
      .sort((x, y) => (RANK[y.status] ?? 0) - (RANK[x.status] ?? 0) || y.seq - x.seq);
    const kids = (addr) => live.filter((k) => k.parent === addr && k.state === "live");
    // A sub-agent with a pane of its own is in agents() too: it stays in its
    // parent's channel rather than getting a second one.
    const nested = new Set(mine.flatMap((a) => kids(a.address).map((k) => k.address)));
    const list = mine.filter((a) => !nested.has(a.address));
    // A pane's own name, filed by its tab and place so it outlives a pane id.
    // The program's name is only the fallback: "Claude Code" would say nothing
    // about which pane you are looking at.
    const name = (a) => {
      const order = panes().filter((x) => x.tab === a.tab).map((x) => x.pane);
      const slot = `${a.tab}/${Math.max(0, order.indexOf(a.pane))}`;
      const tab = spaces().flatMap((x) => x.tabs ?? []).find((c) => c.id === a.tab);
      const single = panes().filter((x) => x.tab === a.tab).length <= 1;
      return given[slot] || given[a.pane]
        || (single && tab?.named ? tab.name : null)
        || a.program?.name || a.title || a.address;
    };
    const word = (s) => (s === "error" ? "blocked" : s === "done" ? "idle" : s ?? "idle");
    const channel = (a) => {
      const status = a.status ?? "idle";
      const color = t[status] ?? t.dim;
      const count = kids(a.address).length;
      return h_flex()
        .id(`voice-${a.address}`)
        .h(32)
        .mx(8)
        .px(8)
        .gap(7)
        .flex_none()
        .rounded(6)
        .items_center()
        .text_size(13)
        .when(a.focused, (el) => el.bg(t.selected))
        .when(!a.focused, (el) => el.hover((s) => s.bg(t.hover)))
        .cursor_pointer()
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .tooltip(`${a.address} \u00b7 ${name(a)}${count ? ` \u00b7 ${count} sub-agent${count === 1 ? "" : "s"}` : ""}`)
        .child(svg("mods/discord-channels/voice.svg").size(14).flex_none().text_color(t.dim))
        .child(div().flex_1().min_w(0).truncate()
          .text_color(status === "idle" && !a.focused ? t.muted : t.foreground).child(name(a)))
        .when(status === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(11).flex_none().text_color(t.working).spin(900)))
        .when(status === "blocked", (el) => el.child(div().flex_none().text_size(10).font_semibold().text_color(t.blocked).child("!")))
        .child(div().relative().flex_none()
          .child(div().size(18).rounded_full().bg(t.raised).flex().items_center().justify_center()
            .child(pic(a.program, 11, t.foreground)))
          .child(div().absolute().right(-1).bottom(-1).size(8).rounded_full().bg(t.surface)
            .flex().items_center().justify_center()
            .child(div().size(5).rounded_full().bg(color))));
    };
    const participant = (k) => {
      const status = word(k.status);
      return h_flex()
        .id(`voice-sub-${k.address}`)
        .h(26)
        .pl(34)
        .pr(8)
        .gap(7)
        .flex_none()
        .rounded(6)
        .items_center()
        .text_size(12)
        .text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .cursor_pointer()
        .on_click(() => run("terminal.peek", { terminal: k.address }))
        .tooltip(`${k.address} \u00b7 ${k.name || k.template || k.program?.name || "sub-agent"}`)
        .child(svg("mods/discord-channels/voice.svg").size(11).flex_none().text_color(t.dim))
        .child(div().flex_1().min_w(0).truncate().child(k.name || k.template || k.program?.name || k.address))
        .when(status === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(10).flex_none().text_color(t.working).spin(900)))
        .when(status === "blocked", (el) => el.child(div().size(6).flex_none().rounded_full().bg(t.blocked)));
    };
    return list.flatMap((a) => [channel(a), ...kids(a.address).map(participant)]);
  }

  // The user card in Discord's corner: who this window is, what it runs now,
  // and the settings button.
  // The person at this window: their user name, from their home folder.
  user() {
    const h = (home() ?? "").replace(/[\\/]+$/, "");
    return h.split(/[\\/]/).pop() || "you";
  }

  // Every agent on every machine that wants the person: blocked (asking) first,
  // then done (finished while they weren't looking). Not just this machine's —
  // the card is how you find out something elsewhere needs you.
  attention() {
    const rank = (a) => (a.status === "blocked" ? 2 : a.status === "done" ? 1 : 0);
    return agents().filter((a) => rank(a) > 0).sort((x, y) => rank(y) - rank(x) || y.seq - x.seq);
  }

  // The machine this column shows, for rules that need it.
  chosenMachine() {
    return chosen();
  }

  paneNameOf(a) {
    const given = shared(NAMES) ?? {};
    const order = panes().filter((x) => x.tab === a.tab).map((x) => x.pane);
    const slot = `${a.tab}/${Math.max(0, order.indexOf(a.pane))}`;
    const tab = spaces().flatMap((x) => x.tabs ?? []).find((c) => c.id === a.tab);
    const single = panes().filter((x) => x.tab === a.tab).length <= 1;
    return given[slot] || given[a.pane]
      || (single && tab?.named ? tab.name : null)
      || a.program?.name || a.title || a.address;
  }

  person(t) {
    this.cardHover ??= false;
    this.cardButton ??= false;
    const space = this.voiceSpace();
    // The card lights up under the pointer, but not while the pointer is on one
    // of its buttons: a parent's hover fires for its children too, which is why
    // hovering the gear lit the whole card.
    const cardOn = this.cardHover && !this.cardButton;
    // The pane in front of *this* channel: focused() must belong to one of the
    // shown space's tabs, or a focus left in another tab (or another machine)
    // wins and the card names a pane you are not looking at.
    const inSpace = (p) => Boolean(space && (space.tabs ?? []).some((c) => c.id === p?.tab));
    const f = focused();
    const focusedPane = f?.pane ? panes().find((x) => x.pane === f.pane) : null;
    const pane = inSpace(focusedPane) ? focusedPane
      : space ? panes().find((x) => x.focused && inSpace(x)) ?? panes().find(inSpace) ?? null
      : null;
    const wants = this.attention();
    const need = wants.filter((a) => a.status === "blocked").length;
    const done = wants.filter((a) => a.status === "done").length;
    // First half: where you are — the pane in front of you on the channel this
    // column shows (or its name, or "no space" when the machine has none). Naming
    // the waiting agent here read as "this is my pane" and never changed when you
    // switched threads. Second half: what wants you, counted on every machine.
    const where = !space ? "no space" : pane ? this.paneNameOf(pane) : (space.name ?? "space");
    const state = need ? `${need} need${need === 1 ? "s" : ""} you`
      : done ? `${done} finished`
      : "online";
    return h_flex()
      .id("person-card")
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .when(cardOn, (el) => el.bg(t.raised))
      .when(!cardOn, (el) => el.bg(t.chrome))
      .border_t(1)
      .border_color(t.border)
      .on_hover((over, cx) => {
        if (this.cardHover !== over) { this.cardHover = over; cx.notify(); }
      })
      // The card goes where the person is wanted: the agent that needs them,
      // blocked before finished. Nothing waiting, nothing happens.
      .when(wants.length > 0, (el) => el.cursor_pointer()
        .tooltip(wants.length > 1 ? `${wants.length} agents need you \u00b7 click for the first` : `${wants[0].address} needs you`)
        .on_click((_e, cx) => {
          const a = wants[0];
          if (!a) return;
          // The agent's machine may not be the one on screen. Showing its space
          // can fail on a machine whose layout is not ready yet, so try, wait,
          // and try again once before focusing it.
          cx.spawn(async (cx) => {
            // The column follows a pin; selecting a space on another machine does
            // not move it. Pin the agent's machine too, or the UI keeps
            // showing the machine you were on.
            const target = spaces().find((s) => s.id === a.space);
            setShared(GUILD, target?.machine ?? "");
            const go = () => {
              if (a.space) run("space.select", { id: a.space });
              if (a.tab) run("tab.select", { id: a.tab });
            };
            go();
            await cx.sleep(250);
            const active = spaces().find((s) => s.active);
            if (active?.id !== a.space) go();
            await cx.sleep(150);
            run("agent.focus", { terminal: a.address });
            cx.notify();
          });
        }))
      .child(div().relative().flex_none()
        .child(image("frame/welcome/herdr.png").size(32).rounded(6))
        .child(div().absolute().right(-1).bottom(-1).size(12).rounded_full().bg(t.chrome)
          .flex().items_center().justify_center()
          .child(div().size(8).rounded_full().bg(need || done ? t.blocked : t.done))))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_size(12.5).font_semibold().text_color(t.foreground).child(this.user()))
        .child(div().truncate().text_size(10.5).text_color(need || done ? t.blocked : t.done)
          .child(`${where} \u00b7 ${state}`)))
      .child(h_flex().gap(2).flex_none()
        .child(div().id("person-settings").size(26).flex().items_center().justify_center().rounded(6)
          .text_color(t.muted).hover((h) => h.bg(t.hover).text_color(t.foreground)).cursor_pointer()
          .tooltip("Settings")
          .on_hover((over, cx) => {
            if (this.cardButton !== over) { this.cardButton = over; cx.notify(); }
          })
          .on_click(() => run("app.settings"))
          .child(svg("mods/workspace-chrome/settings.svg").size(15))));
  }

  // You close a thread by exiting its shell (ctrl+D). That ends the terminal,
  // which closes its pane, then its tab, then its channel — and Herdr shows the
  // nearest space, often on another machine. Nothing can intercept ctrl+D, so
  // the reaction lives here: when the pinned machine no longer has the space in
  // view, show one of its own channels. Nothing is created.
  keepPinned(cx) {
    const pin = shared(GUILD);
    if (typeof pin !== "string") return;
    const active = spaces().find((s) => s.active);
    if (active && (active.machine ?? "") === pin) return;
    if (!spaces().some((s) => (s.machine ?? "") === (pin ?? ""))) return;
    const key = `${pin}|${active?.id ?? ""}`;
    if (this.pinned === key) return;
    this.pinned = key;
    // A moment's grace: a close lands after the call that started it.
    cx.spawn(async (cx) => {
      await cx.sleep(250);
      const now = spaces().find((s) => s.active);
      if (now && (now.machine ?? "") === pin) return;
      const mine = spaces().filter((s) => (s.machine ?? "") === (pin ?? ""));
      if (!mine.length) return;
      // The channel that was last shown on this machine, else the first.
      const pick = mine.find((s) => s.id === this.lastOn?.[pin]) ?? mine[0];
      run("space.select", { id: pick.id });
      cx.notify();
    });
  }

  // The pane area is a stack of this machine's terminals and the "No space
  // open" block. Herdr always shows some space — after closing a machine's last
  // one that is a space on another machine — so the stack is switched here,
  // where the machine is known. Nothing is created: an empty machine shows the
  // empty state.
  syncPaneArea(cx) {
    const guild = chosen();
    const mine = spaces().filter((s) => (s.machine ?? "") === (guild ?? ""));
    const stack = find(layout(), "threads");
    if (!stack || stack.type !== "stack") return;
    const want = mine.length ? "pane-area" : "no-space";
    if (stack.active === want) return;
    run("layout.select", { stack: "threads", child: want });
    cx.notify();
  }

  render(cx) {
    const t = theme();
    const p = props();
    if (p?.guild) return this.head(t);
    if (p?.person) return this.person(t);
    this.syncPaneArea(cx);
    // Remember which channel this machine last showed, for keepPinned.
    const guild = chosen();
    const shown = spaces().find((s) => s.active);
    if (shown && (shown.machine ?? "") === guild) (this.lastOn ??= {})[guild] = shown.id;
    this.keepPinned(cx);
    return this.list(t);
  }
}
