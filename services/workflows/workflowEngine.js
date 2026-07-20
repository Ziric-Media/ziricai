/**
 * Workflow runtime engine — stub for future queue/webhook integration.
 * executeWorkflow() will be invoked by messageWorker after inbound events.
 */

/**
 * @typedef {object} WorkflowTriggerContext
 * @property {string} type - e.g. 'whatsapp_message', 'payment_received'
 * @property {string} [companyId]
 * @property {string} [phone]
 * @property {string} [message]
 * @property {object} [metadata]
 */

/**
 * Execute a published workflow against an inbound trigger.
 * @param {object} workflow - Published workflow document
 * @param {WorkflowTriggerContext} context
 * @returns {Promise<{ executed: boolean, steps: object[], error?: string }>}
 */
export async function executeWorkflow(workflow, context) {
    const nodes = workflow.publishedNodes || workflow.nodes || [];
    if (!nodes.length) {
        return { executed: false, steps: [], error: 'Workflow has no published nodes' };
    }

    const steps = [];
    let currentIndex = 0;

    while (currentIndex < nodes.length) {
        const node = nodes[currentIndex];
        const result = await executeNode(node, context, workflow);
        steps.push({ nodeId: node.id, stepType: node.stepType, result });

        if (result.halt) break;
        if (result.branch === 'yes' && node.branch?.yes?.length) {
            const branchResult = await executeBranch(node.branch.yes, context, workflow);
            steps.push(...branchResult);
            break;
        }
        if (result.branch === 'no' && node.branch?.no?.length) {
            const branchResult = await executeBranch(node.branch.no, context, workflow);
            steps.push(...branchResult);
            break;
        }

        currentIndex += 1;
    }

    return { executed: true, steps, workflowId: workflow.id, version: workflow.currentVersion };
}

async function executeBranch(branchNodes, context, workflow) {
    const steps = [];
    for (const node of branchNodes) {
        const result = await executeNode(node, context, workflow);
        steps.push({ nodeId: node.id, stepType: node.stepType, result, branch: true });
        if (result.halt) break;
    }
    return steps;
}

/**
 * Stub node executor — logs intent; real implementations will call services.
 */
async function executeNode(node, context, workflow) {
    const { type, stepType, config = {} } = node;

    console.log(`[workflowEngine] ${workflow.id} v${workflow.currentVersion} → ${type}/${stepType}`, {
        companyId: workflow.companyId,
        trigger: context.type,
        config: Object.keys(config),
    });

    switch (type) {
        case 'trigger':
            return { passed: true, message: `Trigger matched: ${stepType}` };

        case 'condition': {
            const passed = evaluateCondition(stepType, config, context);
            return { passed, branch: passed ? 'yes' : 'no', message: passed ? 'Condition met' : 'Condition not met' };
        }

        case 'ai_action':
            return {
                passed: true,
                message: `[stub] AI action ${stepType} would run here`,
                output: { confidence: 0.85, stub: true },
            };

        case 'action':
            return {
                passed: true,
                message: `[stub] Action ${stepType} would run here`,
                halt: stepType === 'assign_human',
            };

        default:
            return { passed: false, error: `Unknown node type: ${type}` };
    }
}

function evaluateCondition(stepType, config, context) {
    const text = String(context.message || '').toLowerCase();

    switch (stepType) {
        case 'contains_keyword': {
            const keywords = String(config.keyword || '')
                .split(',')
                .map((k) => k.trim().toLowerCase())
                .filter(Boolean);
            if (!keywords.length) return true;
            return keywords.some((k) => text.includes(k));
        }
        case 'lead_score':
            return (context.metadata?.leadScore ?? 50) >= (config.value ?? 50);
        case 'sentiment':
            return (context.metadata?.sentiment ?? 0.5) >= (config.escalateBelow ?? 0.3);
        case 'business_hours':
            return true;
        case 'ai_confidence':
            return (context.metadata?.aiConfidence ?? 0.8) >= (config.minConfidence ?? 0.75);
        default:
            return true;
    }
}

/**
 * Find published workflows matching a trigger for a company.
 * @param {object[]} workflows
 * @param {string} triggerType
 * @param {string} [companyId]
 */
export function findMatchingWorkflows(workflows, triggerType, companyId = null) {
    return workflows.filter((wf) => {
        if (wf.status !== 'published') return false;
        if (companyId && wf.companyId !== companyId) return false;
        const nodes = wf.publishedNodes || [];
        const trigger = nodes.find((n) => n.type === 'trigger');
        return trigger?.stepType === triggerType;
    });
}
