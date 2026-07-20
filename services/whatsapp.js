import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export async function sendWhatsAppMessage(to, text) {
    if (!process.env.PHONE_NUMBER_ID || !process.env.WHATSAPP_TOKEN) {
        const err = new Error("PHONE_NUMBER_ID or WHATSAPP_TOKEN is not set");
        console.error("[whatsapp]", err.message);
        throw err;
    }

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to,
                type: "text",
                text: { body: text },
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("[whatsapp] Message sent, id:", response.data?.messages?.[0]?.id);
        return response.data;
    } catch (error) {
        console.error("[whatsapp] Meta API error:", error.response?.status, JSON.stringify(error.response?.data));
        if (error.response?.data?.error?.code === 131030) {
            console.error(
                "[whatsapp] Dev allowlist: add the sender's number (E.164 digits only, e.g. 27821234567) under Meta -> WhatsApp -> API Setup -> To list, then message again."
            );
        }
        throw error;
    }
}