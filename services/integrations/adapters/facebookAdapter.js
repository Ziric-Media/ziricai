import { createStubMessagingAdapter } from "./stubFactory.js";
import { CHANNELS } from "../types/unifiedMessage.js";

export const FacebookAdapter = createStubMessagingAdapter(CHANNELS.FACEBOOK, "Facebook Messenger");
export const facebookAdapter = new FacebookAdapter();
