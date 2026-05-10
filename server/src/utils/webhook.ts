/** Webhook 通知辅助函数 */
export async function triggerWebhook(c: any, eventName: string, payload: any) {
  if (!c.env.WEBHOOK_URLS) return;
  const urls = c.env.WEBHOOK_URLS.split(",").map((u: string) => u.trim()).filter(Boolean);
  if (urls.length === 0) return;

  const data = JSON.stringify({ event: eventName, timestamp: new Date().toISOString(), payload });
  
  const promises = urls.map((url: string) => 
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: data })
      .catch(err => console.error("Webhook notification failed for", url, err))
  );

  if (c.executionCtx && c.executionCtx.waitUntil) {
    c.executionCtx.waitUntil(Promise.allSettled(promises));
  } else {
    Promise.allSettled(promises);
  }
}
