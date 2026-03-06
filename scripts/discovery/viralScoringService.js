import { loadViralMomentumConfig } from "./viralMomentumConfig.js";
import { buildProductSignalSnapshot } from "./viralSignalService.js";
import { computeViralMomentumScore } from "./viralMomentumEngine.js";

export function viralScoringService({ product, previousSnapshot = null, historySeries = [], config = null, roundId = "inline" }) {
  const resolvedConfig = config || loadViralMomentumConfig(process.env);
  const snapshot = buildProductSignalSnapshot({
    product,
    previousSnapshot,
    roundId,
    nowIso: new Date().toISOString(),
  });

  const signalConfidence = Number(
    Math.min(
      1,
      Math.max(
        0,
        (Number(product?.matched_terms_count || 0) >= 3 ? 0.7 : 0.45)
        + (Number(product?.favorites_count || 0) > 0 ? 0.15 : 0)
        + (previousSnapshot ? 0.1 : 0),
      ),
    ).toFixed(3),
  );

  const computed = computeViralMomentumScore({
    signals: {
      ...snapshot.signalPayload,
      confidence: {
        ...(snapshot.signalPayload?.confidence || {}),
        signal_confidence: signalConfidence,
      },
    },
    historySeries,
    config: resolvedConfig,
  });

  return {
    score: computed.score,
    components: computed.score_components,
    explanation: {
      decision_reason: computed.decision_reason,
      top_signals: computed.top_signals,
      score_version: resolvedConfig.score_version,
      reliability_penalty: computed.reliability_penalty,
      signal_confidence: signalConfidence,
    },
    signals: snapshot,
    score_version: resolvedConfig.score_version,
    score_components: computed.score_components,
    decision_reason: computed.decision_reason,
    reliability_penalty: computed.reliability_penalty,
    top_signals: computed.top_signals,
    windows: computed.windows,
    signal_confidence: signalConfidence,
  };
}
