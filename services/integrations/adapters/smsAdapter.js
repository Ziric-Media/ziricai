import { createStubMessagingAdapter } from "./stubFactory.js";
import { CHANNELS } from "../types/unifiedMessage.js";

export const SmsAdapter = createStubMessagingAdapter(CHANNELS.SMS, "SMS");
export const smsAdapter = new SmsAdapter();
