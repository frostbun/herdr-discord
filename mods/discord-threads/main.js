// The middle column, Discord-style: the channel header (#space \u00b7 machine),
// the channel's thread list (every pane in the channel's tabs, the way Discord
// lists a channel's threads). The pane in front's split, zoom and close sit at
// the header's right end, beside the new-thread button.
// Props: { rename: true, pane, tab } (the naming dialog) | none (the header).

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, machines, panes, props, run, theme, shared, setShared, layout, window, settings, openOverlay, closeOverlay } from "herdr";

// The guild whose channels the column shows. It never claims a machine whose
// space isn't the one in view: with no channels there is nothing to show, so the
// list follows the active space and the pill moves with it.
// The guild whose channels the column shows: always the machine of the space in
// view, so the pill, the list and the terminal can never disagree. Clicking a
// guild tile selects one of its spaces (or makes the first), which moves it here.
function chosen() {
  return spaces().find((s) => s.active)?.machine ?? "";
}

const folder = (cwd) => (cwd ? cwd.replace(/\/+$/, "").split("/").pop() : "");

function find(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Thread names are pane names: one the person gave the pane, else what it runs
// (numbered when its tab holds several panes, since they'd otherwise read the
// same). A tab's Herdr name is not used: it is the tab's, not the pane's.
//
// Pane ids are new on every start, so a name is filed under its tab and its
// place in that tab: that survives a restart while the tab does.
const NAMES = "discord.paneNames";

export function slot(p, all = panes()) {
  const order = all.filter((x) => x.tab === p?.tab).map((x) => x.pane);
  return `${p?.tab}/${Math.max(0, order.indexOf(p?.pane))}`;
}

export function storedName(p, all = panes()) {
  const stored = shared(NAMES) ?? {};
  return stored[slot(p, all)] ?? stored[p?.pane];
}

export function paneName(p, all = panes()) {
  const stored = storedName(p, all);
  if (typeof stored === "string" && stored) return stored;
  const siblings = all.filter((x) => x.tab === p?.tab);
  // A tab holding one pane is that pane: its Herdr name (F2, tab.rename) is the
  // thread's name. With several panes the tab names none of them.
  const tab = spaces().flatMap((s) => s.tabs ?? []).find((c) => c.id === p?.tab);
  if (siblings.length <= 1 && tab?.named && tab.name) return tab.name;
  const auto = p?.program?.name || p?.title || (p?.terminal ?? p?.mod) || "thread";
  if (siblings.length <= 1) return auto;
  return `${auto} ${siblings.findIndex((x) => x.pane === p?.pane) + 1}`;
}

export function setName(pane, tab, name) {
  const all = { ...(shared(NAMES) ?? {}) };
  const order = panes().filter((x) => x.tab === tab).map((x) => x.pane);
  const key = `${tab}/${Math.max(0, order.indexOf(pane))}`;
  // An old pane-keyed entry for this pane would outlive a rename.
  delete all[pane];
  if (name) all[key] = name;
  else delete all[key];
  setShared(NAMES, all);
}

// Every pane of the shown space, tab by tab: its threads.
function threads(space) {
  const all = panes();
  const ids = new Set((space?.tabs ?? []).map((c) => c.id));
  return all.filter((p) => ids.has(p.tab));
}

export default class Threads extends View {
  init(props_, cx) {
    this.hovered = null;
    this.handle = cx.focus_handle();
    if (props()?.rename) {
      const p = panes().find((x) => x.pane === props()?.pane);
      this.input = InputState.new({ value: p ? paneName(p) : "" });
      this.input.set_selected_range({ start: 0, end: this.input.value().length });
      this.input.on("submit", (_e, cx) => this.save(cx));
      this.input.on("focus", (_e, cx) => { this.focused = true; cx.notify(); });
      this.input.on("blur", (_e, cx) => { this.focused = false; cx.notify(); });
      this.input.focus();
      cx.timer.after(600, () => this.input.focus());
    }
  }

  // Save the pane's name. A tab holding just this pane takes it too, so the
  // tabs bar, the chips and the app's own lists read the same.
  save(cx) {
    const name = this.input.value().trim();
    const tab = props()?.tab;
    if (tab && panes().filter((x) => x.tab === tab).length <= 1) run("tab.rename", { id: tab, name });
    setName(props()?.pane, props()?.tab, name);
    closeOverlay(props()?.overlay);
    cx.stop_propagation();
  }

  dialogButton(t, id, text, primary, action) {
    return h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(text);
  }

  // Name a thread: a dialog over the window, its input already holding the
  // current name. A tab of one pane is renamed in Herdr too, so the tabs bar,
  // the chips and the member list agree.
  rename(p) {
    openOverlay({
      mod: "discord-threads", kind: "dialog", width: 420,
      props: { rename: true, pane: p.pane, tab: p.tab },
    });
  }

  // ---- the channel header -------------------------------------------------
  header(t) {
    const space = spaces().find((s) => s.active);
    const guild = chosen();
    const m = machines().find((x) => (x.name ?? "") === guild);
    const topic = space?.branch || folder(space?.folder) || "";
    const count = threads(space).length;
    const w = window();
    const root = layout();
    // On macOS the traffic lights sit over the left edge; the system draws no
    // buttons elsewhere, so the bar draws minimize/maximize/close itself.
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 62) / (settings().zoom ?? 1) - (root.children?.[0]?.size?.px ?? 76) - (root.children?.[1]?.size?.px ?? 236))
      : 16;
    // The pane in front: the card that used to sit on each pane is gone, so its
    // controls live here and act on whichever pane holds the keyboard.
    const here = panes().find((p) => p.focused)
      ?? (threads(space).length === 1 ? threads(space)[0] : null);
    const icon = (id, name, tip, action) => div().id(id).size(28).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).cursor_pointer().tooltip(tip)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); action(); })
      .child(svg(`mods/pane/${name}.svg`).size(14));
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(action).child(label);
    return h_flex()
      .id("channel-header")
      .size_full()
      .px(16)
      .pl(lights)
      .gap(8)
      .items_center()
      .bg(t.canvas)
      .border_b(1)
      .border_color(t.border)
      .child(div().flex_none().text_size(21).font_medium().text_color(t.dim).child("#"))
      .child(div().flex_none().text_size(15).font_semibold().text_color(t.foreground).child(space?.name ?? "\u2014"))
      .when(Boolean(topic), (el) => el
        .child(div().flex_none().w(1).h(18).bg(t.border))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.muted).child(topic)))
      .child(div().flex_1())
      .when(Boolean(m && m.layout !== "ready"), (el) => el.child(div().flex_none().px(7).h(20).flex().items_center().rounded(5)
        .bg(t.dim + "22").text_size(10.5).font_semibold().text_color(t.muted).child((m?.layout ?? "").replace(/_/g, " "))))
      .child(h_flex().flex_none().gap(6).items_center().px(8).h(26).rounded(6).bg(t.raised).text_size(11.5).text_color(t.muted)
        .child(svg("mods/workspace-chrome/layers.svg").size(13).flex_none())
        .child(`${count} thread${count === 1 ? "" : "s"}`))
      // The pane in front's own controls, then a new thread of its own.
      .when(Boolean(here), (el) => el
        .child(icon(`ch-split-r-${here?.pane}`, "split-right", "Split this pane right", () => run("pane.split", { direction: "right", pane: here.pane })))
        .child(icon(`ch-split-d-${here?.pane}`, "split-down", "Split this pane down", () => run("pane.split", { direction: "down", pane: here.pane })))
        .child(icon(`ch-zoom-${here?.pane}`, here?.zoomed ? "unzoom" : "zoom", here?.zoomed ? "Unzoom" : "Zoom this pane", () => run("pane.zoom", { pane: here.pane }))))
      // The right column's fold is in the column's own head, which goes away with
      // it: this is the way back, drawn only while the column is hidden.
      .when(find(layout(), "side")?.hidden === true, (el) => el.child(div()
        .id("side-show")
        .size(28)
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .rounded(6)
        .text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .cursor_pointer()
        .tooltip("Show the Files and Changes column")
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run("layout.show", { id: "side" }))
        .child(svg("mods/workspace-chrome/panel-right.svg").size(15))))
      .when(Boolean(w?.buttons), (el) => el
        .child(div().flex_none().w(1).h(18).mx(4).bg(t.border))
        .child(button("win-min", w.platform === "windows" ? svg("mods/tabs/win-min.svg").size(15) : "\u2212", () => run("window.minimize")))
        .child(button("win-max", w.platform === "windows" ? svg(`mods/tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(15) : "\u25a1", () => run("window.maximize")))
        .child(button("win-close", w.platform === "windows" ? svg("mods/tabs/win-close.svg").size(15) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }

  // The naming dialog. Its input is built once (init), like every InputState.
  renameDialog(t) {
    const p = panes().find((x) => x.pane === props()?.pane);
    return v_flex()
      .id("thread-rename")
      .w_full()
      .min_h(0)
      .p(18)
      .bg(t.popover)
      .text_color(t.foreground)
      .track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(props()?.overlay); cx.stop_propagation(); } })
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(15).font_semibold().child("Name this thread"))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(div().pt(4).text_size(11.5).text_color(t.dim).child("Empty goes back to the automatic name."))
      .child(Input.new(this.input).h(36).mt(10).px(10).rounded(9)
        .border_1().border_color(this.focused ? t.accent : t.input).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(h_flex().pt(18).gap(8).justify_end()
        .child(this.dialogButton(t, "rn-cancel", "Cancel", false, () => closeOverlay(props()?.overlay)))
        .child(this.dialogButton(t, "rn-save", "Save", true, (_e, cx) => this.save(cx))));
  }

  render() {
    const t = theme();
    return props()?.rename ? this.renameDialog(t) : this.header(t);
  }
}
