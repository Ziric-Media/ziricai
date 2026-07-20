import { createStubConnector } from "./stubConnectorFactory.js";
import { CONNECTORS } from "../types/unifiedMessage.js";

export const Microsoft365Adapter = createStubConnector(CONNECTORS.MICROSOFT_365, "Microsoft 365");
export const microsoft365Adapter = new Microsoft365Adapter();
