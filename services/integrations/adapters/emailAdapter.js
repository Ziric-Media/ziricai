import { createStubMessagingAdapter } from "./stubFactory.js";
import { CHANNELS } from "../types/unifiedMessage.js";

export const EmailAdapter = createStubMessagingAdapter(CHANNELS.EMAIL, "Email");
export const emailAdapter = new EmailAdapter();
