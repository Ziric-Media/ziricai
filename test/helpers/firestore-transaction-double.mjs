/**
 * In-memory Firestore transaction double with serialised commits and transactional re-reads.
 */

/**
 * @param {Map<string, object>} [seed]
 */
export function createFirestoreTransactionDouble(seed = new Map()) {
    /** @type {Map<string, object>} */
    const committed = new Map(seed);
    let chain = Promise.resolve();

    function docId(ref) {
        return ref?.id ?? ref;
    }

    /**
     * @template T
     * @param {(tx: { get: Function, set: Function }) => Promise<T>} fn
     */
    function runAdminFirestoreTransaction(fn) {
        const job = chain.then(async () => {
            /** @type {Map<string, object>} */
            const staging = new Map();
            for (const [k, v] of committed.entries()) {
                staging.set(k, structuredClone(v));
            }
            const tx = {
                async get(ref) {
                    const id = docId(ref);
                    const data = staging.get(id);
                    return {
                        exists: () => data !== undefined,
                        data: () => (data === undefined ? undefined : structuredClone(data)),
                    };
                },
                set(ref, data) {
                    staging.set(docId(ref), structuredClone(data));
                },
            };
            const result = await fn(tx);
            for (const [k, v] of staging.entries()) {
                committed.set(k, structuredClone(v));
            }
            return result;
        });
        chain = job.catch(() => {});
        return job;
    }

    return { runAdminFirestoreTransaction, committed };
}