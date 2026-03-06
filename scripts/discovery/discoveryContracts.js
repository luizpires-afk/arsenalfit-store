export {
  DISCOVERY_SCORE_PAYLOAD_VERSION,
  DISCOVERY_PRIORITY_LEVELS,
  DISCOVERY_SEVERITY_TO_PRIORITY,
  DISCOVERY_STATUS_TRANSITIONS,
  DISCOVERY_EVENT_TYPES,
  DISCOVERY_ERROR_TAXONOMY,
  discoveryPriorityFromSeverity,
  classifyDiscoveryErrorSeverity,
  classifyDiscoveryError,
  isValidDiscoveryTransition,
  buildScorePayload,
} from "../../shared/discoveryContracts.js";
