export async function alertService({ client, candidate, webhookUrl = null }) {
  const alerts = [];
  const discount = Number(candidate?.discount_percent || 0);
  const viral = Number(candidate?.viral_score || 0);

  if (discount >= 50) {
    alerts.push({
      alert_type: "absurd_discount",
      severity: "critical",
      message: `Desconto alto detectado: ${discount.toFixed(2)}% - ${candidate?.title || "produto"}`,
    });
  }

  if (viral >= 80) {
    alerts.push({
      alert_type: "high_viral_score",
      severity: "warning",
      message: `Viral score alto: ${viral.toFixed(2)} - ${candidate?.title || "produto"}`,
    });
  }

  if (!alerts.length) return [];

  const rows = alerts.map((alert) => ({
    ...alert,
    candidate_id: candidate.id,
    marketplace: candidate.marketplace,
    external_product_id: candidate.external_product_id,
    payload: {
      opportunity_score: candidate.opportunity_score,
      viral_score: candidate.viral_score,
      discount_percent: candidate.discount_percent,
    },
  }));

  await client.request("/discovery_alerts?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerts: rows }),
      });
    } catch {
      // Webhook failure must not break discovery pipeline.
    }
  }

  return rows;
}
