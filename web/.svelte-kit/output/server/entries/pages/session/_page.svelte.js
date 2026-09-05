import { b as attr_class, e as escape_html, c as ensure_array_like, d as derived, a as attr, s as store_get, u as unsubscribe_stores } from "../../../chunks/index.js";
import { a as currentSessionId, r as runners, s as sessions, t as transcripts } from "../../../chunks/client.js";
function ReceiptCard($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { receipt } = $$props;
    const secs = derived(() => Math.round(receipt.durationMs / 1e3));
    $$renderer2.push(`<div${attr_class("receipt svelte-1wdzvwu", void 0, { "fail": !receipt.ok })}><div class="head svelte-1wdzvwu">${escape_html(receipt.ok ? "✔" : "✖")} ${escape_html(secs())}s · ${escape_html(receipt.toolCount)} actions · `);
    if (receipt.filesChanged > 0) {
      $$renderer2.push(`<!--[0-->${escape_html(receipt.filesChanged)} file${escape_html(receipt.filesChanged > 1 ? "s" : "")} <span class="add svelte-1wdzvwu">+${escape_html(receipt.additions)}</span> <span class="del svelte-1wdzvwu">−${escape_html(receipt.deletions)}</span>`);
    } else {
      $$renderer2.push(`<!--[-1-->no file changes`);
    }
    $$renderer2.push(`<!--]--></div> `);
    if (receipt.diff) {
      $$renderer2.push(`<!--[0--><details><summary class="svelte-1wdzvwu">view diff</summary> <pre class="svelte-1wdzvwu"><!--[-->`);
      const each_array = ensure_array_like(receipt.diff.split("\n"));
      for (let i = 0, $$length = each_array.length; i < $$length; i++) {
        let line = each_array[i];
        $$renderer2.push(`<span${attr_class("svelte-1wdzvwu", void 0, {
          "dadd": line.startsWith("+") && !line.startsWith("+++"),
          "ddel": line.startsWith("-") && !line.startsWith("---"),
          "dhunk": line.startsWith("@@")
        })}>${escape_html(line)}
</span>`);
      }
      $$renderer2.push(`<!--]--></pre></details>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (receipt.screenshotBlobId) {
      $$renderer2.push("<!--[0-->");
      {
        $$renderer2.push(`<!--[0--><button class="shot-btn svelte-1wdzvwu">📷 view screenshot</button>`);
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function impl() {
  const w = window;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
function voiceAvailable() {
  return typeof window !== "undefined" && impl() !== null;
}
function Composer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { busy, queued } = $$props;
    let text = "";
    let listening = false;
    const hasVoice = voiceAvailable();
    const chips = [
      "run the tests",
      "fix it",
      "show me a screenshot",
      "commit the changes"
    ];
    $$renderer2.push(`<div class="composer svelte-60fagq"><div class="chips svelte-60fagq"><!--[-->`);
    const each_array = ensure_array_like(chips);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let chip = each_array[$$index];
      $$renderer2.push(`<button class="chip svelte-60fagq">${escape_html(chip)}</button>`);
    }
    $$renderer2.push(`<!--]--></div> <form class="svelte-60fagq">`);
    if (hasVoice) {
      $$renderer2.push(`<!--[0--><button type="button"${attr_class("mic svelte-60fagq", void 0, { "listening": listening })} title="Voice input">🎤</button>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <input${attr("placeholder", busy ? `agent working… (${queued} queued — prompts run in order)` : "Prompt your agent…")}${attr("value", text)} autocomplete="off" class="svelte-60fagq"/> <button type="submit"${attr("disabled", !text.trim(), true)} class="svelte-60fagq">Send</button></form></div>`);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const session = derived(() => store_get($$store_subs ??= {}, "$sessions", sessions).find((s) => s.id === store_get($$store_subs ??= {}, "$currentSessionId", currentSessionId)));
    const items = derived(() => store_get($$store_subs ??= {}, "$transcripts", transcripts).get(store_get($$store_subs ??= {}, "$currentSessionId", currentSessionId)) ?? []);
    const live = derived(() => store_get($$store_subs ??= {}, "$sessions", sessions).filter((s) => !s.archived));
    if (!session()) {
      $$renderer2.push(`<!--[0--><p class="empty svelte-1jobjz3">No session selected — pick one from Sessions.</p>`);
    } else {
      $$renderer2.push(`<!--[-1--><div class="session-head svelte-1jobjz3">`);
      $$renderer2.select(
        {
          value: session().id,
          onchange: (e) => currentSessionId.set(e.target.value),
          class: ""
        },
        ($$renderer3) => {
          $$renderer3.push(`<!--[-->`);
          const each_array = ensure_array_like(live());
          for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
            let s = each_array[$$index];
            $$renderer3.option({ value: s.id }, ($$renderer4) => {
              $$renderer4.push(`${escape_html(s.label)}`);
            });
          }
          $$renderer3.push(`<!--]-->`);
        },
        "svelte-1jobjz3"
      );
      $$renderer2.push(` <span class="chip svelte-1jobjz3">${escape_html(store_get($$store_subs ??= {}, "$runners", runners).find((r) => r.id === session().runnerId)?.name ?? session().runnerId)}</span> `);
      if (store_get($$store_subs ??= {}, "$runners", runners).find((r) => r.id === session().runnerId)?.supportsApprovals === false) {
        $$renderer2.push(`<!--[0--><span class="chip warn svelte-1jobjz3" title="This agent's CLI has no approval hook">no gates</span>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> <button class="ghost small svelte-1jobjz3" title="New conversation">↺</button></div> <div class="transcript svelte-1jobjz3">`);
      const each_array_1 = ensure_array_like(items());
      if (each_array_1.length !== 0) {
        $$renderer2.push("<!--[-->");
        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
          let item = each_array_1[$$index_1];
          if (item.kind === "prompt") {
            $$renderer2.push(`<!--[0--><div class="prompt svelte-1jobjz3">❯ ${escape_html(item.text)}</div>`);
          } else if (item.kind === "text") {
            $$renderer2.push(`<!--[1--><div class="text svelte-1jobjz3">${escape_html(item.text)}</div>`);
          } else if (item.kind === "tool") {
            $$renderer2.push(`<!--[2--><div class="tool svelte-1jobjz3">⚙ ${escape_html(item.summary)}</div>`);
          } else if (item.kind === "approval") {
            $$renderer2.push(`<!--[3--><div${attr_class("approval svelte-1jobjz3", void 0, { "high": item.risk === "high" })}><div>🔐 ${escape_html(item.risk === "high" ? "⚠ HIGH RISK — " : "")}${escape_html(item.action)}: ${escape_html(item.detail)}</div> `);
            if (item.resolved === null) {
              $$renderer2.push(`<!--[0--><div class="buttons svelte-1jobjz3"><button>Approve</button> <button class="deny svelte-1jobjz3">Deny</button></div>`);
            } else {
              $$renderer2.push(`<!--[-1--><div class="verdict svelte-1jobjz3">${escape_html(item.resolved ? "✔ approved" : "✖ denied")}</div>`);
            }
            $$renderer2.push(`<!--]--></div>`);
          } else if (item.kind === "receipt") {
            $$renderer2.push("<!--[4-->");
            ReceiptCard($$renderer2, { receipt: item.receipt });
          } else if (item.kind === "done") {
            $$renderer2.push(`<!--[5--><div class="done svelte-1jobjz3">✔ done${escape_html(item.summary ? ` — ${item.summary}` : "")}</div>`);
          } else if (item.kind === "error") {
            $$renderer2.push(`<!--[6--><div class="error svelte-1jobjz3">✖ ${escape_html(item.message)}</div>`);
          } else {
            $$renderer2.push("<!--[-1-->");
          }
          $$renderer2.push(`<!--]-->`);
        }
      } else {
        $$renderer2.push(`<!--[!--><p class="empty svelte-1jobjz3">Say something — your agent is listening.</p>`);
      }
      $$renderer2.push(`<!--]--></div> `);
      Composer($$renderer2, {
        busy: session().busy,
        queued: session().queuedPrompts
      });
      $$renderer2.push(`<!---->`);
    }
    $$renderer2.push(`<!--]-->`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
