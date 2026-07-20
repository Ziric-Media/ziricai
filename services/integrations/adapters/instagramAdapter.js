import { createStubMessagingAdapter } from "./stubFactory.js";
import { CHANNELS } from "../types/unifiedMessage.js";

export const InstagramAdapter = createStubMessagingAdapter(CHANNELS.INSTAGRAM, "Instagram DMs");
export const instagramAdapter = new InstagramAdapter();
