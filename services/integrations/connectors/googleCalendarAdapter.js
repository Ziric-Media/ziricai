import { createStubConnector } from "./stubConnectorFactory.js";
import { CONNECTORS } from "../types/unifiedMessage.js";

export const GoogleCalendarAdapter = createStubConnector(CONNECTORS.GOOGLE_CALENDAR, "Google Calendar");
export const googleCalendarAdapter = new GoogleCalendarAdapter();
