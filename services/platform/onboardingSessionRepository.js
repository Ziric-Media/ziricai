/**
 * Onboarding session persistence — memory or Firestore (Admin).
 */
import { getStorageAdapter } from "../storage/storageAdapter.js";
import { useAdminBackend } from "../database/firestoreClient.js";
import { MemoryOnboardingSessionRepository } from "./memoryOnboardingSessionRepository.js";
import { FirestoreOnboardingSessionRepository } from "./firestoreOnboardingSessionRepository.js";

let memoryRepo = null;
let firestoreRepo = null;

export async function getOnboardingSessionRepository() {
    const adapter = await getStorageAdapter();
    if (adapter.name === "memory") {
        if (!memoryRepo) memoryRepo = new MemoryOnboardingSessionRepository();
        return memoryRepo;
    }
    if (!useAdminBackend()) {
        if (!memoryRepo) memoryRepo = new MemoryOnboardingSessionRepository();
        return memoryRepo;
    }
    if (!firestoreRepo) firestoreRepo = new FirestoreOnboardingSessionRepository();
    return firestoreRepo;
}

/** Test helper — simulate fresh process with same memory backing store. */
export function resetOnboardingSessionRepositoryForTests() {
    memoryRepo = null;
    firestoreRepo = null;
}
