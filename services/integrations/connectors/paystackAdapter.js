import { createStubConnector } from "./stubConnectorFactory.js";
import { CONNECTORS } from "../types/unifiedMessage.js";

export const PaystackAdapter = createStubConnector(CONNECTORS.PAYSTACK, "Paystack");
export const paystackAdapter = new PaystackAdapter();
