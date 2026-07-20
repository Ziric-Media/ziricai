import { createStubMessagingAdapter } from "./stubFactory.js";
import { CHANNELS } from "../types/unifiedMessage.js";

export const TelegramAdapter = createStubMessagingAdapter(CHANNELS.TELEGRAM, "Telegram");
export const telegramAdapter = new TelegramAdapter();
