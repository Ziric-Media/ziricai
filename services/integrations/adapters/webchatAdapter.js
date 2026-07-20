import { createStubMessagingAdapter } from "./stubFactory.js";
import { CHANNELS } from "../types/unifiedMessage.js";

export const WebchatAdapter = createStubMessagingAdapter(CHANNELS.WEBCHAT, "Website Live Chat");
export const webchatAdapter = new WebchatAdapter();
