import { getPlatformAnswer, matchPlatformQuestion, PLATFORM_FAQ } from "../platformKnowledge.js";

export default {
    name: "platformHelp",
    description:
        "Answer questions about ZiricAI platform features, pricing, setup, roles, industries, WhatsApp, CRM, automation, marketplace, and best practices.",
    parameters: {
        type: "object",
        properties: {
            topic: {
                type: "string",
                enum: [
                    "overview",
                    "aiEmployee",
                    "pricing",
                    "trial",
                    "setup",
                    "whatsapp",
                    "restaurant",
                    "marketplace",
                    "integrations",
                    "crm",
                    "automation",
                    "knowledge",
                    "sarah",
                    "security",
                    "support",
                    "roi",
                    "general",
                ],
                description: "Help topic area",
            },
            question: { type: "string", description: "Specific question from the user" },
        },
    },
    requiredPermissions: [],
    async execute(_ctx, args) {
        const question = args.question || "";
        let result;

        if (args.topic && args.topic !== "general" && PLATFORM_FAQ[args.topic]) {
            result = getPlatformAnswer(args.topic);
        } else if (question) {
            result = matchPlatformQuestion(question) || getPlatformAnswer(question);
        } else {
            result = getPlatformAnswer(args.topic || "general");
        }

        const answer = result.answer;
        const prefix = question && !answer.includes(question.slice(0, 20))
            ? `${answer}`
            : answer;

        return {
            message: prefix,
            data: { topic: result.id, title: result.title, topics: Object.keys(PLATFORM_FAQ) },
        };
    },
};
