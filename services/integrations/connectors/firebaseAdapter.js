import { createStubConnector } from "./stubConnectorFactory.js";
import { CONNECTORS } from "../types/unifiedMessage.js";

export const FirebaseAdapter = createStubConnector(CONNECTORS.FIREBASE, "Firebase");
export const firebaseAdapter = new FirebaseAdapter();
