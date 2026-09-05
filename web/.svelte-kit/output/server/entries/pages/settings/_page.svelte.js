import { e as escape_html, s as store_get, c as ensure_array_like, b as attr_class, a as attr, u as unsubscribe_stores, d as derived } from "../../../chunks/index.js";
import { l as loadPairing, c as conn, b as workspaces, r as runners, s as sessions } from "../../../chunks/client.js";
function pushGranted() {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const POLICIES = [
      {
        id: "paranoid",
        label: "Paranoid",
        hint: "ask for everything the agent would ask"
      },
      {
        id: "balanced",
        label: "Balanced",
        hint: "ask for writes and commands (default)"
      },
      {
        id: "trusting",
        label: "Trusting",
        hint: "auto-approve low-risk, ask only high-risk"
      }
    ];
    let pushOn = pushGranted();
    const pairing = loadPairing();
    const isStandalone = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true);
    const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
    const archived = derived(() => store_get($$store_subs ??= {}, "$sessions", sessions).filter((s) => s.archived));
    $$renderer2.push(`<div class="settings svelte-1i19ct2"><section><h2 class="svelte-1i19ct2">Connection</h2> <dl class="svelte-1i19ct2"><dt class="svelte-1i19ct2">E2E fingerprint (must match daemon)</dt> <dd class="sas svelte-1i19ct2">🔒 ${escape_html(store_get($$store_subs ??= {}, "$conn", conn).sas || "—")}</dd> <dt class="svelte-1i19ct2">Daemon</dt> <dd class="svelte-1i19ct2">${escape_html(store_get($$store_subs ??= {}, "$conn", conn).host ? `${store_get($$store_subs ??= {}, "$conn", conn).host.hostname} (${store_get($$store_subs ??= {}, "$conn", conn).host.os}) · v${store_get($$store_subs ??= {}, "$conn", conn).host.daemonVersion}` : "offline")}</dd> <dt class="svelte-1i19ct2">Relay</dt> <dd class="svelte-1i19ct2">${escape_html(pairing?.relayUrl ?? "—")}</dd></dl></section> <section><h2 class="svelte-1i19ct2">Notifications</h2> `);
    if (isIOS && !isStandalone) {
      $$renderer2.push(`<!--[0--><p class="hint svelte-1i19ct2">📲 Install first: Share → Add to Home Screen — iOS only delivers push to installed apps.</p>`);
    } else if (pushOn) {
      $$renderer2.push(`<!--[1--><p class="hint ok svelte-1i19ct2">✔ approval notifications enabled</p>`);
    } else {
      $$renderer2.push(`<!--[-1--><button>🔔 Enable approval notifications</button>`);
    }
    $$renderer2.push(`<!--]--></section> <section><h2 class="svelte-1i19ct2">Approval policy</h2> <!--[-->`);
    const each_array = ensure_array_like(store_get($$store_subs ??= {}, "$workspaces", workspaces));
    for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
      let w = each_array[$$index_1];
      $$renderer2.push(`<div class="ws svelte-1i19ct2"><div class="ws-head svelte-1i19ct2">${escape_html(w.label)} <span class="path svelte-1i19ct2">${escape_html(w.path)}</span></div> <div class="policies svelte-1i19ct2"><!--[-->`);
      const each_array_1 = ensure_array_like(POLICIES);
      for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
        let p = each_array_1[$$index];
        $$renderer2.push(`<button${attr_class("policy svelte-1i19ct2", void 0, { "active": w.policy === p.id })}${attr("title", p.hint)}>${escape_html(p.label)}</button>`);
      }
      $$renderer2.push(`<!--]--></div> <p class="hint svelte-1i19ct2">${escape_html(POLICIES.find((p) => p.id === w.policy)?.hint)}</p></div>`);
    }
    $$renderer2.push(`<!--]--></section> <section><h2 class="svelte-1i19ct2">Agents on this daemon</h2> <!--[-->`);
    const each_array_2 = ensure_array_like(store_get($$store_subs ??= {}, "$runners", runners));
    for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
      let r = each_array_2[$$index_2];
      $$renderer2.push(`<div class="runner svelte-1i19ct2"><span${attr_class("svelte-1i19ct2", void 0, { "dim": !r.available })}>${escape_html(r.name)}</span> <span class="tags svelte-1i19ct2">`);
      if (!r.available) {
        $$renderer2.push(`<!--[0--><span class="tag svelte-1i19ct2">not installed</span>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        if (r.loggedIn === false) {
          $$renderer2.push(`<!--[0--><span class="tag warn svelte-1i19ct2">not logged in</span>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (!r.supportsApprovals) {
          $$renderer2.push(`<!--[0--><span class="tag warn svelte-1i19ct2">no approval gates</span>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (r.available) {
          $$renderer2.push(`<!--[0--><span class="tag ok svelte-1i19ct2">ready</span>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></span></div>`);
    }
    $$renderer2.push(`<!--]--></section> `);
    if (archived().length > 0) {
      $$renderer2.push(`<!--[0--><section><h2 class="svelte-1i19ct2">Archived sessions</h2> <!--[-->`);
      const each_array_3 = ensure_array_like(archived());
      for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
        let s = each_array_3[$$index_3];
        $$renderer2.push(`<div class="runner svelte-1i19ct2"><span class="dim svelte-1i19ct2">${escape_html(s.label)}</span> <button class="small svelte-1i19ct2">restore</button></div>`);
      }
      $$renderer2.push(`<!--]--></section>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <section><h2 class="svelte-1i19ct2">Danger zone</h2> <button class="danger svelte-1i19ct2">Unpair this device</button></section></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
