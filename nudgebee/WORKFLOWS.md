# NudgeBee workflows for Puja Saathi

Puja Saathi runs as two Deployments in the `puja-saathi` namespace:

| Deployment | Role | Scaled by |
|---|---|---|
| `puja-saathi-web` | UI, API, control room, rush probe | — (1 replica) |
| `puja-saathi` | guide session workers that devotees load at the muhurat | **NudgeBee** |

Three NudgeBee automations do the operations work. Their exact definitions are in **[`automations/`](automations/)**. Paste each into NudgeBee → Automations → Create Automation → **Create from Code**, then **Publish** as **Active**.

Agent install notes (kind): install the agent with `--set nodeAgent.enabled=false --set runner.enableWritePermissions=true`. Write permission is required, because without it `k8s.horizontal_rightsize` fails with *"verb patch not in read-only allowlist"*.

Verified end to end on 25 Nov 2026:
1. The app's probe saw p95 at 2.8 s and fired the webhook.
2. NudgeBee asked for approval, which was given.
3. `puja-saathi` scaled from 2 to 8 replicas.
4. NudgeBee PATCHed Flagsmith `voice_guide` to off.
5. p95 fell to about 100 ms.

`muhurat-recover` then restored voice and scaled back to 2.

> NudgeBee HTTP tasks run in NudgeBee's cloud, so they can't reach in-cluster Service DNS. The control room doesn't rely on callbacks. It **observes** the effects directly: the number of pods answering the probe, and the `voice_guide` value read back from Flagsmith. The optional `/api/ops/events` callbacks below only work if the app has a public URL.

All callbacks to the app go to `POST http://puja-saathi-web.puja-saathi.svc.cluster.local/api/ops/events` with the header `Authorization: Bearer <OPS_TOKEN>`. The body has the form `{"title": "...", "detail": "...", "level": "info|warn|error|success", "stage": "..."}`. The `stage` field lights up the matching step in the control room's incident tracker.

---

## 1. `muhurat-rush` — webhook trigger (reactive)

**Trigger:** `{"type":"webhook","params":{"integration_name":"puja-saathi-muhurat-rush"}}`. NudgeBee creates a `workflow_webhook` integration with a token, and its URL is `https://app.nudgebee.com/api/webhooks/workflow?token=…`. Put that in `NUDGEBEE_WEBHOOK_URL`.
The app fires it when the rush probe sees p95 latency above `RUSH_P95_THRESHOLD_MS` for 3 seconds in a row, or when you press **Escalate**. Payload:

```json
{
  "alert": "MuhuratRush", "severity": "high", "app": "puja-saathi",
  "namespace": "puja-saathi", "deployment": "puja-saathi",
  "city": "Mumbai", "p95_ms": 1840, "rps": 41, "pods_answering": 2,
  "suggested_action": "scale deployment/puja-saathi and turn off Flagsmith voice_guide"
}
```

**Tasks, in order:**

1. **HTTP request:** report progress to the app.
   `{"title":"NudgeBee is on it","detail":"Muhurat rush in {{city}} — waiting for approval","stage":"triggered","level":"warn"}`
2. **Approval** (`instant_message` → Slack, or `in_app`). Message: *"Muhurat rush: p95 {{p95_ms}} ms. Scale `puja-saathi` to 8 and switch the guide to quiet mode?"*
3. **HTTP request:** `{"title":"Approved by on-call","stage":"approved","level":"info"}`
4. **k8s.horizontal_rightsize:** `kind: Deployment`, `namespace: puja-saathi`, `name: puja-saathi`, `scaling_mode: change_to`, `max: 8`.
5. **HTTP request:** turn off voice in **Flagsmith**:
   ```
   PATCH https://api.flagsmith.com/api/__future__/environments/<FLAGSMITH_ENVIRONMENT_KEY>/features/<voice_guide feature id>/
   Authorization: Api-Key {{ Secrets.flagsmith_admin }}
   Content-Type: application/json

   {"environment_default": {"enabled": false}}
   ```
   (`npm run flagsmith:setup` prints the exact URL with your feature id.)
6. **HTTP request:** `{"title":"Scaled to 8 · voice paused","detail":"k8s.horizontal_rightsize + Flagsmith voice_guide=false","stage":"scaled","level":"success"}`
7. **Send IM:** post the summary to `#festive-ops`.

What the control room shows: the pods-answering count climbs from 2 to 8 (measured from live responses, not reported). The `voice_guide` switch flips off (read back from Flagsmith). Every devotee's screen goes into quiet mode **in their own language** (the banner text was translated by Sarvam). p95 then falls under the threshold.

## 2. `muhurat-recover` — manual trigger

1. **HTTP request:** Flagsmith PATCH with `{"environment_default": {"enabled": true}}`.
2. **k8s.horizontal_rightsize:** `change_to`, `max: 2`.
3. **HTTP request:** `{"title":"Voice restored","stage":"resolved","level":"success"}`

## 3. `pre-muhurat-scale-*` — schedule triggers (proactive)

India's festive traffic is predictable, because it follows the panchang. Generate the triggers:

```bash
npm run panchang:cron          # lead time defaults to 20 min
```

Create one automation per row, or one per festival with the earliest city. Use a **Schedule** trigger with the printed UTC cron and a single task, **k8s.horizontal_rightsize** `change_to` with the printed replica count. Add a second schedule with the scale-down cron.

The lead time is the Flagsmith remote-config value `pre_muhurat_minutes`. The control room's schedule table recompiles when it changes. You can also make a **webhook** version of this automation and put its URL in `NUDGEBEE_PRESCALE_WEBHOOK_URL`, which enables the **run now** buttons.

---

## Optional: alert-driven instead of probe-driven

Each guide pod exports Prometheus metrics at `/metrics` (`puja_http_request_duration_seconds`, `puja_sessions_live`, `puja_rush_p95_seconds`). If Prometheus and Alertmanager run in the cluster, route this alert to the NudgeBee agent's receiver. NudgeBee then investigates it as an incident, and you can attach the same tasks with an **Event** trigger (`source: prometheus`).

```yaml
- alert: MuhuratRush
  expr: histogram_quantile(0.95, sum(rate(puja_http_request_duration_seconds_bucket{route="/api/session/prepare"}[1m])) by (le)) > 0.6
  for: 30s
  labels: { severity: critical, namespace: puja-saathi }
  annotations:
    summary: Devotees are waiting — p95 above 600ms at the muhurat
```
