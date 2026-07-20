import { createStubConnector } from "./stubConnectorFactory.js";
import { CONNECTORS } from "../types/unifiedMessage.js";

export const StripeAdapter = createStubConnector(CONNECTORS.STRIPE, "Stripe");
export const stripeAdapter = new StripeAdapter();
