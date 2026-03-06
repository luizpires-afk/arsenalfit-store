import {
  DISCOVERY_PRIORITY_LEVELS,
  DISCOVERY_SCORE_PAYLOAD_VERSION,
  discoveryPriorityFromSeverity,
} from "../../shared/discoveryContracts.js";

export {
  DISCOVERY_PRIORITY_LEVELS,
  DISCOVERY_SCORE_PAYLOAD_VERSION,
  discoveryPriorityFromSeverity,
};

export type DiscoveryPriority = "P1" | "P2" | "P3";
export type DiscoverySeverity = "critical" | "warning" | "info";
